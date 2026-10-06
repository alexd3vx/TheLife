import * as THREE from "three";
import type { Lot } from "@thelife/game-core";
import { FacadeBuilder } from "./facade";
import type { MeshBuilder } from "./meshBuilder";
import { V } from "./wall";

const C = (hex: string) => new THREE.Color(hex);
// Paints seen on Lagos buildings: cream and yellow, white, faded blues and greens, peach, bare concrete grey, brick, pink.
const PAINTS = ["#e8dcb8", "#efe9dc", "#cdb77a", "#a9c2cf", "#b8cfae", "#e2b9a0", "#a8a8a2", "#b0624c", "#dcb2b5", "#7fb3b0", "#d6c9a8", "#f0e0a0"].map(C);
const TOWER = ["#9fb4c2", "#c9ccd0", "#8da0ad", "#b8c2c8"].map(C);
const SHEETS = ["#9a4a32", "#8d9298", "#3f5a47", "#3d5f86", "#7a5a44", "#a8553a"].map(C);
const TANK = C("#1b2124");
const METAL = C("#6d7378");
const AWNING = ["#c0392b", "#1f5fa8", "#d98a1c", "#217a4f", "#6a3a9c"].map(C);
const AC = C("#d9dcdc");
const CONCRETE = C("#8f8f8a");

const KIND_CODE: Record<string, number> = { house: 0, flats: 1, shop: 2, hangar: 3, terminal: 4 };
const FACE: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}
const rnd = (seed: number, a: number, b = 0) => {
  const x = Math.sin(seed * 127.1 + a * 311.7 + b * 74.7) * 43758.5453;
  return x - Math.floor(x);
};

/** A box turned to sit against a wall: `along` is the unit direction along the wall, `out` the unit direction away from it. */
function obox(b: MeshBuilder, cx: number, y0: number, cz: number, along: [number, number], out: [number, number], halfLen: number, height: number, depth: number, color: THREE.Color) {
  const [ax, az] = along, [ox, oz] = out;
  const p = (s: number, d: number, y: number) => V(cx + ax * s + ox * d, y, cz + az * s + oz * d);
  const y1 = y0 + height;
  const lit = color.clone().multiplyScalar(1.05);
  const dark = color.clone().multiplyScalar(0.8);
  b.quad(p(-halfLen, depth, y0), p(halfLen, depth, y0), p(halfLen, depth, y1), p(-halfLen, depth, y1), { x: ox, y: 0, z: oz }, color, dark, color); // front
  b.quad(p(-halfLen, 0, y1), p(halfLen, 0, y1), p(halfLen, depth, y1), p(-halfLen, depth, y1), { x: 0, y: 1, z: 0 }, lit); // top
  b.quad(p(halfLen, 0, y0), p(halfLen, depth, y0), p(halfLen, depth, y1), p(halfLen, 0, y1), { x: ax, y: 0, z: az }, color, dark, color); // end
  b.quad(p(-halfLen, depth, y0), p(-halfLen, 0, y0), p(-halfLen, 0, y1), p(-halfLen, depth, y1), { x: -ax, y: 0, z: -az }, color, dark, color); // other end
  b.quad(p(-halfLen, 0, y0), p(halfLen, 0, y0), p(halfLen, depth, y0), p(-halfLen, depth, y0), { x: 0, y: -1, z: 0 }, dark); // underside (awnings are seen from below)
}

/**
 * A building from its real outline: walls and roof for the facade shader (which draws the windows, doors, shutters, signs and weathering),
 * and, close up, the things that stick out: parapets, balconies, AC units, awnings, water tanks and masts.
 */
