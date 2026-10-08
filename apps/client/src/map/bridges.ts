import * as THREE from "three";
import { findBridges, type BridgeSpan, type District } from "@thelife/game-core";
import { MeshBuilder } from "./meshBuilder";

// Bridges: wherever a street crosses the lagoon the street surface is drawn by the ground shader, and this adds what a bridge is made
// of: a concrete deck with side girders below it, a parapet and rail on each side, piers standing in the water, and lamp posts. One
// merged mesh, built once; there are only a dozen spans on the island.

const C = (hex: string) => new THREE.Color(hex);
const CONCRETE = C("#a8a49b");
const CONCRETE_DARK = C("#7f7c76");
const RAIL = C("#c9ccd1");
const STEEL = C("#4a525c");
const LAMP = C("#e9e2c4");
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

interface Frame { ax: number; az: number; bx: number; bz: number; nx: number; nz: number; len: number }

/** A prism along the segment a-b, from lateral offset o0 to o1 (to the left of the way) and from y0 to y1. */
function beam(b: MeshBuilder, f: Frame, o0: number, o1: number, y0: number, y1: number, color: THREE.Color, t0 = 0, t1 = 1) {
  const px = (t: number, o: number) => f.ax + (f.bx - f.ax) * t + f.nx * o;
  const pz = (t: number, o: number) => f.az + (f.bz - f.az) * t + f.nz * o;
  const low = color.clone().multiplyScalar(0.8);
  const c = (t: number, o: number, y: number) => V(px(t, o), y, pz(t, o));
  const q = (a: THREE.Vector3, b2: THREE.Vector3, c2: THREE.Vector3, d: THREE.Vector3, out: THREE.Vector3Like) => b.quad(a, b2, c2, d, out, color, low, color);
  const left = { x: f.nx, y: 0, z: f.nz }, right = { x: -f.nx, y: 0, z: -f.nz };
  q(c(t0, o1, y0), c(t1, o1, y0), c(t1, o1, y1), c(t0, o1, y1), left);
  q(c(t0, o0, y0), c(t1, o0, y0), c(t1, o0, y1), c(t0, o0, y1), right);
  q(c(t0, o0, y0), c(t0, o1, y0), c(t0, o1, y1), c(t0, o0, y1), { x: -(f.bx - f.ax), y: 0, z: -(f.bz - f.az) });
  q(c(t1, o0, y0), c(t1, o1, y0), c(t1, o1, y1), c(t1, o0, y1), { x: f.bx - f.ax, y: 0, z: f.bz - f.az });
  const lit = color.clone().multiplyScalar(1.07);
  b.quad(c(t0, o0, y1), c(t1, o0, y1), c(t1, o1, y1), c(t0, o1, y1), { x: 0, y: 1, z: 0 }, lit);
  b.quad(c(t0, o0, y0), c(t1, o0, y0), c(t1, o1, y0), c(t0, o1, y0), { x: 0, y: -1, z: 0 }, low);
}

function addSpan(b: MeshBuilder, s: BridgeSpan) {
  const half = s.width / 2;
  const big = s.width >= 14;
  let run = 0; // metres along the bridge so far, for placing piers and lamps at even spacing
  let nextPier = 14, nextLamp = 10, lampSide = 1;
  for (let i = 0; i + 1 < s.pts.length; i++) {
    const a = s.pts[i]!, c = s.pts[i + 1]!;
    const dx = c.x - a.x, dz = c.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.1) continue;
    // To the left of the way: (dz, -dx) normalised. The 2 cm of lift on the rails keeps them clear of the ground shader's street.
    const f: Frame = { ax: a.x, az: a.z, bx: c.x, bz: c.z, nx: dz / len, nz: -dx / len, len };
    // The underside of the deck and its two side girders. The street itself is the ground shader's, at y = -0.02.
    beam(b, f, -half - 0.3, half + 0.3, -1.5, -0.08, CONCRETE_DARK);
    beam(b, f, half - 0.05, half + 0.45, -1.5, 0.12, CONCRETE);
    beam(b, f, -half - 0.45, -half + 0.05, -1.5, 0.12, CONCRETE);
    // Parapet and rail on both sides.
    for (const side of [-1, 1]) {
      const o = side * (half + 0.18);
      beam(b, f, o - 0.18, o + 0.18, 0.12, 0.85, CONCRETE);
      beam(b, f, o - 0.05, o + 0.05, 0.85, 1.05, RAIL);
    }
    if (big) beam(b, f, -0.45, 0.45, -0.02, 0.8, CONCRETE); // a concrete median on the wide ones
    // Piers where they fall within this segment.
    while (run + len >= nextPier) {
      const t = (nextPier - run) / len;
      const cx = a.x + dx * t, cz = a.z + dz * t;
      const pf: Frame = { ax: cx - (dx / len) * (big ? 1.1 : 0.7), az: cz - (dz / len) * (big ? 1.1 : 0.7), bx: cx + (dx / len) * (big ? 1.1 : 0.7), bz: cz + (dz / len) * (big ? 1.1 : 0.7), nx: f.nx, nz: f.nz, len: big ? 2.2 : 1.4 };
      // A cap beam under the deck across the full width, and two columns standing in the water down to -6 m.
      beam(b, pf, -half - 0.6, half + 0.6, -2.4, -1.5, CONCRETE_DARK);
      for (const col of [-half * 0.55, half * 0.55]) beam(b, pf, col - (big ? 0.9 : 0.6), col + (big ? 0.9 : 0.6), -6, -2.4, CONCRETE_DARK);
      nextPier += big ? 34 : 26;
    }
    // Lamp posts, alternating sides.
    while (run + len >= nextLamp) {
      const t = (nextLamp - run) / len;
      const x = a.x + dx * t + f.nx * lampSide * (half + 0.18), z = a.z + dz * t + f.nz * lampSide * (half + 0.18);
      b.box(x - 0.07, 0.1, z - 0.07, x + 0.07, 6.2, z + 0.07, STEEL);
      const ax = -f.nx * lampSide * 0.9, az = -f.nz * lampSide * 0.9; // the arm leans over the road
      b.box(Math.min(x, x + ax) - 0.06, 6.1, Math.min(z, z + az) - 0.06, Math.max(x, x + ax) + 0.06, 6.25, Math.max(z, z + az) + 0.06, STEEL);
      b.box(x + ax - 0.35, 6.0, z + az - 0.18, x + ax + 0.35, 6.12, z + az + 0.18, LAMP, 1);
      lampSide = -lampSide;
      nextLamp += 22;
    }
    run += len;
  }
}

export interface Bridges {
  group: THREE.Group;
  setVisible(v: boolean): void;
  dispose(): void;
  count: number;
}

export function buildBridges(d: District): Bridges {
  const group = new THREE.Group();
  const spans = d.terrain ? findBridges(d.terrain) : [];
  const b = new MeshBuilder();
  for (const s of spans) addSpan(b, s);
  const geo = b.build();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  if (geo) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return {
    group,
    count: spans.length,
    setVisible(v) {
      group.visible = v;
    },
    dispose() {
      group.removeFromParent();
      geo?.dispose();
      mat.dispose();
    },
  };
}
