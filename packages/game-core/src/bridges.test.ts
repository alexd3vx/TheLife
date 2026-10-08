import { describe, expect, it } from "vitest";
import { findBridges, lagosTerrain } from "./index.js";

const t = lagosTerrain();

describe("bridges", () => {
  it("finds the long crossings of the lagoon", () => {
    const b = findBridges(t);
    expect(b.length).toBeGreaterThan(0);
    expect(Math.max(...b.map((s) => s.length))).toBeGreaterThan(100);
  });
});
