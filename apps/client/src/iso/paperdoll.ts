import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES, sexOf, type Look } from "../lab/looks";
import { fabricCanvas, type FabricId } from "../lab/procedural/fabrics";
import type { CharFrame, CharProvider } from "./charProvider";
import { spriteSharp } from "./assets";

// The character as paper dolls: the body, face, clothes, hair and accessories are separate sheets of pictures, drawn ahead of time
// (tools/sprites). Here they are coloured and stacked into whole-person frames, in whatever mix the player chose. No 3D, and a new
// look is ready the moment its pictures have loaded.

type Cell = [dir: number, frame: number, x: number, y: number, w: number, h: number, ax: number, ay: number];
interface SheetMeta {
  width: number;
  height: number;
  cells: Cell[];
}
type VariantIndex = Record<string, SheetMeta>;

const BASE = `${import.meta.env.BASE_URL}sprites/char2/`;
/** Flipping a picture left to right: with the camera at the south-east, 0 and 2 swap, 3 and 7 swap, 4 and 6 swap (1 and 5 are their own). */
const MIRROR: Record<number, number> = { 2: 0, 6: 4, 7: 3 };

const indexCache = new Map<string, Promise<VariantIndex | null>>();
const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadIndex(body: string, key: string): Promise<VariantIndex | null> {
  const k = `${body}/${key}`;
  let p = indexCache.get(k);
  if (!p) {
    p = fetch(`${BASE}${k}/index.json`).then((r) => (r.ok ? (r.json() as Promise<VariantIndex>) : null), () => null);
    indexCache.set(k, p);
  }
  return p;
}
function loadSheet(body: string, key: string, clip: string): Promise<HTMLImageElement | null> {
  const k = `${body}/${key}/${clip}.webp`;
  let p = imageCache.get(k);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = `${BASE}${k}`;
    });
    imageCache.set(k, p);
  }
  return p;
}

interface Layer {
  /** Folder name of this layer's pictures. */
  key: string;
  /** What colours it (a colour, or nothing for the face), and whether a fabric pattern shows on it. */
  tint: string | null;
  fabric?: FabricId;
}

/** The layers a look is made of, back to front. */
export function layersOf(look: Look): Layer[] {
  const skin = SKIN_TONES.find((t) => t.id === look.skinTone) ?? SKIN_TONES[0]!;
  const cloth = (id: string | null, d: string) => CLOTH_COLORS.find((c) => c.id === id)?.color ?? d;
  const hair = HAIR_COLORS.find((c) => c.id === look.hairColor)?.color ?? "#241d19";
  const out: Layer[] = [
    { key: "skin", tint: skin.base },
    { key: "details", tint: null },
  ];
  if (look.shoes) out.push({ key: `shoes.${look.shoes}`, tint: cloth(look.shoesColor, "#26262a") });
  if (look.bottom) out.push({ key: `bottom.${look.bottom}`, tint: cloth(look.bottomColor, "#b7a56f"), fabric: look.bottomFabric as FabricId });
  if (look.top) out.push({ key: `top.${look.top}`, tint: cloth(look.topColor, "#5a9bd8"), fabric: look.topFabric as FabricId });
  if (look.beard) out.push({ key: "facial.beard", tint: hair });
  if (look.hair && look.hair.startsWith("p_")) out.push({ key: `hair.${look.hair}`, tint: hair });
  if (look.accessory) out.push({ key: `accessory.${look.accessory}`, tint: look.accessory === "a_shades" || look.accessory === "a_hoops" || look.accessory === "a_chain" ? null : cloth(look.accessoryColor, "#26262a") });
  return out;
}

const tintCache = new Map<string, HTMLCanvasElement>();

/** A sheet coloured with a tint (multiplied in), optionally with a fabric pattern. */
function tinted(img: HTMLImageElement, id: string, tint: string | null, fabric?: FabricId): CanvasImageSource {
  if (!tint && (!fabric || fabric === "plain")) return img;
  const k = `${id}|${tint}|${fabric ?? ""}`;
  const hit = tintCache.get(k);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = "multiply";
  if (fabric && fabric !== "plain") {
    const pat = g.createPattern(fabricCanvas(fabric), "repeat");
    if (pat) {
      g.fillStyle = pat;
      g.fillRect(0, 0, c.width, c.height);
    }
  }
  if (tint) {
    g.fillStyle = tint;
    g.fillRect(0, 0, c.width, c.height);
  }
  // multiplying also coloured the empty parts: put the original shape back
  g.globalCompositeOperation = "destination-in";
  g.drawImage(img, 0, 0);
  tintCache.set(k, c);
  return c;
}

