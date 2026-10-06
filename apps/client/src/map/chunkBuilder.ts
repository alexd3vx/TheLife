import * as THREE from "three";
import { ROAD_CENTRES, ROAD_WIDTH, SIDEWALK, generatePlan, hasInterior, type ChunkData, type District, type Facing, type Lamp, type Lot, type Rect } from "@thelife/game-core";
import { MeshBuilder } from "./meshBuilder";
import { addProp } from "./props";
import { addInterior } from "./interior";
import { addPrism } from "./prism";
import { FacadeBuilder, facadeMaterial } from "./facade";
import { LANDMARK_WALL, addHangar, addLandmark } from "./landmarks";
import { asphaltTexture, concreteTexture, glowTexture, pavingTexture } from "./groundTextures";

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
/** The lamp heads glow at night (emissive); the poles are part of the chunk mesh. */
export const lampMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: new THREE.Color("#ffd58a"), emissiveIntensity: 0 });
/**
 * Roofs and upper floors of buildings with interiors. Every vertex carries its building's number, and one shared value
 * (`capHide`) says which building to hide, so the roof comes off the building the player is standing in.
 */
export const capHideLot = { value: -1 };
/** The floor the player is on; floors above it are hidden in that building. */
export const capHideLevel = { value: 0 };
function patchHide(material: THREE.Material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHideLot = capHideLot;
    shader.uniforms.uHideLevel = capHideLevel;
    shader.vertexShader = `attribute float lotId;\nvarying float vLotId;\n${shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvLotId = lotId;")}`;
    shader.fragmentShader = `uniform float uHideLot;\nuniform float uHideLevel;\nvarying float vLotId;\n${shader.fragmentShader.replace("void main() {", "void main() {\nfloat hideLot = floor(vLotId / 8.0 + 0.001);\nfloat hideFloor = vLotId - hideLot * 8.0;\nif (abs(hideLot - uHideLot) < 0.5 && hideFloor > uHideLevel + 0.5) discard;")}`;
  };
  material.customProgramCacheKey = () => "cap-hide";
}
export const capMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
patchHide(capMaterial);
const capDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
patchHide(capDepthMaterial);

export const treeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });

import { V, wallRect } from "./wall";

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

/** A real interior: ground floor in the main mesh, upper floors and roof in the hideable cap. */
function addInteriorBuilding(b: MeshBuilder, cap: MeshBuilder, lot: Lot) {
  const lotNo = Number(lot.id.slice(1));
  addInterior(b, cap, lot, generatePlan(lot), lot.landmark ? LANDMARK_WALL[lot.landmark] : WALLS[lot.colour % WALLS.length]!, lotNo);
  cap.setLot(lotNo * 8 + lot.floors); // the roof counts as the floor above the top storey
  addRoof(cap, lot, lot.floors * lot.storey, 0);
  if (lot.landmark) addLandmark(cap, lot, lot.landmark, true); // signs and domes go with the roof, so they lift off when you walk in
}

const YARD = C("#8c9a78");

