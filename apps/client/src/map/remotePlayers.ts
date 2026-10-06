import * as THREE from "three";
import type { PlayerView } from "@thelife/shared";
import { Avatar } from "../lab/avatar";
import { DEFAULT_LOOK, type Look } from "../lab/looks";
import type { AssetManifest } from "../lab/manifest";

/** How far behind the newest news we draw other players, so their movement stays smooth between snapshots. */
const DELAY = 0.13;
const SKIN = ["#6b4430", "#8a5a3c", "#4e3022", "#a06a48", "#3c2418"];
const SHIRT = ["#d2503c", "#3b82c4", "#e0b43a", "#4a9d6a", "#8a5ac4", "#d97a2c", "#2c8a8a", "#c44a7a"];

interface Sample {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

interface Remote {
  view: PlayerView;
  group: THREE.Group;
  legs: THREE.Mesh[];
  arms: THREE.Mesh[];
  tag: THREE.Sprite;
  samples: Sample[];
  phase: number;
  /** The real character, once it has loaded; until then the simple figure stands in. */
  avatar: Avatar | null;
  clip: string;
  figure: THREE.Object3D[];
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function nameTag(name: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext("2d")!;
  g.font = "bold 30px system-ui, sans-serif";
  const w = Math.min(248, g.measureText(name).width + 28);
  g.fillStyle = "rgba(10,14,24,0.72)";
  g.beginPath();
  g.roundRect((256 - w) / 2, 8, w, 48, 24);
  g.fill();
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(name, 128, 33, 230);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false }));
  sprite.scale.set(1.4, 0.35, 1);
  sprite.position.y = 2.1;
  sprite.renderOrder = 40;
  return sprite;
}

/** Other players in the shared world: cheap figures with a name tag, drawn slightly in the past and smoothed between snapshots. */
export class RemotePlayers {
  readonly root = new THREE.Group();
  private readonly players = new Map<string, Remote>();
  private readonly queue: (() => Promise<void>)[] = [];
  private loading = false;
  private readonly shared = {
    box: new THREE.BoxGeometry(1, 1, 1),
    head: new THREE.SphereGeometry(0.115, 12, 10),
  };

  constructor(private readonly manifest: AssetManifest) {}

  get count(): number {
    return this.players.size;
  }

  list(): PlayerView[] {
    return [...this.players.values()].map((r) => r.view);
  }

  private hash(id: string): number {
    let h = 0;
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h;
  }

