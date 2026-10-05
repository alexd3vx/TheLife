import * as THREE from "three";
import { DOOR_HEIGHT, SILL, WALL_THICKNESS, WINDOW_TOP, type BuildingPlan, type Lot, type PlanFurniture, type PlanRoom, type PlanStairs, type PlanWall, type Rect } from "@thelife/game-core";
import type { MeshBuilder } from "./meshBuilder";

const C = (hex: string) => new THREE.Color(hex);
const INNER = C("#efe9dd");
const GLASS = C("#3a5068");
const FLOOR: Record<string, THREE.Color> = {
  living: C("#b98d5e"), kitchen: C("#d8d4c8"), bedroom: C("#c9a678"), bath: C("#a9cde0"), garage: C("#8d8b86"), hall: C("#c0a07a"), shop: C("#cfc6b4"), store: C("#a9a395"),
};
const WOOD = C("#8a6a46");
const FABRIC = C("#5f6f8a");
const WHITE = C("#f3f3f1");
const DARK = C("#2f3338");
const METAL = C("#9aa1a8");
const CAR = C("#9aa5b2");

/** One wall piece (a box): along x or z, between s0 and s1 from the wall's start, between heights y0 and y1, `lo..hi` across its thickness. */
function piece(b: MeshBuilder, w: PlanWall, s0: number, s1: number, y0: number, y1: number, lo: number, hi: number, color: THREE.Color) {
  if (s1 - s0 < 0.005 || y1 - y0 < 0.005) return;
  if (w.a.z === w.b.z) b.box(w.a.x + s0, y0, w.a.z + lo, w.a.x + s1, y1, w.a.z + hi, color, 0.88);
  else b.box(w.a.x + lo, y0, w.a.z + s0, w.a.x + hi, y1, w.a.z + s1, color, 0.88);
}

/** A wall with real holes for its doors and windows, split into an outside skin and an inside skin so each side has its own colour. */
function addWall(b: MeshBuilder, w: PlanWall, f: Rect, y0: number, y1: number, outside: THREE.Color) {
  const alongX = w.a.z === w.b.z;
  const length = alongX ? w.b.x - w.a.x : w.b.z - w.a.z;
  const t = WALL_THICKNESS / 2;
  // For exterior walls: which half faces the street?
  let lo = -t, mid = 0, hi = t, outer: "lo" | "hi" = "lo";
  if (w.exterior) {
    const centre = alongX ? (f.minZ + f.maxZ) / 2 : (f.minX + f.maxX) / 2;
    const at = alongX ? w.a.z : w.a.x;
    outer = at < centre ? "lo" : "hi";
  }
  const skins: [number, number, THREE.Color][] = w.exterior
    ? outer === "lo"
      ? [[lo, mid, outside], [mid, hi, INNER]]
      : [[lo, mid, INNER], [mid, hi, outside]]
    : [[lo, hi, INNER]];
  const openings = [...w.openings].sort((p, q) => p.t0 - q.t0);
  for (const [a, c, color] of skins) {
    let at = 0;
    for (const o of openings) {
      piece(b, w, at, o.t0, y0, y1, a, c, color);
      const top = o.kind === "window" ? WINDOW_TOP : o.kind === "garage" ? 2.4 : DOOR_HEIGHT;
      if (o.kind === "window") piece(b, w, o.t0, o.t1, y0, y0 + SILL, a, c, color);
      piece(b, w, o.t0, o.t1, y0 + top, y1, a, c, color);
      at = o.t1;
    }
    piece(b, w, at, length, y0, y1, a, c, color);
  }
  // Window glass sits in the middle of the wall.
  for (const o of openings) if (o.kind === "window") piece(b, w, o.t0, o.t1, y0 + SILL, y0 + WINDOW_TOP, -0.02, 0.02, GLASS);
}

function slab(b: MeshBuilder, f: Rect, y0: number, y1: number, holes: Rect[], color: THREE.Color) {
  // Cut each hole out of the slab as four boxes around it (holes are small and do not overlap).
  let pieces: Rect[] = [f];
  for (const h of holes) {
    const next: Rect[] = [];
    for (const p of pieces) {
      if (h.maxX <= p.minX || h.minX >= p.maxX || h.maxZ <= p.minZ || h.minZ >= p.maxZ) {
        next.push(p);
        continue;
      }
      if (h.minX > p.minX) next.push({ minX: p.minX, maxX: h.minX, minZ: p.minZ, maxZ: p.maxZ });
      if (h.maxX < p.maxX) next.push({ minX: h.maxX, maxX: p.maxX, minZ: p.minZ, maxZ: p.maxZ });
      const x0 = Math.max(p.minX, h.minX), x1 = Math.min(p.maxX, h.maxX);
      if (h.minZ > p.minZ) next.push({ minX: x0, maxX: x1, minZ: p.minZ, maxZ: h.minZ });
      if (h.maxZ < p.maxZ) next.push({ minX: x0, maxX: x1, minZ: h.maxZ, maxZ: p.maxZ });
    }
    pieces = next;
  }
  for (const p of pieces) b.box(p.minX, y0, p.minZ, p.maxX, y1, p.maxZ, color, 0.9);
}

