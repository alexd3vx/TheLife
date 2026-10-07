import type { HomeChanges } from "@thelife/game-core";
import { HOUSE_LAYOUT, type Layout, type Placement, type WallDef } from "./layout";

// Where each background lives, indoors. The middle class has the flat (HOUSE_LAYOUT); a lapo rents one room with a cubicle for a
// bathroom; a nepo has a furnished duplex-style home. All are data: pieces from the catalog, positions in metres.

const p = (id: string, furniture: string, x: number, z: number, extra: Partial<Placement> = {}): Placement => ({ id, furniture, x, z, ...extra });

/** Outer walls of a rectangle with a door gap in the south wall. */
function shell(minX: number, maxX: number, minZ: number, maxZ: number, door: [number, number]): WallDef[] {
  return [
    { a: [minX, minZ], b: [maxX, minZ], outward: [0, -1] },
    { a: [minX, maxZ], b: [door[0], maxZ], outward: [0, 1] },
    { a: [door[1], maxZ], b: [maxX, maxZ], outward: [0, 1] },
    { a: [minX, minZ], b: [minX, maxZ], outward: [-1, 0] },
    { a: [maxX, minZ], b: [maxX, maxZ], outward: [1, 0] },
  ];
}

// ---------------------------------------------------------------- lapo: one rented room, a cubicle for a bathroom
// What the landlord gives: bare walls, a bulb, a cubicle with a toilet, a basin and a shower, and a cooking spot. Everything else (a
// better bed, a TV, a fridge, a desk) has to be earned and bought.
export const LAPO_ROOM: Layout = {
  name: "Room",
  area: { minX: -8, maxX: 9, minZ: -5, maxZ: 8 },
  walls: [
    ...shell(-4.5, 6.5, -3, 4, [-3.3, -2.1]),
    // the bathroom, in the south-east corner: a solid wall to the room with a door in its north side
    { a: [4.0, 1.0], b: [4.4, 1.0], outward: null },
    { a: [5.5, 1.0], b: [6.5, 1.0], outward: null },
    { a: [4.0, 1.0], b: [4.0, 4.0], outward: null },
  ],
  doors: [
    { x: -2.7, z: 4, axis: "x", width: 1.2, leaf: 1, outward: [0, 1] },
    { x: 4.95, z: 1.0, axis: "x", width: 1.1, leaf: -1 },
  ],
  house: { bounds: { minX: -4.5, maxX: 6.5, minZ: -3, maxZ: 4 }, wallHeight: 2.6, wallThickness: 0.2 },
  start: { x: -2.7, z: 2.4, yaw: Math.PI },
  items: [
    p("bed", "old_bed_frame", -3.6, -1.85),
    p("base", "p_kitchen_base", 0.6, -2.59),
    p("stove", "electric_stove", 1.45, -2.56),
    p("pot", "brass_pot_01", 1.45, -2.56, { onTopOf: "stove", decor: true }),
    p("table", "small_wooden_table_01", -0.4, 0.2, { via: "chair" }),
    p("chair", "plastic_monobloc_chair_01", -0.4, 1.2, { rot: 180, action: "eatMeal" }),
    p("bulb", "lightbulb_01", 0, 0, { y: 2.3 }),
    p("jerrycan", "metal_jerrycan", -4.1, 1.9, { decor: true }),
    p("box", "cardboard_box_01", -4.0, 0.4, { decor: true }),
    p("toilet", "p_toilet", 4.45, 2.6, { rot: 90 }),
    p("basin", "p_basin", 6.15, 1.85, { rot: -90 }),
    p("shower", "p_shower", 5.75, 3.55, { rot: 180 }),
  ],
};

// ---------------------------------------------------------------- nepo: a furnished duplex-style home
const nepoWalls: WallDef[] = [
  ...shell(-8, 10, -5.5, 5.5, [-3.8, -2.4]),
  { a: [2, -5.5], b: [2, -1.0], outward: null },
  { a: [2, 0.4], b: [2, 5.5], outward: null },
  // master bathroom (north-east corner)
  { a: [6, -5.5], b: [6, -4.7], outward: null },
  { a: [6, -3.6], b: [6, -2.8], outward: null },
  { a: [6, -2.8], b: [10, -2.8], outward: null },
  // the study (south-east) is separated from the bedroom
  { a: [2, 0.4], b: [6, 0.4], outward: null },
];