export function addPrism(fb: FacadeBuilder, b: MeshBuilder, lot: Lot, lod: 0 | 1 | 2): void {
  const poly = lot.poly!;
  const storey = lot.storey;
  const height = lot.floors * storey;
  const seed = hash(lot.id);
  const kind = KIND_CODE[lot.kind] ?? 0;
  const tower = lot.floors >= 7 && (kind === 2 || kind === 4 || seed > 0.5);
  const paint = tower ? TOWER[Math.floor(seed * TOWER.length)]! : PAINTS[Math.floor(rnd(seed, 1) * PAINTS.length)]!;
  const sheet = SHEETS[Math.floor(rnd(seed, 2) * SHEETS.length)]!;

  let cx = 0, cz = 0;
  for (const [x, z] of poly) {
    cx += x;
    cz += z;
  }
  cx /= poly.length;
  cz /= poly.length;

  // The front wall: the longest wall whose outside points the way the building faces.
  const face = FACE[lot.facing]!;
  let front = -1, bestScore = -1;
  const edges: { i: number; x0: number; z0: number; x1: number; z1: number; len: number; nx: number; nz: number; ux: number; uz: number }[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i]!, [x1, z1] = poly[(i + 1) % poly.length]!;
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    let nx = dz / len, nz = -dx / len;
    if (nx * ((x0 + x1) / 2 - cx) + nz * ((z0 + z1) / 2 - cz) < 0) {
      nx = -nx;
      nz = -nz;
    }
    edges.push({ i, x0, z0, x1, z1, len, nx, nz, ux: dx / len, uz: dz / len });
    const align = nx * face[0] + nz * face[1];
    const score = len > 3 ? align * Math.min(len, 12) : -1;
    if (align > 0.6 && score > bestScore) {
      bestScore = score;
      front = i;
    }
  }

  const gable = lot.roof === "gable" && gableFrame(poly, lot.yaw ?? 0);
  const wallCode = kind;
  for (const e of edges) {
    const isFront = e.i === front ? 100 : 0;
    fb.wall(e.x0, e.z0, e.x1, e.z1, 0, height, { x: e.nx, z: e.nz }, paint, [lot.floors, wallCode + isFront, seed, storey]);
  }

  const top = height;
  if (gable) {
    addGable(fb, gable, top, sheet, paint, [lot.floors, wallCode, seed, storey]);
  } else {
    // A flat roof: triangulated from the outline.
    const contour = poly.map(([x, z]) => new THREE.Vector2(x, z));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    const info: [number, number, number, number] = [0, 10 + wallCode, seed, storey];
    for (const [a, c2, d] of faces) {
      const A = poly[a!]!, B = poly[c2!]!, D = poly[d!]!;
      const cross = (B[0] - A[0]) * (D[1] - A[1]) - (B[1] - A[1]) * (D[0] - A[0]);
      const P = (q: [number, number]) => ({ x: q[0], y: top + 0.05, z: q[1] });
      if (cross > 0) fb.tri(P(A), P(D), P(B), [A[0], A[1]], [D[0], D[1]], [B[0], B[1]], CONCRETE, info, 0);
      else fb.tri(P(A), P(B), P(D), [A[0], A[1]], [B[0], B[1]], [D[0], D[1]], CONCRETE, info, 0);
    }
  }
  if (lod !== 0) return;

  // A plinth at the foot of every wall, and a cornice under the roofline: the lines that make a block read as a building.
  const stone = paint.clone().multiplyScalar(0.7).lerp(CONCRETE, 0.4);
  for (const e of edges) {
    if (e.len < 2.5) continue;
    const mx = (e.x0 + e.x1) / 2, mz = (e.z0 + e.z1) / 2;
    obox(b, mx, 0, mz, [e.ux, e.uz], [e.nx, e.nz], e.len / 2, 0.5, 0.07, stone);
    if (!gable && lot.floors >= 2) obox(b, mx, top - 0.26, mz, [e.ux, e.uz], [e.nx, e.nz], e.len / 2 + 0.05, 0.26, 0.3, paint.clone().multiplyScalar(1.04));
  }

  // ---------------------------------------------------------------- things that stick out (close up only)
  if (!gable) {
    // A parapet round the roof edge.
    for (const e of edges) {
      fb.wall(e.x0, e.z0, e.x1, e.z1, top, top + 0.55, { x: e.nx, z: e.nz }, paint, [0, wallCode, seed, storey]);
      fb.wall(e.x0 - e.nx * 0.18, e.z0 - e.nz * 0.18, e.x1 - e.nx * 0.18, e.z1 - e.nz * 0.18, top, top + 0.55, { x: -e.nx, z: -e.nz }, CONCRETE, [0, 10 + wallCode, seed, storey]);
    }
    if (rnd(seed, 3) < 0.55 && lot.floors >= 2) {
      // water tanks, a stair box and a mast: the Lagos skyline
      const tanks = 1 + Math.floor(rnd(seed, 4) * 3);
      for (let t = 0; t < tanks; t++) {
        const tx = cx + (rnd(seed, 5, t) - 0.5) * 3, tz = cz + (rnd(seed, 6, t) - 0.5) * 3;
        b.geometry(new THREE.CylinderGeometry(0.75, 0.7, 1.4, 10), new THREE.Matrix4().makeTranslation(tx, top + 0.05 + 0.9, tz), TANK);
        b.box(tx - 0.8, top + 0.05, tz - 0.8, tx + 0.8, top + 0.2, tz + 0.8, CONCRETE);
      }
      if (rnd(seed, 7) < 0.5) b.box(cx + 1.8, top + 0.05, cz - 1.4, cx + 3.6, top + 2.4, cz + 0.2, paint, 0.85);
      if (rnd(seed, 8) < 0.4) b.box(cx - 0.05, top + 0.05, cz - 0.05, cx + 0.05, top + 5.5, cz + 0.05, METAL);
    }
  }

  for (const e of edges) {
    if (e.len < 4) continue;
    const cols = Math.max(1, Math.floor((e.len - 1.2) / 3));
    const step = e.len / cols;
    const isFront = e.i === front;
    for (let f = 0; f < lot.floors; f++) {
      for (let k = 0; k < cols; k++) {
        const u = step * (k + 0.5);
        const r = rnd(seed, e.i * 31 + k, f);
        const px = e.x0 + e.ux * u, pz = e.z0 + e.uz * u;
        const shopGround = isFront && f === 0 && (kind === 2 || kind === 4);
        if (shopGround) continue;
        const sillY = f * storey + (f === 0 ? 1.0 : 0.95);
        if (r < 0.14 && lod === 0) {
          // an air-conditioner beside the window
          const off = 0.95;
          obox(b, px + e.ux * off + e.nx * 0.02, sillY + 0.3, pz + e.uz * off + e.nz * 0.02, [e.ux, e.uz], [e.nx, e.nz], 0.4, 0.45, 0.28, AC);
        } else if (r > 0.88 && f >= 1 && kind !== 0 && lot.floors >= 3) {
          // a balcony
          obox(b, px + e.nx * 0.01, f * storey - 0.02, pz + e.nz * 0.01, [e.ux, e.uz], [e.nx, e.nz], 1.0, 0.14, 1.05, CONCRETE);
          obox(b, px + e.nx * 1.0, f * storey + 0.12, pz + e.nz * 1.0, [e.ux, e.uz], [e.nx, e.nz], 1.0, 0.95, 0.05, paint.clone().multiplyScalar(0.92));
        }
      }
    }
    if (isFront && (kind === 2 || kind === 4) && e.len > 4) {
      // the shop's awning over the pavement
      const half = Math.min(e.len * 0.38, 3.2);
      const mid = e.len * 0.5;
      obox(b, e.x0 + e.ux * mid, 2.62, e.z0 + e.uz * mid, [e.ux, e.uz], [e.nx, e.nz], half, 0.1, 1.5, AWNING[Math.floor(rnd(seed, 9) * AWNING.length)]!);
    }
  }
}

