import * as THREE from "three";
import { jointPos, type BodyRest } from "./bodyRest";
import { loftGeometry, type LoftGrid } from "./loft";

/**
 * Real cloth for hanging garments: a position-based simulation of the hanging part of a garment (a skirt, a gown, the body of a kaftan or
 * a shirt below the chest).
 *
 *  - Every particle is pulled toward where the animated body would carry it (a soft spring: stiff at the waistband, loose at the hem), so
 *    the garment keeps its cut, and the top rows are pinned to the body.
 *  - Between those pulls the cloth is free: it has inertia and gravity, so it lags, swings, billows and settles when the person moves.
 *  - Neighbouring particles keep their distances (the cloth cannot stretch or tear), and every particle is kept outside the body, which is
 *    a set of capsules (thighs, calves, feet, torso) that move with the skeleton, so legs push the cloth instead of going through it.
 *
 * About 1,600 particles, two substeps a frame, a couple of hundred thousand cheap tests: well under a millisecond on a phone. The result is
 * a plain mesh (not skinned) in the person's own space, so the lower part of a garment is simulated and the upper part is skinned.
 */

interface Capsule {
  a: THREE.Bone;
  b: THREE.Bone;
  r: number;
}

/** The capsules that stand in for the body: each from one joint to the next, as wide as the skin round it. */
export function bodyColliders(rest: BodyRest, bones: THREE.Bone[]): Capsule[] {
  const find = (n: string) => bones.find((b) => b.name === n);
  const pos = rest.geometry.getAttribute("position");
  const out: Capsule[] = [];
  const add = (from: string, to: string, boneNames: string[], pad = 0.004, min = 0.03) => {
    const a = find(from), b = find(to);
    if (!a || !b) return;
    const pa = jointPos(rest, from), pb = jointPos(rest, to);
    const seg = pb.clone().sub(pa);
    const len2 = seg.lengthSq() || 1;
    const ids = new Set(boneNames.map((n) => rest.boneIndex.get(n)).filter((i): i is number => i !== undefined));
    const dist: number[] = [];
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      if (!ids.has(rest.vertexBone[i]!)) continue;
      p.fromBufferAttribute(pos, i);
      const t = Math.max(0, Math.min(1, p.clone().sub(pa).dot(seg) / len2));
      dist.push(p.distanceTo(pa.clone().addScaledVector(seg, t)));
    }
    if (!dist.length) return;
    dist.sort((x, y) => x - y);
    out.push({ a, b, r: Math.max(min, dist[Math.floor(dist.length * 0.7)]! + pad) });
  };
  for (const s of ["l", "r"]) {
    add(`thigh_${s}`, `calf_${s}`, [`thigh_${s}`]);
    add(`calf_${s}`, `foot_${s}`, [`calf_${s}`]);
    add(`foot_${s}`, `ball_${s}`, [`foot_${s}`, `ball_${s}`], 0.004, 0.035);
  }
  add("thigh_l", "thigh_r", ["pelvis"], 0.0, 0.09);
  return out;
}

export class ClothSim {
  readonly mesh: THREE.Mesh;
  private n: number;
  private nu: number;
  private rows: number;
  private x: Float32Array;
  private prev: Float32Array;
  private target: Float32Array;
  private rest: Float32Array;
  private skinIndex: Uint16Array;
  private skinWeight: Float32Array;
  private pull: Float32Array;
  private pinned: Uint8Array;
  private boneMats: THREE.Matrix4[];
  private boneOf: number[] = [];
  private colliders: Capsule[];
  private capA: THREE.Vector3[];
  private capB: THREE.Vector3[];
  private indices: Uint32Array;
  private fresh = true;
  private tmp = new THREE.Vector3();
  private inv = new THREE.Matrix4();

