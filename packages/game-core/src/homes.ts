import { STREET, walkableAt } from "./lagos.js";
import type { District, Lot } from "./district.js";
import type { Tier } from "./profile.js";

/**
 * Where a player lives. Every home is a real building in the city with a front door on the street; inside it is the player's own
 * private room (like an apartment in GTA Online), so many players can share one building and nobody walks in on anybody.
 */
export interface Home {
  lotId: string;
  /** The front door, on the wall. */
  door: { x: number; z: number };
  /** Where you stand when you step out: on the pavement in front of the door. */
  spawn: { x: number; z: number };
  /** The direction the door faces (unit vector, away from the building). */
  normal: { x: number; z: number };
  /** The way you face when you come out (radians; 0 faces north = -z). */
  yaw: number;
}

const FACE: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The home door of a building, or null if it has no wall that opens onto walkable street. */
function doorOf(d: District, lot: Lot): Home | null {
  const poly = lot.poly;
  if (!poly || poly.length < 3) return null;
  const f = FACE[lot.facing]!;
  const cx = (lot.footprint.minX + lot.footprint.maxX) / 2, cz = (lot.footprint.minZ + lot.footprint.maxZ) / 2;
  let best: Home | null = null, bestScore = -1;
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i]!, [x1, z1] = poly[(i + 1) % poly.length]!;
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 3) continue;
    let nx = (z1 - z0) / len, nz = -(x1 - x0) / len;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    if (nx * (mx - cx) + nz * (mz - cz) < 0) {
      nx = -nx;
      nz = -nz;
    }
    const align = nx * f[0] + nz * f[1];
    const score = align * Math.min(len, 10);
    if (align < 0.55 || score <= bestScore) continue;
    // the pavement in front: try 2.2 to 4 m out
    for (const r of [2.4, 3.2, 4.0]) {
      const sx = mx + nx * r, sz = mz + nz * r;
      if (d.terrain && d.terrain.classAt(sx, sz) === STREET && walkableAt(d, sx, sz, 0.5)) {
        best = { lotId: lot.id, door: { x: mx + nx * 0.05, z: mz + nz * 0.05 }, spawn: { x: sx, z: sz }, normal: { x: nx, z: nz }, yaw: Math.atan2(-nx, -nz) + Math.PI };
        bestScore = score;
        break;
      }
    }
  }
  return best;
}

const cache = new WeakMap<District, Record<Tier, Home[]>>();

/** Which 6 m squares of the city can be walked to from the spawn (so no home sits on an island you cannot reach). */
function reachableFromSpawn(d: District): (x: number, z: number) => boolean {
  const S = 6;
  const w = Math.ceil(d.bounds.maxX / S), h = Math.ceil(d.bounds.maxZ / S);
  const seen = new Uint8Array(w * h);
  const ok = (cx: number, cz: number) => walkableAt(d, (cx + 0.5) * S, (cz + 0.5) * S, 0.3);
  const start = Math.floor(d.spawn.z / S) * w + Math.floor(d.spawn.x / S);
  const queue = [start];
  seen[start] = 1;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % w, z = (i / w) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const j = nz * w + nx;
      if (!seen[j] && ok(nx, nz)) {
        seen[j] = 1;
        queue.push(j);
      }
    }
  }
  return (x, z) => seen[Math.floor(z / S) * w + Math.floor(x / S)] === 1;
}

/** All the buildings that can be a home for each background, by where they stand and what they are. */
export function homeCandidates(d: District): Record<Tier, Home[]> {
  let hit = cache.get(d);
  if (hit) return hit;
  const out: Record<Tier, Home[]> = { lapo: [], middle: [], nepo: [] };
  const reach = reachableFromSpawn(d);
  for (const lot of d.lots) {
    if (!lot.poly || lot.landmark) continue;
    const f = lot.footprint;
    const w = f.maxX - f.minX, h = f.maxZ - f.minZ;
    const area = w * h;
    const x = (f.minX + f.maxX) / 2;
    let tier: Tier | null = null;
    // Rich: the quiet east side (Ikoyi), detached houses with room around them. Middle: flats in the middle of the island.
    // Lapo: the packed old town in the west, small houses of one or two floors.
    if (x > d.bounds.maxX * 0.7 && lot.kind === "house" && area > 140 && lot.floors <= 3) tier = "nepo";
    else if (x > d.bounds.maxX * 0.35 && x <= d.bounds.maxX * 0.7 && (lot.kind === "flats" || lot.kind === "shop") && lot.floors >= 2 && lot.floors <= 6 && area > 90) tier = "middle";
    else if (x <= d.bounds.maxX * 0.35 && lot.kind === "house" && area < 160 && lot.floors <= 2) tier = "lapo";
    if (!tier) continue;
    const home = doorOf(d, lot);
    if (home && reach(home.spawn.x, home.spawn.z)) out[tier].push(home);
  }
  cache.set(d, out);
  return out;
}

/** The same home for the same player every time (their account or key decides, so everyone agrees on it). */
export function homeFor(d: District, tier: Tier, key: string): Home {
  const list = homeCandidates(d)[tier];
  if (list.length === 0) {
    const s = d.spawn;
    return { lotId: "", door: { x: s.x, z: s.z }, spawn: { x: s.x, z: s.z }, normal: { x: 0, z: 1 }, yaw: 0 };
  }
  return list[hash(key) % list.length]!;
}
