import * as THREE from "three";
import type { CrowdLook } from "../lab/npcSpec";

/**
 * A crowd in a handful of draw calls. Every person is one instance of a thinned body (1,500 triangles up close, 420 far away). Each
 * vertex belongs to a zone (skin, top, trousers, shoes, hair, sleeve, lower leg) and a limb, both baked by tools/character/build_crowd.py.
 * The vertex shader colours each zone with that person's own colours, stands the hair off the scalp, scales the person to their own
 * height and build, and swings the legs and arms in a walk. Nothing is skinned or animated on the CPU.
 */
export const CROWD_URL = "/assets/characters/crowd.json";
export type CrowdLevel = 0 | 1 | 2; // 0 not drawn, 1 mid, 2 far

interface LodData { pos: number[]; tri: number[]; zone: number[]; limb: number[] }
interface BodyData { height: number; pivots: Record<"hip" | "knee" | "shoulder" | "elbow", number[]>; lods: Record<"mid" | "far", LodData> }
interface CrowdFile { bodies: Record<"male" | "female", BodyData> }

const VERT = {
  decl: /* glsl */ `
attribute vec2 aZL;
attribute vec4 aA; attribute vec4 aB; attribute vec4 aC; attribute vec4 aD; attribute vec4 aE;
attribute float aSpeed;
uniform float uTime;
uniform vec4 uPiv;
uniform vec3 uArm;
varying vec3 vTint;
vec3 rx(vec3 p, float py, float a) { float c = cos(a), s = sin(a); float y = p.y - py; return vec3(p.x, py + y * c - p.z * s, y * s + p.z * c); }
vec3 rz(vec3 p, vec2 pv, float a) { float c = cos(a), s = sin(a); vec2 d = p.xy - pv; return vec3(pv.x + d.x * c - d.y * s, pv.y + d.x * s + d.y * c, p.z); }
vec3 rzn(vec3 n, float a) { float c = cos(a), s = sin(a); return vec3(n.x * c - n.y * s, n.x * s + n.y * c, n.z); }
vec3 rxn(vec3 n, float a) { float c = cos(a), s = sin(a); return vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c); }
vec3 zoneColour(float z, bool shorts, bool longSl) {
  if (z < 0.5) return aA.rgb;
  if (z < 1.5) return aB.rgb;
  if (z < 2.5) return aC.rgb;
  if (z < 3.5) return aD.rgb;
  if (z < 4.5) return aE.rgb;
  if (z < 5.5) return longSl ? aB.rgb : aA.rgb;
  return shorts ? aA.rgb : aC.rgb;
}
void pose(inout vec3 p, inout vec3 n) {
  float limb = aZL.y;
  float sw = sin(uTime * aSpeed * 5.2 + aE.w);
  float L = abs(limb);
  float side = sign(limb);
  if (L > 0.5 && L < 1.5) {
    float knee = max(0.0, -sw * side) * 0.6;
    if (p.y < uPiv.y) { p = rx(p, uPiv.y, knee); n = rxn(n, knee); }
    float a = -sw * side * 0.36;
    p = rx(p, uPiv.x, a); n = rxn(n, a);
  } else if (L > 1.5) {
    if (p.y < uPiv.w) { p = rx(p, uPiv.w, -0.18); n = rxn(n, -0.18); }
    float down = -sign(p.x) * uArm.z;
    p = rz(p, uArm.xy, down); n = rzn(n, down);
    float a = sw * side * 0.4;
    p = rx(p, uPiv.z, a); n = rxn(n, a);
  }
  if (aZL.x > 3.5 && aZL.x < 4.5) p += n * aA.w;
  p.y += abs(sw) * 0.014;
  p.xz *= aC.w;
  p.y *= aB.w;
}`,
};

class Lod {
  readonly geometry = new THREE.BufferGeometry();
  readonly count: number;
  constructor(d: LodData) {
    const n = d.pos.length / 3;
    this.count = d.tri.length / 3;
    this.geometry.setAttribute("position", new THREE.Float32BufferAttribute(d.pos.map((v) => v / 1000), 3));
    const zl = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      zl[i * 2] = d.zone[i]!;
      zl[i * 2 + 1] = d.limb[i]!;
    }
    this.geometry.setAttribute("aZL", new THREE.BufferAttribute(zl, 2));
    this.geometry.setIndex(d.tri);
    this.geometry.computeVertexNormals();
  }
}

export class Crowd {
  readonly root = new THREE.Group();
  /** Four meshes: male mid, male far, female mid, female far. Each draws only the people currently at its level (`count`), packed to the front. */
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly slots: Int32Array[] = [];
  private readonly mats: THREE.MeshStandardMaterial[] = [];
  private readonly lods: Lod[] = [];
  // everything known about each person, kept on the CPU
  private readonly data: Record<"a" | "b" | "c" | "d" | "e", Float32Array>;
  private readonly speed: Float32Array;
  private readonly spot: Float32Array;
  private readonly lift: Float32Array;
  private readonly want: Int8Array;
  private readonly female: boolean[];
  private dirty = true;
  private readonly time = { value: 0 };
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3(0, 1, 0);
  private readonly pos = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly tmp = new THREE.Color();

