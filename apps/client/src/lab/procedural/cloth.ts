import * as THREE from "three";
import { assetUrl } from "../manifest";
import { loadGltfTexture } from "../loaders";
import type { FabricId } from "./fabrics";

/**
 * What a garment is made of. Woven and knitted fabrics are real fabric scans (Poly Haven, CC0: tools/fabrics/build_fabrics.py), made
 * neutral so any colour can be put on them, with their own normal and roughness pictures so threads catch the light. Prints (ankara,
 * adire, stripes) are drawn here and laid over the weave of a plain cotton.
 */

type Weave = "cotton" | "poplin" | "linen" | "denim" | "knit" | "fleece" | "wool" | "satin" | "suiting" | "towel" | "pique" | "brocade" | "check";

/** What each garment is made of when the wearer picks "natural". */
const NATURAL: Record<string, Weave | "ankara"> = {
  p_tee: "cotton", p_tank: "knit", p_vest: "cotton", p_crop: "cotton", p_polo: "pique", p_long: "cotton", p_hoodie: "fleece", p_jersey: "knit",
  p_dress: "poplin", p_gown: "satin", p_kaftan: "linen", p_agbada: "brocade", p_buba: "poplin", p_senator: "linen", p_shirt: "poplin",
  p_blazer: "suiting", p_sweater: "knit", p_pyjama_top: "cotton", p_nightgown: "satin", p_towel: "towel",
  p_shorts: "cotton", p_capri: "poplin", p_trousers: "poplin", p_jeans: "denim", p_slacks: "suiting", p_palazzo: "linen",
  p_skirt: "poplin", p_longskirt: "satin", p_wrapper: "ankara", p_pyjama_bottom: "cotton",
  p_sneakers: "knit", p_slippers: "suiting", p_sandals: "suiting", p_boots: "suiting", p_formal: "suiting",
};

/** Tiles per metre: one tile of the picture covers about this much cloth. */
const TILE: Record<Weave, number> = { cotton: 12, poplin: 12, linen: 9, denim: 8, knit: 6, fleece: 5, wool: 3.5, satin: 6, suiting: 8, towel: 4, pique: 5, brocade: 3, check: 5 };
const SHEEN: Partial<Record<Weave, number>> = { satin: 0.3, brocade: 0.2 };
/** The base roughness is scaled by the roughness picture: how dull each cloth is. */
const ROUGH: Record<Weave, number> = { cotton: 1, poplin: 0.9, linen: 1, denim: 1, knit: 1, fleece: 1, wool: 1, satin: 0.7, suiting: 0.95, towel: 1, pique: 1, brocade: 0.8, check: 1 };

export interface ClothLook {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  /** Multiplies the map: the garment's colour for woven cloth, white for a print that carries its own colours. */
  tint: string | null;
  roughness: number;
  sheen: number;
  normalScale: number;
  repeat: number;
}

const weaveCache = new Map<Weave, Promise<[THREE.Texture, THREE.Texture, THREE.Texture]>>();

function loadWeave(w: Weave) {
  let p = weaveCache.get(w);
  if (!p) {
    p = Promise.all([
      loadGltfTexture(assetUrl(`fabrics/${w}_d.webp`)),
      loadGltfTexture(assetUrl(`fabrics/${w}_n.webp`), THREE.NoColorSpace),
      loadGltfTexture(assetUrl(`fabrics/${w}_r.webp`), THREE.NoColorSpace),
    ]).then((t) => {
      for (const x of t) x.wrapS = x.wrapT = THREE.RepeatWrapping;
      return t as [THREE.Texture, THREE.Texture, THREE.Texture];
    });
    weaveCache.set(w, p);
  }
  return p;
}

// ------------------------------------------------------------------ prints

function canvas(size: number) {
  const el = document.createElement("canvas");
  el.width = el.height = size;
  return { el, ctx: el.getContext("2d")! };
}

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

function palette(hex: string) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl, THREE.SRGBColorSpace);
  const css = (h: number, s: number, l: number) => `#${new THREE.Color().setHSL(((h % 1) + 1) % 1, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, l)), THREE.SRGBColorSpace).getHexString(THREE.SRGBColorSpace)}`;
  return {
    ground: hex,
    deep: css(hsl.h, Math.min(1, hsl.s + 0.1), hsl.l * 0.45),
    mid: css(hsl.h, hsl.s, Math.min(0.75, hsl.l * 1.25 + 0.05)),
    cream: "#f2e8cf",
    gold: "#e2a92b",
    accent: css(hsl.h + 0.5, 0.65, 0.45),
    accent2: css(hsl.h + 0.12, 0.7, 0.5),
  };
}

