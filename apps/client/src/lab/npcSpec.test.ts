import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK } from "./looks";
import { crowdLookOf, diffLook, npcLookFromSeed, seeded } from "./npcSpec";

describe("seeded people", () => {
  it("gives the same person for the same seed, and different people for different seeds", () => {
    expect(JSON.stringify(npcLookFromSeed(42))).toBe(JSON.stringify(npcLookFromSeed(42)));
    const looks = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(npcLookFromSeed(i * 977 + 1))));
    expect(looks.size).toBe(40);
  });
  it("stays inside the ranges the server and the sliders accept", () => {
    for (let s = 1; s < 200; s++) {
      const shape = npcLookFromSeed(s).shape!;
      expect(shape.age).toBeGreaterThanOrEqual(18);
      expect(shape.age).toBeLessThanOrEqual(70);
      expect(shape.height).toBeGreaterThanOrEqual(-0.7);
      expect(shape.height).toBeLessThanOrEqual(-0.05);
      expect(Math.abs(shape.weight)).toBeLessThanOrEqual(1);
      for (const v of Object.values(shape.detail)) expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });
  it("makes a mix of men and women", () => {
    const women = Array.from({ length: 200 }, (_, i) => npcLookFromSeed(i + 1)).filter((l) => l.body === "realfemale").length;
    expect(women).toBeGreaterThan(70);
    expect(women).toBeLessThan(130);
  });
  it("seeded streams are repeatable", () => {
    const a = seeded(9), b = seeded(9);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("crowd look", () => {
  it("is worked out from the look: a dress is one colour, no hair shows the scalp", () => {
    const dress = crowdLookOf({ ...DEFAULT_LOOK, top: "p_dress", topColor: "red", bottom: "p_jeans", bottomColor: "navy" });
    expect(dress.bottom).toBe(dress.top);
    const bald = crowdLookOf({ ...DEFAULT_LOOK, hair: null });
    expect(bald.hair).toBe(bald.skin);
    expect(crowdLookOf({ ...DEFAULT_LOOK, hair: "p_afro" }).hairVolume).toBeGreaterThan(crowdLookOf({ ...DEFAULT_LOOK, hair: "p_fade" }).hairVolume);
    expect(crowdLookOf({ ...DEFAULT_LOOK, bottom: "p_shorts" }).shorts).toBe(true);
  });
  it("scales height and build with the shape", () => {
    const tall = crowdLookOf({ ...DEFAULT_LOOK, shape: { sex: 1, age: 30, muscle: 0, weight: 1, height: 1, proportions: 0, european: 0, eastAsian: 0, bust: 0, detail: {} } });
    expect(tall.height).toBeGreaterThan(1);
    expect(tall.width).toBeGreaterThan(1);
  });
});

describe("diffLook", () => {
  it("returns only what changed", () => {
    expect(diffLook(DEFAULT_LOOK, { ...DEFAULT_LOOK, hair: "p_afro", topColor: "red" })).toEqual({ hair: "p_afro", topColor: "red" });
  });
});
