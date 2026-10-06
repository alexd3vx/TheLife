import { generatePlan, hasInterior, planBlockers } from "./buildingPlan.js";

// The neighbourhood as data: roads, lots, trees, lamps. A deterministic generator turns a seed into the same district
// everywhere (the browser today, the server later), and a chunk index lets the renderer stream it in square pieces.
// Pure data and functions: no rendering, no browser APIs. Coordinates are metres on the ground plane (x east, z south).

export const CHUNK_SIZE = 32;
/** Half the width of the playable district in metres (the district is 2 x HALF wide). */
export const DISTRICT_HALF = 216;
export const ROAD_CENTRES = [-180, -108, -36, 36, 108, 180];
export const ROAD_WIDTH = 8;
export const SIDEWALK = 2;

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type LotKind = "house" | "flats" | "shop" | "stall" | "terminal" | "hangar";

/** Places that get their own look, a name and a pin on the map. */
export type LandmarkKind =
  | "airport" | "police" | "hospital" | "school" | "church" | "mosque" | "fire" | "bank" | "fuel" | "hotel" | "market"
  | "station" | "museum" | "government" | "stadium" | "park" | "port";

export interface Landmark {
  id: string;
  kind: LandmarkKind;
  name: string;
  /** The middle of the place (where the pin floats). */
  x: number;
  z: number;
  /** A walkable spot just outside the front door. */
  entrance: { x: number; z: number };
  lotId: string | null;
}
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
  /** Set when this lot is one of the named places. */
  landmark?: LandmarkKind;
  /** For buildings that are not straight rectangles: the outline, in order, in world metres (the footprint is then its bounding box). */
  poly?: [number, number][];
  /** The direction the building is turned, in radians (set with `poly`). */
  yaw?: number;
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

export type PropKind = "pole" | "hydrant" | "bin" | "bench" | "busStop" | "sign" | "car" | "plane";

/** Street furniture and parked cars. `yaw` is a multiple of 90 degrees (0 faces +x along the crossarm/length, 90 turns it). */
export interface Prop {
  kind: PropKind;
  x: number;
  z: number;
  yaw: 0 | 90;
  /** Car colour, sign type, and so on. */
  variant: number;
}

export type BlockKind = "residential" | "commercial" | "market" | "park" | "farm" | "apron";

export interface Block {
  kind: BlockKind;
  area: Rect;
  /** Position in the block grid (0 to 6 each way). */
  i: number;
  j: number;
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
  landmarks: Landmark[];
  /** The runway along the south edge. */
  runway: Rect;
  props: Prop[];
  /** Overhead cable spans between power poles: [x1, z1, x2, z2]. */
  wires: [number, number, number, number][];
  /** Paved areas that are not roads (car parks, the apron). */
  paving: Rect[];
  /** Crop plots on the outskirts. */
  fields: Rect[];
  /** Where a new player starts. */
  spawn: { x: number; z: number; yaw: number };
  /** Set for the real-map world: the ground (water, streets, blocks, parks) is read from this instead of the lists above. */
  terrain?: import("./lagos.js").LagosTerrain;
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
  const planeSpots: { x: number; z: number }[] = [];

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
      blocks.push({ kind, area, i, j });

