import { LAGOS_ROADS } from "./lagosRoads.js";
import type { LagosTerrain } from "./lagos.js";

/**
 * A sharp picture of the streets for the renderer: for every ground cell, how far (in metres, signed) it is inside the nearest street's
 * edge, that street's half width, and which way it runs. Sampled smoothly by the graphics card, the edge lands exactly where the real
 * street edge is instead of on the 3 m cell grid.
 *
 *  - `edge`: (metres inside the street + 8) * 8, so 0 = 8 m outside and 255 = 24 m inside
 *  - `half`: half the street width in metres * 8
 *  - `angle`: the street direction, 0 to 180 degrees over 0 to 255
 *  - `lateral`: how far to the left or right of the street's centre line this cell is, (metres + 12) * 10.6. It changes in a straight
 *    line right across the street, so the centre line can be found exactly (the distance to the edge peaks in a point there, which a
 *    smooth lookup between cells would round off).
 */
export interface RoadField {
  /** The picture's size in cells (finer than the ground grid so edges are exact even between two close streets). */
  width: number;
  height: number;
  /** Metres per cell. */
  cell: number;
  edge: Uint8Array;
  half: Uint8Array;
  angle: Uint8Array;
  lateral: Uint8Array;
}

export function buildRoadField(t: LagosTerrain, finer = 2): RoadField {
  const w = t.width * finer, h = t.height * finer, cell = t.cell / finer;
  const d = new Float32Array(w * h).fill(-8);
  const half = new Float32Array(w * h);
  const ang = new Float32Array(w * h);
  const lat = new Float32Array(w * h);
  for (const row of LAGOS_ROADS) {
    const halfW = row[0]! / 20;
    let px = row[1]! / 10, pz = row[2]! / 10;
    for (let i = 3; i + 1 < row.length; i += 2) {
      const qx = px + row[i]! / 10, qz = pz + row[i + 1]! / 10;
      const dx = qx - px, dz = qz - pz;
      const len2 = dx * dx + dz * dz || 1e-9;
      const pad = halfW + 8 + cell; // out to the -8 m the picture stores, so the edge between two cells is interpolated from true distances
      const x0 = Math.max(0, Math.floor((Math.min(px, qx) - pad) / cell)), x1 = Math.min(w - 1, Math.floor((Math.max(px, qx) + pad) / cell));
      const z0 = Math.max(0, Math.floor((Math.min(pz, qz) - pad) / cell)), z1 = Math.min(h - 1, Math.floor((Math.max(pz, qz) + pad) / cell));
      const a = (Math.atan2(dz, dx) + Math.PI * 2) % Math.PI;
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          const x = (cx + 0.5) * cell, z = (cz + 0.5) * cell;
          const s = Math.max(0, Math.min(1, ((x - px) * dx + (z - pz) * dz) / len2));
          const dist = Math.hypot(x - (px + s * dx), z - (pz + s * dz));
          const inside = halfW - dist;
          const k = cz * w + cx;
          if (inside > d[k]!) {
            d[k] = inside;
            half[k] = halfW;
            ang[k] = a;
            lat[k] = ((dx * (z - pz) - dz * (x - px)) / Math.sqrt(len2)) * -1; // left (-) or right (+) of the way's direction
          }
        }
      }
      px = qx;
      pz = qz;
    }
  }
  const edge = new Uint8Array(w * h), halfOut = new Uint8Array(w * h), angle = new Uint8Array(w * h), lateral = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    edge[i] = Math.max(0, Math.min(255, Math.round((d[i]! + 8) * 8)));
    halfOut[i] = Math.min(255, Math.round(half[i]! * 8));
    angle[i] = Math.round((ang[i]! / Math.PI) * 255);
    lateral[i] = Math.max(0, Math.min(255, Math.round((lat[i]! + 12) * 10.625)));
  }
  return { width: w, height: h, cell, edge, half: halfOut, angle, lateral };
}
