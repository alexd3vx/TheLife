// What we take from each third-party pack, and the budgets every asset must meet.
// Add a line here to bring another model into the game.

export const CREDITS = {
  "quaternius-ubc": {
    name: "Universal Base Characters (Standard)",
    author: "Quaternius",
    licence: "CC0 1.0",
    url: "https://quaternius.com/packs/universalbasecharacters.html",
  },
  "quaternius-ual": {
    name: "Universal Animation Library (Standard)",
    author: "Quaternius",
    licence: "CC0 1.0",
    url: "https://quaternius.com/packs/universalanimationlibrary.html",
  },
  "quaternius-outfits": {
    name: "Modular Character Outfits - Fantasy (Standard)",
    author: "Quaternius",
    licence: "CC0 1.0",
    url: "https://quaternius.com/packs/modularcharacteroutfitsfantasy.html",
  },
  "kenney-furniture": {
    name: "Furniture Kit 2.0",
    author: "Kenney",
    licence: "CC0 1.0",
    url: "https://kenney.nl/assets/furniture-kit",
  },
  "kenney-cars": {
    name: "Car Kit",
    author: "Kenney",
    licence: "CC0 1.0",
    url: "https://kenney.nl/assets/car-kit",
  },
};

// Per-asset limits (mid-range phone target). Characters are the heavy ones; props must stay light.
export const BUDGETS = {
  character: { maxTriangles: 20000, maxBytes: 1_800_000 },
  hair: { maxTriangles: 6000, maxBytes: 900_000 },
  furniture: { maxTriangles: 4000, maxBytes: 120_000 },
  vehicle: { maxTriangles: 8000, maxBytes: 250_000 },
  clothing: { maxTriangles: 10000, maxBytes: 300_000 },
  animation: { maxBytes: 6_000_000 },
};

export const HAIR = [
  { id: "hair_buzzed", file: "Hair_Buzzed", label: "Buzzed", slot: "hair" },
  { id: "hair_buzzed_f", file: "Hair_BuzzedFemale", label: "Buzzed (fine)", slot: "hair" },
  { id: "hair_parted", file: "Hair_SimpleParted", label: "Side parted", slot: "hair" },
  { id: "hair_long", file: "Hair_Long", label: "Long", slot: "hair" },
  { id: "hair_buns", file: "Hair_Buns", label: "Buns", slot: "hair" },
  { id: "beard", file: "Hair_Beard", label: "Beard", slot: "facial" },
  { id: "brows_regular", file: "Eyebrows_Regular", label: "Eyebrows", slot: "brows" },
  { id: "brows_female", file: "Eyebrows_Female", label: "Eyebrows (shaped)", slot: "brows" },
];

const f = (id, label, group, file = id) => ({ id, file, label, group });

