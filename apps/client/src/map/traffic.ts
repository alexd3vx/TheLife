import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LAGOS_ROADS } from "@thelife/game-core";

// Street life on wheels: cars, SUVs, danfo buses, keke and okada driving the real streets (right-hand traffic), plus some parked
// at the kerb. Each kind of vehicle is ONE instanced mesh (plus one for its lamps), so the whole traffic is a handful of draw calls.

interface Road {
  half: number;
  /** x, z pairs. */
  pts: number[];
  /** Length of each leg. */
  len: number[];
}

const roads: Road[] = LAGOS_ROADS.map((row) => {
  const pts: number[] = [];
  let x = row[1]! / 10, z = row[2]! / 10;
  pts.push(x, z);
  for (let i = 3; i + 1 < row.length; i += 2) {
    x += row[i]! / 10;
    z += row[i + 1]! / 10;
    pts.push(x, z);
  }
  const len: number[] = [];
  for (let i = 0; i + 3 < pts.length; i += 2) len.push(Math.hypot(pts[i + 2]! - pts[i]!, pts[i + 3]! - pts[i + 1]!));
  return { half: row[0]! / 20, pts, len };
});

const CELL = 96;
const grid = new Map<number, { road: number; leg: number }[]>();
const key = (cx: number, cz: number) => cx * 100003 + cz;
roads.forEach((r, ri) => {
  for (let leg = 0; leg < r.len.length; leg++) {
    const ax = r.pts[leg * 2]!, az = r.pts[leg * 2 + 1]!, bx = r.pts[leg * 2 + 2]!, bz = r.pts[leg * 2 + 3]!;
    const steps = Math.max(1, Math.ceil(r.len[leg]! / 32));
    const seen = new Set<number>();
    for (let s = 0; s <= steps; s++) {
      const k = key(Math.floor((ax + ((bx - ax) * s) / steps) / CELL), Math.floor((az + ((bz - az) * s) / steps) / CELL));
      if (seen.has(k)) continue;
      seen.add(k);
      let list = grid.get(k);
      if (!list) grid.set(k, (list = []));
      list.push({ road: ri, leg });
    }
  }
});

type Kind = "car" | "suv" | "bus" | "keke" | "bike";
interface Spec {
  kind: Kind;
  share: number;
  speed: [number, number];
  lane: number;
  minHalf: number;
  length: number;
}
const SPECS: Spec[] = [
  { kind: "car", share: 0.34, speed: [6, 11], lane: 0.5, minHalf: 2.4, length: 4.4 },
  { kind: "suv", share: 0.16, speed: [6, 10], lane: 0.5, minHalf: 2.4, length: 4.8 },
  { kind: "bus", share: 0.12, speed: [5, 8], lane: 0.45, minHalf: 3, length: 6.4 },
  { kind: "keke", share: 0.16, speed: [4, 7], lane: 0.62, minHalf: 2, length: 2.8 },
  { kind: "bike", share: 0.22, speed: [6, 10], lane: 0.72, minHalf: 1.8, length: 2 },
];

const CAR_COLOURS = ["#f2f2ee", "#1c1f26", "#8d939c", "#b4232a", "#2d4d8a", "#d8d2c0", "#3a5a40", "#6b4a2a", "#c9c9c9"];
const KEKE_COLOURS = ["#f2c230", "#f2c230", "#e8b820"];
const BIKE_TINTS = ["#ffffff", "#ffd9cf", "#d6e4ff", "#fff1c4", "#d7f2d7"];

function box(w: number, h: number, d: number, x: number, y: number, z: number, colour: THREE.ColorRepresentation | [number, number, number]): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z);
  const c = Array.isArray(colour) ? new THREE.Color(colour[0], colour[1], colour[2]) : new THREE.Color(colour);
  const n = g.attributes.position!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute("uv");
  return g;
}
const WHITE: [number, number, number] = [1, 1, 1];
const GLASS: [number, number, number] = [0.07, 0.09, 0.12];
const BLACK: [number, number, number] = [0.04, 0.04, 0.04];

function wheels(xs: number[], zs: number[], r = 0.32, w = 0.24): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const x of xs) for (const z of zs) out.push(box(w, r * 2, r * 2, x, r, z, BLACK));
  return out;
}

