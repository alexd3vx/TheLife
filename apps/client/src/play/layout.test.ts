import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACTIONS } from "@thelife/game-core";
import { LIFE_CLIP_NAMES } from "../lab/procedural/lifeClips";
import { HOUSE, INTERACTIONS, ITEMS, PLAY_AREA, WALLS } from "./layout";

// Data-integrity checks: a typo in the house layout, an action, or an asset name should fail here, not as a
// silent missing object in the game.
const manifest = JSON.parse(readFileSync(new URL("../../public/assets/manifest.json", import.meta.url), "utf8")) as {
  assets: { id: string; clipNames?: string[] }[];
};
const assetIds = new Set(manifest.assets.map((a) => a.id));
const libraryClips = new Set(manifest.assets.find((a) => a.id === "ual1")?.clipNames ?? []);
const itemIds = new Set(ITEMS.map((i) => i.id));

describe("house layout", () => {
  it("only uses assets that exist in the library", () => {
    const missing = ITEMS.filter((i) => !assetIds.has(i.asset)).map((i) => `${i.id} -> ${i.asset}`);
    expect(missing).toEqual([]);
  });

  it("has unique item ids", () => {
    expect(itemIds.size).toBe(ITEMS.length);
  });

  it("items resting on others refer to real items", () => {
    const bad = ITEMS.filter((i) => i.onTopOf && !itemIds.has(i.onTopOf)).map((i) => i.id);
    expect(bad).toEqual([]);
  });

  it("every interaction an item points to exists", () => {
    const bad = ITEMS.filter((i) => i.interaction && !INTERACTIONS[i.interaction]).map((i) => `${i.id} -> ${i.interaction}`);
    expect(bad).toEqual([]);
  });

  it("every interaction uses a real game action and has an approach point inside the play area", () => {
    for (const interaction of Object.values(INTERACTIONS)) {
      expect(ACTIONS[interaction.action], interaction.id).toBeDefined();
      const [x, z] = interaction.approach;
      expect(x).toBeGreaterThan(PLAY_AREA.minX);
      expect(x).toBeLessThan(PLAY_AREA.maxX);
      expect(z).toBeGreaterThan(PLAY_AREA.minZ);
      expect(z).toBeLessThan(PLAY_AREA.maxZ);
    }
  });

  it("seat and lie actions have a place to sit or lie", () => {
    for (const interaction of Object.values(INTERACTIONS)) {
      if (ACTIONS[interaction.action]!.pose !== "stand") expect(interaction.pose, interaction.id).toBeDefined();
    }
  });

  it("every piece of furniture is inside the house", () => {
    for (const item of ITEMS) {
      expect(item.x, item.id).toBeGreaterThan(HOUSE.minX);
      expect(item.x, item.id).toBeLessThan(HOUSE.maxX);
      expect(item.z, item.id).toBeGreaterThan(HOUSE.minZ);
      expect(item.z, item.id).toBeLessThan(HOUSE.maxZ);
    }
  });

  it("every action's animation exists (library clip or generated life clip)", () => {
    const known = new Set<string>([...libraryClips, ...LIFE_CLIP_NAMES]);
    const missing = Object.values(ACTIONS).filter((a) => !known.has(a.clip)).map((a) => `${a.id} -> ${a.clip}`);
    expect(missing).toEqual([]);
    expect(["Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sitting_Idle_Loop"].filter((c) => !known.has(c))).toEqual([]);
  });

  it("walls are axis-aligned segments", () => {
    for (const wall of WALLS) expect(wall.a[0] === wall.b[0] || wall.a[1] === wall.b[1]).toBe(true);
  });

  it("every item that something can be done with is reachable from the front door", async () => {
    // Build the same nav grid the game does (walls only; furniture footprints need the 3D models) and check the
    // approach points are not walled off from the entrance.
    const { blockOutside, blockRect, createNavGrid, findPath } = await import("@thelife/shared");
    const grid = createNavGrid(PLAY_AREA, 0.125);
    blockOutside(grid, PLAY_AREA, 0.4);
    for (const wall of WALLS) {
      const t = HOUSE.wallThickness / 2;
      blockRect(grid, { minX: Math.min(wall.a[0], wall.b[0]) - t, maxX: Math.max(wall.a[0], wall.b[0]) + t, minZ: Math.min(wall.a[1], wall.b[1]) - t, maxZ: Math.max(wall.a[1], wall.b[1]) + t }, 0.27);
    }
    const entrance = { x: -3, z: 6.5 };
    for (const interaction of Object.values(INTERACTIONS)) {
      const route = findPath(grid, entrance, { x: interaction.approach[0], z: interaction.approach[1] });
      expect(route, `${interaction.id} unreachable from the front door`).not.toBeNull();
    }
  });
});
