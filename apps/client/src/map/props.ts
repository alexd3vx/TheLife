import * as THREE from "three";
import type { Prop } from "@thelife/game-core";
import type { MeshBuilder } from "./meshBuilder";
import { addPlane } from "./landmarks";

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
const BRIGHT = ["#d8402f", "#e8b21c", "#2f7fd0", "#2f9a5a", "#e0671f", "#8d3ea8", "#e5e1d5", "#1f9aa6"].map(C);
const KIOSK_BODY = ["#2e6db4", "#d8402f", "#e8b21c", "#2f9a5a", "#e0671f", "#6b4ba0", "#1f9aa6", "#c9ced4"].map(C);
const CONCRETE = C("#a39d92");
const CONCRETE_DARK = C("#7d786f");
const SEAT = ["#2f6db8", "#c8322d", "#e8b21c"].map(C);
const CONTAINERS = ["#b5442f", "#2f5f9a", "#c9962a", "#3d7a52", "#8a8f96", "#d8d4c6"].map(C);
const HULL = ["#2f6db8", "#c8322d", "#e8b21c", "#2f9a5a"].map(C);
const HULL_WHITE = C("#e5e1d5");
const DANFO = C("#e8b21c");
const BLACK = C("#1c1f24");
const GEN_RED = C("#c8322d");
const BOARD = ["#1d5fa8", "#c8322d", "#1f9a5a", "#e8b21c", "#6b3fa0", "#e0671f"].map(C);

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
    case "plane":
      addPlane(b, p.x, p.z, p.variant, full);
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
    case "kiosk": {
      // a roadside shop: a painted box with a hatch, a roof and a bench outside
      if (!full) { boxAt(b, p.x, p.z, p.yaw, 0, 2.3, 2, 2, KIOSK_BODY[p.variant % 8]!); return; }
      const col = KIOSK_BODY[p.variant % 8]!;
      boxAt(b, p.x, p.z, p.yaw, 0, 2.2, 2, 2, col);
      boxAt(b, p.x, p.z, p.yaw, 2.2, 2.32, 2.3, 2.3, STEEL);
      boxAt(b, p.x, p.z, p.yaw, 0.95, 1.75, 1.3, 0.06, GLASS, 0, 1.0);
      boxAt(b, p.x, p.z, p.yaw, 0.9, 0.95, 1.5, 0.35, BENCH_WOOD, 0, 1.2);
      boxAt(b, p.x, p.z, p.yaw, 1.85, 2.15, 1.4, 0.05, BRIGHT[(p.variant + 3) % 8]!, 0, 1.03);
      return;
    }
    case "generator":
      if (!full) return;
      boxAt(b, p.x, p.z, 0, 0.05, 0.75, 1.0, 0.65, GEN_RED);
      boxAt(b, p.x, p.z, 0, 0.75, 0.85, 0.9, 0.55, STEEL);
      boxAt(b, p.x, p.z, 0, 0, 0.05, 1.1, 0.75, BLACK);
      boxAt(b, p.x, p.z, 0, 0.85, 1.3, 0.1, 0.1, STEEL, 0.35, 0);
      return;
    case "stall": {
      // a market stall: a table of goods under a big umbrella
      const cloth = BRIGHT[p.variant % 8]!;
      boxAt(b, p.x, p.z, p.yaw, 0, 0.8, 1.6, 0.9, BENCH_WOOD);
      boxAt(b, p.x, p.z, p.yaw, 0.8, 0.9, 1.5, 0.8, BRIGHT[(p.variant + 2) % 8]!, 0, 0);
      boxAt(b, p.x, p.z, p.yaw, 0, 2.3, 0.07, 0.07, STEEL, 0, -0.5);
      boxAt(b, p.x, p.z, p.yaw, 2.3, 2.5, 2.8, 2.4, cloth);
      if (full) {
        boxAt(b, p.x, p.z, p.yaw, 0, 2.3, 0.07, 0.07, STEEL, 0, 0.5);
        boxAt(b, p.x, p.z, p.yaw, 2.5, 2.62, 2.0, 1.6, cloth);
        boxAt(b, p.x, p.z, p.yaw, 0.9, 1.15, 0.5, 0.4, BRIGHT[(p.variant + 5) % 8]!, -0.35, 0.05);
        boxAt(b, p.x, p.z, p.yaw, 0.9, 1.1, 0.5, 0.4, BRIGHT[(p.variant + 1) % 8]!, 0.35, -0.05);
      }
      return;
    }
    case "billboard": {
      // a big ad board on two legs, standing well above the kerb
      const col = BOARD[p.variant % 6]!;
      boxAt(b, p.x, p.z, p.yaw, 0, 6.5, 0.3, 0.3, STEEL);
      boxAt(b, p.x, p.z, p.yaw, 6.0, 9.6, 7.2, 0.35, STEEL);
      if (full) {
        boxAt(b, p.x, p.z, p.yaw, 6.2, 9.4, 6.8, 0.1, col, 0, 0.22);
        boxAt(b, p.x, p.z, p.yaw, 7.2, 8.4, 4.6, 0.04, HULL_WHITE, 0, 0.29);
        boxAt(b, p.x, p.z, p.yaw, 6.2, 9.4, 6.8, 0.1, col, 0, -0.22);
      }
      return;
    }
    case "okada": {
      // a motorbike: long along z at yaw 0
      const col = BRIGHT[p.variant % 8]!;
      boxAt(b, p.x, p.z, p.yaw, 0.35, 0.8, 0.35, 1.5, col);
      boxAt(b, p.x, p.z, p.yaw, 0.8, 0.95, 0.3, 0.7, BLACK, 0, -0.2);
      if (!full) return;
      boxAt(b, p.x, p.z, p.yaw, 0, 0.55, 0.1, 0.5, TYRE, 0, 0.75);
      boxAt(b, p.x, p.z, p.yaw, 0, 0.55, 0.1, 0.5, TYRE, 0, -0.75);
      boxAt(b, p.x, p.z, p.yaw, 0.95, 1.1, 0.7, 0.08, STEEL, 0, 0.7);
      return;
    }
    case "keke": {
      // a yellow three-wheeler with a black canopy
      boxAt(b, p.x, p.z, p.yaw, 0.35, 1.0, 1.35, 2.3, DANFO);
      boxAt(b, p.x, p.z, p.yaw, 1.0, 1.7, 1.3, 1.5, BLACK, 0, -0.3);
      if (!full) return;
      boxAt(b, p.x, p.z, p.yaw, 1.0, 1.7, 1.15, 0.05, GLASS, 0, 0.45);
      for (const [sx, sz] of [[-0.65, -0.8], [0.65, -0.8], [0, 1.0]] as const) boxAt(b, p.x, p.z, p.yaw, 0, 0.5, 0.18, 0.5, TYRE, sx, sz);
      return;
    }
    case "danfo": {
      // a Lagos minibus: yellow with a black stripe, long along z at yaw 0
      boxAt(b, p.x, p.z, p.yaw, 0.35, 2.2, 1.95, 5.2, DANFO);
      boxAt(b, p.x, p.z, p.yaw, 1.05, 1.35, 1.97, 5.0, BLACK);
      if (!full) return;
      boxAt(b, p.x, p.z, p.yaw, 1.4, 2.0, 1.97, 4.4, GLASS);
      for (const sx of [-0.95, 0.95]) for (const sz of [-1.7, 1.7]) boxAt(b, p.x, p.z, p.yaw, 0, 0.7, 0.24, 0.7, TYRE, sx, sz);
      return;
    }
    case "boat": {
      // a wooden canoe or a small ferry, low and long
      const col = HULL[p.variant % 4]!;
      boxAt(b, p.x, p.z, p.yaw, 0.05, 0.5, 1.6, 6.0, col);
      boxAt(b, p.x, p.z, p.yaw, 0.5, 0.6, 1.7, 6.1, HULL_WHITE);
      if (!full) return;
      boxAt(b, p.x, p.z, p.yaw, 0.6, 1.8, 1.2, 1.8, HULL_WHITE, 0, -0.8);
      boxAt(b, p.x, p.z, p.yaw, 1.0, 1.4, 1.22, 1.6, GLASS, 0, -0.8);
      boxAt(b, p.x, p.z, p.yaw, 1.8, 1.9, 1.6, 2.2, col, 0, -0.8);
      return;
    }
    case "stand": {
      // a stadium stand: stepped concrete tiers with coloured seats, facing the pitch
      const tiers = 6, len = p.yaw === 0 ? 64 : 84;
      for (let i = 0; i < tiers; i++) {
        const h = 0.9 + i * 0.9, off = (1.5 - i * 0.55) * (p.variant ? -1 : 1);
        boxAt(b, p.x, p.z, p.yaw, 0, h, len, 0.9, i % 2 ? CONCRETE_DARK : CONCRETE, 0, off);
        if (full) boxAt(b, p.x, p.z, p.yaw, h, h + 0.12, len, 0.8, SEAT[i % 3]!, 0, off - 0.05);
      }
      boxAt(b, p.x, p.z, p.yaw, 6.6, 6.8, len + 2, 4, STEEL, 0, p.variant ? -0.4 : 0.4);
      return;
    }
    case "pitch": {
      // a football pitch inside a running track: mown stripes, white lines, goals (flat, just above the grass)
      if (!full) return;
      const W = 70, D = 100, TRACK = C("#b5573d"), GRASS_A = C("#5f9a4a"), GRASS_B = C("#6aa854"), LINE = C("#f4f4ee");
      b.flat(p.x - W / 2 - 9, p.z - D / 2 - 9, p.x + W / 2 + 9, p.z + D / 2 + 9, 0.05, TRACK, 6);
      for (let i = 0; i < 10; i++) b.flat(p.x - W / 2, p.z - D / 2 + i * (D / 10), p.x + W / 2, p.z - D / 2 + (i + 1) * (D / 10), 0.07, i % 2 ? GRASS_A : GRASS_B, 6);
      const line = (x0: number, z0: number, x1: number, z1: number) => b.flat(p.x + x0, p.z + z0, p.x + x1, p.z + z1, 0.09, LINE, 6);
      line(-W / 2, -D / 2, W / 2, -D / 2 + 0.25); line(-W / 2, D / 2 - 0.25, W / 2, D / 2);
      line(-W / 2, -D / 2, -W / 2 + 0.25, D / 2); line(W / 2 - 0.25, -D / 2, W / 2, D / 2);
      line(-W / 2, -0.12, W / 2, 0.12);
      for (const sz of [-1, 1]) {
        const z0 = sz * D / 2;
        line(-20, z0, -19.8, z0 - sz * 16); line(19.8, z0, 20, z0 - sz * 16); line(-20, z0 - sz * 16, 20, z0 - sz * 16 + 0.2);
        boxAt(b, p.x, p.z, 0, 0, 2.4, 0.12, 0.12, HULL_WHITE, -3.6, z0); boxAt(b, p.x, p.z, 0, 0, 2.4, 0.12, 0.12, HULL_WHITE, 3.6, z0);
        boxAt(b, p.x, p.z, 0, 2.3, 2.42, 7.4, 0.12, HULL_WHITE, 0, z0);
      }
      return;
    }
    case "container": {
      const col = CONTAINERS[p.variant % 6]!;
      boxAt(b, p.x, p.z, p.yaw, 0, 2.6, 2.4, 6.0, col);
      if (!full) return;
      boxAt(b, p.x, p.z, p.yaw, 0, 2.6, 2.46, 0.08, STEEL, 0, 0);
      boxAt(b, p.x, p.z, p.yaw, 0, 2.6, 2.46, 0.08, STEEL, 0, 2.4);
      boxAt(b, p.x, p.z, p.yaw, 0, 2.6, 2.46, 0.08, STEEL, 0, -2.4);
      return;
    }
  }
}
