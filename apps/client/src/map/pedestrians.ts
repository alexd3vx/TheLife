import * as THREE from "three";
import { STREET, type LagosTerrain } from "@thelife/game-core";
import { Avatar } from "../lab/avatar";
import type { Look } from "../lab/looks";
import { crowdLookOf, diffLook, npcLookFromSeed, recolourLook, restyleLook } from "../lab/npcSpec";
import { Crowd, type CrowdLevel } from "./crowd";
import type { AssetManifest } from "../lab/manifest";

const newSeed = () => Math.floor(Math.random() * 0x7fffffff);
const WALK_SPEED = 1.25;
const SHOW_RANGE = 85;
/** Closer than this, a person is a real character (a full body, real clothes, real walking animation). */
const REAL_RANGE = 30;
/** Between that and this they are the crowd's 1,500-triangle bodies; beyond it the 420-triangle ones. */
const MID_RANGE = 48;
/** A real character going back to the pool is repainted (new skin, hair and clothes colours) at once: it costs a few milliseconds. */
/** One piece of its outfit (hair, top, trousers or shoes) is also swapped, at most this often: building one takes 80 to 200 ms. */
const RESTYLE_EVERY = 45;

interface Ped {
  x: number;
  z: number;
  heading: number;
  speed: number;
  phase: number;
  /** Who this person is: the same seed always gives the same look, close up or far away. */
  seed: number;
}

interface RealSlot {
  avatar: Avatar | null;
  ped: number;
  seed: number;
  look: Look;
  /** Being dressed as somebody else: not available until it is done. */
  busy: boolean;
  /** Was out in the street since it was last repainted. */
  dirty: boolean;
}

/**
 * Street life: people walking round the blocks along the pavements. Everybody is a seeded person (`npcLookFromSeed`). Far from the
 * player they are the crowd: a few instanced meshes in which every person has their own skin, clothes, hair, height and build (see
 * crowd.ts), so seventy people cost about four draw calls. The few nearest the player are real characters, taken from a small pool;
 * when one comes back to the pool it is dressed as somebody new, out of sight, so over time the city shows many more faces than
 * the pool holds. The person who takes a real body keeps that body's look when they step back into the crowd.
 */
export class Pedestrians {
  readonly root = new THREE.Group();
  private readonly peds: Ped[] = [];
  private crowd: Crowd | null = null;
  private time = 0;
  private sinceRestyle = 0;
  private readonly real: RealSlot[] = [];

  constructor(private readonly terrain: LagosTerrain, private readonly count = 40, manifest?: AssetManifest, realCount = 0) {
    for (let i = 0; i < count; i++) this.peds.push({ x: -1e6, z: -1e6, heading: Math.random() * Math.PI * 2, speed: WALK_SPEED * (0.8 + Math.random() * 0.5), phase: Math.random() * 6, seed: newSeed() });
    void Crowd.load(count).then((c) => {
      if (this.disposed) return c.dispose();
      this.crowd = c;
      this.root.add(c.root);
      this.peds.forEach((p, i) => {
        c.setPerson(i, crowdLookOf(npcLookFromSeed(p.seed)));
        c.setGait(i, p.speed, p.phase);
      });
    });
    if (manifest) void this.loadReal(manifest, realCount);
  }

  private disposed = false;

  /** One at a time, so a crowd does not freeze the game while it loads. */
  private async loadReal(manifest: AssetManifest, n: number): Promise<void> {
    for (let i = 0; i < n && !this.disposed; i++) {
      const seed = newSeed();
      const look = npcLookFromSeed(seed);
      const avatar = new Avatar(manifest, look);
      try {
        await avatar.load();
      } catch {
        continue;
      }
      if (this.disposed) {
        avatar.dispose();
        return;
      }
      avatar.root.visible = false;
      this.root.add(avatar.root);
      avatar.play("Walk_Loop", 0);
      this.real.push({ avatar, ped: -1, seed, look, busy: false, dirty: false });
    }
  }

  /** A real character has gone back to the pool: repaint it (and now and then restyle one piece) while nobody is looking. */
  private redress(slot: RealSlot): void {
    const avatar = slot.avatar;
    if (!avatar || slot.busy) return;
    slot.busy = true;
    const seed = newSeed();
    let next = recolourLook(slot.look, seed);
    if (this.sinceRestyle > RESTYLE_EVERY) {
      this.sinceRestyle = 0;
      next = restyleLook(next, seed + 1);
    }
    void avatar
      .setLook(diffLook(slot.look, next))
      .then(() => {
        slot.seed = seed;
        slot.look = next;
      })
      .catch(() => undefined)
      .finally(() => {
        slot.busy = false;
      });
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
    this.sinceRestyle += dt;
    const crowd = this.crowd;
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
      const mine = this.real.find((r) => r.ped === i);
      if (mine && far > REAL_RANGE * 1.25) mine.ped = -1;
      else if (!mine && far < REAL_RANGE) {
        const free = this.real.find((r) => r.avatar && r.ped === -1 && !r.busy);
        if (free) {
          free.ped = i;
          free.dirty = true;
          // this person is now whoever the real body is, and stays so when they walk back into the crowd
          p.seed = free.seed;
          crowd?.setPerson(i, crowdLookOf(free.look));
        }
      }
      const realNow = this.real.find((r) => r.ped === i && r.avatar);
      if (realNow) {
        const a = realNow.avatar!;
        a.root.visible = true;
        a.root.position.set(p.x, 0, p.z);
        a.root.rotation.y = p.heading;
        a.update(dt);
      }
      const level: CrowdLevel = realNow || far >= SHOW_RANGE || i >= this.peds.length * this.shown ? 0 : far < MID_RANGE ? 1 : 2;
      crowd?.place(i, p.x, p.z, p.heading, level);
    });
    for (const r of this.real) {
      if (r.ped === -1 && r.avatar) {
        r.avatar.root.visible = false;
        if (!r.busy && r.dirty) {
          r.dirty = false;
          this.redress(r);
        }
      }
    }
    crowd?.update(dt);
  }

  /** Triangles the crowd is drawing now, for the budget readout. */
  crowdTriangles(): number {
    return this.crowd?.drawnTriangles() ?? 0;
  }

  dispose(): void {
    this.disposed = true;
    for (const r of this.real) r.avatar?.dispose();
    this.root.removeFromParent();
    this.crowd?.dispose();
  }
}
