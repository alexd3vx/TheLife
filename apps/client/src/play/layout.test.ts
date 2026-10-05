import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACTIONS, FURNITURE, furnitureById } from "@thelife/game-core";
import { LIFE_CLIP_NAMES } from "../lab/procedural/lifeClips";
import { PROCEDURAL_BUILDERS } from "../furniture/procedural";
import { MODEL_META } from "../furniture/models";
import { HOUSE_LAYOUT, buildShowroomLayout } from "./layout";

// Data-integrity checks: a typo in the house layout, the catalog, an action, or a model name should fail here, not as
// a silent missing object in the game.
const manifest = JSON.parse(readFileSync(new URL("../../public/assets/manifest.json", import.meta.url), "utf8")) as {
  assets: { id: string; category: string; clipNames?: string[]; sizeMetres?: number[] }[];
};
const realisticModels = new Map(manifest.assets.filter((a) => a.category === "realistic").map((a) => [a.id, a]));
const libraryClips = new Set(manifest.assets.find((a) => a.id === "ual1")?.clipNames ?? []);
const showroom = buildShowroomLayout(FURNITURE);

function ids(items: { id: string }[]) {
  return new Set(items.map((i) => i.id));
}

describe("furniture catalog and models", () => {
  it("every catalog item has a 3D model (built in code or from the library)", () => {
    const missing = FURNITURE.filter((f) => (f.id.startsWith("p_") ? !PROCEDURAL_BUILDERS[f.id] : !realisticModels.has(f.id))).map((f) => f.id);
    expect(missing).toEqual([]);
  });

  it("every model in the library is sold in the catalog (nothing is shipped unused)", () => {
    const unsold = [...realisticModels.keys()].filter((id) => !furnitureById(id));
    expect(unsold).toEqual([]);
  });

  it("realistic models are real-world sized (a chair is not the size of a house)", () => {
    for (const [id, model] of realisticModels) {
      const size = model.sizeMetres ?? [];
      expect(Math.max(...size), id).toBeLessThan(3.2);
      expect(Math.min(...size), id).toBeGreaterThanOrEqual(0.02);
    }
  });

  it("model metadata refers to catalog items", () => {
    expect(Object.keys(MODEL_META).filter((id) => !furnitureById(id))).toEqual([]);
  });
});

describe("house layout", () => {
  const layout = HOUSE_LAYOUT;
  const itemIds = ids(layout.items);

  it("only uses catalog furniture", () => {
    expect(layout.items.filter((i) => !furnitureById(i.furniture)).map((i) => `${i.id} -> ${i.furniture}`)).toEqual([]);
  });

  it("has unique item ids", () => {
    expect(itemIds.size).toBe(layout.items.length);
  });

  it("references between items (resting on, via, link) point at real items", () => {
    const bad: string[] = [];
    for (const i of layout.items) {
      if (i.onTopOf && !itemIds.has(i.onTopOf)) bad.push(`${i.id}.onTopOf`);
      if (i.via && !itemIds.has(i.via)) bad.push(`${i.id}.via`);
      for (const l of i.link ?? []) if (!itemIds.has(l)) bad.push(`${i.id}.link`);
    }
    expect(bad).toEqual([]);
  });

  it("actions given to items are real game actions", () => {
    const bad = layout.items.filter((i) => i.action && !ACTIONS[i.action]).map((i) => i.id);
    expect(bad).toEqual([]);
  });

  it("every piece of furniture is inside the house", () => {
    const b = layout.house!.bounds;
    for (const item of layout.items) {
      expect(item.x, item.id).toBeGreaterThan(b.minX);
      expect(item.x, item.id).toBeLessThan(b.maxX);
      expect(item.z, item.id).toBeGreaterThan(b.minZ);
      expect(item.z, item.id).toBeLessThan(b.maxZ);
    }
  });

  it("every action the game offers can be done somewhere in the house", () => {
    const used = new Set(layout.items.flatMap((i) => (i.decor ? [] : [i.action ?? furnitureById(i.furniture)?.action])).filter(Boolean));
    const missing = ["snack", "cook", "eatMeal", "tv", "work", "sleep", "toilet", "shower", "brush", "radio", "read"].filter((a) => !used.has(a));
    expect(missing).toEqual([]);
  });

  it("walls are axis-aligned segments", () => {
    for (const wall of layout.walls) expect(wall.a[0] === wall.b[0] || wall.a[1] === wall.b[1]).toBe(true);
  });
});

describe("every action's animation exists", () => {
  it("library clip or generated life clip", () => {
    const known = new Set<string>([...libraryClips, ...LIFE_CLIP_NAMES]);
    const missing = Object.values(ACTIONS).filter((a) => !known.has(a.clip)).map((a) => `${a.id} -> ${a.clip}`);
    expect(missing).toEqual([]);
    expect(["Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sitting_Idle_Loop", "Sitting_Enter", "Sitting_Exit"].filter((c) => !known.has(c))).toEqual([]);
  });
});

describe("showroom layout", () => {
  it("shows every catalog item once, plus partners for desks, TVs and laptops", () => {
    for (const f of FURNITURE) expect(showroom.items.some((i) => i.furniture === f.id), f.id).toBe(true);
    expect(ids(showroom.items).size).toBe(showroom.items.length);
    expect(showroom.items.filter((i) => !furnitureById(i.furniture))).toEqual([]);
  });

  it("items that need a seat have one next to them", () => {
    const byId = new Map(showroom.items.map((i) => [i.id, i]));
    for (const i of showroom.items) if (i.via) expect(byId.has(i.via), i.id).toBe(true);
  });
});
