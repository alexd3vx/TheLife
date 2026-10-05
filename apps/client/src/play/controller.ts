import * as THREE from "three";
import { findPath, pathLength, type NavGrid, type Point } from "@thelife/shared";
import type { Avatar } from "../lab/avatar";
import type { Interaction } from "./layout";

export interface Status {
  /** What the character is doing right now ("Sleeping"), or null when idle/walking. */
  label: string | null;
  /** A short instruction while an action holds ("Tap anywhere to get up"). */
  hint: string | null;
}

type Mode = "idle" | "walking" | "settling" | "doing" | "leaving";

const WALK_SPEED = 1.55; // metres per second
const RUN_SPEED = 3.3;
const RUN_DISTANCE = 7; // runs when the trip is longer than this
const TURN_RATE = 9; // radians per second

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function turnToward(current: number, target: number, maxStep: number): number {
  const diff = wrapAngle(target - current);
  return current + Math.max(-maxStep, Math.min(maxStep, diff));
}

/**
 * Drives one character around the world: follows paths, turns smoothly, switches between walk/run/idle clips,
 * and plays actions (stand, sit, lie) when it reaches an interaction spot.
 */
export class CharacterController {
  readonly position = new THREE.Vector3();
  yaw = Math.PI;
  mode: Mode = "idle";

  private path: Point[] = [];
  private pending: Interaction | null = null;
  private active: Interaction | null = null;
  private clip = "";
  private running = false;
  private timer = 0;
  private tween: { t: number; duration: number; from: THREE.Vector3; to: THREE.Vector3; fromYaw: number; toYaw: number; done: () => void } | null = null;
  private resume: (() => void) | null = null;

  constructor(
    private readonly avatar: Avatar,
    private readonly nav: NavGrid,
    private readonly onStatus: (status: Status) => void,
  ) {
    this.apply();
    this.setClip("Idle_Loop");
  }

  place(x: number, z: number, yaw: number) {
    this.position.set(x, 0, z);
    this.yaw = yaw;
    this.apply();
  }

  /** Walk to a spot on the floor. Returns false if nowhere near it is reachable. */
  tapGround(x: number, z: number): boolean {
    return this.go({ x, z }, null);
  }

  /** Walk to a piece of furniture and use it. */
  tapInteraction(interaction: Interaction): boolean {
    return this.go({ x: interaction.approach[0], z: interaction.approach[1] }, interaction);
  }

  private go(target: Point, interaction: Interaction | null): boolean {
    const begin = () => {
      const route = findPath(this.nav, { x: this.position.x, z: this.position.z }, target);
      if (!route || route.length === 0) return false;
      this.path = route;
      this.pending = interaction;
      this.active = null;
      this.running = pathLength({ x: this.position.x, z: this.position.z }, route) > RUN_DISTANCE;
      this.mode = "walking";
      this.setStatus(null, null);
      this.updateLocomotion();
      return true;
    };

    // Getting up from a seat or bed first, then setting off.
    if (this.mode === "doing" && this.active && this.active.kind !== "stand") {
      const reachable = findPath(this.nav, { x: this.active.approach[0], z: this.active.approach[1] }, target);
      if (!reachable) return false;
      this.leaveSeat(begin);
      return true;
    }
    if (this.mode === "settling" || this.mode === "leaving") return false;
    return begin();
  }

  private leaveSeat(then: () => void) {
    const spot = this.active;
    if (!spot) return then();
    this.mode = "leaving";
    this.setStatus(null, null);
    this.setClip("Idle_Loop");
    this.startTween(new THREE.Vector3(spot.approach[0], 0, spot.approach[1]), this.yaw, 0.45, () => {
      this.active = null;
      then();
    });
  }

  private startTween(to: THREE.Vector3, toYaw: number, duration: number, done: () => void) {
    this.tween = { t: 0, duration, from: this.position.clone(), to, fromYaw: this.yaw, toYaw, done };
  }

  private beginInteraction(interaction: Interaction) {
    this.active = interaction;
    this.avatar.setSpeed(1);
    if (interaction.kind === "stand") {
      this.mode = "settling";
      this.startTween(this.position.clone(), interaction.yaw, 0.35, () => {
        this.mode = "doing";
        this.timer = interaction.seconds ?? 5;
        this.setClip(interaction.clip);
        this.setStatus(interaction.label, null);
      });
      return;
    }
    const pose = interaction.pose ?? [this.position.x, 0, this.position.z];
    this.mode = "settling";
    this.setClip(interaction.clip);
    this.startTween(new THREE.Vector3(pose[0], pose[1], pose[2]), interaction.yaw, 0.6, () => {
      this.mode = "doing";
      this.setStatus(interaction.label, "Tap anywhere to get up");
    });
  }

  update(dt: number) {
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.duration);
      const k = tw.t * tw.t * (3 - 2 * tw.t);
      this.position.lerpVectors(tw.from, tw.to, k);
      this.yaw = tw.fromYaw + wrapAngle(tw.toYaw - tw.fromYaw) * k;
      if (tw.t >= 1) {
        this.tween = null;
        tw.done();
      }
    } else if (this.mode === "walking") {
      this.walk(dt);
    } else if (this.mode === "doing" && this.active?.kind === "stand") {
      this.timer -= dt;
      if (this.timer <= 0) this.finishStanding();
    }
    this.apply();
  }

  private finishStanding() {
    this.mode = "idle";
    this.active = null;
    this.setClip("Idle_Loop");
    this.setStatus(null, null);
  }

  private walk(dt: number) {
    const next = this.path[0];
    if (!next) {
      this.arrive();
      return;
    }
    const dx = next.x - this.position.x;
    const dz = next.z - this.position.z;
    const distance = Math.hypot(dx, dz);

    const desired = Math.atan2(dx, dz);
    const turn = Math.abs(wrapAngle(desired - this.yaw));
    this.yaw = turnToward(this.yaw, desired, TURN_RATE * dt);

    // Turn mostly on the spot before setting off, so the feet don't slide sideways.
    const speed = (this.running ? RUN_SPEED : WALK_SPEED) * Math.max(0.2, 1 - turn / 1.6);
    const step = speed * dt;
    if (distance <= step) {
      this.position.x = next.x;
      this.position.z = next.z;
      this.path.shift();
      if (this.path.length === 0) this.arrive();
    } else {
      this.position.x += (dx / distance) * step;
      this.position.z += (dz / distance) * step;
    }
  }

  private arrive() {
    if (this.pending) {
      const interaction = this.pending;
      this.pending = null;
      this.beginInteraction(interaction);
      return;
    }
    this.mode = "idle";
    this.running = false;
    this.avatar.setSpeed(1);
    this.setClip("Idle_Loop");
  }

  private updateLocomotion() {
    const clip = this.running ? "Jog_Fwd_Loop" : "Walk_Loop";
    this.setClip(clip);
    this.avatar.setSpeed(this.running ? RUN_SPEED / 3.0 : WALK_SPEED / 1.35);
  }

  private setClip(name: string) {
    if (this.clip === name) return;
    if (this.avatar.play(name)) this.clip = name;
  }

  private setStatus(label: string | null, hint: string | null) {
    this.onStatus({ label, hint });
  }

  private apply() {
    const root = this.avatar.root;
    root.position.copy(this.position);
    root.rotation.y = this.yaw;
  }

  get state(): { mode: Mode; x: number; y: number; z: number; clip: string; action: string | null } {
    return { mode: this.mode, x: this.position.x, y: this.position.y, z: this.position.z, clip: this.clip, action: this.active?.id ?? null };
  }
}