export const FURNITURE = [
  f("bedDouble", "Double bed", "bedroom"),
  f("bedSingle", "Single bed", "bedroom"),
  f("bedBunk", "Bunk bed", "bedroom"),
  f("cabinetBed", "Bedside cabinet", "bedroom"),
  f("sideTable", "Side table", "living"),
  f("loungeSofa", "Sofa", "living"),
  f("loungeSofaCorner", "Corner sofa", "living"),
  f("loungeChair", "Lounge chair", "living"),
  f("loungeDesignSofa", "Design sofa", "living"),
  f("tableCoffee", "Coffee table", "living"),
  f("televisionModern", "Television", "living"),
  f("cabinetTelevision", "TV cabinet", "living"),
  f("bookcaseOpen", "Bookcase", "living"),
  f("rugRectangle", "Rug", "living"),
  f("lampRoundFloor", "Floor lamp", "living"),
  f("lampRoundTable", "Table lamp", "living"),
  f("pottedPlant", "Potted plant", "living"),
  f("radio", "Radio", "living"),
  f("speaker", "Speaker", "living"),
  f("ceilingFan", "Ceiling fan", "living"),
  f("table", "Dining table", "dining"),
  f("tableRound", "Round table", "dining"),
  f("chair", "Chair", "dining"),
  f("chairCushion", "Cushioned chair", "dining"),
  f("stoolBar", "Bar stool", "dining"),
  f("kitchenFridge", "Fridge", "kitchen"),
  f("kitchenStove", "Stove", "kitchen"),
  f("kitchenSink", "Kitchen sink", "kitchen"),
  f("kitchenCabinet", "Kitchen cabinet", "kitchen"),
  f("kitchenCabinetUpper", "Wall cabinet", "kitchen"),
  f("kitchenMicrowave", "Microwave", "kitchen"),
  f("kitchenBlender", "Blender", "kitchen"),
  f("toaster", "Toaster", "kitchen"),
  f("washer", "Washing machine", "kitchen"),
  f("bathtub", "Bathtub", "bathroom"),
  f("shower", "Shower", "bathroom"),
  f("toilet", "Toilet", "bathroom"),
  f("bathroomSink", "Bathroom sink", "bathroom"),
  f("bathroomMirror", "Mirror", "bathroom"),
  f("desk", "Desk", "office"),
  f("chairDesk", "Desk chair", "office"),
  f("computerScreen", "Monitor", "office"),
  f("computerKeyboard", "Keyboard", "office"),
  f("laptop", "Laptop", "office"),
  f("trashcan", "Bin", "misc"),
  f("cardboardBoxClosed", "Box", "misc"),
  f("coatRack", "Coat rack", "misc"),
  f("wall", "Wall", "structure"),
  f("wallWindow", "Wall with window", "structure"),
  f("wallDoorway", "Wall with doorway", "structure"),
  f("doorway", "Door frame", "structure"),
  f("floorFull", "Floor tile", "structure"),
  f("stairs", "Stairs", "structure"),
];

const v = (id, label) => ({ id, file: id, label, group: "vehicle" });

export const VEHICLES = [
  v("sedan", "Sedan"),
  v("sedan-sports", "Sports sedan"),
  v("hatchback-sports", "Hatchback"),
  v("suv", "SUV"),
  v("suv-luxury", "Luxury SUV"),
  v("taxi", "Taxi"),
  v("van", "Van"),
  v("delivery", "Delivery truck"),
  v("truck", "Truck"),
  v("ambulance", "Ambulance"),
  v("police", "Police car"),
  v("garbage-truck", "Garbage truck"),
];

// Outfits from the Quaternius pack. Each outfit is a set of parts (top/sleeves/bottom/shoes/hood/acc) that can be
// mixed. Textures are shipped once per outfit and applied at runtime (see build-assets.mjs / avatar.ts).
export const OUTFITS = {
  peasant: {
    label: "Peasant",
    texturePrefix: "Peasant",
    variants: [
      { id: "a", label: "Natural", baseColor: "T_Peasant_BaseColor.png" },
      { id: "b", label: "Dyed", baseColor: "T_Peasant_2_BaseColor.png" },
    ],
    normal: "T_Peasant_Normal.png",
    orm: "T_Peasant_ORM.png",
  },
  ranger: {
    label: "Ranger",
    texturePrefix: "Ranger",
    variants: [
      { id: "a", label: "Forest", baseColor: "T_Ranger_BaseColor.png" },
      { id: "b", label: "Dusk", baseColor: "T_Ranger_3_BaseColor.png" },
    ],
    normal: "T_Ranger_Normal.png",
    orm: "T_Ranger_ORM.png",
  },
};

// Pack part name -> our slot. "sleeves" always travels with "top".
export const OUTFIT_PARTS = [
  { match: /_Body$/, slot: "top", label: "Top" },
  { match: /_Arms$/, slot: "sleeves", label: "Sleeves" },
  { match: /_Legs$/, slot: "bottom", label: "Bottom" },
  { match: /_Feet(_Boots)?$/, slot: "shoes", label: "Shoes" },
  { match: /_Head_Hood$/, slot: "hood", label: "Hood" },
  { match: /_Acc_Pauldrons?$/, slot: "acc", label: "Pauldrons" },
];
