import * as THREE from "three";
import { BLOCK, MARKET, PARK, STREET, WATER, type District, type LagosTerrain } from "@thelife/game-core";
import { lampMaterial } from "./chunkBuilder";

// The ground of the Lagos map: water, streets, pavements, plazas, blocks and parks. The map is 3 by 4.5 km, so the ground is painted
// into textures instead of built from geometry: a whole-island picture for the distance, a 512 m window around the player at
// 1 m per pixel and a 128 m window at 0.25 m per pixel. A window is repainted a few rows per frame when the player nears its edge.

const PAINT = {
  asphalt: [66, 68, 73],
  asphaltWorn: [78, 80, 84],
  kerb: [196, 190, 176],
  sidewalk: [178, 172, 160],
  plaza: [190, 184, 170],
  block: [150, 144, 128],
  park: [96, 150, 70],
  market: [168, 130, 92],
  line: [226, 220, 190],
} as const;

const hash = (x: number, z: number) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

type RGB = readonly [number, number, number];

/** The colour of the ground at a point, with a little variation so it does not look printed. */
function colourAt(t: LagosTerrain, x: number, z: number, detail: number): RGB | null {
  const c = t.classAt(x, z);
  if (c === WATER) return null;
  const n = (hash(Math.floor(x / detail), Math.floor(z / detail)) - 0.5) * 14;
  const shade = (rgb: RGB, k = 1): RGB => [rgb[0] + n * k, rgb[1] + n * k, rgb[2] + n * k];
  if (c === PARK) return shade(PAINT.park, 1.4);
  if (c === MARKET) return shade(PAINT.market, 1.2);
  if (c === BLOCK) return shade(PAINT.block, 0.8);
  const kind = t.streetKind(x, z);
  if (kind === "plaza") {
    // Paving slabs: a faint grid every 2 m.
    const grid = Math.abs(((x / 2) % 1) - 0.5) > 0.47 || Math.abs(((z / 2) % 1) - 0.5) > 0.47;
    return shade(grid ? [168, 162, 150] : PAINT.plaza, 0.8);
  }
  if (kind === "sidewalk") {
    const d = t.edgeDistance(x, z);
    return d < 0.25 ? PAINT.kerb : shade(PAINT.sidewalk, 0.8);
  }
  // Asphalt, with a worn patch now and then and a light edge line where it meets the pavement.
  const d = t.edgeDistance(x, z);
  if (d < 2.0 && detail < 1) return PAINT.line;
  return shade(hash(Math.floor(x / 6), Math.floor(z / 6)) > 0.8 ? PAINT.asphaltWorn : PAINT.asphalt, 0.7);
}

interface Level {
  size: number;
  px: number;
  /** Where the painted window is centred (null = nothing painted yet). */
  cx: number | null;
  cz: number | null;
  mesh: THREE.Mesh;
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  work: HTMLCanvasElement;
  job: { cx: number; cz: number; row: number; image: ImageData } | null;
  y: number;
  /** Repaint when the player is further than this from the centre. */
  reach: number;
}

export interface Terrain {
  group: THREE.Group;
  update(px: number, pz: number, budgetMs?: number): void;
  setNight(on: boolean): void;
  setVisible(v: boolean): void;
  dispose(): void;
}

