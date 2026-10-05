// The prototype house, as data. Units are metres; the camera starts south of the house looking north.
// Add or move furniture here without touching the scene or controller code.

export const PLAY_AREA = { minX: -8, maxX: 8, minZ: -5, maxZ: 8 };
export const HOUSE = { minX: -6, maxX: 6, minZ: -4.5, maxZ: 4.5, wallHeight: 2.6, wallThickness: 0.2 };

export interface WallDef {
  a: [number, number];
  b: [number, number];
  /** Outward normal for outside walls: they fade when the camera is outside them. Null for inner walls. */
  outward: [number, number] | null;
}

const DOOR = { x0: -3.7, x1: -2.3 }; // front door gap in the south wall
const PARTITION = { x: 1.5, z0: -0.8, z1: 0.6 }; // doorway between the living area and the bedroom
const BATH = { z: 1.6, x0: 2.1, x1: 3.5 }; // wall between bedroom and bathroom, with its door

export const WALLS: WallDef[] = [
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

export interface Interaction {
  id: string;
  /** Id of the game action (see game-core ACTIONS) performed here. */
  action: string;
  /** Where the character walks to first. */
  approach: [number, number];
  /** Direction faced while performing it (radians; 0 faces south, PI faces north, PI/2 east). */
  yaw: number;
  /** Where to stand or sit while performing it (x, y, z); y lifts the character onto the seat or mattress. */
  pose?: [number, number, number];
  hint: string;
}

export interface ItemDef {
  id: string;
  /** Asset id from the asset manifest. */
  asset: string;
  x: number;
  z: number;
  /** Id of another item to rest on top of (its top surface sets the height). */
  onTopOf?: string;
  /** Extra height above the floor (or above the item it rests on). */
  y?: number;
  /** Degrees. 0 = the item's front faces south (+z); 90 faces east. */
  rot?: number;
  /** Real-world scale. The Kenney kit's models are about half size, so most items use 2. */
  scale?: number;
  /** See-through (0-1 opacity), for things you need to see into, like a shower stall. */
  ghost?: number;
  /** Does it block walking? Rugs and table-top items don't. */
  blocks?: boolean;
  interaction?: string;
}

const S = 2;

export const ITEMS: ItemDef[] = [
  // ---- Kitchen along the north wall
  { id: "fridge", asset: "kitchenFridge", x: -5.4, z: -3.9, scale: S, interaction: "fridge" },
  { id: "cab1", asset: "kitchenCabinet", x: -4.5, z: -3.9, scale: S },
  { id: "kitchenSink", asset: "kitchenSink", x: -3.6, z: -3.9, scale: S },
  { id: "stove", asset: "kitchenStove", x: -2.7, z: -3.9, scale: S, interaction: "stove" },
  { id: "hood", asset: "hoodModern", x: -2.7, z: -4.05, y: 1.5, scale: S, blocks: false, interaction: "stove" },
  { id: "cab2", asset: "kitchenCabinet", x: -1.8, z: -3.9, scale: S },
  { id: "microwave", asset: "kitchenMicrowave", x: -1.8, z: -3.95, onTopOf: "cab2", scale: S, blocks: false },
  { id: "toaster", asset: "toaster", x: -4.5, z: -3.95, onTopOf: "cab1", scale: S, blocks: false },
  { id: "wallCab1", asset: "kitchenCabinetUpper", x: -4.5, z: -4.1, y: 1.45, scale: S, blocks: false },
  { id: "wallCab2", asset: "kitchenCabinetUpper", x: -3.6, z: -4.1, y: 1.45, scale: S, blocks: false },
  { id: "bin", asset: "trashcan", x: -1.0, z: -4.0, scale: S },

  // ---- Dining
  { id: "table", asset: "table", x: -4.2, z: -0.9, scale: S, interaction: "dineSouth" },
  { id: "chairN", asset: "chair", x: -4.2, z: -1.85, rot: 0, scale: S, interaction: "dineNorth" },
  { id: "chairS", asset: "chair", x: -4.2, z: 0.05, rot: 180, scale: S, interaction: "dineSouth" },
  { id: "chairW", asset: "chair", x: -5.2, z: -0.9, rot: 90, scale: S, interaction: "dineWest" },
  { id: "chairE", asset: "chair", x: -3.2, z: -0.9, rot: -90, scale: S, interaction: "dineEast" },

  // ---- Living area
  { id: "tvCabinet", asset: "cabinetTelevision", x: -5.6, z: 2.4, rot: 90, scale: S, interaction: "sofa" },
  { id: "tv", asset: "televisionModern", x: -5.6, z: 2.4, onTopOf: "tvCabinet", rot: 90, scale: 1.8, blocks: false, interaction: "sofa" },
  { id: "radio", asset: "radio", x: -5.6, z: 1.55, onTopOf: "tvCabinet", rot: 90, scale: S, blocks: false, interaction: "radio" },
  { id: "rug", asset: "rugRectangle", x: -4.0, z: 2.4, rot: 90, scale: 1.7, blocks: false },
  { id: "coffeeTable", asset: "tableCoffee", x: -4.0, z: 2.4, rot: 90, scale: S, blocks: false },
  { id: "books", asset: "books", x: -4.0, z: 2.4, onTopOf: "coffeeTable", scale: S, blocks: false },
  { id: "sofa", asset: "loungeSofa", x: -2.6, z: 2.4, rot: -90, scale: S, interaction: "sofa" },
  { id: "sideTable", asset: "sideTable", x: -2.6, z: 3.95, scale: S },
  { id: "tableLamp", asset: "lampRoundTable", x: -2.6, z: 3.95, onTopOf: "sideTable", scale: S, blocks: false },
  { id: "plant1", asset: "pottedPlant", x: -5.4, z: 4.0, scale: S },
  { id: "lamp", asset: "lampRoundFloor", x: -5.5, z: 0.7, scale: S },

  // ---- Entrance
  { id: "doormat", asset: "rugDoormat", x: -3.0, z: 4.0, scale: S, blocks: false },
  { id: "coatRack", asset: "coatRackStanding", x: -1.3, z: 4.1, scale: S },
  { id: "plant3", asset: "plantSmall1", x: -1.3, z: 3.2, scale: S },

  // ---- Desk corner
  { id: "desk", asset: "desk", x: 0.2, z: -4.0, scale: S, interaction: "desk" },
  { id: "deskChair", asset: "chairDesk", x: 0.2, z: -3.1, rot: 180, scale: S, interaction: "desk" },
  { id: "screen", asset: "computerScreen", x: 0.2, z: -4.1, onTopOf: "desk", scale: S, blocks: false, interaction: "desk" },
  { id: "keyboard", asset: "computerKeyboard", x: 0.2, z: -3.7, onTopOf: "desk", scale: S, blocks: false, interaction: "desk" },
  { id: "laptop", asset: "laptop", x: -0.5, z: -3.9, onTopOf: "desk", scale: S, blocks: false, interaction: "desk" },
  { id: "plant2", asset: "plantSmall2", x: 1.1, z: -4.1, scale: S },

  // ---- Bedroom
  { id: "bed", asset: "bedDouble", x: 3.9, z: -3.05, scale: 1.4, interaction: "bed" },
  { id: "nightL", asset: "cabinetBedDrawer", x: 2.3, z: -4.05, scale: S, interaction: "bed" },
  { id: "nightR", asset: "cabinetBedDrawer", x: 5.5, z: -4.05, scale: S, interaction: "bed" },
  { id: "bedLamp", asset: "lampSquareTable", x: 5.5, z: -4.05, onTopOf: "nightR", scale: S, blocks: false },
  { id: "wardrobe", asset: "bookcaseClosedWide", x: 1.95, z: -2.0, rot: 90, scale: S },
  { id: "bookshelf", asset: "bookcaseOpen", x: 5.55, z: -0.9, rot: -90, scale: S, interaction: "bookshelf" },
  { id: "rug2", asset: "rugRectangle", x: 3.9, z: -0.9, scale: 1.6, blocks: false },
  { id: "plant4", asset: "pottedPlant", x: 5.4, z: 0.9, scale: S },

  // ---- Bathroom (south-east)
  { id: "toilet", asset: "toilet", x: 1.95, z: 3.4, rot: 90, scale: S, interaction: "toilet" },
  { id: "bathSink", asset: "bathroomSink", x: 3.5, z: 4.15, rot: 180, scale: S, interaction: "bathSink" },
  { id: "shower", asset: "showerRound", x: 5.25, z: 3.85, rot: 180, scale: S, ghost: 0.28, interaction: "shower" },
  { id: "washer", asset: "washerDryerStacked", x: 5.4, z: 2.05, rot: -90, scale: S },
  { id: "bathCabinet", asset: "bathroomCabinet", x: 4.45, z: 4.2, rot: 180, scale: S, interaction: "bathSink" },
];

export const INTERACTIONS: Record<string, Interaction> = {
  fridge: { id: "fridge", action: "snack", approach: [-5.4, -2.9], yaw: Math.PI, hint: "Grab a snack" },
  stove: { id: "stove", action: "cook", approach: [-2.7, -2.9], yaw: Math.PI, hint: "Cook a meal" },
  dineSouth: { id: "dineSouth", action: "eatMeal", approach: [-4.2, 1.1], yaw: Math.PI, pose: [-4.2, 0, 0.05], hint: "Sit and eat" },
  dineNorth: { id: "dineNorth", action: "eatMeal", approach: [-5.2, -2.1], yaw: 0, pose: [-4.2, 0, -1.85], hint: "Sit and eat" },
  dineWest: { id: "dineWest", action: "eatMeal", approach: [-6.0 + 0.55, 0.3], yaw: Math.PI / 2, pose: [-5.2, 0, -0.9], hint: "Sit and eat" },
  dineEast: { id: "dineEast", action: "eatMeal", approach: [-2.4, -0.9], yaw: -Math.PI / 2, pose: [-3.2, 0, -0.9], hint: "Sit and eat" },
  sofa: { id: "sofa", action: "tv", approach: [-3.7, 2.4], yaw: -Math.PI / 2, pose: [-2.7, 0.07, 2.4], hint: "Sit and watch TV" },
  radio: { id: "radio", action: "radio", approach: [-4.6, 1.55], yaw: Math.PI / 2, hint: "Dance to the radio" },
  desk: { id: "desk", action: "work", approach: [0.2, -2.1], yaw: Math.PI, pose: [0.2, 0, -3.1], hint: "Work at the computer" },
  bed: { id: "bed", action: "sleep", approach: [3.9, -1.55], yaw: 0, pose: [3.9, 0.46, -3.0], hint: "Go to sleep" },
  bookshelf: { id: "bookshelf", action: "read", approach: [4.6, -0.9], yaw: Math.PI / 2, hint: "Read a book" },
  toilet: { id: "toilet", action: "toilet", approach: [3.0, 3.4], yaw: Math.PI / 2, pose: [1.95, 0, 3.4], hint: "Use the toilet" },
  bathSink: { id: "bathSink", action: "brush", approach: [3.5, 3.4], yaw: 0, hint: "Brush your teeth" },
  shower: { id: "shower", action: "shower", approach: [5.2, 2.9], yaw: 0, pose: [5.25, 0, 3.85], hint: "Take a shower" },
};
