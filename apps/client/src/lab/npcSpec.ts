import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES, lookShape, sexOf, type Look } from "./looks";
import { randomNpcLook } from "./npcLooks";

/** A small, fast random generator: the same seed always gives the same stream. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The same person every time for the same seed: a look for the full character. */
export function npcLookFromSeed(seed: number): Look {
  const r = seeded(seed);
  const look = randomNpcLook(r);
  // a person is not only a wardrobe: age, build and a few face and body sliders vary too
  const female = sexOf(look.body) === "female";
  const shape = lookShape(look);
  const detail: Record<string, number> = {};
  for (const id of ["shoulders", "belly", "hip_width", "head_width", "nose_width", "lips_full", "eyes_size"]) if (r() < 0.45) detail[id] = Math.round((r() - 0.5) * 12) / 10;
  return {
    ...look,
    shape: {
      ...shape,
      age: Math.round(18 + r() * r() * 50),
      // ordinary people: a hand's breadth either side of average, never lanky
      // the body model's "average" is 1.82 m for a man and 1.68 m for a woman, tall for Lagos; people here run about 1.70 and 1.60
      height: (female ? -0.25 : -0.4) + (r() - 0.5) * 0.4,
      weight: (r() - 0.4) * 0.7,
      muscle: (r() - 0.4) * (female ? 0.5 : 0.8),
      bust: female ? (r() - 0.4) * 1.1 : 0,
      detail,
    },
  };
}

/** What a far-away person needs to be drawn: a handful of colours and sizes, all worked out from the look. */
export interface CrowdLook {
  female: boolean;
  skin: string;
  top: string;
  bottom: string;
  shoe: string;
  hair: string;
  /** How far the hair stands off the scalp, in metres (a fade is 0.004, an afro 0.05). */
  hairVolume: number;
  height: number;
  width: number;
  shorts: boolean;
  longSleeve: boolean;
}

const HAIR_VOLUME: Record<string, number> = {
  p_buzz: 0.004, p_taper: 0.006, p_fade: 0.006, p_waves: 0.008, p_afro: 0.05, p_puffs: 0.04, p_twists: 0.028, p_cornrows: 0.008, p_braids: 0.022, p_locs: 0.022,
  p_shortlocs: 0.02, p_bantu: 0.03, p_bun: 0.016, p_pony: 0.012, p_bob: 0.026, p_long: 0.026, p_wrap: 0.04, p_durag: 0.012, p_hijab: 0.03,
};
const LONG_SLEEVE = new Set(["p_long", "p_hoodie", "p_shirt", "p_blazer", "p_sweater", "p_senator", "p_agbada", "p_kaftan", "p_buba", "p_gown"]);
const ONE_PIECE = new Set(["p_dress", "p_kaftan", "p_gown", "p_agbada", "p_buba", "p_senator"]);
const SHORT_BOTTOM = new Set(["p_shorts", "p_capri", "p_skirt"]);
const colour = (list: { id: string; color: string }[], id: string | null, fallback = "#777777") => list.find((c) => c.id === id)?.color ?? fallback;

export function crowdLookOf(look: Look): CrowdLook {
  const skin = SKIN_TONES.find((s) => s.id === look.skinTone)?.base ?? "#6b4430";
  const shape = lookShape(look);
  const top = look.top ? colour(CLOTH_COLORS, look.topColor) : skin;
  const onePiece = !!look.top && ONE_PIECE.has(look.top);
  return {
    female: sexOf(look.body) === "female",
    skin,
    top,
    bottom: look.bottom && !onePiece ? colour(CLOTH_COLORS, look.bottomColor) : onePiece ? top : skin,
    shoe: look.shoes ? colour(CLOTH_COLORS, look.shoesColor) : skin,
    hair: look.hair ? colour(HAIR_COLORS, look.hairColor, "#241d19") : skin,
    hairVolume: look.hair ? (HAIR_VOLUME[look.hair] ?? 0.01) : 0.002,
    height: 1 + shape.height * 0.2, // the model is 1.82 m at 0 and about 1.46 m at -1
    // the thinned bodies are an average build; a little extra width keeps the limbs from looking spindly
    width: 1.07 + shape.weight * 0.16 + shape.muscle * 0.05,
    shorts: !!look.bottom && SHORT_BOTTOM.has(look.bottom) && !onePiece,
    longSleeve: !!look.top && LONG_SLEEVE.has(look.top),
  };
}

/** The keys of `next` that differ from `prev`, ready for `Avatar.setLook`. */
export function diffLook(prev: Look, next: Look): Partial<Look> {
  const patch: Record<string, unknown> = {};
  for (const k of Object.keys(next) as (keyof Look)[]) if (JSON.stringify(next[k]) !== JSON.stringify(prev[k])) patch[k] = next[k];
  return patch as Partial<Look>;
}

/**
 * New colours for the same person: skin, hair, top, trousers, shoes. It costs almost nothing (a few milliseconds), because no mesh is
 * rebuilt, so a real character can be repainted every time it goes back to the pool.
 */
export function recolourLook(base: Look, seed: number): Look {
  const fresh = npcLookFromSeed(seed);
  return {
    ...base,
    skinTone: fresh.skinTone,
    hairColor: fresh.hairColor,
    topColor: fresh.topColor,
    bottomColor: fresh.bottomColor,
    shoesColor: fresh.shoesColor,
    topFabric: fresh.topFabric,
    bottomFabric: fresh.bottomFabric,
  };
}

/**
 * One new piece (hair, top, bottom or shoes) on the same person. Building a garment or a hairstyle takes 80 to 200 ms on a laptop,
 * so this is done rarely, and only for one piece at a time.
 */
export function restyleLook(base: Look, seed: number): Look {
  const fresh = npcLookFromSeed(seed);
  const pick = Math.floor(seeded(seed ^ 0x5bd1e995)() * 4);
  if (pick === 0) return { ...base, hair: fresh.hair };
  if (pick === 1) return { ...base, top: fresh.top };
  if (pick === 2) return { ...base, bottom: fresh.bottom };
  return { ...base, shoes: fresh.shoes };
}
