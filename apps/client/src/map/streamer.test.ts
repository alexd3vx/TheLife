import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { generateDistrict } from "@thelife/game-core";
import { ChunkStreamer, LOD_RINGS } from "./streamer";

const district = generateDistrict(1);

function geometriesUnder(root: THREE.Object3D): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) out.push(mesh.geometry);
  });
  return out;
}

describe("chunk streamer", () => {
  it("loads the chunks around the player at three levels of detail and nothing beyond the last ring", () => {
    const s = new ChunkStreamer(district, 1e6);
    s.update(0, 0);
    const stats = s.stats();
    expect(stats.byLod[0]).toBeGreaterThan(0);
    expect(stats.byLod[1]).toBeGreaterThan(0);
    expect(stats.byLod[2]).toBeGreaterThan(0);
    expect(stats.loaded).toBe(stats.byLod[0] + stats.byLod[1] + stats.byLod[2]);
    expect(stats.loaded).toBeLessThan(stats.total + 1);
    expect(LOD_RINGS[2]).toBeGreaterThan(LOD_RINGS[0]);
  });

  it("walking across the district keeps memory bounded: geometry is freed as chunks drop out of range", () => {
    const s = new ChunkStreamer(district, 1e6);
    let peak = 0;
    let disposed = 0;
    const seen = new Set<THREE.BufferGeometry>();
    for (let x = -200; x <= 200; x += 8) {
      s.update(x, -190 + x * 0.4);
      for (const g of geometriesUnder(s.root)) {
        if (!seen.has(g)) {
          seen.add(g);
          g.addEventListener("dispose", () => disposed++);
        }
      }
      peak = Math.max(peak, geometriesUnder(s.root).length);
    }
    expect(peak).toBeLessThan(200);
    expect(seen.size).toBeGreaterThan(peak); // more were built over the walk than ever existed at once...
    expect(disposed).toBeGreaterThan(seen.size - peak - 5); // ...because the rest were disposed
    s.dispose();
    expect(s.stats().loaded).toBe(0);
  });

  it("builds only a little per frame when given a budget, and catches up over frames", () => {
    const s = new ChunkStreamer(district, 0); // budget 0: exactly one chunk per update
    s.update(0, 0);
    expect(s.stats().loaded).toBe(1);
    const queued = s.stats().queued;
    expect(queued).toBeGreaterThan(50);
    for (let i = 0; i < 400; i++) s.update(0, 0);
    expect(s.stats().queued).toBe(0);
  });

  it("does not flicker: a chunk right on a ring keeps its level when the player shuffles a metre", () => {
    const s = new ChunkStreamer(district, 1e6);
    s.update(0, 0);
    for (let i = 0; i < 20; i++) s.update(i % 2 ? 1 : -1, 0);
    s.update(0, 0);
    const settled = JSON.stringify(s.stats().byLod);
    for (let i = 0; i < 40; i++) s.update(i % 2 ? 1 : -1, 0);
    s.update(0, 0);
    expect(JSON.stringify(s.stats().byLod)).toBe(settled);
  });
});