function addStairs(b: MeshBuilder, s: PlanStairs, storey: number) {
  const r = s.rect;
  const steps = 14;
  const rise = storey / steps;
  const alongZ = r.maxZ - r.minZ >= r.maxX - r.minX;
  const len = alongZ ? r.maxZ - r.minZ : r.maxX - r.minX;
  const positive = s.climbs === 2 || s.climbs === 1; // heading toward +z or +x
  for (let i = 0; i < steps; i++) {
    const s0 = (i / steps) * len;
    const s1 = ((i + 1) / steps) * len;
    const a = positive ? s0 : len - s1;
    const c = positive ? s1 : len - s0;
    const y0 = s.floor * storey;
    if (alongZ) b.box(r.minX, y0, r.minZ + a, r.maxX, y0 + (i + 1) * rise, r.minZ + c, WOOD, 0.9);
    else b.box(r.minX + a, y0, r.minZ, r.minX + c, y0 + (i + 1) * rise, r.maxZ, WOOD, 0.9);
  }
}

function addFurniture(b: MeshBuilder, item: PlanFurniture, y: number) {
  const r = item.rect;
  const h = item.height;
  const box = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, color: THREE.Color) => b.box(x0, y + y0, z0, x1, y + y1, z1, color, 0.88);
  switch (item.kind) {
    case "sofa":
      box(r.minX, r.minZ, r.maxX, r.maxZ, 0, 0.45, FABRIC);
      if (r.maxX - r.minX < r.maxZ - r.minZ) box(r.maxX - 0.25, r.minZ, r.maxX, r.maxZ, 0.45, h, FABRIC);
      else box(r.minX, r.maxZ - 0.25, r.maxX, r.maxZ, 0.45, h, FABRIC);
      return;
    case "bed":
      box(r.minX, r.minZ, r.maxX, r.maxZ, 0, 0.45, WOOD);
      box(r.minX + 0.05, r.minZ + 0.05, r.maxX - 0.05, r.maxZ - 0.05, 0.45, h, C("#e7dfd0"));
      return;
    case "car":
      b.box(r.minX, y + 0.3, r.minZ, r.maxX, y + 0.95, r.maxZ, CAR, 0.85);
      b.box(r.minX + 0.15, y + 0.95, r.minZ + (r.maxZ - r.minZ) * 0.25, r.maxX - 0.15, y + 1.5, r.maxZ - (r.maxZ - r.minZ) * 0.25, GLASS, 0.9);
      return;
    case "tv":
      box(r.minX, r.minZ, r.maxX, r.maxZ, 0, 0.4, WOOD);
      box(r.minX + 0.1, r.minZ + 0.05, r.maxX - 0.1, r.maxZ - 0.05, 0.4, h, DARK);
      return;
    case "shelf":
      box(r.minX, r.minZ, r.maxX, r.maxZ, 0, h, C("#b89a6e"));
      return;
    case "crate":
      box(r.minX, r.minZ, r.maxX, r.maxZ, 0, h, C("#a57a52"));
      return;
    case "fridge":
    case "stove":
      box(r.minX, r.minZ, r.maxX, r.maxZ, 0, h, item.kind === "fridge" ? WHITE : METAL);
      return;
    case "toilet":
    case "basin":
    case "shower":
      box(r.minX, r.minZ, r.maxX, r.maxZ, 0, h, item.kind === "shower" ? C("#cfe3ea") : WHITE);
      return;
    default:
      box(r.minX, r.minZ, r.maxX, r.maxZ, 0, h, item.kind === "wardrobe" ? C("#7a5a3a") : item.kind === "counter" ? C("#bfb6a4") : WOOD);
  }
}

function roomFloor(b: MeshBuilder, room: PlanRoom, y: number) {
  b.flat(room.rect.minX, room.rect.minZ, room.rect.maxX, room.rect.maxZ, y + 0.012, FLOOR[room.kind] ?? FLOOR.hall!);
}

/**
 * The inside of a building: floors, walls with doors and windows, stairs, furniture. The ground floor goes into `ground`
 * (part of the chunk) and everything above it into `cap`, which can be hidden to look inside.
 */
export function addInterior(ground: MeshBuilder, cap: MeshBuilder, lot: Lot, plan: BuildingPlan, outside: THREE.Color, lotNo: number): void {
  const f = lot.footprint;
  const storey = plan.storey;
  // The ground floor: a floor slab under the whole building.
  ground.box(f.minX, -0.2, f.minZ, f.maxX, 0.0, f.maxZ, C("#9a9387"), 0.9);
  for (let k = 0; k < plan.floors; k++) {
    const b = k === 0 ? ground : cap;
    if (k > 0) cap.setLot(lotNo * 8 + k); // so the roof cutaway can hide floors above the one the player is on
    const y0 = k * storey;
    const top = k + 1 < plan.floors ? y0 + storey - 0.2 : y0 + storey;
    if (k > 0) {
      const holes = plan.stairs.filter((s) => s.floor === k - 1).map((s) => s.rect);
      slab(b, f, y0 - 0.2, y0, holes, C("#d8d1c2"));
    }
    for (const room of plan.rooms.filter((r) => r.floor === k)) roomFloor(b, room, y0);
    for (const w of plan.walls.filter((x) => x.floor === k)) addWall(b, w, f, y0, top, outside);
    for (const s of plan.stairs.filter((x) => x.floor === k)) addStairs(b, s, storey);
    for (const item of plan.furniture.filter((x) => x.floor === k)) addFurniture(b, item, y0);
  }
}
