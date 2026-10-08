import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BodyRest } from "./bodyRest";

/**
 * Real shoes: each is built around the wearer's own foot, measured from the body mesh, as separate pieces (a sole, an upper that closes
 * over the toes and opens at the ankle, a boot shaft, laces, straps) with their own colours, and rides rigidly on the foot bone. Nothing
 * is cut from the skin, so a shoe has the thickness and the shape of a shoe, not of a painted foot.
 */
export type ShoeId = "p_sneakers" | "p_slippers" | "p_sandals" | "p_boots" | "p_formal";

interface ShoeStyle {
  /** Sole thickness in metres, and how much deeper the heel is. */
  sole: number;
  heel: number;
  soleColour: string;
  /** How far the upper stands off the foot. */
  ease: number;
  /** Height of the collar above the ground, for the stations where the foot is taller than this (the ankle). */
  collar: number;
  /** The shaft of a boot, up to this height. */
  shaft?: number;
  laces?: boolean;
  /** Sandals: no upper, only straps. */
  straps?: boolean;
  /** Slip-ons: the upper only covers the toes, from this fraction of the foot's length (0 heel, 1 toe) forward; behind it the walls are low. */
  openFrom?: number;
  lowWall?: number;
  roughness: number;
  /** Darkens the toe cap. */
  toeCap?: number;
  /** Keeps its own colour (formal shoes are black or brown whatever colour is picked) */
  fixed?: string;
}

const ANKLE = 0.075;
const STYLES: Record<ShoeId, ShoeStyle> = {
  p_sneakers: { sole: 0.024, heel: 0.01, soleColour: "#f1efe9", ease: 0.007, collar: ANKLE + 0.03, laces: true, roughness: 0.62, toeCap: 0.9 },
  p_formal: { sole: 0.015, heel: 0.014, soleColour: "#1b1512", ease: 0.005, collar: ANKLE - 0.005, laces: true, roughness: 0.32, toeCap: 0.88 },
  p_boots: { sole: 0.026, heel: 0.014, soleColour: "#2a2420", ease: 0.008, collar: ANKLE + 0.02, shaft: 0.21, roughness: 0.7, toeCap: 0.85 },
  p_slippers: { sole: 0.013, heel: 0.004, soleColour: "#ece6da", ease: 0.008, collar: 0.05, openFrom: 0.5, lowWall: 0.03, roughness: 0.85 },
  p_sandals: { sole: 0.014, heel: 0.006, soleColour: "#3a2b21", ease: 0.006, collar: ANKLE, straps: true, roughness: 0.6 },
};

export const SHOE_COVERS: Record<ShoeId, string[]> = {
  p_sneakers: ["foot", "ball"],
  // only shoes that reach above the ankle may hide the skin of the foot; a low shoe would leave a hole above its collar
  p_formal: [],
  p_boots: ["foot", "ball"],
  p_slippers: [],
  p_sandals: [],
};

export const isShoe = (id: string): id is ShoeId => id in STYLES;

type V3 = THREE.Vector3;
const K = 40; // samples round a cross-section

/** A star-shaped outline round a centre: for each of K directions, how far the outermost point in that direction is. */
function outline(points: { a: number; b: number }[], ca: number, cb: number): number[] {
  const r = new Array<number>(K).fill(0);
  for (const p of points) {
    const ang = Math.atan2(p.b - cb, p.a - ca);
    const k = (Math.round(((ang + Math.PI) / (Math.PI * 2)) * K) % K + K) % K;
    r[k] = Math.max(r[k]!, Math.hypot(p.a - ca, p.b - cb));
  }
  // empty directions take their neighbours' value (and a smoothing pass so the shell is not spiky)
  for (let pass = 0; pass < 3; pass++) {
    for (let k = 0; k < K; k++) {
      if (r[k]! > 0) continue;
      const prev = r[(k + K - 1) % K]!, next = r[(k + 1) % K]!;
      r[k] = prev && next ? (prev + next) / 2 : prev || next;
    }
  }
  const out = r.slice();
  for (let k = 0; k < K; k++) out[k] = Math.max(r[k]!, (r[(k + K - 1) % K]! + r[k]! * 2 + r[(k + 1) % K]!) / 4);
  return out;
}

interface Measured {
  /** Foot points. */
  pts: V3[];
  minZ: number;
  maxZ: number;
  ground: number;
  /** Lower leg points (for boots). */
  leg: V3[];
}

