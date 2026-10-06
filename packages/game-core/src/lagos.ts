// Lagos Island: the real layout of the island (water, streets, built-up blocks, parks, the market) traced from a map picture
// (tools/map/trace.mjs), with buildings, trees and lamps generated on it. Pure data and functions; the same world is built in
// the browser and on the game server.

import { LAGOS_CELL, LAGOS_H, LAGOS_PLACES, LAGOS_RLE, LAGOS_W } from "./lagosData.js";
import { generatePlan, hasInterior } from "./buildingPlan.js";
import type { District, Facing, Lamp, LandmarkKind, Landmark, Lot, LotKind, Prop, Rect, Tree } from "./district.js";

export const WATER = 0, STREET = 1, BLOCK = 2, PARK = 3, MARKET = 5;
export type GroundClass = 0 | 1 | 2 | 3 | 5;
export type StreetKind = "asphalt" | "sidewalk" | "plaza";

const rect = (minX: number, maxX: number, minZ: number, maxZ: number): Rect => ({ minX, maxX, minZ, maxZ });

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function decode(): Uint8Array {
  const bytes = Uint8Array.from(atob(LAGOS_RLE), (c) => c.charCodeAt(0));
  const out = new Uint8Array(LAGOS_W * LAGOS_H);
  let at = 0;
  for (let i = 0; i + 2 < bytes.length; i += 3) {
    const run = bytes[i + 1]! | (bytes[i + 2]! << 8);
    out.fill(bytes[i]!, at, at + run);
    at += run;
  }
  return out;
}

/** The ground of the island: what is at any point, smooth between the coarse cells. */
export class LagosTerrain {
  readonly cell = LAGOS_CELL;
  readonly width = LAGOS_W;
  readonly height = LAGOS_H;
  readonly size = { x: LAGOS_W * LAGOS_CELL, z: LAGOS_H * LAGOS_CELL };
  readonly cls: Uint8Array;
  /** For street cells: distance in cells to the nearest non-street cell. */
  readonly edt: Float32Array;
  /** For block cells: the direction (radians) pointing away from the nearest street, water or park edge. */
  readonly blockDir: Float32Array;
  /** For block cells: distance in cells to that edge. */
  readonly blockEdge: Float32Array;
  /** For street cells: the widest clearance within two cells (about half the corridor width): small = a street, large = open ground. */
  readonly wide: Float32Array;

