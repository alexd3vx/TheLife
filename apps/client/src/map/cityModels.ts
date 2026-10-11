import * as THREE from "three";
import type { District, Lot } from "@thelife/game-core";
import { hash, loadKitLibrary, lotMatrix, modelsFor, setKitNight, type Model } from "./kit";

/**
 * The buildings of the city board, made from the Kenney City Kits (CC0, see kit.ts). Every building is an instance of one of about
 * sixty models, stretched to its footprint. The whole city uses the light "low detail" shapes; the ones near the middle of the
 * screen swap to the full models (only when zoomed in), so a phone never has to draw the whole city at full detail. Trees and
 * shipping containers are instances of the kit's models too.
 */

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
  private shown: Uint8Array = new Uint8Array(0);
  private gone = false;
  private lastView = { cx: 1e9, cz: 1e9, s: 0 };
  private trees: THREE.InstancedMesh[] = [];
  private containers: THREE.InstancedMesh[] = [];
  /** How many full-detail buildings may be on screen at once. */
  private readonly budget: number;

  constructor(private readonly district: District, private readonly night: boolean, lite: boolean) {
    this.budget = lite ? 260 : 700;
  }

  /** Loads the three kits and puts every building in its place. Resolves when the city is standing. */
  async load(): Promise<void> {
    const lib = await loadKitLibrary();
    if (this.gone) return;
    setKitNight(this.night);
    const { sub, ind } = lib;

    const lowSets = new Map<Model, Set>();
    const highSets = new Map<Model, Set>();
    const add = (sets: Map<Model, Set>, model: Model, slot: number) => {
      let s = sets.get(model);
      if (!s) sets.set(model, (s = { model, mesh: null as unknown as THREE.InstancedMesh, slots: [] }));
      s.slots.push(slot);
    };
    const placed: { lot: Lot; h: number; lowM: Model; highM: Model }[] = [];
    for (const lot of this.district.lots) {
      if (lot.kind === "stall") continue;
      const m = modelsFor(lib, lot);
      placed.push({ lot, h: m.h, lowM: m.low, highM: m.high });
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
          lotMatrix(pl.lot, set.model, pl.h, m4);
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
    // the models, materials and geometry belong to the shared library; only the instance buffers are ours
    for (const set of [...this.low, ...this.high]) set.mesh.dispose();
    for (const m of [...this.trees, ...this.containers]) m.dispose();
  }
}
