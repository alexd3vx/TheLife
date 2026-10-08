import * as THREE from "three";
import type { PlaceView, ServerMessage } from "@thelife/shared";
import { Avatar } from "../lab/avatar";
import { resolveLook } from "../lab/character";
import { locomotionRate } from "../lab/locomotion";
import type { AssetManifest } from "../lab/manifest";
import { bubbleSprite, nameTag } from "../map/remotePlayers";
import { world } from "../net/world";

interface Mate {
  view: PlaceView;
  group: THREE.Group;
  avatar: Avatar | null;
  target: { x: number; z: number; yaw: number };
  clip: string;
  bubble: { sprite: THREE.Sprite; until: number } | null;
}

export interface PlaceChatLine {
  name: string;
  text: string;
  mine: boolean;
  at: number;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The other real people inside the same place. The server tells everyone in a place who is there (`here`) and where they all stand (`pstate`,
 * ten times a second); this draws them as their own characters with name tags, walking about, and shows what they say. It also tells the
 * server where this player stands. Everyone only ever sees the people in the same place: out in the street nobody sees you go in.
 */
export class PlaceMates {
  private readonly mates = new Map<string, Mate>();
  private readonly off: () => void;
  private sendAt = 0;
  private gone = false;
  private mine: Avatar;
  private myBubble: { sprite: THREE.Sprite; until: number } | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly manifest: AssetManifest,
    private readonly placeId: string,
    me: Avatar,
    private readonly events: { onCount(others: number): void; onChat(line: PlaceChatLine): void },
  ) {
    this.mine = me;
    this.off = world.onMessage((m) => this.onMessage(m));
    world.send({ t: "inside", place: placeId });
  }

  private get myId(): string | undefined {
    return world.lastWelcome?.id;
  }

  private onMessage(m: ServerMessage) {
    if (m.t === "here" && m.place === this.placeId) {
      const ids = new Set(m.players.filter((p) => p.id !== this.myId).map((p) => p.id));
      for (const [id, mate] of this.mates) {
        if (!ids.has(id)) {
          this.removeMate(mate);
          this.mates.delete(id);
        }
      }
      for (const p of m.players) if (p.id !== this.myId && !this.mates.has(p.id)) this.addMate(p);
      this.events.onCount(this.mates.size);
    } else if (m.t === "pstate" && m.place === this.placeId) {
      for (const p of m.players) {
        const mate = this.mates.get(p.id);
        if (mate) mate.target = { x: p.x, z: p.z, yaw: p.yaw };
        if (mate && p.clip !== mate.clip) {
          mate.clip = p.clip;
          mate.avatar?.play(p.clip, 0.2);
          mate.avatar?.setSpeed(locomotionRate(/Jog|Run/i.test(p.clip) ? 3.2 : /Walk/i.test(p.clip) ? 1.4 : 0, p.clip));
        }
      }
    } else if (m.t === "chat" && !m.to) {
      const mine = m.from === this.myId;
      this.events.onChat({ name: m.name, text: m.text, mine, at: m.at });
      const mate = this.mates.get(m.from);
      const holder = mine ? this.mine.root : mate?.group;
      if (!holder) return;
      const slot = mine ? this.myBubble : mate?.bubble;
      if (slot) {
        slot.sprite.removeFromParent();
        slot.sprite.material.map?.dispose();
        slot.sprite.material.dispose();
      }
      const sprite = bubbleSprite(m.text);
      sprite.position.y = 2.3;
      holder.add(sprite);
      const next = { sprite, until: performance.now() / 1000 + 4 + Math.min(5, m.text.length * 0.05) };
      if (mine) this.myBubble = next;
      else if (mate) mate.bubble = next;
    }
  }

  private addMate(view: PlaceView) {
    const group = new THREE.Group();
    group.position.set(view.x, 0, view.z);
    group.rotation.y = view.yaw;
    const tag = nameTag(view.name);
    tag.position.y = 2.0;
    group.add(tag);
    this.scene.add(group);
    const mate: Mate = { view, group, avatar: null, target: { x: view.x, z: view.z, yaw: view.yaw }, clip: view.clip, bubble: null };
    this.mates.set(view.id, mate);
    const avatar = new Avatar(this.manifest, resolveLook(view.look), { face: false });
    void avatar
      .load()
      .then(() => {
        if (this.gone || this.mates.get(view.id) !== mate) return avatar.dispose();
        avatar.play(mate.clip, 0);
        group.add(avatar.root);
        mate.avatar = avatar;
      })
      .catch(() => undefined);
  }

  private removeMate(mate: Mate) {
    mate.avatar?.dispose();
    mate.group.traverse((o) => {
      const sprite = o as THREE.Sprite;
      if (sprite.isSprite) {
        sprite.material.map?.dispose();
        sprite.material.dispose();
      }
    });
    mate.group.removeFromParent();
  }

  /** Call every frame. `mine` is where this player stands. */
  update(dt: number, mine: { x: number; z: number; yaw: number; clip: string }) {
    const k = 1 - Math.exp(-9 * dt);
    const now = performance.now() / 1000;
    for (const mate of this.mates.values()) {
      const g = mate.group;
      g.position.x += (mate.target.x - g.position.x) * k;
      g.position.z += (mate.target.z - g.position.z) * k;
      g.rotation.y += wrap(mate.target.yaw - g.rotation.y) * k;
      mate.avatar?.update(dt);
      if (mate.bubble && now > mate.bubble.until) {
        mate.bubble.sprite.removeFromParent();
        mate.bubble = null;
      }
    }
    if (this.myBubble && now > this.myBubble.until) {
      this.myBubble.sprite.removeFromParent();
      this.myBubble = null;
    }
    this.sendAt += dt;
    if (this.sendAt >= 0.12) {
      this.sendAt = 0;
      world.send({ t: "pmove", x: Math.round(mine.x * 100) / 100, z: Math.round(mine.z * 100) / 100, yaw: Math.round(mine.yaw * 100) / 100, clip: mine.clip });
    }
  }

  say(text: string) {
    world.send({ t: "chat", text });
  }

  dispose() {
    this.gone = true;
    this.off();
    world.send({ t: "inside", place: null });
    for (const mate of this.mates.values()) this.removeMate(mate);
    this.mates.clear();
    this.myBubble?.sprite.removeFromParent();
  }
}
