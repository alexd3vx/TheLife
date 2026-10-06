// Character customisation choices. Colours are tints multiplied onto the model's textures.

export interface SkinTone {
  id: string;
  label: string;
  /** "dark" uses the pack's own dark skin map; "light" multiplies the light map by the tint. (Stylised bodies.) */
  map: "dark" | "light";
  tint: string;
  /** The skin colour itself, used by the realistic bodies, which carry no photo texture. */
  base: string;
}

export const SKIN_TONES: SkinTone[] = [
  { id: "ebony", label: "Ebony", map: "dark", tint: "#ffffff", base: "#3a2620" },
  { id: "deep", label: "Deep brown", map: "light", tint: "#5e3b2a", base: "#59382a" },
  { id: "rich", label: "Rich brown", map: "light", tint: "#7c5037", base: "#76503a" },
  { id: "warm", label: "Warm brown", map: "light", tint: "#9a6a47", base: "#98694a" },
  { id: "caramel", label: "Caramel", map: "light", tint: "#b98458", base: "#b98a62" },
  { id: "honey", label: "Honey", map: "light", tint: "#d4a577", base: "#d6a97f" },
  { id: "light", label: "Light", map: "light", tint: "#f0d2b4", base: "#e9c8a8" },
  { id: "midnight", label: "Midnight", map: "dark", tint: "#ffffff", base: "#2a1a16" },
  { id: "chestnut", label: "Chestnut", map: "light", tint: "#6a4330", base: "#684432" },
  { id: "mocha", label: "Mocha", map: "light", tint: "#8a5c40", base: "#8a5c42" },
  { id: "bronze", label: "Bronze", map: "light", tint: "#a97648", base: "#a97a50" },
  { id: "sand", label: "Sand", map: "light", tint: "#e2bd94", base: "#dfb78e" },
];

export interface Swatch {
  id: string;
  label: string;
  color: string;
}

export const HAIR_COLORS: Swatch[] = [
  { id: "black", label: "Black", color: "#241d19" },
  { id: "darkbrown", label: "Dark brown", color: "#4a3022" },
  { id: "brown", label: "Brown", color: "#7a5236" },
  { id: "auburn", label: "Auburn", color: "#a14a2a" },
  { id: "blonde", label: "Blonde", color: "#d1ad6c" },
  { id: "grey", label: "Grey", color: "#b4b4b4" },
  { id: "blue", label: "Blue", color: "#3b6ae0" },
  { id: "pink", label: "Pink", color: "#e0589a" },
  { id: "burgundy", label: "Burgundy", color: "#6e1f2e" },
  { id: "honey", label: "Honey", color: "#b8843a" },
  { id: "white", label: "White", color: "#ece9e2" },
  { id: "purple", label: "Purple", color: "#6c3fb0" },
  { id: "green", label: "Green", color: "#2f9a62" },
];

export const EYE_COLORS: Swatch[] = [
  { id: "brown", label: "Brown", color: "#ffffff" },
  { id: "hazel", label: "Hazel", color: "#c7e0a0" },
  { id: "green", label: "Green", color: "#8fe6a8" },
  { id: "blue", label: "Blue", color: "#9fc8ff" },
  { id: "grey", label: "Grey", color: "#c9d2dc" },
];

export const CLOTH_COLORS: Swatch[] = [
  { id: "white", label: "White", color: "#f4f1ea" },
  { id: "black", label: "Black", color: "#26262a" },
  { id: "navy", label: "Navy", color: "#223a6b" },
  { id: "sky", label: "Sky blue", color: "#5a9bd8" },
  { id: "green", label: "Green", color: "#2f8a4c" },
  { id: "yellow", label: "Yellow", color: "#f0b92a" },
  { id: "orange", label: "Orange", color: "#e2762a" },
  { id: "red", label: "Red", color: "#c8372d" },
  { id: "pink", label: "Pink", color: "#e0679b" },
  { id: "purple", label: "Purple", color: "#7b45a8" },
  { id: "teal", label: "Teal", color: "#1f8f8a" },
  { id: "khaki", label: "Khaki", color: "#b7a56f" },
  { id: "grey", label: "Grey", color: "#8b8f96" },
];

