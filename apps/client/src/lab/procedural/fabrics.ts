import * as THREE from "three";

// Greyscale, tileable fabric patterns. The game tints them with the chosen garment colour,
// so a single "ankara" pattern becomes indigo, orange, green and so on.

export type FabricId = "plain" | "stripes" | "ankara" | "denim" | "adire" | "cotton" | "poplin" | "linen" | "knit" | "fleece" | "wool" | "satin" | "suiting" | "towel" | "pique" | "brocade" | "check";

/** What the wearer can choose. "Natural" is whatever the garment is normally made of; the real fabric pictures are in cloth.ts. */
export const FABRICS: { id: FabricId; label: string }[] = [
  { id: "plain", label: "Natural" },
  { id: "linen", label: "Linen" },
  { id: "denim", label: "Denim" },
  { id: "knit", label: "Knit" },
  { id: "wool", label: "Tweed" },
  { id: "satin", label: "Satin" },
  { id: "suiting", label: "Suiting" },
  { id: "brocade", label: "Brocade" },
  { id: "check", label: "Check" },
  { id: "stripes", label: "Stripes" },
  { id: "ankara", label: "Ankara print" },
  { id: "adire", label: "Adire" },
];

function canvas(size: number) {
  const el = document.createElement("canvas");
  el.width = el.height = size;
  const ctx = el.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  return { el, ctx };
}

function noise(ctx: CanvasRenderingContext2D, size: number, count: number, alpha: number, seed: number) {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    const v = rand() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rand()})`;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
  }
}

function drawPlain(size: number) {
  const { el, ctx } = canvas(size);
  ctx.fillStyle = "#f2f2f2";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(0,0,0,0.06)";
  for (let i = 0; i < size; i += 3) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  noise(ctx, size, 1500, 0.07, 7);
  return el;
}

function drawStripes(size: number) {
  const { el, ctx } = canvas(size);
  const band = size / 8;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? "#cfcfcf" : "#fafafa";
    ctx.fillRect(0, i * band, size, band);
  }
  noise(ctx, size, 1500, 0.06, 11);
  return el;
}

function drawDenim(size: number) {
  const { el, ctx } = canvas(size);
  ctx.fillStyle = "#dcdcdc";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(0,0,0,0.13)";
  ctx.lineWidth = 1.4;
  for (let i = -size; i < size * 2; i += 4) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }
  noise(ctx, size, 4000, 0.18, 21);
  return el;
}

/** Wax-print style: ringed medallions on a lattice with small leaves, in three tones. */
function drawAnkara(size: number) {
  const { el, ctx } = canvas(size);
  ctx.fillStyle = "#f4f4f4";
  ctx.fillRect(0, 0, size, size);
  const cell = size / 2;
  for (let gx = 0; gx < 2; gx++) {
    for (let gy = 0; gy < 2; gy++) {
      const cx = gx * cell + cell / 2 + (gy % 2 ? cell / 2 : 0);
      const cy = gy * cell + cell / 2;
      for (const dx of [0, -size, size]) {
        const x = cx + dx;
        const rings: [number, string][] = [
          [cell * 0.46, "#6a6a6a"],
          [cell * 0.38, "#f4f4f4"],
          [cell * 0.31, "#2e2e2e"],
          [cell * 0.22, "#d9d9d9"],
          [cell * 0.13, "#555555"],
          [cell * 0.05, "#fafafa"],
        ];
        for (const [r, colour] of rings) {
          ctx.fillStyle = colour;
          ctx.beginPath();
          ctx.arc(x, cy, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#3a3a3a";
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * cell * 0.42, cy + Math.sin(a) * cell * 0.42, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  // Leaves between the medallions.
  ctx.fillStyle = "#4a4a4a";
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      ctx.save();
      ctx.translate(i * (size / 4) + size / 8, j * (size / 4) + size / 8);
      ctx.rotate(((i + j) % 2 ? 1 : -1) * 0.7);
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  noise(ctx, size, 1200, 0.05, 31);
  return el;
}

const cache = new Map<FabricId, THREE.CanvasTexture>();

/** The raw tileable pattern (a plain canvas), for the 2D game. */
export function fabricCanvas(id: FabricId): HTMLCanvasElement {
  const size = id === "ankara" ? 256 : 128;
  return id === "stripes" ? drawStripes(size) : id === "ankara" ? drawAnkara(size) : id === "denim" ? drawDenim(size) : drawPlain(size);
}

export function fabricTexture(id: FabricId): THREE.CanvasTexture {
  let texture = cache.get(id);
  if (!texture) {
    const size = id === "ankara" ? 256 : 128;
    const source = id === "stripes" ? drawStripes(size) : id === "ankara" ? drawAnkara(size) : id === "denim" ? drawDenim(size) : drawPlain(size);
    texture = new THREE.CanvasTexture(source);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    cache.set(id, texture);
  }
  return texture;
}
