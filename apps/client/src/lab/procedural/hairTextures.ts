import * as THREE from "three";

function canvas(w: number, h: number) {
  const el = document.createElement("canvas");
  el.width = w;
  el.height = h;
  const ctx = el.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  return { el, ctx };
}

function finish(el: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(el);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Tight coils: tiny curled strokes, used as colour and as bump. */
function coils() {
  const size = 256;
  const { el, ctx } = canvas(size, size);
  ctx.fillStyle = "#6c6c6c";
  ctx.fillRect(0, 0, size, size);
  let s = 3;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 2600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 2 + rand() * 3.5;
    ctx.strokeStyle = rand() < 0.5 ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r, rand() * 6, rand() * 6 + 4);
    ctx.stroke();
  }
  return el;
}

/** Braid / twist texture: V-shaped plaits running along the strand (u along the strand). */
function strand() {
  const w = 64;
  const h = 128;
  const { el, ctx } = canvas(w, h);
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) {
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w / 2, y + 5);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y + 3);
    ctx.lineTo(w / 2, y + 8);
    ctx.lineTo(w, y + 3);
    ctx.stroke();
  }
  return el;
}

/** Wrapped cloth with a woven print. */
function wrap() {
  const size = 256;
  const { el, ctx } = canvas(size, size);
  ctx.fillStyle = "#f0f0f0";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size; i += 32) {
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, i, size, 6);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    for (let x = 0; x < size; x += 32) {
      ctx.beginPath();
      ctx.arc(x + 16, i + 20, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return el;
}

const cache = new Map<string, THREE.CanvasTexture>();

export function hairTexture(kind: "coils" | "strand" | "wrap", repeat: [number, number]): THREE.CanvasTexture {
  const key = `${kind}`;
  let texture = cache.get(key);
  if (!texture) {
    texture = finish(kind === "coils" ? coils() : kind === "strand" ? strand() : wrap(), true);
    cache.set(key, texture);
  }
  const copy = texture.clone();
  copy.needsUpdate = true;
  copy.repeat.set(...repeat);
  return copy;
}
