import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK } from "../lab/looks";
import { layersOf } from "./paperdoll";
import { ACCESSORY_OPTIONS, BOTTOMS, HAIR_STYLES, SHOES, TOPS } from "./wardrobe";

describe("the paper doll", () => {
  it("stacks layers back to front: skin, face, shoes, bottom, top, hair", () => {
    const keys = layersOf({ ...DEFAULT_LOOK, hair: "p_afro", top: "p_tee", bottom: "p_jeans", shoes: "p_boots" }).map((l) => l.key);
    expect(keys).toEqual(["skin", "details", "shoes.p_boots", "bottom.p_jeans", "top.p_tee", "hair.p_afro"]);
  });

  it("leaves out what is not worn", () => {
    const keys = layersOf({ ...DEFAULT_LOOK, hair: null, top: null, bottom: null, shoes: null, accessory: null }).map((l) => l.key);
    expect(keys).toEqual(["skin", "details"]);
  });

  it("has a layer folder name for every option in the wardrobe, and none repeat", () => {
    const all = [...HAIR_STYLES.map((o) => `hair.${o.id}`), ...TOPS.map((o) => `top.${o.id}`), ...BOTTOMS.map((o) => `bottom.${o.id}`), ...SHOES.map((o) => `shoes.${o.id}`), ...ACCESSORY_OPTIONS.map((o) => `accessory.${o.id}`)];
    expect(new Set(all).size).toBe(all.length);
    for (const o of HAIR_STYLES) expect(layersOf({ ...DEFAULT_LOOK, hair: o.id }).some((l) => l.key === `hair.${o.id}`)).toBe(true);
  });

  it("colours a layer with the chosen colour, and fixed-colour accessories keep their own", () => {
    const top = layersOf({ ...DEFAULT_LOOK, top: "p_tee", topColor: "red" }).find((l) => l.key === "top.p_tee");
    expect(top?.tint).toBe("#c8372d");
    expect(layersOf({ ...DEFAULT_LOOK, accessory: "a_shades" }).find((l) => l.key === "accessory.a_shades")?.tint).toBeNull();
  });
});