interface Frame {
  cx: number;
  cz: number;
  ax: number;
  az: number;
  halfLong: number;
  halfShort: number;
}

/** If the outline is close to a rectangle, its centre, direction and size (so a pitched roof can sit on it); otherwise null. */
function gableFrame(poly: [number, number][], yaw: number): Frame | null {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity, area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x, z] = poly[i]!, [x1, z1] = poly[(i + 1) % poly.length]!;
    const a = x * c + z * s, bb = -x * s + z * c;
    minA = Math.min(minA, a);
    maxA = Math.max(maxA, a);
    minB = Math.min(minB, bb);
    maxB = Math.max(maxB, bb);
    area += x * z1 - x1 * z;
  }
  const w = maxA - minA, d = maxB - minB;
  if (w < 3 || d < 3 || Math.abs(area / 2) / (w * d) < 0.86 || Math.min(w, d) > 14) return null;
  const midA = (minA + maxA) / 2, midB = (minB + maxB) / 2;
  const cx = midA * c - midB * s, cz = midA * s + midB * c;
  return w >= d ? { cx, cz, ax: c, az: s, halfLong: w / 2, halfShort: d / 2 } : { cx, cz, ax: -s, az: c, halfLong: d / 2, halfShort: w / 2 };
}

function addGable(fb: FacadeBuilder, f: Frame, top: number, sheet: THREE.Color, paint: THREE.Color, wallInfo: [number, number, number, number]): void {
  const o = 0.4; // eaves overhang
  const L = f.halfLong + o, S = f.halfShort + o;
  const rise = Math.min(2.6, f.halfShort * 0.7);
  const bx = -f.az, bz = f.ax; // across the building
  const P = (a: number, b2: number, y: number) => ({ x: f.cx + f.ax * a + bx * b2, y, z: f.cz + f.az * a + bz * b2 });
  const slope = Math.hypot(S, rise);
  const info: [number, number, number, number] = [0, 20 + (wallInfo[1] % 10), wallInfo[2], wallInfo[3]];
  // The two slopes: x across the ribs (along the ridge), y up the slope.
  for (const side of [-1, 1] as const) {
    const a = P(-L, side * S, top - 0.1), b2 = P(L, side * S, top - 0.1), c = P(L, 0, top + rise), d = P(-L, 0, top + rise);
    const outX = bx * side * 0.6, outZ = bz * side * 0.6;
    const n = { x: (b2.y - a.y) * (c.z - a.z) - (b2.z - a.z) * (c.y - a.y), z: (b2.x - a.x) * (c.y - a.y) - (b2.y - a.y) * (c.x - a.x) };
    const flip = n.x * outX + n.z * outZ < 0;
    if (!flip) {
      fb.tri(a, b2, c, [0, 0], [2 * L, 0], [2 * L, slope], sheet, info, 0);
      fb.tri(a, c, d, [0, 0], [2 * L, slope], [0, slope], sheet, info, 0);
    } else {
      fb.tri(a, c, b2, [0, 0], [2 * L, slope], [2 * L, 0], sheet, info, 0);
      fb.tri(a, d, c, [0, 0], [0, slope], [2 * L, slope], sheet, info, 0);
    }
  }
  // The gable ends, in wall colour (no windows: floors = 0).
  for (const end of [-1, 1] as const) {
    const a = P(end * f.halfLong, -f.halfShort, top), b2 = P(end * f.halfLong, f.halfShort, top), c = P(end * f.halfLong, 0, top + rise - 0.1);
    const out = { x: f.ax * end, z: f.az * end };
    const n = { x: (b2.y - a.y) * (c.z - a.z) - (b2.z - a.z) * (c.y - a.y), z: (b2.x - a.x) * (c.y - a.y) - (b2.y - a.y) * (c.x - a.x) };
    const wi: [number, number, number, number] = [0, wallInfo[1] % 100, wallInfo[2], wallInfo[3]];
    if (n.x * out.x + n.z * out.z >= 0) fb.tri(a, b2, c, [0, 0], [f.halfShort * 2, 0], [f.halfShort, rise], paint, wi, f.halfShort * 2);
    else fb.tri(a, c, b2, [0, 0], [f.halfShort, rise], [f.halfShort * 2, 0], paint, wi, f.halfShort * 2);
  }
}
