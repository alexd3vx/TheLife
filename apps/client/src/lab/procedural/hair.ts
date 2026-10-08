import * as THREE from "three";
import { HAIR_STYLES } from "../../iso/wardrobe";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRng, type Rng } from "../../world3d/rng";
import { jointPos, type BodyRest } from "./bodyRest";
import { clipField, extractTriangles } from "./geometryClip";

export interface HairChoice {
  id: string;
  label: string;
}

export const PROC_HAIR: HairChoice[] = HAIR_STYLES;

export interface HairResult {
  /** Geometry in the head bone's local space; attach the mesh to the head bone. */
  geometry: THREE.BufferGeometry;
  texture: "coils" | "strand" | "wrap";
  repeat: [number, number];
}

export interface Head {
  c: THREE.Vector3; // cranium centre
  rx: number;
  ry: number;
  rz: number;
  /** The body the hair grows on, so a cap can follow the real scalp (the true surface, not an ellipsoid). */
  rest?: BodyRest;
  /** Height of the neck joint: below it hair has to clear the shoulders. */
  neckY?: number;
  /** The skin surface seen from the cranium centre: how far along the ray for azimuth u (0 = straight ahead) and elevation v (0 = equator, pi/2 = crown). */
  k?: Float32Array;
}

const SURF_U = 72;
const SURF_V = 26;
const SURF_V0 = -0.55;

const headCache = new WeakMap<BodyRest, Head>();

/** The cranium's size and position, measured from the body's own head vertices. The same body is measured once (it is the slow part of every hairstyle). */
export function measureHead(rest: BodyRest): Head {
  let head = headCache.get(rest);
  if (!head) {
    head = measureHeadNow(rest);
    headCache.set(rest, head);
  }
  return head;
}

function measureHeadNow(rest: BodyRest): Head {
  const headIndex = rest.boneIndex.get("Head");
  const neckY = jointPos(rest, "neck_01").y;
  const pos = rest.geometry.getAttribute("position");
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    if (rest.vertexBone[i] !== headIndex) continue;
    p.fromBufferAttribute(pos, i);
    if (p.y < neckY + 0.02) continue;
    min.min(p);
    max.max(p);
  }
  const centre = min.clone().add(max).multiplyScalar(0.5);
  const half = max.clone().sub(min).multiplyScalar(0.5);
  // Lift the sphere's centre: the head box includes the jaw, the cranium is the upper part.
  centre.y += half.y * 0.12;
  const head: Head = { c: centre, rx: half.x, ry: half.y * 0.92, rz: half.z, rest, neckY };
  head.k = measureSurface(head, rest);
  return head;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Merges hair parts into one mesh: every part gets a colour attribute (white, opaque) so the ones that carry shading can sit with the ones that do not. */
function mergeHair(parts: THREE.BufferGeometry[], useGroups = false): THREE.BufferGeometry | null {
  for (const g of parts) {
    if (!g.getAttribute("color")) {
      const n = g.getAttribute("position").count;
      g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(n * 4).fill(1), 4));
    }
  }
  return mergeGeometries(parts, useGroups);
}
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/** The direction (not normalised) from the cranium centre for azimuth u and elevation v: an ellipsoid's radius vector. */
function ray(h: Head, u: number, v: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(Math.sin(u) * Math.cos(v) * h.rx, Math.sin(v) * h.ry, Math.cos(u) * Math.cos(v) * h.rz);
}