  constructor(grid: LoftGrid, private skeleton: THREE.Skeleton, colliders: Capsule[], private parent: THREE.Object3D, material: THREE.Material | THREE.Material[]) {
    this.n = grid.position.length / 3;
    this.nu = grid.nu;
    this.rows = grid.rows;
    this.rest = grid.position.slice();
    this.x = grid.position.slice();
    this.prev = grid.position.slice();
    this.target = grid.position.slice();
    this.skinIndex = grid.skinIndex;
    this.skinWeight = grid.skinWeight;
    this.indices = grid.indices;
    this.colliders = colliders;
    this.capA = colliders.map(() => new THREE.Vector3());
    this.capB = colliders.map(() => new THREE.Vector3());
    this.boneMats = skeleton.bones.map(() => new THREE.Matrix4());
    this.pinned = new Uint8Array(this.n);
    this.pull = new Float32Array(this.n);
    for (let j = 0; j <= this.rows; j++) {
      const t = j / this.rows;
      for (let i = 0; i < this.nu; i++) {
        const k = j * this.nu + i;
        this.pinned[k] = j <= 1 ? 1 : 0;
        // how hard each particle is pulled to where the animation puts it: firm at the waistband, easy at the hem
        this.pull[k] = 0.32 * Math.pow(1 - t, 1.2) + 0.06;
      }
    }
    const geometry = loftGeometry(grid, true);
    (geometry.getAttribute("position") as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.name = "ClothSim";
  }

  /** Steps the cloth; `dt` in seconds. Call after the animation has moved the skeleton. */
  update(dt: number): void {
    dt = Math.min(dt, 1 / 30);
    if (dt <= 0) return;
    this.parent.updateWorldMatrix(true, false);
    this.skinTargets();
    // a jump (the person was moved somewhere else): the cloth goes with them instead of being dragged across the room
    const dx = this.x[0]! - this.target[0]!, dz = this.x[2]! - this.target[2]!;
    if (dx * dx + dz * dz > 1) this.fresh = true;
    if (this.fresh) {
      this.x.set(this.target);
      this.prev.set(this.target);
      this.fresh = false;
    }
    for (let c = 0; c < this.colliders.length; c++) {
      this.colliders[c]!.a.getWorldPosition(this.capA[c]!);
      this.colliders[c]!.b.getWorldPosition(this.capB[c]!);
    }
    const sub = 2;
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      this.integrate(h);
      for (let it = 0; it < 2; it++) this.constrain();
      this.collide();
    }
    this.write();
  }

  /** Where the animated body carries each particle right now (world space). */
  private skinTargets(): void {
    const bones = this.skeleton.bones;
    for (let i = 0; i < bones.length; i++) this.boneMats[i]!.multiplyMatrices(bones[i]!.matrixWorld, this.skeleton.boneInverses[i]!);
    const v = this.tmp;
    for (let k = 0; k < this.n; k++) {
      let x = 0, y = 0, z = 0;
      const px = this.rest[k * 3]!, py = this.rest[k * 3 + 1]!, pz = this.rest[k * 3 + 2]!;
      for (let b = 0; b < 4; b++) {
        const w = this.skinWeight[k * 4 + b]!;
        if (w === 0) continue;
        const e = this.boneMats[this.skinIndex[k * 4 + b]!]!.elements;
        x += w * (e[0]! * px + e[4]! * py + e[8]! * pz + e[12]!);
        y += w * (e[1]! * px + e[5]! * py + e[9]! * pz + e[13]!);
        z += w * (e[2]! * px + e[6]! * py + e[10]! * pz + e[14]!);
      }
      this.target[k * 3] = x;
      this.target[k * 3 + 1] = y;
      this.target[k * 3 + 2] = z;
    }
    void v;
  }

