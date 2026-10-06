import * as THREE from "three";

// Turns the 3D models we already own into painted-looking isometric sprites. A model is drawn once from a fixed diagonal angle with a
// flat, banded "toon" light, then outlined and given a little paper grain, and saved as an image. The game itself then only moves
// images around, which is light enough for any phone.

/** Screen pixels per metre along the ground's diagonal (a 1 m square is a 128 x 64 diamond), times the extra sharpness. */
export const TILE_W = 128;
export const BAKE_SHARP = 1.5;
const K = (TILE_W / Math.SQRT2) * BAKE_SHARP; // pixels per world metre on screen
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

let renderer: THREE.WebGLRenderer | null = null;
const CANVAS = { w: 640, h: 720, ox: 320, oy: 560 }; // the drawing area, and where the origin lands in it

function gl(): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(CANVAS.w * SS, CANVAS.h * SS, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  return renderer;
}

function camera(): THREE.OrthographicCamera {
  const s = K * SS;
  const w = CANVAS.w * SS, h = CANVAS.h * SS;
  const cam = new THREE.OrthographicCamera(-(CANVAS.ox * SS) / s, (w - CANVAS.ox * SS) / s, (CANVAS.oy * SS) / s, -(h - CANVAS.oy * SS) / s, 0.1, 100);
  const d = 30;
  cam.position.set(d * Math.cos(ELEVATION) * Math.SQRT1_2, d * Math.sin(ELEVATION), d * Math.cos(ELEVATION) * Math.SQRT1_2);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  return cam;
}

const ramp = (() => {
  const data = new Uint8Array([70, 70, 70, 255, 130, 130, 130, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

/** Swaps real-world shading for flat, banded colour so everything looks hand-painted. */
export function toonify(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (m: THREE.Material): THREE.Material => {
      const s = m as THREE.MeshStandardMaterial;
      if (!s.isMeshStandardMaterial && !(m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) return m;
      const t = new THREE.MeshToonMaterial({
        color: s.color.clone().multiplyScalar(1.12),
        map: s.map ?? null,
        gradientMap: ramp,
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

function lights(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.AmbientLight("#ffe9d2", 1.25));
  const sun = new THREE.DirectionalLight("#fff3e0", 2.1);
  sun.position.set(-4, 7, 5); // from the left, above and in front, so the right side is the shaded one
  g.add(sun);
  const fill = new THREE.DirectionalLight("#9fb4ff", 0.5);
  fill.position.set(6, 2, -3);
  g.add(fill);
  return g;
}

const OUTLINE = "#3a2418";

/** Outline, grain, warm colour: the "painted" finish, then trim the empty edges. */
function finish(src: HTMLCanvasElement): { canvas: HTMLCanvasElement; ax: number; ay: number } | null {
  // shrink the double-size drawing
  const small = document.createElement("canvas");
  small.width = CANVAS.w;
  small.height = CANVAS.h;
  const sc = small.getContext("2d")!;
  sc.imageSmoothingQuality = "high";
  sc.drawImage(src, 0, 0, CANVAS.w, CANVAS.h);
  // find what was drawn
  const data = sc.getImageData(0, 0, CANVAS.w, CANVAS.h).data;
  let minX = CANVAS.w, minY = CANVAS.h, maxX = -1, maxY = -1;
  for (let y = 0; y < CANVAS.h; y++) for (let x = 0; x < CANVAS.w; x++) if (data[(y * CANVAS.w + x) * 4 + 3]! > 10) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) return null;
  const pad = 4;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(CANVAS.w - 1, maxX + pad);
  maxY = Math.min(CANVAS.h - 1, maxY + pad);
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
  const r = 2.2;
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
  return { canvas: out, ax: CANVAS.ox - minX, ay: CANVAS.oy - minY };
}

/** Draws one object (placed with its base middle at the origin) from the isometric camera. */
export function shoot(object: THREE.Object3D): { canvas: HTMLCanvasElement; ax: number; ay: number } | null {
  const scene = new THREE.Scene();
  scene.add(lights());
  scene.add(object);
  const r = gl();
  r.render(scene, camera());
  const copy = document.createElement("canvas");
  copy.width = r.domElement.width;
  copy.height = r.domElement.height;
  copy.getContext("2d")!.drawImage(r.domElement, 0, 0);
  scene.remove(object);
  return finish(copy);
}

export function toSprite(id: string, rot: number, shot: { canvas: HTMLCanvasElement; ax: number; ay: number }): Sprite {
  return { id, rot, image: shot.canvas.toDataURL("image/png"), w: shot.canvas.width, h: shot.canvas.height, ax: shot.ax, ay: shot.ay };
}

export { K as PIXELS_PER_METRE };
