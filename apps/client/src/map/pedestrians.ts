import * as THREE from "three";
import { STREET, type LagosTerrain } from "@thelife/game-core";
import { Avatar } from "../lab/avatar";
import { randomNpcLook } from "../lab/npcLooks";
import type { AssetManifest } from "../lab/manifest";

const SKIN = ["#6b4430", "#8a5a3c", "#4e3022", "#a06a48", "#3c2418", "#c28a62"];
const SHIRT = ["#d2503c", "#3b82c4", "#e0b43a", "#4a9d6a", "#8a5ac4", "#d97a2c", "#2c8a8a", "#c44a7a", "#f2f2ee", "#2a2f3a"];
const TROUSERS = ["#2b3140", "#3a3328", "#1f2a44", "#4a4a4a"];
const WALK_SPEED = 1.25;
const SHOW_RANGE = 85;
/** Closer than this, a person is a real character (random look, real walking animation); farther they are the cheap figures. */
const REAL_RANGE = 30;

interface Ped {
  x: number;
  z: number;
  heading: number;
  speed: number;
  phase: number;
}

/**
 * Street life: people walking round the blocks along the pavements. A whole crowd is a handful of instanced meshes (one per body
 * part), so thirty people cost about seven draw calls. Only those near the player are drawn.
 */
export class Pedestrians {
  readonly root = new THREE.Group();
  private readonly peds: Ped[] = [];
  private readonly parts: { mesh: THREE.InstancedMesh; kind: "torso" | "head" | "leg" | "arm"; side: number }[] = [];
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  private time = 0;
  private readonly m = new THREE.Matrix4();
  private readonly base = new THREE.Matrix4();
  private readonly local = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly zero = new THREE.Vector3(0, 0, 0);

  /** The real characters, shared out among whoever is nearest the player. */
  private readonly real: { avatar: Avatar | null; ped: number }[] = [];

  constructor(private readonly terrain: LagosTerrain, count = 40, manifest?: AssetManifest, realCount = 0) {
    if (manifest) this.loadReal(manifest, realCount);
    for (let i = 0; i < count; i++) this.peds.push({ x: -1e6, z: -1e6, heading: Math.random() * Math.PI * 2, speed: WALK_SPEED * (0.8 + Math.random() * 0.5), phase: Math.random() * 6 });
    const box = (w: number, h: number, d: number, dy: number) => {
      const g = new THREE.BoxGeometry(w, h, d).translate(0, dy, 0);
      this.geos.push(g);
      return g;
    };
    const head = new THREE.SphereGeometry(0.115, 10, 8).scale(1, 1.2, 1.05).translate(0, 1.62, 0);
    this.geos.push(head);
    const make = (geo: THREE.BufferGeometry, kind: "torso" | "head" | "leg" | "arm", side: number, colors: string[]) => {
      const mesh = new THREE.InstancedMesh(geo, this.mat, count);
      mesh.frustumCulled = false;
      this.peds.forEach((_, i) => mesh.setColorAt(i, new THREE.Color(colors[(i * 7 + side * 3 + kind.length) % colors.length]!)));
      this.root.add(mesh);
      this.parts.push({ mesh, kind, side });
    };
    make(box(0.42, 0.58, 0.22, 1.18), "torso", 0, SHIRT);
    make(head, "head", 0, SKIN);
    for (const side of [-1, 1]) {
      make(box(0.17, 0.9, 0.17, -0.45), "leg", side, TROUSERS);
      make(box(0.12, 0.55, 0.12, -0.275), "arm", side, SHIRT);
    }
    // The torso, head and arms share a person's colour choices through the same index, so arms match the shirt.
    const torso = this.parts[0]!.mesh;
    for (const p of this.parts) if (p.kind === "arm" && torso.instanceColor && p.mesh.instanceColor) p.mesh.instanceColor.array.set(torso.instanceColor.array);
    const heads = this.parts[1]!.mesh;
    void heads;
  }

  private disposed = false;