export class PaperDoll implements CharProvider {
  private frames = new Map<string, Map<number, CharFrame[]>>();
  private pending = new Map<string, Promise<void>>();
  private generation = 0;
  /** Called when something new has become ready (the creator redraws). */
  onChange?: () => void;

  constructor(public look: Look) {}

  private get body(): string {
    return sexOf(this.look.body) === "female" ? "realfemale" : "realmale";
  }

  async setLook(patch: Partial<Look>): Promise<void> {
    this.look = { ...this.look, ...patch };
    this.generation++;
    this.frames.clear();
    this.pending.clear();
    this.onChange?.();
  }

  shape(): { w: number; h: number } {
    return { w: this.look.build ?? 1, h: this.look.height ?? 1 };
  }
  ready(clip: string): boolean {
    return this.frames.has(clip);
  }
  dirs(clip: string): number[] {
    return [...(this.frames.get(clip)?.keys() ?? [])];
  }
  count(clip: string, dir: number): number {
    return this.frames.get(clip)?.get(dir)?.length ?? 0;
  }
  frame(clip: string, dir: number, idx: number): CharFrame | null {
    return this.frames.get(clip)?.get(dir)?.[idx] ?? null;
  }
  ensure(clip: string): void {
    void this.make(clip);
  }
  async prepare(clips: string[]): Promise<void> {
    await Promise.all(clips.map((c) => this.make(c)));
  }

  /** Loads every layer's pictures for an animation and stacks them into whole-person frames. */
  private make(clip: string): Promise<void> {
    const have = this.pending.get(clip);
    if (have) return have;
    const gen = this.generation;
    const body = this.body;
    const layers = layersOf(this.look);
    const job = (async () => {
      await spriteSharp();
      const parts = await Promise.all(
        layers.map(async (l) => {
          const index = await loadIndex(body, l.key);
          const meta = index?.[clip];
          if (!meta) return null;
          const img = await loadSheet(body, l.key, clip);
          return img ? { layer: l, meta, sheet: tinted(img, `${body}/${l.key}/${clip}`, l.tint, l.fabric) } : null;
        }),
      );
      if (gen !== this.generation) return;
      const present = parts.filter((p): p is NonNullable<typeof p> => !!p);
      if (!present.length) return;
      const byDir = new Map<number, CharFrame[]>();
      const baked = new Set<number>();
      for (const p of present) for (const c of p.meta.cells) baked.add(c[0]);
      const dirs = [0, 1, 2, 3, 4, 5, 6, 7].filter((d) => baked.has(d) || (MIRROR[d] !== undefined && baked.has(MIRROR[d]!)));
      for (const dir of dirs) {
        const flip = !baked.has(dir);
        const src = flip ? MIRROR[dir]! : dir;
        const nFrames = Math.max(...present.flatMap((p) => p.meta.cells.filter((c) => c[0] === src).map((c) => c[1] + 1)), 0);
        const list: CharFrame[] = [];
        for (let f = 0; f < nFrames; f++) {
          // each layer's cell for this frame, placed by where its origin is
          const cells = present.map((p) => ({ p, c: p.meta.cells.find((x) => x[0] === src && x[1] === f) })).filter((x): x is { p: (typeof present)[number]; c: Cell } => !!x.c);
          if (!cells.length) continue;
          const left = Math.max(...cells.map(({ c }) => (flip ? c[4] - c[6] : c[6])));
          const right = Math.max(...cells.map(({ c }) => (flip ? c[6] : c[4] - c[6])));
          const up = Math.max(...cells.map(({ c }) => c[7]));
          const down = Math.max(...cells.map(({ c }) => c[5] - c[7]));
          const canvas = document.createElement("canvas");
          canvas.width = left + right;
          canvas.height = up + down;
          const g = canvas.getContext("2d")!;
          for (const { p, c } of cells) {
            const [, , x, y, w, h, ax, ay] = c;
            if (flip) {
              g.save();
              g.translate(left, up - ay);
              g.scale(-1, 1);
              g.drawImage(p.sheet, x, y, w, h, -ax, 0, w, h);
              g.restore();
            } else {
              g.drawImage(p.sheet, x, y, w, h, left - ax, up - ay, w, h);
            }
          }
          list.push({ img: canvas, w: canvas.width, h: canvas.height, ax: left, ay: up });
        }
        if (list.length) byDir.set(dir, list);
      }
      this.frames.set(clip, byDir);
      this.onChange?.();
    })();
    this.pending.set(clip, job);
    return job;
  }
}
