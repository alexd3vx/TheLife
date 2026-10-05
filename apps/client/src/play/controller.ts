import * as THREE from "three";
import { ACTIONS } from "@thelife/game-core";
import { findPath, pathLength, type NavGrid, type Point } from "@thelife/shared";
import type { Avatar } from "../lab/avatar";
import type { Interaction } from "./interactions";

/** What the controller needs from the game rules. The simulation implements it; tests can fake it. */
export interface GameBridge {
  start(actionId: string): { ok: true } | { ok: false; reason: string };
  cancel(): void;
  /** The action currently running, if any (it can also end or start on its own, e.g. collapsing from exhaustion). */
  active(): { id: string; forced: boolean } | null;
  /** Walking speed multiplier from tiredness. */
  speedFactor(): number;
  notice(text: string): void;
  /** Current need levels (0-100), so the body can show how the character feels. */
  needs(): { hunger: number; energy: number; hygiene: number; bladder: number; fun: number };
}

export interface Status {
  /** What the character is doing right now ("Sleeping"), or null when idle/walking. */
  label: string | null;
  /** A short instruction while an action holds ("Tap anywhere to get up"). */
  hint: string | null;
}

type Mode = "idle" | "walking" | "settling" | "doing" | "leaving";

/** How the player asked to get there: "auto" runs when it is far. */
export type Pace = "auto" | "walk" | "run";