/** Casts a grid of rays from the cranium centre at the head's skin; k = hit distance relative to the ellipsoid radius. */
function measureSurface(h: Head, rest: BodyRest): Float32Array {
  const headIndex = rest.boneIndex.get("Head");
  const neckIndex = rest.boneIndex.get("neck_01");
  const pos = rest.geometry.getAttribute("position");
  const index = rest.geometry.index!;
  const tris: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const limit = h.c.y - h.ry * 1.3;
  for (let i = 0; i < index.count; i += 3) {
    const i0 = index.getX(i), i1 = index.getX(i + 1), i2 = index.getX(i + 2);
    const bone = rest.vertexBone[i0];
    if (bone !== headIndex && bone !== neckIndex) continue;
    if (pos.getY(i0) < limit) continue;
    tris.push(i0, i1, i2);
  }
  // bucket the triangles by the direction of their centre, so each ray only tests the ones near it
  const BU = 24, BV = 12;
  const buckets: number[][] = Array.from({ length: BU * BV }, () => []);
  const cell = (d: THREE.Vector3) => {
    const u = Math.atan2(d.x / h.rx, d.z / h.rz);
    const v = Math.atan2(d.y / h.ry, Math.hypot(d.x / h.rx, d.z / h.rz));
    const iu = Math.min(BU - 1, Math.max(0, Math.floor(((u + Math.PI) / (Math.PI * 2)) * BU)));
    const iv = Math.min(BV - 1, Math.max(0, Math.floor(((v + Math.PI / 2) / Math.PI) * BV)));
    return [iu, iv] as const;
  };
  const centroid = new THREE.Vector3();
  for (let t = 0; t < tris.length; t += 3) {
    a.fromBufferAttribute(pos, tris[t]!);
    b.fromBufferAttribute(pos, tris[t + 1]!);
    c.fromBufferAttribute(pos, tris[t + 2]!);
    centroid.copy(a).add(b).add(c).divideScalar(3).sub(h.c);
    const [iu, iv] = cell(centroid);
    buckets[iv * BU + iu]!.push(t);
  }
  const out = new Float32Array((SURF_U + 1) * (SURF_V + 1));
  const d = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), pv = new THREE.Vector3(), tv = new THREE.Vector3(), qv = new THREE.Vector3();
  for (let j = 0; j <= SURF_V; j++) {
    const v = SURF_V0 + ((Math.PI / 2 - SURF_V0) * j) / SURF_V;
    for (let i = 0; i <= SURF_U; i++) {
      const u = (i / SURF_U) * Math.PI * 2 - Math.PI;
      ray(h, u, v, d);
      const len = d.length();
      d.divideScalar(len);
      const [cu, cv] = cell(d.clone().multiplyScalar(len));
      let best = Infinity;
      for (let du = -1; du <= 1; du++) {
        const iu = (cu + du + BU) % BU;
        for (let dv = -1; dv <= 1; dv++) {
          const iv = cv + dv;
          if (iv < 0 || iv >= BV) continue;
          for (const t of buckets[iv * BU + iu]!) {
            a.fromBufferAttribute(pos, tris[t]!);
            b.fromBufferAttribute(pos, tris[t + 1]!);
            c.fromBufferAttribute(pos, tris[t + 2]!);
            e1.subVectors(b, a);
            e2.subVectors(c, a);
            pv.crossVectors(d, e2);
            const det = e1.dot(pv);
            if (Math.abs(det) < 1e-12) continue;
            tv.subVectors(h.c, a);
            const uu = tv.dot(pv) / det;
            if (uu < 0 || uu > 1) continue;
            qv.crossVectors(tv, e1);
            const vv = d.dot(qv) / det;
            if (vv < 0 || uu + vv > 1) continue;
            const tt = e2.dot(qv) / det;
            if (tt > 0 && tt < best) best = tt;
          }
        }
      }
      out[j * (SURF_U + 1) + i] = Number.isFinite(best) ? best / len : 1;
    }
  }
  return out;
}

/** The skin surface point for azimuth u and elevation v (bilinear in the measured grid). */
function surface(h: Head, u: number, v: number): THREE.Vector3 {
  const r = ray(h, u, v);
  if (!h.k) return h.c.clone().add(r);
  const fu = (((u + Math.PI) / (Math.PI * 2)) % 1 + 1) % 1 * SURF_U;
  const fv = clamp01((v - SURF_V0) / (Math.PI / 2 - SURF_V0)) * SURF_V;
  const i0 = Math.min(SURF_U - 1, Math.floor(fu)), j0 = Math.min(SURF_V - 1, Math.floor(fv));
  const tu = fu - i0, tv = fv - j0;
  const at = (i: number, j: number) => h.k![j * (SURF_U + 1) + i]!;
  const k = (at(i0, j0) * (1 - tu) + at(i0 + 1, j0) * tu) * (1 - tv) + (at(i0, j0 + 1) * (1 - tu) + at(i0 + 1, j0 + 1) * tu) * tv;
  return r.multiplyScalar(k).add(h.c);
}

/** Point on the scalp, scaled about the cranium centre (scale 1 = on the skin). u = azimuth (0 = straight ahead), v = elevation (0 = equator, pi/2 = crown). */
function scalp(h: Head, u: number, v: number, scale: [number, number, number] = [1, 1, 1]): THREE.Vector3 {
  const s = surface(h, u, v).sub(h.c);
  return new THREE.Vector3(h.c.x + s.x * scale[0], h.c.y + s.y * scale[1], h.c.z + s.z * scale[2]);
}