  add(view: PlayerView): void {
    if (this.players.has(view.id)) return;
    const h = this.hash(view.id);
    const skin = new THREE.MeshStandardMaterial({ color: SKIN[h % SKIN.length], roughness: 0.8 });
    const shirt = new THREE.MeshStandardMaterial({ color: SHIRT[(h >> 3) % SHIRT.length], roughness: 0.85 });
    const trousers = new THREE.MeshStandardMaterial({ color: "#2b3140", roughness: 0.9 });
    const group = new THREE.Group();
    const part = (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number) => {
      const mesh = new THREE.Mesh(this.shared.box, m);
      mesh.scale.set(sx, sy, sz);
      mesh.position.set(x, y, 0);
      mesh.castShadow = true;
      return mesh;
    };
    const limb = (m: THREE.Material, sx: number, len: number, x: number, top: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, top, 0);
      const mesh = part(m, sx, len, sx, 0, -len / 2);
      pivot.add(mesh);
      group.add(pivot);
      return pivot as unknown as THREE.Mesh;
    };
    const torso = part(shirt, 0.42, 0.58, 0.22, 0, 1.18);
    const head = new THREE.Mesh(this.shared.head, skin);
    head.scale.set(1, 1.2, 1.05);
    head.position.set(0, 1.62, 0);
    head.castShadow = true;
    group.add(torso, head);
    const legs = [limb(trousers, 0.17, 0.9, -0.1, 0.9), limb(trousers, 0.17, 0.9, 0.1, 0.9)];
    const arms = [limb(shirt, 0.12, 0.55, -0.27, 1.45), limb(shirt, 0.12, 0.55, 0.27, 1.45)];
    const figure = [...group.children];
    const tag = nameTag(view.name);
    group.add(tag);
    group.position.set(view.x, view.y, view.z);
    group.rotation.y = view.yaw;
    this.root.add(group);
    this.players.set(view.id, { view: { ...view }, group, legs, arms, tag, samples: [{ t: performance.now() / 1000, x: view.x, y: view.y, z: view.z, yaw: view.yaw }], phase: 0, avatar: null, clip: "", figure });
    this.loadAvatar(view);
  }

  /** Loads the player's real character one at a time, so a crowd arriving does not freeze the game. */
  private loadAvatar(view: PlayerView): void {
    let look: Look = { ...DEFAULT_LOOK };
    try {
      if (view.look) look = { ...DEFAULT_LOOK, ...(JSON.parse(view.look) as Partial<Look>) };
    } catch {
      /* keep the default look */
    }
    this.queue.push(async () => {
      const r = this.players.get(view.id);
      if (!r) return;
      const avatar = new Avatar(this.manifest, look);
      try {
        await avatar.load();
      } catch {
        return; // the simple figure stays
      }
      const again = this.players.get(view.id);
      if (!again) {
        avatar.dispose();
        return;
      }
      again.avatar = avatar;
      for (const part of again.figure) part.visible = false;
      again.group.add(avatar.root);
      avatar.play("Idle_Loop", 0);
      again.clip = "Idle_Loop";
    });
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    while (this.queue.length) await this.queue.shift()!();
    this.loading = false;
  }

  remove(id: string): void {
    const r = this.players.get(id);
    if (!r) return;
    r.avatar?.dispose();
    this.root.remove(r.group);
    r.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) (m.material as THREE.Material).dispose();
      const s = o as THREE.Sprite;
      if (s.isSprite) {
        s.material.map?.dispose();
        s.material.dispose();
      }
    });
    this.players.delete(id);
  }

  /** A snapshot from the server: where everyone is now. */
  apply(snapshot: Pick<PlayerView, "id" | "x" | "y" | "z" | "yaw" | "clip" | "level">[], selfId: string): void {
    const t = performance.now() / 1000;
    for (const s of snapshot) {
      if (s.id === selfId) continue;
      const r = this.players.get(s.id);
      if (!r) continue;
      Object.assign(r.view, s);
      r.samples.push({ t, x: s.x, y: s.y, z: s.z, yaw: s.yaw });
      while (r.samples.length > 12) r.samples.shift();
    }
  }

  /** Where the local player is, so far-away characters are not animated. */
  readonly focus = new THREE.Vector3();
  /** When set, only players standing in this rectangle are shown (you are inside a building: the street is off). */
  only: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;

  update(dt: number): void {
    const render = performance.now() / 1000 - DELAY;
    for (const r of this.players.values()) {
      const s = r.samples;
      let a = s[0]!;
      let b = s[s.length - 1]!;
      for (let i = s.length - 1; i > 0; i--) {
        if (s[i - 1]!.t <= render) {
          a = s[i - 1]!;
          b = s[i]!;
          break;
        }
      }
      const k = b.t > a.t ? Math.min(1, Math.max(0, (render - a.t) / (b.t - a.t))) : 1;
      const px = r.group.position.x, pz = r.group.position.z;
      r.group.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
      r.group.rotation.y = a.yaw + wrap(b.yaw - a.yaw) * k;
      const o = this.only;
      const inScene = !o || (r.group.position.x > o.minX && r.group.position.x < o.maxX && r.group.position.z > o.minZ && r.group.position.z < o.maxZ);
      if (!inScene) {
        r.group.visible = false;
        continue;
      }
      r.group.visible = true;
      if (r.avatar) {
        const near = Math.hypot(r.group.position.x - this.focus.x, r.group.position.z - this.focus.z) < 70;
        r.group.visible = near;
        if (near) {
          if (r.view.clip !== r.clip && r.avatar.play(r.view.clip)) r.clip = r.view.clip;
          r.avatar.update(dt);
        }
        continue;
      }
      // Swing the limbs when they are moving.
      const speed = Math.hypot(r.group.position.x - px, r.group.position.z - pz) / Math.max(dt, 0.001);
      const moving = Math.min(1, speed / 1.2);
      r.phase += dt * Math.min(11, 3.5 + speed * 2.2);
      const swing = Math.sin(r.phase) * 0.7 * moving;
      r.legs[0]!.rotation.x = swing;
      r.legs[1]!.rotation.x = -swing;
      r.arms[0]!.rotation.x = -swing * 0.8;
      r.arms[1]!.rotation.x = swing * 0.8;
    }
  }

  dispose(): void {
    for (const id of [...this.players.keys()]) this.remove(id);
    this.shared.box.dispose();
    this.shared.head.dispose();
  }
}
