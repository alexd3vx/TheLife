import { LAGOS_ROADS } from "./lagosRoads.js";
import { WATER, type LagosTerrain } from "./lagos.js";

/** A stretch of street that crosses open water: drawn in 3D as a bridge (railings, piers, girders). */
export interface BridgeSpan {
  /** Street width in metres. */
  width: number;
  /** The centre line, a point every few metres, from one shore to the other. */
  pts: { x: number; z: number }[];
  /** Length in metres. */
  length: number;
}

const STEP = 4;

/**
 * Finds the bridges: places where a street has water on both sides of it. (The island data paints a bridge as ordinary street, so the
 * only sign of one is that the ground beside it is lagoon.) Short gaps (a culvert, a creek mouth) and short spans are ignored.
 */
export function findBridges(t: LagosTerrain, minLength = 36): BridgeSpan[] {
  const out: BridgeSpan[] = [];
  const inside = (x: number, z: number) => x > 40 && z > 40 && x < t.size.x - 40 && z < t.size.z - 40;
  const wetAt = (x: number, z: number) => inside(x, z) && t.classAt(x, z) === WATER;
  for (const row of LAGOS_ROADS) {
    const width = row[0]! / 10;
    const side = width / 2 + 7;
    let px = row[1]! / 10, pz = row[2]! / 10;
    const pts: { x: number; z: number; wet: boolean }[] = [];
    const sample = (x: number, z: number, nx: number, nz: number) => {
      const l = Math.hypot(nx, nz) || 1;
      const ox = (-nz / l) * side, oz = (nx / l) * side;
      pts.push({ x, z, wet: wetAt(x + ox, z + oz) && wetAt(x - ox, z - oz) });
    };
    for (let i = 3; i + 1 < row.length; i += 2) {
      const dx = row[i]! / 10, dz = row[i + 1]! / 10;
      const len = Math.hypot(dx, dz);
      const n = Math.max(1, Math.round(len / STEP));
      for (let k = 0; k < n; k++) sample(px + (dx * k) / n, pz + (dz * k) / n, dx, dz);
      px += dx;
      pz += dz;
    }
    // Runs of wet samples, joining runs separated by one or two dry samples (a pier on an island, a gap in the data).
    let i = 0;
    while (i < pts.length) {
      if (!pts[i]!.wet) { i++; continue; }
      let j = i, gap = 0, last = i;
      while (j + 1 < pts.length && gap <= 2) {
        j++;
        if (pts[j]!.wet) { last = j; gap = 0; } else gap++;
      }
      // Reach a little onto each shore so the deck starts on land.
      const a = Math.max(0, i - 2), b = Math.min(pts.length - 1, last + 2);
      const span = pts.slice(a, b + 1).map((p) => ({ x: p.x, z: p.z }));
      const length = (b - a) * STEP;
      if (length >= minLength) out.push({ width, pts: span, length });
      i = last + 1;
    }
  }
  return out;
}