interface CapOptions {
  scale: [number, number, number];
  front: number; // lowest elevation at the hairline (forehead)
  side: number; // ...above the ears
  back: number; // ...at the nape
  bump: number; // surface roughness (metres)
  lift?: number; // move the whole cap up
  uRepeat?: number;
  /** Layers of shells between the skin and the outer surface (1 = a single thin cap; more = fluffy volume). */
  shells?: number;
  /** How far from the hairline (radians of elevation) the cap grows to its full thickness. */
  taper?: number;
  /** Fade the hair out across this many radians above the hairline (0 = a clean cut). */
  soft?: number;
  /** 0 follows the skull's shape outward; 1 rounds the outer shell into a smooth ellipsoid (an afro is round, not a thickened skull). */
  round?: number;
}

/** Where the hairline sits for an azimuth: front at the forehead, side above the ears, back at the nape. */
function hairlineAt(o: CapOptions, u: number): number {
  const c = Math.cos(u);
  return c >= 0 ? o.side + (o.front - o.side) * smooth(Math.pow(c, 2.5)) : o.side + (o.back - o.side) * smooth(-c);
}

/** A hair mass growing on the real scalp: the body's own head triangles above a hairline, thickened outward. */
export function cap(h: Head, o: CapOptions): THREE.BufferGeometry {
  const rest = h.rest;
  const headIndex = rest?.boneIndex.get("Head");
  const neckIndex = rest?.boneIndex.get("neck_01");
  if (!rest || headIndex === undefined) return capFallback(h, o);
  const shellsN = Math.max(1, o.shells ?? 1);
  const taper = o.taper ?? (Math.max(...o.scale) > 1.15 ? 0.45 : 0.06);
  const polar = (p: [number, number, number]) => {
    const x = p[0] - h.c.x, y = p[1] - h.c.y, z = p[2] - h.c.z;
    const horizontal = Math.hypot(x / h.rx, z / h.rz);
    return { u: Math.atan2(x / h.rx, z / h.rz), v: Math.atan2(y / h.ry, horizontal) };
  };
  const field = (p: [number, number, number]) => {
    const { u, v } = polar(p);
    return v - hairlineAt(o, u);
  };
  const tris0 = extractTriangles(rest.geometry, (i) => (rest.vertexBone[i] === headIndex || rest.vertexBone[i] === neckIndex) && rest.geometry.getAttribute("position").getY(i) > h.c.y - h.ry * 0.9);
  const tris = clipField(tris0, field);
  const parts: THREE.BufferGeometry[] = [];
  for (let s = 0; s < shellsN; s++) {
    const amount = (s + 1) / shellsN;
    const position: number[] = [], normal: number[] = [], uv: number[] = [], color: number[] = [];
    const n = new THREE.Vector3(), r = new THREE.Vector3();
    for (const tri of tris) {
      for (const vert of tri) {
        const p = vert.p;
        const f = field(p);
        const w = smooth(clamp01(f / taper));
        const { u, v } = polar(p);
        r.set(p[0] - h.c.x, p[1] - h.c.y, p[2] - h.c.z);
        const out = new THREE.Vector3(
          h.c.x + r.x * (1 + (o.scale[0] - 1) * amount * w),
          h.c.y + r.y * (1 + (o.scale[1] - 1) * amount * w) + (o.lift ?? 0) * amount * w,
          h.c.z + r.z * (1 + (o.scale[2] - 1) * amount * w),
        );
        if (o.round) {
          // blend toward the smooth ellipsoid through the same direction, as far as this shell and this height allow
          const dx = r.x / h.rx, dy = r.y / h.ry, dz = r.z / h.rz;
          const dl = Math.hypot(dx, dy, dz) || 1;
          const e = new THREE.Vector3(h.c.x + (dx / dl) * h.rx * o.scale[0], h.c.y + (dy / dl) * h.ry * o.scale[1] + (o.lift ?? 0), h.c.z + (dz / dl) * h.rz * o.scale[2]);
          out.lerp(e, o.round * amount * w);
        }
        const bump = Math.sin(u * 23 + v * 17) * Math.sin(u * 11 - v * 29) * o.bump * amount;
        out.addScaledVector(r.normalize(), bump);
        position.push(out.x, out.y, out.z);
        // volume reads best with a smooth dome normal; a close-cropped cut follows the skin
        n.set(...vert.n).lerp(r, Math.min(1, (Math.max(...o.scale) - 1) * 4)).normalize();
        normal.push(n.x, n.y, n.z);
        uv.push((u / (Math.PI * 2)) * (o.uRepeat ?? 6) + s * 0.37, (v / (Math.PI / 2)) * 3 + s * 0.21);
        const a = o.soft ? smooth(clamp01(f / o.soft)) : 1;
        // roots and the sides of a big mass sit in shade: a little darker near the skin and low on the head
        const shade = 0.72 + 0.28 * amount;
        color.push(shade, shade, shade, a);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(color, 4));
    parts.push(mergeVertices(g, 1e-5));
  }
  return mergeHair(parts, false) ?? parts[0]!;
}

/** The old smooth ellipsoid cap, if the body can't be read. */
function capFallback(h: Head, o: CapOptions): THREE.BufferGeometry {
  const nu = 64;
  const nv = 20;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= nu; i++) {
    const u = (i / nu) * Math.PI * 2 - Math.PI;
    const vMin = hairlineAt(o, u);
    for (let j = 0; j <= nv; j++) {
      const v = vMin + (Math.PI / 2 - vMin) * (j / nv);
      const p = scalp(h, u, v, o.scale);
      p.y += o.lift ?? 0;
      positions.push(p.x, p.y, p.z);
      uvs.push((i / nu) * (o.uRepeat ?? 6), j / nv * 3);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j;
      const b = a + nv + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export function tube(points: THREE.Vector3[], radius: number, radial: number, segments: number, uvLength: number, tip = 1): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.4);
  if (tip === 1) {
    const g = new THREE.TubeGeometry(curve, segments, radius, radial, false);
    const uv = g.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * uvLength);
    return g;
  }
  // a tube that narrows to `tip` times its radius at the far end (hair ends are finer than the roots)
  const frames = curve.computeFrenetFrames(segments, false);
  const position: number[] = [], normal: number[] = [], uv: number[] = [], index: number[] = [];
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, p);
    const r = radius * (1 - t * (1 - tip));
    const nr = frames.normals[i]!, bn = frames.binormals[i]!;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      n.set(0, 0, 0).addScaledVector(nr, Math.cos(a)).addScaledVector(bn, Math.sin(a)).normalize();
      position.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      normal.push(n.x, n.y, n.z);
      uv.push(t * uvLength, j / radial);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

