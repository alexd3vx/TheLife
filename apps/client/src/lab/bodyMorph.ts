import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { loadGLTF } from "./loaders";
import { assetUrl } from "./manifest";

/**
 * The morphable body (built offline by tools/character/build_body.py from MPFB2 / MakeHuman data).
 *
 * The .glb holds the rest body, its skeleton and skin weights. The morphs are NOT glTF morph targets: there are ~170 of them, and the GPU
 * would have to hold every one of them for every person on screen. Instead each morph is a small list of sparse deltas, and a person is
 * made by adding up the few that their look needs, once, on the CPU. After that the person is an ordinary skinned mesh.
 *
 * What a look needs (all numbers in a small object, see `BodyShape`): sex, age, build, height and face and body sliders.
 */

export interface MorphMeta {
  version: number;
  step: number;
  spaces: Record<string, number>;
  bones: string[];
  restBones: Record<string, number[]>;
  sliders: { id: string; label: string; group: string; inc: string; dec: string | null }[];
  macros: string[];
  targets: { id: string; label: string; group: string; blocks: Record<string, { offset: number; count: number }>; bones?: Record<string, number[]> }[];
  meshes: Record<string, { space: string; vertices: number; triangles: number }>;
}

/** A person's body, as a handful of numbers. */
export interface BodyShape {
  /** 0 feminine, 0.5 neutral, 1 masculine */
  sex: number;
  /** years, 18 to 70 */
  age: number;
  /** each -1 to 1 (negative: soft / slim / short / uncommon, positive: muscular / heavy / tall / ideal) */
  muscle: number;
  weight: number;
  height: number;
  proportions: number;
  /** 0 to 1: how far the face and body lean towards these features */
  european: number;
  eastAsian: number;
  /** -1 small, 1 full (feminine bodies) */
  bust: number;
  /** slider id -> -1 to 1 */
  detail: Record<string, number>;
}

export const DEFAULT_SHAPE: BodyShape = { sex: 0.5, age: 25, muscle: 0, weight: 0, height: 0, proportions: 0, european: 0, eastAsian: 0, bust: 0, detail: {} };

const pos = (v: number) => Math.max(0, v);
const neg = (v: number) => Math.max(0, -v);

/** Which morphs a shape switches on, and how far (a plain weighted sum; measured against the exact MakeHuman result to within a few mm). */
export function shapeWeights(s: BodyShape): Record<string, number> {
  const w: Record<string, number> = {};
  const put = (k: string, v: number) => {
    if (Math.abs(v) > 1e-4) w[k] = (w[k] ?? 0) + v;
  };
  const m = Math.min(1, Math.max(0, s.sex)), f = 1 - m;
  put("masculine", pos(2 * m - 1));
  put("feminine", pos(1 - 2 * m));
  const both = (name: string, v: number) => {
    put(`${name}@m`, v * m);
    put(`${name}@f`, v * f);
  };
  const age = Math.min(70, Math.max(18, s.age));
  both("older", age > 25 ? (age - 25) / 45 : 0);
  both("younger", age < 25 ? (25 - age) / 7 : 0);
  both("muscular", pos(s.muscle));
  both("soft", neg(s.muscle));
  both("heavy", pos(s.weight));
  both("slim", neg(s.weight));
  both("tall", pos(s.height));
  both("short", neg(s.height));
  both("proportions_ideal", pos(s.proportions));
  both("proportions_uncommon", neg(s.proportions));
  both("features_european", s.european);
  both("features_east_asian", s.eastAsian);
  // the bust only exists for feminine bodies
  put("bust_full", pos(s.bust) * f);
  put("bust_small", neg(s.bust) * f);
  for (const [id, v] of Object.entries(s.detail)) {
    put(v >= 0 ? `${id}+` : `${id}-`, Math.abs(v));
  }
  return w;
}

interface Part {
  mesh: THREE.SkinnedMesh;
  space: string;
  rest: Float32Array;
  orig: Uint16Array;
  tris: Uint32Array; // triangle corners as original-vertex ids, so seams share one normal
}

