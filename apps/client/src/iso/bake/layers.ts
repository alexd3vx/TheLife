import * as THREE from "three";
import { Avatar } from "../../lab/avatar";
import { DEFAULT_LOOK, type Look } from "../../lab/looks";
import type { AssetManifest } from "../../lab/manifest";
import { PROC_BOTTOMS, PROC_SHOES, PROC_TOPS } from "../../lab/procedural/garments";
import { PROC_HAIR } from "../../lab/procedural/hair";
import { ACCESSORIES } from "../../lab/procedural/accessories";
import { CHAR_AREA, shoot, toonify } from "./bake";

// Paper-doll baking: the 3D person is only a tool for drawing. Each body, garment, hairstyle and accessory is drawn on its own,
// from five directions (the other three are mirrors), in every animation, into sheets of small pictures. The game puts the layers
// together and colours them on the player's device; no 3D runs there.

export type BodyId = "realmale" | "realfemale";
export type LayerKind = "skin" | "details" | "top" | "bottom" | "shoes" | "hair" | "facial" | "accessory";

export interface LayerVariant {
  /** e.g. "top.p_tee" */
  key: string;
  kind: LayerKind;
  id: string;
}

/** What gets baked, per body. */
export function variantsFor(body: BodyId): LayerVariant[] {
  const out: LayerVariant[] = [{ key: "skin", kind: "skin", id: "skin" }, { key: "details", kind: "details", id: "details" }];
  for (const t of PROC_TOPS) out.push({ key: `top.${t.id}`, kind: "top", id: t.id });
  for (const t of PROC_BOTTOMS) out.push({ key: `bottom.${t.id}`, kind: "bottom", id: t.id });
  for (const t of PROC_SHOES) out.push({ key: `shoes.${t.id}`, kind: "shoes", id: t.id });
  for (const h of PROC_HAIR) out.push({ key: `hair.${h.id}`, kind: "hair", id: h.id });
  if (body === "realmale") out.push({ key: "facial.beard", kind: "facial", id: "beard" });
  for (const a of ACCESSORIES) out.push({ key: `accessory.${a.id}`, kind: "accessory", id: a.id });
  return out;
}

export interface BakeClip {
  name: string;
  frames: number;
  /** Directions drawn (0 south, 1 south-west, 2 west, 3 north-west, 4 north); 5 to 7 are mirrors of 3 to 1. */
  dirs: number[];
  once?: boolean;
}
const FIVE = [0, 1, 2, 3, 4];
export const BAKE_CLIPS: BakeClip[] = [
  { name: "Idle_Loop", frames: 4, dirs: FIVE },
  { name: "Walk_Loop", frames: 8, dirs: FIVE },
  { name: "Sitting_Enter", frames: 6, dirs: FIVE, once: true },
  { name: "Sitting_Exit", frames: 6, dirs: FIVE, once: true },
  { name: "Sitting_Idle_Loop", frames: 4, dirs: FIVE },
  { name: "Life_Cook_Loop", frames: 6, dirs: FIVE },
  { name: "Life_Eat_Loop", frames: 6, dirs: FIVE },
  { name: "Life_Sleep_Loop", frames: 4, dirs: [0, 2, 4] },
  { name: "Life_Type_Loop", frames: 6, dirs: FIVE },
  { name: "Life_Brush_Loop", frames: 6, dirs: FIVE },
  { name: "Life_Wash_Loop", frames: 6, dirs: FIVE },
  { name: "Life_Read_Loop", frames: 4, dirs: FIVE },
];

const WHITE = {
  topColor: "white", bottomColor: "white", shoesColor: "white", hairColor: "white", accessoryColor: "white",
  topFabric: "plain", bottomFabric: "plain",
};

export interface Cell {
  dir: number;
  frame: number;
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
}
export interface Sheet {
  image: string;
  width: number;
  height: number;
  cells: Cell[];
}

