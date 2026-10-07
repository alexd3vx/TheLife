import { CLOTH_COLORS, EYE_COLORS, HAIR_COLORS, SKIN_TONES, lookShape, sexOf, type Look } from "../lab/looks";
import { BODY_SLIDERS } from "../lab/bodySliders";
import { FABRICS } from "../lab/procedural/fabrics";
import { ACCESSORY_OPTIONS, BOTTOMS, HAIR_STYLES, SHOES, TOPS } from "../iso/wardrobe";

export type Tab = "body" | "face" | "skin" | "hair" | "clothes" | "extras";
export const BODY_DETAILS = ["shoulders", "chest_width", "waist", "belly", "hip_width", "glutes", "arm_muscle", "thigh_fat"];
const FACE_GROUPS = ["Face", "Eyes", "Nose", "Mouth"];

type Rng = () => number;
const pick = <T,>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length)]!;
const round = (v: number) => Math.round(v * 20) / 20;

/** A random draw for one tab of the creator. Only that tab's choices change, and every value stays inside what the sliders allow. */
export function randomFor(tab: Tab, look: Look, rng: Rng = Math.random): Partial<Look> {
  const shape = lookShape(look);
  const male = sexOf(look.body) === "male";
  const spread = (centre = 0, width = 1.2) => (rng() - 0.5) * width + centre;
  switch (tab) {
    case "body": {
      const detail = { ...shape.detail };
      for (const id of BODY_DETAILS) delete detail[id];
      for (const s of BODY_SLIDERS) if (BODY_DETAILS.includes(s.id) && rng() < 0.4) detail[s.id] = round(s.oneWay ? rng() * 0.7 : spread(0, 1));
      return {
        shape: {
          ...shape,
          detail,
          height: Math.max(-0.8, Math.min(0.8, spread(0, 1.2))),
          weight: spread(0.05),
          muscle: spread(0.1),
          age: Math.round(18 + rng() * 32),
          bust: male ? 0 : spread(0.1),
        },
      };
    }
    case "face": {
      const detail = { ...shape.detail };
      for (const s of BODY_SLIDERS) {
        if (!FACE_GROUPS.includes(s.group)) continue;
        delete detail[s.id];
        if (rng() < 0.35) detail[s.id] = round(s.oneWay ? rng() * 0.6 : spread(0, 1.1));
      }
      return { shape: { ...shape, detail } };
    }
    case "skin":
      return { skinTone: pick(SKIN_TONES, rng).id, eyeColor: pick(EYE_COLORS, rng).id };
    case "hair":
      return { hair: pick(HAIR_STYLES, rng).id, hairColor: pick(HAIR_COLORS, rng).id };
    case "clothes":
      return {
        top: pick(TOPS, rng).id,
        topColor: pick(CLOTH_COLORS, rng).id,
        topFabric: pick(FABRICS, rng).id,
        bottom: pick(BOTTOMS, rng).id,
        bottomColor: pick(CLOTH_COLORS, rng).id,
        bottomFabric: pick(FABRICS, rng).id,
        shoes: pick(SHOES, rng).id,
        shoesColor: pick(CLOTH_COLORS, rng).id,
      };
    case "extras":
      return { accessory: rng() < 0.7 ? pick(ACCESSORY_OPTIONS, rng).id : null, accessoryColor: pick(CLOTH_COLORS, rng).id };
  }
}

/** Every tab at once. The body and face draws both change the shape, so the second builds on the first. */
export function randomAll(look: Look, rng: Rng = Math.random): Partial<Look> {
  let patch: Partial<Look> = {};
  let current = look;
  for (const tab of ["body", "face", "skin", "hair", "clothes", "extras"] as const) {
    const part = randomFor(tab, current, rng);
    patch = { ...patch, ...part };
    current = { ...current, ...part };
  }
  return patch;
}