  constructor() {
    this.cls = decode();
    const { width: w, height: h, cls } = this;
    const edt = new Float32Array(w * h);
    const INF = 1e6;
    for (let i = 0; i < w * h; i++) edt[i] = cls[i] === STREET ? INF : 0;
    const D1 = 1, D2 = Math.SQRT2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (edt[i] === 0) continue;
        let v = edt[i]!;
        if (x > 0) v = Math.min(v, edt[i - 1]! + D1);
        if (y > 0) {
          v = Math.min(v, edt[i - w]! + D1);
          if (x > 0) v = Math.min(v, edt[i - w - 1]! + D2);
          if (x < w - 1) v = Math.min(v, edt[i - w + 1]! + D2);
        }
        edt[i] = v;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (edt[i] === 0) continue;
        let v = edt[i]!;
        if (x < w - 1) v = Math.min(v, edt[i + 1]! + D1);
        if (y < h - 1) {
          v = Math.min(v, edt[i + w]! + D1);
          if (x < w - 1) v = Math.min(v, edt[i + w + 1]! + D2);
          if (x > 0) v = Math.min(v, edt[i + w - 1]! + D2);
        }
        edt[i] = v;
      }
    }
    for (let i = 0; i < w * h; i++) if (edt[i]! >= INF) edt[i] = 40;
    this.edt = edt;
    const wide = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (cls[i] !== STREET) continue;
        let m = 0;
        for (let dy = -2; dy <= 2; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            if (xx >= 0 && xx < w) m = Math.max(m, edt[yy * w + xx]!);
          }
        }
        wide[i] = m;
      }
    }
    this.wide = wide;

    // Blocks: for every block cell, which way is the nearest edge? (A two-pass nearest-source transform.) Buildings are turned to match.
    const srcX = new Int16Array(w * h).fill(-1), srcZ = new Int16Array(w * h).fill(-1);
    const dist = new Float32Array(w * h).fill(1e6);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (cls[i] !== BLOCK) {
          dist[i] = 0;
          srcX[i] = x;
          srcZ[i] = y;
        }
      }
    }
    const relax = (i: number, j: number) => {
      if (srcX[j]! < 0) return;
      const d = Math.hypot((i % w) - srcX[j]!, ((i / w) | 0) - srcZ[j]!);
      if (d < dist[i]!) {
        dist[i] = d;
        srcX[i] = srcX[j]!;
        srcZ[i] = srcZ[j]!;
      }
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (x > 0) relax(i, i - 1);
        if (y > 0) {
          relax(i, i - w);
          if (x > 0) relax(i, i - w - 1);
          if (x < w - 1) relax(i, i - w + 1);
        }
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (x < w - 1) relax(i, i + 1);
        if (y < h - 1) {
          relax(i, i + w);
          if (x < w - 1) relax(i, i + w + 1);
          if (x > 0) relax(i, i + w - 1);
        }
      }
    }
    const dir = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) if (cls[i] === BLOCK && srcX[i]! >= 0) dir[i] = Math.atan2(((i / w) | 0) - srcZ[i]!, (i % w) - srcX[i]!);
    this.blockDir = dir;
    this.blockEdge = dist;
  }

  /** Which way a building at this point should be turned: its sides parallel to the nearest street (radians, a quarter turn is equivalent). */
  blockAngleAt(x: number, z: number): number {
    // Average the direction over the neighbouring cells as vectors, so the angle does not jump.
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let sx = 0, sz = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = cx + dx, zz = cz + dz;
        if (xx < 0 || zz < 0 || xx >= this.width || zz >= this.height) continue;
        const i = zz * this.width + xx;
        if (this.cls[i] !== BLOCK) continue;
        const a = this.blockDir[i]! * 4; // times four: angles a quarter turn apart count as the same
        sx += Math.cos(a);
        sz += Math.sin(a);
      }
    }
    return Math.atan2(sz, sx) / 4;
  }

  private at(cx: number, cz: number): number {
    if (cx < 0 || cz < 0 || cx >= this.width || cz >= this.height) return WATER;
    return this.cls[cz * this.width + cx]!;
  }

  /** The ground class at a point, smoothed so the edges of blocks and streets are not stair-stepped. */
  classAt(x: number, z: number): GroundClass {
    const u = x / this.cell - 0.5;
    const v = z / this.cell - 0.5;
    const x0 = Math.floor(u), z0 = Math.floor(v);
    const fx = u - x0, fz = v - z0;
    let best = 0, bestW = -1;
    const weight = [0, 0, 0, 0, 0, 0];
    const add = (c: number, wt: number) => {
      weight[c] = (weight[c] ?? 0) + wt;
    };
    add(this.at(x0, z0), (1 - fx) * (1 - fz));
    add(this.at(x0 + 1, z0), fx * (1 - fz));
    add(this.at(x0, z0 + 1), (1 - fx) * fz);
    add(this.at(x0 + 1, z0 + 1), fx * fz);
    for (let c = 0; c < 6; c++) {
      if (weight[c]! > bestW) {
        bestW = weight[c]!;
        best = c;
      }
    }
    return best as GroundClass;
  }

  isWater(x: number, z: number): boolean {
    return this.classAt(x, z) === WATER;
  }

  private bilinear(arr: Float32Array, x: number, z: number): number {
    const u = x / this.cell - 0.5;
    const v = z / this.cell - 0.5;
    const x0 = Math.floor(u), z0 = Math.floor(v);
    const fx = u - x0, fz = v - z0;
    const g = (cx: number, cz: number) => (cx < 0 || cz < 0 || cx >= this.width || cz >= this.height ? 0 : arr[cz * this.width + cx]!);
    return g(x0, z0) * (1 - fx) * (1 - fz) + g(x0 + 1, z0) * fx * (1 - fz) + g(x0, z0 + 1) * (1 - fx) * fz + g(x0 + 1, z0 + 1) * fx * fz;
  }

  /** How far (metres) a street point is from the nearest block, water or park edge. */
  edgeDistance(x: number, z: number): number {
    return Math.max(0, (this.bilinear(this.edt, x, z) - 0.5) * this.cell);
  }

  /** What a street point is: asphalt, a pavement strip along the edges, or open paved ground where the streets open out. */
  streetKind(x: number, z: number): StreetKind {
    const wideHere = this.bilinear(this.wide, x, z);
    if (wideHere > 3.2) return "plaza";
    return this.edgeDistance(x, z) < 1.7 ? "sidewalk" : "asphalt";
  }

  /** Can a person stand here (ignoring buildings)? */
  walkable(x: number, z: number): boolean {
    const c = this.classAt(x, z);
    return c !== WATER;
  }
}