export function sphere(centre: THREE.Vector3, r: [number, number, number], bump = 0): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 32, 20);
  const pos = g.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 1 + Math.sin(x * 19 + z * 7) * Math.sin(y * 23 - x * 5) * bump;
    pos.setXYZ(i, centre.x + x * r[0] * k, centre.y + y * r[1] * k, centre.z + z * r[2] * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A ball of hair (a puff, a bun, a knot): a few nested shells with different UV offsets, so the gaps in the coil texture do not line up. */
function fuzz(centre: THREE.Vector3, r: [number, number, number], bump = 0.06, shells = 3): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < shells; i++) {
    const k = 0.78 + (0.22 * i) / Math.max(1, shells - 1);
    const g = sphere(centre, [r[0] * k, r[1] * k, r[2] * k], bump);
    const uv = g.getAttribute("uv");
    for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j) * 3 + i * 0.37, uv.getY(j) * 3 + i * 0.21);
    const shade = 0.7 + 0.3 * (i / Math.max(1, shells - 1));
    g.setAttribute("color", new THREE.Float32BufferAttribute(new Array(g.getAttribute("position").count).fill(0).flatMap(() => [shade, shade, shade, 1]), 4));
    parts.push(g);
  }
  return mergeHair(parts, false) ?? parts[0]!;
}

/** A bundle of strands gathered at a tie point and hanging (ponytail, durag tails). */
function bundle(root: THREE.Vector3, rng: Rng, o: { count: number; length: number; radius: number; spread: number; sway: number; tip?: number }): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < o.count; i++) {
    const a = rng.range(0, Math.PI * 2), d = o.spread * Math.sqrt(rng.range(0, 1));
    const ox = Math.cos(a) * d, oz = Math.sin(a) * d;
    const len = o.length * rng.range(0.85, 1.05);
    const points: THREE.Vector3[] = [];
    for (let s = 0; s <= 8; s++) {
      const t = s / 8;
      points.push(new THREE.Vector3(root.x + ox * (0.4 + t * 1.6) + Math.sin(t * 5 + a) * 0.004 * o.sway, root.y - t * len, root.z - 0.015 - t * 0.05 + oz * (0.4 + t * 1.2)));
    }
    parts.push(tube(points, o.radius, 4, 14, 3, o.tip ?? 0.35));
  }
  return mergeHair(parts, false) ?? new THREE.BufferGeometry();
}

