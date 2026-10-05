import * as THREE from "three";
import type { Facing, LandmarkKind, Lot, Rect } from "@thelife/game-core";
import type { MeshBuilder } from "./meshBuilder";
import { V, wallRect } from "./wall";

const C = (hex: string) => new THREE.Color(hex);

/** Wall colour for each named place. */
export const LANDMARK_WALL: Record<LandmarkKind, THREE.Color> = {
  airport: C("#d9dde0"), police: C("#cfd9e8"), hospital: C("#f2f4f5"), school: C("#f0d98c"), church: C("#efe6d2"), mosque: C("#f4f1ea"),
  fire: C("#b53a2f"), bank: C("#cfc8b8"), fuel: C("#e8e4da"), hotel: C("#e8d5b5"), market: C("#d9d3c5"),
};

const WHITE = C("#f6f6f4");
const RED = C("#c8322d");
const BLUE = C("#2f5fa8");
const DARK = C("#2b2f35");
const GLASS = C("#27323d");
const TEAL = C("#1f8a86");
const GOLD = C("#d8b24a");
const STEEL = C("#8a9199");

interface Frame {
  f: Rect;
  facing: Facing;
  /** Width of the front wall and the unit vectors along it and out of it. */
  width: number;
  height: number;
  cx: number;
  cz: number;
}

function frame(lot: Lot): Frame {
  const f = lot.footprint;
  const width = lot.facing === 0 || lot.facing === 2 ? f.maxX - f.minX : f.maxZ - f.minZ;
  return { f, facing: lot.facing, width, height: lot.floors * lot.storey, cx: (f.minX + f.maxX) / 2, cz: (f.minZ + f.maxZ) / 2 };
}

/** A box placed relative to the building: `u` metres along the front wall from its centre, `out` metres in front of it. */
function boxFront(b: MeshBuilder, fr: Frame, u: number, out: number, w: number, d: number, y0: number, y1: number, color: THREE.Color) {
  const f = fr.f;
  const [alongX, sign] = fr.facing === 0 ? [true, -1] : fr.facing === 2 ? [true, 1] : fr.facing === 1 ? [false, 1] : [false, -1];
  const edge = alongX ? (sign < 0 ? f.minZ : f.maxZ) : sign < 0 ? f.minX : f.maxX;
  const centreAlong = alongX ? fr.cx : fr.cz;
  const a = centreAlong + u;
  const o = edge + sign * out;
  if (alongX) b.box(a - w / 2, y0, o - d / 2, a + w / 2, y1, o + d / 2, color, 0.9);
  else b.box(o - d / 2, y0, a - w / 2, o + d / 2, y1, a + w / 2, color, 0.9);
}

