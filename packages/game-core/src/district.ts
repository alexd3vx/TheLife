// The neighbourhood as data: roads, lots, trees, lamps. A deterministic generator turns a seed into the same district
// everywhere (the browser today, the server later), and a chunk index lets the renderer stream it in square pieces.
// Pure data and functions: no rendering, no browser APIs. Coordinates are metres on the ground plane (x east, z south).

export const CHUNK_SIZE = 32;
/** Half the width of the playable district in metres (the district is 2 x HALF wide). */
export const DISTRICT_HALF = 216;
const ROAD_CENTRES = [-180, -108, -36, 36, 108, 180];
const ROAD_WIDTH = 8;
const SIDEWALK = 2;

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type LotKind = "house" | "flats" | "shop" | "stall" | "terminal";
/** Which way the front door faces: 0 north (-z), 1 east (+x), 2 south (+z), 3 west (-x). */
export type Facing = 0 | 1 | 2 | 3;

export interface Lot {
  id: string;
  kind: LotKind;
  /** The whole plot, including yard. */
  plot: Rect;
  /** The building itself. */
  footprint: Rect;
  floors: number;
  /** Height of one storey in metres. */
  storey: number;
  roof: "flat" | "gable";
  facing: Facing;
  /** An index into the colour palette (client side). */
  colour: number;
  garage: boolean;
  fence: boolean;
}

export interface Tree {
  x: number;
  z: number;
  /** Size multiplier, 0.7 to 1.4. */
  scale: number;
  /** Which of the tree shapes to use. */
  variant: 0 | 1 | 2;
}

export interface Lamp {
  x: number;
  z: number;
  /** Which way the arm points. */
  facing: Facing;
}

export type BlockKind = "residential" | "commercial" | "market" | "park" | "farm" | "apron";

export interface Block {
  kind: BlockKind;
  area: Rect;
}

export interface District {
  seed: number;
  bounds: Rect;
  roads: Rect[];
  sidewalks: Rect[];
  blocks: Block[];
  lots: Lot[];
  trees: Tree[];
  lamps: Lamp[];
  /** Paved areas that are not roads (car parks, the apron). */
  paving: Rect[];
  /** Crop plots on the outskirts. */
  fields: Rect[];
  /** Where a new player starts. */
  spawn: { x: number; z: number; yaw: number };
}

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

const rect = (minX: number, maxX: number, minZ: number, maxZ: number): Rect => ({ minX, maxX, minZ, maxZ });
const overlaps = (a: Rect, b: Rect, pad = 0) => a.minX < b.maxX + pad && a.maxX > b.minX - pad && a.minZ < b.maxZ + pad && a.maxZ > b.minZ - pad;

