import * as THREE from "three";
import type { Rng } from "./rng";

// All textures are painted procedurally on small canvases, so the first screen
// needs no image downloads.

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function speckle(ctx: CanvasRenderingContext2D, size: number, rng: Rng, count: number, alpha: number) {
  for (let i = 0; i < count; i++) {
    const v = rng.chance(0.5) ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${rng.range(alpha * 0.3, alpha)})`;
    ctx.fillRect(rng.range(0, size), rng.range(0, size), rng.range(1, 3), rng.range(1, 3));
  }
}

export interface FacadeTextures {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

export const FACADE_COLS = 4;
export const FACADE_ROWS = 4;

/** One tile = 4 window bays x 4 floors. Lit windows go into a separate emissive map. */
export function makeFacade(rng: Rng, wall: string, litChance: number): FacadeTextures {
  const size = 512;
  const cell = size / FACADE_COLS;
  const base = makeCanvas(size, size);
  const glow = makeCanvas(size, size);
  const bump = makeCanvas(size, size);

  base.ctx.fillStyle = wall;
  base.ctx.fillRect(0, 0, size, size);
  speckle(base.ctx, size, rng, 5000, 0.07);
  glow.ctx.fillStyle = "#000";
  glow.ctx.fillRect(0, 0, size, size);
  bump.ctx.fillStyle = "#b4b4b4";
  bump.ctx.fillRect(0, 0, size, size);

  // Rain streaks running down the wall.
  for (let i = 0; i < 18; i++) {
    const x = rng.range(0, size);
    const streak = base.ctx.createLinearGradient(0, 0, 0, size);
    streak.addColorStop(0, "rgba(40,30,20,0)");
    streak.addColorStop(0.5, `rgba(40,30,20,${rng.range(0.03, 0.09)})`);
    streak.addColorStop(1, "rgba(40,30,20,0)");
    base.ctx.fillStyle = streak;
    base.ctx.fillRect(x, 0, rng.range(4, 14), size);
  }

  for (let row = 0; row < FACADE_ROWS; row++) {
    // Floor slab between storeys.
    base.ctx.fillStyle = "rgba(0,0,0,0.14)";
    base.ctx.fillRect(0, row * cell + cell - 8, size, 8);
    bump.ctx.fillStyle = "#e0e0e0";
    bump.ctx.fillRect(0, row * cell + cell - 8, size, 8);

    for (let col = 0; col < FACADE_COLS; col++) {
      const x = col * cell + 28;
      const y = row * cell + 20;
      const w = cell - 56;
      const h = cell - 50;
      const lit = rng.chance(litChance);

      base.ctx.fillStyle = "rgba(0,0,0,0.35)";
      base.ctx.fillRect(x - 4, y - 4, w + 8, h + 8);

      const glass = base.ctx.createLinearGradient(x, y, x + w, y + h);
      if (lit) {
        glass.addColorStop(0, "#ffd89a");
        glass.addColorStop(1, "#f2a24f");
      } else {
        glass.addColorStop(0, "#27384a");
        glass.addColorStop(0.55, "#4d6378");
        glass.addColorStop(1, "#1d2a38");
      }
      base.ctx.fillStyle = glass;
      base.ctx.fillRect(x, y, w, h);

      if (!lit) {
        base.ctx.fillStyle = "rgba(255,255,255,0.13)";
        base.ctx.beginPath();
        base.ctx.moveTo(x, y + h * 0.55);
        base.ctx.lineTo(x + w * 0.6, y);
        base.ctx.lineTo(x + w, y);
        base.ctx.lineTo(x, y + h);
        base.ctx.fill();
      }

      if (rng.chance(0.5)) {
        base.ctx.fillStyle = rng.pick(["#c4543f", "#e8d8b8", "#4f7f6a", "#caa04a"]);
        base.ctx.globalAlpha = 0.55;
        base.ctx.fillRect(x, y, w, h * rng.range(0.3, 0.7));
        base.ctx.globalAlpha = 1;
      }

      base.ctx.fillStyle = "rgba(20,20,20,0.7)";
      base.ctx.fillRect(x + w / 2 - 1.5, y, 3, h);
      base.ctx.fillStyle = "rgba(255,255,255,0.35)";
      base.ctx.fillRect(x - 6, y + h + 3, w + 12, 5);

      if (rng.chance(0.12)) {
        base.ctx.fillStyle = "#d7d9d6";
        base.ctx.fillRect(x + w + 4, y + 10, 14, 24);
        base.ctx.fillStyle = "#6b6e6c";
        base.ctx.fillRect(x + w + 6, y + 14, 10, 4);
      }

      if (rng.chance(0.18)) {
        base.ctx.strokeStyle = "#1a1a1a";
        base.ctx.lineWidth = 2;
        base.ctx.beginPath();
        for (let bar = 0; bar <= 6; bar++) {
          base.ctx.moveTo(x - 6 + bar * ((w + 12) / 6), y + h - 22);
          base.ctx.lineTo(x - 6 + bar * ((w + 12) / 6), y + h + 6);
        }
        base.ctx.moveTo(x - 6, y + h - 22);
        base.ctx.lineTo(x + w + 6, y + h - 22);
        base.ctx.stroke();
      }

      if (lit) {
        glow.ctx.fillStyle = "#ffb35e";
        glow.ctx.fillRect(x, y, w, h);
      }
      bump.ctx.fillStyle = "#3c3c3c";
      bump.ctx.fillRect(x, y, w, h);
      bump.ctx.fillStyle = "#f0f0f0";
      bump.ctx.fillRect(x - 6, y + h + 3, w + 12, 5);
    }
  }

  return {
    map: toTexture(base.canvas),
    emissiveMap: toTexture(glow.canvas),
    bumpMap: toTexture(bump.canvas, false),
  };
}

export function makeRoadTexture(rng: Rng): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = "#42454b";
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, rng, 9000, 0.09);

  for (const lane of [0.3, 0.7]) {
    const wear = ctx.createLinearGradient(0, size * (lane - 0.07), 0, size * (lane + 0.07));
    wear.addColorStop(0, "rgba(0,0,0,0)");
    wear.addColorStop(0.5, "rgba(0,0,0,0.22)");
    wear.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = wear;
    ctx.fillRect(0, size * (lane - 0.07), size, size * 0.14);
  }

  ctx.fillStyle = "rgba(235,225,180,0.9)";
  ctx.fillRect(0, size / 2 - 4, size / 2, 8);
  ctx.fillStyle = "rgba(240,240,240,0.65)";
  ctx.fillRect(0, 20, size, 6);
  ctx.fillRect(0, size - 26, size, 6);

  ctx.strokeStyle = "rgba(10,10,10,0.5)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    let x = rng.range(0, size);
    let y = rng.range(0, size);
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += rng.range(-18, 18);
      y += rng.range(-18, 18);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return toTexture(canvas);
}

export function makeConcreteTexture(rng: Rng): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = "#a9a398";
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, rng, 3500, 0.12);
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  ctx.beginPath();
  ctx.moveTo(size / 2, 0);
  ctx.lineTo(size / 2, size);
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size, size / 2);
  ctx.stroke();
  return toTexture(canvas);
}

export function makeGroundTexture(rng: Rng): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = "#7c5a42";
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, rng, 9000, 0.12);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${rng.int(70, 100)},${rng.int(100, 130)},50,${rng.range(0.08, 0.2)})`;
    ctx.beginPath();
    ctx.ellipse(rng.range(0, size), rng.range(0, size), rng.range(16, 60), rng.range(10, 36), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(canvas);
}

export function makeCorrugatedTexture(color: string, rng: Rng): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 16) {
    const rib = ctx.createLinearGradient(x, 0, x + 16, 0);
    rib.addColorStop(0, "rgba(255,255,255,0.28)");
    rib.addColorStop(0.5, "rgba(0,0,0,0.05)");
    rib.addColorStop(1, "rgba(0,0,0,0.3)");
    ctx.fillStyle = rib;
    ctx.fillRect(x, 0, 16, size);
  }
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(120,60,30,${rng.range(0.08, 0.3)})`;
    ctx.fillRect(rng.range(0, size), rng.range(0, size), rng.range(2, 14), rng.range(2, 22));
  }
  return toTexture(canvas);
}

export function makeSignTexture(text: string, background: string, foreground: string): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(512, 128);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = foreground;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = foreground;
  ctx.font = "800 54px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 68, 470);
  const texture = toTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export function makeAwningTexture(a: string, b: string): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(128, 32);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? a : b;
    ctx.fillRect(i * 16, 0, 16, 32);
  }
  return toTexture(canvas);
}

export function makeBillboardTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(1024, 512);
  const bg = ctx.createLinearGradient(0, 0, 1024, 512);
  bg.addColorStop(0, "#1f6f66");
  bg.addColorStop(1, "#f2a43a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.arc(860, 120, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.font = "800 120px Inter, system-ui, sans-serif";
  ctx.fillText("YOUR AD", 70, 220);
  ctx.fillText("HERE", 70, 350);
  ctx.font = "500 40px Inter, system-ui, sans-serif";
  ctx.fillText("Reach the whole district.", 70, 430);
  const texture = toTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export function makeFrondTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 64);
  ctx.strokeStyle = "#3f6b2a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 32);
  ctx.lineTo(256, 32);
  ctx.stroke();
  for (let x = 10; x < 250; x += 7) {
    const length = 28 * (1 - x / 300);
    ctx.strokeStyle = x % 14 ? "#4f8a33" : "#3b7027";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, 32);
    ctx.lineTo(x + 14, 32 - length);
    ctx.moveTo(x, 32);
    ctx.lineTo(x + 14, 32 + length);
    ctx.stroke();
  }
  const texture = toTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export function makeGlowTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const texture = toTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