export const NEPO_DUPLEX: Layout = {
  name: "Duplex",
  area: { minX: -10, maxX: 12, minZ: -7, maxZ: 8 },
  walls: nepoWalls,
  doors: [
    { x: -3.1, z: 5.5, axis: "x", width: 1.4, leaf: 1, outward: [0, 1] },
    { x: 2, z: -0.3, axis: "z", width: 1.4 },
    { x: 6, z: -4.15, axis: "z", width: 1.1, leaf: 1 },
  ],
  house: { bounds: { minX: -8, maxX: 10, minZ: -5.5, maxZ: 5.5 }, wallHeight: 2.9, wallThickness: 0.22 },
  start: { x: -3.1, z: 4.3, yaw: Math.PI },
  items: [
    // kitchen along the north wall
    p("fridge", "p_fridge", -7.4, -5.04),
    p("cab1", "p_kitchen_base", -6.5, -5.09),
    p("kitchenSink", "p_kitchen_sink", -5.6, -5.09),
    p("stove", "electric_stove", -4.75, -5.06),
    p("cab2", "p_kitchen_base", -3.9, -5.09),
    p("cab3", "p_kitchen_base", -3.0, -5.09),
    p("microwave", "vintage_microwave", -3.0, -5.1, { onTopOf: "cab3" }),
    p("kettle", "vintage_electric_kettle", -3.9, -5.1, { onTopOf: "cab2" }),
    p("wallCab1", "p_kitchen_wall", -6.5, -5.23, { y: 1.45 }),
    p("wallCab2", "p_kitchen_wall", -5.6, -5.23, { y: 1.45 }),
    p("wallCab3", "p_kitchen_wall", -3.9, -5.23, { y: 1.45 }),
    p("kitchenFan", "ceiling_fan", -5.2, -3.2),
    // dining
    p("table", "painted_wooden_table", -4.9, -1.0, { via: "chairS1" }),
    p("chairN1", "dining_chair_02", -5.5, -2.3, { action: "eatMeal" }),
    p("chairN2", "dining_chair_02", -4.3, -2.3, { action: "eatMeal" }),
    p("chairS1", "dining_chair_02", -5.5, 0.3, { rot: 180, action: "eatMeal" }),
    p("chairS2", "dining_chair_02", -4.3, 0.3, { rot: 180, action: "eatMeal" }),
    p("chairW", "painted_wooden_chair_01", -6.9, -1.0, { rot: 90, action: "eatMeal" }),
    p("chairE", "painted_wooden_chair_01", -2.9, -1.0, { rot: -90, action: "eatMeal" }),
    // living room
    p("tv", "p_tv_flat", -7.55, 3.2, { rot: 90, via: "sofa" }),
    p("sofa", "sofa_03", -4.4, 3.2, { rot: -90, link: ["tv"] }),
    p("sofa2", "sofa_02", -5.9, 4.85, { rot: 180, link: ["tv"] }),
    p("rug", "p_rug", -5.8, 3.2, { rot: 90 }),
    p("coffeeTable", "modern_coffee_table_02", -5.8, 3.2, { rot: 90 }),
    p("console", "ClassicConsole_01", -7.5, 4.6, { rot: 90 }),
    p("radioTable", "side_table_01", -2.6, 4.9),
    p("radio", "boombox", -2.6, 4.9, { onTopOf: "radioTable" }),
    p("floorLamp", "p_floor_lamp", -2.4, 2.4),
    p("plant1", "potted_plant_02", -7.5, 1.6),
    p("plant2", "potted_plant_01", 1.3, 4.8),
    p("livingFan", "ceiling_fan", -5.6, 3.0),
    p("doormat", "p_doormat", -3.1, 5.0),
    // master bedroom (north-east)
    p("bed", "GothicBed_01", 4.2, -4.0),
    p("nightL", "ClassicNightstand_01", 2.9, -5.05, { via: "bed" }),
    p("nightR", "ClassicNightstand_01", 5.4, -5.05, { via: "bed" }),
    p("wardrobe", "p_wardrobe", 2.6, -2.0, { rot: 90 }),
    p("commode", "GothicCommode_01", 5.4, -1.0),
    p("bedRug", "p_rug", 4.2, -1.8),
    p("bedFan", "ceiling_fan", 4.2, -2.4),
    p("mirror", "ornate_mirror_01", 3.4, -0.75, { y: 1.0, rot: 0 }),
    // master bathroom
    p("toilet", "p_toilet", 6.45, -3.4, { rot: 90 }),
    p("basin", "p_basin", 8.2, -3.15, { rot: 180 }),
    p("shower", "p_shower", 9.2, -4.8),
    // study (south-east)
    p("desk", "metal_office_desk", 4.2, 5.0, { via: "deskChair" }),
    p("deskChair", "SchoolChair_01", 4.2, 3.95, { action: "work", link: ["laptop"] }),
    p("laptop", "classic_laptop", 3.7, 5.0, { onTopOf: "desk", via: "deskChair" }),
    p("deskLamp", "desk_lamp_arm_01", 4.9, 5.0, { onTopOf: "desk", via: "deskChair" }),
    p("bookshelf", "wooden_bookshelf_worn", 9.5, 3.0, { rot: -90 }),
    p("studyDay", "vintage_day_bed", 6.4, 1.6, { rot: -90 }),
    p("washer", "p_washer", 9.5, 5.0, { rot: 180 }),
  ],
};

/** The home layout for a background. */
export function layoutForTier(tier: string | undefined): Layout {
  return tier === "lapo" ? LAPO_ROOM : tier === "nepo" ? NEPO_DUPLEX : HOUSE_LAYOUT;
}

/**
 * The starting layout with what the player changed on top: pieces moved or turned, pieces sold, pieces bought. Things resting on a
 * moved piece (a laptop on a desk) go with it.
 */
export function layoutWithHome(base: Layout, home: HomeChanges | undefined): Layout {
  if (!home) return base;
  const removed = new Set(home.removed);
  const items: Placement[] = [];
  const byId = new Map(base.items.map((i) => [i.id, i]));
  const shift = (id: string): { dx: number; dz: number } => {
    const m = home.moved[id];
    const b = byId.get(id);
    return m && b ? { dx: m.x - b.x, dz: m.z - b.z } : { dx: 0, dz: 0 };
  };
  for (const it of base.items) {
    if (removed.has(it.id)) continue;
    const m = home.moved[it.id];
    if (m) {
      items.push({ ...it, x: m.x, z: m.z, rot: m.rot });
      continue;
    }
    if (it.onTopOf) {
      const { dx, dz } = shift(it.onTopOf);
      if (dx || dz) {
        items.push({ ...it, x: it.x + dx, z: it.z + dz });
        continue;
      }
    }
    items.push(it);
  }
  for (const a of home.added) items.push({ id: a.id, furniture: a.furniture, x: a.x, z: a.z, rot: a.rot });
  // something resting on a piece that was sold would hang in the air: drop it too
  const ids = new Set(items.map((i) => i.id));
  return { ...base, items: items.filter((i) => !i.onTopOf || ids.has(i.onTopOf)) };
}
