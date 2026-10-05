import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRng, type Rng } from "../../world3d/rng";
import { jointPos, type BodyRest } from "./bodyRest";

export interface HairChoice {
  id: string;
  label: string;
}

export const PROC_HAIR: HairChoice[] = [
  { id: "p_fade", label: "Low fade" },
  { id: "p_afro", label: "Afro" },
  { id: "p_puffs", label: "Afro puffs" },
  { id: "p_cornrows", label: "Cornrows" },
  { id: "p_braids", label: "Box braids" },
  { id: "p_locs", label: "Locs" },
  { id: "p_bun", label: "Top bun" },
  { id: "p_wrap", label: "Head wrap" },
];

export interface HairResult {
  /** Geometry in the head bone's local space; attach the mesh to the head bone. */
  geometry: THREE.BufferGeometry;
  texture: "coils" | "strand" | "wrap";
  repeat: [number, number];
}

interface Head {
  c: THREE.Vector3; // cranium centre
  rx: number;
  ry: number;
  rz: number;
}

/** The cranium's size and position, measured from the body's own head vertices. */
function measureHead(rest: BodyRest): Head {
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
  return { c: centre, rx: half.x, ry: half.y * 0.92, rz: half.z };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Point on the scalp ellipsoid. u = azimuth (0 = straight ahead), v = elevation (0 = equator, pi/2 = crown). */
function scalp(h: Head, u: number, v: number, scale: [number, number, number] = [1, 1, 1]): THREE.Vector3 {
  return new THREE.Vector3(
    h.c.x + Math.sin(u) * Math.cos(v) * h.rx * scale[0],
    h.c.y + Math.sin(v) * h.ry * scale[1],
    h.c.z + Math.cos(u) * Math.cos(v) * h.rz * scale[2],
  );
}

interface CapOptions {
  scale: [number, number, number];
  front: number; // lowest elevation at the hairline (forehead)
  side: number; // ...above the ears
  back: number; // ...at the nape
  bump: number; // surface roughness (metres)
  lift?: number; // move the whole cap up
  uRepeat?: number;
}

/** A hair mass covering the cranium, with a cut-out for the face and ears. */
function cap(h: Head, o: CapOptions): THREE.BufferGeometry {
  const nu = 64;
  const nv = 20;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= nu; i++) {
    const u = (i / nu) * Math.PI * 2 - Math.PI;
    const c = Math.cos(u);
    const vMin = c >= 0 ? o.side + (o.front - o.side) * smooth(Math.pow(c, 2.5)) : o.side + (o.back - o.side) * smooth(-c);
    for (let j = 0; j <= nv; j++) {
      const v = vMin + (Math.PI / 2 - vMin) * (j / nv);
      const p = scalp(h, u, v, o.scale);
      const bump = Math.sin(u * 23 + v * 17) * Math.sin(u * 11 - v * 29) * o.bump;
      const radial = p.clone().sub(h.c).normalize();
      p.addScaledVector(radial, bump);
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

function tube(points: THREE.Vector3[], radius: number, radial: number, segments: number, uvLength: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.4);
  const g = new THREE.TubeGeometry(curve, segments, radius, radial, false);
  const uv = g.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * uvLength);
  return g;
}

function sphere(centre: THREE.Vector3, r: [number, number, number], bump = 0): THREE.BufferGeometry {
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

/** Strands hanging from random scalp points (box braids, locs). */
function strands(h: Head, rng: Rng, o: { count: number; length: number; radius: number; wave: number; spread: number; radial: number }): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < o.count; i++) {
    const u = rng.range(-Math.PI, Math.PI);
    const c = Math.cos(u);
    const vMin = c > 0.2 ? 0.95 - 0.35 * (1 - c) : 0.3;
    const v = rng.range(vMin, 1.25);
    const root = scalp(h, u, v, [1.03, 1.03, 1.03]);
    const out = root.clone().sub(h.c).normalize();
    const len = o.length * rng.range(0.85, 1.1);
    const sway = rng.range(-1, 1) * o.wave;
    const points = [root, root.clone().addScaledVector(out, 0.02)];
    for (let k = 1; k <= 6; k++) {
      const t = k / 6;
      const p = root.clone().addScaledVector(out, 0.02 + 0.045 * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.5) * o.spread);
      p.y -= len * t * (0.9 + 0.2 * Math.sin(t * 2));
      p.x += Math.sin(t * 6 + sway * 5) * 0.006 * (o.wave * 40);
      points.push(p);
    }
    parts.push(tube(points, o.radius, o.radial, 14, o.length * 6));
  }
  return mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
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
  return mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
}