      if (kind === "farm") {
        // Crop strips with a margin, the odd tree on the verge.
        const strip = 14;
        for (let z = z0 + 4; z + strip < z1 - 2; z += strip + 4) {
          for (let x = x0 + 4; x + 22 < x1 - 2; x += 26) fields.push(rect(x, x + 22, z, z + strip));
        }
        for (let n = 0; n < 6; n++) trees.push({ x: between(x0 + 3, x1 - 3), z: between(z0 + 3, z1 - 3), scale: between(0.9, 1.4), variant: pick([0, 1, 2] as const) });
      } else if (kind === "apron") {
        // Terminal or hangar along the town side, a parking apron with planes, and the runway beyond (added once, below).
        paving.push(rect(x0 + 2, x1 - 2, z0 + 9, z0 + 17));
        const main = i === 3;
        const w = main ? Math.min(54, x1 - x0 - 8) : 26;
        const cx = (x0 + x1) / 2;
        const fp = rect(cx - w / 2, cx + w / 2, z0 + 2, z0 + 9);
        lots.push({ id: `L${lotNo++}`, kind: main ? "terminal" : "hangar", plot: rect(cx - w / 2 - 2, cx + w / 2 + 2, z0, z0 + 10), footprint: fp, floors: main ? 2 : 1, storey: main ? 4.2 : 7, roof: "flat", facing: 0, colour: main ? 6 : 2, garage: false, fence: false, landmark: main ? "airport" : undefined });
        for (const px of main ? [cx - 16, cx + 6, cx + 22] : [cx - 8, cx + 10]) planeSpots.push({ x: px, z: z0 + 13 });
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

  // ---- named places: the widest plot in a chosen block becomes a police station, hospital and so on.
  const landmarks: Landmark[] = [];
  const entranceOf = (lot: Lot) => {
    if (hasInterior(lot)) {
      // Stand on the pavement right in front of the real door.
      const inside = generatePlan(lot).inside;
      const out = lot.facing === 0 ? { x: 0, z: -1 } : lot.facing === 2 ? { x: 0, z: 1 } : lot.facing === 1 ? { x: 1, z: 0 } : { x: -1, z: 0 };
      return { x: inside.x + out.x * 2.9, z: inside.z + out.z * 2.9 };
    }
    const f = lot.footprint;
    const mx = (f.minX + f.maxX) / 2;
    const mz = (f.minZ + f.maxZ) / 2;
    return lot.facing === 0 ? { x: mx, z: f.minZ - 1.5 } : lot.facing === 2 ? { x: mx, z: f.maxZ + 1.5 } : lot.facing === 1 ? { x: f.maxX + 1.5, z: mz } : { x: f.minX - 1.5, z: mz };
  };
  const claim = (kind: LandmarkKind, name: string, bi: number, bj: number, floors: number) => {
    const candidates = blocks
      .filter((b) => b.kind === "residential" || b.kind === "commercial")
      .sort((p, q) => Math.hypot(p.i - bi, p.j - bj) - Math.hypot(q.i - bi, q.j - bj));
    for (const b of candidates) {
      const inBlock = lots.filter((l) => !l.landmark && (l.kind === "house" || l.kind === "flats" || l.kind === "shop") && l.plot.minX >= b.area.minX - 0.01 && l.plot.maxX <= b.area.maxX + 0.01 && l.plot.minZ >= b.area.minZ - 0.01 && l.plot.maxZ <= b.area.maxZ + 0.01);
      if (!inBlock.length) continue;
      const lot = inBlock.sort((p, q) => q.plot.maxX - q.plot.minX - (p.plot.maxX - p.plot.minX))[0]!;
      lot.landmark = kind;
      lot.floors = floors;
      lot.fence = kind === "school" || kind === "fire" || kind === "police" || kind === "hospital";
      lot.garage = false;
      lot.roof = kind === "church" ? "gable" : "flat";
      lot.storey = 3.4;
      const f = lot.footprint;
      lot.footprint = lot.facing === 0 ? rect(lot.plot.minX + 1.2, lot.plot.maxX - 1.2, f.minZ, f.maxZ) : rect(lot.plot.minX + 1.2, lot.plot.maxX - 1.2, f.minZ, f.maxZ);
      landmarks.push({ id: `P${landmarks.length}`, kind, name, x: (lot.footprint.minX + lot.footprint.maxX) / 2, z: (lot.footprint.minZ + lot.footprint.maxZ) / 2, entrance: entranceOf(lot), lotId: lot.id });
      return;
    }
  };
  claim("police", "Central Police Station", 2, 1, 2);
  claim("hospital", "General Hospital", 4, 2, 3);
  claim("school", "Unity Primary School", 1, 2, 2);
  claim("church", "Grace Chapel", 3, 1, 1);
  claim("mosque", "Central Mosque", 5, 1, 1);
  claim("fire", "Fire Station", 2, 5, 2);
  claim("bank", "City Bank", 4, 5, 2);
  claim("fuel", "Palm Fuel Station", 1, 5, 1);
  claim("hotel", "Palm Court Hotel", 3, 5, 3);
  const airportLot = lots.find((l) => l.landmark === "airport");
  if (airportLot) landmarks.push({ id: `P${landmarks.length}`, kind: "airport", name: "Alexion International Airport", x: (airportLot.footprint.minX + airportLot.footprint.maxX) / 2, z: (airportLot.footprint.minZ + airportLot.footprint.maxZ) / 2, entrance: entranceOf(airportLot), lotId: airportLot.id });
  landmarks.push({ id: `P${landmarks.length}`, kind: "market", name: "Central Market", x: 0, z: 0, entrance: { x: -34, z: 0 }, lotId: null });
  const southZ = Math.max(...blocks.filter((b) => b.kind === "apron").map((b) => b.area.maxZ));
  const runway = rect(-H + 4, H - 4, southZ - 11, southZ - 1);

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
  const props: Prop[] = planeSpots.map((p, k) => ({ kind: "plane" as const, x: p.x, z: p.z, yaw: 0 as const, variant: k % 3 }));
  const wires: District["wires"] = [];
  const outerLimit = H - 8;
  const propBox = (x: number, z: number, r: number) => rect(x - r, x + r, z - r, z + r);
  const onLot = (x: number, z: number, r: number) => lots.some((l) => overlaps(l.plot, propBox(x, z, r)));
  for (const c of ROAD_CENTRES) {
    // Power poles on one side of every road, joined by cables.
    const ts: number[] = [];
    for (let t = -H + 20; t < outerLimit; t += 36) if (!nearJunction(t)) ts.push(t);
    ts.forEach((t, i) => {
      props.push({ kind: "pole", x: c - half - 0.8, z: t, yaw: 0, variant: 0 }, { kind: "pole", x: t, z: c - half - 0.8, yaw: 90, variant: 0 });
      if (i > 0) wires.push([c - half - 0.8, ts[i - 1]!, c - half - 0.8, t], [ts[i - 1]!, c - half - 0.8, t, c - half - 0.8]);
    });
    for (let t = -H + 30; t < outerLimit; t += 96) {
      if (nearJunction(t)) continue;
      props.push({ kind: "hydrant", x: c + half + 0.7, z: t, yaw: 0, variant: 0 }, { kind: "hydrant", x: t, z: c + half + 0.7, yaw: 0, variant: 0 });
    }
    for (let t = -H + 40; t < outerLimit; t += 48) {
      if (nearJunction(t)) continue;
      props.push({ kind: "bin", x: c - half - 1.4, z: t, yaw: 0, variant: 0 }, { kind: "bin", x: t, z: c - half - 1.4, yaw: 0, variant: 0 });
    }
    // Parked cars along the kerbs, never across a junction.
    for (let t = -H + 14; t < outerLimit; t += 7.5) {
      if (nearJunction(t) || nearJunction(t + 4.5) || nearJunction(t - 4.5)) continue;
      for (const side of [-1, 1]) {
        if (rand() > 0.2) continue;
        const off = c + side * (half - 1.25);
        props.push({ kind: "car", x: off, z: t, yaw: 0, variant: Math.floor(rand() * 6) });
      }
      for (const side of [-1, 1]) {
        if (rand() > 0.2) continue;
        const off = c + side * (half - 1.25);
        props.push({ kind: "car", x: t, z: off, yaw: 90, variant: Math.floor(rand() * 6) });
      }
    }
  }
  // Stop signs at some junction corners; bus stops mid-block on the north-south roads.
  for (const cx of ROAD_CENTRES) {
    for (const cz of ROAD_CENTRES) {
      for (const [sx, sz] of [[1, 1], [-1, -1]] as const) if (rand() < 0.6) props.push({ kind: "sign", x: cx + sx * (half + 1.1), z: cz + sz * (half + 1.1), yaw: 0, variant: 0 });
    }
  }
  for (let k = 0; k + 1 < ROAD_CENTRES.length; k++) {
    const mid = (ROAD_CENTRES[k]! + ROAD_CENTRES[k + 1]!) / 2;
    for (const c of ROAD_CENTRES) if (rand() < 0.3) props.push({ kind: "busStop", x: c + half + 1.4, z: mid, yaw: 0, variant: 0 });
  }
  for (const b of blocks) {
    if (b.kind !== "park" && b.kind !== "market") continue;
    const n = b.kind === "park" ? 3 : 4;
    for (let i = 0; i < n; i++) props.push({ kind: "bench", x: between(b.area.minX + 4, b.area.maxX - 4), z: between(b.area.minZ + 4, b.area.maxZ - 4), yaw: rand() < 0.5 ? 0 : 90, variant: 0 });
  }
  // Furniture that landed on a plot, off the playable ground, or too close to another is dropped.
  const placed: Prop[] = [];
  for (const p of props) {
    if (Math.abs(p.x) > H - 1 || Math.abs(p.z) > H - 1) continue;
    if (p.kind !== "car" && p.kind !== "bench" && onLot(p.x, p.z, 0.6)) continue;
    if (p.kind === "bench" && lots.some((l) => overlaps(l.footprint, propBox(p.x, p.z, 1.5)))) continue;
    const clash = placed.some((q) => {
      if (p.kind === "car" && q.kind === "car") return p.yaw === q.yaw ? (p.yaw === 0 ? Math.abs(q.x - p.x) < 2.4 && Math.abs(q.z - p.z) < 4.8 : Math.abs(q.x - p.x) < 4.8 && Math.abs(q.z - p.z) < 2.4) : Math.abs(q.x - p.x) < 4.6 && Math.abs(q.z - p.z) < 4.6;
      if (p.kind === "car" || q.kind === "car") return false;
      return Math.abs(q.x - p.x) < 1 && Math.abs(q.z - p.z) < 1;
    });
    if (clash) continue;
    placed.push(p);
  }

  const keep = trees.filter((tr) => {
    const box = rect(tr.x - 0.5, tr.x + 0.5, tr.z - 0.5, tr.z + 0.5);
    if (roads.some((r) => overlaps(r, box))) return false;
    return !lots.some((l) => overlaps(l.footprint, box, 1));
  });

  return { seed, bounds, roads, sidewalks, blocks, lots, trees: keep, lamps, landmarks, runway, props: placed, wires, paving, fields, spawn: { x: ROAD_CENTRES[2]! + 0.5, z: ROAD_CENTRES[2]! + 12, yaw: 0 } };
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
  props: Prop[];
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
      c = { cx, cz, bounds: rect(cx * CHUNK_SIZE, (cx + 1) * CHUNK_SIZE, cz * CHUNK_SIZE, (cz + 1) * CHUNK_SIZE), lots: [], trees: [], lamps: [], props: [] };
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
  for (const p of d.props) get(p.x, p.z).props.push(p);
  return map;
}

/** Things a walking character can't pass: buildings, fences' footprints are the plots' edges (kept simple), tree trunks. */
export function walkBlockers(d: District): Rect[] {
  const out: Rect[] = [];
  for (const l of d.lots) {
    if (hasInterior(l)) out.push(...planBlockers(generatePlan(l)));
    else out.push(l.footprint);
  }
  for (const t of d.trees) out.push(rect(t.x - 0.35, t.x + 0.35, t.z - 0.35, t.z + 0.35));
  for (const l of d.lamps) out.push(rect(l.x - 0.15, l.x + 0.15, l.z - 0.15, l.z + 0.15));
  for (const p of d.props) {
    const r = { pole: [0.15, 0.15], hydrant: [0.2, 0.2], bin: [0.3, 0.3], sign: [0.1, 0.1], bench: [0.9, 0.3], busStop: [1.5, 0.8], car: [0.95, 2.2], plane: [4.8, 5.2] }[p.kind];
    const [hx, hz] = p.yaw === 90 ? [r[1]!, r[0]!] : [r[0]!, r[1]!];
    // A car is long along the road: yaw 0 means the road runs north-south (z), so its long side is z; the table above is (x, z) for yaw 0.
    out.push(rect(p.x - hx, p.x + hx, p.z - hz, p.z + hz));
  }
  return out;
}
