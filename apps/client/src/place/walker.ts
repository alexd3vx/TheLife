import * as THREE from "three";
import type { Avatar } from "../lab/avatar";
import { RUN_SPEED, WALK_SPEED, locomotionClip, locomotionRate } from "../lab/locomotion";
import type { PlaceRoom, Rect, Spot } from "./roomKit";

/** Walking around inside a room: the player's body, the people who wander, and which spot you are standing at. */

const RADIUS = 0.28;
const WALK = WALK_SPEED;
const RUN = RUN_SPEED;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const turn = (cur: number, target: number, step: number) => cur + Math.max(-step, Math.min(step, wrap(target - cur)));

/** Is a circle at (x, z) clear of the walls and the furniture? */
export function clear(room: PlaceRoom, x: number, z: number, r = RADIUS): boolean {
  const b = room.bounds;
  if (x < b.minX + r || x > b.maxX - r || z < b.minZ + r) return false;
  // the doorway lane (the door's width) runs on through the front wall to the door itself
  if (z > b.maxZ - r && !(x > room.door.minX && x < room.door.maxX && z < room.door.maxZ)) return false;
  for (const o of room.blockers) if (x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r) return false;
  return true;
}
const inside = (o: Rect, x: number, z: number) => x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ;

const CELL = 0.2;

/** A walking route across the room from (ax, az) to (bx, bz) around the furniture: A* on a fine grid, then straightened. Null if there is none. */
export function findRoute(room: PlaceRoom, ax: number, az: number, bx: number, bz: number): [number, number][] | null {
  const b = room.bounds;
  const cols = Math.ceil((b.maxX - b.minX) / CELL) + 1, rows = Math.ceil((b.maxZ + 0.8 - b.minZ) / CELL) + 1;
  const cx = (i: number) => b.minX + i * CELL, cz = (j: number) => b.minZ + j * CELL;
  const ci = (x: number) => Math.max(0, Math.min(cols - 1, Math.round((x - b.minX) / CELL)));
  const cj = (z: number) => Math.max(0, Math.min(rows - 1, Math.round((z - b.minZ) / CELL)));
  const free = (i: number, j: number) => clear(room, cx(i), cz(j));
  const start = [ci(ax), cj(az)] as const;
  let goal = [ci(bx), cj(bz)] as const;
  if (!free(goal[0], goal[1])) {
    // the nearest free cell to the tapped point
    let best: [number, number] | null = null, bd = Infinity;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (free(i, j)) {
      const d = (i - goal[0]) ** 2 + (j - goal[1]) ** 2;
      if (d < bd) { bd = d; best = [i, j]; }
    }
    if (!best) return null;
    goal = best;
  }
  const key = (i: number, j: number) => j * cols + i;
  const g = new Map<number, number>();
  const from = new Map<number, number>();
  const open: [number, number, number, number][] = [[0, 0, start[0], start[1]]]; // f, g, i, j
  g.set(key(start[0], start[1]), 0);
  const h = (i: number, j: number) => Math.hypot(i - goal[0], j - goal[1]);
  let found = false;
  let guard = 0;
  while (open.length && guard++ < 20000) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k]![0] < open[bi]![0]) bi = k;
    const [, gc, i, j] = open.splice(bi, 1)[0]!;
    if (i === goal[0] && j === goal[1]) { found = true; break; }
    if (gc > (g.get(key(i, j)) ?? Infinity)) continue;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows || !free(ni, nj)) continue;
      if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue;
      const ng = gc + (di && dj ? 1.414 : 1);
      if (ng < (g.get(key(ni, nj)) ?? Infinity)) {
        g.set(key(ni, nj), ng);
        from.set(key(ni, nj), key(i, j));
        open.push([ng + h(ni, nj), ng, ni, nj]);
      }
    }
  }
  if (!found) return null;
  const cells: [number, number][] = [];
  for (let k = key(goal[0], goal[1]); ; ) {
    cells.push([cx(k % cols), cz(Math.floor(k / cols))]);
    const p = from.get(k);
    if (p === undefined) break;
    k = p;
  }
  cells.reverse();
  // straighten: skip points that can be walked to in a straight line
  const seen = (p: [number, number], q: [number, number]) => {
    const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.1);
    for (let t = 1; t < n; t++) if (!clear(room, p[0] + ((q[0] - p[0]) * t) / n, p[1] + ((q[1] - p[1]) * t) / n)) return false;
    return true;
  };
  const out: [number, number][] = [];
  let at: [number, number] = [ax, az];
  let idx = 0;
  while (idx < cells.length) {
    let far = idx;
    for (let k = cells.length - 1; k > idx; k--) if (seen(at, cells[k]!)) { far = k; break; }
    at = cells[far]!;
    out.push(at);
    idx = far + 1;
  }
  return out;
}

