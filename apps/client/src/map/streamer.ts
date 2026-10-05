import * as THREE from "three";
import { indexChunks, type ChunkData, type District } from "@thelife/game-core";
import { buildChunk, type BuiltChunk, type Lod } from "./chunkBuilder";

/** Distances (metres from the player to the nearest edge of a chunk) at which detail steps down. Past the last, a chunk is not loaded. */
export const LOD_RINGS = [60, 130, 230] as const;
const HYSTERESIS = 12; // a chunk changes level only once it is this far past the line, so it doesn't flicker back and forth

interface Loaded {
  lod: Lod;
  built: BuiltChunk;
}

export interface StreamStats {
  total: number;
  loaded: number;
  byLod: [number, number, number];
  triangles: number;
  /** Chunks built in the last second, and how long the slowest took (ms). */
  buildsPerSecond: number;
  slowestBuildMs: number;
  queued: number;
}

/**
 * Keeps the chunks around the player built at the right level of detail and drops the rest. Building is spread over frames
 * (a small time budget each) so walking never hitches; unloading frees the geometry straight away.
 */
export class ChunkStreamer {
  private readonly chunks: ChunkData[];
  private readonly loaded = new Map<ChunkData, Loaded>();
  readonly root = new THREE.Group();
  private builds: number[] = [];
  private slowest = 0;
  private queued = 0;

  constructor(district: District, private readonly budgetMs = 4) {
    this.chunks = [...indexChunks(district).values()];
    this.root.name = "chunks";
  }

  private wanted(chunk: ChunkData, px: number, pz: number): Lod | null {
    const b = chunk.bounds;
    const dx = Math.max(b.minX - px, 0, px - b.maxX);
    const dz = Math.max(b.minZ - pz, 0, pz - b.maxZ);
    const dist = Math.hypot(dx, dz);
    const have = this.loaded.get(chunk)?.lod;
    // Hysteresis: judge against a ring pushed outward if already loaded finer, inward if coarser.
    const pad = (ring: number, level: number) => (have === undefined ? 0 : have <= level ? HYSTERESIS : -HYSTERESIS) + ring;
    if (dist <= pad(LOD_RINGS[0], 0)) return 0;
    if (dist <= pad(LOD_RINGS[1], 1)) return 1;
    if (dist <= pad(LOD_RINGS[2], 2)) return 2;
    return null;
  }

  /** Call every frame with the player's position. */
  update(px: number, pz: number): void {
    const now = performance.now();
    const todo: { chunk: ChunkData; lod: Lod; dist: number }[] = [];
    for (const chunk of this.chunks) {
      const want = this.wanted(chunk, px, pz);
      const have = this.loaded.get(chunk);
      if (want === null) {
        if (have) this.unload(chunk);
        continue;
      }
      if (!have || have.lod !== want) todo.push({ chunk, lod: want, dist: Math.hypot((chunk.bounds.minX + chunk.bounds.maxX) / 2 - px, (chunk.bounds.minZ + chunk.bounds.maxZ) / 2 - pz) });
    }
    todo.sort((a, b) => a.dist - b.dist);
    this.queued = todo.length;
    let spent = 0;
    for (const job of todo) {
      const t0 = performance.now();
      this.build(job.chunk, job.lod);
      const ms = performance.now() - t0;
      spent += ms;
      this.slowest = Math.max(this.slowest * 0.98, ms);
      this.builds.push(now);
      this.queued--;
      if (spent >= this.budgetMs) break; // at least one chunk is built every frame, then the budget applies
    }
    this.builds = this.builds.filter((t) => now - t < 1000);
  }

  /** Builds everything in range at once (for the first frame, before the loading screen goes away). */
  prime(px: number, pz: number): void {
    for (const chunk of this.chunks) {
      const want = this.wanted(chunk, px, pz);
      if (want !== null) this.build(chunk, want);
    }
  }

  private build(chunk: ChunkData, lod: Lod) {
    this.unload(chunk);
    const built = buildChunk(chunk, lod);
    this.root.add(built.group);
    this.loaded.set(chunk, { lod, built });
  }

  private unload(chunk: ChunkData) {
    const have = this.loaded.get(chunk);
    if (!have) return;
    this.root.remove(have.built.group);
    for (const g of have.built.geometries) g.dispose();
    this.loaded.delete(chunk);
  }

  stats(): StreamStats {
    const byLod: [number, number, number] = [0, 0, 0];
    let triangles = 0;
    for (const l of this.loaded.values()) {
      byLod[l.lod]++;
      triangles += l.built.triangles;
    }
    return { total: this.chunks.length, loaded: this.loaded.size, byLod, triangles: Math.round(triangles), buildsPerSecond: this.builds.length, slowestBuildMs: Math.round(this.slowest * 10) / 10, queued: this.queued };
  }

  dispose(): void {
    for (const chunk of [...this.loaded.keys()]) this.unload(chunk);
  }
}
