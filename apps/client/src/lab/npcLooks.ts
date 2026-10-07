import { CLOTH_COLORS, DEFAULT_LOOK, HAIR_COLORS, SKIN_TONES, bodyFor, type Look } from "./looks";
import { FABRICS } from "./procedural/fabrics";
import { BOTTOMS, HAIR_STYLES, SHOES, TOPS } from "../iso/wardrobe";

const pick = <T,>(list: T[], r: () => number): T => list[Math.floor(r() * list.length)]!;
const NATURAL_HAIR = HAIR_COLORS.filter((c) => ["black", "darkbrown", "brown", "grey", "burgundy"].includes(c.id));
const EVERYDAY_SKIN = SKIN_TONES.filter((s) => ["ebony", "deep", "rich", "warm", "caramel", "midnight", "chestnut", "mocha", "bronze"].includes(s.id));

/** A random everyday Lagosian: a realistic body, a natural skin tone and hair, ordinary clothes. */
export function randomNpcLook(r: () => number = Math.random): Look {
  const female = r() < 0.5;
  return {
    ...DEFAULT_LOOK,
    body: bodyFor(female ? "female" : "male", true),
    skinTone: pick(EVERYDAY_SKIN, r).id,
    hair: pick(HAIR_STYLES, r).id,
    hairColor: pick(NATURAL_HAIR, r).id,
    top: pick(TOPS, r).id,
    topColor: pick(CLOTH_COLORS, r).id,
    topFabric: pick(FABRICS, r).id,
    bottom: pick(BOTTOMS, r).id,
    bottomColor: pick(CLOTH_COLORS, r).id,
    bottomFabric: pick(FABRICS, r).id,
    shoes: pick(SHOES, r).id,
    shoesColor: pick(CLOTH_COLORS, r).id,
    accessory: null,
    beard: !female && r() < 0.25,
    height: 0.94 + r() * 0.12,
    build: 0.92 + r() * 0.2,
  };
}
