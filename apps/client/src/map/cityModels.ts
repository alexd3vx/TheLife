import * as THREE from "three";
import type { District, Lot } from "@thelife/game-core";
import { loadGLTF } from "../lab/loaders";
import { MeshBuilder } from "./meshBuilder";

/**
 * The buildings of the city board, made from the Kenney City Kits (CC0): commercial towers and shops, suburban houses, industrial
 * sheds. Every building is an instance of one of about sixty models, stretched to its footprint. The whole city uses the light
 * "low detail" shapes; the ones near the middle of the screen swap to the full models (only when zoomed in), so a phone never has to
 * draw the whole city at full detail. Trees and shipping containers are instances of the kit's models too.
 */

interface Model {
  name: string;
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  /** Size of the model as made (base on the ground, centred). */
  bw: number;
  bh: number;
  bd: number;
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

const hash = (x: number, z: number) => ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1 + 1) % 1;

interface Slot {
  lot: Lot;
  x: number;
  z: number;
}

interface Set {
  model: Model;
  mesh: THREE.InstancedMesh;
  /** The slots using this model, in instance order. */
  slots: number[];
}


export class CityModels {
  readonly root = new THREE.Group();
  private slots: Slot[] = [];
  private low: Set[] = [];
  private high: Set[] = [];
  private lowGeos: THREE.BufferGeometry[] = [];
  private shown: Uint8Array = new Uint8Array(0);
  private gone = false;
  private lastView = { cx: 1e9, cz: 1e9, s: 0 };
  private trees: THREE.InstancedMesh[] = [];
  private containers: THREE.InstancedMesh[] = [];
  private mats: THREE.Material[] = [];
  /** How many full-detail buildings may be on screen at once. */
  private readonly budget: number;

  constructor(private readonly district: District, private readonly night: boolean, lite: boolean) {
    this.budget = lite ? 260 : 700;
  }

