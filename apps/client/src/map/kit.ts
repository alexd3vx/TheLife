import * as THREE from "three";
import type { Lot } from "@thelife/game-core";
import { loadGLTF } from "../lab/loaders";
import { MeshBuilder } from "./meshBuilder";

/**
 * The Kenney City Kits (CC0) as one shared library: commercial towers and shops, suburban houses, industrial sheds, trees and
 * shipping containers. Both the 3D city board and the street world build their buildings from it. Loaded once.
 */

export interface Model {
  name: string;
  geo: THREE.BufferGeometry;
  mat: THREE.MeshStandardMaterial;
  /** Size of the model as made (base on the ground, centred). */
  bw: number;
  bh: number;
  bd: number;
}

export interface KitLibrary {
  com: Map<string, Model>;
  sub: Map<string, Model>;
  ind: Map<string, Model>;
  towersFull: Model[];
  towersLow: Model[];
  housesFull: Model[];
  shedsFull: Model[];
  lowHouse: Model;
  lowShed: Model;
  mats: THREE.MeshStandardMaterial[];
}

/** A model with every attribute as plain floats (the files are stored quantised), moved so its base sits on the ground at the middle. */
function prepare(mesh: THREE.Mesh): { geo: THREE.BufferGeometry; size: THREE.Vector3 } {
  mesh.updateWorldMatrix(true, false);
  const src = mesh.geometry;
  const geo = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"] as const) {
    const a = src.getAttribute(name);
    if (!a) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
    geo.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  if (src.index) geo.setIndex(src.index.clone());
  geo.applyMatrix4(mesh.matrixWorld);
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  geo.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return { geo, size: box.getSize(new THREE.Vector3()) };
}

async function loadKit(file: string): Promise<Map<string, Model>> {
  const gltf = await loadGLTF(`${import.meta.env.BASE_URL}assets/city/${file}`);
  gltf.scene.updateMatrixWorld(true);
  const out = new Map<string, Model>();
  for (const node of gltf.scene.children) {
    let mesh: THREE.Mesh | null = null;
    node.traverse((o) => {
      if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
    });
    if (!mesh) continue;
    const m = mesh as THREE.Mesh;
    const { geo, size } = prepare(m);
    const mat = (m.material as THREE.MeshStandardMaterial).clone();
    mat.roughness = 0.85;
    mat.metalness = 0;
    out.set(node.name, { name: node.name, geo, mat, bw: size.x, bh: size.y, bd: size.z });
  }
  return out;
}

export const hash = (x: number, z: number) => ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1 + 1) % 1;

