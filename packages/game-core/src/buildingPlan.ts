// Room layouts for houses, flats and shops: walls with door and window openings, rooms, stairs, garages and furniture.
// Pure data, generated deterministically from the lot, so the client draws it and the server can check walking against it.

import type { Facing, Lot, Rect } from "./district.js";

export type OpeningKind = "door" | "window" | "garage";
export type RoomKind =
  | "living" | "kitchen" | "bedroom" | "bath" | "garage" | "hall" | "shop" | "store"
  | "lobby" | "office" | "ward" | "cell" | "classroom" | "vault" | "prayer" | "nave" | "pharmacy" | "guestroom" | "engine" | "crew" | "dining";

export const WALL_THICKNESS = 0.2;
export const DOOR_WIDTH = 1.2;
export const DOOR_HEIGHT = 2.1;
export const SILL = 0.9;
export const WINDOW_TOP = 2.1;

export interface Opening {
  kind: OpeningKind;
  /** Metres from the wall's start (a) to the opening's start and end. */
  t0: number;
  t1: number;
}

export interface PlanWall {
  floor: number;
  /** Axis-aligned: either a.x === b.x or a.z === b.z. a is the smaller coordinate. */
  a: { x: number; z: number };
  b: { x: number; z: number };
  exterior: boolean;
  openings: Opening[];
}

export interface PlanRoom {
  id: string;
  kind: RoomKind;
  floor: number;
  rect: Rect;
}

export interface PlanStairs {
  /** The footprint of the stair flight; it climbs from `floor` to `floor + 1` heading toward `climbs`. */
  rect: Rect;
  floor: number;
  climbs: Facing;
}

export interface PlanFurniture {
  kind:
    | "sofa" | "table" | "tv" | "bed" | "wardrobe" | "counter" | "fridge" | "stove" | "toilet" | "basin" | "shower" | "shelf" | "crate" | "car" | "desk"
    | "bench" | "pew" | "bunk" | "board" | "safe" | "truck" | "altar" | "bars" | "drip";
  floor: number;
  rect: Rect;
  /** Height in metres. */
  height: number;
}

export interface BuildingPlan {
  lotId: string;
  floors: number;
  storey: number;
  rooms: PlanRoom[];
  walls: PlanWall[];
  stairs: PlanStairs[];
  furniture: PlanFurniture[];
  /** A spot just inside the front door, for tests and for walking in. */
  inside: { x: number; z: number };
  garage: Rect | null;
}

const rect = (minX: number, maxX: number, minZ: number, maxZ: number): Rect => ({ minX, maxX, minZ, maxZ });

/** The named places that have a real inside (the airport, fuel station and market keep their shells for now). */
const HOLLOW_LANDMARKS = new Set(["police", "hospital", "school", "church", "mosque", "fire", "bank", "hotel"]);

/** Which lots get a real interior. */
export function hasInterior(lot: Lot): boolean {
  if (lot.landmark) return HOLLOW_LANDMARKS.has(lot.landmark);
  return lot.kind === "house" || lot.kind === "flats" || lot.kind === "shop";
}

type FKind = PlanFurniture["kind"];

/**
 * How a named place re-dresses the house layout (a lobby in front, three rooms behind, a landing and rooms upstairs): what each
 * room is called, which pieces of furniture become what (null = removed) and a few extras. The walls, doors and stairs stay the
 * same, so every place is as easy to walk through as a house.
 */
interface Theme {
  ground: Partial<Record<RoomKind, RoomKind>>;
  upper: Partial<Record<RoomKind, RoomKind>>;
  f0: Partial<Record<FKind, FKind | null>>;
  fUp: Partial<Record<FKind, FKind | null>>;
}