/**
 * Strands (box braids, locs, bobs, long hair): roots spread evenly over the scalp (clear of the face), each lying on the head down to the
 * ear line and then hanging, fanning out below the neck so it falls over the shoulders instead of through them. Ends are finer than roots
 * and lengths vary a little.
 */
function strands(h: Head, rng: Rng, o: { count: number; length: number; radius: number; wave: number; spread: number; radial: number; tip?: number; front?: boolean }): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const neckY = h.neckY ?? h.c.y - h.ry * 1.4;
  const rows = Math.max(3, Math.round(Math.sqrt(o.count / 1.6)));
  const uMin = o.front ? 0.35 : 1.0;
  for (let r = 0; r < rows; r++) {
    const v0 = 0.12 + (1.28 * (r + rng.range(0.2, 0.8))) / rows;
    // strands in a row: more where the head is wider
    const perSide = Math.max(2, Math.round((o.count / rows / 2) * (0.6 + Math.cos(v0) * 0.6)));
    for (let side = -1; side <= 1; side += 2) {
      for (let k = 0; k < perSide; k++) {
        const u = side * (uMin + ((Math.PI - uMin) * (k + rng.range(0.15, 0.85))) / perSide);
        const phase = rng.range(0, Math.PI * 2);
        const length = o.length * rng.range(0.82, 1.12);
        const along = h.ry * v0 * 1.05; // length lying on the scalp
        const points: THREE.Vector3[] = [];
        const steps = 10;
        const equator = scalp(h, u, 0, [1.05 + 0.012 * o.spread, 1, 1.05 + 0.012 * o.spread]);
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const travelled = t * length;
          if (travelled <= along) {
            const v = v0 * (1 - travelled / along);
            points.push(scalp(h, u, v, [1.03 + 0.008 * o.spread, 1.03, 1.03 + 0.008 * o.spread]));
          } else {
            const rest = travelled - along;
            const p = equator.clone();
            p.y -= rest;
            const flare = Math.min(1, rest / 0.12) * 0.012 * o.spread;
            p.x += Math.sign(Math.sin(u)) * flare + Math.sin(rest * 24 + phase) * 0.003 * o.wave;
            p.z += Math.cos(rest * 21 + phase) * 0.003 * o.wave - Math.cos(u) * 0.002;
            // below the neck the hair fans outward, over the shoulders and down the back
            const below = Math.max(0, neckY - p.y);
            if (below > 0) {
              const dx = p.x - h.c.x, dz = p.z - h.c.z;
              const dl = Math.hypot(dx, dz) || 1;
              p.x += (dx / dl) * below * 0.5;
              p.z += (dz / dl) * below * 0.5 - below * 0.1;
            }
            points.push(p);
          }
        }
        parts.push(tube(points, o.radius * rng.range(0.9, 1.15), o.radial, 22, o.length * 6, o.tip ?? 0.4));
      }
    }
  }
  return mergeHair(parts, false) ?? new THREE.BufferGeometry();
}

/** Parallel rows lying on the scalp from the hairline to the nape. */
function cornrows(h: Head, rng: Rng): THREE.BufferGeometry {
  const rows = 9;
  const parts: THREE.BufferGeometry[] = [];
  for (let r = 0; r < rows; r++) {
    const lat = -0.82 + (1.64 * r) / (rows - 1) + rng.range(-0.02, 0.02);
    const points: THREE.Vector3[] = [];
    for (let k = 0; k <= 14; k++) {
      const t = k / 14;
      const theta = 0.95 + t * (Math.PI + 0.1 - 0.95);
      const wob = Math.sin(t * 9 + r) * 0.02;
      const shrink = Math.sqrt(Math.max(0.05, 1 - lat * lat));
      points.push(
        new THREE.Vector3(
          h.c.x + (lat + wob) * h.rx * 1.05,
          h.c.y + Math.sin(theta) * h.ry * shrink * 1.045,
          h.c.z + Math.cos(theta) * h.rz * shrink * 1.045,
        ),
      );
    }
    parts.push(tube(points, 0.0085, 5, 28, 14));
  }
  return mergeHair(parts, false) ?? new THREE.BufferGeometry();
}