export function generateDistrict(seed = 1): District {
  const rand = rng(seed);
  const pick = <T>(items: readonly T[]) => items[Math.floor(rand() * items.length)]!;
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const H = DISTRICT_HALF;
  const bounds = rect(-H, H, -H, H);
  const half = ROAD_WIDTH / 2;

  const roads: Rect[] = [];
  const sidewalks: Rect[] = [];
  for (const c of ROAD_CENTRES) {
    roads.push(rect(c - half, c + half, -H, H), rect(-H, H, c - half, c + half));
    for (const side of [-1, 1]) {
      const edge = c + side * half;
      const a = side < 0 ? edge - SIDEWALK : edge;
      // Sidewalks stop at the crossing roads instead of running over them.
      let from = -H;
      for (const other of [...ROAD_CENTRES, H + ROAD_WIDTH]) {
        const to = Math.min(other - half, H);
        if (to > from + 0.01) sidewalks.push(rect(a, a + SIDEWALK, from, to), rect(from, to, a, a + SIDEWALK));
        from = other + half;
      }
    }
  }

  // Blocks: the space between neighbouring roads (inside the road grid), plus the outskirts.
  const edges = [-H, ...ROAD_CENTRES, H];
  const blocks: Block[] = [];
  const lots: Lot[] = [];
  const trees: Tree[] = [];
  const lamps: Lamp[] = [];
  const paving: Rect[] = [];
  const fields: Rect[] = [];
  let lotNo = 0;

  const lo = (c: number) => c + half + SIDEWALK; // first buildable metre after a road at c
  const hi = (c: number) => c - half - SIDEWALK; // last buildable metre before a road at c

  for (let i = 0; i < edges.length - 1; i++) {
    for (let j = 0; j < edges.length - 1; j++) {
      const outerX = i === 0 || i === edges.length - 2;
      const outerZ = j === 0 || j === edges.length - 2;
      const x0 = i === 0 ? -H : lo(edges[i]!);
      const x1 = i === edges.length - 2 ? H : hi(edges[i + 1]!);
      const z0 = j === 0 ? -H : lo(edges[j]!);
      const z1 = j === edges.length - 2 ? H : hi(edges[j + 1]!);
      if (x1 - x0 < 10 || z1 - z0 < 10) continue;
      const area = rect(x0, x1, z0, z1);
      const centre = i === 3 && j === 3;
      const southEdge = j === edges.length - 2;
      let kind: BlockKind;
      if (outerX || outerZ) kind = southEdge && !outerX ? "apron" : "farm";
      else if (centre) kind = "market";
      else if (j === edges.length - 3) kind = "commercial";
      else kind = rand() < 0.14 ? "park" : "residential";
      blocks.push({ kind, area });

      if (kind === "farm") {
        // Crop strips with a margin, the odd tree on the verge.
        const strip = 14;
        for (let z = z0 + 4; z + strip < z1 - 2; z += strip + 4) {
          for (let x = x0 + 4; x + 22 < x1 - 2; x += 26) fields.push(rect(x, x + 22, z, z + strip));
        }
        for (let n = 0; n < 6; n++) trees.push({ x: between(x0 + 3, x1 - 3), z: between(z0 + 3, z1 - 3), scale: between(0.9, 1.4), variant: pick([0, 1, 2] as const) });
      } else if (kind === "apron") {
        paving.push(rect(x0 + 2, x1 - 2, z0 + 14, z1 - 2));
        const w = Math.min(54, x1 - x0 - 8);
        const cx = (x0 + x1) / 2;
        const fp = rect(cx - w / 2, cx + w / 2, z0 + 2, z0 + 14);
        lots.push({ id: `L${lotNo++}`, kind: "terminal", plot: rect(cx - w / 2 - 2, cx + w / 2 + 2, z0, z0 + 16), footprint: fp, floors: 2, storey: 4.2, roof: "flat", facing: 2, colour: 6, garage: false, fence: false });
      } else if (kind === "park") {
        for (let n = 0; n < 18; n++) trees.push({ x: between(x0 + 3, x1 - 3), z: between(z0 + 3, z1 - 3), scale: between(0.8, 1.5), variant: pick([0, 1, 2] as const) });
      } else if (kind === "market") {
        paving.push(rect(x0, x1, z0, z1));
        for (let z = z0 + 6; z + 3 < z1 - 4; z += 9) {
          for (let x = x0 + 6; x + 3 < x1 - 4; x += 8) {
            if (rand() < 0.15) continue;
            const fp = rect(x, x + 3.6, z, z + 3);
            lots.push({ id: `L${lotNo++}`, kind: "stall", plot: fp, footprint: fp, floors: 1, storey: 2.6, roof: "flat", facing: (rand() < 0.5 ? 0 : 2) as Facing, colour: Math.floor(rand() * 8), garage: false, fence: false });
          }
        }
      } else {
        // Residential and commercial blocks: a row of lots along the north and south edges, each facing its street.
        const depth = kind === "commercial" ? 18 : 22;
        for (const side of [0, 1] as const) {
          let x = x0;
          while (x < x1 - 10) {
            const width = Math.min(x1 - x, kind === "commercial" ? between(10, 15) : between(13, 20));
            if (width < 9) break;
            const plot = side === 0 ? rect(x, x + width, z0, z0 + depth) : rect(x, x + width, z1 - depth, z1);
            const facing: Facing = side === 0 ? 0 : 2;
            const setback = kind === "commercial" ? 0.8 : between(3, 5);
            const fpDepth = depth - setback - (kind === "commercial" ? 1 : between(2, 4));
            const side_ = kind === "commercial" ? 0.4 : between(1.8, 2.8);
            const fp =
              side === 0 ? rect(plot.minX + side_, plot.maxX - side_, plot.minZ + setback, plot.minZ + setback + fpDepth) : rect(plot.minX + side_, plot.maxX - side_, plot.maxZ - setback - fpDepth, plot.maxZ - setback);
            const roll = rand();
            const floors = kind === "commercial" ? 1 + Math.floor(rand() * 2) : roll < 0.5 ? 1 : roll < 0.85 ? 2 : 3;
            lots.push({
              id: `L${lotNo++}`,
              kind: kind === "commercial" ? "shop" : floors === 3 ? "flats" : "house",
              plot,
              footprint: fp,
              floors,
              storey: kind === "commercial" ? 3.6 : 3,
              roof: kind === "commercial" || floors === 3 ? "flat" : rand() < 0.6 ? "gable" : "flat",
              facing,
              colour: Math.floor(rand() * 8),
              garage: kind === "residential" && floors < 3 && rand() < 0.55 && width > 14,
              fence: kind === "residential" && rand() < 0.7,
            });
            if (kind === "residential" && rand() < 0.5) {
              trees.push({ x: between(plot.minX + 1, plot.maxX - 1), z: side === 0 ? plot.minZ + 1.6 : plot.maxZ - 1.6, scale: between(0.7, 1.2), variant: pick([0, 1, 2] as const) });
            }
            x += width + 1.5;
          }
        }
        if (kind === "commercial") paving.push(rect(x0 + 2, x1 - 2, z0 + depth + 1, z1 - depth - 1));
        else for (let n = 0; n < 6; n++) trees.push({ x: between(x0 + 3, x1 - 3), z: between(z0 + depth + 1, z1 - depth - 1), scale: between(0.8, 1.3), variant: pick([0, 1, 2] as const) });
      }
    }
  }

  // Street trees and lamps along every road, kept clear of the junctions.
  const nearJunction = (t: number) => ROAD_CENTRES.some((c) => Math.abs(t - c) < half + 6);
  for (const c of ROAD_CENTRES) {
    for (let t = -H + 10; t < H - 10; t += 12) {
      if (nearJunction(t)) continue;
      const side = Math.floor((t + H) / 12) % 2 === 0 ? -1 : 1;
      const off = c + side * (half + SIDEWALK - 0.7);
      if (!blocks.some((b) => b.kind === "apron" && overlaps(b.area, rect(off - 1, off + 1, t - 1, t + 1)))) {
        trees.push({ x: off, z: t, scale: between(0.8, 1.2), variant: pick([0, 1, 2] as const) });
        trees.push({ x: t, z: off, scale: between(0.8, 1.2), variant: pick([0, 1, 2] as const) });
      }
    }
    for (let t = -H + 16; t < H - 12; t += 24) {
      if (nearJunction(t)) continue;
      lamps.push({ x: c + half + 0.8, z: t, facing: 3 }, { x: t, z: c + half + 0.8, facing: 0 });
    }
  }

  // Trees that landed on a building or the road are dropped (the random yard trees are not planned around lots).
  const keep = trees.filter((tr) => {
    const box = rect(tr.x - 0.5, tr.x + 0.5, tr.z - 0.5, tr.z + 0.5);
    if (roads.some((r) => overlaps(r, box))) return false;
    return !lots.some((l) => overlaps(l.footprint, box, 1));
  });

  return { seed, bounds, roads, sidewalks, blocks, lots, trees: keep, lamps, paving, fields, spawn: { x: ROAD_CENTRES[2]! + 0.5, z: ROAD_CENTRES[2]! + 12, yaw: 0 } };
}