  /** One at a time, so a crowd does not freeze the game while it loads. */
  private async loadReal(manifest: AssetManifest, n: number): Promise<void> {
    for (let i = 0; i < n && !this.disposed; i++) {
      const slot = { avatar: null as Avatar | null, ped: -1 };
      this.real.push(slot);
      const avatar = new Avatar(manifest, randomNpcLook());
      try {
        await avatar.load();
      } catch {
        this.real.pop();
        continue;
      }
      if (this.disposed) {
        avatar.dispose();
        return;
      }
      avatar.root.visible = false;
      this.root.add(avatar.root);
      avatar.play("Walk_Loop", 0);
      slot.avatar = avatar;
    }
  }

  private shown = 1;

  /** Share of the crowd that is shown (0 to 1). */
  setDensity(fraction: number): void {
    this.shown = Math.max(0, Math.min(1, fraction));
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  update(dt: number, focusX: number, focusZ: number): void {
    if (!this.root.visible) return;
    this.time += dt;
    this.peds.forEach((p, i) => {
      const far = Math.hypot(p.x - focusX, p.z - focusZ);
      if (far > SHOW_RANGE * 1.4) {
        // Too far away to matter (or not placed yet): put this person on a street near the player, out of sight.
        for (let tries = 0; tries < 12; tries++) {
          const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * (SHOW_RANGE - 30);
          const x = focusX + Math.cos(a) * r, z = focusZ + Math.sin(a) * r;
          if (this.terrain.classAt(x, z) === STREET) {
            p.x = x;
            p.z = z;
            p.heading = Math.random() * Math.PI * 2;
            break;
          }
        }
      }
      // Walk on, and turn when the way ahead is not street.
      const step = p.speed * dt;
      let moved = false;
      for (const turn of [0, 0.35, -0.35, 0.8, -0.8, 1.6, -1.6, Math.PI]) {
        const h = p.heading + turn;
        const nx = p.x + Math.sin(h) * (step + 0.6), nz = p.z + Math.cos(h) * (step + 0.6);
        if (this.terrain.classAt(nx, nz) === STREET) {
          p.heading = h;
          p.x += Math.sin(h) * step;
          p.z += Math.cos(h) * step;
          moved = true;
          break;
        }
      }
      if (!moved) p.heading += Math.PI;
      if (Math.random() < 0.004) p.heading += (Math.random() - 0.5) * 0.8;
      const pos = { x: p.x, z: p.z, yaw: p.heading };
      const mine = this.real.find((r) => r.ped === i && r.avatar);
      if (mine && far > REAL_RANGE * 1.25) mine.ped = -1;
      else if (!mine && far < REAL_RANGE) {
        const free = this.real.find((r) => r.avatar && r.ped === -1);
        if (free) free.ped = i;
      }
      const realNow = this.real.find((r) => r.ped === i && r.avatar);
      if (realNow) {
        const a = realNow.avatar!;
        a.root.visible = true;
        a.root.position.set(p.x, 0, p.z);
        a.root.rotation.y = p.heading;
        a.update(dt);
      }
      const near = !realNow && far < SHOW_RANGE && i < this.peds.length * this.shown;
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), pos.yaw);
      this.base.compose(this.v.set(pos.x, 0, pos.z), this.q, near ? this.one : this.zero);
      const swing = Math.sin(this.time * (4.2 * p.speed) + p.phase) * 0.7;
      for (const part of this.parts) {
        if (part.kind === "torso" || part.kind === "head") {
          part.mesh.setMatrixAt(i, this.base);
        } else {
          const hip = part.kind === "leg";
          this.e.set(swing * part.side * (hip ? 1 : -0.8), 0, 0);
          this.q.setFromEuler(this.e);
          this.local.compose(this.v.set(part.side * (hip ? 0.1 : 0.27), hip ? 0.9 : 1.45, 0), this.q, this.one);
          this.m.multiplyMatrices(this.base, this.local);
          part.mesh.setMatrixAt(i, this.m);
        }
      }
    });
    for (const r of this.real) if (r.ped === -1 && r.avatar) r.avatar.root.visible = false;
    for (const part of this.parts) part.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.disposed = true;
    for (const r of this.real) r.avatar?.dispose();
    this.root.removeFromParent();
    for (const part of this.parts) part.mesh.dispose();
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
  }
}