export function buildTerrain(d: District): Terrain {
  const t = d.terrain!;
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];

  // Water: one huge plane below everything, with a faint sheen.
  const waterMat = new THREE.MeshStandardMaterial({ color: "#3b86b6", roughness: 0.25, metalness: 0.1 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(40_000, 40_000), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(t.size.x / 2, -0.4, t.size.z / 2);
  water.receiveShadow = true;
  group.add(water);
  disposables.push(waterMat, water.geometry);

  const makeCanvas = (w: number, h: number) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };
  const texOf = (canvas: HTMLCanvasElement) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  };

  // The whole island, once, at 2 pixels per map cell: seen from far away or while the windows are still painting.
  {
    const S = 2;
    const w = t.width * S, h = t.height * S;
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(w, h);
    const buf = new Uint32Array(img.data.buffer);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const wx = ((x + 0.5) / S) * t.cell, wz = ((y + 0.5) / S) * t.cell;
        const rgb = colourAt(t, wx, wz, 6);
        buf[y * w + x] = rgb ? (255 << 24) | (clamp(rgb[2]) << 16) | (clamp(rgb[1]) << 8) | clamp(rgb[0]) : 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = texOf(canvas);
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: false, alphaTest: 0.5, roughness: 1 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(t.size.x, t.size.z), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(t.size.x / 2, -0.03, t.size.z / 2);
    mesh.receiveShadow = true;
    group.add(mesh);
    disposables.push(tex, mat, mesh.geometry);
  }

  const levels: Level[] = [
    { size: 640, px: 512, y: -0.015, reach: 120 },
    { size: 160, px: 512, y: -0.005, reach: 28 },
  ].map(({ size, px, y, reach }, i) => {
    const canvas = makeCanvas(px, px);
    const work = makeCanvas(px, px);
    const texture = texOf(canvas);
    const mat = new THREE.MeshStandardMaterial({ map: texture, transparent: true, alphaTest: 0.5, roughness: 1, polygonOffset: true, polygonOffsetFactor: -(i + 1), polygonOffsetUnits: -(i + 1) });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.receiveShadow = true;
    mesh.visible = false;
    group.add(mesh);
    disposables.push(texture, mat, mesh.geometry);
    return { size, px, cx: null, cz: null, mesh, texture, canvas, work, job: null, y, reach };
  });

  /** Paints some rows of the level's pending window; returns true when finished. */
  function paint(level: Level, ms: number): boolean {
    const job = level.job!;
    const end = performance.now() + ms;
    const mpp = level.size / level.px;
    const buf = new Uint32Array(job.image.data.buffer);
    const x0 = job.cx - level.size / 2, z0 = job.cz - level.size / 2;
    while (job.row < level.px) {
      const wz = z0 + (job.row + 0.5) * mpp;
      for (let x = 0; x < level.px; x++) {
        const rgb = colourAt(t, x0 + (x + 0.5) * mpp, wz, mpp < 0.6 ? 0.5 : 2);
        buf[job.row * level.px + x] = rgb ? (255 << 24) | (clamp(rgb[2]) << 16) | (clamp(rgb[1]) << 8) | clamp(rgb[0]) : 0;
      }
      job.row++;
      if (performance.now() > end) break;
    }
    return job.row >= level.px;
  }

  let night = false;
  function update(px: number, pz: number, budgetMs = 3.5) {
    let left = budgetMs;
    for (const level of levels) {
      const stale = level.cx === null || Math.hypot(px - level.cx, pz - level.cz!) > level.reach;
      if (stale && !level.job) {
        level.job = { cx: Math.round(px / 8) * 8, cz: Math.round(pz / 8) * 8, row: 0, image: new ImageData(level.px, level.px) };
      }
      if (level.job && left > 0) {
        const t0 = performance.now();
        const done = paint(level, left);
        left -= performance.now() - t0;
        if (done) {
          level.work.getContext("2d")!.putImageData(level.job.image, 0, 0);
          level.canvas.getContext("2d")!.clearRect(0, 0, level.px, level.px);
          level.canvas.getContext("2d")!.drawImage(level.work, 0, 0);
          level.texture.needsUpdate = true;
          level.cx = level.job.cx;
          level.cz = level.job.cz;
          level.mesh.position.set(level.cx, level.y, level.cz);
          level.mesh.visible = true;
          level.job = null;
        }
      }
    }
  }

  // Pools of light under the street lamps (night only), one draw call for all of them.
  const pool: number[] = [];
  const poolUv: number[] = [];
  for (const l of d.lamps) {
    const dx = l.facing === 3 ? -1.6 : l.facing === 1 ? 1.6 : 0;
    const dz = l.facing === 0 ? -1.6 : l.facing === 2 ? 1.6 : 0;
    const x = l.x + dx, z = l.z + dz, s = 8;
    pool.push(x - s, 0.05, z - s, x + s, 0.05, z - s, x + s, 0.05, z + s, x - s, 0.05, z - s, x + s, 0.05, z + s, x - s, 0.05, z + s);
    poolUv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  }
  const glow = (() => {
    const c = makeCanvas(64, 64);
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,214,140,0.9)");
    grad.addColorStop(1, "rgba(255,214,140,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const poolMaterial = new THREE.MeshBasicMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false, side: THREE.DoubleSide });
  if (pool.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pool, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(poolUv, 2));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, poolMaterial);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    group.add(mesh);
    disposables.push(g);
  }
  disposables.push(glow, poolMaterial);
  void STREET;

  return {
    group,
    update,
    setNight(on) {
      night = on;
      poolMaterial.opacity = on ? 1 : 0;
      lampMaterial.emissiveIntensity = on ? 2.2 : 0;
      waterMat.color.set(night ? "#17324a" : "#3b86b6");
    },
    setVisible(v) {
      group.visible = v;
    },
    dispose() {
      group.removeFromParent();
      for (const x of disposables) x.dispose();
      void night;
    },
  };
}