function dome(b: MeshBuilder, x: number, y: number, z: number, r: number, color: THREE.Color) {
  const geo = new THREE.SphereGeometry(r, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  b.geometry(geo, new THREE.Matrix4().makeTranslation(x, y, z), color);
  geo.dispose();
}

/** The part of a named place that makes it recognisable: signs, towers, domes, canopies. `full` is near detail. */
export function addLandmark(b: MeshBuilder, lot: Lot, kind: LandmarkKind, full: boolean): void {
  const fr = frame(lot);
  const { f, height: h } = fr;
  const band = (color: THREE.Color, v0: number, v1: number) => wallRect(b, f, fr.facing, fr.width * 0.04, fr.width * 0.96, v0, v1, 0.06, color);
  switch (kind) {
    case "police":
      band(BLUE, h - 1.4, h - 0.3);
      if (full) {
        boxFront(b, fr, -fr.width * 0.35, 0.6, 0.12, 0.12, 0, 7, STEEL); // flag pole
        boxFront(b, fr, -fr.width * 0.35 + 0.65, 0.6, 1.2, 0.05, 5.8, 6.8, BLUE);
        boxFront(b, fr, 0, 0.5, 3.2, 1.4, 0, 0.5, C("#8b8f95")); // steps
        wallRect(b, f, fr.facing, fr.width * 0.44, fr.width * 0.56, 0.5, 2.5, 0.07, DARK); // door
      }
      return;
    case "hospital": {
      // A big red cross on the front and a helipad on the roof.
      const cu = fr.width / 2;
      wallRect(b, f, fr.facing, cu - 0.45, cu + 0.45, h - 4.4, h - 1.4, 0.08, RED);
      wallRect(b, f, fr.facing, cu - 1.5, cu + 1.5, h - 3.5, h - 2.3, 0.09, RED);
      b.box(fr.cx - 4, h + 0.25, fr.cz - 4, fr.cx + 4, h + 0.4, fr.cz + 4, C("#4a5058"), 1);
      b.box(fr.cx - 1.8, h + 0.4, fr.cz - 2, fr.cx - 1.3, h + 0.45, fr.cz + 2, WHITE, 1);
      b.box(fr.cx + 1.3, h + 0.4, fr.cz - 2, fr.cx + 1.8, h + 0.45, fr.cz + 2, WHITE, 1);
      b.box(fr.cx - 1.8, h + 0.4, fr.cz - 0.25, fr.cx + 1.8, h + 0.45, fr.cz + 0.25, WHITE, 1);
      if (full) boxFront(b, fr, 0, 0.9, 5, 1.8, 2.9, 3.1, C("#4aa3a0")); // entrance canopy
      return;
    }
    case "school":
      band(C("#2f8a4f"), h - 1.2, h - 0.3);
      if (full) {
        boxFront(b, fr, fr.width * 0.38, 0.6, 0.12, 0.12, 0, 7.5, STEEL);
        boxFront(b, fr, fr.width * 0.38 + 0.7, 0.6, 1.3, 0.05, 6.2, 7.3, C("#2f8a4f"));
        wallRect(b, f, fr.facing, fr.width * 0.44, fr.width * 0.56, 0, 2.3, 0.06, C("#7a4a2a"));
      }
      return;
    case "church": {
      boxFront(b, fr, 0, -1.5, 2.8, 2.8, 0, 11, WHITE); // bell tower
      b.box(fr.cx - 0.1, 11, fr.cz - 0.1, fr.cx + 0.1, 13, fr.cz + 0.1, GOLD, 1);
      b.box(fr.cx - 0.6, 12.2, fr.cz - 0.1, fr.cx + 0.6, 12.4, fr.cz + 0.1, GOLD, 1);
      if (full) wallRect(b, f, fr.facing, fr.width * 0.42, fr.width * 0.58, 0, 2.6, 0.06, C("#5a3b26"));
      return;
    }
    case "mosque": {
      const r = Math.min(f.maxX - f.minX, f.maxZ - f.minZ) * 0.28;
      dome(b, fr.cx, h + 0.1, fr.cz, r, WHITE);
      dome(b, fr.cx, h + r - 0.4, fr.cz, r * 0.08, GOLD);
      for (const sx of [f.minX + 0.8, f.maxX - 0.8]) {
        b.box(sx - 0.6, 0, f.minZ + 0.2, sx + 0.6, 13, f.minZ + 1.4, WHITE, 0.85);
        dome(b, sx, 13, f.minZ + 0.8, 0.9, C("#2f8a6a"));
      }
      return;
    }
    case "fire":
      if (full) for (let k = -1; k <= 1; k++) wallRect(b, f, fr.facing, fr.width / 2 + k * (fr.width * 0.3) - fr.width * 0.12, fr.width / 2 + k * (fr.width * 0.3) + fr.width * 0.12, 0, 3.4, 0.06, C("#d7d9dc"));
      boxFront(b, fr, fr.width * 0.3, -3, 3, 3, 0, h + 5, C("#9c2f26")); // hose tower
      band(WHITE, h - 0.9, h - 0.3);
      return;
    case "bank":
      if (full) {
        for (let k = -2; k <= 2; k++) boxFront(b, fr, k * fr.width * 0.17, 1.4, 0.55, 0.55, 0, h - 0.2, C("#e6e0d0"));
        boxFront(b, fr, 0, 1.4, fr.width * 0.8, 1.8, h - 0.2, h + 0.3, C("#e6e0d0"));
      }
      band(C("#2f5a3a"), h - 1.3, h - 0.4);
      return;
    case "fuel": {
      // A canopy on pillars out the front, with four pumps under it.
      boxFront(b, fr, 0, 7, fr.width * 0.9, 9, 5.2, 5.6, C("#e0b32e"));
      if (full) {
        for (const u of [-fr.width * 0.4, fr.width * 0.4]) for (const o of [3, 11]) boxFront(b, fr, u, o, 0.4, 0.4, 0, 5.2, STEEL);
        for (const u of [-fr.width * 0.2, fr.width * 0.2]) for (const o of [5, 9]) boxFront(b, fr, u, o, 0.5, 0.9, 0, 1.5, RED);
      }
      return;
    }
    case "hotel":
      boxFront(b, fr, 0, 1.6, Math.min(8, fr.width * 0.5), 3.2, 3.2, 3.4, TEAL); // awning
      boxFront(b, fr, 0, -0.5, Math.min(9, fr.width * 0.6), 0.5, h, h + 2.6, TEAL); // rooftop sign
      return;
    case "airport":
      // Control tower beside the terminal.
      boxFront(b, fr, fr.width * 0.36, -2, 3.2, 3.2, 0, 21, WHITE);
      boxFront(b, fr, fr.width * 0.36, -2, 6, 6, 21, 24, GLASS);
      boxFront(b, fr, fr.width * 0.36, -2, 6.6, 6.6, 24, 24.4, C("#4a5058"));
      b.box(f.minX - 1, h, f.minZ - 1, f.maxX + 1, h + 0.3, f.maxZ + 1, C("#6a7077"), 1); // overhanging roof
      return;
    case "market":
      return;
  }
}

/** The big plain hangar: grey metal with one huge door. */
export function addHangar(b: MeshBuilder, lot: Lot, full: boolean): void {
  const fr = frame(lot);
  if (full) wallRect(b, fr.f, fr.facing === 0 ? 2 : fr.facing, fr.width * 0.12, fr.width * 0.88, 0, fr.height - 1, 0.06, DARK);
}

/** A small propeller plane, nose to the +x end (yaw 0). */
export function addPlane(b: MeshBuilder, x: number, z: number, variant: number, full: boolean): void {
  const body = [C("#f1f3f5"), C("#dfe7f2"), C("#f3ede0")][variant % 3]!;
  const trim = [C("#c8322d"), C("#2f5fa8"), C("#1f8a86")][variant % 3]!;
  b.box(x - 4.5, 1.0, z - 0.9, x + 4.5, 2.7, z + 0.9, body, 0.9); // fuselage
  b.box(x - 1.2, 1.9, z - 5.2, x + 1.2, 2.1, z + 5.2, body, 1); // wing
  b.box(x - 4.5, 1.0, z - 0.92, x + 4.5, 1.4, z + 0.92, trim, 1); // belly stripe
  b.box(x - 4.7, 2.7, z - 0.1, x - 3.3, 4.4, z + 0.1, trim, 1); // tail fin
  b.box(x - 4.6, 2.2, z - 1.9, x - 3.6, 2.35, z + 1.9, body, 1); // tailplane
  if (!full) return;
  b.box(x + 4.5, 1.4, z - 0.12, x + 4.62, 2.3, z + 0.12, DARK, 1); // propeller disc edge-on
  b.box(x + 4.4, 1.7, z - 1.2, x + 4.5, 1.9, z + 1.2, DARK, 1);
  b.box(x + 0.5, 2.7, z - 0.7, x + 2.2, 3.1, z + 0.7, GLASS, 1); // cockpit
  for (const sz of [-0.9, 0.9]) b.box(x + 1.4, 0, z + sz - 0.1, x + 1.8, 1.0, z + sz + 0.1, STEEL, 1);
  b.box(x + 3.6, 0, z - 0.1, x + 4.0, 1.0, z + 0.1, STEEL, 1);
}
V(0, 0, 0);
