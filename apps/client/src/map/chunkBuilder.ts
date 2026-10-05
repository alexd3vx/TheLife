import * as THREE from "three";
import type { ChunkData, District, Facing, Lamp, Lot, Rect } from "@thelife/game-core";
import { MeshBuilder } from "./meshBuilder";

/** How much detail a chunk is built with: 0 = full (windows, doors, fences, lamps), 1 = shells and trees, 2 = plain blocks. */
export type Lod = 0 | 1 | 2;

const C = (hex: string) => new THREE.Color(hex);
const WALLS = ["#e9dcc3", "#d9b99b", "#c9d6c1", "#e5c8c0", "#bdd0dc", "#f0e6a8", "#d8d3cb", "#cf9f86"].map(C);
const ROOFS = ["#8a3b2c", "#5d4a3f", "#6b6f73", "#9b5a3a", "#44505c", "#7a2f2f", "#555a44", "#8c7a5a"].map(C);
const SHOP_SIGNS = ["#d94f3d", "#2f7fd1", "#e0a82e", "#2fa56a", "#8a4fd1"].map(C);
const GLASS = C("#31404f");
const DOOR = C("#5a3b26");
const GARAGE = C("#8a8f96");
const FENCE = C("#c4bdb0");
const TRUNK = C("#5b4631");
const LEAF = ["#3f7d3a", "#4f8f3f", "#2f6b3a"].map(C);
const POLE = C("#4a4f55");

export const buildingMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
export const treeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const OUT: Record<Facing, THREE.Vector3Like> = { 0: { x: 0, y: 0, z: -1 }, 1: { x: 1, y: 0, z: 0 }, 2: { x: 0, y: 0, z: 1 }, 3: { x: -1, y: 0, z: 0 } };

/** A rectangle on a wall: `u0..u1` along the wall from its start, `v0..v1` up, pushed `off` metres out from the surface. */
function wallRect(b: MeshBuilder, fp: Rect, side: Facing, u0: number, u1: number, v0: number, v1: number, off: number, color: THREE.Color) {
  let p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3;
  if (side === 0) {
    const z = fp.minZ - off;
    [p0, p1, p2, p3] = [V(fp.minX + u0, v0, z), V(fp.minX + u1, v0, z), V(fp.minX + u1, v1, z), V(fp.minX + u0, v1, z)];
  } else if (side === 2) {
    const z = fp.maxZ + off;
    [p0, p1, p2, p3] = [V(fp.minX + u0, v0, z), V(fp.minX + u1, v0, z), V(fp.minX + u1, v1, z), V(fp.minX + u0, v1, z)];
  } else if (side === 1) {
    const x = fp.maxX + off;
    [p0, p1, p2, p3] = [V(x, v0, fp.minZ + u0), V(x, v0, fp.minZ + u1), V(x, v1, fp.minZ + u1), V(x, v1, fp.minZ + u0)];
  } else {
    const x = fp.minX - off;
    [p0, p1, p2, p3] = [V(x, v0, fp.minZ + u0), V(x, v0, fp.minZ + u1), V(x, v1, fp.minZ + u1), V(x, v1, fp.minZ + u0)];
  }
  b.quad(p0, p1, p2, p3, OUT[side], color);
}

