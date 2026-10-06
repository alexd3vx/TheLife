import { describe, expect, it } from "vitest";
import { BLOCK, STREET, WATER, chargingSpotNear, generateLagos, generatePlan, hasInterior, indexChunks, indexLots, lagosTerrain, nearPolygon, walkableAt } from "./index.js";

const d = generateLagos();
const t = lagosTerrain();

describe("Lagos Island", () => {
  it("is the real island: about 4.5 by 3.2 km, lagoon all round", () => {
    expect(d.bounds.maxX).toBeGreaterThan(4400);
    expect(d.bounds.maxZ).toBeGreaterThan(3200);
    let water = 0, block = 0, street = 0;
    for (const c of t.cls) {
      if (c === WATER) water++;
      else if (c === BLOCK) block++;
      else if (c === STREET) street++;
    }
    expect(water).toBeGreaterThan(t.cls.length * 0.15);
    expect(block).toBeGreaterThan(300_000);
    expect(street).toBeGreaterThan(100_000);
  });

  it("has the real buildings of the island, on land, hardly any inside another", () => {
    const houses = d.lots.filter((l) => l.kind === "house" || l.kind === "flats" || l.kind === "shop");
    expect(houses.length).toBeGreaterThan(6_000);
    const chunks = indexChunks(d);
    expect(chunks.size).toBeGreaterThan(1_000);
    for (const l of houses.slice(0, 3_000)) {
      const f = l.footprint;
      expect(t.classAt((f.minX + f.maxX) / 2, (f.minZ + f.maxZ) / 2), l.id).not.toBe(WATER);
    }
    // No building stands inside another one's outline, and none is on top of another.
    const index = indexLots(d.lots);
    let overlapping = 0;
    for (const l of d.lots.slice(0, 4_000)) {
      const cx = (l.footprint.minX + l.footprint.maxX) / 2, cz = (l.footprint.minZ + l.footprint.maxZ) / 2;
      for (const o of index.near(cx, cz)) {
        if (o === l) continue;
        const inside = o.poly ? nearPolygon(o.poly, cx, cz) : cx > o.footprint.minX && cx < o.footprint.maxX && cz > o.footprint.minZ && cz < o.footprint.maxZ;
        if (inside) overlapping++; // OpenStreetMap has a few buildings drawn in parts
      }
    }
    expect(overlapping).toBeLessThan(120);
  });

  it("has the places from the map, with a way in", () => {
    const names = d.landmarks.map((l) => l.name);
    for (const n of ["National Museum", "General Hospital Lagos", "Lagos Central Mosque", "Cathedral Church of Christ", "Freedom Park", "Tafawa Balewa Square Bus Terminal"]) expect(names).toContain(n);
    for (const l of d.landmarks) expect(walkableAt(d, l.entrance.x, l.entrance.z), `${l.name} entrance`).toBe(true);
    const hospital = d.landmarks.find((l) => l.kind === "hospital" && l.lotId)!;
    expect(hospital).toBeTruthy();
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
    // Nearly everything must be reachable; a few sit in walled yards or across the water. (Walking there in the game uses a finer search.)
    expect(unreachable.length).toBeLessThan(d.landmarks.length * 0.15);
  }, 60_000);
});

describe("charging", () => {
  it("has sockets at places with power, and none in the middle of nowhere", () => {
    const bank = d.landmarks.find((l) => l.kind === "bank")!;
    expect(chargingSpotNear(d, bank.entrance.x, bank.entrance.z)).toBe(bank.name);
    expect(chargingSpotNear(d, 5, 5)).toBeNull();
    // Some street far from every place with power exists, and there the phone cannot charge.
    let lonely = 0;
    for (let x = 100; x < d.bounds.maxX; x += 97) for (let z = 100; z < d.bounds.maxZ; z += 89) if (t.classAt(x, z) === STREET && !chargingSpotNear(d, x, z)) lonely++;
    expect(lonely).toBeGreaterThan(50);
  });
});

describe("long routes", () => {
  it("finds a way from the spawn to the far ends of the island and over the bridge, and none into the water", async () => {
    const { coarseRoute } = await import("./index.js");
    const hospital = d.landmarks.find((l) => l.kind === "hospital" && l.lotId)!;
    const route = coarseRoute(t, d.spawn.x, d.spawn.z, hospital.entrance.x, hospital.entrance.z)!;
    expect(route.length).toBeGreaterThan(5);
    for (let i = 1; i < route.length; i++) expect(Math.hypot(route[i]!.x - route[i - 1]!.x, route[i]!.z - route[i - 1]!.z)).toBeLessThan(80);
    const station = d.landmarks.find((l) => l.kind === "station" && /Tafawa/.test(l.name))!;
    expect(coarseRoute(t, d.spawn.x, d.spawn.z, station.entrance.x, station.entrance.z)).not.toBeNull();
    expect(t.classAt(300, 2400)).toBe(WATER);
    expect(coarseRoute(t, d.spawn.x, d.spawn.z, 300, 2400)).toBeNull();
  });
});