function measure(rest: BodyRest, side: "l" | "r"): Measured | null {
  const pos = rest.geometry.getAttribute("position");
  const foot = new Set([rest.boneIndex.get(`foot_${side}`), rest.boneIndex.get(`ball_${side}`)].filter((x): x is number => x !== undefined));
  const calf = rest.boneIndex.get(`calf_${side}`);
  const pts: V3[] = [];
  const leg: V3[] = [];
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const b = rest.vertexBone[i]!;
    if (foot.has(b)) pts.push(p.clone());
    else if (b === calf && p.y < 0.4) leg.push(p.clone());
  }
  if (pts.length < 20) return null;
  let minZ = Infinity, maxZ = -Infinity, ground = Infinity;
  for (const q of pts) {
    minZ = Math.min(minZ, q.z);
    maxZ = Math.max(maxZ, q.z);
    ground = Math.min(ground, q.y);
  }
  return { pts, minZ, maxZ, ground, leg };
}

function coloured(g: THREE.BufferGeometry, colour: string, shade = 1): THREE.BufferGeometry {
  const c = new THREE.Color(colour);
  const n = g.getAttribute("position").count;
  const arr = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) arr.set([c.r * shade, c.g * shade, c.b * shade, 1], i * 4);
  g.setAttribute("color", new THREE.BufferAttribute(arr, 4));
  return g;
}