  private integrate(h: number): void {
    const g = -9.8 * h * h;
    const damp = 0.95;
    for (let k = 0; k < this.n; k++) {
      const i = k * 3;
      if (this.pinned[k]) {
        this.prev[i] = this.x[i]!;
        this.prev[i + 1] = this.x[i + 1]!;
        this.prev[i + 2] = this.x[i + 2]!;
        this.x[i] = this.target[i]!;
        this.x[i + 1] = this.target[i + 1]!;
        this.x[i + 2] = this.target[i + 2]!;
        continue;
      }
      const vx = (this.x[i]! - this.prev[i]!) * damp, vy = (this.x[i + 1]! - this.prev[i + 1]!) * damp, vz = (this.x[i + 2]! - this.prev[i + 2]!) * damp;
      this.prev[i] = this.x[i]!;
      this.prev[i + 1] = this.x[i + 1]!;
      this.prev[i + 2] = this.x[i + 2]!;
      const p = this.pull[k]!;
      // inertia and gravity, then the pull toward the animated shape
      this.x[i] = this.x[i]! + vx + (this.target[i]! - this.x[i]!) * p;
      this.x[i + 1] = this.x[i + 1]! + vy + g + (this.target[i + 1]! - this.x[i + 1]!) * p;
      this.x[i + 2] = this.x[i + 2]! + vz + (this.target[i + 2]! - this.x[i + 2]!) * p;
    }
  }

  /** Neighbours keep the distance they have in the animated shape: the cloth drapes but does not stretch or tear. */
  private constrain(): void {
    const nu = this.nu;
    const pair = (a: number, b: number) => {
      const ia = a * 3, ib = b * 3;
      const rx = this.target[ia]! - this.target[ib]!, ry = this.target[ia + 1]! - this.target[ib + 1]!, rz = this.target[ia + 2]! - this.target[ib + 2]!;
      const rest = Math.hypot(rx, ry, rz);
      const dx = this.x[ia]! - this.x[ib]!, dy = this.x[ia + 1]! - this.x[ib + 1]!, dz = this.x[ia + 2]! - this.x[ib + 2]!;
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      const diff = ((d - rest) / d) * 0.5;
      const wa = this.pinned[a] ? 0 : 1, wb = this.pinned[b] ? 0 : 1;
      const sum = wa + wb;
      if (!sum) return;
      const ka = (wa / sum) * 2 * diff, kb = (wb / sum) * 2 * diff;
      this.x[ia] = this.x[ia]! - dx * ka;
      this.x[ia + 1] = this.x[ia + 1]! - dy * ka;
      this.x[ia + 2] = this.x[ia + 2]! - dz * ka;
      this.x[ib] = this.x[ib]! + dx * kb;
      this.x[ib + 1] = this.x[ib + 1]! + dy * kb;
      this.x[ib + 2] = this.x[ib + 2]! + dz * kb;
    }
    for (let j = 0; j <= this.rows; j++) {
      for (let i = 0; i < nu; i++) {
        const k = j * nu + i;
        pair(k, j * nu + ((i + 1) % nu));
        if (j < this.rows) pair(k, k + nu);
      }
    }
  }

  /** Keeps every particle outside the body's capsules. */
  private collide(): void {
    const p = this.tmp;
    const ab = new THREE.Vector3(), ap = new THREE.Vector3(), q = new THREE.Vector3();
    for (let c = 0; c < this.colliders.length; c++) {
      const a = this.capA[c]!, b = this.capB[c]!, r = this.colliders[c]!.r;
      ab.subVectors(b, a);
      const len2 = ab.lengthSq() || 1e-6;
      for (let k = 0; k < this.n; k++) {
        if (this.pinned[k]) continue;
        const i = k * 3;
        p.set(this.x[i]!, this.x[i + 1]!, this.x[i + 2]!);
        ap.subVectors(p, a);
        const t = Math.max(0, Math.min(1, ap.dot(ab) / len2));
        q.copy(a).addScaledVector(ab, t);
        const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r || d2 < 1e-10) continue;
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        this.x[i] = p.x + dx * push;
        this.x[i + 1] = p.y + dy * push;
        this.x[i + 2] = p.z + dz * push;
      }
    }
  }

  /** Writes the particles into the mesh (in the parent's space) and finds fresh normals. */
  private write(): void {
    this.inv.copy(this.parent.matrixWorld).invert();
    const e = this.inv.elements;
    const attr = this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let k = 0; k < this.n; k++) {
      const i = k * 3;
      const x = this.x[i]!, y = this.x[i + 1]!, z = this.x[i + 2]!;
      arr[i] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
      arr[i + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
      arr[i + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
    }
    attr.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }

  /** Lets the cloth start again from the animated shape (after a teleport or a rebuild). */
  reset(): void {
    this.fresh = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}
