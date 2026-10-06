// Places are data. A layout lists furniture from the catalog with positions; how each piece is used (where to stand,
// sit or lie) is worked out from its measured shape in interactions.ts, so nothing here needs hand-tuned poses.
// Units are metres. The camera looks north from the south; 0 degrees rotation means an item's front faces south (+z).

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WallDef {
  a: [number, number];
  b: [number, number];
  /** Outward normal for outside walls: they fade when the camera is outside them. Null for inner walls. */
  outward: [number, number] | null;
}

export interface Placement {
  /** Unique id of this placed item. */
  id: string;
  /** Catalog id (see game-core FURNITURE). */
  furniture: string;
  x: number;
  z: number;
  /** Degrees; 0 = the front faces south (+z), 90 faces east. */
  rot?: number;
  /** Extra height above the floor (or above the item it rests on). */
  y?: number;
  /** Rest on top of another placed item. */
  onTopOf?: string;
  /** Use a different action than the catalog's default (e.g. a dining chair that means "eat"). */
  action?: string;
  /** Tapping this triggers another placed item's use (a TV or a desk sends you to the sofa or chair). */
  via?: string;
  /** Other placed items that react while this one is in use (the TV glows when you watch from the sofa). */
  link?: string[];
  /** Disable the catalog's default action for this placement. */
  decor?: boolean;
}

export interface Layout {
  name: string;
  area: Rect;
  /** House walls; absent for open layouts. */
  walls: WallDef[];
  house?: { bounds: Rect; wallHeight: number; wallThickness: number; doorMarker?: [number, number] };
  items: Placement[];
  /** Where the character starts. */
  start: { x: number; z: number; yaw: number };
}

const HOUSE_WALL_HEIGHT = 2.6;

const DOOR = { x0: -3.7, x1: -2.3 }; // front door gap in the south wall
const PARTITION = { x: 1.5, z0: -0.8, z1: 0.6 }; // doorway between the living area and the bedroom
const BATH = { z: 1.6, x0: 2.1, x1: 3.5 }; // wall between bedroom and bathroom, with its door

const houseWalls: WallDef[] = [
  { a: [-6, -4.5], b: [6, -4.5], outward: [0, -1] },
  { a: [-6, 4.5], b: [DOOR.x0, 4.5], outward: [0, 1] },
  { a: [DOOR.x1, 4.5], b: [6, 4.5], outward: [0, 1] },
  { a: [-6, -4.5], b: [-6, 4.5], outward: [-1, 0] },
  { a: [6, -4.5], b: [6, 4.5], outward: [1, 0] },
  { a: [PARTITION.x, -4.5], b: [PARTITION.x, PARTITION.z0], outward: null },
  { a: [PARTITION.x, PARTITION.z1], b: [PARTITION.x, 4.5], outward: null },
  { a: [PARTITION.x, BATH.z], b: [BATH.x0, BATH.z], outward: null },
  { a: [BATH.x1, BATH.z], b: [6, BATH.z], outward: null },
];

const p = (id: string, furniture: string, x: number, z: number, extra: Partial<Placement> = {}): Placement => ({ id, furniture, x, z, ...extra });