function finish(position: number[], index: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** The pieces of one shoe, in the mesh's rest space. */
function buildOne(rest: BodyRest, side: "l" | "r", style: ShoeStyle, upperColour: string): THREE.BufferGeometry | null {
  const m = measure(rest, side);
  if (!m) return null;
  const { pts, minZ, maxZ, ground } = m;
  const L = maxZ - minZ;
  const t = style.sole;
  const parts: THREE.BufferGeometry[] = [];
  const N = 22;
  const stations: { z: number; cx: number; cy: number; r: number[]; top: number; left: number; right: number }[] = [];
  for (let i = 0; i <= N; i++) {
    // denser at the heel and the toe, where the foot changes fastest
    const u = 0.5 - 0.5 * Math.cos((i / N) * Math.PI);
    const z = minZ + L * (0.012 + u * 0.976);
    const d = Math.max(L / N, 0.012);
    const near = pts.filter((q) => Math.abs(q.z - z) < d);
    if (near.length < 4) continue;
    let x0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of near) {
      x0 = Math.min(x0, q.x);
      x1 = Math.max(x1, q.x);
      y1 = Math.max(y1, q.y);
    }
    const cx = (x0 + x1) / 2, cy = (ground + y1) / 2;
    stations.push({ z, cx, cy, r: outline(near.map((q) => ({ a: q.x, b: q.y })), cx, cy), top: y1, left: x0, right: x1 });
  }
  if (stations.length < 6) return null;

  // ---------------------------------------------------------------- sole
  {
    const pos: number[] = [];
    const idx: number[] = [];
    const over = style.ease * 0.7 + 0.002;
    const n = stations.length;
    // outline chain: left side heel to toe, then right side toe to heel
    const chain: { x: number; z: number; thick: number }[] = [];
    const heelDeep = (z: number) => style.heel * Math.max(0, 1 - (z - minZ) / (L * 0.38));
    for (const s of stations) chain.push({ x: s.left - over, z: s.z, thick: t + heelDeep(s.z) });
    chain.push({ x: stations[n - 1]!.cx, z: stations[n - 1]!.z + over * 1.6, thick: t });
    for (let i = n - 1; i >= 0; i--) chain.push({ x: stations[i]!.right + over, z: stations[i]!.z, thick: t + heelDeep(stations[i]!.z) });
    chain.push({ x: stations[0]!.cx, z: stations[0]!.z - over * 1.6, thick: t + heelDeep(stations[0]!.z) });
    // a centre point per outline vertex, for the top and bottom faces (fan from the middle of the foot)
    const mid = { x: stations[Math.floor(n / 2)]!.cx, z: (minZ + maxZ) / 2 };
    const c = chain.length;
    for (const q of chain) pos.push(q.x, ground, q.z); // bottom ring 0..c-1
    for (const q of chain) pos.push(q.x, ground + q.thick, q.z); // top ring c..2c-1
    pos.push(mid.x, ground, mid.z, mid.x, ground + t, mid.z); // 2c bottom centre, 2c+1 top centre
    for (let i = 0; i < c; i++) {
      const j = (i + 1) % c;
      idx.push(i, j, c + j, i, c + j, c + i); // wall
      idx.push(2 * c, j, i); // bottom
      idx.push(2 * c + 1, c + i, c + j); // top
    }
    const g = finish(pos, idx);
    parts.push(coloured(g, style.soleColour));
  }

  // ---------------------------------------------------------------- upper
  if (!style.straps) {
    const pos: number[] = [];
    const idx: number[] = [];
    const rows: { open: boolean[]; first: number }[] = [];
    stations.forEach((s, si) => {
      const frac = (s.z - minZ) / L;
      const slipOpen = style.openFrom !== undefined && frac < style.openFrom;
      const clip = ground + (slipOpen ? style.lowWall! : style.collar);
      const first = pos.length / 3;
      const open: boolean[] = [];
      for (let k = 0; k < K; k++) {
        const ang = -Math.PI + (k / K) * Math.PI * 2;
        // the shell hugs the foot, thicker at the toes (a toe box has volume)
        const room = style.ease + (frac > 0.72 ? (frac - 0.72) * 0.014 : 0);
        const rr = s.r[k]! + room;
        let x = s.cx + Math.cos(ang) * rr;
        let y = s.cy + Math.sin(ang) * rr;
        y = Math.max(y, ground + t * 0.9);
        const above = y > clip;
        if (above) y = clip;
        open.push(above);
        pos.push(x, y, s.z);
        void x;
      }
      rows.push({ open, first });
      void si;
    });
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i]!, b = rows[i + 1]!;
      for (let k = 0; k < K; k++) {
        const k2 = (k + 1) % K;
        // a quad whose four corners are all at the collar height is the lid of the opening, which stays open
        if (a.open[k] && a.open[k2] && b.open[k] && b.open[k2]) continue;
        idx.push(a.first + k, b.first + k, b.first + k2, a.first + k, b.first + k2, a.first + k2);
      }
    }
    // close the toe: a fan over the last ring, and the heel: a fan over the first
    const addCap = (row: { first: number; open: boolean[] }, s: (typeof stations)[number], flip: boolean, push: number) => {
      const c = pos.length / 3;
      pos.push(s.cx, s.cy, s.z + push);
      for (let k = 0; k < K; k++) {
        const k2 = (k + 1) % K;
        if (row.open[k] && row.open[k2]) continue;
        if (flip) idx.push(c, row.first + k2, row.first + k);
        else idx.push(c, row.first + k, row.first + k2);
      }
    };
    addCap(rows[rows.length - 1]!, stations[stations.length - 1]!, false, 0.004);
    addCap(rows[0]!, stations[0]!, true, -0.004);
    const g = finish(pos, idx);
    // the toe cap is a shade darker; the lower edge too (a cheap shadow where the upper meets the sole)
    const c = new THREE.Color(style.fixed ?? upperColour);
    const n = g.getAttribute("position").count;
    const col = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const z = g.getAttribute("position").getZ(i), y = g.getAttribute("position").getY(i);
      let shade = 1;
      if (style.toeCap && (z - minZ) / L > 0.8) shade *= style.toeCap;
      shade *= 0.86 + 0.14 * Math.min(1, (y - ground) / 0.05);
      col.set([c.r * shade, c.g * shade, c.b * shade, 1], i * 4);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 4));
    parts.push(g);

    // ------------------------------------------------------------- laces: a row of little bars across the top of the foot
    if (style.laces) {
      const pos2: number[] = [];
      const idx2: number[] = [];
      for (let q = 0; q < 5; q++) {
        const frac = 0.5 + q * 0.075;
        const s = stations.reduce((best, c2) => (Math.abs((c2.z - minZ) / L - frac) < Math.abs((best.z - minZ) / L - frac) ? c2 : best));
        if (s.top + style.ease > ground + style.collar) continue; // not on the open ankle
        const base = pos2.length / 3;
        const hw = Math.min(0.025, (s.right - s.left) * 0.3);
        const yTop = s.top + style.ease + 0.0045;
        const dz = 0.0065;
        const corners = [
          [-hw, yTop - 0.0035, s.z - dz], [hw, yTop - 0.0035, s.z - dz], [hw, yTop + 0.0015, s.z - dz], [-hw, yTop + 0.0015, s.z - dz],
          [-hw, yTop - 0.0035, s.z + dz], [hw, yTop - 0.0035, s.z + dz], [hw, yTop + 0.0015, s.z + dz], [-hw, yTop + 0.0015, s.z + dz],
        ];
        for (const [x, y, z] of corners) pos2.push(s.cx + x!, y!, z!);
        for (const f of [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]]) {
          idx2.push(base + f[0]!, base + f[1]!, base + f[2]!, base + f[0]!, base + f[2]!, base + f[3]!);
        }
      }
      if (idx2.length) parts.push(coloured(finish(pos2, idx2), "#f1f1ec"));
    }

    // ------------------------------------------------------------- boot shaft: a tube up the leg
    if (style.shaft && m.leg.length > 20) {
      const pos3: number[] = [];
      const idx3: number[] = [];
      const bottom = ground + style.collar - 0.01;
      const rowsS: number[] = [];
      const steps = 10;
      for (let j = 0; j <= steps; j++) {
        const y = bottom + (style.shaft - bottom) * (j / steps);
        const slice = [...m.leg, ...pts].filter((q) => Math.abs(q.y - y) < 0.012);
        if (slice.length < 4) continue;
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const q of slice) {
          x0 = Math.min(x0, q.x);
          x1 = Math.max(x1, q.x);
          z0 = Math.min(z0, q.z);
          z1 = Math.max(z1, q.z);
        }
        // above the ankle the foot is no longer in the slice; keep to the leg
        const legOnly = j > 0 ? m.leg.filter((q) => Math.abs(q.y - y) < 0.012) : slice;
        const use = legOnly.length >= 4 ? legOnly : slice;
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
        for (const q of use) {
          a0 = Math.min(a0, q.x);
          a1 = Math.max(a1, q.x);
          b0 = Math.min(b0, q.z);
          b1 = Math.max(b1, q.z);
        }
        void x0; void x1; void z0; void z1;
        const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
        const r = outline(use.map((q) => ({ a: q.x, b: q.z })), ca, cb);
        rowsS.push(pos3.length / 3);
        for (let k = 0; k < K; k++) {
          const ang = -Math.PI + (k / K) * Math.PI * 2;
          pos3.push(ca + Math.cos(ang) * (r[k]! + style.ease + 0.004), y, cb + Math.sin(ang) * (r[k]! + style.ease + 0.004));
        }
      }
      for (let i = 0; i < rowsS.length - 1; i++) {
        for (let k = 0; k < K; k++) {
          const k2 = (k + 1) % K;
          const a = rowsS[i]!, b = rowsS[i + 1]!;
          idx3.push(a + k, b + k, b + k2, a + k, b + k2, a + k2);
        }
      }
      if (idx3.length) {
        const g3 = finish(pos3, idx3);
        parts.push(coloured(g3, style.fixed ?? upperColour, 0.95));
      }
    }
  } else {
    // ---------------------------------------------------------------- sandal straps: bands over the foot at three places and round the heel
    const pos: number[] = [];
    const idx: number[] = [];
    const band = (frac: number, width: number) => {
      const s = stations.reduce((best, c2) => (Math.abs((c2.z - minZ) / L - frac) < Math.abs((best.z - minZ) / L - frac) ? c2 : best));
      const first = pos.length / 3;
      const arcs: number[] = [];
      for (let k = 0; k < K; k++) {
        const ang = -Math.PI + (k / K) * Math.PI * 2;
        if (Math.sin(ang) < -0.15) continue; // only over the top of the foot, not under it
        arcs.push(k);
      }
      for (const k of arcs) {
        const ang = -Math.PI + (k / K) * Math.PI * 2;
        const rr = s.r[k]! + style.ease;
        for (const dz of [-width / 2, width / 2]) pos.push(s.cx + Math.cos(ang) * rr, Math.max(ground + t, s.cy + Math.sin(ang) * rr), s.z + dz);
      }
      for (let i = 0; i < arcs.length - 1; i++) {
        const a = first + i * 2, b = first + (i + 1) * 2;
        idx.push(a, b, b + 1, a, b + 1, a + 1);
      }
    };
    band(0.32, 0.022);
    band(0.55, 0.02);
    band(0.82, 0.016);
    band(0.06, 0.02);
    if (idx.length) parts.push(coloured(finish(pos, idx), upperColour));
  }

  // every piece the same attributes, then one geometry
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
  parts.forEach((p) => p.dispose());
  return merged;
}

export interface ShoeResult {
  /** One geometry per foot, in the bone's local space. */
  feet: { bone: string; geometry: THREE.BufferGeometry }[];
  roughness: number;
  covers: string[];
}

export function buildShoes(rest: BodyRest, id: ShoeId, upperColour: string): ShoeResult | null {
  const style = STYLES[id];
  const feet: ShoeResult["feet"] = [];
  for (const side of ["l", "r"] as const) {
    const g = buildOne(rest, side, style, upperColour);
    const bone = `foot_${side}`;
    const toBone = rest.toBoneSpace(bone);
    if (!g || !toBone) return null;
    g.applyMatrix4(toBone);
    feet.push({ bone, geometry: g });
  }
  const covers = SHOE_COVERS[id].flatMap((n) => [`${n}_l`, `${n}_r`, ...(n === "ball" ? ["ball_leaf_l", "ball_leaf_r"] : [])]);
  return { feet, roughness: style.roughness, covers };
}
