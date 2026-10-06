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
export const LAPO_ROOM: Layout = {
  name: "Room",
  area: { minX: -5, maxX: 5, minZ: -4, maxZ: 6 },
  walls: [
    ...shell(-3.5, 3.5, -2.5, 2.5, [-2.5, -1.3]),
    { a: [1.6, 0.5], b: [3.5, 0.5], outward: null },
    { a: [1.6, 0.5], b: [1.6, 1.0], outward: null },
    { a: [1.6, 1.9], b: [1.6, 2.5], outward: null },
  ],
  house: { bounds: { minX: -3.5, maxX: 3.5, minZ: -2.5, maxZ: 2.5 }, wallHeight: 2.6, wallThickness: 0.2 },
  start: { x: -1.9, z: 1.5, yaw: Math.PI },
  items: [
    p("bed", "p_bed", -2.4, -1.3),
    p("nightL", "painted_wooden_nightstand", -1.2, -2.12, { via: "bed" }),
    p("radio", "boombox", -1.2, -2.12, { onTopOf: "nightL", rot: 180 }),
    p("bookshelf", "wooden_bookshelf_worn", -0.1, -2.1),
    p("wardrobe", "p_wardrobe", 3.1, -0.5, { rot: -90 }),
    p("base", "p_kitchen_base", 1.0, -2.09),
    p("stove", "electric_stove", 1.85, -2.06),
    p("fridge", "p_fridge", 2.9, -2.04),
    p("kettle", "vintage_electric_kettle", 1.0, -2.1, { onTopOf: "base" }),
    p("table", "round_wooden_table_01", -0.1, 0.5, { via: "chairS" }),
    p("chairN", "plastic_monobloc_chair_01", -0.1, -0.55, { action: "eatMeal" }),
    p("chairS", "plastic_monobloc_chair_01", -0.1, 1.55, { rot: 180, action: "eatMeal" }),
    p("tvTable", "side_table_01", -3.1, 0.3),
    p("tv", "television_02", -3.1, 0.3, { onTopOf: "tvTable", rot: 90, via: "tvChair" }),
    p("tvChair", "painted_wooden_chair_01", -1.7, 0.3, { rot: -90, action: "tv", link: ["tv"] }),
    p("desk", "SchoolDesk_01", 0.9, 2.05, { via: "deskChair" }),
    p("deskChair", "SchoolChair_01", 0.9, 1.05, { action: "work", link: ["laptop"] }),
    p("laptop", "classic_laptop", 0.9, 2.05, { onTopOf: "desk", via: "deskChair" }),
    p("fan", "ceiling_fan", 0, 0),
    p("rug", "p_rug", -1.9, 0.7, { rot: 90 }),
    p("doormat", "p_doormat", -1.9, 2.05),
    p("toilet", "p_toilet", 1.95, 1.4, { rot: 90 }),
    p("shower", "p_shower", 3.0, 1.9, { rot: 180 }),
    p("basin", "p_basin", 2.55, 0.9, { rot: 0 }),
    p("plant", "potted_plant_04", -3.1, 2.0),
  ],
};

// ---------------------------------------------------------------- nepo: a furnished duplex-style home
const nepoWalls: WallDef[] = [
  ...shell(-8, 8, -5.5, 5.5, [-3.8, -2.4]),
  { a: [2, -5.5], b: [2, -1.0], outward: null },
  { a: [2, 0.4], b: [2, 5.5], outward: null },
  // master bathroom (north-east corner)
  { a: [6, -5.5], b: [6, -4.6], outward: null },
  { a: [6, -3.8], b: [6, -2.8], outward: null },
  { a: [6, -2.8], b: [8, -2.8], outward: null },
  // the study (south-east) is separated from the bedroom
  { a: [2, 0.4], b: [6, 0.4], outward: null },
];

export const NEPO_DUPLEX: Layout = {
  name: "Duplex",
  area: { minX: -10, maxX: 10, minZ: -7, maxZ: 8 },
  walls: nepoWalls,
  house: { bounds: { minX: -8, maxX: 8, minZ: -5.5, maxZ: 5.5 }, wallHeight: 2.9, wallThickness: 0.22 },
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
    p("armchair", "modern_arm_chair_01", -5.9, 1.55, { rot: -45, link: ["tv"], action: "tv" }),
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
    p("basin", "p_basin", 7.4, -3.15, { rot: 180 }),
    p("shower", "p_shower", 7.3, -4.9),
    // study (south-east)
    p("desk", "metal_office_desk", 4.2, 5.0, { via: "deskChair" }),
    p("deskChair", "SchoolChair_01", 4.2, 3.95, { action: "work", link: ["laptop"] }),
    p("laptop", "classic_laptop", 3.7, 5.0, { onTopOf: "desk", via: "deskChair" }),
    p("deskLamp", "desk_lamp_arm_01", 4.9, 5.0, { onTopOf: "desk" }),
    p("bookshelf", "wooden_bookshelf_worn", 7.5, 3.0, { rot: -90 }),
    p("studyDay", "vintage_day_bed", 6.4, 1.6, { rot: -90 }),
    p("washer", "p_washer", 7.5, 5.0, { rot: 180 }),
  ],
};

/** The home layout for a background. */
export function layoutForTier(tier: string | undefined): Layout {
  return tier === "lapo" ? LAPO_ROOM : tier === "nepo" ? NEPO_DUPLEX : HOUSE_LAYOUT;
}
