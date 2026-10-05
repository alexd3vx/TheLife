import * as THREE from "three";
import { ACTIONS } from "@thelife/game-core";
import { findPath, pathLength, type NavGrid, type Point } from "@thelife/shared";
import type { Avatar } from "../lab/avatar";
import type { Interaction } from "./layout";

/** What the controller needs from the game rules. The simulation implements it; tests can fake it. */
export interface GameBridge {
  start(actionId: string): { ok: true } | { ok: false; reason: string };
  cancel(): void;
  /** The action currently running, if any (it can also end or start on its own, e.g. collapsing from exhaustion). */
  active(): { id: string; forced: boolean } | null;
  /** Walking speed multiplier from tiredness. */
  speedFactor(): number;
  notice(text: string): void;
}

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
const SEAT_SETBACK = 0.08; // sit this far back from the seat's centre so people sit *on* chairs, not at their edge

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function turnToward(current: number, target: number, maxStep: number): number {
  const diff = wrapAngle(target - current);
  return current + Math.max(-maxStep, Math.min(maxStep, diff));
}

/**
 * Drives one character around the world: follows paths, turns smoothly, switches between walk/run/idle clips, and
 * performs game actions at interaction spots. The game rules (needs, time, money) decide whether an action can
 * start and when it ends; this class only moves and animates the body to match.
 */
export class CharacterController {
  readonly position = new THREE.Vector3();
  yaw = Math.PI;
  mode: Mode = "idle";

  private path: Point[] = [];
  private pending: Interaction | null = null;
  private interaction: Interaction | null = null;
  private actionId: string | null = null;
  /** True once the action has ended but the character is still sitting (e.g. after a meal). */
  private resting = false;
  /** Collapsed on the spot (not at a bed). */
  private onFloor = false;
  private clip = "";
  private running = false;
  /** A tap that arrived during a short transition (sitting down, standing up); run once it finishes. */
  private queued: { target: Point; interaction: Interaction | null } | null = null;
  private tween: { t: number; duration: number; from: THREE.Vector3; to: THREE.Vector3; fromYaw: number; toYaw: number; done: () => void } | null = null;

  constructor(
    private readonly avatar: Avatar,
    private readonly nav: NavGrid,
    private readonly game: GameBridge,
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
    if (this.mode === "doing" && this.interaction?.id === interaction.id && !this.resting) return true; // already doing it
    return this.go({ x: interaction.approach[0], z: interaction.approach[1] }, interaction);
  }

  /** Can the character get from here to that spot? (No side effects.) */
  canReach(x: number, z: number): boolean {
    return !!findPath(this.nav, { x: this.position.x, z: this.position.z }, { x, z });
  }

  private go(target: Point, interaction: Interaction | null): boolean {
    if (this.mode === "settling" || this.mode === "leaving") {
      if (!findPath(this.nav, { x: target.x, z: target.z }, { x: target.x, z: target.z })) return false;
      this.queued = { target, interaction };
      return true;
    }

    const begin = () => {
      const route = findPath(this.nav, { x: this.position.x, z: this.position.z }, target);
      if (!route || route.length === 0) {
        this.mode = "idle";
        this.setClip("Idle_Loop");
        return false;
      }
      this.path = route;
      this.pending = interaction;
      this.running = pathLength({ x: this.position.x, z: this.position.z }, route) > RUN_DISTANCE;
      this.mode = "walking";
      this.setStatus(null, null);
      this.updateLocomotion();
      return true;
    };

    if (this.mode === "doing") {
      // Check the way is clear before giving up the current activity.
      if (!findPath(this.nav, this.interaction ? { x: this.interaction.approach[0], z: this.interaction.approach[1] } : { x: this.position.x, z: this.position.z }, target)) {
        return false;
      }
      this.game.cancel();
      this.actionId = null;
      if (this.interaction?.pose || this.onFloor) this.getUp(begin);
      else {
        this.finishActivity();
        return begin();
      }
      return true;
    }
    return begin();
  }

  /** Stand back up from a seat, bed or the floor, then carry on. */
  private getUp(then: () => void) {
    const spot = this.interaction;
    this.mode = "leaving";
    this.setStatus(null, null);
    this.setClip("Idle_Loop");
    this.avatar.setSpeed(1);
    const to = spot ? new THREE.Vector3(spot.approach[0], 0, spot.approach[1]) : new THREE.Vector3(this.position.x, 0, this.position.z);
    this.startTween(to, this.yaw, 0.45, () => {
      this.finishActivity();
      then();
    });
  }