const WALK_SPEED = 1.55; // metres per second
const RUN_SPEED = 3.3;
const RUN_DISTANCE = 7; // runs when the trip is longer than this
const TURN_RATE = 9; // radians per second
const ACCEL = 4.5; // metres per second squared: how quickly the character gets up to speed
const DECEL = 5.5; // and slows down for a stop
const WALK_CLIP_SPEED = 1.35; // ground speed the Walk clip was authored for; the clip is sped up or slowed to match
const JOG_CLIP_SPEED = 3.0;
const SLIDE_TIME = 0.5; // seconds to step in front of a seat (or into the shower) from where you stood

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
  /** Current ground speed (m/s), eased up and down so the character never starts or stops instantly. */
  private speed = 0;
  private glance: { until: number; point: THREE.Vector3 } | null = null;
  private nextGlanceAt = 2;
  /** A short body-language clip (yawn, stretch...) in progress while standing idle. */
  private gesture: { until: number } | null = null;
  /** While sitting down or settling onto a bed: "slide" = still stepping in, "sit" = lowering onto the seat. A tap in either takes it back. */
  private settlePhase: "slide" | "sit" | null = null;
  private nextGestureAt = 9;
  private clock = 0;
  /** A tap that arrived during a short transition (sitting down, standing up); run once it finishes. */
  private queued: { target: Point; interaction: Interaction | null; pace: Pace } | null = null;
  /** A timed pause (waiting for a one-shot clip like Sitting_Enter to finish). */
  private wait: { left: number; done: () => void } | null = null;
  private tween: { t: number; duration: number; from: THREE.Vector3; to: THREE.Vector3; fromYaw: number; toYaw: number; done: () => void } | null = null;

  constructor(
    private readonly avatar: Avatar,
    private readonly nav: NavGrid,
    private readonly game: GameBridge,
    private readonly onStatus: (status: Status) => void,
    private readonly onToggle?: (itemId: string) => void,
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
  tapGround(x: number, z: number, pace: Pace = "auto"): boolean {
    return this.go({ x, z }, null, pace);
  }

  /** Walk to a piece of furniture and use it. */
  tapInteraction(interaction: Interaction, pace: Pace = "auto"): boolean {
    if (this.mode === "doing" && this.interaction?.id === interaction.id && !this.resting) return true; // already doing it
    return this.go({ x: interaction.approach[0], z: interaction.approach[1] }, interaction, pace);
  }

  /** Can the character get from here to that spot? (No side effects.) */
  canReach(x: number, z: number): boolean {
    return !!findPath(this.nav, { x: this.position.x, z: this.position.z }, { x, z });
  }

  private go(target: Point, interaction: Interaction | null, pace: Pace = "auto"): boolean {
    const begin = () => {
      const route = findPath(this.nav, { x: this.position.x, z: this.position.z }, target);
      if (!route || route.length === 0) {
        this.mode = "idle";
        this.setClip("Idle_Loop");
        return false;
      }
      this.path = route;
      this.pending = interaction;
      this.running = pace === "run" || (pace === "auto" && pathLength({ x: this.position.x, z: this.position.z }, route) > RUN_DISTANCE);
      this.mode = "walking";
      this.setStatus(null, null);
      return true;
    };

    if (this.mode === "settling" && this.settlePhase && this.interaction) {
      // Changed their mind while still sitting down: stop that activity and get up straight away.
      if (!findPath(this.nav, { x: this.interaction.approach[0], z: this.interaction.approach[1] }, target)) return false;
      const early = this.settlePhase === "slide";
      this.game.cancel();
      this.actionId = null;
      this.tween = null;
      this.wait = null;
      this.settlePhase = null;
      this.getUp(() => {
        begin();
      }, early);
      return true;
    }
    if (this.mode === "settling" || this.mode === "leaving") {
      if (!findPath(this.nav, { x: target.x, z: target.z }, { x: target.x, z: target.z })) return false;
      this.queued = { target, interaction, pace };
      return true;
    }

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
  private getUp(then: () => void, early = false) {
    const spot = this.interaction;
    this.mode = "leaving";
    this.setStatus(null, null);
    this.avatar.setSpeed(1);
    const to = spot ? new THREE.Vector3(spot.approach[0], 0, spot.approach[1]) : new THREE.Vector3(this.position.x, 0, this.position.z);
    const pose = spot ? ACTIONS[spot.action]?.pose : undefined;
    // Face away from the furniture while stepping back out.
    const leave = (awayYaw: number) => {
      this.setClip("Idle_Loop");
      const away = spot ? awayYaw : this.yaw;
      this.startTween(to, away, 0.5, () => {
        this.finishActivity();
        then();
      });
    };
    const standUp = (yaw: number) => {
      const length = this.avatar.playOnce("Sitting_Exit");
      this.clip = "Sitting_Exit";
      this.waitFor(length || 0.1, () => leave(yaw + Math.PI));
    };
    if (spot && pose === "seat" && !this.onFloor) {
      if (early) leave(spot.yaw + Math.PI);
      else standUp(spot.yaw);
    } else if (spot?.edge && pose === "lie" && !this.onFloor) {
      if (early) {
        leave(spot.edge.yaw + Math.PI);
        return;
      }
      // Sit up on the edge of the bed first, then stand.
      const edge = spot.edge;
      this.setClip("Sitting_Idle_Loop");
      this.startTween(new THREE.Vector3(...edge.pose), edge.yaw, 0.8, () => standUp(edge.yaw));
    } else {
      leave(spot ? Math.atan2(to.x - this.position.x, to.z - this.position.z) : this.yaw);
    }
  }

  private waitFor(seconds: number, done: () => void) {
    this.wait = { left: seconds, done };
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

  /** A switch: turn to face it, reach out with the real interact animation, and flip it halfway through. */
  private beginToggle(interaction: Interaction) {
    this.interaction = interaction;
    this.actionId = null;
    this.mode = "settling";
    this.avatar.setSpeed(1);
    this.setClip("Idle_Loop");
    this.startTween(this.position.clone(), interaction.yaw, 0.3, () => {
      const length = this.avatar.playOnce("Interact") || 0.8;
      this.clip = "Interact";
      this.waitFor(length * 0.45, () => {
        this.onToggle?.(interaction.itemId);
        this.waitFor(Math.max(0.2, length * 0.55), () => {
          this.finishActivity();
          this.mode = "idle";
          this.setClip("Idle_Loop");
        });
      });
    });
  }

  private beginInteraction(interaction: Interaction) {
    if (interaction.toggle) {
      this.beginToggle(interaction);
      return;
    }
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
    const pose = interaction.pose;
    const finish = () => {
      this.mode = "doing";
      this.setClip(def.clip);
      this.setStatus(def.label, def.pose === "stand" ? null : "Tap anywhere to get up");
    };

    if (def.pose === "seat" && pose) {
      // Step in front of the seat, turn round, and sit down with the real sitting clip.
      this.setClip("Idle_Loop");
      this.settlePhase = "slide";
      this.startTween(new THREE.Vector3(pose[0], 0, pose[2]), interaction.yaw, SLIDE_TIME, () => {
        this.position.y = pose[1];
        this.settlePhase = "sit";
        const length = this.avatar.playOnce("Sitting_Enter");
        this.clip = "Sitting_Enter";
        this.waitFor(length || 0.1, () => {
          this.settlePhase = null;
          finish();
        });
      });
      return;
    }
    if (def.pose === "lie" && pose) {
      // Rest the body on the surface using the lowest point of the sleeping pose, so it lies on the mattress, not in it.
      const low = this.avatar.lowestPoint(def.clip) ?? 0;
      const lie = new THREE.Vector3(pose[0], pose[1] - low - 0.02, pose[2]);
      const lieDown = () => {
        this.setClip(def.clip);
        this.startTween(lie, interaction.yaw, 0.9, finish);
      };
      const edge = interaction.edge;
      if (!edge) {
        lieDown();
        return;
      }
      // Walk up to the side of the bed, sit on its edge with the real sitting clip, then lie back.
      this.setClip("Idle_Loop");
      this.settlePhase = "slide";
      this.startTween(new THREE.Vector3(edge.pose[0], 0, edge.pose[2]), edge.yaw, SLIDE_TIME, () => {
        this.position.y = edge.pose[1];
        this.settlePhase = "sit";
        const length = this.avatar.playOnce("Sitting_Enter");
        this.clip = "Sitting_Enter";
        this.waitFor(length || 0.1, () => {
          this.setClip("Sitting_Idle_Loop");
          this.waitFor(0.3, () => {
            this.settlePhase = null;
            lieDown();
          });
        });
      });
      return;
    }
    this.setClip(def.clip);
    const target = pose ? new THREE.Vector3(pose[0], pose[1], pose[2]) : this.position.clone();
    this.startTween(target, interaction.yaw, pose ? 0.6 : 0.35, finish);
  }

  update(dt: number) {
    if (this.wait) {
      this.wait.left -= dt;
      if (this.wait.left <= 0) {
        const done = this.wait.done;
        this.wait = null;
        done();
      }
    } else if (this.tween) {
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
    this.updateLook(dt);
    this.idleBehaviour();
    if (this.queued && !this.tween && !this.wait && (this.mode === "doing" || this.mode === "idle")) {
      const next = this.queued;
      this.queued = null;
      this.go(next.target, next.interaction, next.pace);
    }
    this.apply();
  }

  /** Keeps the body in step with the game rules: actions end, or are forced, without the player tapping. */
  private followGame() {
    const active = this.game.active();

    // The rules forced an action on us (collapsed from exhaustion).
    if (active?.forced && this.actionId !== active.id && this.mode !== "leaving" && !this.tween && !this.wait) {
      this.collapse(active.id);
      return;
    }
    if (this.mode !== "doing" || this.tween || this.wait) return;

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

    // Ease: speed up gradually, turn mostly on the spot before setting off, and slow down in time to stop at the end.
    let remaining = distance;
    for (let i = 1; i < this.path.length; i++) remaining += Math.hypot(this.path[i]!.x - this.path[i - 1]!.x, this.path[i]!.z - this.path[i - 1]!.z);
    const cruise = (this.running ? RUN_SPEED : WALK_SPEED) * this.game.speedFactor();
    const stopLimit = Math.sqrt(2 * DECEL * Math.max(0, remaining - 0.03)) + 0.2;
    const wanted = Math.min(cruise * Math.max(0.12, 1 - turn / 1.4), stopLimit);
    this.speed += THREE.MathUtils.clamp(wanted - this.speed, -DECEL * dt, ACCEL * dt);
    this.updateLocomotion();

    const step = this.speed * dt;
    if (distance <= step || distance < 0.015) {
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
    this.speed = 0;
    this.avatar.setSpeed(1);
    this.setClip("Idle_Loop");
  }

  /** Picks idle, walk or jog from the actual speed and times the clip to the ground speed so the feet don't skate. */
  private updateLocomotion() {
    const jogging = this.clip === "Jog_Fwd_Loop" ? this.speed > 2.1 : this.speed > 2.6;
    if (this.speed < 0.12) {
      this.setClip("Idle_Loop");
      this.avatar.setSpeed(1);
      return;
    }
    this.setClip(jogging ? "Jog_Fwd_Loop" : "Walk_Loop");
    this.avatar.setSpeed(THREE.MathUtils.clamp(this.speed / (jogging ? JOG_CLIP_SPEED : WALK_CLIP_SPEED), 0.35, 1.7));
  }

  /** Where the head points: ahead along the path when walking, at the thing being used, or an occasional glance around. */
  /** While standing around, the body shows how the character feels: yawning when tired, rubbing the stomach when hungry... */
  private idleBehaviour() {
    if (this.mode !== "idle" || this.tween || this.wait || this.queued) {
      this.gesture = null;
      return;
    }
    if (this.gesture) {
      if (this.clock > this.gesture.until) {
        this.gesture = null;
        this.setClip("Idle_Loop");
        this.nextGestureAt = this.clock + 9 + Math.random() * 12;
      }
      return;
    }
    if (this.clock < this.nextGestureAt) return;
    const needs = this.game.needs();
    const options: { clip: string; weight: number }[] = [];
    if (needs.energy < 45) options.push({ clip: "Life_Yawn", weight: 1 + (45 - needs.energy) / 10 });
    if (needs.energy < 65) options.push({ clip: "Life_Stretch", weight: 1 });
    if (needs.hunger < 40) options.push({ clip: "Life_BellyRub", weight: 1 + (40 - needs.hunger) / 10 });
    if (needs.bladder < 35) options.push({ clip: "Life_Fidget", weight: 1 + (35 - needs.bladder) / 10 });
    if (options.length === 0) {
      this.nextGestureAt = this.clock + 10;
      return;
    }
    let roll = Math.random() * options.reduce((sum, o) => sum + o.weight, 0);
    const pick = options.find((o) => (roll -= o.weight) <= 0) ?? options[0]!;
    const length = this.avatar.playOnce(pick.clip, 0.3);
    if (length > 0) {
      this.clip = pick.clip;
      this.gesture = { until: this.clock + length };
    } else {
      this.nextGestureAt = this.clock + 15;
    }
  }

  private updateLook(dt: number) {
    this.clock += dt;
    let target: THREE.Vector3 | null = null;
    if (this.mode === "walking") {
      const ahead = this.path[1] ?? this.path[0];
      if (ahead) target = new THREE.Vector3(ahead.x, 1.55, ahead.z);
    } else if ((this.mode === "doing" || this.mode === "settling") && this.interaction?.look) {
      target = new THREE.Vector3(...this.interaction.look);
    } else if (this.mode === "idle" || (this.mode === "doing" && this.resting)) {
      if (this.glance && this.clock > this.glance.until) {
        this.glance = null;
        this.nextGlanceAt = this.clock + 3 + Math.random() * 5;
      }
      if (!this.glance && this.clock > this.nextGlanceAt) {
        const angle = this.yaw + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.7);
        this.glance = {
          until: this.clock + 1.1 + Math.random() * 1.4,
          point: new THREE.Vector3(this.position.x + Math.sin(angle) * 4, 1.5 + (Math.random() - 0.5) * 0.4, this.position.z + Math.cos(angle) * 4),
        };
      }
      target = this.glance?.point ?? null;
    }
    this.avatar.setLookTarget(target);
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

  /** The placed item being used right now (so the furniture can react), or null. */
  get usingItem(): string | null {
    if (!this.interaction || this.interaction.toggle) return null;
    return this.mode === "doing" || this.mode === "settling" ? this.interaction.itemId : null;
  }

  get state(): { mode: Mode; x: number; y: number; z: number; clip: string; action: string | null; resting: boolean; item: string | null } {
    return { mode: this.mode, x: this.position.x, y: this.position.y, z: this.position.z, clip: this.clip, action: this.actionId, resting: this.resting, item: this.interaction?.itemId ?? null };
  }
}