  /** Loads the three kits and puts every building in its place. Resolves when the city is standing. */
  async load(): Promise<void> {
    const [com, sub, ind] = await Promise.all([loadKit("commercial.glb"), loadKit("suburban.glb"), loadKit("industrial.glb")]);
    if (this.gone) return;
    for (const kit of [com, sub, ind]) for (const m of kit.values()) this.mats.push(m.mat);
    if (this.night) {
      // after dark the windows glow: the kit's colour picture lights itself a little
      for (const m of this.mats) {
        const s = m as THREE.MeshStandardMaterial;
        s.emissive = new THREE.Color("#a9b8ff");
        s.emissiveMap = s.map;
        s.emissiveIntensity = 0.42;
      }
    }
    const pool = (kit: Map<string, Model>, test: (n: string) => boolean) => [...kit.values()].filter((m) => test(m.name));
    const towersFull = pool(com, (n) => /^building-(skyscraper-[a-e]|[a-n])$/.test(n));
    const towersLow = pool(com, (n) => n.startsWith("low-detail-building"));
    const housesFull = pool(sub, (n) => n.startsWith("building-type"));
    const shedsFull = pool(ind, (n) => /^building-[a-t]$/.test(n));
    const lowHouse = this.lowHouseModel(towersFull[0]!.mat);
    const lowShed = this.lowBox(ind.get("building-a")?.mat ?? towersFull[0]!.mat);

    const choose = (list: Model[], lot: Lot, w: number, d: number, h: number): Model => {
      // the model whose proportions are closest to what the lot needs, a few near-equal ones picked between by the lot's position
      const want = Math.log(h / Math.max(1, (w + d) / 2));
      const scored = list.map((m) => ({ m, score: Math.abs(Math.log(m.bh / Math.max(1e-3, (m.bw + m.bd) / 2)) - want) })).sort((a, b) => a.score - b.score);
      const top = scored.slice(0, Math.min(3, scored.length));
      return top[Math.floor(hash(lot.footprint.minX, lot.footprint.minZ) * top.length)]!.m;
    };

    const lowSets = new Map<Model, Set>();
    const highSets = new Map<Model, Set>();
    const add = (sets: Map<Model, Set>, model: Model, slot: number) => {
      let s = sets.get(model);
      if (!s) sets.set(model, (s = { model, mesh: null as unknown as THREE.InstancedMesh, slots: [] }));
      s.slots.push(slot);
    };
    const placed: { lot: Lot; w: number; d: number; h: number; lowM: Model; highM: Model }[] = [];
    for (const lot of this.district.lots) {
      if (lot.kind === "stall") continue;
      const f = lot.footprint;
      const w = f.maxX - f.minX, d = f.maxZ - f.minZ;
      const h = Math.max(3.4, lot.floors * lot.storey) * (lot.landmark ? 1.15 : 1);
      let lowM: Model, highM: Model;
      if (lot.kind === "hangar") {
        lowM = lowShed;
        highM = choose(shedsFull, lot, w, d, h);
      } else if (lot.kind === "house" && !lot.landmark) {
        lowM = lowHouse;
        highM = choose(housesFull, lot, w, d, h);
      } else {
        lowM = choose(towersLow, lot, w, d, h);
        highM = choose(towersFull, lot, w, d, h);
      }
      placed.push({ lot, w, d, h, lowM, highM });
    }
    this.slots = placed.map((p, i) => {
      const f = p.lot.footprint;
      add(lowSets, p.lowM, i);
      add(highSets, p.highM, i);
      return { lot: p.lot, x: (f.minX + f.maxX) / 2, z: (f.minZ + f.maxZ) / 2 };
    });

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const build = (sets: Map<Model, Set>, target: Set[], high: boolean) => {
      for (const set of sets.values()) {
        const mesh = new THREE.InstancedMesh(set.model.geo, set.model.mat, set.slots.length);
        mesh.frustumCulled = false;
        mesh.count = high ? 0 : set.slots.length;
        set.mesh = mesh;
        set.slots.forEach((slotIndex) => {
          const pl = placed[slotIndex]!;
          const f = pl.lot.footprint;
          // stretched to the footprint; the height follows the lot but never squashes or stretches the model out of shape
          const sx = pl.w / Math.max(1e-3, set.model.bw), sz = pl.d / Math.max(1e-3, set.model.bd);
          const base = (sx + sz) / 2;
          const sy = Math.max(base * 0.55, Math.min(base * 2.4, pl.h / Math.max(1e-3, set.model.bh)));
          q.setFromAxisAngle(up, pl.lot.yaw ?? 0);
          p.set((f.minX + f.maxX) / 2, 0, (f.minZ + f.maxZ) / 2);
          sc.set(sx, sy, sz);
          m4.compose(p, q, sc);
          m4.toArray(high ? this.highM : this.lowM, slotIndex * 16);
        });
        this.root.add(mesh);
        target.push(set);
      }
    };
    this.lowM = new Float32Array(placed.length * 16);
    this.highM = new Float32Array(placed.length * 16);
    this.colours = new Float32Array(placed.length);
    placed.forEach((pl, i) => (this.colours[i] = 0.86 + 0.28 * hash(pl.lot.footprint.minZ, pl.lot.footprint.minX)));
    build(lowSets, this.low, false);
    build(highSets, this.high, true);
    this.lastView = { cx: 1e9, cz: 1e9, s: 0 };
    this.apply(new Uint8Array(placed.length));

    // trees and shipping containers: instances of the kit's models, standing where the street world has them
    const treeLarge = sub.get("tree-large"), treeSmall = sub.get("tree-small");
    const trees = this.district.trees;
    for (const [model, test, height] of [[treeLarge, (i: number) => i % 3 !== 0, 9], [treeSmall, (i: number) => i % 3 === 0, 6]] as const) {
      if (!model) continue;
      const idx: number[] = [];
      trees.forEach((_, i) => test(i) && idx.push(i));
      const mesh = new THREE.InstancedMesh(model.geo, model.mat, idx.length);
      mesh.frustumCulled = false;
      const k = height / Math.max(1e-3, model.bh);
      idx.forEach((ti, j) => {
        const t = trees[ti]!;
        const s = k * (0.8 + 0.4 * hash(t.x, t.z));
        m4.compose(p.set(t.x, 0, t.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(t.z, t.x) * 6.28), sc.set(s, s, s));
        mesh.setMatrixAt(j, m4);
      });
      this.root.add(mesh);
      this.trees.push(mesh);
    }
    const crates = ["shipping-container-a", "shipping-container-b", "shipping-container-c"].map((n) => ind.get(n)).filter(Boolean) as Model[];
    const boxes = this.district.props.filter((q2) => q2.kind === "container");
    crates.forEach((model, ci) => {
      const mine = boxes.filter((_, i) => i % crates.length === ci);
      if (!mine.length) return;
      const mesh = new THREE.InstancedMesh(model.geo, model.mat, mine.length);
      mesh.frustumCulled = false;
      mine.forEach((c, j) => {
        const sx = 2.5 / Math.max(1e-3, Math.min(model.bw, model.bd)), len = 6.1 / Math.max(1e-3, Math.max(model.bw, model.bd));
        const alongX = model.bw > model.bd;
        // the kit's container is long along one axis: turn it to lie along z
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (alongX ? Math.PI / 2 : 0) + (c.yaw === 90 ? Math.PI / 2 : 0));
        m4.compose(p.set(c.x, 0, c.z), q, sc.set(len > 0 ? Math.min(sx, len) : sx, Math.min(sx, len), Math.min(sx, len)));
        mesh.setMatrixAt(j, m4);
      });
      this.root.add(mesh);
      this.containers.push(mesh);
    });
  }

  private lowM = new Float32Array(0);
  private highM = new Float32Array(0);
  private colours = new Float32Array(0);

  private lowBox(mat: THREE.Material): Model {
    const b = new MeshBuilder();
    b.box(-0.5, 0, -0.5, 0.5, 1, 0.5, new THREE.Color("#e8e8ee"), 0.8);
    return this.own(b.build()!, mat, 1, 1, 1);
  }

  /** The light house: a box with a pitched roof (a handful of triangles), painted from the kit's own colour picture. */
  private lowHouseModel(mat: THREE.Material): Model {
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
    return this.own(g, mat, 1, 1, 1);
  }

  private own(geo: THREE.BufferGeometry, mat: THREE.Material, bw: number, bh: number, bd: number): Model {
    geo.computeBoundingSphere();
    this.lowGeos.push(geo);
    return { name: "own", geo, mat, bw, bh, bd };
  }

  /** Swaps the buildings round the middle of the view to their full models (when zoomed in) and the rest to the light ones. */
  update(cx: number, cz: number, s: number): void {
    if (!this.slots.length) return;
    const moved = Math.hypot(cx - this.lastView.cx, cz - this.lastView.cz);
    const radius = (900 / Math.max(0.05, s)) * 0.55;
    if (moved < radius * 0.12 && Math.abs(Math.log(s / Math.max(1e-3, this.lastView.s || s))) < 0.12 && this.lastView.s) return;
    this.lastView = { cx, cz, s };
    const wantHigh = new Uint8Array(this.slots.length);
    if (s >= 0.42) {
      const near: { i: number; d: number }[] = [];
      for (let i = 0; i < this.slots.length; i++) {
        const d = Math.hypot(this.slots[i]!.x - cx, this.slots[i]!.z - cz);
        if (d < radius) near.push({ i, d });
      }
      near.sort((a, b) => a.d - b.d);
      for (let k = 0; k < Math.min(this.budget, near.length); k++) wantHigh[near[k]!.i] = 1;
    }
    this.apply(wantHigh);
  }

  /** Lays the instances out again: each model draws only the buildings that use it right now (no hidden ones left to process). */
  private apply(wantHigh: Uint8Array): void {
    const m4 = new THREE.Matrix4();
    const c = new THREE.Color();
    const fill = (sets: Set[], source: Float32Array, high: boolean) => {
      for (const set of sets) {
        let n = 0;
        for (const i of set.slots) {
          if ((wantHigh[i] === 1) !== high) continue;
          m4.fromArray(source, i * 16);
          set.mesh.setMatrixAt(n, m4);
          c.setScalar(this.colours[i]!);
          set.mesh.setColorAt(n, c);
          n++;
        }
        set.mesh.count = n;
        set.mesh.instanceMatrix.needsUpdate = true;
        if (set.mesh.instanceColor) set.mesh.instanceColor.needsUpdate = true;
      }
    };
    fill(this.low, this.lowM, false);
    fill(this.high, this.highM, true);
    this.shown = wantHigh;
  }

  dispose() {
    this.gone = true;
    for (const set of [...this.low, ...this.high]) {
      set.mesh.dispose();
      set.model.geo.dispose();
    }
    for (const m of [...this.trees, ...this.containers]) m.dispose();
    for (const g of this.lowGeos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