let terrainSingleton: LagosTerrain | null = null;
export function lagosTerrain(): LagosTerrain {
  return (terrainSingleton ??= new LagosTerrain());
}

/** What each named kind needs to become a building with an inside, and how big it is (width across the front, depth, floors). */
const PLACE_BUILDING: Partial<Record<string, { w: number; d: number; floors: number; lotKind: LotKind }>> = {
  police: { w: 20, d: 15, floors: 2, lotKind: "flats" },
  hospital: { w: 24, d: 17, floors: 3, lotKind: "flats" },
  school: { w: 22, d: 14, floors: 2, lotKind: "flats" },
  church: { w: 18, d: 24, floors: 1, lotKind: "house" },
  mosque: { w: 20, d: 20, floors: 1, lotKind: "house" },
  fire: { w: 22, d: 15, floors: 2, lotKind: "flats" },
  bank: { w: 18, d: 14, floors: 3, lotKind: "flats" },
  hotel: { w: 24, d: 16, floors: 4, lotKind: "flats" },
  station: { w: 26, d: 16, floors: 1, lotKind: "terminal" },
  museum: { w: 24, d: 18, floors: 2, lotKind: "terminal" },
  government: { w: 22, d: 16, floors: 3, lotKind: "terminal" },
};

const CELL = 12;
const FACING_STEP: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export interface LotIndex {
  near(x: number, z: number): Lot[];
}

/** A spatial index so "which building is here" is quick on a map with ten thousand of them. */
export function indexLots(lots: Lot[], bucket = 24): LotIndex {
  const map = new Map<number, Lot[]>();
  const key = (ix: number, iz: number) => ix * 100003 + iz;
  for (const l of lots) {
    const f = l.footprint;
    for (let ix = Math.floor(f.minX / bucket); ix <= Math.floor(f.maxX / bucket); ix++) {
      for (let iz = Math.floor(f.minZ / bucket); iz <= Math.floor(f.maxZ / bucket); iz++) {
        const k = key(ix, iz);
        const list = map.get(k);
        if (list) list.push(l);
        else map.set(k, [l]);
      }
    }
  }
  return { near: (x, z) => map.get(key(Math.floor(x / bucket), Math.floor(z / bucket))) ?? [] };
}

const indexCache = new WeakMap<District, LotIndex>();
export function lotIndexOf(d: District): LotIndex {
  let i = indexCache.get(d);
  if (!i) indexCache.set(d, (i = indexLots(d.lots)));
  return i;
}

/** Is the point inside the polygon, or within `pad` metres of its edge? */
export function nearPolygon(poly: [number, number][], x: number, z: number, pad = 0): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!, [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    if (pad > 0) {
      const dx = xj - xi, dz = zj - zi;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - xi) * dx + (z - zi) * dz) / len2));
      if (Math.hypot(x - (xi + t * dx), z - (zi + t * dz)) <= pad) return true;
    }
  }
  return inside;
}

/** Can a person stand at this point on a district: on land, and not inside a building (inflated by `pad`). Works for both worlds. */
export function walkableAt(d: District, x: number, z: number, pad = 0.3): boolean {
  if (d.terrain && !d.terrain.walkable(x, z)) return false;
  if (x < d.bounds.minX || x > d.bounds.maxX || z < d.bounds.minZ || z > d.bounds.maxZ) return false;
  for (const l of lotIndexOf(d).near(x, z)) {
    const f = l.footprint;
    if (x > f.minX - pad && x < f.maxX + pad && z > f.minZ - pad && z < f.maxZ + pad) {
      if (l.poly) {
        if (nearPolygon(l.poly, x, z, pad)) return false;
        continue;
      }
      if (!hasInterior(l)) return false;
      // Buildings with an inside are walked through its door; the walls, not the whole footprint, block.
      continue;
    }
  }
  return true;
}

