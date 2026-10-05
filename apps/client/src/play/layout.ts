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
const PARTITION = { x: 1.5, z0: 0.3, z1: 1.7 }; // doorway between living area and bedroom

export const WALLS: WallDef[] = [
  { a: [-6, -4.5], b: [6, -4.5], outward: [0, -1] },
  { a: [-6, 4.5], b: [DOOR.x0, 4.5], outward: [0, 1] },
  { a: [DOOR.x1, 4.5], b: [6, 4.5], outward: [0, 1] },
  { a: [-6, -4.5], b: [-6, 4.5], outward: [-1, 0] },
  { a: [6, -4.5], b: [6, 4.5], outward: [1, 0] },
  { a: [PARTITION.x, -4.5], b: [PARTITION.x, PARTITION.z0], outward: null },
  { a: [PARTITION.x, PARTITION.z1], b: [PARTITION.x, 4.5], outward: null },
];

export type InteractionKind = "stand" | "seat" | "lie";

export interface Interaction {
  id: string;
  label: string;
  kind: InteractionKind;
  /** Where the character walks to first. */
  approach: [number, number];
  /** Direction faced while standing, or while sitting/lying (radians; 0 faces south, PI faces north). */
  yaw: number;
  /** Final spot for seat/lie (x, y, z); y lifts the character onto the seat or mattress. */
  pose?: [number, number, number];
  clip: string;
  /** Standing actions end by themselves after this many seconds. */
  seconds?: number;
  hint: string;
}

export interface ItemDef {
  id: string;
  /** Asset id from the asset manifest. */
  asset: string;
  x: number;
  z: number;
  /** Height above the floor (for items placed on top of others). */
  y?: number;
  /** Degrees. 0 = the item's front faces south (+z); 90 faces east. */
  rot?: number;
  /** Real-world scale. The Kenney kit's models are about half size, so most items use 2. */
  scale?: number;
  /** Does it block walking? Rugs and desk-top items don't. */
  blocks?: boolean;
  interaction?: string;
}

export const ITEMS: ItemDef[] = [
  // Kitchen along the north wall
  { id: "fridge", asset: "kitchenFridge", x: -5.4, z: -3.9, scale: 2, interaction: "fridge" },
  { id: "cab1", asset: "kitchenCabinet", x: -4.5, z: -3.9, scale: 2 },
  { id: "sink", asset: "kitchenSink", x: -3.6, z: -3.9, scale: 2, interaction: "stove" },
  { id: "stove", asset: "kitchenStove", x: -2.7, z: -3.9, scale: 2, interaction: "stove" },
  { id: "cab2", asset: "kitchenCabinet", x: -1.8, z: -3.9, scale: 2 },
  { id: "microwave", asset: "kitchenMicrowave", x: -1.8, z: -3.9, y: 0.9, scale: 2, blocks: false },
  // Dining
  { id: "table", asset: "table", x: -4.2, z: -0.9, scale: 2, interaction: "dineSouth" },
  { id: "chairN", asset: "chair", x: -4.2, z: -1.85, rot: 0, scale: 2, interaction: "dineNorth" },
  { id: "chairS", asset: "chair", x: -4.2, z: 0.05, rot: 180, scale: 2, interaction: "dineSouth" },
  // Living area
  { id: "tvCabinet", asset: "cabinetTelevision", x: -5.55, z: 2.4, rot: 90, scale: 2, interaction: "sofa" },
  { id: "tv", asset: "televisionModern", x: -5.55, z: 2.4, y: 0.62, rot: 90, scale: 1.8, blocks: false, interaction: "sofa" },
  { id: "rug", asset: "rugRectangle", x: -4.0, z: 2.4, rot: 90, scale: 1.4, blocks: false },
  { id: "sofa", asset: "loungeSofa", x: -2.7, z: 2.4, rot: -90, scale: 2, interaction: "sofa" },
  { id: "plant1", asset: "pottedPlant", x: -5.4, z: 4.0, scale: 2 },
  { id: "lamp", asset: "lampRoundFloor", x: -1.1, z: 4.0, scale: 2 },
  { id: "bookcase", asset: "bookcaseOpen", x: 1.0, z: -2.6, rot: -90, scale: 2 },
  // Desk
  { id: "desk", asset: "desk", x: 0.2, z: -4.0, scale: 2, interaction: "desk" },
  { id: "deskChair", asset: "chairDesk", x: 0.2, z: -3.1, rot: 180, scale: 2, interaction: "desk" },
  { id: "screen", asset: "computerScreen", x: 0.2, z: -4.1, y: 0.76, scale: 2, blocks: false, interaction: "desk" },
  { id: "laptop", asset: "laptop", x: -0.4, z: -3.9, y: 0.76, scale: 2, blocks: false, interaction: "desk" },
  // Bedroom
  { id: "bed", asset: "bedDouble", x: 4.2, z: -3.05, scale: 1.4, interaction: "bed" },
  { id: "nightstand", asset: "cabinetBed", x: 5.55, z: -4.0, scale: 2, interaction: "bed" },
  { id: "wardrobe", asset: "bookcaseOpen", x: 5.55, z: 1.4, rot: -90, scale: 2 },
  { id: "rug2", asset: "rugRectangle", x: 4.2, z: -0.6, scale: 1.2, blocks: false },
  { id: "plant2", asset: "pottedPlant", x: 2.2, z: 4.0, scale: 2 },
];

export const INTERACTIONS: Record<string, Interaction> = {
  fridge: {
    id: "fridge",
    label: "Grabbing a snack",
    kind: "stand",
    approach: [-5.4, -2.9],
    yaw: Math.PI,
    clip: "Life_Eat_Standing_Loop",
    seconds: 6,
    hint: "Open the fridge",
  },
  stove: {
    id: "stove",
    label: "Cooking",
    kind: "stand",
    approach: [-2.7, -2.9],
    yaw: Math.PI,
    clip: "Life_Cook_Loop",
    seconds: 8,
    hint: "Cook something",
  },
  dineSouth: {
    id: "dineSouth",
    label: "Having a meal",
    kind: "seat",
    approach: [-4.2, 1.1],
    yaw: Math.PI,
    pose: [-4.2, 0, 0.05],
    clip: "Life_Eat_Loop",
    hint: "Sit and eat",
  },
  dineNorth: {
    id: "dineNorth",
    label: "Having a meal",
    kind: "seat",
    approach: [-5.3, -1.85],
    yaw: 0,
    pose: [-4.2, 0, -1.85],
    clip: "Life_Eat_Loop",
    hint: "Sit and eat",
  },
  sofa: {
    id: "sofa",
    label: "Relaxing on the sofa",
    kind: "seat",
    approach: [-3.9, 2.4],
    yaw: -Math.PI / 2,
    pose: [-2.8, 0, 2.4],
    clip: "Sitting_Idle_Loop",
    hint: "Sit down",
  },
  desk: {
    id: "desk",
    label: "Working at the desk",
    kind: "seat",
    approach: [0.2, -2.1],
    yaw: Math.PI,
    pose: [0.2, 0, -3.1],
    clip: "Life_Type_Loop",
    hint: "Work at the computer",
  },
  bed: {
    id: "bed",
    label: "Sleeping",
    kind: "lie",
    approach: [4.2, -1.7],
    yaw: 0,
    pose: [4.2, 0.46, -3.0],
    clip: "Life_Sleep_Loop",
    hint: "Go to sleep",
  },
};
