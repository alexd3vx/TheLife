import * as THREE from "three";
import type { Lot } from "@thelife/game-core";
import type { MeshBuilder } from "./meshBuilder";
import { V } from "./wall";

const C = (hex: string) => new THREE.Color(hex);
const WALLS = ["#ece4d3", "#e3d3bd", "#d6dccf", "#e8d3cc", "#cfdae2", "#efe6b8", "#dedad2", "#d9b9a4"].map(C);
const ROOFS = ["#7c5545", "#6a625b", "#7b8085", "#8f6a52", "#56626d", "#8a5a56", "#66695a", "#8c8068"].map(C);
const GLASS = C("#33475a");
const TOP = C("#8b8e91");

/** A building with a turned or L-shaped outline: straight walls up from the outline, windows in rows near the player, a flat roof. */
export function addPrism(b: MeshBuilder, lot: Lot, lod: 0 | 1 | 2): void {
  const poly = lot.poly!;
  const height = lot.floors * lot.storey;
  const wall = WALLS[lot.colour % WALLS.length]!;
  const roof = ROOFS[(lot.colour + lot.floors) % ROOFS.length]!;
  // Which way is outward? (The outline may be listed either way round.)
  let area = 0;
  let cx = 0, cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i]!, [x1, z1] = poly[(i + 1) % poly.length]!;
    area += x0 * z1 - x1 * z0;
    cx += x0;
    cz += z0;
  }
  cx /= poly.length;
  cz /= poly.length;

  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i]!, [x1, z1] = poly[(i + 1) % poly.length]!;
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    let nx = dz / len, nz = -dx / len;
    if (nx * ((x0 + x1) / 2 - cx) + nz * ((z0 + z1) / 2 - cz) < 0) {
      nx = -nx;
      nz = -nz;
    }
    const out = { x: nx, y: 0, z: nz };
    const low = wall.clone().multiplyScalar(0.8);
    b.quad(V(x0, 0, z0), V(x1, 0, z1), V(x1, height, z1), V(x0, height, z0), out, wall, low, wall);
    if (lod !== 0 || len < 2.6) continue;
    // Windows in rows, one per three metres, floor by floor; a slightly darker ground floor.
    const cols = Math.max(1, Math.floor((len - 1.2) / 3));
    const step = len / cols;
    const ux = dx / len, uz = dz / len;
    for (let f = 0; f < lot.floors; f++) {
      const y0 = f * lot.storey + (f === 0 ? 1.0 : 0.95);
      for (let k = 0; k < cols; k++) {
        const u0 = step * (k + 0.5) - 0.55, u1 = u0 + 1.1;
        const o = 0.03;
        b.quad(
          V(x0 + ux * u0 + nx * o, y0, z0 + uz * u0 + nz * o),
          V(x0 + ux * u1 + nx * o, y0, z0 + uz * u1 + nz * o),
          V(x0 + ux * u1 + nx * o, y0 + 1.25, z0 + uz * u1 + nz * o),
          V(x0 + ux * u0 + nx * o, y0 + 1.25, z0 + uz * u0 + nz * o),
          out,
          GLASS,
        );
      }
    }
  }

  // The roof.
  const contour = poly.map(([x, z]) => new THREE.Vector2(x, z));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const top = height + 0.12;
  for (const [a, c2, d] of faces) {
    const A = poly[a!]!, B = poly[c2!]!, D = poly[d!]!;
    // Face upward whatever order the outline was in.
    const cross = (B[0] - A[0]) * (D[1] - A[1]) - (B[1] - A[1]) * (D[0] - A[0]);
    if (cross > 0) b.tri(V(A[0], top, A[1]), V(D[0], top, D[1]), V(B[0], top, B[1]), roof);
    else b.tri(V(A[0], top, A[1]), V(B[0], top, B[1]), V(D[0], top, D[1]), roof);
  }
  void area;
  if (lod === 0 && lot.id.length % 2 === 0 && (lot.colour + lot.floors) % 3 === 0) {
    // A tank or stair box on the roof.
    b.box(cx - 1, top, cz - 1, cx + 1, top + 1.4, cz + 1, TOP, 0.85);
  }
}