export const HOUSE_LAYOUT: Layout = {
  name: "House",
  area: { minX: -8, maxX: 8, minZ: -5, maxZ: 8 },
  walls: houseWalls,
  house: { bounds: { minX: -6, maxX: 6, minZ: -4.5, maxZ: 4.5 }, wallHeight: HOUSE_WALL_HEIGHT, wallThickness: 0.2 },
  start: { x: -1, z: 1, yaw: Math.PI },
  items: [
    // ---- Kitchen along the north wall
    p("fridge", "p_fridge", -5.4, -4.04),
    p("cab1", "p_kitchen_base", -4.5, -4.09),
    p("kitchenSink", "p_kitchen_sink", -3.6, -4.09),
    p("stove", "electric_stove", -2.85, -4.06),
    p("cab2", "p_kitchen_base", -2.2, -4.09),
    p("kettle", "vintage_electric_kettle", -2.2, -4.1, { onTopOf: "cab2" }),
    p("wallCab1", "p_kitchen_wall", -4.5, -4.23, { y: 1.45 }),
    p("wallCab2", "p_kitchen_wall", -3.6, -4.23, { y: 1.45 }),
    p("kitchenFan", "ceiling_fan", -4.0, -2.2),

    // ---- Dining
    p("table", "round_wooden_table_01", -4.2, -0.9, { via: "chairS" }),
    p("chairN", "dining_chair_02", -4.2, -1.95, { action: "eatMeal" }),
    p("chairS", "dining_chair_02", -4.2, 0.15, { rot: 180, action: "eatMeal" }),
    p("chairW", "painted_wooden_chair_01", -5.3, -0.9, { rot: 90, action: "eatMeal" }),
    p("chairE", "painted_wooden_chair_01", -3.1, -0.9, { rot: -90, action: "eatMeal" }),

    // ---- Living area
    p("tv", "p_tv_flat", -5.6, 2.3, { rot: 90, via: "sofa" }),
    p("sofa", "sofa_03", -2.5, 2.3, { rot: -90, link: ["tv"] }),
    p("armchair", "modern_arm_chair_01", -4.1, 3.75, { rot: 200, link: ["tv"], action: "tv" }),
    p("rug", "p_rug", -4.0, 2.3, { rot: 90 }),
    p("coffeeTable", "modern_coffee_table_02", -4.0, 2.3, { rot: 90 }),
    p("radioTable", "side_table_01", -5.6, 0.7),
    p("radio", "boombox", -5.6, 0.7, { onTopOf: "radioTable", rot: 90 }),
    p("floorLamp", "p_floor_lamp", -1.1, 3.9),
    p("plant1", "potted_plant_02", -5.4, 4.0),
    p("livingFan", "ceiling_fan", -3.6, 2.4),

    // ---- Entrance
    p("doormat", "p_doormat", -3.0, 4.0),

    // ---- Desk corner
    p("desk", "metal_office_desk", 0.3, -3.95, { via: "deskChair" }),
    p("deskChair", "SchoolChair_01", 0.3, -2.95, { rot: 180, action: "work", link: ["laptop"] }),
    p("laptop", "classic_laptop", -0.2, -3.95, { onTopOf: "desk", via: "deskChair" }),
    p("deskLamp", "desk_lamp_arm_01", 0.95, -4.0, { onTopOf: "desk" }),

    // ---- Bedroom
    p("bed", "p_bed", 3.9, -3.3),
    p("nightL", "painted_wooden_nightstand", 2.7, -4.15, { via: "bed" }),
    p("nightR", "painted_wooden_nightstand", 5.1, -4.15, { via: "bed" }),
    p("oilLamp", "vintage_oil_lamp", 5.65, 0.9, { onTopOf: "commode" }),
    // (the wardrobe is tall: it must not stand in front of the desk, where it hid the person working)
    p("wardrobe", "p_wardrobe", 5.7, -0.9, { rot: -90 }),
    p("bookshelf", "wooden_bookshelf_worn", 5.65, -2.3, { rot: -90 }),
    p("bedRug", "p_rug", 3.9, -0.7),
    p("commode", "GothicCommode_01", 5.65, 0.9, { rot: -90 }),
    p("bedFan", "ceiling_fan", 3.9, -1.7),
    p("plant2", "potted_plant_01", 2.1, 1.0),

    // ---- Bathroom (south-east)
    p("toilet", "p_toilet", 1.95, 3.4, { rot: 90 }),
    p("basin", "p_basin", 3.5, 4.15, { rot: 180 }),
    p("mirror", "ornate_mirror_01", 3.5, 4.38, { y: 1.15, rot: 180, via: "basin" }),
    p("shower", "p_shower", 5.3, 3.9, { rot: 180 }),
    p("washer", "p_washer", 5.5, 2.15, { rot: -90 }),
  ],
};

// ------------------------------------------------------------------ showroom

/** Items that need a partner to be used (a desk needs a chair), so the showroom sets them up in pairs. */
const SHOWROOM_SETS: { id: string; furniture: string; dx?: number; dz?: number; rot?: number; extra?: Partial<Placement> }[][] = [];
void SHOWROOM_SETS;

export function buildShowroomLayout(catalog: { id: string; category: string; action?: string }[]): Layout {
  const items: Placement[] = [];
  const cols = 9;
  const spacingX = 3.4;
  const spacingZ = 3.6;
  let index = 0;
  const place = (id: string, furniture: string, extra: Partial<Placement> = {}) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = -((cols - 1) * spacingX) / 2 + col * spacingX;
    const z = -6 + row * spacingZ;
    items.push({ id, furniture, x, z, ...extra });
    return { x, z };
  };

  const order = ["seating", "tables", "bedroom", "storage", "electronics", "appliances", "kitchen", "bathroom", "lighting", "decor"];
  const sorted = [...catalog].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));

  for (const entry of sorted) {
    const id = entry.id;
    if (id === "metal_office_desk" || id === "SchoolDesk_01") {
      // desk + a chair to sit on it
      const at = place(`s_${id}`, id, { via: `s_${id}_chair` });
      items.push({ id: `s_${id}_chair`, furniture: "SchoolChair_01", x: at.x, z: at.z + 1.0, rot: 180, action: "work" });
    } else if (entry.category === "electronics" && (entry.action === "tv" || entry.action === "work")) {
      // a TV or laptop works from a seat: put a sofa/chair in front of the TV, and a desk + chair under the laptop
      if (id === "classic_laptop") {
        const at = place(`s_${id}`, "metal_office_desk", { via: `s_${id}_chair` });
        items.push({ id: `s_${id}_laptop`, furniture: id, x: at.x - 0.4, z: at.z, onTopOf: `s_${id}`, via: `s_${id}_chair` });
        items.push({ id: `s_${id}_chair`, furniture: "SchoolChair_01", x: at.x, z: at.z + 1.0, rot: 180, action: "work", link: [`s_${id}_laptop`] });
      } else {
        const at = place(`s_${id}`, id, { via: `s_${id}_sofa` });
        items.push({ id: `s_${id}_sofa`, furniture: "sofa_02", x: at.x, z: at.z + 1.7, rot: 180, link: [`s_${id}`] });
      }
    } else {
      place(`s_${id}`, id, entry.category === "decor" && id === "p_rug" ? {} : {});
    }
    index++;
  }
  const rows = Math.ceil(index / cols);
  return {
    name: "Showroom",
    area: { minX: -17, maxX: 17, minZ: -9, maxZ: -6 + rows * spacingZ + 3 },
    walls: [],
    items,
    start: { x: 0, z: -7.5, yaw: 0 },
  };
}