const THEMES: Record<string, Theme> = {
  police: {
    ground: { living: "lobby", kitchen: "office", bedroom: "cell", bath: "bath" },
    upper: { bedroom: "office", hall: "hall" },
    f0: { sofa: "bench", tv: "counter", table: null, counter: "desk", fridge: "shelf", bed: "bunk", shower: "basin" },
    fUp: { bed: "desk", wardrobe: "shelf" },
  },
  hospital: {
    ground: { living: "lobby", kitchen: "pharmacy", bedroom: "ward", bath: "bath" },
    upper: { bedroom: "ward", hall: "hall" },
    f0: { sofa: "bench", tv: "counter", table: null, counter: "counter", fridge: "shelf", bed: "bed", shower: "basin" },
    fUp: { bed: "bed", wardrobe: "drip" },
  },
  school: {
    ground: { living: "classroom", kitchen: "office", bedroom: "office", bath: "bath" },
    upper: { bedroom: "classroom", hall: "hall" },
    f0: { sofa: "board", tv: "desk", table: "desk", counter: "desk", fridge: "shelf", bed: "desk", shower: "basin" },
    fUp: { bed: "desk", wardrobe: "board" },
  },
  bank: {
    ground: { living: "lobby", kitchen: "office", bedroom: "vault", bath: "bath" },
    upper: { bedroom: "office", hall: "hall" },
    f0: { sofa: "bench", tv: "counter", table: "counter", counter: "desk", fridge: "shelf", bed: "safe", shower: "basin" },
    fUp: { bed: "desk", wardrobe: "shelf" },
  },
  hotel: {
    ground: { living: "lobby", kitchen: "dining", bedroom: "dining", bath: "bath" },
    upper: { bedroom: "guestroom", hall: "hall" },
    f0: { sofa: "sofa", tv: "counter", table: "table", counter: "counter", fridge: "fridge", bed: "table", shower: "basin" },
    fUp: { bed: "bed", wardrobe: "wardrobe" },
  },
  fire: {
    ground: { living: "engine", kitchen: "crew", bedroom: "crew", bath: "bath" },
    upper: { bedroom: "crew", hall: "hall" },
    f0: { sofa: "truck", tv: "shelf", table: null, counter: "counter", fridge: "fridge", bed: "bunk", shower: "basin" },
    fUp: { bed: "bunk", wardrobe: "shelf" },
  },
  church: {
    ground: { living: "nave", kitchen: "office", bedroom: "office", bath: "bath" },
    upper: {},
    f0: { sofa: "pew", tv: "altar", table: "pew", counter: "shelf", fridge: "shelf", bed: "desk", shower: "basin" },
    fUp: {},
  },
  mosque: {
    ground: { living: "prayer", kitchen: "office", bedroom: "office", bath: "bath" },
    upper: {},
    f0: { sofa: null, tv: "shelf", table: null, counter: "shelf", fridge: "shelf", bed: null, shower: "basin" },
    fUp: {},
  },
};

/** Maps building-local coordinates (u across the front, v from the front inward) to the world. */
function mapper(f: Rect, facing: Facing) {
  const W = facing === 0 || facing === 2 ? f.maxX - f.minX : f.maxZ - f.minZ;
  const D = facing === 0 || facing === 2 ? f.maxZ - f.minZ : f.maxX - f.minX;
  const at = (u: number, v: number): { x: number; z: number } => {
    switch (facing) {
      case 0: return { x: f.minX + u, z: f.minZ + v };
      case 2: return { x: f.minX + u, z: f.maxZ - v };
      case 1: return { x: f.maxX - v, z: f.minZ + u };
      default: return { x: f.minX + v, z: f.minZ + u };
    }
  };
  /** A local rectangle as a world rectangle. */
  const box = (u0: number, u1: number, v0: number, v1: number): Rect => {
    const p = at(u0, v0);
    const q = at(u1, v1);
    return rect(Math.min(p.x, q.x), Math.max(p.x, q.x), Math.min(p.z, q.z), Math.max(p.z, q.z));
  };
  return { W, D, at, box };
}