/** The light house: a box with a pitched roof (a handful of triangles), painted from the kit's own colour picture. */
function lowHouseModel(mat: THREE.MeshStandardMaterial): Model {
  const g = new THREE.BufferGeometry();
  const pos: number[] = [], uv: number[] = [];
  // the kit's palette picture: a white swatch for the walls and a rust-brown one for the roof
  const wall: [number, number] = [0.4, 0.62], roof: [number, number] = [0.66, 0.62];
  const quad = (a: number[], b: number[], c: number[], d: number[], t: [number, number]) => {
    for (const v of [a, b, c, a, c, d]) {
      pos.push(v[0]!, v[1]!, v[2]!);
      uv.push(t[0], t[1]);
    }
  };
  const x0 = -0.5, x1 = 0.5, z0 = -0.5, z1 = 0.5, h = 0.72, top = 1;
  quad([x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], wall);
  quad([x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0], wall);
  quad([x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], wall);
  quad([x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], wall);
  quad([x0, h, z1], [x1, h, z1], [x1, top, 0], [x0, top, 0], roof);
  quad([x1, h, z0], [x0, h, z0], [x0, top, 0], [x1, top, 0], roof);
  for (const v of [[x1, h, z1], [x1, h, z0], [x1, top, 0], [x0, h, z0], [x0, h, z1], [x0, top, 0]]) {
    pos.push(v[0]!, v[1]!, v[2]!);
    uv.push(wall[0], wall[1]);
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return { name: "low-house", geo: g, mat, bw: 1, bh: 1, bd: 1 };
}

function lowBoxModel(mat: THREE.MeshStandardMaterial): Model {
  const b = new MeshBuilder();
  b.box(-0.5, 0, -0.5, 0.5, 1, 0.5, new THREE.Color("#e8e8ee"), 0.8);
  const geo = b.build()!;
  return { name: "low-box", geo, mat, bw: 1, bh: 1, bd: 1 };
}

let loaded: KitLibrary | null = null;
let pending: Promise<KitLibrary> | null = null;

/** The library, once loaded (null before that, or if the files could not be fetched). */
export const kitLibrary = (): KitLibrary | null => loaded;

export function loadKitLibrary(): Promise<KitLibrary> {
  pending ??= (async () => {
    const [com, sub, ind] = await Promise.all([loadKit("commercial.glb"), loadKit("suburban.glb"), loadKit("industrial.glb")]);
    const pool = (kit: Map<string, Model>, test: (n: string) => boolean) => [...kit.values()].filter((m) => test(m.name));
    const towersFull = pool(com, (n) => /^building-(skyscraper-[a-e]|[a-n])$/.test(n));
    const lib: KitLibrary = {
      com, sub, ind, towersFull,
      towersLow: pool(com, (n) => n.startsWith("low-detail-building")),
      housesFull: pool(sub, (n) => n.startsWith("building-type")),
      shedsFull: pool(ind, (n) => /^building-[a-t]$/.test(n)),
      lowHouse: lowHouseModel(towersFull[0]!.mat),
      lowShed: lowBoxModel(ind.get("building-a")?.mat ?? towersFull[0]!.mat),
      mats: [...com.values(), ...sub.values(), ...ind.values()].map((m) => m.mat),
    };
    loaded = lib;
    return lib;
  })();
  pending.catch(() => (pending = null));
  return pending;
}

/** After dark the windows glow: the kit's colour picture lights itself a little (and goes back out by day). */
export function setKitNight(on: boolean): void {
  if (!loaded) return;
  for (const s of loaded.mats) {
    s.emissive = new THREE.Color(on ? "#a9b8ff" : "#000000");
    s.emissiveMap = on ? s.map : null;
    s.emissiveIntensity = on ? 0.42 : 0;
    s.needsUpdate = true;
  }
}

/** The model whose proportions are closest to what the lot needs; a few near-equal ones are picked between by the lot's position. */
export function chooseModel(list: Model[], lot: Lot, h: number): Model {
  const f = lot.footprint;
  const w = f.maxX - f.minX, d = f.maxZ - f.minZ;
  const want = Math.log(h / Math.max(1, (w + d) / 2));
  const scored = list.map((m) => ({ m, score: Math.abs(Math.log(m.bh / Math.max(1e-3, (m.bw + m.bd) / 2)) - want) })).sort((a, b) => a.score - b.score);
  const top = scored.slice(0, Math.min(3, scored.length));
  return top[Math.floor(hash(f.minX, f.minZ) * top.length)]!.m;
}

/** The light and the full model for a lot, by what it is. */
export function modelsFor(lib: KitLibrary, lot: Lot): { low: Model; high: Model; h: number } {
  const f = lot.footprint;
  const h = Math.max(3.4, lot.floors * lot.storey) * (lot.landmark ? 1.15 : 1);
  void f;
  if (lot.kind === "hangar") return { low: lib.lowShed, high: chooseModel(lib.shedsFull, lot, h), h };
  if (lot.kind === "house" && !lot.landmark) return { low: lib.lowHouse, high: chooseModel(lib.housesFull, lot, h), h };
  return { low: chooseModel(lib.towersLow, lot, h), high: chooseModel(lib.towersFull, lot, h), h };
}

const UP = new THREE.Vector3(0, 1, 0);
const q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
/** Where a model stands for a lot: stretched to its footprint, its front towards the street, its height following the lot without looking squashed. */
export function lotMatrix(lot: Lot, model: Model, h: number, out: THREE.Matrix4): THREE.Matrix4 {
  const f = lot.footprint;
  const w = f.maxX - f.minX, d = f.maxZ - f.minZ;
  const alongX = lot.facing === 0 || lot.facing === 2;
  // the kit's buildings face +z; a lot facing +x or -x has its width along z
  const sx = (alongX ? w : d) / Math.max(1e-3, model.bw), sz = (alongX ? d : w) / Math.max(1e-3, model.bd);
  const base = (sx + sz) / 2;
  const sy = Math.max(base * 0.55, Math.min(base * 2.4, h / Math.max(1e-3, model.bh)));
  const yaw = lot.facing === 0 ? Math.PI : lot.facing === 1 ? Math.PI / 2 : lot.facing === 3 ? -Math.PI / 2 : 0;
  q.setFromAxisAngle(UP, yaw + (lot.yaw ?? 0));
  p.set((f.minX + f.maxX) / 2, 0, (f.minZ + f.maxZ) / 2);
  sc.set(sx, sy, sz);
  return out.compose(p, q, sc);
}
