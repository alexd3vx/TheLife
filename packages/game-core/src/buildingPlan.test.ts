import { describe, expect, it } from "vitest";
import { WALL_THICKNESS, generateDistrict, generatePlan, hasInterior, planBlockers, type Lot, type Rect } from "./index.js";

const d = generateDistrict(1);
const lots = d.lots.filter(hasInterior);

/** Walks outward from the front of a lot on a fine grid and says which room centres can be reached. */
function reachableRooms(lot: Lot) {
  const plan = generatePlan(lot);
  const cell = 0.5; // the same grid the map uses; a cell is blocked when its centre is inside a blocker grown by the walker's radius
  const pad = 4;
  const f = lot.footprint;
  const b = { minX: f.minX - pad, maxX: f.maxX + pad, minZ: f.minZ - pad, maxZ: f.maxZ + pad };
  const w = Math.ceil((b.maxX - b.minX) / cell);
  const h = Math.ceil((b.maxZ - b.minZ) / cell);
  const blocked = new Uint8Array(w * h);
  const at = (x: number, z: number) => Math.floor((z - b.minZ) / cell) * w + Math.floor((x - b.minX) / cell);
  for (let cz = 0; cz < h; cz++) {
    for (let cx = 0; cx < w; cx++) {
      const x = b.minX + (cx + 0.5) * cell;
      const z = b.minZ + (cz + 0.5) * cell;
      if (planBlockers(plan).some((r) => x > r.minX - 0.25 && x < r.maxX + 0.25 && z > r.minZ - 0.25 && z < r.maxZ + 0.25)) blocked[cz * w + cx] = 1;
    }
  }
  // Start well in front of the door, outside the building.
  const start = at(plan.inside.x + (lot.facing === 1 ? 3 : lot.facing === 3 ? -3 : 0), plan.inside.z + (lot.facing === 2 ? 3 : lot.facing === 0 ? -3 : 0));
  expect(blocked[start], `${lot.id} start is blocked`).toBe(0);
  const seen = new Uint8Array(w * h);
  const queue = [start];
  seen[start] = 1;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % w;
    const z = Math.floor(i / w);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const j = nz * w + nx;
      if (!blocked[j] && !seen[j]) {
        seen[j] = 1;
        queue.push(j);
      }
    }
  }
  const anyReached = (r: Rect) => {
    for (let z = r.minZ + cell / 2; z < r.maxZ; z += cell) for (let x = r.minX + cell / 2; x < r.maxX; x += cell) if (seen[at(x, z)]) return true;
    return false;
  };
  return plan.rooms.filter((r) => r.floor === 0).map((r) => ({ room: r, ok: anyReached(r.rect) }));
}

describe("building plans", () => {
  it("every house, flat block and shop has a plan", () => {
    expect(lots.length).toBeGreaterThan(100);
    for (const lot of lots) {
      const plan = generatePlan(lot);
      expect(plan.rooms.some((r) => r.floor === 0), lot.id).toBe(true);
      expect(plan.floors).toBe(lot.floors);
      for (let fl = 1; fl < lot.floors; fl++) expect(plan.rooms.some((r) => r.floor === fl), `${lot.id} floor ${fl}`).toBe(true);
    }
  });

  it("is deterministic", () => {
    expect(JSON.stringify(generatePlan(lots[3]!))).toBe(JSON.stringify(generatePlan(lots[3]!)));
  });

  it("keeps walls straight, rooms inside the building and openings inside their walls", () => {
    for (const lot of lots) {
      const f = lot.footprint;
      const plan = generatePlan(lot);
      for (const w of plan.walls) {
        expect(w.a.x === w.b.x || w.a.z === w.b.z, `${lot.id} wall not straight`).toBe(true);
        const length = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
        let end = 0;
        for (const o of [...w.openings].sort((p, q) => p.t0 - q.t0)) {
          expect(o.t1, `${lot.id} opening`).toBeGreaterThan(o.t0);
          expect(o.t0, `${lot.id} openings overlap`).toBeGreaterThanOrEqual(end - 1e-6);
          expect(o.t1, `${lot.id} opening runs off its wall`).toBeLessThanOrEqual(length + 1e-6);
          end = o.t1;
        }
        expect(w.a.x).toBeGreaterThanOrEqual(f.minX - 1e-6);
        expect(w.b.x).toBeLessThanOrEqual(f.maxX + 1e-6);
        expect(w.a.z).toBeGreaterThanOrEqual(f.minZ - 1e-6);
        expect(w.b.z).toBeLessThanOrEqual(f.maxZ + 1e-6);
      }
      for (const r of plan.rooms) {
        const q: Rect = r.rect;
        expect(q.minX, r.id).toBeGreaterThanOrEqual(f.minX - 1e-6);
        expect(q.maxX, r.id).toBeLessThanOrEqual(f.maxX + 1e-6);
        expect(q.minZ, r.id).toBeGreaterThanOrEqual(f.minZ - 1e-6);
        expect(q.maxZ, r.id).toBeLessThanOrEqual(f.maxZ + 1e-6);
        expect(q.maxX - q.minX, r.id).toBeGreaterThan(WALL_THICKNESS * 4);
      }
    }
  });

  it("has a front door on the street side of every building and a garage door where there is a garage", () => {
    for (const lot of lots) {
      const plan = generatePlan(lot);
      const f = lot.footprint;
      const front = plan.walls.filter((w) => w.floor === 0 && w.exterior && (lot.facing === 0 ? w.a.z === f.minZ && w.b.z === f.minZ : lot.facing === 2 ? w.a.z === f.maxZ && w.b.z === f.maxZ : lot.facing === 1 ? w.a.x === f.maxX && w.b.x === f.maxX : w.a.x === f.minX && w.b.x === f.minX));
      expect(front.some((w) => w.openings.some((o) => o.kind === "door")), `${lot.id} front door`).toBe(true);
      if (plan.garage) expect(front.some((w) => w.openings.some((o) => o.kind === "garage")), `${lot.id} garage door`).toBe(true);
    }
  });

  it("lets a person walk in through the door and reach every room on the ground floor", () => {
    const failures: string[] = [];
    for (const lot of lots.slice(0, 120)) for (const r of reachableRooms(lot)) if (!r.ok) failures.push(`${lot.id} ${r.room.kind}`);
    expect(failures).toEqual([]);
  });

  it("has stairs wherever there is more than one floor (not for shops' offices)", () => {
    for (const lot of lots.filter((l) => l.kind !== "shop" && l.floors > 1)) expect(generatePlan(lot).stairs.length, lot.id).toBe(lot.floors - 1);
  });
});
