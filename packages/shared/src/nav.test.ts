import { describe, expect, it } from "vitest";
import { blockOutside, blockRect, createNavGrid, findPath, isFree, nearestFree, pathLength } from "./nav.js";

const bounds = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };

describe("findPath", () => {
  it("walks straight across an empty room", () => {
    const grid = createNavGrid(bounds, 0.25);
    const route = findPath(grid, { x: 1, z: 1 }, { x: 9, z: 9 });
    expect(route).not.toBeNull();
    expect(route!.length).toBe(1);
    expect(route![0]).toEqual({ x: 9, z: 9 });
  });

  it("goes around a wall through the gap", () => {
    const grid = createNavGrid(bounds, 0.25);
    blockRect(grid, { minX: 4.9, maxX: 5.1, minZ: 0, maxZ: 4 });
    blockRect(grid, { minX: 4.9, maxX: 5.1, minZ: 6, maxZ: 10 });
    const route = findPath(grid, { x: 1, z: 1 }, { x: 9, z: 1 });
    expect(route).not.toBeNull();
    const through = route!.some((p) => p.z > 4 && p.z < 6);
    expect(through).toBe(true);
    expect(pathLength({ x: 1, z: 1 }, route!)).toBeGreaterThan(8);
  });

  it("returns null when the goal is sealed off", () => {
    const grid = createNavGrid(bounds, 0.25);
    blockRect(grid, { minX: 4.9, maxX: 5.1, minZ: 0, maxZ: 10 });
    expect(findPath(grid, { x: 1, z: 1 }, { x: 9, z: 1 })).toBeNull();
  });

  it("walks to the nearest free spot when the target is inside furniture", () => {
    const grid = createNavGrid(bounds, 0.25);
    blockRect(grid, { minX: 4, maxX: 6, minZ: 4, maxZ: 6 });
    const route = findPath(grid, { x: 1, z: 1 }, { x: 5, z: 5 });
    expect(route).not.toBeNull();
    const end = route![route!.length - 1]!;
    expect(isFree(grid, end.x, end.z)).toBe(true);
  });
});

describe("grid helpers", () => {
  it("nearestFree returns the point itself when free", () => {
    const grid = createNavGrid(bounds, 0.5);
    expect(nearestFree(grid, 2, 2)).toEqual({ x: 2, z: 2 });
  });

  it("blockOutside keeps characters inside the area", () => {
    const grid = createNavGrid(bounds, 0.5);
    blockOutside(grid, { minX: 2, maxX: 8, minZ: 2, maxZ: 8 });
    expect(isFree(grid, 1, 1)).toBe(false);
    expect(isFree(grid, 5, 5)).toBe(true);
  });
});
