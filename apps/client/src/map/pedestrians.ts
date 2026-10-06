import * as THREE from "three";
import { ROAD_CENTRES, ROAD_WIDTH, SIDEWALK } from "@thelife/game-core";

const SKIN = ["#6b4430", "#8a5a3c", "#4e3022", "#a06a48", "#3c2418", "#c28a62"];
const SHIRT = ["#d2503c", "#3b82c4", "#e0b43a", "#4a9d6a", "#8a5ac4", "#d97a2c", "#2c8a8a", "#c44a7a", "#f2f2ee", "#2a2f3a"];
const TROUSERS = ["#2b3140", "#3a3328", "#1f2a44", "#4a4a4a"];
const WALK_SPEED = 1.25;
const SHOW_RANGE = 85;
const MID = (ROAD_WIDTH / 2 + SIDEWALK / 2); // from a road's centre to the middle of its pavement

interface Ped {
  loop: { x0: number; z0: number; x1: number; z1: number; length: number };
  s: number;
  dir: 1 | -1;
  speed: number;
  phase: number;
}

/** A pavement loop round one of the blocks next to a point (the block it is in, or a neighbour). */
function loopAround(x: number, z: number): Ped["loop"] {
  const cell = (t: number) => {
    let c = 0;
    for (let i = 0; i < ROAD_CENTRES.length - 1; i++) if (t >= ROAD_CENTRES[i]!) c = i;
    return Math.max(0, Math.min(ROAD_CENTRES.length - 2, c + Math.floor(Math.random() * 3) - 1));
  };
  const a = cell(x), b = cell(z);
  const x0 = ROAD_CENTRES[a]! + MID, x1 = ROAD_CENTRES[a + 1]! - MID;
  const z0 = ROAD_CENTRES[b]! + MID, z1 = ROAD_CENTRES[b + 1]! - MID;
  return { x0, z0, x1, z1, length: 2 * (x1 - x0 + (z1 - z0)) };
}

/** Where a walker is on a rectangular loop, `s` metres along it, and which way it faces. */
function onLoop(l: Ped["loop"], s: number, dir: 1 | -1): { x: number; z: number; yaw: number } {
  const w = l.x1 - l.x0, h = l.z1 - l.z0;
  let t = ((s % l.length) + l.length) % l.length;
  let x: number, z: number, dx: number, dz: number;
  if (t < w) { x = l.x0 + t; z = l.z0; dx = 1; dz = 0; }
  else if ((t -= w) < h) { x = l.x1; z = l.z0 + t; dx = 0; dz = 1; }
  else if ((t -= h) < w) { x = l.x1 - t; z = l.z1; dx = -1; dz = 0; }
  else { t -= w; x = l.x0; z = l.z1 - t; dx = 0; dz = -1; }
  return { x, z, yaw: Math.atan2(dx * dir, dz * dir) };
}

/**
 * Street life: people walking round the blocks along the pavements. A whole crowd is a handful of instanced meshes (one per body
 * part), so thirty people cost about seven draw calls. Only those near the player are drawn.
 */
export class Pedestrians {
  readonly root = new THREE.Group();
  private readonly peds: Ped[] = [];
  private readonly parts: { mesh: THREE.InstancedMesh; kind: "torso" | "head" | "leg" | "arm"; side: number }[] = [];
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  private time = 0;
  private readonly m = new THREE.Matrix4();
  private readonly base = new THREE.Matrix4();
  private readonly local = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly zero = new THREE.Vector3(0, 0, 0);

  constructor(count = 40) {
    for (let i = 0; i < count; i++) {
      const loop = loopAround(0, 0);
      this.peds.push({ loop, s: Math.random() * loop.length, dir: Math.random() < 0.5 ? 1 : -1, speed: WALK_SPEED * (0.8 + Math.random() * 0.5), phase: Math.random() * 6 });
    }
    const box = (w: number, h: number, d: number, dy: number) => {
      const g = new THREE.BoxGeometry(w, h, d).translate(0, dy, 0);
      this.geos.push(g);
      return g;
    };
    const head = new THREE.SphereGeometry(0.115, 10, 8).scale(1, 1.2, 1.05).translate(0, 1.62, 0);
    this.geos.push(head);
    const make = (geo: THREE.BufferGeometry, kind: "torso" | "head" | "leg" | "arm", side: number, colors: string[]) => {
      const mesh = new THREE.InstancedMesh(geo, this.mat, count);
      mesh.frustumCulled = false;
      this.peds.forEach((_, i) => mesh.setColorAt(i, new THREE.Color(colors[(i * 7 + side * 3 + kind.length) % colors.length]!)));
      this.root.add(mesh);
      this.parts.push({ mesh, kind, side });
    };
    make(box(0.42, 0.58, 0.22, 1.18), "torso", 0, SHIRT);
    make(head, "head", 0, SKIN);
    for (const side of [-1, 1]) {
      make(box(0.17, 0.9, 0.17, -0.45), "leg", side, TROUSERS);
      make(box(0.12, 0.55, 0.12, -0.275), "arm", side, SHIRT);
    }
    // The torso, head and arms share a person's colour choices through the same index, so arms match the shirt.
    const torso = this.parts[0]!.mesh;
    for (const p of this.parts) if (p.kind === "arm" && torso.instanceColor && p.mesh.instanceColor) p.mesh.instanceColor.array.set(torso.instanceColor.array);
    const heads = this.parts[1]!.mesh;
    void heads;
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  update(dt: number, focusX: number, focusZ: number): void {
    if (!this.root.visible) return;
    this.time += dt;
    this.peds.forEach((p, i) => {
      p.s += p.speed * p.dir * dt;
      const pos = onLoop(p.loop, p.s, p.dir);
      const far = Math.hypot(pos.x - focusX, pos.z - focusZ);
      if (far > SHOW_RANGE * 1.6 && (i + Math.floor(this.time * 2)) % 6 === 0) {
        // Too far away to matter: move this person to a pavement near the player, out of sight.
        p.loop = loopAround(focusX, focusZ);
        p.s = Math.random() * p.loop.length;
      }
      const near = far < SHOW_RANGE;
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), pos.yaw);
      this.base.compose(this.v.set(pos.x, 0, pos.z), this.q, near ? this.one : this.zero);
      const swing = Math.sin(this.time * (4.2 * p.speed) + p.phase) * 0.7;
      for (const part of this.parts) {
        if (part.kind === "torso" || part.kind === "head") {
          part.mesh.setMatrixAt(i, this.base);
        } else {
          const hip = part.kind === "leg";
          this.e.set(swing * part.side * (hip ? 1 : -0.8), 0, 0);
          this.q.setFromEuler(this.e);
          this.local.compose(this.v.set(part.side * (hip ? 0.1 : 0.27), hip ? 0.9 : 1.45, 0), this.q, this.one);
          this.m.multiplyMatrices(this.base, this.local);
          part.mesh.setMatrixAt(i, this.m);
        }
      }
    });
    for (const part of this.parts) part.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const part of this.parts) part.mesh.dispose();
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
  }
}
