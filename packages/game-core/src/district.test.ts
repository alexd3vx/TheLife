import { describe, expect, it } from "vitest";
import { CHUNK_SIZE, DISTRICT_HALF, chunkKey, generateDistrict, indexChunks, walkBlockers, type Rect } from "./district.js";

const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
const d = generateDistrict(1);

describe("district generator", () => {
  it("is deterministic and different for another seed", () => {
    expect(JSON.stringify(generateDistrict(1))).toBe(JSON.stringify(d));
    expect(JSON.stringify(generateDistrict(2))).not.toBe(JSON.stringify(d));
  });

  it("is a neighbourhood: hundreds of lots, many trees, lamps, a market, an apron, farms", () => {
    expect(d.lots.length).toBeGreaterThan(150);
    expect(d.trees.length).toBeGreaterThan(400);
    expect(d.lamps.length).toBeGreaterThan(80);
    for (const kind of ["residential", "commercial", "market", "park", "farm", "apron"] as const) expect(d.blocks.some((b) => b.kind === kind), kind).toBe(true);
    expect(d.lots.some((l) => l.kind === "terminal")).toBe(true);
    expect(d.lots.some((l) => l.garage)).toBe(true);
    expect(d.lots.some((l) => l.floors === 3)).toBe(true);
    expect(d.fields.length).toBeGreaterThan(10);
  });

  it("keeps every building inside the district and off the roads and sidewalks", () => {
    for (const lot of d.lots) {
      const f = lot.footprint;
      expect(f.minX, lot.id).toBeGreaterThanOrEqual(-DISTRICT_HALF);
      expect(f.maxX, lot.id).toBeLessThanOrEqual(DISTRICT_HALF);
      expect(f.minZ, lot.id).toBeGreaterThanOrEqual(-DISTRICT_HALF);
      expect(f.maxZ, lot.id).toBeLessThanOrEqual(DISTRICT_HALF);
      expect([...d.roads, ...d.sidewalks].some((r) => overlaps(r, f)), `${lot.id} on a road`).toBe(false);
    }
  });

  it("has no overlapping buildings", () => {
    const solid = d.lots.filter((l) => l.kind !== "stall");
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) expect(overlaps(solid[i]!.footprint, solid[j]!.footprint), `${solid[i]!.id} ${solid[j]!.id}`).toBe(false);
  });

  it("puts every lot, tree and lamp in exactly one chunk", () => {
    const chunks = indexChunks(d);
    const count = (pick: (c: ReturnType<typeof indexChunks> extends Map<string, infer V> ? V : never) => unknown[]) => [...chunks.values()].reduce((s, c) => s + pick(c).length, 0);
    expect(count((c) => c.lots)).toBe(d.lots.length);
    expect(count((c) => c.trees)).toBe(d.trees.length);
    expect(count((c) => c.lamps)).toBe(d.lamps.length);
    const perSide = Math.ceil((DISTRICT_HALF * 2) / CHUNK_SIZE);
    expect(chunks.size).toBe(perSide * perSide);
    expect(chunks.has(chunkKey(0, 0))).toBe(true);
  });

  it("can be walked: the spawn reaches the market, the apron and the far corners over the street grid", () => {
    const cell = 1;
    const n = DISTRICT_HALF * 2;
    const blocked = new Uint8Array(n * n);
    const idx = (x: number, z: number) => Math.floor(z + DISTRICT_HALF) * n + Math.floor(x + DISTRICT_HALF);
    for (const r of walkBlockers(d)) {
      for (let z = Math.floor(r.minZ - 0.4); z <= Math.ceil(r.maxZ + 0.4); z++) {
        for (let x = Math.floor(r.minX - 0.4); x <= Math.ceil(r.maxX + 0.4); x++) if (x >= -DISTRICT_HALF && x < DISTRICT_HALF && z >= -DISTRICT_HALF && z < DISTRICT_HALF) blocked[idx(x, z)] = 1;
      }
    }
    const seen = new Uint8Array(n * n);
    const queue = [idx(d.spawn.x, d.spawn.z)];
    expect(blocked[queue[0]!]).toBe(0);
    seen[queue[0]!] = 1;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]!;
      const x = i % n;
      const z = Math.floor(i / n);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const j = nz * n + nx;
        if (!blocked[j] && !seen[j]) {
          seen[j] = 1;
          queue.push(j);
        }
      }
    }
    void cell;
    const reach = (x: number, z: number) => seen[idx(x, z)] === 1;
    expect(reach(0, 0)).toBe(true); // the market
    expect(reach(-180, 180)).toBe(true);
    expect(reach(180, -180)).toBe(true);
    const apron = d.blocks.find((b) => b.kind === "apron")!;
    expect(reach((apron.area.minX + apron.area.maxX) / 2, apron.area.maxZ - 4)).toBe(true);
    const roadCells = d.roads.reduce((s, r) => s + (r.maxX - r.minX) * (r.maxZ - r.minZ), 0);
    expect(roadCells).toBeGreaterThan(0);
  });
});