function geometries(kind: Kind): { body: THREE.BufferGeometry; lamps: THREE.BufferGeometry } {
  const head = [2.6, 2.4, 1.9] as [number, number, number];
  const tail = [2.6, 0.1, 0.05] as [number, number, number];
  const lampPair = (halfX: number, y: number, zf: number, zb: number, s = 0.32) => [
    box(s, 0.14, 0.06, -halfX, y, zf, head), box(s, 0.14, 0.06, halfX, y, zf, head),
    box(s, 0.12, 0.06, -halfX, y, zb, tail), box(s, 0.12, 0.06, halfX, y, zb, tail),
  ];
  if (kind === "car") {
    return {
      body: mergeGeometries([box(1.8, 0.6, 4.4, 0, 0.62, 0, WHITE), box(1.55, 0.52, 2.3, 0, 1.18, -0.2, GLASS), box(1.45, 0.07, 1.9, 0, 1.45, -0.2, WHITE), ...wheels([-0.9, 0.9], [-1.4, 1.4])])!,
      lamps: mergeGeometries(lampPair(0.65, 0.7, 2.21, -2.21))!,
    };
  }
  if (kind === "suv") {
    return {
      body: mergeGeometries([box(2.0, 0.85, 4.8, 0, 0.8, 0, WHITE), box(1.8, 0.7, 3.2, 0, 1.55, -0.3, GLASS), box(1.7, 0.08, 3.0, 0, 1.93, -0.3, WHITE), ...wheels([-1.0, 1.0], [-1.55, 1.55], 0.4, 0.3)])!,
      lamps: mergeGeometries(lampPair(0.72, 0.95, 2.41, -2.41, 0.4))!,
    };
  }
  if (kind === "bus") {
    // The Lagos danfo: yellow with a black stripe, windows along the side.
    return {
      body: mergeGeometries([
        box(2.1, 1.9, 6.4, 0, 1.45, 0, WHITE),
        box(2.14, 0.22, 6.44, 0, 1.1, 0, BLACK),
        box(2.14, 0.6, 5.2, 0, 1.95, -0.3, GLASS),
        box(2.0, 0.08, 6.2, 0, 2.45, 0, [0.7, 0.7, 0.7]),
        ...wheels([-1.0, 1.0], [-2.1, 2.0], 0.42, 0.3),
      ])!,
      lamps: mergeGeometries(lampPair(0.8, 0.9, 3.22, -3.22, 0.36))!,
    };
  }
  if (kind === "keke") {
    return {
      body: mergeGeometries([
        box(1.35, 0.55, 2.6, 0, 0.62, 0, WHITE), box(1.3, 1.0, 1.5, 0, 1.4, -0.35, WHITE), box(1.34, 0.08, 1.6, 0, 1.95, -0.35, BLACK), box(1.2, 0.45, 0.06, 0, 1.45, 0.42, GLASS),
        box(0.12, 0.5, 0.5, 0, 0.25, 1.15, BLACK), box(0.14, 0.5, 0.5, -0.6, 0.25, -0.9, BLACK), box(0.14, 0.5, 0.5, 0.6, 0.25, -0.9, BLACK),
      ])!,
      lamps: mergeGeometries([box(0.3, 0.14, 0.06, 0, 0.8, 1.32, head), box(0.3, 0.1, 0.06, -0.4, 0.8, -1.32, tail), box(0.3, 0.1, 0.06, 0.4, 0.8, -1.32, tail)])!,
    };
  }
  // okada: motorbike with a rider
  return {
    body: mergeGeometries([
      box(0.28, 0.6, 1.9, 0, 0.5, 0, [0.22, 0.22, 0.24]), box(0.3, 0.12, 0.7, 0, 0.82, -0.1, BLACK), box(0.5, 0.06, 0.06, 0, 1.0, 0.7, BLACK),
      box(0.14, 0.62, 0.62, 0, 0.31, 0.78, BLACK), box(0.14, 0.62, 0.62, 0, 0.31, -0.78, BLACK),
      box(0.42, 0.62, 0.26, 0, 1.2, -0.2, WHITE), box(0.16, 0.5, 0.2, -0.17, 0.95, 0.15, [0.12, 0.13, 0.2]), box(0.16, 0.5, 0.2, 0.17, 0.95, 0.15, [0.12, 0.13, 0.2]),
      box(0.22, 0.24, 0.24, 0, 1.68, -0.15, [0.35, 0.22, 0.15]),
    ])!,
    lamps: mergeGeometries([box(0.18, 0.12, 0.05, 0, 0.9, 0.99, head), box(0.16, 0.08, 0.05, 0, 0.65, -0.97, tail)])!,
  };
}

