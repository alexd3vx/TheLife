import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
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

export { DEFAULT_SHAPE, shapeWeights, type BodyShape } from "./bodyShape";
import { shapeWeights, type BodyShape } from "./bodyShape";

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

/** Everything every person shares: the downloaded files and the decoded morph blocks. Loaded once. */
interface Shared {
  gltf: GLTF;
  meta: MorphMeta;
  bin: ArrayBuffer;
  blocks: Map<string, Block>;
  byId: Map<string, MorphMeta["targets"][number]>;
  femaleSkin: THREE.Texture | null;
}
const sharedByFile = new Map<string, Promise<Shared>>();

function loadShared(file: string): Promise<Shared> {
  let p = sharedByFile.get(file);
  if (!p) {
    p = (async () => {
      const [gltf, meta, bin] = await Promise.all([
        loadGLTF(assetUrl(`${file}.glb`)),
        fetch(assetUrl(`${file}.morphs.json`)).then((r) => r.json() as Promise<MorphMeta>),
        gunzip(assetUrl(`${file}.morphs.pack`)),
      ]);
      let femaleSkin: THREE.Texture | null = null;
      const skin = (gltf.scene.getObjectByName("Body") as THREE.Mesh | undefined)?.material as THREE.Material | undefined;
      const idx = skin?.userData?.skinDetailFemale as number | undefined;
      if (idx !== undefined) {
        femaleSkin = (await gltf.parser.getDependency("texture", idx)) as THREE.Texture;
        femaleSkin.colorSpace = THREE.SRGBColorSpace;
        femaleSkin.flipY = false;
      }
      return { gltf, meta, bin, blocks: new Map(), byId: new Map(meta.targets.map((t) => [t.id, t])), femaleSkin };
    })();
    p.catch(() => sharedByFile.delete(file));
    sharedByFile.set(file, p);
  }
  return p;
}

export class MorphBody {
  readonly scene: THREE.Object3D;
  readonly meta: MorphMeta;
  readonly bones = new Map<string, THREE.Bone>();
  readonly parts = new Map<string, Part>();
  private bin: ArrayBuffer;
  private blocks: Map<string, Block>;
  private femaleSkin: THREE.Texture | null = null;
  private maleSkin: THREE.Texture | null = null;
  private current: Record<string, number> = {};
  private restWorld = new Map<string, THREE.Vector3>();
  private byId: Map<string, MorphMeta["targets"][number]>;
  /** Where the hips and the head are now, for placing cameras and retargeting. */
  height = 1.74;

  private constructor(scene: THREE.Object3D, shared: Shared) {
    const meta = shared.meta;
    this.scene = scene;
    this.meta = meta;
    this.bin = shared.bin;
    this.blocks = shared.blocks;
    this.byId = shared.byId;
    this.femaleSkin = shared.femaleSkin;
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

  /** A new person: their own skeleton, geometry and materials, shaped by `shape` (the rest body if none). */
  static async load(shape?: BodyShape, file = "characters/body_mpfb"): Promise<MorphBody> {
    const shared = await loadShared(file);
    const scene = SkeletonUtils.clone(shared.gltf.scene);
    scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.geometry = m.geometry.clone();
      m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
    });
    const body = new MorphBody(scene, shared);
    const skinMat = body.parts.get("Body")?.mesh.material as THREE.MeshStandardMaterial | undefined;
    if (skinMat) {
      // the base layer sits a few millimetres above the skin; keep the skin a hair behind it so the two never flicker
      skinMat.polygonOffset = true;
      skinMat.polygonOffsetFactor = 1;
      skinMat.polygonOffsetUnits = 1;
      body.maleSkin = skinMat.map;
    }
    body.apply(shape ? shapeWeights(shape) : {});
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

