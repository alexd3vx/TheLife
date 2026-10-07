import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK, CLOTH_COLORS, SKIN_TONES, lookShape } from "../lab/looks";
import { BODY_SLIDERS } from "../lab/bodySliders";
import { randomAll, randomFor } from "./randomise";
import { LookHistory } from "./history";
import { MAX_SAVED, addSavedLook, loadSavedLooks, removeSavedLook } from "./savedLooks";

const fakeStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const seeded = (seed = 7) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe("randomise", () => {
  it("only changes the tab it was asked for", () => {
    const hair = randomFor("hair", DEFAULT_LOOK, seeded());
    expect(Object.keys(hair).sort()).toEqual(["hair", "hairColor"]);
    expect(Object.keys(randomFor("skin", DEFAULT_LOOK, seeded())).sort()).toEqual(["eyeColor", "skinTone"]);
  });
  it("keeps every slider inside its range", () => {
    for (let seed = 1; seed < 60; seed++) {
      const patch = randomAll({ ...DEFAULT_LOOK, body: seed % 2 ? "realfemale" : "realmale" }, seeded(seed));
      const shape = patch.shape!;
      expect(shape.height).toBeGreaterThanOrEqual(-0.8);
      expect(shape.height).toBeLessThanOrEqual(0.8);
      expect(shape.age).toBeGreaterThanOrEqual(18);
      expect(shape.age).toBeLessThanOrEqual(70);
      for (const [id, v] of Object.entries(shape.detail)) {
        const s = BODY_SLIDERS.find((x) => x.id === id)!;
        expect(s).toBeTruthy();
        expect(v).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(s.oneWay ? 0 : -1);
      }
      expect(SKIN_TONES.some((t) => t.id === patch.skinTone)).toBe(true);
      expect(CLOTH_COLORS.some((c) => c.id === patch.topColor)).toBe(true);
    }
  });
  it("gives a male look no bust", () => {
    expect(randomFor("body", DEFAULT_LOOK, seeded()).shape!.bust).toBe(0);
  });
  it("re-rolling the face leaves the body alone", () => {
    const base = { ...DEFAULT_LOOK, shape: { ...lookShape(DEFAULT_LOOK), detail: { waist: 0.5 } } };
    expect(randomFor("face", base, seeded()).shape!.detail.waist).toBe(0.5);
  });
});

describe("history", () => {
  it("groups a burst of changes into one step", () => {
    const h = new LookHistory<number>();
    h.record(1, 1000);
    h.record(2, 1100);
    h.record(3, 1200);
    expect(h.undo(4)).toBe(1);
    expect(h.undo(1)).toBeNull();
    expect(h.canRedo).toBe(true);
    expect(h.redo(1)).toBe(4);
  });
  it("starts a new step after a pause, and a change clears redo", () => {
    const h = new LookHistory<number>();
    h.record(1, 1000);
    h.record(2, 3000);
    expect(h.undo(3)).toBe(2);
    h.record(9, 9000);
    expect(h.canRedo).toBe(false);
  });
});

describe("saved looks", () => {
  it("saves newest first, caps the shelf and removes", () => {
    const s = fakeStore();
    for (let i = 0; i < MAX_SAVED + 3; i++) addSavedLook({ ...DEFAULT_LOOK, hair: `h${i}` }, null, s, 1000 + i);
    const list = loadSavedLooks(s);
    expect(list).toHaveLength(MAX_SAVED);
    expect(list[0]!.look.hair).toBe(`h${MAX_SAVED + 2}`);
    expect(removeSavedLook(list[0]!.id, s)).toHaveLength(MAX_SAVED - 1);
  });
  it("survives broken storage", () => {
    const s = { getItem: () => "{nope", setItem: () => { throw new Error("full"); } };
    expect(loadSavedLooks(s)).toEqual([]);
    expect(() => addSavedLook(DEFAULT_LOOK, null, s)).not.toThrow();
  });
});