export function generatePlan(lot: Lot): BuildingPlan {
  const f = lot.footprint;
  const m = mapper(f, lot.facing);
  const { W, D } = m;
  const floors = lot.floors;
  const walls: PlanWall[] = [];
  const rooms: PlanRoom[] = [];
  const stairs: PlanStairs[] = [];
  const furniture: PlanFurniture[] = [];
  const shop = lot.kind === "shop";
  const garageW = lot.garage && W > 11 ? 3.6 : 0;
  const mainW = W - garageW;
  const vf = Math.max(4.8, Math.min(D * 0.52, D - 3.2)); // where the front band ends

  /** A wall in local coordinates. `along` is "u" (runs across, at depth `at`) or "v" (runs inward, at width `at`). */
  const wall = (floor: number, along: "u" | "v", at: number, from: number, to: number, exterior: boolean, openings: { kind: OpeningKind; centre: number; width?: number }[] = []) => {
    const p = along === "u" ? m.at(from, at) : m.at(at, from);
    const q = along === "u" ? m.at(to, at) : m.at(at, to);
    const a = { x: Math.min(p.x, q.x), z: Math.min(p.z, q.z) };
    const b = { x: Math.max(p.x, q.x), z: Math.max(p.z, q.z) };
    // Openings are given along the local direction; convert to distance from the wall's start (the smaller world coordinate).
    const reversed = (p.x > q.x) || (p.z > q.z);
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const list: Opening[] = openings.map((o) => {
      const w = o.width ?? (o.kind === "door" ? DOOR_WIDTH : o.kind === "garage" ? 2.8 : 1.2);
      const local0 = o.centre - w / 2 - from;
      const t0 = reversed ? length - (local0 + w) : local0;
      return { kind: o.kind, t0: Math.max(0.1, t0), t1: Math.min(length - 0.1, t0 + w) };
    });
    walls.push({ floor, a, b, exterior, openings: list });
  };

  const room = (id: string, kind: RoomKind, floor: number, u0: number, u1: number, v0: number, v1: number) => {
    const r = { id: `${lot.id}:${id}`, kind, floor, rect: m.box(u0, u1, v0, v1) };
    rooms.push(r);
    return r;
  };

  // ---- ground floor
  const frontDoorU = Math.min(mainW * 0.3, mainW - 1);
  if (shop) {
    const vs = D * 0.7;
    room("shop", "shop", 0, 0, W, 0, vs);
    room("store", "store", 0, 0, W, vs, D);
    wall(0, "u", 0, 0, W, true, [{ kind: "door", centre: W * 0.35, width: 1.4 }, { kind: "window", centre: W * 0.72, width: Math.max(2, W * 0.28) }]);
    wall(0, "u", D, 0, W, true, [{ kind: "window", centre: W * 0.5 }]);
    wall(0, "u", vs, 0, W, false, [{ kind: "door", centre: W * 0.8 }]);
    for (const at of [0, W]) wall(0, "v", at, 0, D, true, [{ kind: "window", centre: vs * 0.5 }, { kind: "window", centre: vs + (D - vs) * 0.5 }]);
    for (let k = 0; k < 3; k++) furniture.push({ kind: "shelf", floor: 0, rect: m.box(2.4, W * 0.6, 2.2 + k * 1.6, 2.7 + k * 1.6), height: 1.6 });
    furniture.push({ kind: "counter", floor: 0, rect: m.box(W * 0.62, W * 0.62 + 2.4, 1.2, 1.9), height: 1 });
    for (let k = 0; k < 3; k++) furniture.push({ kind: "crate", floor: 0, rect: m.box(1 + k * 1.3, 1.9 + k * 1.3, vs + 0.5, vs + 1.4), height: 0.7 });
  } else {
    const living = room("living", "living", 0, 0, mainW, 0, vf);
    void living;
    const kW = mainW * 0.4;
    const bW = mainW * 0.72;
    room("kitchen", "kitchen", 0, 0, kW, vf, D);
    room("bedroom", "bedroom", 0, kW, bW, vf, D);
    room("bath", "bath", 0, bW, mainW, vf, D);
    if (garageW) room("garage", "garage", 0, mainW, W, 0, D);
    // Exterior walls. The front gets the door and windows; the garage bay has its own door.
    wall(0, "u", 0, 0, mainW, true, [{ kind: "door", centre: frontDoorU }, { kind: "window", centre: mainW * 0.72 }]);
    if (garageW) wall(0, "u", 0, mainW, W, true, [{ kind: "garage", centre: mainW + garageW / 2, width: 2.8 }]);
    wall(0, "u", D, 0, W, true, [{ kind: "window", centre: kW * 0.5, width: 1.1 }, { kind: "window", centre: (kW + bW) / 2 }, { kind: "window", centre: (bW + mainW) / 2, width: 0.7 }]);
    wall(0, "v", 0, 0, D, true, [{ kind: "window", centre: vf * 0.5 }, { kind: "window", centre: vf + (D - vf) * 0.5, width: 1 }]);
    wall(0, "v", W, 0, D, true, garageW ? [] : [{ kind: "window", centre: vf * 0.5 }]);
    // Inside: the wall between the living room and the back rooms, with a door to each; the dividers behind it.
    wall(0, "u", vf, 0, mainW, false, [{ kind: "door", centre: kW * 0.5 }, { kind: "door", centre: (kW + bW) / 2 }, { kind: "door", centre: (bW + mainW) / 2, width: 1.1 }]);
    wall(0, "v", kW, vf, D, false);
    wall(0, "v", bW, vf, D, false);
    if (garageW) wall(0, "v", mainW, 0, D, false, [{ kind: "door", centre: Math.min(2.2, vf - 0.8) }]);
    // Furniture sits in corners, away from the doors.
    furniture.push({ kind: "sofa", floor: 0, rect: m.box(mainW - 1.1, mainW - 0.3, 1.1, 3.1), height: 0.85 });
    furniture.push({ kind: "tv", floor: 0, rect: m.box(mainW - 2.6, mainW - 0.8, 0.3, 0.8), height: 1.1 });
    furniture.push({ kind: "table", floor: 0, rect: m.box(mainW - 2.6, mainW - 1.7, 1.5, 2.5), height: 0.45 });
    furniture.push({ kind: "counter", floor: 0, rect: m.box(0.3, kW - 0.3, D - 0.9, D - 0.3), height: 0.9 });
    furniture.push({ kind: "fridge", floor: 0, rect: m.box(0.3, 1.0, vf + 0.3, vf + 1.0), height: 1.8 });
    furniture.push({ kind: "bed", floor: 0, rect: m.box(kW + 0.4, Math.min(bW - 0.3, kW + 2.0), D - 2.3, D - 0.3), height: 0.55 });
    furniture.push({ kind: "toilet", floor: 0, rect: m.box(bW + 0.25, bW + 0.85, D - 0.8, D - 0.25), height: 0.7 });
    furniture.push({ kind: "shower", floor: 0, rect: m.box(mainW - 0.95, mainW - 0.25, D - 0.95, D - 0.25), height: 2 });
    if (garageW) furniture.push({ kind: "car", floor: 0, rect: m.box(mainW + 0.7, W - 0.7, 1.4, 5.8), height: 1.5 });
  }

  // ---- the first flight of stairs: against the left wall, climbing toward the back, ending at a landing in front of the back wall.
  const toBack: Facing = lot.facing === 0 ? 2 : lot.facing === 2 ? 0 : lot.facing === 1 ? 3 : 1;
  const toRight: Facing = lot.facing === 0 || lot.facing === 2 ? 1 : 2; // +u in the world
  if (floors > 1) stairs.push({ rect: m.box(0.3, 1.5, vf - 4.2, vf - 1.2), floor: 0, climbs: toBack });

  // ---- upper floors: a stair hall at the front-left, two bedrooms beside it, a landing and bathroom behind (a shop's upstairs is an office).
  const hallW = 1.8;
  for (let fl = 1; fl < floors; fl++) {
    const uw = W;
    const half = uw / 2;
    room(`stairs${fl}`, "hall", fl, 0, hallW, 0, vf);
    room(`bed${fl}a`, "bedroom", fl, hallW, half, 0, vf);
    room(`bed${fl}b`, "bedroom", fl, half, uw, 0, vf);
    room(`hall${fl}`, "hall", fl, 0, uw * 0.65, vf, D);
    room(`bath${fl}`, "bath", fl, uw * 0.65, uw, vf, D);
    wall(fl, "u", 0, 0, uw, true, [{ kind: "window", centre: (hallW + half) / 2 }, { kind: "window", centre: half * 1.5 }]);
    wall(fl, "u", D, 0, uw, true, [{ kind: "window", centre: uw * 0.3 }, { kind: "window", centre: uw * 0.82, width: 0.8 }]);
    for (const at of [0, uw]) wall(fl, "v", at, 0, D, true, [{ kind: "window", centre: vf * 0.5 }, { kind: "window", centre: vf + (D - vf) * 0.5, width: 1 }]);
    // The stair hall opens straight onto the landing; each bedroom has its own door onto the landing.
    wall(fl, "u", vf, 0, uw, false, [
      { kind: "door", centre: 0.9 },
      { kind: "door", centre: (hallW + half) / 2 },
      { kind: "door", centre: (half + uw * 0.65) / 2 },
    ]);
    wall(fl, "v", hallW, 0, vf, false);
    wall(fl, "v", half, 0, vf, false);
    wall(fl, "v", uw * 0.65, vf, D, false, [{ kind: "door", centre: (vf + D) / 2, width: 1.1 }]);
    furniture.push({ kind: "bed", floor: fl, rect: m.box(hallW + 0.4, hallW + 2.4, 0.3, 2.3), height: 0.55 }, { kind: "bed", floor: fl, rect: m.box(half + 0.4, half + 2.4, 0.3, 2.3), height: 0.55 });
    furniture.push({ kind: "wardrobe", floor: fl, rect: m.box(half - 0.7, half - 0.15, 3.0, 4.4), height: 2 }, { kind: "wardrobe", floor: fl, rect: m.box(uw - 0.7, uw - 0.15, 3.0, 4.4), height: 2 });
    furniture.push({ kind: "toilet", floor: fl, rect: m.box(uw - 0.9, uw - 0.3, D - 0.9, D - 0.3), height: 0.7 });
    // Higher flights run along the landing, climbing to the right.
    if (fl + 1 < floors) {
      const run = Math.min(3, uw * 0.65 - hallW - 1.7);
      stairs.push({ rect: m.box(hallW + 0.1, hallW + 0.1 + run, vf + 1.6, vf + 2.8), floor: fl, climbs: toRight });
    }
    if (shop) furniture.push({ kind: "desk", floor: fl, rect: m.box(uw - 3.2, uw - 1.6, vf + 2.2, vf + 3), height: 0.75 });
  }

  const theme = lot.landmark ? THEMES[lot.landmark] : undefined;
  if (theme) {
    for (const r of rooms) r.kind = (r.floor === 0 ? theme.ground : theme.upper)[r.kind] ?? r.kind;
    const mapped: PlanFurniture[] = [];
    for (const item of furniture) {
      const to = (item.floor === 0 ? theme.f0 : theme.fUp)[item.kind];
      if (to === null) continue;
      mapped.push(to ? { ...item, kind: to } : item);
    }
    furniture.length = 0;
    furniture.push(...mapped);
  }

  if (theme && !shop) {
    // Benches between the doors on the lobby's back wall (pews in a church), and a few things that make each place what it is.
    const seats: FKind = lot.landmark === "church" ? "pew" : lot.landmark === "mosque" ? "shelf" : "bench";
    const segs: [number, number][] = [[mainW * 0.2 + 0.95, mainW * 0.56 - 0.95], [mainW * 0.56 + 0.95, mainW * 0.86 - 0.95]];
    for (const [a, c] of segs) if (c - a > 1.4) furniture.push({ kind: seats, floor: 0, rect: m.box(a, c, vf - 0.7, vf - 0.2), height: seats === "shelf" ? 1.8 : 0.9 });
    if (lot.landmark === "fire") furniture.push({ kind: "truck", floor: 0, rect: m.box(mainW - 3.2, mainW - 0.5, 0.4, 3.2), height: 2 });
    if (lot.landmark === "school") furniture.push({ kind: "desk", floor: 0, rect: m.box(mainW * 0.64, mainW * 0.64 + 1.1, 1.2, 1.8), height: 0.75 }, { kind: "desk", floor: 0, rect: m.box(mainW * 0.64, mainW * 0.64 + 1.1, 2.4, 3.0), height: 0.75 });
    if (lot.landmark === "church") furniture.push({ kind: "pew", floor: 0, rect: m.box(mainW * 0.62, mainW * 0.62 + 2.2, 1.2, 1.7), height: 0.9 }, { kind: "pew", floor: 0, rect: m.box(mainW * 0.62, mainW * 0.62 + 2.2, 2.4, 2.9), height: 0.9 });
    if (lot.landmark === "police") furniture.push({ kind: "board", floor: 0, rect: m.box(mainW * 0.4, mainW * 0.4 + 1.8, 0.2, 0.3), height: 2 });
    if (lot.landmark === "hospital") furniture.push({ kind: "drip", floor: 0, rect: m.box(mainW * 0.4 + 1.7, mainW * 0.4 + 1.95, D - 1.0, D - 0.75), height: 1.8 });
  }

  const inside = m.at(frontDoorU, 1.4);
  return {
    lotId: lot.id,
    floors,
    storey: lot.storey,
    rooms,
    walls,
    stairs,
    furniture,
    inside: shop ? m.at(W * 0.35, 1.4) : inside,
    garage: garageW ? m.box(mainW, W, 0, D) : null,
  };
}