interface Vehicle {
  kind: Kind;
  slot: number;
  road: number;
  leg: number;
  /** Distance along the current leg. */
  t: number;
  dir: 1 | -1;
  speed: number;
  cruise: number;
  yaw: number;
  x: number;
  z: number;
  lane: number;
  parked: boolean;
  placed: boolean;
}

const SHOW_RANGE = 130;

export class Traffic {
  readonly root = new THREE.Group();
  private readonly vehicles: Vehicle[] = [];
  private readonly bodies = new Map<Kind, THREE.InstancedMesh>();
  private readonly lamps = new Map<Kind, THREE.InstancedMesh>();
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.1 });
  private readonly lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  private shown = 1;
  private lampsOn = false;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly zero = new THREE.Vector3(0, 0, 0);

  constructor(count = 30) {
    const counts = new Map<Kind, number>();
    for (const spec of SPECS) counts.set(spec.kind, Math.max(1, Math.round(count * spec.share)));
    for (const spec of SPECS) {
      const n = counts.get(spec.kind)!;
      const g = geometries(spec.kind);
      this.geos.push(g.body, g.lamps);
      const body = new THREE.InstancedMesh(g.body, this.bodyMat, n);
      const lamp = new THREE.InstancedMesh(g.lamps, this.lampMat, n);
      body.frustumCulled = lamp.frustumCulled = false;
      body.castShadow = true;
      lamp.visible = false;
      this.root.add(body, lamp);
      this.bodies.set(spec.kind, body);
      this.lamps.set(spec.kind, lamp);
      for (let i = 0; i < n; i++) {
        const colour = spec.kind === "bus" ? "#e8b820" : spec.kind === "keke" ? KEKE_COLOURS[i % KEKE_COLOURS.length]! : spec.kind === "bike" ? BIKE_TINTS[i % BIKE_TINTS.length]! : CAR_COLOURS[(i * 5 + 2) % CAR_COLOURS.length]!;
        body.setColorAt(i, new THREE.Color(colour));
        const speed = spec.speed[0] + Math.random() * (spec.speed[1] - spec.speed[0]);
        this.vehicles.push({ kind: spec.kind, slot: i, road: 0, leg: 0, t: 0, dir: 1, speed, cruise: speed, yaw: 0, x: -1e6, z: -1e6, lane: spec.lane, parked: spec.kind !== "bus" && spec.kind !== "bike" && Math.random() < 0.28, placed: false });
      }
    }
  }

  setDensity(fraction: number): void {
    this.shown = Math.max(0, Math.min(1, fraction));
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  /** Headlights and tail lights on (night, rain). */
  setLamps(on: boolean): void {
    this.lampsOn = on;
    for (const l of this.lamps.values()) l.visible = on;
  }

  private spec(kind: Kind): Spec {
    return SPECS.find((s) => s.kind === kind)!;
  }

  /** Puts a vehicle on a street near the player, out in the distance. */
  private place(v: Vehicle, fx: number, fz: number): boolean {
    const spec = this.spec(v.kind);
    for (let tries = 0; tries < 14; tries++) {
      const a = Math.random() * Math.PI * 2, r = 45 + Math.random() * 80;
      const px = fx + Math.cos(a) * r, pz = fz + Math.sin(a) * r;
      const list = grid.get(key(Math.floor(px / CELL), Math.floor(pz / CELL)));
      if (!list) continue;
      const pick = list[Math.floor(Math.random() * list.length)]!;
      const road = roads[pick.road]!;
      if (road.half < spec.minHalf) continue;
      const leg = pick.leg;
      const ax = road.pts[leg * 2]!, az = road.pts[leg * 2 + 1]!, bx = road.pts[leg * 2 + 2]!, bz = road.pts[leg * 2 + 3]!;
      const len = road.len[leg]!;
      if (len < 3) continue;
      const t = Math.random() * len;
      const x = ax + ((bx - ax) * t) / len, z = az + ((bz - az) * t) / len;
      const d = Math.hypot(x - fx, z - fz);
      if (d < 38 || d > SHOW_RANGE) continue;
      v.road = pick.road;
      v.leg = leg;
      v.t = t;
      v.dir = Math.random() < 0.5 ? 1 : -1;
      v.speed = v.parked ? 0 : v.cruise;
      v.placed = true;
      v.yaw = Math.atan2((bx - ax) * v.dir, (bz - az) * v.dir);
      return true;
    }
    return false;
  }

  update(dt: number, fx: number, fz: number): void {
    if (!this.root.visible) return;
    for (const v of this.vehicles) {
      const far = !v.placed || Math.hypot(v.x - fx, v.z - fz) > SHOW_RANGE * 1.25;
      if (far && !this.place(v, fx, fz)) {
        v.x = v.z = -1e6;
      }
      if (!v.placed) continue;
      const road = roads[v.road]!;
      const ax = road.pts[v.leg * 2]!, az = road.pts[v.leg * 2 + 1]!, bx = road.pts[v.leg * 2 + 2]!, bz = road.pts[v.leg * 2 + 3]!;
      const len = road.len[v.leg]!;
      const ux = ((bx - ax) / len) * v.dir, uz = ((bz - az) / len) * v.dir;
      // Ease the speed: stop for people and other vehicles ahead.
      let target = v.parked ? 0 : v.cruise;
      if (!v.parked) {
        const dxp = fx - v.x, dzp = fz - v.z;
        const ahead = dxp * ux + dzp * uz;
        if (ahead > 0 && ahead < 9 && Math.abs(dxp * -uz + dzp * ux) < 2.4) target = 0;
        for (const o of this.vehicles) {
          if (o === v || !o.placed || o.parked) continue;
          const ox = o.x - v.x, oz = o.z - v.z;
          const f = ox * ux + oz * uz;
          if (f > 0 && f < 9 && Math.abs(ox * -uz + oz * ux) < 2.2) target = f < 4.5 ? 0 : Math.min(target, Math.max(0, o.speed - 1.5));
        }
      }
      v.speed += (target - v.speed) * Math.min(1, dt * (target < v.speed ? 3.5 : 1.2));
      v.t += v.dir * v.speed * dt; // t is measured from the start of the leg, whichever way the vehicle drives
      if (v.dir === 1 ? v.t >= len : v.t <= 0) {
        // Onto the next leg, or the end of the street: turn round somewhere new.
        const next = v.leg + v.dir;
        if (next >= 0 && next < road.len.length) {
          v.leg = next;
          v.t = v.dir === 1 ? 0 : road.len[next]!;
        } else {
          v.placed = false;
          continue;
        }
      }
      // Position on the centre line, then to the right of the way of travel.
      const cx = ax + ((bx - ax) * v.t) / len, cz = az + ((bz - az) * v.t) / len;
      const off = road.half * v.lane * (v.parked ? 1.55 : 1);
      const lane = Math.min(off, road.half - 0.7);
      v.x = cx - uz * lane;
      v.z = cz + ux * lane;
      const want = Math.atan2(ux, uz);
      const diff = ((want - v.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      v.yaw += diff * Math.min(1, dt * 5);
    }
    // Write the matrices.
    for (const v of this.vehicles) {
      const body = this.bodies.get(v.kind)!, lamp = this.lamps.get(v.kind)!;
      const near = v.placed && Math.hypot(v.x - fx, v.z - fz) < SHOW_RANGE && v.slot < body.count * this.shown + 0.001;
      this.q.setFromAxisAngle(this.up, v.yaw);
      this.m.compose(this.p.set(v.x, 0, v.z), this.q, near ? this.s : this.zero);
      body.setMatrixAt(v.slot, this.m);
      lamp.setMatrixAt(v.slot, this.m);
    }
    for (const b of this.bodies.values()) b.instanceMatrix.needsUpdate = true;
    for (const l of this.lamps.values()) l.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const m of this.bodies.values()) m.dispose();
    for (const m of this.lamps.values()) m.dispose();
    for (const g of this.geos) g.dispose();
    this.bodyMat.dispose();
    this.lampMat.dispose();
  }
}