/** A wax-print: big ringed medallions with petals, fans of feathers between them, dotted lattice, and the fine cracks of wax-resist dye. */
function drawAnkara(hex: string): HTMLCanvasElement {
  const size = 512;
  const { el, ctx } = canvas(size);
  const p = palette(hex);
  ctx.fillStyle = p.ground;
  ctx.fillRect(0, 0, size, size);
  const half = size / 2;
  // dotted lattice
  ctx.fillStyle = p.deep;
  for (let x = 0; x <= size; x += 32) for (let y = 0; y <= size; y += 32) {
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const medallion = (cx: number, cy: number, r: number) => {
    const ring = (rad: number, fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    };
    ring(r, p.deep);
    ring(r * 0.92, p.gold);
    ring(r * 0.84, p.deep);
    // petals
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62);
      ctx.rotate(a);
      ctx.fillStyle = k % 2 ? p.cream : p.accent;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.22, r * 0.085, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ring(r * 0.42, p.cream);
    ring(r * 0.36, p.accent2);
    ring(r * 0.24, p.deep);
    ring(r * 0.13, p.gold);
    ring(r * 0.05, p.cream);
  };
  const fan = (cx: number, cy: number, r: number, rot: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    for (let k = 0; k < 6; k++) {
      ctx.strokeStyle = k % 2 ? p.cream : p.accent;
      ctx.lineWidth = r * 0.1;
      ctx.beginPath();
      ctx.arc(0, 0, r * (1 - k * 0.15), Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    ctx.restore();
  };
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
    medallion(half * 0.5 + dx, half * 0.5 + dy, half * 0.42);
    medallion(half * 1.5 + dx, half * 1.5 + dy, half * 0.42);
    fan(half * 1.5 + dx, half * 0.5 + dy + half * 0.2, half * 0.36, 0);
    fan(half * 0.5 + dx, half * 1.5 + dy + half * 0.2, half * 0.36, 0);
  }
  // the fine white cracks wax-resist dye leaves
  const rand = rng(17);
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 260; i++) {
    let x = rand() * size, y = rand() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (rand() - 0.5) * 22;
      y += (rand() - 0.5) * 22;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return el;
}

/** Adire (resist-dyed cloth): pale rings and stitched lattice reserved on a dark dye, the dye bleeding a little. Grey, so the colour tints it. */
function drawAdire(): HTMLCanvasElement {
  const size = 512;
  const { el, ctx } = canvas(size);
  ctx.fillStyle = "#6a6a6a";
  ctx.fillRect(0, 0, size, size);
  const rand = rng(23);
  ctx.filter = "blur(1.1px)";
  // pale tie rings
  for (let gx = 0; gx < 4; gx++) for (let gy = 0; gy < 4; gy++) {
    const cx = gx * 128 + 64 + (gy % 2 ? 64 : 0);
    const cy = gy * 128 + 64;
    for (const dx of [-size, 0, size]) {
      for (let r = 6; r < 56; r += 9) {
        ctx.strokeStyle = r % 18 < 9 ? "rgba(235,235,235,0.95)" : "rgba(40,40,40,0.55)";
        ctx.lineWidth = 4 + rand() * 2;
        ctx.beginPath();
        ctx.arc(cx + dx, cy, r + (rand() - 0.5) * 2.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  // stitched lines between the rings
  ctx.strokeStyle = "rgba(230,230,230,0.8)";
  ctx.lineWidth = 2.5;
  for (let y = 0; y <= size; y += 64) {
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // dye pooling
  for (let i = 0; i < 60; i++) {
    const g = ctx.createRadialGradient(rand() * size, rand() * size, 0, rand() * size, rand() * size, 40);
    g.addColorStop(0, "rgba(0,0,0,0.12)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.filter = "none";
  return el;
}

/** Woven stripes of unequal width, grey so the colour tints them. */
function drawStripes(): HTMLCanvasElement {
  const size = 512;
  const { el, ctx } = canvas(size);
  ctx.fillStyle = "#f4f4f4";
  ctx.fillRect(0, 0, size, size);
  const widths = [56, 10, 6, 10, 56, 10, 6, 10, 56, 10, 6, 10, 56, 10, 6, 10];
  let x = 0;
  const total = widths.reduce((a, b) => a + b, 0);
  const k = size / total;
  widths.forEach((w, i) => {
    ctx.fillStyle = i % 4 === 1 || i % 4 === 3 ? "#9a9a9a" : i % 4 === 2 ? "#4a4a4a" : "#f4f4f4";
    ctx.fillRect(x * k, 0, w * k, size);
    x += w;
  });
  return el;
}

const printCache = new Map<string, THREE.CanvasTexture>();
function printTexture(kind: "ankara" | "adire" | "stripes", hex: string): THREE.CanvasTexture {
  const key = kind === "ankara" ? `ankara|${hex.toLowerCase()}` : kind;
  let t = printCache.get(key);
  if (!t) {
    t = new THREE.CanvasTexture(kind === "ankara" ? drawAnkara(hex) : kind === "adire" ? drawAdire() : drawStripes());
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    printCache.set(key, t);
  }
  return t;
}

/** The look of a garment's cloth: its fabric (the wearer's choice, or the garment's own when "natural") in its colour. */
export async function clothFor(fabric: FabricId, garmentId: string, colourHex: string): Promise<ClothLook> {
  const natural = NATURAL[garmentId] ?? "cotton";
  const pick = fabric === "plain" ? natural : fabric;
  if (pick === "ankara" || pick === "adire" || pick === "stripes") {
    const [, n, r] = await loadWeave("poplin");
    const map = printTexture(pick, colourHex);
    map.repeat.set(1, 1);
    // the print is a big picture: one tile is about a third of a metre
    const repeat = (pick === "ankara" ? 4.2 : 3) / 3.2;
    return { map, normalMap: n, roughnessMap: r, tint: pick === "ankara" ? null : colourHex, roughness: 0.95, sheen: 0, normalScale: 0.8, repeat };
  }
  const weave = (pick in TILE ? pick : "cotton") as Weave;
  const [d, n, r] = await loadWeave(weave);
  return { map: d, normalMap: n, roughnessMap: r, tint: colourHex, roughness: ROUGH[weave], sheen: SHEEN[weave] ?? 0, normalScale: weave === "satin" ? 0.5 : 2.2, repeat: TILE[weave] / 3.2 };
}
