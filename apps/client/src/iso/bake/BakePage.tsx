import { useEffect } from "react";
import * as THREE from "three";
import { FURNITURE } from "@thelife/game-core";
import { loadManifest } from "../../lab/manifest";
import { createFurniture } from "../../furniture/instance";
import { Avatar } from "../../lab/avatar";
import { DEFAULT_LOOK, loadSavedLook } from "../../lab/looks";
import { shoot, toSprite, toonify, type Sprite } from "./bake";

// A page for the sprite baker (tools/sprites/bake.mjs drives it in a headless browser). It exposes two functions on window.

const DIRS = 8;

declare global {
  interface Window {
    __bake?: {
      ready: boolean;
      props(ids: string[], onSprite?: (s: Sprite) => void): Promise<(Sprite & { size: [number, number, number] })[]>;
      character(only?: string[], look?: Partial<typeof DEFAULT_LOOK>, onSprite?: (s: CharSprite) => void): Promise<CharSprite[]>;
      furnitureIds(): string[];
    };
  }
}

export interface CharSprite extends Sprite {
  clip: string;
  dir: number;
  frame: number;
  frames: number;
}

export default function BakePage() {
  useEffect(() => {
    let manifest: Awaited<ReturnType<typeof loadManifest>> | null = null;
    const api: NonNullable<Window["__bake"]> = {
      ready: false,
      furnitureIds: () => FURNITURE.map((f) => f.id),
      async props(ids, onSprite) {
        manifest ??= await loadManifest();
        const out: (Sprite & { size: [number, number, number] })[] = [];
        for (const id of ids) {
          for (let rot = 0; rot < 4; rot++) {
            const inst = await createFurniture(id, manifest);
            const g = new THREE.Group();
            g.add(inst.object);
            g.rotation.y = (rot * Math.PI) / 2;
            toonify(g);
            const shot = shoot(g);
            if (!shot) continue;
            const s = { ...toSprite(id, rot, shot), size: [inst.size.x, inst.size.y, inst.size.z] as [number, number, number] };
            out.push(s);
            onSprite?.(s);
          }
        }
        return out;
      },
      async character(only, look, onSprite) {
        manifest ??= await loadManifest();
        const avatar = new Avatar(manifest, { ...loadSavedLook(), ...DEFAULT_LOOK, ...(look ?? {}) });
        await avatar.load();
        toonify(avatar.root);
        const out: CharSprite[] = [];
        const all = [0, 1, 2, 3, 4, 5, 6, 7];
        const four = [0, 2, 4, 6];
        const clips: { name: string; frames: number; dirs: number[] }[] = [
          { name: "Idle_Loop", frames: 1, dirs: all },
          { name: "Walk_Loop", frames: 8, dirs: all },
          { name: "Jog_Fwd_Loop", frames: 8, dirs: all },
          { name: "Sitting_Idle_Loop", frames: 6, dirs: all },
          { name: "Life_Cook_Loop", frames: 8, dirs: all },
          { name: "Life_Eat_Loop", frames: 8, dirs: all },
          { name: "Life_Type_Loop", frames: 8, dirs: all },
          { name: "Life_Read_Loop", frames: 6, dirs: all },
          { name: "Life_Brush_Loop", frames: 8, dirs: all },
          { name: "Life_Wash_Loop", frames: 8, dirs: all },
          { name: "Life_Sleep_Loop", frames: 6, dirs: four },
          { name: "Life_Eat_Standing_Loop", frames: 8, dirs: all },
        ].filter((c) => !only || only.includes(c.name));
        for (const c of clips) {
          for (const dir of c.dirs) {
            avatar.root.rotation.y = (dir * Math.PI * 2) / DIRS;
            avatar.play(c.name, 0);
            const dur = avatar.clipDuration(c.name) || 1;
            avatar.update(0.0001);
            for (let f = 0; f < c.frames; f++) {
              avatar.stop();
              avatar.play(c.name, 0);
              avatar.update(c.frames === 1 ? 0.05 : (f / c.frames) * dur + 0.0001);
              const holder = new THREE.Group();
              holder.add(avatar.root);
              const shot = shoot(holder);
              holder.remove(avatar.root);
              if (!shot) continue;
              const s: CharSprite = { ...toSprite("char", dir, shot), clip: c.name, dir, frame: f, frames: c.frames };
              out.push(s);
              onSprite?.(s);
            }
          }
        }
        return out;
      },
    };
    api.ready = true;
    window.__bake = api;
    return () => {
      delete window.__bake;
    };
  }, []);
  return <div style={{ padding: 16, color: "#fff" }}>Sprite baker. Run tools/sprites/bake.mjs.</div>;
}