/** A wrapped head tie (gele): smooth wrap with folds and a fanned knot on top. */
function headWrap(h: Head): THREE.BufferGeometry {
  const base = cap(h, { scale: [1.1, 1.08, 1.1], front: 0.78, side: 0.05, back: -0.25, bump: 0.002, uRepeat: 3 });
  const pos = base.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(pos, i);
    const radial = p.clone().sub(h.c);
    const fold = Math.sin(Math.atan2(radial.x, radial.z) * 5 + radial.y * 70) * 0.006;
    p.addScaledVector(radial.normalize(), fold);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  base.computeVertexNormals();

  const parts: THREE.BufferGeometry[] = [base];
  // A fan of tall folded flaps standing up from the crown, like a gele.
  for (let i = 0; i < 7; i++) {
    const k = i - 3;
    const lift = h.ry * (1.15 + 0.5 * (1 - Math.abs(k) / 3.2));
    const flap = sphere(
      new THREE.Vector3(h.c.x + k * h.rx * 0.5, h.c.y + lift, h.c.z - h.rz * 0.1 + Math.abs(k) * 0.004),
      [h.rx * 0.3, h.ry * (0.85 - Math.abs(k) * 0.07), h.rz * 0.34],
      0.05,
    );
    parts.push(flap);
  }
  return mergeGeometries(parts, false) ?? base;
}

export function buildHair(rest: BodyRest, id: string, seed = 5): HairResult | null {
  const h = measureHead(rest);
  const rng = createRng(seed);
  let geometry: THREE.BufferGeometry;
  let texture: HairResult["texture"] = "coils";
  let repeat: [number, number] = [2, 2];

  switch (id) {
    case "p_fade":
      geometry = cap(h, { scale: [1.04, 1.1, 1.05], front: 0.82, side: 0.5, back: 0.12, bump: 0.0012 });
      break;
    case "p_afro":
      geometry = cap(h, { scale: [1.38, 1.3, 1.38], front: 0.7, side: 0.05, back: -0.25, bump: 0.016, lift: h.ry * 0.12 });
      break;
    case "p_puffs": {
      const base = cap(h, { scale: [1.04, 1.08, 1.05], front: 0.8, side: 0.4, back: 0.1, bump: 0.001 });
      const puffA = sphere(new THREE.Vector3(h.c.x + h.rx * 0.75, h.c.y + h.ry * 1.05, h.c.z - h.rz * 0.15), [h.rx * 0.62, h.ry * 0.6, h.rz * 0.62], 0.1);
      const puffB = sphere(new THREE.Vector3(h.c.x - h.rx * 0.75, h.c.y + h.ry * 1.05, h.c.z - h.rz * 0.15), [h.rx * 0.62, h.ry * 0.6, h.rz * 0.62], 0.1);
      geometry = mergeGeometries([base, puffA, puffB], false) ?? base;
      break;
    }
    case "p_cornrows": {
      const under = cap(h, { scale: [1.025, 1.04, 1.03], front: 0.82, side: 0.4, back: 0.05, bump: 0 });
      geometry = mergeGeometries([under, cornrows(h, rng)], false) ?? under;
      texture = "strand";
      repeat = [1, 1];
      break;
    }
    case "p_braids": {
      const under = cap(h, { scale: [1.03, 1.05, 1.04], front: 0.85, side: 0.3, back: -0.1, bump: 0 });
      const braids = strands(h, rng, { count: 52, length: 0.34, radius: 0.0075, wave: 0.2, spread: 1, radial: 5 });
      geometry = mergeGeometries([under, braids], false) ?? under;
      texture = "strand";
      repeat = [1, 1];
      break;
    }
    case "p_locs": {
      const under = cap(h, { scale: [1.03, 1.05, 1.04], front: 0.85, side: 0.3, back: -0.1, bump: 0 });
      const locs = strands(h, rng, { count: 44, length: 0.3, radius: 0.0105, wave: 0.6, spread: 1.3, radial: 6 });
      geometry = mergeGeometries([under, locs], false) ?? under;
      texture = "strand";
      repeat = [1, 1];
      break;
    }
    case "p_bun": {
      const base = cap(h, { scale: [1.04, 1.08, 1.05], front: 0.82, side: 0.4, back: 0.05, bump: 0.001 });
      const bun = sphere(new THREE.Vector3(h.c.x, h.c.y + h.ry * 1.18, h.c.z - h.rz * 0.25), [h.rx * 0.45, h.ry * 0.4, h.rz * 0.45], 0.08);
      geometry = mergeGeometries([base, bun], false) ?? base;
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