  private constructor(readonly capacity: number, file: CrowdFile) {
    const mk = (n: number) => new Float32Array(capacity * n);
    this.data = { a: mk(4), b: mk(4), c: mk(4), d: mk(4), e: mk(4) };
    this.speed = mk(1);
    this.spot = mk(3);
    this.lift = mk(1);
    this.want = new Int8Array(capacity).fill(-1);
    this.female = new Array(capacity).fill(false);
    for (const sex of ["male", "female"] as const) {
      const body = file.bodies[sex];
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
      const uPiv = { value: new THREE.Vector4(body.pivots.hip[1], body.pivots.knee[1], body.pivots.shoulder[1], body.pivots.elbow[1]) };
      // the rest pose holds the arms out in an A; this is the angle that hangs them straight down
      const sh = body.pivots.shoulder, el = body.pivots.elbow;
      const uArm = { value: new THREE.Vector3(sh[0], sh[1], Math.atan2(el[0]! - sh[0]!, sh[1]! - el[1]!)) };
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = this.time;
        shader.uniforms.uPiv = uPiv;
        shader.uniforms.uArm = uArm;
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", `#include <common>\n${VERT.decl}`)
          .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvec3 pPose = position;\npose(pPose, objectNormal);\nfloat flg = aD.w;\nvTint = zoneColour(aZL.x, mod(flg, 2.0) >= 1.0, flg >= 2.0);")
          .replace("#include <begin_vertex>", "vec3 transformed = pPose;");
        shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vTint;").replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= vTint;");
      };
      this.mats.push(mat);
      for (const lod of ["mid", "far"] as const) {
        const l = new Lod(body.lods[lod]);
        this.lods.push(l);
        const mesh = new THREE.InstancedMesh(l.geometry, mat, capacity);
        mesh.frustumCulled = false;
        mesh.count = 0;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        for (const [k, n] of [["a", 4], ["b", 4], ["c", 4], ["d", 4], ["e", 4], ["speed", 1]] as const) {
          const attr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n);
          attr.setUsage(THREE.DynamicDrawUsage);
          l.geometry.setAttribute(k === "speed" ? "aSpeed" : `a${k.toUpperCase()}`, attr);
        }
        this.root.add(mesh);
        this.meshes.push(mesh);
        this.slots.push(new Int32Array(capacity));
      }
    }
  }

  static async load(capacity: number, url = CROWD_URL): Promise<Crowd> {
    const file = (await (await fetch(url)).json()) as CrowdFile;
    return new Crowd(capacity, file);
  }

  /** Give a slot its person. */
  setPerson(i: number, p: CrowdLook): void {
    const put = (a: Float32Array, hex: string, w: number) => {
      this.tmp.set(hex);
      a[i * 4] = this.tmp.r;
      a[i * 4 + 1] = this.tmp.g;
      a[i * 4 + 2] = this.tmp.b;
      a[i * 4 + 3] = w;
    };
    put(this.data.a, p.skin, p.hairVolume);
    put(this.data.b, p.top, p.height);
    put(this.data.c, p.bottom, p.width);
    put(this.data.d, p.shoe, (p.shorts ? 1 : 0) + (p.longSleeve ? 2 : 0));
    put(this.data.e, p.hair, this.data.e[i * 4 + 3]!);
    this.female[i] = p.female;
    this.dirty = true;
  }

  /** The walk: stride rate and where in the stride this person is. */
  setGait(i: number, speed: number, phase: number): void {
    this.speed[i] = speed;
    this.data.e[i * 4 + 3] = phase;
    this.dirty = true;
  }

  /** Put a person on the ground and say how they are drawn: not at all, mid detail or far detail. Takes effect at the next update. */
  place(i: number, x: number, z: number, yaw: number, level: CrowdLevel, y = 0): void {
    this.lift[i] = y;
    this.spot[i * 3] = x;
    this.spot[i * 3 + 1] = z;
    this.spot[i * 3 + 2] = yaw;
    const want = level === 0 ? -1 : (this.female[i] ? 2 : 0) + (level - 1);
    if (want !== this.want[i]) {
      this.want[i] = want;
      this.dirty = true;
    }
  }

  /** Call once a frame, after placing everybody. Packs the people at each level to the front of its mesh so nothing hidden is drawn. */
  update(dt: number): void {
    this.time.value += dt;
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < this.capacity; i++) {
      const k = this.want[i]!;
      if (k >= 0) this.slots[k]![counts[k]!++] = i;
    }
    this.meshes.forEach((mesh, k) => {
      const slots = this.slots[k]!;
      const n = counts[k]!;
      if (this.dirty) {
        const geo = mesh.geometry;
        for (const [key, src, w] of [["aA", this.data.a, 4], ["aB", this.data.b, 4], ["aC", this.data.c, 4], ["aD", this.data.d, 4], ["aE", this.data.e, 4], ["aSpeed", this.speed, 1]] as const) {
          const dst = geo.getAttribute(key) as THREE.InstancedBufferAttribute;
          for (let j = 0; j < n; j++) for (let c = 0; c < w; c++) dst.array[j * w + c] = src[slots[j]! * w + c]!;
          dst.needsUpdate = true;
        }
      }
      for (let j = 0; j < n; j++) {
        const i = slots[j]!;
        this.q.setFromAxisAngle(this.axis, this.spot[i * 3 + 2]!);
        this.pos.set(this.spot[i * 3]!, this.lift[i]!, this.spot[i * 3 + 1]!);
        this.m.compose(this.pos, this.q, this.one);
        mesh.setMatrixAt(j, this.m);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    });
    this.dirty = false;
  }

  /** Triangles being drawn right now (for the budget readout). */
  drawnTriangles(): number {
    return this.meshes.reduce((t, m, k) => t + m.count * this.lods[k]!.count, 0);
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const m of this.meshes) m.dispose();
    for (const l of this.lods) l.geometry.dispose();
    for (const m of this.mats) m.dispose();
  }
}
