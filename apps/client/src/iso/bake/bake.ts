import * as THREE from "three";

// Turns the 3D models we already own into painted-looking isometric sprites. A model is drawn once from a fixed diagonal angle with a
// flat, banded "toon" light, then outlined and given a little paper grain, and saved as an image. The game itself then only moves
// images around, which is light enough for any phone.

/** Screen pixels per metre along the ground's diagonal (a 1 m square is a 128 x 64 diamond), times the extra sharpness. */
export const TILE_W = 128;
/** How much bigger than the screen size the pictures are drawn, so they stay crisp on sharp phone screens. */
export const BAKE_SHARP = 2;
export const CHAR_SHARP = 2.25;
const kFor = (sharp: number) => (TILE_W / Math.SQRT2) * sharp; // pixels per world metre on screen
const ELEVATION = (30 * Math.PI) / 180;
const SS = 2; // draw twice as big, then shrink, so edges are smooth

export interface Sprite {
  id: string;
  /** Quarter turns the model was drawn with (0 to 3). */
  rot: number;
  image: string;
  w: number;
  h: number;
  /** Where the model's origin (the middle of its base) is, from the sprite's top-left corner. */
  ax: number;
  ay: number;
}

/** The drawing area (in final pixels), and where the model's origin lands in it. */
export interface Area {
  /** Pictures are drawn this many times larger than they appear at normal zoom. */
  sharp?: number;
  /** Strength of the light, 1 by default. People are drawn dimmer so the shading survives being coloured afterwards. */
  light?: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
}
export const PROP_AREA: Area = { w: 853, h: 960, ox: 427, oy: 747, sharp: BAKE_SHARP };
/** People are smaller than furniture, so a smaller area makes baking a whole character fast. */
export const CHAR_AREA: Area = { w: 510, h: 600, ox: 255, oy: 480, light: 0.62, sharp: CHAR_SHARP };

let renderer: THREE.WebGLRenderer | null = null;

function gl(area: Area): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  if (renderer.domElement.width !== area.w * SS || renderer.domElement.height !== area.h * SS) renderer.setSize(area.w * SS, area.h * SS, false);
  return renderer;
}

function camera(area: Area): THREE.OrthographicCamera {
  const s = kFor(area.sharp ?? BAKE_SHARP) * SS;
  const w = area.w * SS, h = area.h * SS;
  const cam = new THREE.OrthographicCamera(-(area.ox * SS) / s, (w - area.ox * SS) / s, (area.oy * SS) / s, -(h - area.oy * SS) / s, 0.1, 100);
  const d = 30;
  cam.position.set(d * Math.cos(ELEVATION) * Math.SQRT1_2, d * Math.sin(ELEVATION), d * Math.cos(ELEVATION) * Math.SQRT1_2);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  return cam;
}

const makeRamp = (steps: number[]) => {
  const data = new Uint8Array(steps.flatMap((v) => [v, v, v, 255]));
  const t = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
};
const ramp = makeRamp([70, 130, 200, 255]);
/** For people, whose colours are applied afterwards by multiplying: the shadows stay light enough for dark skin and dark cloth to read. */
const softRamp = makeRamp([95, 150, 205, 255]);

/** Swaps real-world shading for flat, banded colour so everything looks hand-painted. */
export function toonify(root: THREE.Object3D, soft = false): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (m: THREE.Material): THREE.Material => {
      const s = m as THREE.MeshStandardMaterial;
      if (!s.isMeshStandardMaterial && !(m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) return m;
      const t = new THREE.MeshToonMaterial({
        name: s.name,
        color: s.color.clone().multiplyScalar(soft ? 1 : 1.12),
        map: s.map ?? null,
        gradientMap: soft ? softRamp : ramp,
        transparent: s.transparent,
        opacity: s.opacity,
        alphaTest: s.alphaTest,
        side: s.side,
        vertexColors: s.vertexColors,
        emissive: s.emissive?.clone() ?? new THREE.Color(0),
        emissiveMap: s.emissiveMap ?? null,
        emissiveIntensity: s.emissiveIntensity ?? 1,
      });
      return t;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
}

function lights(k = 1): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.AmbientLight("#ffe9d2", 1.25 * k));
  const sun = new THREE.DirectionalLight("#fff3e0", 2.1 * k);
  sun.position.set(-4, 7, 5); // from the left, above and in front, so the right side is the shaded one
  g.add(sun);
  const fill = new THREE.DirectionalLight("#9fb4ff", 0.5 * k);
  fill.position.set(6, 2, -3);
  g.add(fill);
  return g;
}

