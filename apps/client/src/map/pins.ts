import * as THREE from "three";
import type { LandmarkKind } from "@thelife/game-core";

/** Map pin look for each named place: a colour and a symbol. Used by the 3D pins and the 2D map. */
export const PIN_STYLE: Record<LandmarkKind, { colour: string; glyph: string; label: string }> = {
  airport: { colour: "#2f7bff", glyph: "✈", label: "Airport" },
  police: { colour: "#2f5fa8", glyph: "★", label: "Police" },
  hospital: { colour: "#d9363e", glyph: "✚", label: "Hospital" },
  school: { colour: "#2f8a4f", glyph: "✎", label: "School" },
  church: { colour: "#8a5fd1", glyph: "✝", label: "Church" },
  mosque: { colour: "#1f8a86", glyph: "☪", label: "Mosque" },
  fire: { colour: "#e0592b", glyph: "♨", label: "Fire station" },
  bank: { colour: "#b58a1f", glyph: "₦", label: "Bank" },
  fuel: { colour: "#e0a82e", glyph: "⛽", label: "Fuel" },
  hotel: { colour: "#c0507a", glyph: "♛", label: "Hotel" },
  market: { colour: "#d97b2f", glyph: "🛒", label: "Market" },
};

const cache = new Map<string, THREE.CanvasTexture>();

/** A teardrop map marker with the place's symbol, drawn once per kind. */
export function pinTexture(kind: LandmarkKind): THREE.CanvasTexture {
  const hit = cache.get(kind);
  if (hit) return hit;
  const w = 96;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const style = PIN_STYLE[kind];
  const cx = w / 2;
  const r = 38;
  ctx.shadowColor = "rgba(0,0,0,.45)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.beginPath();
  ctx.arc(cx, r + 8, r, Math.PI * 0.82, Math.PI * 0.18, false);
  ctx.lineTo(cx, h - 6);
  ctx.closePath();
  ctx.fillStyle = style.colour;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, r + 8, r - 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = style.colour;
  ctx.font = "700 34px system-ui, 'Segoe UI Symbol', 'Noto Sans Symbols2', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(style.glyph, cx, r + 10);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  cache.set(kind, texture);
  return texture;
}