/** Which way a flight climbs, as a unit step in the world. */
export function climbStep(climbs: Facing): { x: number; z: number } {
  return climbs === 0 ? { x: 0, z: -1 } : climbs === 1 ? { x: 1, z: 0 } : climbs === 2 ? { x: 0, z: 1 } : { x: -1, z: 0 };
}

/** Where along a flight a point is: 0 at the bottom end, 1 at the top end (null if it is not on the flight). */
export function stairProgress(s: PlanStairs, x: number, z: number, margin = 0): number | null {
  const r = s.rect;
  if (x < r.minX - margin || x > r.maxX + margin || z < r.minZ - margin || z > r.maxZ + margin) return null;
  const step = climbStep(s.climbs);
  const length = step.x !== 0 ? r.maxX - r.minX : r.maxZ - r.minZ;
  const along = step.x !== 0 ? (step.x > 0 ? x - r.minX : r.maxX - x) : step.z > 0 ? z - r.minZ : r.maxZ - z;
  return Math.max(0, Math.min(1, along / length));
}

/**
 * The solid pieces on one floor that block walking: wall segments between the openings, furniture, and the rails round
 * stairs. A flight that starts on this floor is closed at its top end and along its sides (you enter at the bottom); the
 * hole of the flight coming up from below is closed along its sides and bottom end (you step off at the top).
 */
