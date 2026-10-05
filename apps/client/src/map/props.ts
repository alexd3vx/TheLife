import * as THREE from "three";
import type { Prop } from "@thelife/game-core";
import type { MeshBuilder } from "./meshBuilder";

const C = (hex: string) => new THREE.Color(hex);
const CAR_COLOURS = ["#c9ced4", "#2d3a4f", "#a63a32", "#d8d4c6", "#3d5f48", "#1c1f24"].map(C);
const GLASS = C("#27323d");
const TYRE = C("#16171a");
const POLE_WOOD = C("#6b5640");
const STEEL = C("#5a6068");
const HYDRANT = C("#c4372d");
const BIN = C("#2f6b52");
const BENCH_WOOD = C("#8a6a46");
const SHELTER = C("#3a6ea8");
const SIGN_RED = C("#c8322d");

/** A box centred on (cx, cz), sizes given for yaw 0 (x wide, z deep) and swapped for yaw 90. */
function boxAt(b: MeshBuilder, cx: number, cz: number, yaw: 0 | 90, y0: number, y1: number, w: number, d: number, color: THREE.Color, ox = 0, oz = 0) {
  const [hw, hd] = yaw === 90 ? [d / 2, w / 2] : [w / 2, d / 2];
  const [dx, dz] = yaw === 90 ? [oz, ox] : [ox, oz];
  b.box(cx + dx - hw, y0, cz + dz - hd, cx + dx + hw, y1, cz + dz + hd, color, 0.85);
}

/** Adds one piece of street furniture or a parked car to a chunk's merged mesh. `full` = near detail; otherwise only the tall silhouettes. */
export function addProp(b: MeshBuilder, p: Prop, full: boolean): void {
  switch (p.kind) {
    case "pole":
      boxAt(b, p.x, p.z, 0, 0, 8.4, 0.24, 0.24, POLE_WOOD);
      if (full) {
        boxAt(b, p.x, p.z, p.yaw, 7.7, 7.85, 1.8, 0.12, POLE_WOOD);
        boxAt(b, p.x, p.z, p.yaw, 6.9, 7.0, 1.2, 0.1, POLE_WOOD);
      }
      return;
    case "hydrant":
      if (!full) return;
      boxAt(b, p.x, p.z, 0, 0, 0.62, 0.26, 0.26, HYDRANT);
      boxAt(b, p.x, p.z, 0, 0.62, 0.72, 0.32, 0.32, HYDRANT);
      boxAt(b, p.x, p.z, 0, 0.3, 0.42, 0.52, 0.16, HYDRANT);
      return;
    case "bin":
      if (!full) return;
      boxAt(b, p.x, p.z, 0, 0, 0.9, 0.5, 0.5, BIN);
      boxAt(b, p.x, p.z, 0, 0.9, 0.96, 0.56, 0.56, STEEL);
      return;
    case "bench":
      if (!full) return;
      boxAt(b, p.x, p.z, p.yaw, 0.42, 0.5, 1.7, 0.5, BENCH_WOOD);
      boxAt(b, p.x, p.z, p.yaw, 0.5, 0.95, 1.7, 0.08, BENCH_WOOD, 0, -0.22);
      boxAt(b, p.x, p.z, p.yaw, 0, 0.42, 0.1, 0.4, STEEL, -0.7);
      boxAt(b, p.x, p.z, p.yaw, 0, 0.42, 0.1, 0.4, STEEL, 0.7);
      return;
    case "busStop":
      if (!full) return;
      boxAt(b, p.x, p.z, 0, 2.5, 2.62, 1.5, 3.2, SHELTER);
      boxAt(b, p.x, p.z, 0, 0, 2.5, 0.08, 0.08, STEEL, -0.7, -1.5);
      boxAt(b, p.x, p.z, 0, 0, 2.5, 0.08, 0.08, STEEL, -0.7, 1.5);
      boxAt(b, p.x, p.z, 0, 0.5, 2.3, 0.05, 3.0, GLASS, 0.72, 0);
      boxAt(b, p.x, p.z, 0, 0.42, 0.5, 0.5, 1.6, BENCH_WOOD, 0.2, 0);
      return;
    case "sign":
      if (!full) return;
      boxAt(b, p.x, p.z, 0, 0, 2.6, 0.07, 0.07, STEEL);
      boxAt(b, p.x, p.z, 0, 2.05, 2.65, 0.55, 0.05, SIGN_RED);
      return;
    case "car": {
      // yaw 0: the car's long side runs along z.
      const body = CAR_COLOURS[p.variant % CAR_COLOURS.length]!;
      boxAt(b, p.x, p.z, p.yaw, 0.3, 0.95, 1.8, 4.2, body);
      if (!full) return;
      boxAt(b, p.x, p.z, p.yaw, 0.95, 1.55, 1.55, 2.2, GLASS, 0, -0.1);
      boxAt(b, p.x, p.z, p.yaw, 1.55, 1.62, 1.5, 2.1, body, 0, -0.1);
      for (const sx of [-0.85, 0.85]) for (const sz of [-1.35, 1.35]) boxAt(b, p.x, p.z, p.yaw, 0, 0.55, 0.22, 0.6, TYRE, sx, sz);
      return;
    }
  }
}
