import * as THREE from "three";
import { DOOR_HEIGHT, type BuildingPlan, type Lot } from "@thelife/game-core";
import { LANDMARK_WALL } from "./landmarks";

const LEAF = new THREE.BoxGeometry(1, DOOR_HEIGHT - 0.04, 0.06).translate(0.5, (DOOR_HEIGHT - 0.04) / 2, 0);
const OPEN_AT = 2.6; // metres from the door at which it starts to open
const MAX_DOORS = 10;
const OPEN_ANGLE = Math.PI * 0.52;

interface Door {
  lot: Lot;
  mesh: THREE.Mesh;
  cx: number;
  cz: number;
  /** +1 or -1: which way the leaf swings (into the building). */
  swing: number;
  alongX: boolean;
  angle: number;
}

/** Front doors that swing open as you walk up to them, for the buildings near the player. */
export class DoorManager {
  private readonly doors = new Map<string, Door>();
  private readonly root = new THREE.Group();
  private frame = 0;
  private readonly materials = new Map<number, THREE.MeshStandardMaterial>();

  constructor(scene: THREE.Scene, private readonly lots: Lot[], private readonly planOf: (lot: Lot) => BuildingPlan) {
    scene.add(this.root);
  }

  private material(color: THREE.Color): THREE.MeshStandardMaterial {
    const key = color.getHex();
    let m = this.materials.get(key);
    if (!m) this.materials.set(key, (m = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.55), roughness: 0.7 })));
    return m;
  }

  private make(lot: Lot): Door | null {
    const plan = this.planOf(lot);
    // The front door: the exterior ground-floor wall with a door, nearest to the spot just inside it.
    let best: { w: (typeof plan.walls)[number]; o: (typeof plan.walls)[number]["openings"][number]; d: number } | null = null;
    for (const w of plan.walls) {
      if (w.floor !== 0 || !w.exterior) continue;
      for (const o of w.openings) {
        if (o.kind !== "door") continue;
        const alongX = w.a.z === w.b.z;
        const mid = (o.t0 + o.t1) / 2;
        const x = alongX ? w.a.x + mid : w.a.x;
        const z = alongX ? w.a.z : w.a.z + mid;
        const d = Math.hypot(x - plan.inside.x, z - plan.inside.z);
        if (!best || d < best.d) best = { w, o, d };
      }
    }
    if (!best) return null;
    const { w, o } = best;
    const alongX = w.a.z === w.b.z;
    const f = lot.footprint;
    const width = o.t1 - o.t0;
    const mesh = new THREE.Mesh(LEAF, this.material(lot.landmark ? LANDMARK_WALL[lot.landmark] : new THREE.Color("#7a5a3a")));
    mesh.scale.x = width;
    mesh.castShadow = true;
    const hx = alongX ? w.a.x + o.t0 : w.a.x;
    const hz = alongX ? w.a.z : w.a.z + o.t0;
    mesh.position.set(hx, 0, hz);
    const inwardSign = alongX ? ((f.minZ + f.maxZ) / 2 > w.a.z ? 1 : -1) : ((f.minX + f.maxX) / 2 > w.a.x ? 1 : -1);
    const swing = inwardSign;
    this.root.add(mesh);
    const mid = (o.t0 + o.t1) / 2;
    return { lot, mesh, cx: alongX ? w.a.x + mid : w.a.x, cz: alongX ? w.a.z : w.a.z + mid, swing, alongX, angle: 0 };
  }

  update(px: number, pz: number, dt: number): void {
    if (this.frame++ % 30 === 0) {
      const near = this.lots
        .map((l) => ({ l, d: Math.hypot((l.footprint.minX + l.footprint.maxX) / 2 - px, (l.footprint.minZ + l.footprint.maxZ) / 2 - pz) }))
        .filter((x) => x.d < 45)
        .sort((a, b) => a.d - b.d)
        .slice(0, MAX_DOORS);
      const keep = new Set(near.map((x) => x.l.id));
      for (const [id, door] of this.doors) {
        if (!keep.has(id)) {
          this.root.remove(door.mesh);
          this.doors.delete(id);
        }
      }
      for (const { l } of near) {
        if (!this.doors.has(l.id)) {
          const d = this.make(l);
          if (d) this.doors.set(l.id, d);
        }
      }
    }
    for (const door of this.doors.values()) {
      const near = Math.hypot(door.cx - px, door.cz - pz) < OPEN_AT;
      const target = near ? OPEN_ANGLE : 0;
      door.angle += (target - door.angle) * Math.min(1, dt * 6);
      // On a wall along x the leaf tip is at (cos, -sin), on a wall along z at (sin, cos): turn it toward the inside either way.
      door.mesh.rotation.y = (door.alongX ? -1 : 1) * door.swing * door.angle;
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const m of this.materials.values()) m.dispose();
  }
}