/** The building on its own, with a bare yard around it: what you see when you are inside and the street is switched off. */
export function buildInteriorScene(lot: Lot): { group: THREE.Group; geometries: THREE.BufferGeometry[] } {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const b = new MeshBuilder();
  const cap = new MeshBuilder();
  const f = lot.footprint;
  b.flat(f.minX - 90, f.minZ - 90, f.maxX + 90, f.maxZ + 90, -0.03, YARD);
  addInteriorBuilding(b, cap, lot);
  const geo = b.build();
  if (geo) {
    const mesh = new THREE.Mesh(geo, buildingMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    geometries.push(geo);
  }
  const capGeo = cap.build();
  if (capGeo) {
    const mesh = new THREE.Mesh(capGeo, capMaterial);
    mesh.customDepthMaterial = capDepthMaterial;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    geometries.push(capGeo);
  }
  return { group, geometries };
}

function addBuilding(b: MeshBuilder, cap: MeshBuilder, fb: FacadeBuilder, lot: Lot, lod: Lod) {
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
  if (lot.poly) {
    addPrism(fb, b, lot, lod);
    return;
  }
  if (lod === 0 && hasInterior(lot)) {
    addInteriorBuilding(b, cap, lot);
    return;
  }
  const wall = lot.landmark ? LANDMARK_WALL[lot.landmark] : lot.kind === "terminal" ? C("#d9dde0") : lot.kind === "hangar" ? C("#9aa3ab") : WALLS[lot.colour % WALLS.length]!;
  b.box(f.minX, 0, f.minZ, f.maxX, height, f.maxZ, wall, 0.78);
  addRoof(b, lot, height, lod);
  if (lod === 2) return;
  if (lot.landmark) addLandmark(b, lot, lot.landmark, lod === 0);
  if (lot.kind === "hangar") addHangar(b, lot, lod === 0);
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
  const arm = new THREE.BoxGeometry(1.3, 0.1, 0.1).toNonIndexed();
  arm.translate(0.6, 6.15, 0);
  paint(arm, POLE);
  const head = new THREE.BoxGeometry(0.5, 0.14, 0.26).toNonIndexed();
  head.translate(1.25, 6.05, 0);
  paint(head, C("#f3e6b0"));
  return merge([arm, head]);
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
  const mesh = new THREE.InstancedMesh(SHARED_LAMP, lampMaterial, lamps.length);
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
  const cap = new MeshBuilder();
  const fb = new FacadeBuilder();
  for (const lot of chunk.lots) addBuilding(b, cap, fb, lot, lod);
  if (lod <= 1) for (const p of chunk.props) addProp(b, p, lod === 0);
  if (lod === 0) for (const l of chunk.lamps) b.box(l.x - 0.06, 0, l.z - 0.06, l.x + 0.06, 6.2, l.z + 0.06, POLE, 0.9);
  const geo = b.build();
  if (geo) {
    const mesh = new THREE.Mesh(geo, buildingMaterial);
    mesh.castShadow = lod === 0;
    mesh.receiveShadow = lod === 0;
    group.add(mesh);
    geometries.push(geo);
    triangles += b.triangles;
  }
  const capGeo = cap.build();
  if (capGeo) {
    const mesh = new THREE.Mesh(capGeo, capMaterial);
    mesh.customDepthMaterial = capDepthMaterial;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    geometries.push(capGeo);
    triangles += cap.triangles;
  }
  const facadeGeo = fb.build();
  if (facadeGeo) {
    const mesh = new THREE.Mesh(facadeGeo, facadeMaterial());
    mesh.castShadow = lod === 0;
    mesh.receiveShadow = lod === 0;
    group.add(mesh);
    geometries.push(facadeGeo);
    triangles += fb.triangles;
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

export interface GroundDetail {
  group: THREE.Group;
  /** Street lamps glow and throw pools of light at night. */
  setNight(on: boolean): void;
}

/** Roads, sidewalks, paving, crossings, crop fields, cables and lamp light-pools for the whole district: built once, about ten draw calls. */
export function buildGroundDetail(d: District, anisotropy = 4): GroundDetail {
  const group = new THREE.Group();
  const half = ROAD_WIDTH / 2;
  const white = C("#ffffff");
  const asphalt = asphaltTexture();
  const paving = pavingTexture();
  const concrete = concreteTexture();
  for (const t of [asphalt, paving, concrete]) t.anisotropy = anisotropy;

  const roads = new MeshBuilder();
  for (const r of d.roads) roads.flat(r.minX, r.minZ, r.maxX, r.maxZ, 0.02, white, 8);

  // Paint: dashed centre lines, solid edge lines, zebra crossings. Drawn just above the asphalt.
  const rw = d.runway;
  roads.flat(rw.minX, rw.minZ, rw.maxX, rw.maxZ, 0.022, white, 8);
  const paint = new MeshBuilder();
  const line = C("#e8e2c4");
  {
    // Runway markings: edge lines, a dashed centre line and threshold stripes at both ends.
    const zc = (rw.minZ + rw.maxZ) / 2;
    paint.flat(rw.minX, rw.minZ + 0.4, rw.maxX, rw.minZ + 0.55, 0.036, line);
    paint.flat(rw.minX, rw.maxZ - 0.55, rw.maxX, rw.maxZ - 0.4, 0.036, line);
    for (let x = rw.minX + 20; x < rw.maxX - 20; x += 14) paint.flat(x, zc - 0.2, x + 7, zc + 0.2, 0.036, line);
    for (const end of [rw.minX + 4, rw.maxX - 16]) for (let k = 0; k < 6; k++) paint.flat(end, rw.minZ + 1.2 + k * 1.5, end + 12, rw.minZ + 1.9 + k * 1.5, 0.036, line);
  }
  const edge = C("#d9d6c8");
  const near = (t: number) => ROAD_CENTRES.some((c) => Math.abs(t - c) < half + 0.2);
  const H = d.bounds.maxX;
  for (const c of ROAD_CENTRES) {
    for (let t = -H + 3; t < H - 3; t += 6) {
      if (near(t) || near(t + 3) || near(t + 1.5)) continue;
      paint.flat(c - 0.12, t, c + 0.12, t + 3, 0.035, line);
      paint.flat(t, c - 0.12, t + 3, c + 0.12, 0.035, line);
    }
    // Edge lines between junctions.
    let from = -H;
    for (const other of [...ROAD_CENTRES, H + ROAD_WIDTH]) {
      const to = Math.min(other - half - 3.5, H);
      if (to > from + 1) {
        for (const o of [-half + 0.35, half - 0.35]) {
          paint.flat(c + o - 0.07, from, c + o + 0.07, to, 0.034, edge);
          paint.flat(from, c + o - 0.07, to, c + o + 0.07, 0.034, edge);
        }
      }
      from = other + half + 3.5;
    }
  }
  for (const cx of ROAD_CENTRES) {
    for (const cz of ROAD_CENTRES) {
      for (const arm of [-1, 1]) {
        const a = arm * (half + 1.2); // zebra stripes sit just outside the junction square
        const b = arm * (half + 3.2);
        for (let k = 0; k < 6; k++) {
          const o = -half + 0.7 + k * 1.2;
          paint.flat(cx + o, cz + Math.min(a, b), cx + o + 0.6, cz + Math.max(a, b), 0.036, edge); // across the north-south road
          paint.flat(cx + Math.min(a, b), cz + o, cx + Math.max(a, b), cz + o + 0.6, 0.036, edge); // across the east-west road
        }
      }
    }
  }

  const walk = new MeshBuilder();
  const curb = new MeshBuilder();
  const curbColour = C("#b3aea3");
  for (const r of d.sidewalks) {
    walk.flat(r.minX, r.minZ, r.maxX, r.maxZ, 0.042, white, 2);
    curb.box(r.minX, 0, r.minZ, r.maxX, 0.04, r.maxZ, curbColour, 0.82);
  }
  const slabs = new MeshBuilder();
  for (const r of d.paving) slabs.flat(r.minX, r.minZ, r.maxX, r.maxZ, 0.03, white, 6);
  const crops = new MeshBuilder();
  const cropColours = ["#7aa04a", "#8fae52", "#a5883f", "#6b8f3f"].map(C);
  d.fields.forEach((r, i) => {
    crops.flat(r.minX, r.minZ, r.maxX, r.maxZ, 0.025, C("#7a5a3a"));
    const rows = Math.floor((r.maxX - r.minX) / 1.6);
    for (let k = 0; k < rows; k++) crops.flat(r.minX + 0.5 + k * 1.6, r.minZ + 0.4, r.minX + 1.3 + k * 1.6, r.maxZ - 0.4, 0.04, cropColours[(i + k) % cropColours.length]!);
  });
  const add = (builder: MeshBuilder, material: THREE.Material, polygonOffset = 0) => {
    const g = builder.build();
    if (!g) return;
    if (polygonOffset) {
      material.polygonOffset = true;
      material.polygonOffsetFactor = -polygonOffset;
      material.polygonOffsetUnits = -polygonOffset;
    }
    const mesh = new THREE.Mesh(g, material);
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(roads, new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95 }));
  add(paint, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 1);
  add(walk, new THREE.MeshStandardMaterial({ map: paving, roughness: 0.95 }), 1);
  add(curb, buildingMaterial);
  add(slabs, new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.95 }), 1);
  add(crops, buildingMaterial);

  // Overhead cables: three sagging lines per span, one draw call.
  const wire: number[] = [];
  for (const [x1, z1, x2, z2] of d.wires) {
    const along = Math.abs(x2 - x1) > Math.abs(z2 - z1); // true: the span runs along x, so the three lines are spread along z
    for (const off of [-0.7, 0, 0.7]) {
      const h = off === 0 ? 6.95 : 7.75;
      const ax = x1 + (along ? 0 : off), az = z1 + (along ? off : 0), bx = x2 + (along ? 0 : off), bz = z2 + (along ? off : 0);
      wire.push(ax, h, az, (ax + bx) / 2, h - 0.45, (az + bz) / 2, (ax + bx) / 2, h - 0.45, (az + bz) / 2, bx, h, bz);
    }
  }
  if (wire.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(wire, 3));
    g.computeBoundingSphere();
    group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: "#1c1d20" })));
  }

  // Pools of light on the street under each lamp (visible at night only).
  const pool: number[] = [];
  const poolUv: number[] = [];
  const size = 8;
  for (const l of d.lamps) {
    const dx = l.facing === 3 ? 1.6 : l.facing === 1 ? -1.6 : 0;
    const dz = l.facing === 0 ? 1.6 : l.facing === 2 ? -1.6 : 0;
    const x = l.x + dx, z = l.z + dz;
    pool.push(x - size, 0.05, z - size, x + size, 0.05, z - size, x + size, 0.05, z + size, x - size, 0.05, z - size, x + size, 0.05, z + size, x - size, 0.05, z + size);
    poolUv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  }
  const poolMaterial = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false, side: THREE.DoubleSide });
  if (pool.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pool, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(poolUv, 2));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, poolMaterial);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  void SIDEWALK;
  return {
    group,
    setNight(on: boolean) {
      poolMaterial.opacity = on ? 1 : 0;
      lampMaterial.emissiveIntensity = on ? 2.2 : 0;
    },
  };
}
