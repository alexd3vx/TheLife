import * as THREE from "three";

// The realistic bodies ship without photo textures, so skin gets a fine procedural surface: faint blotchy colour
// variation and a pore-scale normal map. Both repeat across the body's UV layout, so they only add detail; the skin
// colour itself comes from the chosen skin tone.

let cached: { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } | null = null;

function noiseField(size: number, cells: number, seed: number): Float32Array {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const lattice = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  // wrap the lattice so the texture tiles
  for (let i = 0; i <= cells; i++) {
    lattice[i * (cells + 1) + cells] = lattice[i * (cells + 1)]!;
    lattice[cells * (cells + 1) + i] = lattice[i]!;
  }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = lattice[y0 * (cells + 1) + x0]!;
      const b = lattice[y0 * (cells + 1) + x0 + 1]!;
      const c = lattice[(y0 + 1) * (cells + 1) + x0]!;
      const d = lattice[(y0 + 1) * (cells + 1) + x0 + 1]!;
      out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

export function skinTextures(): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  if (cached) return cached;
  const size = 512;
  const blotch = noiseField(size, 8, 11);
  const fine = noiseField(size, 128, 23);
  const mid = noiseField(size, 48, 37);

  const colour = document.createElement("canvas");
  colour.width = colour.height = size;
  const cctx = colour.getContext("2d")!;
  const cdata = cctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 0.93 + (blotch[i]! - 0.5) * 0.1 + (mid[i]! - 0.5) * 0.04;
    const r = Math.min(255, 255 * v * 1.02);
    cdata.data[i * 4] = r;
    cdata.data[i * 4 + 1] = 255 * v * 0.985;
    cdata.data[i * 4 + 2] = 255 * v * 0.96; // a touch warmer than neutral
    cdata.data[i * 4 + 3] = 255;
  }
  cctx.putImageData(cdata, 0, 0);

  const normal = document.createElement("canvas");
  normal.width = normal.height = size;
  const nctx = normal.getContext("2d")!;
  const ndata = nctx.createImageData(size, size);
  const height = (x: number, y: number) => {
    const i = ((y + size) % size) * size + ((x + size) % size);
    return fine[i]! * 0.7 + mid[i]! * 0.3;
  };
  const strength = 2.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (height(x + 1, y) - height(x - 1, y)) * strength;
      const dy = (height(x, y + 1) - height(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      ndata.data[i] = (-dx / len * 0.5 + 0.5) * 255;
      ndata.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      ndata.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      ndata.data[i + 3] = 255;
    }
  }
  nctx.putImageData(ndata, 0, 0);

  const make = (canvas: HTMLCanvasElement, srgb: boolean) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 3);
    texture.anisotropy = 4;
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return texture;
  };
  cached = { map: make(colour, true), normal: make(normal, false) };
  return cached;
}
