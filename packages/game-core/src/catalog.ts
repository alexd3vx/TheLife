// The furniture catalog: what exists, what it costs, and what you can do with it. The 3D model for each entry lives in
// the client (apps/client/src/furniture). Players buy these in the shop later; for now the test house and the showroom
// use them directly.

export type FurnitureCategory =
  | "seating"
  | "tables"
  | "bedroom"
  | "storage"
  | "electronics"
  | "appliances"
  | "kitchen"
  | "bathroom"
  | "lighting"
  | "decor";

export interface FurnitureDef {
  id: string;
  name: string;
  category: FurnitureCategory;
  /** Price in whole naira. */
  price: number;
  /** The game action performed with it (see ACTIONS), if any. Decorative pieces have none. */
  action?: string;
  /** Can be switched on and off by tapping it (a lamp). */
  toggle?: "light";
}

const item = (id: string, name: string, category: FurnitureCategory, price: number, action?: string, toggle?: "light"): FurnitureDef => ({
  id,
  name,
  category,
  price,
  ...(action ? { action } : {}),
  ...(toggle ? { toggle } : {}),
});

export const FURNITURE: FurnitureDef[] = [
  // ---- Seating
  item("sofa_02", "Two-seat leather sofa", "seating", 185_000, "tv"),
  item("sofa_03", "Large lounge sofa", "seating", 340_000, "tv"),
  item("modern_arm_chair_01", "Modern armchair", "seating", 120_000, "tv"),
  item("mid_century_lounge_chair", "Lounge chair", "seating", 210_000, "tv"),
  item("Rockingchair_01", "Rocking chair", "seating", 90_000, "sit"),
  item("dining_chair_02", "Dining chair", "seating", 38_000, "sit"),
  item("painted_wooden_chair_01", "Wooden chair", "seating", 18_000, "sit"),
  item("painted_wooden_chair_02", "Tall wooden chair", "seating", 22_000, "sit"),
  item("WoodenChair_01", "Carved chair", "seating", 45_000, "sit"),
  item("plastic_monobloc_chair_01", "Plastic chair", "seating", 6_500, "sit"),
  item("wooden_stool_01", "Wooden stool", "seating", 9_500, "sit"),
  item("folding_wooden_stool", "Folding stool", "seating", 7_000, "sit"),
  item("painted_wooden_bench", "Wooden bench", "seating", 32_000, "sit"),
  item("Ottoman_01", "Ottoman", "seating", 40_000, "sit"),
  item("SchoolChair_01", "Office chair", "seating", 28_000, "sit"),
  // ---- Tables and desks
  item("painted_wooden_table", "Large dining table", "tables", 150_000),
  item("dining_table", "Dining table", "tables", 110_000),
  item("round_wooden_table_01", "Round table", "tables", 85_000),
  item("WoodenTable_01", "Long side table", "tables", 60_000),
  item("modern_coffee_table_01", "Modern coffee table", "tables", 55_000),
  item("modern_coffee_table_02", "Square coffee table", "tables", 70_000),
  item("coffee_table_round_01", "Round coffee table", "tables", 62_000),
  item("CoffeeTable_01", "Classic coffee table", "tables", 75_000),
  item("side_table_01", "Side table", "tables", 25_000),
  item("small_wooden_table_01", "Small table", "tables", 20_000),
  item("ClassicConsole_01", "Console table", "tables", 95_000),
  item("metal_office_desk", "Office desk", "tables", 80_000, "work"),
  item("SchoolDesk_01", "Study desk", "tables", 35_000, "work"),
  // ---- Bedroom
  item("p_bed", "Double bed with mattress", "bedroom", 210_000, "sleep"),
  item("GothicBed_01", "Carved wooden bed", "bedroom", 320_000, "sleep"),
  item("vintage_day_bed", "Day bed", "bedroom", 130_000, "sleep"),
  item("painted_wooden_nightstand", "Nightstand", "bedroom", 24_000),
  item("ClassicNightstand_01", "Classic nightstand", "bedroom", 38_000),
  item("GothicCommode_01", "Chest of drawers", "bedroom", 98_000),
  item("p_wardrobe", "Wardrobe", "bedroom", 135_000),
  // ---- Storage
  item("wooden_bookshelf_worn", "Bookshelf", "storage", 70_000, "read"),
  item("painted_wooden_shelves", "Shelves", "storage", 28_000),
  item("steel_frame_shelves_03", "Steel shelving", "storage", 65_000, "read"),
  item("wooden_display_shelves_01", "Display shelves", "storage", 52_000),
  item("modern_wooden_cabinet", "Modern cabinet", "storage", 160_000),
  item("drawer_cabinet", "Drawer cabinet", "storage", 85_000),
  item("painted_wooden_cabinet", "Painted cabinet", "storage", 58_000),
  item("vintage_cabinet_01", "Display cabinet", "storage", 190_000),
  item("chinese_cabinet", "Tall cabinet", "storage", 175_000),
  // ---- Electronics
  item("p_tv_flat", "Flat-screen TV", "electronics", 160_000, "tv"),
  item("television_02", "Television (CRT)", "electronics", 45_000, "tv"),
  item("Television_01", "Classic television", "electronics", 40_000, "tv"),
  item("boombox", "Boombox", "electronics", 30_000, "radio"),
  item("vintage_radio_transceiver", "Radio set", "electronics", 42_000, "radio"),
  item("portable_cassette_player", "Cassette player", "electronics", 12_000),
  item("classic_laptop", "Laptop", "electronics", 280_000, "work"),
  // ---- Kitchen and appliances
  item("p_fridge", "Refrigerator", "appliances", 290_000, "snack"),
  item("electric_stove", "Electric stove", "appliances", 120_000, "cook"),
  item("vintage_microwave", "Microwave", "appliances", 48_000),
  item("vintage_electric_kettle", "Electric kettle", "appliances", 9_000),
  item("p_washer", "Washing machine", "appliances", 260_000),
  item("ceiling_fan", "Ceiling fan", "appliances", 35_000),
  item("p_kitchen_base", "Kitchen base unit", "kitchen", 65_000),
  item("p_kitchen_sink", "Kitchen sink unit", "kitchen", 95_000),
  item("p_kitchen_wall", "Kitchen wall cabinet", "kitchen", 45_000),
  // ---- Bathroom
  item("p_toilet", "Toilet", "bathroom", 85_000, "toilet"),
  item("p_basin", "Washbasin", "bathroom", 52_000, "brush"),
  item("p_shower", "Shower cabin", "bathroom", 140_000, "shower"),
  // ---- Lighting
  item("desk_lamp_arm_01", "Desk lamp", "lighting", 15_000, undefined, "light"),
  item("vintage_oil_lamp", "Oil lamp", "lighting", 8_000, undefined, "light"),
  item("p_floor_lamp", "Floor lamp", "lighting", 22_000, undefined, "light"),
  // ---- Decor
  item("wall_clock", "Wall clock", "decor", 8_000),
  item("mantel_clock_01", "Mantel clock", "decor", 26_000),
  item("potted_plant_01", "Large potted plant", "decor", 30_000),
  item("potted_plant_02", "Potted plant", "decor", 18_000),
  item("potted_plant_04", "Small plant", "decor", 6_000),
  item("ornate_mirror_01", "Ornate mirror", "decor", 45_000),
  item("p_rug", "Patterned rug", "decor", 25_000),
  item("p_doormat", "Doormat", "decor", 3_500),
];

const byId = new Map(FURNITURE.map((f) => [f.id, f]));

export function furnitureById(id: string): FurnitureDef | undefined {
  return byId.get(id);
}