export class Walker {
  readonly pos = new THREE.Vector3();
  /** A route being walked after a tap, and what to do when it ends. */
  private route: [number, number][] = [];
  private onArrive: (() => void) | null = null;
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

  /** Set by the caller when the push comes from a stick (analog) rather than keys or a tapped route. */
  analog = false;

  private pushSpeed(m: number, run: boolean, analog: boolean): number {
    if (!analog) return run ? RUN : WALK;
    const a = Math.min(1, (m - 0.08) / 0.92);
    if (run || a > 0.95) return RUN;
    if (a <= 0.45) return WALK * Math.max(0.35, a / 0.45);
    const k = Math.min(1, (a - 0.45) / 0.4);
    return WALK + (RUN - WALK) * k * k * (3 - 2 * k);
  }

  face(yaw: number | null) {
    this.faceTo = yaw;
  }

  /** Walk to a point (round the furniture) and then call `then`. Returns false when there is no way. */
  goTo(x: number, z: number, then?: () => void): boolean {
    const r = findRoute(this.room, this.pos.x, this.pos.z, x, z);
    if (!r) return false;
    this.route = r;
    this.onArrive = then ?? null;
    return true;
  }

  /** The clip being played (idle, walk or jog), for telling other players what this one is doing. */
  get clipName(): string {
    return this.clip || "Idle_Loop";
  }

  get walking(): boolean {
    return this.route.length > 0;
  }

  cancelRoute() {
    this.route = [];
    this.onArrive = null;
  }

  /** `move`: x right, y forward, 0-1. The room is seen from the front, so forward is away from the camera (-z). */
  update(dt: number, moveIn: { x: number; y: number; m: number }, run: boolean) {
    let move = moveIn;
    // a tapped route steers the body; the stick or the keys take over at once
    let steer: { x: number; y: number; m: number } = move;
    if (move.m > 0.08) this.cancelRoute();
    else if (this.route.length) {
      const [tx, tz] = this.route[0]!;
      const dx = tx - this.pos.x, dz = tz - this.pos.z;
      if (Math.hypot(dx, dz) < 0.12) {
        this.route.shift();
        if (!this.route.length) {
          const done = this.onArrive;
          this.onArrive = null;
          done?.();
        }
      } else steer = { x: dx, y: -dz, m: 1 };
    }
    const routing = steer !== moveIn;
    if (routing) {
      const end = this.route[this.route.length - 1]!;
      run = Math.hypot(end[0] - this.pos.x, end[1] - this.pos.z) > 6; // a long way across the room is jogged
    }
    move = steer;
    const want = move.m > 0.08 ? this.pushSpeed(move.m, run, routing ? false : this.analog) : 0;
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
    const next = locomotionClip(this.speed, this.clip);
    if (next !== this.clip) {
      this.clip = next;
      this.avatar.play(next, 0.18);
    }
    this.avatar.setSpeed(locomotionRate(this.speed, next));
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
const VISITOR_SPEED = 1.05;

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
        const step = Math.min(d, VISITOR_SPEED * dt);
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
      this.avatar.setSpeed(locomotionRate(next === "Walk_Loop" ? VISITOR_SPEED : 0, next));
    }
    this.avatar.root.position.set(this.x, 0, this.z);
    this.avatar.root.rotation.y = this.yaw;
  }
}