function addRoof(b: MeshBuilder, lot: Lot, top: number, lod: Lod) {
  const f = lot.footprint;
  const roof = ROOFS[lot.colour % ROOFS.length]!;
  if (lot.roof === "flat" || lod === 2) {
    b.box(f.minX - 0.15, top, f.minZ - 0.15, f.maxX + 0.15, top + 0.25, f.maxZ + 0.15, lod === 2 ? WALLS[lot.colour % WALLS.length]!.clone().multiplyScalar(0.9) : roof, 1);
    return;
  }
  // Gable roof along the longer side.
  const o = 0.45;
  const alongX = f.maxX - f.minX >= f.maxZ - f.minZ;
  const rise = Math.min(2.6, (alongX ? f.maxZ - f.minZ : f.maxX - f.minX) * 0.32);
  const dark = roof.clone().multiplyScalar(0.8);
  if (alongX) {
    const x0 = f.minX - o, x1 = f.maxX + o, z0 = f.minZ - o, z1 = f.maxZ + o, zm = (f.minZ + f.maxZ) / 2;
    b.quad(V(x0, top, z0), V(x1, top, z0), V(x1, top + rise, zm), V(x0, top + rise, zm), { x: 0, y: 0.6, z: -0.8 }, roof, dark, roof);
    b.quad(V(x1, top, z1), V(x0, top, z1), V(x0, top + rise, zm), V(x1, top + rise, zm), { x: 0, y: 0.6, z: 0.8 }, roof, dark, roof);
    const wall = WALLS[lot.colour % WALLS.length]!;
    b.tri(V(f.minX, top, f.minZ), V(f.minX, top + rise - 0.05, zm), V(f.minX, top, f.maxZ), wall);
    b.tri(V(f.maxX, top, f.maxZ), V(f.maxX, top + rise - 0.05, zm), V(f.maxX, top, f.minZ), wall);
  } else {
    const x0 = f.minX - o, x1 = f.maxX + o, z0 = f.minZ - o, z1 = f.maxZ + o, xm = (f.minX + f.maxX) / 2;
    b.quad(V(x0, top, z1), V(x0, top, z0), V(xm, top + rise, z0), V(xm, top + rise, z1), { x: -0.8, y: 0.6, z: 0 }, roof, dark, roof);
    b.quad(V(x1, top, z0), V(x1, top, z1), V(xm, top + rise, z1), V(xm, top + rise, z0), { x: 0.8, y: 0.6, z: 0 }, roof, dark, roof);
    const wall = WALLS[lot.colour % WALLS.length]!;
    b.tri(V(f.minX, top, f.maxZ), V(xm, top + rise - 0.05, f.maxZ), V(f.maxX, top, f.maxZ), wall);
    b.tri(V(f.maxX, top, f.minZ), V(xm, top + rise - 0.05, f.minZ), V(f.minX, top, f.minZ), wall);
  }
}

function addBuilding(b: MeshBuilder, lot: Lot, lod: Lod) {
  const f = lot.footprint;
  const height = lot.floors * lot.storey;
  if (lot.kind === "stall") {
    const canopy = SHOP_SIGNS[lot.colour % SHOP_SIGNS.length]!;
    if (lod === 2) {
      b.box(f.minX, 0, f.minZ, f.maxX, 2.4, f.maxZ, canopy);
      return;
    }
    b.box(f.minX + 0.2, 0, f.minZ + 0.2, f.maxX - 0.2, 1.0, f.maxZ - 0.2, C("#a57a52")); // counter
    for (const [x, z] of [[f.minX, f.minZ], [f.maxX - 0.15, f.minZ], [f.minX, f.maxZ - 0.15], [f.maxX - 0.15, f.maxZ - 0.15]] as const) b.box(x, 0, z, x + 0.15, 2.4, z + 0.15, POLE);
    b.box(f.minX - 0.2, 2.4, f.minZ - 0.2, f.maxX + 0.2, 2.6, f.maxZ + 0.2, canopy);
    return;
  }
  const wall = lot.kind === "terminal" ? C("#d9dde0") : WALLS[lot.colour % WALLS.length]!;
  b.box(f.minX, 0, f.minZ, f.maxX, height, f.maxZ, wall, 0.78);
  addRoof(b, lot, height, lod);
  if (lod === 2) return;

  if (lod === 1) return;
  // ---- full detail: windows, door, garage, shop sign, fence
  const sides: Facing[] = [0, 1, 2, 3];
  for (const side of sides) {
    const length = side === 0 || side === 2 ? f.maxX - f.minX : f.maxZ - f.minZ;
    const columns = Math.max(1, Math.floor((length - 1.2) / 3));
    const step = length / columns;
    for (let floor = 0; floor < lot.floors; floor++) {
      const base = floor * lot.storey;
      for (let k = 0; k < columns; k++) {
        const centre = step * (k + 0.5);
        const isFrontGround = side === lot.facing && floor === 0;
        if (isFrontGround && (lot.kind === "shop" || Math.abs(centre - length * (lot.garage ? 0.28 : 0.5)) < 1.3)) continue; // door or shopfront goes here
        if (isFrontGround && lot.garage && centre > length * 0.55) continue;
        const w = lot.kind === "terminal" ? 2.2 : 1.1;
        wallRect(b, f, side, centre - w / 2, centre + w / 2, base + (lot.kind === "terminal" ? 1 : 1.0), base + (lot.kind === "terminal" ? 3.4 : 2.3), 0.03, GLASS);
      }
    }
  }
  const length = lot.facing === 0 || lot.facing === 2 ? f.maxX - f.minX : f.maxZ - f.minZ;
  if (lot.kind === "shop" || lot.kind === "terminal") {
    wallRect(b, f, lot.facing, length * 0.12, length * 0.88, 0.2, 2.6, 0.04, GLASS); // shopfront
    wallRect(b, f, lot.facing, length * 0.08, length * 0.92, 2.7, 3.35, 0.08, SHOP_SIGNS[lot.colour % SHOP_SIGNS.length]!); // sign band
  } else {
    wallRect(b, f, lot.facing, length * (lot.garage ? 0.28 : 0.5) - 0.55, length * (lot.garage ? 0.28 : 0.5) + 0.55, 0, 2.2, 0.04, DOOR);
    if (lot.garage) wallRect(b, f, lot.facing, length * 0.58, length * 0.58 + 3.2, 0, 2.4, 0.04, GARAGE);
  }
  if (lot.fence && lot.kind !== "shop") {
    const p = lot.plot;
    const h = 1.5, t = 0.15;
    const front = lot.facing === 0 ? p.minZ : p.maxZ;
    // Back and side walls; the front has a gap for the gate.
    b.box(p.minX, 0, p.minZ, p.minX + t, h, p.maxZ, FENCE);
    b.box(p.maxX - t, 0, p.minZ, p.maxX, h, p.maxZ, FENCE);
    const back = lot.facing === 0 ? p.maxZ : p.minZ;
    b.box(p.minX, 0, back - (lot.facing === 0 ? t : 0), p.maxX, h, back + (lot.facing === 0 ? 0 : t), FENCE);
    const mid = (p.minX + p.maxX) / 2;
    const fz0 = lot.facing === 0 ? front : front - t;
    const fz1 = lot.facing === 0 ? front + t : front;
    b.box(p.minX, 0, fz0, mid - 1.8, h * 0.8, fz1, FENCE);
    b.box(mid + 1.8, 0, fz0, p.maxX, h * 0.8, fz1, FENCE);
  }
}

