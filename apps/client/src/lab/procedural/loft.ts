import * as THREE from "three";
import { jointPos, type BodyRest } from "./bodyRest";

/**
 * Loose and long clothes (skirts, gowns, kaftans, agbada) are not the body's own surface pushed outward: they hang. This module measures how
 * far the body reaches from its own axis at every height and angle (the silhouette), and lofts a closed sleeve of cloth round it that can
 * hang from the shoulders or the hips, flare, fold and follow the body when it moves.
 */

export interface Silhouette {
  cx: number;
  cz: number;
  y0: number;
  y1: number;
  nu: number;
  ny: number;
  r: Float32Array;
  /** The body's outermost reach from the axis at azimuth u (0 = straight ahead, positive towards the character's left) and height y. */
  at(u: number, y: number): number;
}

const ARM = /^(upperarm|lowerarm|hand|index|middle|ring|pinky|thumb)/;

/** Measures the torso and legs (not the arms, not the head) between two heights. */
export function silhouette(rest: BodyRest, y0: number, y1: number, nu = 72, step = 0.012): Silhouette {
  const pelvis = jointPos(rest, "pelvis");
  const cx = 0, cz = pelvis.z;
  const ny = Math.max(2, Math.ceil((y1 - y0) / step));
  const r = new Float32Array(nu * (ny + 1));
  const pos = rest.geometry.getAttribute("position");
  const bad = new Set<number>();
  for (const [name, index] of rest.boneIndex) if (ARM.test(name) || name === "Head" || name === "neck_01" || name.startsWith("eye")) bad.add(index);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < y0 || y > y1 || bad.has(rest.vertexBone[i]!)) continue;
    const x = pos.getX(i) - cx, z = pos.getZ(i) - cz;
    const u = (Math.atan2(x, z) + Math.PI * 2) % (Math.PI * 2);
    const iu = Math.min(nu - 1, Math.floor((u / (Math.PI * 2)) * nu));
    const iy = Math.min(ny, Math.round(((y - y0) / (y1 - y0)) * ny));
    const k = iy * nu + iu;
    const d = Math.hypot(x, z);
    if (d > r[k]!) r[k] = d;
  }
  // fill the cells no vertex fell in from their neighbours
  for (let pass = 0; pass < 6; pass++) {
    const next = r.slice();
    for (let iy = 0; iy <= ny; iy++) {
      for (let iu = 0; iu < nu; iu++) {
        const k = iy * nu + iu;
        if (r[k]! > 0) continue;
        let sum = 0, n = 0;
        for (const [du, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
          const yy = iy + dy;
          if (yy < 0 || yy > ny) continue;
          const v = r[yy * nu + ((iu + du + nu) % nu)]!;
          if (v > 0) {
            sum += v;
            n++;
          }
        }
        if (n) next[k] = sum / n;
      }
    }
    r.set(next);
  }
  const at = (u: number, y: number) => {
    const fu = ((((u % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * nu;
    const fy = Math.max(0, Math.min(ny, ((y - y0) / (y1 - y0)) * ny));
    const i0 = Math.floor(fu) % nu, i1 = (i0 + 1) % nu, j0 = Math.min(ny - 1, Math.floor(fy)), j1 = j0 + 1;
    const tu = fu - Math.floor(fu), tv = fy - j0;
    const a = r[j0 * nu + i0]! * (1 - tu) + r[j0 * nu + i1]! * tu;
    const b = r[j1 * nu + i0]! * (1 - tu) + r[j1 * nu + i1]! * tu;
    return a * (1 - tv) + b * tv;
  };
  return { cx, cz, y0, y1, nu, ny, r, at };
}

export interface LoftOptions {
  /** Top and bottom of the sleeve of cloth (metres). */
  yTop: number;
  yBottom: number;
  rows?: number;
  /** Distance outside the body's reach (the cloth's thickness plus ease), and how close it starts at the top (to meet the part that hugs the body). */
  offset: number;
  offsetTop?: number;
  /** How far down (0 to 1 of the length) the cloth takes to grow from the top offset to its full ease. */
  easeLen?: number;
  /** Extra reach by how far down the cloth is, from 0 at the top to 1 at the hem. Metres. */
  flare(t: number): number;
  /** The cloth hangs from where it starts: it never comes in closer than the widest point above it (so a kaftan skips the waist). */
  hang?: boolean;
  /** Folds: depth in metres and how many round the body. */
  fold?: number;
  folds?: number;
  /** How much of the legs' movement the cloth follows (0 to 1). */
  follow?: number;
  /** Shapes the cloth in front and behind differently (a slit, a train): extra reach by azimuth (0 = front) and t. */
  extra?(u: number, t: number): number;
  uvScale?: number;
}

/** The raw grid of a lofted sleeve: `nu` particles round, `rows + 1` down; rows run from the top (row 0) to the hem. */
export interface LoftGrid {
  nu: number;
  rows: number;
  position: Float32Array;
  uv: Float32Array;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  sway: Float32Array;
  color: Float32Array;
  indices: Uint32Array;
}

/** A closed sleeve of cloth lofted round the body, ready to skin (position, normal, uv, skinIndex, skinWeight; not indexed). */
export function loft(rest: BodyRest, sil: Silhouette, o: LoftOptions): THREE.BufferGeometry {
  return loftGeometry(loftGrid(rest, sil, o), false);
}

/** The geometry of a loft grid: indexed (to simulate) or not (to skin). */
export function loftGeometry(grid: LoftGrid, indexed: boolean): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(grid.position.slice(), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(grid.uv, 2));
  g.setAttribute("skinIndex", new THREE.BufferAttribute(grid.skinIndex, 4));
  g.setAttribute("skinWeight", new THREE.BufferAttribute(grid.skinWeight, 4));
  g.setAttribute("sway", new THREE.BufferAttribute(grid.sway, 1));
  g.setAttribute("color", new THREE.BufferAttribute(grid.color, 3));
  g.setIndex(new THREE.BufferAttribute(grid.indices, 1));
  g.computeVertexNormals();
  return indexed ? g : g.toNonIndexed();
}

export function loftGrid(rest: BodyRest, sil: Silhouette, o: LoftOptions): LoftGrid {
  const nu = sil.nu;
  const rows = o.rows ?? 22;
  const pelvisY = jointPos(rest, "pelvis").y;
  const kneeY = jointPos(rest, "calf_l").y;
  const heights = (["pelvis", "spine_01", "spine_02", "spine_03"] as const).map((n) => [n, jointPos(rest, n).y] as const);
  const idx = (name: string) => rest.boneIndex.get(name) ?? 0;

  // reach by angle and row, with hanging applied top to bottom, then softened round the body
  const reach: number[][] = [];
  const prev = new Float32Array(nu);
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    const y = o.yTop + (o.yBottom - o.yTop) * t;
    const row: number[] = [];
    for (let i = 0; i < nu; i++) {
      const u = (i / nu) * Math.PI * 2;
      let base = sil.at(u, Math.max(sil.y0, Math.min(sil.y1, y)));
      if (o.hang) {
        base = Math.max(base, prev[i]! * 0.985);
        prev[i] = base;
      }
      row.push(base);
    }
    // cloth does not follow every hollow of the body: round it off (several soft passes), but never let it cut into what it covers
    let soft = row;
    for (let pass = 0; pass < 6; pass++) soft = soft.map((v, i) => (soft[(i + nu - 1) % nu]! + v * 2 + soft[(i + 1) % nu]!) / 4);
    reach.push(soft.map((v, i) => Math.max(v, row[i]! * 0.985)));
  }

  // and from row to row: a skirt does not follow the ripple of the legs under it
  for (let pass = 0; pass < 4; pass++) {
    const prevRows = reach.map((row) => row.slice());
    for (let j = 1; j < rows; j++) for (let i = 0; i < nu; i++) reach[j]![i] = Math.max(reach[j]![i]! * 0.99, (prevRows[j - 1]![i]! + prevRows[j]![i]! * 2 + prevRows[j + 1]![i]!) / 4);
  }

  const position: number[] = [], uv: number[] = [], sIdx: number[] = [], sW: number[] = [];
  const indices: number[] = [];
  const follow = o.follow ?? 0.7;
  const uvs = o.uvScale ?? 3.2;
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    const y = o.yTop + (o.yBottom - o.yTop) * t;
    for (let i = 0; i < nu; i++) {
      const u = (i / nu) * Math.PI * 2;
      const fold = (o.fold ?? 0) * Math.sin(u * (o.folds ?? 9) + t * 4) * Math.min(1, t * 2);
      const ease = o.offsetTop === undefined ? 1 : Math.min(1, t / (o.easeLen ?? 0.15));
      const off = o.offsetTop === undefined ? o.offset : o.offsetTop + (o.offset - o.offsetTop) * ease * ease * (3 - 2 * ease);
      const radius = reach[j]![i]! + off + o.flare(t) + (o.extra ? o.extra(u, t) : 0) + fold;
      position.push(sil.cx + Math.sin(u) * radius, y, sil.cz + Math.cos(u) * radius);
      uv.push((i / nu) * 1.3 * uvs * 2, y * uvs);
      // skin weights: the torso follows its spine bones, and below the hips the cloth follows the legs part of the way
      let bones: [number, number][];
      if (y >= pelvisY) {
        let lo = heights[0]!, hi = heights[heights.length - 1]!;
        for (let k = 0; k < heights.length - 1; k++) if (y >= heights[k]![1] && y <= heights[k + 1]![1]) [lo, hi] = [heights[k]!, heights[k + 1]!];
        const f = Math.max(0, Math.min(1, (y - lo[1]) / (hi[1] - lo[1] || 1)));
        bones = y > heights[heights.length - 1]![1] ? [[idx("spine_03"), 1]] : [[idx(lo[0]), 1 - f], [idx(hi[0]), f]];
      } else {
        const drop = Math.max(0, Math.min(1, (pelvisY - y) / (pelvisY - kneeY)));
        const leg = follow * drop;
        const left = 0.5 + 0.5 * Math.max(-1, Math.min(1, Math.sin(u) * 1.6));
        const below = Math.max(0, Math.min(1, (kneeY - y) / 0.25));
        bones = [
          [idx("pelvis"), 1 - leg],
          [idx("thigh_l"), leg * left * (1 - below)],
          [idx("thigh_r"), leg * (1 - left) * (1 - below)],
          [idx("calf_l"), leg * left * below],
          [idx("calf_r"), leg * (1 - left) * below],
        ];
      }
      const kept = bones.filter((b) => b[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = kept.reduce((s, b) => s + b[1], 0) || 1;
      for (let k = 0; k < 4; k++) {
        sIdx.push(kept[k]?.[0] ?? 0);
        sW.push(kept[k] ? kept[k]![1] / sum : 0);
      }
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * nu + i, b = j * nu + ((i + 1) % nu), c = (j + 1) * nu + i, d = (j + 1) * nu + ((i + 1) % nu);
      indices.push(a, c, b, b, c, d);
    }
  }
  // how freely each vertex moves with the person (nothing at the top, most at the hem), and baked shading: a darker stitched hem and folds
  const sway: number[] = [], shade: number[] = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i < nu; i++) {
    const t = j / rows;
    sway.push(Math.pow(t, 1.3));
    const hem = t > 0.96 ? 0.82 : t > 0.92 ? 0.94 : 1;
    const top = t < 0.05 ? 0.9 : 1;
    const fold = 0.93 + 0.07 * Math.sin((i / nu) * Math.PI * 2 * (o.folds ?? 9) + t * 4);
    shade.push(hem * top * fold, hem * top * fold, hem * top * fold);
  }
  return {
    nu,
    rows,
    position: new Float32Array(position),
    uv: new Float32Array(uv),
    skinIndex: new Uint16Array(sIdx),
    skinWeight: new Float32Array(sW),
    sway: new Float32Array(sway),
    color: new Float32Array(shade),
    indices: new Uint32Array(indices),
  };
}