  /**
   * Gives the meshes that carry a face (skin, brows, lashes, teeth, tongue) the face units as real GPU morph targets, so an expression
   * can change every frame without rebuilding the person. Returns, per unit, the meshes and target index to drive. Costs memory per person
   * (about 20 copies of the face meshes), so only the people you look at close up get it.
   */
  enableFace(): Map<string, { mesh: THREE.SkinnedMesh; index: number }[]> {
    const units = this.meta.targets.filter((t) => t.id.startsWith("fu_"));
    const out = new Map<string, { mesh: THREE.SkinnedMesh; index: number }[]>();
    for (const name of ["Body", "Brows", "Lashes", "Teeth", "Tongue"]) {
      const p = this.parts.get(name);
      if (!p) continue;
      const g = p.mesh.geometry;
      const attrs: THREE.BufferAttribute[] = [];
      const ids: string[] = [];
      for (const t of units) {
        const blk = t.blocks[p.space];
        if (!blk) continue;
        const { idx, x, y, z } = this.block(t.id, p.space, blk);
        // delta by original vertex id, then spread to this mesh's vertices
        const dense = new Float32Array(this.meta.spaces[p.space]! * 3);
        const step = this.meta.step;
        for (let i = 0; i < idx.length; i++) {
          dense[idx[i]! * 3] = x[i]! * step;
          dense[idx[i]! * 3 + 1] = y[i]! * step;
          dense[idx[i]! * 3 + 2] = z[i]! * step;
        }
        const arr = new Float32Array(p.orig.length * 3);
        for (let v = 0; v < p.orig.length; v++) {
          const o = p.orig[v]! * 3;
          arr[v * 3] = dense[o]!;
          arr[v * 3 + 1] = dense[o + 1]!;
          arr[v * 3 + 2] = dense[o + 2]!;
        }
        attrs.push(new THREE.BufferAttribute(arr, 3));
        ids.push(t.id);
      }
      if (!attrs.length) continue;
      g.morphAttributes.position = attrs;
      g.morphTargetsRelative = true;
      p.mesh.updateMorphTargets();
      ids.forEach((id, index) => {
        const list = out.get(id) ?? [];
        list.push({ mesh: p.mesh, index });
        out.set(id, list);
      });
    }
    return out;
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

  /** Iris colour: the brown eye picture with the iris pixels (the saturated ones) turned to this colour. Null keeps the brown. */
  setEyeColour(colour: string | null): void {
    for (const n of ["Eye_L", "Eye_R"]) {
      const mat = this.parts.get(n)?.mesh.material as THREE.MeshStandardMaterial | undefined;
      if (!mat) continue;
      const base = (mat.userData.baseMap ??= mat.map) as THREE.Texture;
      mat.map = colour ? eyeTexture(base, colour) : base;
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

const eyeTextures = new Map<string, THREE.Texture>();

/** The iris of the brown eye picture recoloured: iris pixels (saturated, not bright) take the hue of `colour` and scale to its depth. */
function eyeTexture(base: THREE.Texture, colour: string): THREE.Texture {
  const key = colour.toLowerCase();
  const have = eyeTextures.get(key);
  if (have) return have;
  const img = base.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const target = { h: 0, s: 0, l: 0 };
  new THREE.Color(colour).getHSL(target);
  const px = data.data;
  const c = new THREE.Color();
  const hsl = { h: 0, s: 0, l: 0 };
  for (let i = 0; i < px.length; i += 4) {
    c.setRGB(px[i]! / 255, px[i + 1]! / 255, px[i + 2]! / 255, THREE.SRGBColorSpace);
    c.getHSL(hsl, THREE.SRGBColorSpace);
    if (hsl.s < 0.3 || hsl.l > 0.68) continue;
    // how strongly this pixel is iris (the edge of the iris blends away)
    const k = Math.min(1, (hsl.s - 0.3) / 0.15);
    const h = hsl.h + (target.h - hsl.h) * k;
    const s = Math.min(1, hsl.s * (target.s / 0.7)) * k + hsl.s * (1 - k);
    const l = Math.min(0.75, hsl.l * (target.l / 0.28)) * k + hsl.l * (1 - k);
    c.setHSL(h, s, l, THREE.SRGBColorSpace);
    px[i] = Math.round(c.r * 255);
    px[i + 1] = Math.round(c.g * 255);
    px[i + 2] = Math.round(c.b * 255);
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.anisotropy = 4;
  eyeTextures.set(key, tex);
  return tex;
}