/** Packs small pictures into one sheet, in rows. */
function pack(items: { dir: number; frame: number; canvas: HTMLCanvasElement; ax: number; ay: number }[]): Sheet | null {
  if (!items.length) return null;
  const maxW = 1800;
  const sorted = [...items].sort((a, b) => b.canvas.height - a.canvas.height);
  let x = 0, y = 0, rowH = 0, width = 0;
  const cells: Cell[] = [];
  for (const it of sorted) {
    if (x + it.canvas.width > maxW) {
      x = 0;
      y += rowH + 1;
      rowH = 0;
    }
    cells.push({ dir: it.dir, frame: it.frame, x, y, w: it.canvas.width, h: it.canvas.height, ax: it.ax, ay: it.ay });
    x += it.canvas.width + 1;
    rowH = Math.max(rowH, it.canvas.height);
    width = Math.max(width, x);
  }
  const sheet = document.createElement("canvas");
  sheet.width = width;
  sheet.height = y + rowH;
  const c = sheet.getContext("2d")!;
  for (const cell of cells) {
    const it = sorted.find((s) => s.dir === cell.dir && s.frame === cell.frame)!;
    c.drawImage(it.canvas, cell.x, cell.y);
  }
  return { image: sheet.toDataURL("image/png"), width: sheet.width, height: sheet.height, cells };
}

export class LayerBaker {
  private avatar: Avatar | null = null;
  constructor(private readonly manifest: AssetManifest, private readonly body: BodyId) {}

  private baseLook(): Look {
    return { ...DEFAULT_LOOK, body: this.body, hair: null, beard: false, brows: null, top: null, bottom: null, shoes: null, accessory: null, hood: false, pauldrons: false, ...WHITE, height: 1, build: 1 };
  }

  async open(): Promise<void> {
    this.avatar = new Avatar(this.manifest, this.baseLook());
    await this.avatar.load();
  }

  dispose(): void {
    this.avatar?.dispose();
  }

  /** Draws one variant in the given animations and returns a sheet per animation. */
  async bake(v: LayerVariant, clips: BakeClip[], onSheet?: (clip: string, sheet: Sheet | null) => void): Promise<Record<string, Sheet | null>> {
    const avatar = this.avatar!;
    const patch: Partial<Look> = { ...this.baseLook() };
    if (v.kind === "top") patch.top = v.id;
    if (v.kind === "bottom") patch.bottom = v.id;
    if (v.kind === "shoes") patch.shoes = v.id;
    if (v.kind === "hair") patch.hair = v.id;
    if (v.kind === "facial") patch.beard = true;
    if (v.kind === "accessory") patch.accessory = v.id;
    if (v.kind === "details") patch.hairColor = "black";
    await avatar.setLook(patch);
    avatar.neutraliseForBaking();
    toonify(avatar.root, true);
    avatar.setBakeMode(v.kind === "skin" ? "skin" : v.kind === "details" ? "details" : "layer");
    const out: Record<string, Sheet | null> = {};
    for (const clip of clips) {
      const items: { dir: number; frame: number; canvas: HTMLCanvasElement; ax: number; ay: number }[] = [];
      for (const dir of clip.dirs) {
        avatar.root.rotation.y = (dir * Math.PI * 2) / 8;
        const dur = avatar.clipDuration(clip.name) || 1;
        for (let f = 0; f < clip.frames; f++) {
          avatar.stop();
          avatar.play(clip.name, 0);
          avatar.update(clip.frames === 1 ? 0.05 : ((clip.once ? f / (clip.frames - 1) : f / clip.frames) * dur) + 0.0001);
          const holder = new THREE.Group();
          holder.add(avatar.root);
          const shot = shoot(holder, CHAR_AREA);
          holder.remove(avatar.root);
          if (shot) items.push({ dir, frame: f, canvas: shot.canvas, ax: shot.ax, ay: shot.ay });
        }
      }
      const sheet = pack(items);
      out[clip.name] = sheet;
      onSheet?.(clip.name, sheet);
    }
    return out;
  }
}
