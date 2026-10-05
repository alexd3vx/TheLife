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

export type Sex = "male" | "female";

export interface Look {
  body: Sex;
  skinTone: string;
  hair: string | null;
  hairColor: string;
  beard: boolean;
  brows: string | null;
  eyeColor: string;
}

export const DEFAULT_LOOK: Look = {
  body: "male",
  skinTone: "deep",
  hair: "hair_buzzed",
  hairColor: "black",
  beard: false,
  brows: null,
  eyeColor: "brown",
};