export const FABRIC_OPTIONS = [
  { id: "plain", label: "Plain" },
  { id: "stripes", label: "Stripes" },
  { id: "ankara", label: "Ankara print" },
  { id: "denim", label: "Denim" },
] as const;

export type Sex = "male" | "female";
/** "real*" bodies are the realistic ones; the others are the stylised (Superhero proportions) pair. */
export type BodyId = "male" | "female" | "realmale" | "realfemale";

export const sexOf = (body: BodyId): Sex => (body.endsWith("female") ? "female" : "male");
export const isRealistic = (body: BodyId): boolean => body.startsWith("real");
export const bodyFor = (sex: Sex, realistic: boolean): BodyId => (realistic ? (sex === "male" ? "realmale" : "realfemale") : sex);

export interface Look {
  body: BodyId;
  skinTone: string;
  hair: string | null;
  hairColor: string;
  beard: boolean;
  brows: string | null;
  eyeColor: string;
  /** Outfit ids (see manifest.outfits), or null for bare. */
  top: string | null;
  bottom: string | null;
  shoes: string | null;
  hood: boolean;
  pauldrons: boolean;
  outfitVariant: string;
  /** Garment colours (CLOTH_COLORS ids); null keeps the outfit's own texture colours. */
  topColor: string | null;
  bottomColor: string | null;
  shoesColor: string | null;
  topFabric: string;
  bottomFabric: string;
  /** Glasses, a cap, earrings or a chain (see lab/procedural/accessories.ts), or none. */
  accessory: string | null;
  accessoryColor: string;
  /** Body shape: 0.92 to 1.08 for height, 0.88 to 1.2 for build (width). 1 is average. */
  height: number;
  build: number;
}

export const DEFAULT_LOOK: Look = {
  body: "realmale",
  skinTone: "deep",
  hair: "p_fade",
  hairColor: "black",
  beard: false,
  brows: null,
  eyeColor: "brown",
  top: "p_tee",
  bottom: "p_trousers",
  shoes: "p_sneakers",
  hood: false,
  pauldrons: false,
  outfitVariant: "a",
  topColor: "sky",
  bottomColor: "khaki",
  shoesColor: "black",
  topFabric: "plain",
  bottomFabric: "plain",
  accessory: null,
  accessoryColor: "black",
  height: 1,
  build: 1,
};

const LOOK_KEY = "thelife.look.v1";

/** The character's look, shared by the Lab and the play prototype. Falls back to the default if nothing valid is stored. */
export function loadSavedLook(): Look {
  try {
    const raw = localStorage.getItem(LOOK_KEY);
    if (!raw) return { ...DEFAULT_LOOK };
    const parsed = JSON.parse(raw) as Partial<Look>;
    // Looks saved before the realistic bodies existed used "male"/"female"; they move to the realistic pair.
    const body: BodyId = parsed.body === "female" || parsed.body === "realfemale" ? "realfemale" : parsed.body === "male" || parsed.body === "realmale" ? "realmale" : DEFAULT_LOOK.body;
    return { ...DEFAULT_LOOK, ...parsed, body };
  } catch {
    return { ...DEFAULT_LOOK };
  }
}

export function saveLook(look: Look): void {
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(look));
  } catch {
    // Storage may be blocked (private mode); the look just won't be remembered.
  }
}

/** A look stored with a life (a JSON string from the server): anything missing falls back to the default. */
export function parseLook(json: string | undefined | null): Look {
  if (!json) return { ...DEFAULT_LOOK };
  try {
    const parsed = JSON.parse(json) as Partial<Look>;
    const body: BodyId = parsed.body === "female" || parsed.body === "realfemale" ? "realfemale" : parsed.body === "male" || parsed.body === "realmale" ? "realmale" : DEFAULT_LOOK.body;
    return { ...DEFAULT_LOOK, ...parsed, body };
  } catch {
    return { ...DEFAULT_LOOK };
  }
}