// ---------------------------------------------------------------- chunks

export function chunkCoord(v: number): number {
  return Math.floor(v / CHUNK_SIZE);
}

export const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;

export interface ChunkData {
  cx: number;
  cz: number;
  bounds: Rect;
  lots: Lot[];
  trees: Tree[];
  lamps: Lamp[];
}

/** Everything in the district sorted into its chunk (a lot, tree or lamp belongs to the chunk holding its centre). */
export function indexChunks(d: District): Map<string, ChunkData> {
  const map = new Map<string, ChunkData>();
  const get = (x: number, z: number): ChunkData => {
    const cx = chunkCoord(x);
    const cz = chunkCoord(z);
    const key = chunkKey(cx, cz);
    let c = map.get(key);
    if (!c) {
      c = { cx, cz, bounds: rect(cx * CHUNK_SIZE, (cx + 1) * CHUNK_SIZE, cz * CHUNK_SIZE, (cz + 1) * CHUNK_SIZE), lots: [], trees: [], lamps: [] };
      map.set(key, c);
    }
    return c;
  };
  for (let cx = chunkCoord(d.bounds.minX); cx <= chunkCoord(d.bounds.maxX - 0.001); cx++) {
    for (let cz = chunkCoord(d.bounds.minZ); cz <= chunkCoord(d.bounds.maxZ - 0.001); cz++) get((cx + 0.5) * CHUNK_SIZE, (cz + 0.5) * CHUNK_SIZE);
  }
  for (const l of d.lots) get((l.footprint.minX + l.footprint.maxX) / 2, (l.footprint.minZ + l.footprint.maxZ) / 2).lots.push(l);
  for (const t of d.trees) get(t.x, t.z).trees.push(t);
  for (const l of d.lamps) get(l.x, l.z).lamps.push(l);
  return map;
}

/** Things a walking character can't pass: buildings, fences' footprints are the plots' edges (kept simple), tree trunks. */
export function walkBlockers(d: District): Rect[] {
  const out: Rect[] = [];
  for (const l of d.lots) out.push(l.footprint);
  for (const t of d.trees) out.push(rect(t.x - 0.35, t.x + 0.35, t.z - 0.35, t.z + 0.35));
  for (const l of d.lamps) out.push(rect(l.x - 0.15, l.x + 0.15, l.z - 0.15, l.z + 0.15));
  return out;
}