export function generateLagos(seed = 7): District {
  const t = lagosTerrain();
  const rand = rng(seed);
  const between = (a: number, b: number) => a + rand() * (b - a);
  const placePx = (name: string) => LAGOS_PLACES.find((p) => p.name === name)!;
  const toWorld = (p: { x: number; y: number }) => ({ x: p.x * t.cell, z: p.y * t.cell });
  const market = toWorld(placePx("Balogun Market"));

  // ---- buildings on the built-up blocks: turned to follow the nearest street, of different shapes and sizes, packed close
  const lots: Lot[] = [];
  let lotNo = 0;
  const OW = Math.ceil(t.size.x), OH = Math.ceil(t.size.z);
  const occ = new Uint8Array(OW * OH); // 1 m cells already covered by a building
  const isBlock = (x: number, z: number) => t.classAt(x, z) === BLOCK;
  const inRect = (lx: number, lz: number, hw: number, hd: number) => Math.abs(lx) <= hw && Math.abs(lz) <= hd;
  /** Is the turned rectangle free (no building, 2 m of block all round)? `grow` widens the test. */
  const rectFree = (cx: number, cz: number, c: number, sn: number, hw: number, hd: number, margin: number): boolean => {
    const R = Math.hypot(hw, hd) + margin;
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(OW - 1, Math.floor(cx + R));
    const z0 = Math.max(0, Math.floor(cz - R)), z1 = Math.min(OH - 1, Math.floor(cz + R));
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (!occ[z * OW + x]) continue;
        const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
        if (inRect(dx * c + dz * sn, -dx * sn + dz * c, hw + 0.8, hd + 0.8)) return false;
      }
    }
    // The ground round it must all be block: probe the corners and edge middles, 2 m outside.
    const px = hw + 1.6, pz = hd + 1.6;
    for (const [lx, lz] of [[-px, -pz], [px, -pz], [-px, pz], [px, pz], [0, -pz], [0, pz], [-px, 0], [px, 0], [0, 0]] as const) {
      if (!isBlock(cx + lx * c - lz * sn, cz + lx * sn + lz * c)) return false;
    }
    return true;
  };
  const markRect = (cx: number, cz: number, c: number, sn: number, hw: number, hd: number) => {
    const R = Math.hypot(hw, hd);
    for (let z = Math.max(0, Math.floor(cz - R)); z <= Math.min(OH - 1, Math.floor(cz + R)); z++) {
      for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(OW - 1, Math.floor(cx + R)); x++) {
        const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
        if (inRect(dx * c + dz * sn, -dx * sn + dz * c, hw, hd)) occ[z * OW + x] = 1;
      }
    }
  };
  const PASSES = [
    { step: 7, w: [12, 22], d: [9, 16] },
    { step: 5, w: [8, 13], d: [7, 11] },
    { step: 3, w: [4, 7], d: [4, 7] },
  ] as const;
  for (const pass of PASSES) {
    for (let gz = pass.step / 2; gz < t.size.z; gz += pass.step) {
      for (let gx = pass.step / 2; gx < t.size.x; gx += pass.step) {
        const x = gx + between(-pass.step * 0.45, pass.step * 0.45), z = gz + between(-pass.step * 0.45, pass.step * 0.45);
        if (!isBlock(x, z) || occ[Math.floor(z) * OW + Math.floor(x)]) continue;
        if (rand() < 0.04) continue; // a yard or a car park now and then
        const theta = Math.round(t.blockAngleAt(x, z) / 0.131) * 0.131;
        const c = Math.cos(theta), sn = Math.sin(theta);
        const shape = rand();
        let w = between(pass.w[0], pass.w[1]), dpt = between(pass.d[0], pass.d[1]);
        if (shape > 0.9 && pass === PASSES[0]) {
          w = between(22, 32);
          dpt = between(6, 8); // a long terrace
        }
        const hw = w / 2, hd = dpt / 2;
        if (!rectFree(x, z, c, sn, hw, hd, 3)) continue;
        // L-shaped: a wing off one end.
        let wing: { cx: number; cz: number; hw: number; hd: number } | null = null;
        if (shape > 0.6 && shape <= 0.85 && w > 8) {
          const w2 = w * between(0.4, 0.55), d2 = dpt * between(0.7, 1);
          const side = rand() < 0.5 ? -1 : 1;
          const lx = side * (hw - w2 / 2), lz = hd + d2 / 2;
          wing = { cx: x + lx * c - lz * sn, cz: z + lx * sn + lz * c, hw: w2 / 2, hd: d2 / 2 };
          if (!rectFree(wing.cx, wing.cz, c, sn, wing.hw, wing.hd, 1)) wing = null;
          else if (rectFree(x, z, c, sn, hw, hd, 0) === false) wing = null;
        }
        markRect(x, z, c, sn, hw, hd);
        if (wing) markRect(wing.cx, wing.cz, c, sn, wing.hw, wing.hd);
        // The outline, turned and moved into place.
        const local: [number, number][] = wing
          ? (() => {
              const side = Math.sign(((wing.cx - x) * c + (wing.cz - z) * sn)) || 1;
              const w2 = wing.hw * 2, d2 = wing.hd * 2;
              const a = side * (hw - w2), b2 = side * hw;
              const lo = Math.min(a, b2), hi = Math.max(a, b2);
              return side > 0
                ? [[-hw, -hd], [hw, -hd], [hw, hd + d2], [lo, hd + d2], [lo, hd], [-hw, hd]]
                : [[-hw, -hd], [hw, -hd], [hw, hd], [hi, hd], [hi, hd + d2], [-hw, hd + d2]];
            })()
          : [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
        const poly = local.map(([lx, lz]) => [x + lx * c - lz * sn, z + lx * sn + lz * c] as [number, number]);
        const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
        const fp = rect(Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs));
        // Face the nearest street: the way the block's edge lies, as one of the four sides.
        const away = t.blockAngleAt(x, z);
        const out = [Math.cos(away + Math.PI), Math.sin(away + Math.PI)] as const;
        const facing: Facing = Math.abs(out[1]) >= Math.abs(out[0]) ? (out[1] < 0 ? 0 : 2) : out[0] > 0 ? 1 : 3;
        const dc = Math.hypot(x - market.x, z - market.z);
        const floors = dc < 350 ? 3 + Math.floor(rand() * 5) : dc < 900 ? 2 + Math.floor(rand() * 4) : 1 + Math.floor(rand() * 3);
        const kind: LotKind = floors >= 3 ? (rand() < 0.45 ? "shop" : "flats") : rand() < 0.3 ? "shop" : "house";
        lots.push({ id: `L${lotNo++}`, kind, plot: rect(fp.minX - 1, fp.maxX + 1, fp.minZ - 1, fp.maxZ + 1), footprint: fp, floors, storey: 3.2, roof: "flat", facing, colour: Math.floor(rand() * 8), garage: false, fence: false, poly, yaw: theta });
      }
    }
  }

  // ---- the market: rows of stalls with aisles between
  const stalls: Lot[] = [];
  for (let z = Math.floor(market.z - 120); z < market.z + 120; z += 5) {
    for (let x = Math.floor(market.x - 120); x < market.x + 120; x += 7) {
      const aisle = Math.floor((x - (market.x - 120)) / 7) % 4 === 3 || Math.floor((z - (market.z - 120)) / 5) % 5 === 4;
      if (aisle) continue;
      const fp = rect(x + 0.5, x + 5.5, z + 0.5, z + 3.5);
      const pts: [number, number][] = [[fp.minX, fp.minZ], [fp.maxX, fp.minZ], [fp.minX, fp.maxZ], [fp.maxX, fp.maxZ]];
      if (!pts.every(([px, pz]) => t.classAt(px, pz) === MARKET)) continue;
      stalls.push({ id: `S${stalls.length}`, kind: "stall", plot: fp, footprint: fp, floors: 1, storey: 3, roof: "flat", facing: 2, colour: Math.floor(rand() * 8), garage: false, fence: false });
    }
  }

  // ---- named places: turn the nearest building into the place, bigger, and clear the ones in the way
  const landmarks: Landmark[] = [];
  const claimLot = (name: string, kind: LandmarkKind, x: number, z: number) => {
    const spec = PLACE_BUILDING[kind];
    if (!spec) return null;
    let best: Lot | null = null, bestD = 1e9;
    for (const l of lots) {
      if (l.landmark) continue;
      const d = Math.hypot((l.footprint.minX + l.footprint.maxX) / 2 - x, (l.footprint.minZ + l.footprint.maxZ) / 2 - z);
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    if (!best || bestD > 90) return null;
    const cx = (best.footprint.minX + best.footprint.maxX) / 2, cz = (best.footprint.minZ + best.footprint.maxZ) / 2;
    for (const scale of [1, 0.85, 0.7, 0.55]) {
      const w = spec.w * scale, d = spec.d * scale;
      const alongX = best.facing === 0 || best.facing === 2;
      const hx = (alongX ? w : d) / 2, hz = (alongX ? d : w) / 2;
      const fp = rect(cx - hx, cx + hx, cz - hz, cz + hz);
      const probes: [number, number][] = [[fp.minX - 1.5, fp.minZ - 1.5], [fp.maxX + 1.5, fp.minZ - 1.5], [fp.minX - 1.5, fp.maxZ + 1.5], [fp.maxX + 1.5, fp.maxZ + 1.5]];
      if (!probes.every(([px, pz]) => t.classAt(px, pz) !== WATER && t.classAt(px, pz) !== STREET)) continue;
      for (let i = lots.length - 1; i >= 0; i--) {
        const o = lots[i]!;
        if (o === best) continue;
        const f = o.footprint;
        if (f.minX < fp.maxX + 1 && f.maxX > fp.minX - 1 && f.minZ < fp.maxZ + 1 && f.maxZ > fp.minZ - 1) lots.splice(i, 1);
      }
      delete best.poly;
      delete best.yaw;
      best.footprint = fp;
      best.plot = rect(fp.minX - 1, fp.maxX + 1, fp.minZ - 1, fp.maxZ + 1);
      best.floors = spec.floors;
      best.kind = spec.lotKind;
      best.storey = 3.4;
      best.landmark = kind;
      best.roof = kind === "church" ? "gable" : "flat";
      return best;
    }
    return null;
  };
  const nearestStreet = (x: number, z: number) => {
    for (let r = 0; r < 120; r += 3) {
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos((a / 16) * Math.PI * 2) * r, pz = z + Math.sin((a / 16) * Math.PI * 2) * r;
        if (t.classAt(px, pz) === STREET && t.streetKind(px, pz) !== "plaza") return { x: px, z: pz };
      }
    }
    return { x, z };
  };
  const entranceOf = (lot: Lot) => {
    if (hasInterior(lot)) {
      const inside = generatePlan(lot).inside;
      const out = FACING_STEP[lot.facing]!;
      return { x: inside.x + out[0] * 2.9, z: inside.z + out[1] * 2.9 };
    }
    const f = lot.footprint;
    return nearestStreet((f.minX + f.maxX) / 2, (f.minZ + f.maxZ) / 2);
  };
  for (const place of LAGOS_PLACES) {
    const kind = place.kind as LandmarkKind;
    const w = toWorld(place);
    const lot = claimLot(place.name, kind, w.x, w.z);
    if (lot) {
      const f = lot.footprint;
      landmarks.push({ id: `P${landmarks.length}`, kind, name: place.name, x: (f.minX + f.maxX) / 2, z: (f.minZ + f.maxZ) / 2, entrance: entranceOf(lot), lotId: lot.id });
    } else {
      // Open places (market, parks, stadium, port, or a building with no room): a pin and a spot on the nearest street.
      landmarks.push({ id: `P${landmarks.length}`, kind, name: place.name, x: w.x, z: w.z, entrance: nearestStreet(w.x, w.z), lotId: null });
    }
  }

  // ---- the port: sheds on the open ground at the bottom left
  const portSheds: Lot[] = [];
  const port = { x0: 10 * t.cell, x1: 240 * t.cell, z0: 455 * t.cell, z1: 585 * t.cell };
  for (let z = port.z0; z < port.z1; z += 44) {
    for (let x = port.x0; x < port.x1; x += 52) {
      const fp = rect(x, x + 30, z, z + 22);
      const pts: [number, number][] = [[fp.minX - 4, fp.minZ - 4], [fp.maxX + 4, fp.minZ - 4], [fp.minX - 4, fp.maxZ + 4], [fp.maxX + 4, fp.maxZ + 4], [(fp.minX + fp.maxX) / 2, (fp.minZ + fp.maxZ) / 2]];
      if (!pts.every(([px, pz]) => t.classAt(px, pz) === STREET)) continue;
      if (rand() < 0.35) continue;
      portSheds.push({ id: `H${portSheds.length}`, kind: "hangar", plot: fp, footprint: fp, floors: 1, storey: 7, roof: "flat", facing: 0, colour: 2, garage: false, fence: false });
    }
  }

  const allLots = [...lots, ...stalls, ...portSheds];

  // A way in must not end up inside a neighbouring building: if it does, stand on the nearest street instead.
  {
    const index = indexLots(allLots);
    for (const lm of landmarks) {
      const e = lm.entrance;
      const blocked = !t.walkable(e.x, e.z) || index.near(e.x, e.z).some((l) => (l.poly ? nearPolygon(l.poly, e.x, e.z, 0.5) : !hasInterior(l) && e.x > l.footprint.minX - 0.5 && e.x < l.footprint.maxX + 0.5 && e.z > l.footprint.minZ - 0.5 && e.z < l.footprint.maxZ + 0.5));
      if (blocked) lm.entrance = nearestStreet(e.x, e.z);
    }
  }

  // ---- trees (parks, pavements), lamps and a few parked cars
  const trees: Tree[] = [];
  const lamps: Lamp[] = [];
  const props: Prop[] = [];
  const occupied = indexLots(allLots);
  const clear = (x: number, z: number, pad = 1.2) => occupied.near(x, z).every((l) => !(x > l.footprint.minX - pad && x < l.footprint.maxX + pad && z > l.footprint.minZ - pad && z < l.footprint.maxZ + pad));
  for (let z = 4; z < t.size.z; z += 9) {
    for (let x = 4; x < t.size.x; x += 9) {
      const px = x + between(-3, 3), pz = z + between(-3, 3);
      const c = t.classAt(px, pz);
      if (c === PARK && rand() < 0.75 && clear(px, pz)) trees.push({ x: px, z: pz, scale: between(0.8, 1.4), variant: [0, 1, 2][Math.floor(rand() * 3)] as 0 | 1 | 2 });
      else if (c === STREET && rand() < 0.07 && t.streetKind(px, pz) === "sidewalk" && clear(px, pz)) trees.push({ x: px, z: pz, scale: between(0.8, 1.2), variant: [0, 1, 2][Math.floor(rand() * 3)] as 0 | 1 | 2 });
      else if (c === STREET && t.streetKind(px, pz) === "plaza" && rand() < 0.03 && clear(px, pz)) trees.push({ x: px, z: pz, scale: between(0.9, 1.3), variant: 1 });
    }
  }
  for (let z = 6; z < t.size.z; z += 26) {
    for (let x = 6; x < t.size.x; x += 26) {
      const px = x + between(-8, 8), pz = z + between(-8, 8);
      if (t.classAt(px, pz) !== STREET || t.streetKind(px, pz) !== "sidewalk" || !clear(px, pz) || rand() < 0.4) continue;
      // The arm of the lamp points to the asphalt.
      let facing: Facing = 0;
      for (let f = 0; f < 4; f++) {
        const sx = px + FACING_STEP[f]![0] * 3, sz = pz + FACING_STEP[f]![1] * 3;
        if (t.classAt(sx, sz) === STREET && t.streetKind(sx, sz) === "asphalt") {
          facing = f as Facing;
          break;
        }
      }
      lamps.push({ x: px, z: pz, facing });
    }
  }
  for (let z = 10; z < t.size.z; z += 40) {
    for (let x = 10; x < t.size.x; x += 40) {
      const px = x + between(-15, 15), pz = z + between(-15, 15);
      if (t.classAt(px, pz) !== STREET || t.streetKind(px, pz) !== "asphalt" || rand() < 0.7) continue;
      // Along the street: look at which way the asphalt runs.
      const along = t.classAt(px + 8, pz) === STREET && t.classAt(px - 8, pz) === STREET ? 90 : 0;
      props.push({ kind: "car", x: px, z: pz, yaw: along, variant: Math.floor(rand() * 6) });
    }
  }

  // ---- where a new player starts: the street in front of Independence House
  const house = toWorld(placePx("Independence House"));
  const start = (() => {
    // Open ground: a street point well away from any building edge, so the first view is a street and not a wall.
    for (let r = 0; r < 160; r += 2) {
      for (let a = 0; a < 24; a++) {
        const px = house.x + Math.cos((a / 24) * Math.PI * 2) * r, pz = house.z + 10 + Math.sin((a / 24) * Math.PI * 2) * r;
        if (t.classAt(px, pz) === STREET && t.edgeDistance(px, pz) >= 5) return { x: px, z: pz };
      }
    }
    return nearestStreet(house.x, house.z + 10);
  })();

  return {
    seed,
    bounds: rect(0, t.size.x, 0, t.size.z),
    roads: [],
    sidewalks: [],
    blocks: [],
    lots: allLots,
    trees,
    lamps,
    landmarks,
    runway: rect(0, 0, 0, 0),
    props,
    wires: [],
    paving: [],
    fields: [],
    spawn: { x: start.x, z: start.z, yaw: 0 },
    terrain: t,
  };
}