/** The morph pack is stored gzipped (it is a plain binary file, so the host would not compress it for us). */
async function gunzip(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  if (typeof DecompressionStream === "undefined") throw new Error("This browser is too old to open the character data");
  return new Response(res.body!.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

/** One morph's changes to one mesh space, decoded: vertex ids and the three planes of int16 offsets. */
interface Block {
  idx: Uint32Array;
  x: Int16Array;
  y: Int16Array;
  z: Int16Array;
}

export class MorphBody {
  readonly scene: THREE.Object3D;
  readonly meta: MorphMeta;
  readonly bones = new Map<string, THREE.Bone>();
  readonly parts = new Map<string, Part>();
  private bin: ArrayBuffer;
  private blocks = new Map<string, Block>();
  private femaleSkin: THREE.Texture | null = null;
  private maleSkin: THREE.Texture | null = null;
  private current: Record<string, number> = {};
  private restWorld = new Map<string, THREE.Vector3>();
  private byId = new Map<string, MorphMeta["targets"][number]>();
  /** Where the hips and the head are now, for placing cameras and retargeting. */
  height = 1.74;

  private constructor(scene: THREE.Object3D, meta: MorphMeta, bin: ArrayBuffer) {
    this.scene = scene;
    this.meta = meta;
    this.bin = bin;
    for (const t of meta.targets) this.byId.set(t.id, t);
    scene.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.bones.set(o.name, o as THREE.Bone);
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      const g = m.geometry;
      const orig = (g.getAttribute("_orig") as THREE.BufferAttribute).array as Uint16Array;
      const index = g.getIndex()!.array;
      const tris = new Uint32Array(index.length);
      for (let i = 0; i < index.length; i++) tris[i] = orig[index[i]!]!;
      const info = meta.meshes[m.name];
      this.parts.set(m.name, { mesh: m, space: info?.space ?? "base", rest: new Float32Array((g.getAttribute("position") as THREE.BufferAttribute).array), orig, tris });
    });
    for (const [name, p] of Object.entries(meta.restBones)) this.restWorld.set(name, new THREE.Vector3(p[0], p[1], p[2]));
  }

  static async load(file = "characters/body_mpfb"): Promise<MorphBody> {
    const [gltf, meta, bin] = await Promise.all([
      loadGLTF(assetUrl(`${file}.glb`)),
      fetch(assetUrl(`${file}.morphs.json`)).then((r) => r.json() as Promise<MorphMeta>),
      gunzip(assetUrl(`${file}.morphs.pack`)),
    ]);
    // each person gets their own copy of the skeleton, geometry and materials (the file is cached and shared)
    const scene = SkeletonUtils.clone(gltf.scene);
    scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.geometry = m.geometry.clone();
      m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
    });
    const body = new MorphBody(scene, meta, bin);
    // the two skin detail pictures (feminine bodies use the second)
    const skinMat = body.parts.get("Body")?.mesh.material as THREE.MeshStandardMaterial | undefined;
    if (skinMat) {
      // the base layer sits a few millimetres above the skin; keep the skin a hair behind it so the two never flicker
      skinMat.polygonOffset = true;
      skinMat.polygonOffsetFactor = 1;
      skinMat.polygonOffsetUnits = 1;
      body.maleSkin = skinMat.map;
      const idx = skinMat.userData?.skinDetailFemale as number | undefined;
      if (idx !== undefined) {
        body.femaleSkin = (await gltf.parser.getDependency("texture", idx)) as THREE.Texture;
        body.femaleSkin.colorSpace = THREE.SRGBColorSpace;
        body.femaleSkin.flipY = false;
      }
    }
    body.apply({});
    return body;
  }

  /** Switch on exactly these morphs (id -> weight). */
  apply(weights: Record<string, number>): void {
    this.current = weights;
    const step = this.meta.step;
    // 1. the sum of deltas, once per space
    const acc = new Map<string, Float32Array>();
    for (const [space, n] of Object.entries(this.meta.spaces)) acc.set(space, new Float32Array(n * 3));
    const bonesAcc = new Map<string, THREE.Vector3>();
    for (const [id, w] of Object.entries(weights)) {
      const t = this.byId.get(id);
      if (!t || !w) continue;
      for (const [space, blk] of Object.entries(t.blocks)) {
        const a = acc.get(space)!;
        const { idx, x, y, z } = this.block(id, space, blk);
        const k = step * w;
        for (let i = 0; i < idx.length; i++) {
          const v = idx[i]! * 3;
          a[v]! += x[i]! * k;
          a[v + 1]! += y[i]! * k;
          a[v + 2]! += z[i]! * k;
        }
      }
      if (t.bones) {
        for (const [b, d] of Object.entries(t.bones)) {
          const v = bonesAcc.get(b) ?? new THREE.Vector3();
          v.x += d[0]! * w;
          v.y += d[1]! * w;
          v.z += d[2]! * w;
          bonesAcc.set(b, v);
        }
      }
    }
    // 2. every mesh: rest + delta, then smooth normals
    for (const p of this.parts.values()) {
      const a = acc.get(p.space)!;
      const g = p.mesh.geometry;
      const posAttr = g.getAttribute("position") as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let v = 0; v < p.orig.length; v++) {
        const o = p.orig[v]! * 3;
        arr[v * 3] = p.rest[v * 3]! + a[o]!;
        arr[v * 3 + 1] = p.rest[v * 3 + 1]! + a[o + 1]!;
        arr[v * 3 + 2] = p.rest[v * 3 + 2]! + a[o + 2]!;
      }
      posAttr.needsUpdate = true;
      this.smoothNormals(p, acc.get(p.space)!.length / 3);
      g.computeBoundingSphere();
    }
    // 3. the skeleton follows the body
    const world = new Map<string, THREE.Vector3>();
    for (const [name, rest] of this.restWorld) {
      const d = bonesAcc.get(name);
      world.set(name, d ? rest.clone().add(d) : rest.clone());
    }
    for (const [name, bone] of this.bones) {
      const w = world.get(name);
      if (!w) continue;
      const parent = bone.parent as THREE.Bone | null;
      const pw = parent && (parent as THREE.Bone).isBone ? world.get(parent.name) : null;
      bone.position.copy(pw ? w.clone().sub(pw) : w);
    }
    const seen = new Set<THREE.Skeleton>();
    for (const p of this.parts.values()) {
      const sk = p.mesh.skeleton;
      if (seen.has(sk)) continue;
      seen.add(sk);
      sk.bones.forEach((b, i) => {
        const w = world.get(b.name);
        if (w) sk.boneInverses[i]!.makeTranslation(-w.x, -w.y, -w.z);
      });
    }
    const head = world.get("Head"), eye = world.get("eye_l");
    this.height = (eye ? eye.y : head ? head.y + 0.05 : 1.7) + 0.12;
    this.scene.updateMatrixWorld(true);
  }

  private block(id: string, space: string, blk: { offset: number; count: number }): Block {
    const key = `${id}/${space}`;
    let b = this.blocks.get(key);
    if (b) return b;
    const n = blk.count;
    const gaps = new Uint16Array(this.bin, blk.offset, n);
    const idx = new Uint32Array(n);
    let at = 0;
    for (let i = 0; i < n; i++) {
      at += gaps[i]!;
      idx[i] = at;
    }
    const base = (blk.offset + n * 2 + 3) & ~3;
    b = { idx, x: new Int16Array(this.bin, base, n), y: new Int16Array(this.bin, base + n * 2, n), z: new Int16Array(this.bin, base + n * 4, n) };
    this.blocks.set(key, b);
    return b;
  }

  private smoothNormals(p: Part, n: number): void {
    const arr = (p.mesh.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
    const acc = new Float32Array(n * 3);
    const t = p.tris;
    // positions by original id: the first copy of each is enough, copies share the same place
    const pos = new Float32Array(n * 3);
    for (let v = 0; v < p.orig.length; v++) {
      const o = p.orig[v]! * 3;
      pos[o] = arr[v * 3]!;
      pos[o + 1] = arr[v * 3 + 1]!;
      pos[o + 2] = arr[v * 3 + 2]!;
    }
    for (let i = 0; i < t.length; i += 3) {
      const a = t[i]! * 3, b = t[i + 1]! * 3, c = t[i + 2]! * 3;
      const ux = pos[b]! - pos[a]!, uy = pos[b + 1]! - pos[a + 1]!, uz = pos[b + 2]! - pos[a + 2]!;
      const vx = pos[c]! - pos[a]!, vy = pos[c + 1]! - pos[a + 1]!, vz = pos[c + 2]! - pos[a + 2]!;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) {
        acc[k]! += nx;
        acc[k + 1]! += ny;
        acc[k + 2]! += nz;
      }
    }
    const nrm = p.mesh.geometry.getAttribute("normal") as THREE.BufferAttribute;
    const out = nrm.array as Float32Array;
    for (let v = 0; v < p.orig.length; v++) {
      const o = p.orig[v]! * 3;
      const l = Math.hypot(acc[o]!, acc[o + 1]!, acc[o + 2]!) || 1;
      out[v * 3] = acc[o]! / l;
      out[v * 3 + 1] = acc[o + 1]! / l;
      out[v * 3 + 2] = acc[o + 2]! / l;
    }
    nrm.needsUpdate = true;
  }

  /** Skin tone (any colour) and which of the two skin detail pictures to use. */
  setSkin(colour: THREE.ColorRepresentation, feminine: boolean): void {
    const mat = this.parts.get("Body")?.mesh.material as THREE.MeshStandardMaterial | undefined;
    if (!mat) return;
    const c = new THREE.Color(colour);
    mat.color.setRGB(c.r * 2, c.g * 2, c.b * 2);
    const tex = feminine ? this.femaleSkin ?? this.maleSkin : this.maleSkin;
    if (tex && mat.map !== tex) {
      mat.map = tex;
      mat.needsUpdate = true;
    }
  }

  setLayersVisible(opts: { shorts: boolean; top: boolean }): void {
    const sh = this.parts.get("Shorts"), tp = this.parts.get("Top");
    if (sh) sh.mesh.visible = opts.shorts;
    if (tp) tp.mesh.visible = opts.top;
  }

  setHairColour(colour: THREE.ColorRepresentation): void {
    for (const n of ["Brows", "Lashes"]) {
      const m = this.parts.get(n)?.mesh.material as THREE.MeshStandardMaterial | undefined;
      m?.color.set(colour);
    }
  }

  dispose(): void {
    for (const p of this.parts.values()) {
      p.mesh.geometry.dispose();
      const mats = Array.isArray(p.mesh.material) ? p.mesh.material : [p.mesh.material];
      for (const m of mats) m.dispose();
    }
  }
}