/** A cloth surface hanging from the head and fanning out over the shoulders (a hijab's drape). Open at the front, over the face. */
function drape(h: Head, o: { u0: number; u1: number; vTop: number; drop: number; flare: number; fold: number }): THREE.BufferGeometry {
  const nu = 56, nv = 14;
  const position: number[] = [], uv: number[] = [], index: number[] = [];
  for (let i = 0; i <= nu; i++) {
    const u = o.u0 + ((o.u1 - o.u0) * i) / nu;
    const top = scalp(h, u, o.vTop, [1.06, 1.06, 1.06]);
    const dx = top.x - h.c.x, dz = top.z - h.c.z;
    for (let j = 0; j <= nv; j++) {
      const t = j / nv;
      const f = 1 + o.flare * Math.pow(t, 1.25);
      const fold = Math.sin(u * 13 + t * 3) * o.fold * t;
      position.push(h.c.x + dx * (f + fold), top.y - t * o.drop, h.c.z + dz * (f + fold) - t * 0.03);
      uv.push((i / nu) * 4, t * 2);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + nv + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** An ellipsoid turned about the forward axis (a lobe of a gele's fan). */
function lobe(centre: THREE.Vector3, r: [number, number, number], roll: number, bump = 0.05): THREE.BufferGeometry {
  const g = sphere(new THREE.Vector3(), r, bump);
  g.applyMatrix4(new THREE.Matrix4().makeRotationZ(roll));
  g.translate(centre.x, centre.y, centre.z);
  g.computeVertexNormals();
  return g;
}

/** A gele: wrapped cloth over the head, a rolled band across the forehead, and a big fan of folded lobes tilted to one side on top. */
function headWrap(h: Head): THREE.BufferGeometry {
  const base = cap(h, { scale: [1.075, 1.07, 1.075], front: 0.62, side: 0.0, back: -0.3, bump: 0.0015, uRepeat: 3, taper: 0.1 });
  const parts: THREE.BufferGeometry[] = [base];
  // the rolled band, tilted: higher at the front-right, lower at the back-left
  const band: THREE.Vector3[] = [];
  for (let k = 0; k <= 36; k++) {
    const u = (k / 36) * Math.PI * 2;
    band.push(scalp(h, u, 0.5 + 0.12 * Math.cos(u - 0.6), [1.09, 1.08, 1.09]));
  }
  parts.push(tube(band, 0.017, 8, 72, 4));
  const fanC = new THREE.Vector3(h.c.x + h.rx * 0.22, h.c.y + h.ry * 0.95, h.c.z + h.rz * 0.02);
  // five broad folded lobes fanning up and out, tipped toward the right
  for (let i = 0; i < 5; i++) {
    const a = -1.15 + i * 0.5;
    const len = h.ry * (0.8 - 0.12 * Math.abs(i - 2));
    const c = new THREE.Vector3(fanC.x + Math.sin(a) * len * 0.62 + h.rx * 0.15, fanC.y + Math.cos(a) * len * 0.5, fanC.z);
    parts.push(lobe(c, [h.rx * 0.34, len * 0.48, h.rz * 0.34], -a, 0.045));
  }
  parts.push(lobe(new THREE.Vector3(fanC.x + h.rx * 0.2, fanC.y + h.ry * 0.05, fanC.z), [h.rx * 0.62, h.ry * 0.3, h.rz * 0.52], 0.15, 0.04));
  return mergeHair(parts, false) ?? base;
}

export function buildHair(rest: BodyRest, id: string, seed = 5): HairResult | null {
  const h = measureHead(rest);
  const rng = createRng(seed);
  let geometry: THREE.BufferGeometry;
  let texture: HairResult["texture"] = "coils";
  let repeat: [number, number] = [2, 2];

  switch (id) {
    case "p_fade":
      geometry = cap(h, { scale: [1.04, 1.1, 1.05], front: 0.82, side: 0.5, back: 0.12, bump: 0.0012, soft: 0.2 });
      break;
    case "p_afro":
      geometry = cap(h, { scale: [1.36, 1.3, 1.36], front: 0.8, side: 0.15, back: -0.35, bump: 0.008, lift: h.ry * 0.06, shells: 6, taper: 0.7, soft: 0.1, round: 0.85 });
      break;
    case "p_puffs": {
      const base = cap(h, { scale: [1.04, 1.08, 1.05], front: 0.8, side: 0.4, back: 0.1, bump: 0.001, soft: 0.12 });
      const puffA = fuzz(new THREE.Vector3(h.c.x + h.rx * 0.72, h.c.y + h.ry * 1.02, h.c.z - h.rz * 0.1), [h.rx * 0.6, h.ry * 0.58, h.rz * 0.6], 0.1, 4);
      const puffB = fuzz(new THREE.Vector3(h.c.x - h.rx * 0.72, h.c.y + h.ry * 1.02, h.c.z - h.rz * 0.1), [h.rx * 0.6, h.ry * 0.58, h.rz * 0.6], 0.1, 4);
      geometry = mergeHair([base, puffA, puffB], false) ?? base;
      break;
    }
    case "p_cornrows": {
      const under = cap(h, { scale: [1.025, 1.04, 1.03], front: 0.82, side: 0.4, back: 0.05, bump: 0 });
      geometry = mergeHair([under, cornrows(h, rng)], false) ?? under;
      texture = "strand";
      repeat = [1, 1];
      break;
    }
    case "p_braids": {
      const under = cap(h, { scale: [1.03, 1.05, 1.04], front: 0.85, side: 0.3, back: -0.1, bump: 0 });
      const braids = strands(h, rng, { count: 120, length: 0.4, radius: 0.0068, wave: 0.15, spread: 1, radial: 5, tip: 0.55 });
      geometry = mergeHair([under, braids], false) ?? under;
      texture = "strand";
      repeat = [1, 1];
      break;
    }
    case "p_locs": {
      const under = cap(h, { scale: [1.03, 1.05, 1.04], front: 0.85, side: 0.3, back: -0.1, bump: 0 });
      const locs = strands(h, rng, { count: 80, length: 0.32, radius: 0.0105, wave: 0.5, spread: 1.2, radial: 6, tip: 0.75 });
      geometry = mergeHair([under, locs], false) ?? under;
      texture = "strand";
      repeat = [1, 1];
      break;
    }
    case "p_bun": {
      const base = cap(h, { scale: [1.04, 1.08, 1.05], front: 0.82, side: 0.4, back: 0.05, bump: 0.001, soft: 0.12 });
      const bun = fuzz(new THREE.Vector3(h.c.x, h.c.y + h.ry * 1.16, h.c.z - h.rz * 0.22), [h.rx * 0.5, h.ry * 0.42, h.rz * 0.5], 0.08, 4);
      geometry = mergeHair([base, bun], false) ?? base;
      break;
    }
    case "p_buzz":
      geometry = cap(h, { scale: [1.02, 1.04, 1.03], front: 0.9, side: 0.55, back: 0.2, bump: 0.0006, soft: 0.1 });
      break;
    case "p_taper":
      geometry = cap(h, { scale: [1.06, 1.18, 1.07], front: 0.8, side: 0.62, back: 0.3, bump: 0.002, lift: h.ry * 0.04, soft: 0.14, shells: 2 });
      break;
    case "p_waves":
      geometry = cap(h, { scale: [1.035, 1.06, 1.04], front: 0.84, side: 0.5, back: 0.15, bump: 0.003, uRepeat: 14 });
      texture = "strand";
      repeat = [1, 1];
      break;
    case "p_twists": {
      const under = cap(h, { scale: [1.04, 1.06, 1.05], front: 0.8, side: 0.35, back: 0.0, bump: 0.002 });
      const tw = strands(h, rng, { count: 160, length: 0.13, radius: 0.0085, wave: 1.6, spread: 1.4, radial: 5, tip: 0.6 });
      geometry = mergeHair([under, tw], false) ?? under;
      break;
    }
    case "p_shortlocs": {
      const under = cap(h, { scale: [1.03, 1.05, 1.04], front: 0.86, side: 0.4, back: 0.0, bump: 0 });
      const locs = strands(h, rng, { count: 120, length: 0.15, radius: 0.0095, wave: 0.6, spread: 1.1, radial: 6, tip: 0.8 });
      geometry = mergeHair([under, locs], false) ?? under;
      texture = "strand";
      repeat = [1, 1];
      break;
    }
    case "p_bantu": {
      const base = cap(h, { scale: [1.025, 1.04, 1.03], front: 0.84, side: 0.45, back: 0.05, bump: 0.0005 });
      const knots: THREE.BufferGeometry[] = [base];
      for (let i = 0; i < 11; i++) {
        const u = (i / 11) * Math.PI * 2;
        const v = 0.78 + (i % 2) * 0.28;
        const p = scalp(h, u, v, [1.08, 1.08, 1.08]);
        knots.push(fuzz(p, [h.rx * 0.2, h.ry * 0.2, h.rz * 0.2], 0.05, 3));
      }
      geometry = mergeHair(knots, false) ?? base;
      break;
    }
    case "p_pony": {
      const base = cap(h, { scale: [1.04, 1.08, 1.05], front: 0.82, side: 0.4, back: 0.05, bump: 0.001, soft: 0.12 });
      const root = scalp(h, Math.PI, 0.5, [1.05, 1.05, 1.05]);
      const tail = bundle(root, rng, { count: 70, length: 0.3, radius: 0.0075, spread: 0.028, sway: 1 });
      const tie = tube([root.clone().add(new THREE.Vector3(0, 0.01, 0.004)), root.clone().add(new THREE.Vector3(0, -0.012, -0.012))], 0.03, 8, 2, 1);
      geometry = mergeHair([base, tail, tie], false) ?? base;
      texture = "strand";
      repeat = [1, 1];
      break;
    }
    case "p_bob": {
      const under = cap(h, { scale: [1.05, 1.08, 1.06], front: 0.8, side: 0.15, back: -0.2, bump: 0.001 });
      const curtain = strands(h, rng, { count: 190, length: 0.2, radius: 0.0075, wave: 0.05, spread: 1.6, radial: 4, tip: 0.3 });
      geometry = mergeHair([under, curtain], false) ?? under;
      texture = "strand";
      repeat = [1, 1];
      break;
    }
    case "p_long": {
      const under = cap(h, { scale: [1.05, 1.08, 1.06], front: 0.8, side: 0.1, back: -0.25, bump: 0.001 });
      const long = strands(h, rng, { count: 220, length: 0.46, radius: 0.0075, wave: 0.08, spread: 1.7, radial: 4, tip: 0.25 });
      geometry = mergeHair([under, long], false) ?? under;
      texture = "strand";
      repeat = [1, 1];
      break;
    }
    case "p_durag": {
      const base = cap(h, { scale: [1.05, 1.07, 1.06], front: 0.74, side: 0.2, back: -0.05, bump: 0.0008, uRepeat: 3, taper: 0.08 });
      const knot = scalp(h, Math.PI, 0.3, [1.07, 1.07, 1.07]);
      const tails = [-0.018, 0.018].map((dx) => tube([knot, new THREE.Vector3(knot.x + dx, knot.y - 0.07, knot.z - 0.025), new THREE.Vector3(knot.x + dx * 2, knot.y - 0.17, knot.z - 0.03), new THREE.Vector3(knot.x + dx * 2.6, knot.y - 0.28, knot.z - 0.028)], 0.016, 6, 16, 3, 0.7));
      geometry = mergeHair([base, ...tails, fuzz(knot, [0.026, 0.02, 0.026], 0.03, 2)], false) ?? base;
      texture = "wrap";
      repeat = [1, 1];
      break;
    }
    case "p_hijab": {
      const hood = cap(h, { scale: [1.07, 1.07, 1.075], front: 0.32, side: -0.25, back: -0.55, bump: 0.0012, uRepeat: 3, taper: 0.1 });
      const cloth = drape(h, { u0: 0.7, u1: Math.PI * 2 - 0.7, vTop: -0.5, drop: 0.24, flare: 0.8, fold: 0.04 });
      const chin = drape(h, { u0: -0.75, u1: 0.75, vTop: -0.55, drop: 0.12, flare: 0.25, fold: 0.02 });
      // the front of the cloth: a soft fold across the forehead and under the chin is part of the hood; a rolled edge hides the seam
      const edge: THREE.Vector3[] = [];
      for (let k = 0; k <= 30; k++) {
        const u = -1.0 + (2 * k * 1.0) / 30;
        edge.push(scalp(h, u, 0.46 - 0.2 * Math.abs(Math.sin(u)), [1.09, 1.09, 1.09]));
      }
      geometry = mergeHair([hood, cloth, chin, tube(edge, 0.006, 5, 40, 3)], false) ?? hood;
      texture = "wrap";
      repeat = [1, 1];
      break;
    }
    case "p_wrap":
      geometry = headWrap(h);
      texture = "wrap";
      repeat = [1, 1];
      break;
    default:
      return null;
  }

  const toHead = rest.toBoneSpace("Head");
  if (!toHead) return null;
  geometry.applyMatrix4(toHead);
  geometry.computeVertexNormals();
  return { geometry, texture, repeat };
}
