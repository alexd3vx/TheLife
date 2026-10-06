import { describe, expect, it } from "vitest";
import { BAGS, bagItems, bagSpecFor, createGameState, packBag } from "./index.js";

describe("the bag", () => {
  it("lists what the person carries and fits it on the grid without overlaps", () => {
    const state = createGameState();
    state.inventory.portions = 7;
    state.inventory.meals = 3;
    const items = bagItems(state);
    expect(items.map((i) => i.id)).toEqual(expect.arrayContaining(["phone", "wallet", "keys", "id"]));
    const spec = bagSpecFor(state);
    const { placed, leftOver } = packBag(items, spec.cols, spec.rows);
    expect(placed.length + leftOver.length).toBe(items.length);
    const used = new Set<string>();
    for (const p of placed) for (let dy = 0; dy < p.item.h; dy++) for (let dx = 0; dx < p.item.w; dx++) {
      const key = `${p.x + dx},${p.y + dy}`;
      expect(used.has(key)).toBe(false);
      expect(p.x + dx).toBeLessThan(spec.cols);
      expect(p.y + dy).toBeLessThan(spec.rows);
      used.add(key);
    }
  });

  it("leaves things out when the bag is full", () => {
    const state = createGameState();
    state.inventory.portions = 60;
    const { leftOver } = packBag(bagItems(state), BAGS.lapo.cols, BAGS.lapo.rows);
    expect(leftOver.length).toBeGreaterThan(0);
  });
});
