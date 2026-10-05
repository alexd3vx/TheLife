// Character customisation choices. Colours are tints multiplied onto the model's textures.

export interface SkinTone {
  id: string;
  label: string;
  /** "dark" uses the pack's own dark skin map; "light" multiplies the light map by the tint. */
  map: "dark" | "light";
  tint: string;
}

export const SKIN_TONES: SkinTone[] = [
  { id: "ebony", label: "Ebony", map: "dark", tint: "#ffffff" },
  { id: "deep", label: "Deep brown", map: "light", tint: "#5e3b2a" },
  { id: "rich", label: "Rich brown", map: "light", tint: "#7c5037" },
  { id: "warm", label: "Warm brown", map: "light", tint: "#9a6a47" },
  { id: "caramel", label: "Caramel", map: "light", tint: "#b98458" },
  { id: "honey", label: "Honey", map: "light", tint: "#d4a577" },
  { id: "light", label: "Light", map: "light", tint: "#f0d2b4" },
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

export interface Look {
  body: Sex;
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
}

export const DEFAULT_LOOK: Look = {
  body: "male",
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
};

const LOOK_KEY = "thelife.look.v1";

/** The character's look, shared by the Lab and the play prototype. Falls back to the default if nothing valid is stored. */
export function loadSavedLook(): Look {
  try {
    const raw = localStorage.getItem(LOOK_KEY);
    if (!raw) return { ...DEFAULT_LOOK };
    const parsed = JSON.parse(raw) as Partial<Look>;
    return { ...DEFAULT_LOOK, ...parsed, body: parsed.body === "female" ? "female" : "male" };
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
