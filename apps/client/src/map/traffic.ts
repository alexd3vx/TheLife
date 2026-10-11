import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LAGOS_ROADS } from "@thelife/game-core";
import { buildKeke, buildOkada } from "./vehicles3d";
import { loadCar } from "./vehicleKit";

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

type Kind = "sedan" | "taxi" | "hatch" | "suv" | "suvlux" | "van" | "truck" | "keke" | "bike";
interface Spec {
  kind: Kind;
  share: number;
  speed: [number, number];
  lane: number;
  minHalf: number;
  /** The car-kit file, or null for the shapes we build ourselves (okada, keke). */
  file: string | null;
  /** Length in metres. */
  length: number;
  parkable: boolean;
  /** A colour put over the model (the danfo is yellow). */
  tint?: string;
}
// Real 3D models: the Kenney Car Kit (CC0) for the cars, a yellow-tinted van for the danfo, and our own okada and keke.
const SPECS: Spec[] = [
  { kind: "sedan", share: 0.15, speed: [6, 11], lane: 0.5, minHalf: 2.4, file: "sedan", length: 4.5, parkable: true },
  { kind: "taxi", share: 0.09, speed: [6, 10], lane: 0.5, minHalf: 2.4, file: "taxi", length: 4.5, parkable: true },
  { kind: "hatch", share: 0.1, speed: [6, 11], lane: 0.5, minHalf: 2.4, file: "hatchback-sports", length: 4.1, parkable: true },
  { kind: "suv", share: 0.1, speed: [6, 10], lane: 0.5, minHalf: 2.4, file: "suv", length: 4.8, parkable: true },
  { kind: "suvlux", share: 0.05, speed: [6, 10], lane: 0.5, minHalf: 2.4, file: "suv-luxury", length: 4.9, parkable: true },
  { kind: "van", share: 0.1, speed: [5, 8], lane: 0.45, minHalf: 3, file: "van", length: 5.4, parkable: false, tint: "#f6c92a" },
  { kind: "truck", share: 0.04, speed: [4, 7], lane: 0.45, minHalf: 3, file: "truck", length: 7, parkable: false },
  { kind: "keke", share: 0.15, speed: [4, 7], lane: 0.62, minHalf: 2, file: null, length: 2.7, parkable: true },
  { kind: "bike", share: 0.22, speed: [6, 10], lane: 0.72, minHalf: 1.8, file: null, length: 2.1, parkable: false },
];

const TINT_NONE = new THREE.Color("#ffffff");
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

/** Head lamps (white) and tail lamps (red) for a vehicle of this size: they glow at night. */
function lampsFor(w: number, h: number, l: number, single = false): THREE.BufferGeometry {
  const head = [2.6, 2.4, 1.9] as [number, number, number];
  const tail = [2.6, 0.1, 0.05] as [number, number, number];
  const y = Math.max(0.5, h * 0.3);
  if (single) return mergeGeometries([box(0.22, 0.14, 0.06, 0, y + 0.1, l / 2 + 0.02, head), box(0.16, 0.1, 0.05, 0, y, -l / 2 - 0.02, tail)])!;
  return mergeGeometries([
    box(0.3, 0.14, 0.06, -w * 0.32, y, l / 2 + 0.02, head), box(0.3, 0.14, 0.06, w * 0.32, y, l / 2 + 0.02, head),
    box(0.3, 0.12, 0.06, -w * 0.32, y, -l / 2 - 0.02, tail), box(0.3, 0.12, 0.06, w * 0.32, y, -l / 2 - 0.02, tail),
  ])!;
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
  private readonly bodies = new Map<Kind, THREE.InstancedMesh[]>();
  private readonly lamps = new Map<Kind, THREE.InstancedMesh>();
  private readonly counts = new Map<Kind, number>();
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];
  private readonly lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  private shown = 1;
  private lampsOn = false;
  private gone = false;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly zero = new THREE.Vector3(0, 0, 0);

  constructor(private readonly count = 30) {
    for (const spec of SPECS) {
      const n = Math.max(1, Math.round(count * spec.share));
      this.counts.set(spec.kind, n);
      for (let i = 0; i < n; i++) {
        const speed = spec.speed[0] + Math.random() * (spec.speed[1] - spec.speed[0]);
        this.vehicles.push({ kind: spec.kind, slot: i, road: 0, leg: 0, t: 0, dir: 1, speed, cruise: speed, yaw: 0, x: -1e6, z: -1e6, lane: spec.lane, parked: spec.parkable && Math.random() < 0.28, placed: false });
      }
    }
  }

  /** Fetches the vehicle models and makes the instanced meshes; the traffic appears as each kind arrives. */
  async load(): Promise<void> {
    await Promise.all(
      SPECS.map(async (spec) => {
        const n = this.counts.get(spec.kind)!;
        let parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[];
        let w: number, h: number, l: number;
        if (spec.file) {
          try {
            const car = await loadCar(spec.file, spec.length);
            parts = car.parts;
            ({ w, h, l } = car);
          } catch {
            return;
          }
        } else {
          const geo = spec.kind === "keke" ? buildKeke() : buildOkada();
          parts = [{ geo, mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 }) }];
          [w, h, l] = spec.kind === "keke" ? [1.4, 1.9, 2.7] : [0.7, 1.8, 2.1];
          this.geos.push(geo);
          this.mats.push(parts[0]!.mat);
        }
        if (this.gone) return;
        const meshes = parts.map((part) => {
          const im = new THREE.InstancedMesh(part.geo, part.mat, n);
          im.frustumCulled = false;
          im.castShadow = true;
          im.count = n;
          for (let i = 0; i < n; i++) im.setColorAt(i, spec.tint ? new THREE.Color(spec.tint).multiplyScalar(2.3) : spec.kind === "bike" ? new THREE.Color(BIKE_TINTS[i % BIKE_TINTS.length]!) : TINT_NONE);
          this.root.add(im);
          return im;
        });
        this.bodies.set(spec.kind, meshes);
        const lg = lampsFor(w, h, l, spec.kind === "keke" || spec.kind === "bike");
        this.geos.push(lg);
        const lamp = new THREE.InstancedMesh(lg, this.lampMat, n);
        lamp.frustumCulled = false;
        lamp.visible = this.lampsOn;
        this.root.add(lamp);
        this.lamps.set(spec.kind, lamp);
      }),
    );
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
      const bodies = this.bodies.get(v.kind), lamp = this.lamps.get(v.kind);
      if (!bodies || !lamp) continue;
      const near = v.placed && Math.hypot(v.x - fx, v.z - fz) < SHOW_RANGE && v.slot < this.counts.get(v.kind)! * this.shown + 0.001;
      this.q.setFromAxisAngle(this.up, v.yaw);
      this.m.compose(this.p.set(v.x, 0, v.z), this.q, near ? this.s : this.zero);
      for (const b of bodies) b.setMatrixAt(v.slot, this.m);
      lamp.setMatrixAt(v.slot, this.m);
    }
    for (const bs of this.bodies.values()) for (const b of bs) {
      b.instanceMatrix.needsUpdate = true;
      if (b.instanceColor) b.instanceColor.needsUpdate = true;
    }
    for (const l of this.lamps.values()) l.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.gone = true;
    this.root.removeFromParent();
    for (const bs of this.bodies.values()) for (const m of bs) m.dispose();
    for (const m of this.lamps.values()) m.dispose();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.lampMat.dispose();
  }
}