// ---------------------------------------------------------------- long routes

/**
 * A rough route across the island for walks too long to plan metre by metre: A* over the coarse map, streets and open ground cheap,
 * blocks and parks dearer, water not at all (bridges are streets). Returns waypoints about `spacing` metres apart; walk to each in
 * turn and plan the short legs on the fine grid. Null if there is no way on foot.
 */
export function coarseRoute(t: LagosTerrain, x0: number, z0: number, x1: number, z1: number, spacing = 50): { x: number; z: number }[] | null {
  const w = t.width, h = t.height;
  const cell = (v: number, max: number) => Math.max(0, Math.min(max - 1, Math.floor(v / t.cell)));
  const start = cell(z0, h) * w + cell(x0, w);
  let goal = cell(z1, h) * w + cell(x1, w);
  const cost = (c: number) => (c === WATER ? 0 : c === STREET ? 1 : c === BLOCK ? 5 : 2);
  if (cost(t.cls[goal]!) === 0) return null;
  const g = new Float64Array(w * h).fill(Infinity);
  const from = new Int32Array(w * h).fill(-1);
  // A binary heap of [f, index].
  const heap: [number, number][] = [];
  const push = (f: number, i: number) => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p]![0] <= heap[k]![0]) break;
      [heap[p], heap[k]] = [heap[k]!, heap[p]!];
      k = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k]!, heap[m]!];
        k = m;
      }
    }
    return top;
  };
  const gx = goal % w, gz = (goal / w) | 0;
  g[start] = 0;
  push(0, start);
  let found = false;
  while (heap.length) {
    const [, i] = pop();
    if (i === goal) {
      found = true;
      break;
    }
    const x = i % w, z = (i / w) | 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const j = nz * w + nx;
        const c = cost(t.cls[j]!);
        if (c === 0) continue;
        if (dx && dz && (cost(t.cls[z * w + nx]!) === 0 || cost(t.cls[nz * w + x]!) === 0)) continue; // no cutting water corners
        const ng = g[i]! + c * (dx && dz ? Math.SQRT2 : 1);
        if (ng < g[j]!) {
          g[j] = ng;
          from[j] = i;
          push(ng + Math.hypot(gx - nx, gz - nz), j);
        }
      }
    }
  }
  if (!found) return null;
  goal = goal | 0;
  const cells: number[] = [];
  for (let i = goal; i !== -1; i = from[i]!) cells.push(i);
  cells.reverse();
  const out: { x: number; z: number }[] = [];
  let acc = 0;
  let last = { x: x0, z: z0 };
  for (const i of cells) {
    const p = { x: ((i % w) + 0.5) * t.cell, z: (((i / w) | 0) + 0.5) * t.cell };
    acc += Math.hypot(p.x - last.x, p.z - last.z);
    last = p;
    if (acc >= spacing) {
      out.push(p);
      acc = 0;
    }
  }
  out.push({ x: x1, z: z1 });
  return out;
}