const OUTLINE = "#3a2418";

/** Outline, grain, warm colour: the "painted" finish, then trim the empty edges. */
function finish(src: HTMLCanvasElement, A: Area): { canvas: HTMLCanvasElement; ax: number; ay: number } | null {
  // shrink the double-size drawing
  const small = document.createElement("canvas");
  small.width = A.w;
  small.height = A.h;
  const sc = small.getContext("2d")!;
  sc.imageSmoothingQuality = "high";
  sc.drawImage(src, 0, 0, A.w, A.h);
  // find what was drawn
  const data = sc.getImageData(0, 0, A.w, A.h).data;
  let minX = A.w, minY = A.h, maxX = -1, maxY = -1;
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) if (data[(y * A.w + x) * 4 + 3]! > 10) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) return null;
  const pad = 4;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(A.w - 1, maxX + pad);
  maxY = Math.min(A.h - 1, maxY + pad);
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const oc = out.getContext("2d")!;
  // silhouette in the outline colour, drawn around the picture
  const sil = document.createElement("canvas");
  sil.width = w;
  sil.height = h;
  const ic = sil.getContext("2d")!;
  ic.drawImage(small, minX, minY, w, h, 0, 0, w, h);
  ic.globalCompositeOperation = "source-in";
  ic.fillStyle = OUTLINE;
  ic.fillRect(0, 0, w, h);
  const r = 2.2 * ((A.sharp ?? BAKE_SHARP) / 1.5);
  for (let a = 0; a < 16; a++) oc.drawImage(sil, Math.cos((a / 16) * Math.PI * 2) * r, Math.sin((a / 16) * Math.PI * 2) * r);
  oc.filter = "saturate(1.18) contrast(1.06) brightness(1.04)";
  oc.drawImage(small, minX, minY, w, h, 0, 0, w, h);
  oc.filter = "none";
  // a little paper grain, only on the painted part
  const grain = document.createElement("canvas");
  grain.width = w;
  grain.height = h;
  const gc = grain.getContext("2d")!;
  const gd = gc.createImageData(w, h);
  for (let i = 0; i < gd.data.length; i += 4) {
    const v = 214 + Math.random() * 40;
    gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = v;
    gd.data[i + 3] = 255;
  }
  gc.putImageData(gd, 0, 0);
  oc.globalCompositeOperation = "source-atop";
  oc.globalAlpha = 0.22;
  oc.drawImage(grain, 0, 0);
  oc.globalAlpha = 1;
  oc.globalCompositeOperation = "source-over";
  return { canvas: out, ax: A.ox - minX, ay: A.oy - minY };
}

/** Draws one object (placed with its base middle at the origin) from the isometric camera. */
export function shoot(object: THREE.Object3D, area: Area = PROP_AREA): { canvas: HTMLCanvasElement; ax: number; ay: number } | null {
  const scene = new THREE.Scene();
  scene.add(lights(area.light ?? 1));
  scene.add(object);
  const r = gl(area);
  r.render(scene, camera(area));
  const copy = document.createElement("canvas");
  copy.width = r.domElement.width;
  copy.height = r.domElement.height;
  copy.getContext("2d")!.drawImage(r.domElement, 0, 0);
  scene.remove(object);
  return finish(copy, area);
}

export function toSprite(id: string, rot: number, shot: { canvas: HTMLCanvasElement; ax: number; ay: number }): Sprite {
  return { id, rot, image: shot.canvas.toDataURL("image/png"), w: shot.canvas.width, h: shot.canvas.height, ax: shot.ax, ay: shot.ay };
}

