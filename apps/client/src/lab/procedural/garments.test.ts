import { describe, expect, it } from "vitest";
import { BOTTOMS, SHOES, STATE_BOTTOMS, STATE_TOPS, TOPS } from "../../iso/wardrobe";
import { coversLegs, isProceduralGarment } from "./garments";

describe("wardrobe", () => {
  it("has a recipe for every garment it offers, and for the ones the game puts on", () => {
    for (const g of [...TOPS, ...BOTTOMS, ...SHOES]) expect(isProceduralGarment(g.id), g.id).toBe(true);
    for (const id of [...STATE_TOPS, ...STATE_BOTTOMS]) expect(isProceduralGarment(id), id).toBe(true);
  });

  it("does not offer the towel or pyjamas as everyday clothes", () => {
    const offered = new Set([...TOPS, ...BOTTOMS].map((g) => g.id));
    for (const id of [...STATE_TOPS, ...STATE_BOTTOMS]) expect(offered.has(id), id).toBe(false);
  });

  it("knows which tops cover the legs, so a bottom is not drawn inside them", () => {
    for (const id of ["p_dress", "p_gown", "p_kaftan", "p_agbada", "p_towel", "p_nightgown", "p_longskirt", "p_wrapper"]) expect(coversLegs(id), id).toBe(true);
    for (const id of ["p_tee", "p_hoodie", "p_buba", "p_jeans", "p_skirt"]) expect(coversLegs(id), id).toBe(false);
  });
});