  private finishActivity() {
    this.interaction = null;
    this.actionId = null;
    this.resting = false;
    this.onFloor = false;
  }

  private startTween(to: THREE.Vector3, toYaw: number, duration: number, done: () => void) {
    this.tween = { t: 0, duration, from: this.position.clone(), to, fromYaw: this.yaw, toYaw, done };
  }

  private beginInteraction(interaction: Interaction) {
    const started = this.game.start(interaction.action);
    if (!started.ok) {
      this.game.notice(started.reason);
      this.mode = "idle";
      this.setClip("Idle_Loop");
      return;
    }
    const def = ACTIONS[interaction.action]!;
    this.interaction = interaction;
    this.actionId = def.id;
    this.avatar.setSpeed(1);
    this.mode = "settling";
    this.setClip(def.clip);
    const pose = interaction.pose;
    const back = def.pose === "seat" ? SEAT_SETBACK : 0;
    const target = pose
      ? new THREE.Vector3(pose[0] - Math.sin(interaction.yaw) * back, pose[1], pose[2] - Math.cos(interaction.yaw) * back)
      : this.position.clone();
    this.startTween(target, interaction.yaw, pose ? 0.6 : 0.35, () => {
      this.mode = "doing";
      this.setStatus(def.label, def.pose === "stand" ? null : "Tap anywhere to get up");
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
    }
    this.followGame();
    if (this.queued && !this.tween && (this.mode === "doing" || this.mode === "idle")) {
      const next = this.queued;
      this.queued = null;
      this.go(next.target, next.interaction);
    }
    this.apply();
  }

  /** Keeps the body in step with the game rules: actions end, or are forced, without the player tapping. */
  private followGame() {
    const active = this.game.active();

    // The rules forced an action on us (collapsed from exhaustion).
    if (active?.forced && this.actionId !== active.id && this.mode !== "leaving" && !this.tween) {
      this.collapse(active.id);
      return;
    }
    if (this.mode !== "doing" || this.tween) return;

    if (this.actionId && (!active || active.id !== this.actionId)) this.actionEnded();
  }

  private collapse(actionId: string) {
    const def = ACTIONS[actionId]!;
    this.path = [];
    this.pending = null;
    this.avatar.setSpeed(1);
    const proceed = () => {
      this.interaction = null;
      this.onFloor = true;
      this.actionId = actionId;
      this.mode = "doing";
      this.setClip(def.clip);
      this.setStatus(def.label, null);
    };
    if (this.mode === "doing" && this.interaction?.pose) {
      this.getUp(proceed);
    } else {
      this.mode = "settling";
      this.startTween(this.position.clone(), this.yaw, 0.1, proceed);
    }
  }

  private actionEnded() {
    const interaction = this.interaction;
    const def = this.actionId ? ACTIONS[this.actionId] : undefined;
    this.actionId = null;
    if (this.onFloor) {
      // Woke up on the floor.
      this.finishActivity();
      this.mode = "idle";
      this.setClip("Idle_Loop");
      this.setStatus(null, null);
      return;
    }
    if (def?.pose === "seat" && interaction?.pose) {
      this.resting = true; // stay in the chair
      this.setClip("Sitting_Idle_Loop");
      this.setStatus(null, "Tap anywhere to get up");
      return;
    }
    if (def?.pose === "lie") {
      this.getUp(() => {
        this.mode = "idle";
        this.setStatus(null, null);
      });
      return;
    }
    // Standing actions: if they used a pose (shower), step back out.
    if (interaction?.pose) {
      this.getUp(() => {
        this.mode = "idle";
        this.setStatus(null, null);
      });
      return;
    }
    this.finishActivity();
    this.mode = "idle";
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
    const speed = (this.running ? RUN_SPEED : WALK_SPEED) * this.game.speedFactor() * Math.max(0.2, 1 - turn / 1.6);
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
    const factor = this.game.speedFactor();
    this.setClip(this.running ? "Jog_Fwd_Loop" : "Walk_Loop");
    this.avatar.setSpeed(((this.running ? RUN_SPEED : WALK_SPEED) / (this.running ? 3.0 : 1.35)) * factor);
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

  get state(): { mode: Mode; x: number; y: number; z: number; clip: string; action: string | null; resting: boolean } {
    return { mode: this.mode, x: this.position.x, y: this.position.y, z: this.position.z, clip: this.clip, action: this.actionId, resting: this.resting };
  }
}
