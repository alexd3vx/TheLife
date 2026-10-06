import { describe, expect, it } from "vitest";
import { BLOCK, STREET, WATER, generateLagos, generatePlan, hasInterior, indexChunks, lagosTerrain, walkableAt, type Lot } from "./index.js";

const d = generateLagos();
const t = lagosTerrain();

describe("Lagos Island", () => {
  it("is the size of the picture: about 3 by 4.5 km, mostly water around the island", () => {
    expect(d.bounds.maxX).toBeGreaterThan(3000);
    expect(d.bounds.maxZ).toBeGreaterThan(4400);
    let water = 0, block = 0, street = 0;
    for (const c of t.cls) {
      if (c === WATER) water++;
      else if (c === BLOCK) block++;
      else if (c === STREET) street++;
    }
    expect(water).toBeGreaterThan(t.cls.length * 0.3);
    expect(block).toBeGreaterThan(30_000);
    expect(street).toBeGreaterThan(50_000);
  });

  it("fills the blocks with thousands of buildings that stand on blocks and do not overlap", () => {
    const houses = d.lots.filter((l) => l.kind === "house" || l.kind === "flats" || l.kind === "shop");
    expect(houses.length).toBeGreaterThan(5_000);
    const chunks = indexChunks(d);
    expect(chunks.size).toBeGreaterThan(1_000);
    for (const l of houses.slice(0, 3_000)) {
      const f = l.footprint;
      expect(t.classAt((f.minX + f.maxX) / 2, (f.minZ + f.maxZ) / 2), l.id).toBe(BLOCK);
    }
    const bucket = new Map<string, Lot[]>();
    for (const l of d.lots) {
      const key = `${Math.floor(l.footprint.minX / 30)},${Math.floor(l.footprint.minZ / 30)}`;
      bucket.set(key, [...(bucket.get(key) ?? []), l]);
    }
    for (const list of bucket.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]!.footprint, b = list[j]!.footprint;
          expect(a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ, `${list[i]!.id} overlaps ${list[j]!.id}`).toBe(false);
        }
      }
    }
  });

  it("has the places from the map, with a way in", () => {
    const names = d.landmarks.map((l) => l.name);
    for (const n of ["Balogun Market", "Independence House", "National Museum", "Tafawa Balewa Square", "Lagos Island General Hospital", "Lagos Train Station Terminus", "Marina Bus Station", "Onikan Cricket Stadium"]) expect(names).toContain(n);
    for (const l of d.landmarks) expect(walkableAt(d, l.entrance.x, l.entrance.z), `${l.name} entrance`).toBe(true);
    const hospital = d.landmarks.find((l) => l.kind === "hospital")!;
    expect(hospital.lotId).not.toBeNull();
    const lot = d.lots.find((l) => l.id === hospital.lotId)!;
    expect(hasInterior(lot)).toBe(true);
    expect(generatePlan(lot).rooms.length).toBeGreaterThan(5);
  });

  it("is the same every time, and the spawn is on dry land", () => {
    const again = generateLagos();
    expect(again.lots.length).toBe(d.lots.length);
    expect(again.spawn).toEqual(d.spawn);
    expect(walkableAt(d, d.spawn.x, d.spawn.z)).toBe(true);
    expect(t.walkable(d.spawn.x, d.spawn.z)).toBe(true);
  });

  it("can walk from the spawn to every named place on foot (coarse search over land)", () => {
    const step = 3;
    const w = Math.ceil(d.bounds.maxX / step), h = Math.ceil(d.bounds.maxZ / step);
    const seen = new Uint8Array(w * h);
    const free = (cx: number, cz: number) => walkableAt(d, (cx + 0.5) * step, (cz + 0.5) * step, 0.4);
    const start = [Math.floor(d.spawn.x / step), Math.floor(d.spawn.z / step)] as const;
    const queue = [start[1] * w + start[0]];
    seen[queue[0]!] = 1;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]!;
      const x = i % w, z = (i / w) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const j = nz * w + nx;
        if (!seen[j] && free(nx, nz)) {
          seen[j] = 1;
          queue.push(j);
        }
      }
    }
    const unreachable = d.landmarks.filter((l) => !seen[Math.floor(l.entrance.z / step) * w + Math.floor(l.entrance.x / step)]).map((l) => l.name);
    console.log("not reachable on foot from the spawn:", unreachable);
    // Everything on the main island must be reachable; places across the water need a bridge, which the map draws as a street.
    expect(unreachable.filter((n) => !/Train Station|Port of Lagos/.test(n))).toEqual([]);
  }, 60_000);
});

describe("long routes", () => {
  it("finds a way from the spawn to the far ends of the island and over the bridge, and none into the water", async () => {
    const { coarseRoute } = await import("./index.js");
    const hospital = d.landmarks.find((l) => l.kind === "hospital")!;
    const route = coarseRoute(t, d.spawn.x, d.spawn.z, hospital.entrance.x, hospital.entrance.z)!;
    expect(route.length).toBeGreaterThan(5);
    for (let i = 1; i < route.length; i++) expect(Math.hypot(route[i]!.x - route[i - 1]!.x, route[i]!.z - route[i - 1]!.z)).toBeLessThan(80);
    const station = d.landmarks.find((l) => l.kind === "station" && /Train/.test(l.name))!;
    expect(coarseRoute(t, d.spawn.x, d.spawn.z, station.entrance.x, station.entrance.z)).not.toBeNull();
    expect(t.classAt(1400, 3300)).toBe(WATER);
    expect(coarseRoute(t, d.spawn.x, d.spawn.z, 1400, 3300)).toBeNull();
  });
});
