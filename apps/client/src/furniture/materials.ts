import * as THREE from "three";

// Realistic-looking materials made in code (no downloads): grain and weave come from small canvas textures.

function canvas(size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const el = document.createElement("canvas");
  el.width = el.height = size;
  const ctx = el.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  paint(ctx, size);
  const texture = new THREE.CanvasTexture(el);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const cache = new Map<string, THREE.Material>();

function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let material = cache.get(key) as T | undefined;
  if (!material) {
    material = make();
    cache.set(key, material);
  }
  return material;
}

/** White appliance enamel. */
export const enamel = () =>
  cached("enamel", () => new THREE.MeshPhysicalMaterial({ color: "#f3f4f2", roughness: 0.32, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.25 }));

/** Brushed stainless steel. */
export const steel = () => cached("steel", () => new THREE.MeshStandardMaterial({ color: "#c9ced4", roughness: 0.38, metalness: 1 }));

export const chrome = () => cached("chrome", () => new THREE.MeshStandardMaterial({ color: "#e8ecef", roughness: 0.12, metalness: 1 }));

export const rubber = () => cached("rubber", () => new THREE.MeshStandardMaterial({ color: "#1b1c1e", roughness: 0.8 }));

export const ceramic = () =>
  cached("ceramic", () => new THREE.MeshPhysicalMaterial({ color: "#f8f8f6", roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 }));

export const glass = (opacity = 0.2) =>
  cached(`glass${opacity}`, () => new THREE.MeshPhysicalMaterial({ color: "#d8f0f4", roughness: 0.05, metalness: 0, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));

export function wood(tint = "#8a5a36", key = "wood"): THREE.MeshStandardMaterial {
  return cached(`${key}${tint}`, () => {
    const map = canvas(512, (ctx, size) => {
      const r = rng(7);
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 160; i++) {
        const y = r() * size;
        ctx.strokeStyle = `rgba(${r() < 0.5 ? "40,20,5" : "255,230,200"},${0.04 + r() * 0.1})`;
        ctx.lineWidth = 1 + r() * 2.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(size * 0.3, y + (r() - 0.5) * 14, size * 0.7, y + (r() - 0.5) * 14, size, y + (r() - 0.5) * 6);
        ctx.stroke();
      }
    });
    return new THREE.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0 });
  });
}

/** Painted wood or laminate (a solid colour with a faint grain). */
export function paint(color: string): THREE.MeshStandardMaterial {
  return cached(`paint${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0 }));
}

export const granite = () =>
  cached("granite", () => {
    const map = canvas(256, (ctx, size) => {
      const r = rng(3);
      ctx.fillStyle = "#34363a";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 2600; i++) {
        const v = 20 + r() * 150;
        ctx.fillStyle = `rgba(${v},${v},${v + 8},${0.2 + r() * 0.5})`;
        ctx.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2);
      }
    });
    return new THREE.MeshStandardMaterial({ map, roughness: 0.28, metalness: 0.05 });
  });

/** Soft woven cloth in any colour (bedding, upholstery). */
export function fabric(color: string): THREE.MeshStandardMaterial {
  return cached(`fabric${color}`, () => {
    const map = canvas(128, (ctx, size) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      const r = rng(11);
      for (let i = 0; i < size; i += 2) {
        ctx.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`;
        ctx.fillRect(i, 0, 1, size);
        ctx.fillRect(0, i, size, 1);
      }
    });
    map.repeat.set(3, 3);
    return new THREE.MeshStandardMaterial({ color, map, roughness: 0.92 });
  });
}

/** Bold wax-print pattern (ankara-style) for rugs and duvets. */
export function ankara(a = "#c4543f", b = "#1f6f66", c = "#f1d9a6"): THREE.MeshStandardMaterial {
  return cached(`ankara${a}${b}${c}`, () => {
    const map = canvas(512, (ctx, size) => {
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, size, size);
      const cell = size / 4;
      for (let gx = 0; gx < 4; gx++) {
        for (let gy = 0; gy < 4; gy++) {
          const cx = gx * cell + cell / 2 + (gy % 2 ? cell / 2 : 0);
          const cy = gy * cell + cell / 2;
          for (const dx of [0, -size, size]) {
            const colours = [a, c, b, c, a];
            [cell * 0.46, cell * 0.38, cell * 0.3, cell * 0.2, cell * 0.1].forEach((radius, i) => {
              ctx.fillStyle = colours[i]!;
              ctx.beginPath();
              ctx.arc(cx + dx, cy, radius, 0, Math.PI * 2);
              ctx.fill();
            });
          }
        }
      }
    });
    return new THREE.MeshStandardMaterial({ map, roughness: 0.9 });
  });
}

export const coir = () =>
  cached("coir", () => {
    const map = canvas(256, (ctx, size) => {
      const r = rng(5);
      ctx.fillStyle = "#8b6a43";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 2400; i++) {
        ctx.strokeStyle = `rgba(${40 + r() * 80},${25 + r() * 50},10,${0.25 + r() * 0.4})`;
        ctx.beginPath();
        const x = r() * size;
        const y = r() * size;
        ctx.moveTo(x, y);
        ctx.lineTo(x + (r() - 0.5) * 18, y + (r() - 0.5) * 18);
        ctx.stroke();
      }
    });
    return new THREE.MeshStandardMaterial({ map, roughness: 1 });
  });

/** A glowing screen/lamp surface. */
export function emissive(color: string, intensity = 1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: "#111", emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.4 });
}
