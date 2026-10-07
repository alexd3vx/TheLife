import * as THREE from "three";
import type { Avatar } from "../lab/avatar";
import type { PlaceRoom, Rect, Spot } from "./roomKit";

/** Walking around inside a room: the player's body, the people who wander, and which spot you are standing at. */

const RADIUS = 0.28;
const WALK = 1.55;
const RUN = 3.1;
const WALK_CLIP = 1.35;
const JOG_CLIP = 3.0;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const turn = (cur: number, target: number, step: number) => cur + Math.max(-step, Math.min(step, wrap(target - cur)));

/** Is a circle at (x, z) clear of the walls and the furniture? */
export function clear(room: PlaceRoom, x: number, z: number, r = RADIUS): boolean {
  const b = room.bounds;
  if (x < b.minX + r || x > b.maxX - r || z < b.minZ + r) return false;
  if (z > b.maxZ - r && !inside(room.door, x, z)) return false;
  for (const o of room.blockers) if (x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r) return false;
  return true;
}
const inside = (o: Rect, x: number, z: number) => x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ;

export class Walker {
  readonly pos = new THREE.Vector3();
  yaw = Math.PI;
  private speed = 0;
  private clip = "";
  /** Where to face while standing at a spot (set when its menu opens). */
  private faceTo: number | null = null;

  constructor(readonly avatar: Avatar, private readonly room: PlaceRoom) {
    this.pos.copy(room.spawn);
    avatar.root.position.copy(this.pos);
    avatar.root.rotation.y = this.yaw;
  }

  face(yaw: number | null) {
    this.faceTo = yaw;
  }

  /** `move`: x right, y forward, 0-1. The room is seen from the front, so forward is away from the camera (-z). */
  update(dt: number, move: { x: number; y: number; m: number }, run: boolean) {
    const want = move.m > 0.08 ? (run ? RUN : WALK) * Math.min(1, move.m + 0.15) : 0;
    this.speed += Math.sign(want - this.speed) * Math.min(Math.abs(want - this.speed), (want > this.speed ? 5 : 7) * dt);
    if (this.speed > 0.02) {
      const len = Math.hypot(move.x, move.y) || 1;
      const dx = move.x / len, dz = -move.y / len;
      const step = this.speed * dt;
      const nx = this.pos.x + dx * step, nz = this.pos.z + dz * step;
      if (clear(this.room, nx, nz)) this.pos.set(nx, 0, nz);
      else if (clear(this.room, nx, this.pos.z)) this.pos.x = nx;
      else if (clear(this.room, this.pos.x, nz)) this.pos.z = nz;
      else this.speed = 0;
      if (want > 0) this.yaw = turn(this.yaw, Math.atan2(dx, dz), 9 * dt);
      this.faceTo = null;
    } else if (this.faceTo !== null) {
      this.yaw = turn(this.yaw, this.faceTo, 6 * dt);
    }
    const next = this.speed > 2.2 ? "Jog_Fwd_Loop" : this.speed > 0.3 ? "Walk_Loop" : "Idle_Loop";
    if (next !== this.clip) {
      this.clip = next;
      this.avatar.play(next, 0.18);
    }
    this.avatar.setSpeed(this.speed > 0.3 ? THREE.MathUtils.clamp(this.speed / (next === "Jog_Fwd_Loop" ? JOG_CLIP : WALK_CLIP), 0.4, 1.6) : 1);
    this.avatar.root.position.set(this.pos.x, 0, this.pos.z);
    this.avatar.root.rotation.y = this.yaw;
  }

  /** The spot you are standing in (the nearest, if two overlap). */
  spot(): Spot | null {
    let best: Spot | null = null, bd = Infinity;
    for (const s of this.room.spots) {
      const d = Math.hypot(s.x - this.pos.x, s.z - this.pos.z);
      if (d < s.r && d < bd) {
        best = s;
        bd = d;
      }
    }
    return best;
  }

  /** Walked into the doorway? */
  atDoor(): boolean {
    return inside(this.room.door, this.pos.x, this.pos.z);
  }
}

/** One visitor: wanders between the room's waypoints, stops for a while at each. */
export class Visitor {
  x: number;
  z: number;
  yaw = 0;
  private target: [number, number] | null = null;
  private wait: number;
  private clip = "";

  constructor(readonly avatar: Avatar, private readonly room: PlaceRoom, start: [number, number]) {
    this.x = start[0];
    this.z = start[1];
    this.wait = Math.random() * 5;
    avatar.root.position.set(this.x, 0, this.z);
  }

  update(dt: number) {
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait <= 0) {
        const pts = this.room.waypoints;
        let pick = pts[Math.floor(Math.random() * pts.length)]!;
        if (Math.hypot(pick[0] - this.x, pick[1] - this.z) < 0.5) pick = pts[(pts.indexOf(pick) + 1) % pts.length]!;
        this.target = pick;
      }
    } else if (this.target) {
      const dx = this.target[0] - this.x, dz = this.target[1] - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.15) {
        this.target = null;
        this.wait = 3 + Math.random() * 7;
      } else {
        const step = Math.min(d, 1.05 * dt);
        const nx = this.x + (dx / d) * step, nz = this.z + (dz / d) * step;
        if (clear(this.room, nx, nz, 0.2)) {
          this.x = nx;
          this.z = nz;
        } else {
          this.target = null;
          this.wait = 1 + Math.random() * 2;
        }
        this.yaw = turn(this.yaw, Math.atan2(dx, dz), 7 * dt);
      }
    }
    const next = this.wait <= 0 && this.target ? "Walk_Loop" : "Idle_Loop";
    if (next !== this.clip) {
      this.clip = next;
      this.avatar.play(next, 0.25);
      this.avatar.setSpeed(next === "Walk_Loop" ? 1.05 / WALK_CLIP : 1);
    }
    this.avatar.root.position.set(this.x, 0, this.z);
    this.avatar.root.rotation.y = this.yaw;
  }
}