// ---------------------------------------------------------------- trees and lamps (instanced)

function treeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 2.2, 6).toNonIndexed();
  trunk.translate(0, 1.1, 0);
  paint(trunk, TRUNK);
  parts.push(trunk);
  const crown = new THREE.IcosahedronGeometry(1.7, 1).toNonIndexed();
  crown.scale(1, 0.95, 1);
  crown.translate(0, 3.5, 0);
  paint(crown, C("#7fc35f"), true);
  parts.push(crown);
  return merge(parts);
}

function lampGeometry(): THREE.BufferGeometry {
  const pole = new THREE.CylinderGeometry(0.06, 0.08, 6.2, 5).toNonIndexed();
  pole.translate(0, 3.1, 0);
  paint(pole, POLE);
  const arm = new THREE.BoxGeometry(1.3, 0.1, 0.1).toNonIndexed();
  arm.translate(0.6, 6.15, 0);
  paint(arm, POLE);
  const head = new THREE.BoxGeometry(0.5, 0.14, 0.26).toNonIndexed();
  head.translate(1.25, 6.05, 0);
  paint(head, C("#f3e6b0"));
  return merge([pole, arm, head]);
}

function paint(g: THREE.BufferGeometry, color: THREE.Color, vary = false) {
  const n = g.getAttribute("position").count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const shade = vary ? 0.85 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.3 : 1;
    colors.set([color.r * shade, color.g * shade, color.b * shade], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute("uv");
  g.computeVertexNormals();
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const total = parts.reduce((s, p) => s + p.getAttribute("position").count, 0);
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  let at = 0;
  for (const p of parts) {
    pos.set(p.getAttribute("position").array as Float32Array, at * 3);
    col.set(p.getAttribute("color").array as Float32Array, at * 3);
    nor.set(p.getAttribute("normal").array as Float32Array, at * 3);
    at += p.getAttribute("position").count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  return g;
}

export const SHARED_TREE = treeGeometry();
export const SHARED_LAMP = lampGeometry();

const LAMP_YAW: Record<Facing, number> = { 0: Math.PI / 2, 1: Math.PI, 2: -Math.PI / 2, 3: 0 };

function instancedTrees(trees: ChunkData["trees"], shadows: boolean): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(SHARED_TREE, treeMaterial, trees.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const color = new THREE.Color();
  trees.forEach((t, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (t.x * 7.3 + t.z * 3.1) % (Math.PI * 2));
    const stretch = [1, 1.25, 0.85][t.variant]!;
    const wide = [1, 0.8, 1.2][t.variant]!;
    s.set(t.scale * wide, t.scale * stretch, t.scale * wide);
    m.compose(new THREE.Vector3(t.x, 0, t.z), q, s);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, color.copy(LEAF[t.variant]!).lerp(new THREE.Color("#ffffff"), 0.8));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = shadows;
  return mesh;
}

function instancedLamps(lamps: Lamp[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(SHARED_LAMP, treeMaterial, lamps.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  lamps.forEach((l, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), LAMP_YAW[l.facing]);
    m.compose(new THREE.Vector3(l.x, 0, l.z), q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = true;
  return mesh;
}

export interface BuiltChunk {
  group: THREE.Group;
  triangles: number;
  geometries: THREE.BufferGeometry[];
}

/** Builds the 3D objects for one chunk at one level of detail. */
export function buildChunk(chunk: ChunkData, lod: Lod): BuiltChunk {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  let triangles = 0;
  const b = new MeshBuilder();
  for (const lot of chunk.lots) addBuilding(b, lot, lod);
  const geo = b.build();
  if (geo) {
    const mesh = new THREE.Mesh(geo, buildingMaterial);
    mesh.castShadow = lod === 0;
    mesh.receiveShadow = lod === 0;
    group.add(mesh);
    geometries.push(geo);
    triangles += b.triangles;
  }
  if (lod <= 1 && chunk.trees.length) {
    group.add(instancedTrees(chunk.trees, lod === 0));
    triangles += chunk.trees.length * (SHARED_TREE.getAttribute("position").count / 3);
  }
  if (lod === 0 && chunk.lamps.length) {
    group.add(instancedLamps(chunk.lamps));
    triangles += chunk.lamps.length * (SHARED_LAMP.getAttribute("position").count / 3);
  }
  group.matrixAutoUpdate = false;
  return { group, triangles, geometries };
}

// ---------------------------------------------------------------- the parts that never stream (roads, ground detail)

/** Roads, sidewalks, paving and crop fields for the whole district: a few hundred flat quads, built once, three draw calls or fewer. */
export function buildGroundDetail(d: District): THREE.Mesh[] {
  const roads = new MeshBuilder();
  const asphalt = C("#3b3e43");
  const marking = C("#e8e2c4");
  for (const r of d.roads) roads.flat(r.minX, r.minZ, r.maxX, r.maxZ, 0.02, asphalt);
  // Dashed centre lines along every road, left out at the junctions.
  const centres = [-180, -108, -36, 36, 108, 180];
  const nearJunction = (t: number) => centres.some((c) => Math.abs(t - c) < 6);
  for (const c of centres) {
    for (let t = -d.bounds.maxX + 3; t < d.bounds.maxX - 3; t += 6) {
      if (nearJunction(t) || nearJunction(t + 3)) continue;
      roads.flat(c - 0.12, t, c + 0.12, t + 3, 0.035, marking);
      roads.flat(t, c - 0.12, t + 3, c + 0.12, 0.035, marking);
    }
  }
  const paving = new MeshBuilder();
  for (const r of d.paving) paving.flat(r.minX, r.minZ, r.maxX, r.maxZ, 0.03, C("#9d9a92"));
  const curb = new MeshBuilder();
  for (const r of d.sidewalks) curb.box(r.minX, 0, r.minZ, r.maxX, 0.14, r.maxZ, C("#b8b3a8"), 0.9);
  const crops = new MeshBuilder();
  const cropColours = ["#7aa04a", "#8fae52", "#a5883f", "#6b8f3f"].map(C);
  d.fields.forEach((r, i) => {
    crops.flat(r.minX, r.minZ, r.maxX, r.maxZ, 0.025, C("#7a5a3a"));
    const rows = Math.floor((r.maxX - r.minX) / 1.6);
    for (let k = 0; k < rows; k++) crops.flat(r.minX + 0.5 + k * 1.6, r.minZ + 0.4, r.minX + 1.3 + k * 1.6, r.maxZ - 0.4, 0.04, cropColours[(i + k) % cropColours.length]!);
  });
  const meshes: THREE.Mesh[] = [];
  for (const builder of [roads, paving, curb, crops]) {
    const g = builder.build();
    if (!g) continue;
    const mesh = new THREE.Mesh(g, buildingMaterial);
    mesh.receiveShadow = true;
    meshes.push(mesh);
  }
  return meshes;
}