export function planBlockers(plan: BuildingPlan, floor = 0): Rect[] {
  const out: Rect[] = [];
  const t = WALL_THICKNESS / 2;
  for (const w of plan.walls) {
    if (w.floor !== floor) continue;
    const alongX = w.a.z === w.b.z;
    const length = alongX ? w.b.x - w.a.x : w.b.z - w.a.z;
    const open = w.openings.filter((o) => o.kind !== "window").sort((p, q) => p.t0 - q.t0);
    let at = 0;
    const segment = (s0: number, s1: number) => {
      if (s1 - s0 < 0.02) return;
      out.push(alongX ? rect(w.a.x + s0, w.a.x + s1, w.a.z - t, w.a.z + t) : rect(w.a.x - t, w.a.x + t, w.a.z + s0, w.a.z + s1));
    };
    for (const o of open) {
      segment(at, o.t0);
      at = o.t1;
    }
    segment(at, length);
  }
  for (const item of plan.furniture) if (item.floor === floor) out.push(item.rect);
  const rail = (s: PlanStairs, closeTop: boolean, closeBottom: boolean) => {
    const r = s.rect;
    const step = climbStep(s.climbs);
    const gap = 0.15;
    const th = 0.1;
    if (step.x === 0) {
      out.push(rect(r.minX - gap - th, r.minX - gap, r.minZ, r.maxZ), rect(r.maxX + gap, r.maxX + gap + th, r.minZ, r.maxZ));
      const top = step.z > 0 ? r.maxZ : r.minZ;
      const bottom = step.z > 0 ? r.minZ : r.maxZ;
      const end = (z: number, dir: number) => rect(r.minX - gap, r.maxX + gap, dir > 0 ? z + gap : z - gap - th, dir > 0 ? z + gap + th : z - gap);
      if (closeTop) out.push(end(top, step.z));
      if (closeBottom) out.push(end(bottom, -step.z));
    } else {
      out.push(rect(r.minX, r.maxX, r.minZ - gap - th, r.minZ - gap), rect(r.minX, r.maxX, r.maxZ + gap, r.maxZ + gap + th));
      const top = step.x > 0 ? r.maxX : r.minX;
      const bottom = step.x > 0 ? r.minX : r.maxX;
      const end = (x: number, dir: number) => rect(dir > 0 ? x + gap : x - gap - th, dir > 0 ? x + gap + th : x - gap, r.minZ - gap, r.maxZ + gap);
      if (closeTop) out.push(end(top, step.x));
      if (closeBottom) out.push(end(bottom, -step.x));
    }
  };
  for (const s of plan.stairs) {
    if (s.floor === floor) rail(s, true, false);
    if (s.floor === floor - 1) rail(s, false, true);
  }
  return out;
}
