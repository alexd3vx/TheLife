import * as THREE from "three";

// Lagos buildings that look like buildings: plaster and paint that has weathered, exposed block, glass towers, windows with burglar
// bars and AC units, shop shutters and signboards, rust-streaked corrugated roofs. All of it is drawn by one shader from a wall's
// own measurements (metres along it, metres up it), so a building costs a few triangles however detailed it looks.

/** Shared so the day/night switch can reach every facade at once. */
export const facadeUniforms = { uNight: { value: 0 }, uTime: { value: 0 }, uSigns: { value: null as THREE.Texture | null } };

const SIGN_NAMES = [
  "MAMA NGOZI PROVISIONS", "BLESSED PHARMACY", "ALHAJI & SONS ELECTRONICS", "OLUWASEUN FABRICS", "GLOBALCOM RECHARGE CENTRE", "TOLU'S FASHION HOUSE",
  "SUNRISE SUPERMARKET", "CHIEF'S SPARE PARTS", "GRACE BUKA & BAR", "EKO BOOKSHOP", "ADEBAYO CHEMISTS", "NNEKA BEAUTY SALON", "ISALE EKO TAILORS", "JUMIA-STYLE GADGETS",
  "NEW DAWN BUREAU DE CHANGE", "MAMA PUT KITCHEN", "ROYAL STAR HOTEL", "LAGOS MOTORS", "HAPPY HOME FURNITURE", "OKE-ARIN PHONE MART", "FIRST CHOICE BAKERY", "PEACE POS & PRINTING",
  "ODUDUWA PROVISION STORE", "ZION BUILDING MATERIALS", "TASTY FINGERS RESTAURANT", "ROYAL CROWN LAUNDRY", "MARINA FRESH FISH", "ALAGBO HERBAL CENTRE", "TRUST MICROFINANCE", "CLASSIC BARBERS", "ABIKE LIGHTING", "SPEEDY COURIER",
];
const SIGN_COLOURS = ["#c0392b", "#1f5fa8", "#d98a1c", "#217a4f", "#6a3a9c", "#12807f", "#b3365f", "#2d3a4a"];

function signAtlas(): THREE.CanvasTexture {
  const w = 1024, rows = 16, ch = 64, cw = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = rows * ch;
  const g = canvas.getContext("2d")!;
  for (let i = 0; i < SIGN_NAMES.length; i++) {
    const x = (i % 2) * cw, y = Math.floor(i / 2) * ch;
    const bg = SIGN_COLOURS[(i * 5) % SIGN_COLOURS.length]!;
    g.fillStyle = bg;
    g.fillRect(x, y, cw, ch);
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.fillRect(x, y, cw, 6);
    g.fillStyle = "rgba(0,0,0,0.22)";
    g.fillRect(x, y + ch - 6, cw, 6);
    g.fillStyle = i % 3 === 0 ? "#ffe9a8" : "#ffffff";
    g.font = "800 34px 'Arial Black', Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(SIGN_NAMES[i]!, x + cw / 2, y + ch / 2 + 2, cw - 28);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
export const SIGN_COUNT = SIGN_NAMES.length;

const NOISE = /* glsl */ `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03) + 0.125 * vnoise(p * 4.1) + 0.0625 * vnoise(p * 8.3); }
`;

const VERT_HEAD = /* glsl */ `
attribute vec4 aInfo;   // floors, code (kind + 10 * surface + 100 * front), seed, storey
attribute float aLen;   // length of the wall in metres
varying vec4 vInfo;
varying float vLen;
varying vec3 vWorldPos;
`;

const FRAG_HEAD = /* glsl */ `
uniform float uNight;
uniform sampler2D uSigns;
varying vec4 vInfo;
varying float vLen;
varying vec3 vWorldPos;
${NOISE}
`;

// Builds diffuseColor, a roughness and a night glow for the surface; everything else is three's standard lighting.
const FRAG_COLOUR = /* glsl */ `
vec3 base = vColor;
float fRough = 0.92;
vec3 fGlow = vec3(0.0);
{
  float floors = vInfo.x;
  float code = vInfo.y;
  float front = step(100.0, code); code -= front * 100.0;
  float surf = floor(code / 10.0 + 0.001);
  float kind = code - surf * 10.0;
  float seed = vInfo.z;
  float storey = vInfo.w;
  float dist = length(vViewPosition);
  float detail = 1.0 - smoothstep(40.0, 150.0, dist);
  vec3 col = base;

  if (surf < 0.5) {
    // ------------------------------------------------------------ a wall
    float u = vUv.x, v = vUv.y;
    float len = vLen;
    float height = floors * storey;
    // The walls' make: raw block (greyer, with block courses), a painted plaster, a hangar's ribbed metal.
    float style = seed;
    float rawBlock = step(style, 0.17) * step(kind, 2.5);
    float metal = step(2.5, kind) * step(kind, 3.5);
    float grain = fbm(vec2(u, v) * 3.0 + seed * 40.0);
    float fine = vnoise(vec2(u, v) * 22.0);
    if (metal > 0.5) {
      float rib = 0.5 + 0.5 * sin(u * 25.0);
      col = mix(col, vec3(0.55, 0.57, 0.6), 0.7);
      col *= 0.82 + 0.22 * rib;
      float rust = smoothstep(0.55, 0.85, fbm(vec2(u * 0.7, v * 0.5) + seed * 30.0));
      col = mix(col, vec3(0.45, 0.22, 0.12), rust * 0.65);
      fRough = 0.55 + rust * 0.4;
    } else if (rawBlock > 0.5) {
      col = mix(vec3(0.62, 0.61, 0.58), col * 0.8, 0.25) * (0.88 + 0.3 * grain);
      vec2 blk = vec2(u / 0.45, v / 0.22);
      float row = floor(blk.y);
      float bx = fract(blk.x + 0.5 * mod(row, 2.0));
      float joint = max(smoothstep(0.05, 0.0, bx) + smoothstep(0.95, 1.0, bx), smoothstep(0.1, 0.0, fract(blk.y)));
      col *= 1.0 - 0.28 * joint * detail;
      col *= 0.9 + 0.2 * h21(vec2(floor(blk.x + 0.5 * mod(row, 2.0)), row) + seed * 7.0);
      fRough = 0.97;
    } else {
      col *= 0.9 + 0.2 * grain;
      col *= 0.96 + 0.08 * fine * detail;
      fRough = 0.9;
    }

    // Layout: columns of windows every ~3 m, the same rule the geometry uses for balconies and AC units.
    float cols = max(1.0, floor((len - 1.2) / 3.0));
    float step_ = len / cols;
    float cu = u / step_;
    float k = floor(cu);
    float fu = (cu - k) * step_ - step_ * 0.5;
    float fl = floor(v / storey);
    float fv = v - fl * storey;
    float onWall = step(fl, floors - 0.5);
    float winW = (kind > 0.5 && kind < 1.5) ? 1.3 : (kind > 1.5 ? 1.6 : 1.1);
    float sill = fl < 0.5 ? 1.0 : 0.95;
    float winH = 1.3;
    float cellSeed = h21(vec2(k + fl * 17.0, seed * 91.0));

    // Ground floor: a shopfront (shutter and signboard), or a door.
    float frontGround = front * step(fl, 0.5);
    float shop = step(1.5, kind) * step(kind, 2.5);
    float u0 = len * 0.12, u1 = len * 0.88;
    float shutter = 0.0, signZone = 0.0, doorZone = 0.0;
    if (frontGround > 0.5) {
      if (shop > 0.5 && len > 4.0) {
        shutter = step(u0, u) * step(u, u1) * step(v, 2.45);
        signZone = step(u0 - 0.2, u) * step(u, u1 + 0.2) * step(2.5, v) * step(v, 3.1);
      } else {
        doorZone = step(abs(u - len * 0.5), 0.55) * step(v, 2.2);
      }
    }
    float skipWin = max(max(shutter, doorZone), step(0.5, frontGround) * step(abs(u - len * 0.5), 1.2) * (1.0 - shop));

    float inWinBox = step(abs(fu), winW * 0.5) * step(sill, fv) * step(fv, sill + winH) * onWall * (1.0 - skipWin) * (1.0 - signZone);
    // Window frame, glass, curtains, burglar bars.
    if (inWinBox > 0.5 && metal < 0.5) {
      float edgeX = winW * 0.5 - abs(fu), edgeY = min(fv - sill, sill + winH - fv);
      float frame = 1.0 - step(0.075, min(edgeX, edgeY));
      float mullion = step(abs(fu), 0.022) * step(0.5, winW - 1.2 + 0.5);
      vec3 frameCol = mix(vec3(0.9, 0.9, 0.88), vec3(0.18, 0.12, 0.09), step(0.5, h21(vec2(seed, 3.0))));
      float t = clamp((fv - sill) / winH, 0.0, 1.0);
      vec3 sky = mix(vec3(0.26, 0.34, 0.42), vec3(0.62, 0.74, 0.86), t) * (0.75 + 0.35 * h21(vec2(k, fl)));
      vec3 glass = mix(vec3(0.1, 0.13, 0.16), sky, 0.7 + 0.25 * detail);
      // curtains
      float curtain = step(0.6, cellSeed) * step(fu, -winW * 0.5 + winW * (0.35 + 0.5 * h21(vec2(k, fl + 3.0))));
      vec3 curtainCol = 0.55 + 0.45 * vec3(h21(vec2(k, 1.0 + fl)), h21(vec2(k, 2.0 + fl)), h21(vec2(k, 3.0 + fl)));
      glass = mix(glass, curtainCol * 0.7, curtain * 0.85);
      // inner shadow under the lintel
      glass *= 0.75 + 0.25 * smoothstep(sill + winH, sill + winH - 0.35, fv);
      // louvres on some windows
      float louvre = step(0.82, cellSeed) * step(0.5, fract((fv - sill) / 0.14));
      glass = mix(glass, vec3(0.55, 0.57, 0.55), louvre * 0.7);
      vec3 w = mix(glass, frameCol, clamp(frame + mullion, 0.0, 1.0));
      // burglar bars: ground floors everywhere, upper floors on some buildings
      float bars = step(fl, 0.5) + step(0.55, h21(vec2(seed, 9.0))) * step(0.5, fl);
      if (bars > 0.5) {
        float bx = step(abs(fract((fu + winW * 0.5) / 0.3) - 0.5), 0.07);
        float by = step(abs(fract((fv - sill) / 0.45) - 0.5), 0.06);
        float grid = max(bx, by) * (1.0 - frame);
        w = mix(w, mix(vec3(0.05), vec3(0.8, 0.8, 0.78), step(0.5, h21(vec2(seed, 5.0)))), grid * 0.9);
      }
      col = w;
      fRough = 0.35 - 0.2 * (1.0 - frame);
      // lit windows at night
      float lit = step(0.55, cellSeed) * (1.0 - frame) * uNight;
      fGlow = lit * mix(vec3(1.0, 0.78, 0.45), vec3(0.8, 0.9, 1.0), step(0.8, h21(vec2(k, fl + 9.0)))) * (0.55 + 0.45 * curtain + 0.2);
    }
    // Reveal and sill around each window opening
    float around = step(abs(fu), winW * 0.5 + 0.12) * step(sill - 0.1, fv) * step(fv, sill + winH + 0.1) * onWall * (1.0 - inWinBox) * (1.0 - skipWin);
    col = mix(col, col * 0.78, around * 0.8 * detail);

    // Floor slabs: a band under each storey, and a cornice at the top.
    float slab = smoothstep(storey - 0.22, storey - 0.18, fv) * step(fl, floors - 1.5);
    col *= 1.0 - 0.14 * slab * detail;
    float topBand = smoothstep(height - 0.45, height - 0.35, v);
    col = mix(col, col * 1.1 + 0.03, topBand * 0.6);

    // Shop shutter (corrugated, painted) and signboard.
    if (shutter > 0.5) {
      float ribs = 0.5 + 0.5 * sin(v * 60.0);
      vec3 shutterCol = mix(vec3(0.15, 0.32, 0.55), vec3(0.65, 0.18, 0.15), step(0.33, h21(vec2(seed, 11.0))));
      shutterCol = mix(shutterCol, vec3(0.2, 0.45, 0.28), step(0.66, h21(vec2(seed, 11.0))));
      float open = step(0.7, h21(vec2(seed, 21.0))); // open for business: dark inside, goods
      float rise = open * smoothstep(0.0, 0.05, v - (0.9 + 1.55 * h21(vec2(seed, 22.0))));
      vec3 inside = vec3(0.12, 0.1, 0.09) + 0.5 * vec3(h21(vec2(floor(u * 3.0), floor(v * 4.0))), h21(vec2(floor(u * 3.0) + 5.0, floor(v * 4.0))), 0.3) * step(0.6, fbm(vec2(u, v) * 4.0)) * step(v, 1.9);
      col = mix(shutterCol * (0.75 + 0.3 * ribs), inside, open * (1.0 - rise));
      float sx = step(0.05, min(u - u0, u1 - u)) * 1.0;
      col = mix(vec3(0.15), col, sx);
      fRough = 0.5;
    }
    if (signZone > 0.5) {
      float width = min(len * 0.86, 4.8);
      float sa = (u - (len * 0.5 - width * 0.5)) / width;
      float sv = (v - 2.5) / 0.6;
      if (sa > 0.0 && sa < 1.0 && sv > 0.0 && sv < 1.0) {
        float cell = floor(h21(vec2(seed * 31.0, 4.0)) * 32.0);
        float cx = mod(cell, 2.0), cy = floor(cell / 2.0);
        vec3 s = texture2D(uSigns, vec2((cx + sa) / 2.0, (cy + sv) / 16.0)).rgb;
        col = s;
        fGlow += s * uNight * 0.9;
        fRough = 0.45;
      }
    }
    if (doorZone > 0.5) {
      vec3 doorCol = mix(vec3(0.33, 0.2, 0.12), vec3(0.2, 0.28, 0.4), step(0.5, h21(vec2(seed, 13.0))));
      col = doorCol * (0.85 + 0.25 * fbm(vec2(u * 6.0, v * 2.0)));
      if (abs(u - len * 0.5) < 0.04 && v > 0.2) col = vec3(0.1);
      fRough = 0.6;
    }

    // Weathering: dirt at the foot, rain streaks under the windows, mould near the roof, peeling paint, rising damp.
    float dirt = smoothstep(1.6, 0.0, v) * (0.35 + 0.4 * grain);
    float streak = vnoise(vec2(u * 6.0, v * 0.35 + seed * 20.0));
    float streaks = smoothstep(0.55, 0.9, streak) * smoothstep(0.0, -3.0, -(fv - sill + 0.2)) * 0.18;
    float mould = smoothstep(height - 1.2, height, v) * smoothstep(0.45, 0.8, fbm(vec2(u * 0.8, v * 0.6) + seed * 13.0)) * 0.35;
    float peel = smoothstep(0.62, 0.7, fbm(vec2(u, v) * 1.4 + seed * 9.0));
    col *= 1.0 - (dirt * 0.5 + streaks + mould) * detail * 1.0 - (dirt * 0.25) * (1.0 - detail);
    col = mix(col, col * vec3(0.78, 0.74, 0.68) + 0.04, peel * 0.45 * detail * (1.0 - rawBlock));
    col = mix(col, col * vec3(0.55, 0.62, 0.45), mould * 0.6 * detail);
  } else if (surf < 1.5) {
    // ------------------------------------------------------------ a flat concrete roof
    vec2 p = vUv;
    float grain = fbm(p * 0.9 + seed * 20.0);
    col = mix(vec3(0.52, 0.52, 0.5), vec3(0.4, 0.4, 0.39), grain);
    col *= 0.88 + 0.2 * vnoise(p * 18.0) * detail;
    float joint = step(0.97, fract(p.x / 6.0)) + step(0.97, fract(p.y / 6.0));
    col *= 1.0 - 0.25 * min(joint, 1.0) * detail;
    float stain = smoothstep(0.55, 0.8, fbm(p * 0.35 + seed * 40.0));
    col = mix(col, col * vec3(0.55, 0.52, 0.45), stain * 0.6);
    float puddle = smoothstep(0.7, 0.78, fbm(p * 0.5 + 9.0));
    col = mix(col, vec3(0.2, 0.25, 0.28), puddle * 0.45);
    fRough = mix(0.95, 0.18, puddle);
  } else {
    // ------------------------------------------------------------ a corrugated sheet roof
    vec2 p = vUv; // x across the ribs (metres), y up the slope (metres)
    float rib = 0.5 + 0.5 * sin(p.x * 55.0);
    float ribFade = detail;
    float rust = smoothstep(0.45, 0.8, fbm(p * 0.7 + seed * 33.0));
    float streak = smoothstep(0.5, 0.9, vnoise(vec2(p.x * 3.0, p.y * 0.4 + seed * 9.0)));
    col = base * (0.78 + 0.28 * mix(0.5, rib, ribFade));
    col = mix(col, vec3(0.5, 0.25, 0.14), rust * 0.55);
    col = mix(col, col * 0.6, streak * 0.4);
    fRough = 0.55 + 0.4 * rust;
  }
  diffuseColor.rgb = col;
}
`;

function patchFacade(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = facadeUniforms.uNight;
    shader.uniforms.uSigns = facadeUniforms.uSigns as unknown as { value: THREE.Texture };
    shader.vertexShader = `${VERT_HEAD}\n${shader.vertexShader}`
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvInfo = aInfo; vLen = aLen; vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = `${FRAG_HEAD}\n${shader.fragmentShader}`
      .replace("#include <color_fragment>", `#include <color_fragment>\n${FRAG_COLOUR}`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = fRough;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += fGlow;");
    // The standard shader only declares vUv when a texture needs it; this one always does.
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vUv;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvUv = uv;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vUv;");
  };
  material.customProgramCacheKey = () => "lagos-facade";
}

let material: THREE.MeshStandardMaterial | null = null;
/** The shared facade material (made on first use, because it needs a canvas for the signboards). */
export function facadeMaterial(): THREE.MeshStandardMaterial {
  if (material) return material;
  if (!facadeUniforms.uSigns.value) facadeUniforms.uSigns.value = signAtlas();
  material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  patchFacade(material);
  return material;
}

export function setFacadeNight(on: boolean): void {
  facadeUniforms.uNight.value = on ? 1 : 0;
}

/** Collects the walls and roofs that use the facade shader: positions, a base colour, metres-along/metres-up, and the building's facts. */
export class FacadeBuilder {
  private readonly pos: number[] = [];
  private readonly col: number[] = [];
  private readonly uv: number[] = [];
  private readonly info: number[] = [];
  private readonly len: number[] = [];

  get triangles(): number {
    return this.pos.length / 9;
  }

  /** A triangle. `info` = [floors, code, seed, storey]. */
  tri(a: THREE.Vector3Like, b: THREE.Vector3Like, c: THREE.Vector3Like, uva: [number, number], uvb: [number, number], uvc: [number, number], color: THREE.Color, info: [number, number, number, number], len: number): void {
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.uv.push(uva[0], uva[1], uvb[0], uvb[1], uvc[0], uvc[1]);
    for (let i = 0; i < 3; i++) {
      this.col.push(color.r, color.g, color.b);
      this.info.push(info[0], info[1], info[2], info[3]);
      this.len.push(len);
    }
  }

  /** A wall quad from (x0,z0) to (x1,z1), `height` tall, facing `out`. Texture metres run along the wall and up it. */
  wall(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, out: { x: number; z: number }, color: THREE.Color, info: [number, number, number, number]): void {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const A = { x: x0, y: y0, z: z0 }, B = { x: x1, y: y0, z: z1 }, C = { x: x1, y: y1, z: z1 }, D = { x: x0, y: y1, z: z0 };
    // Winding so the face points along `out`.
    const nx = (B.y - A.y) * (C.z - A.z) - (B.z - A.z) * (C.y - A.y);
    const nz = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
    const flip = nx * out.x + nz * out.z < 0;
    const ua: [number, number] = [0, y0], ub: [number, number] = [len, y0], uc: [number, number] = [len, y1], ud: [number, number] = [0, y1];
    if (!flip) {
      this.tri(A, B, C, ua, ub, uc, color, info, len);
      this.tri(A, C, D, ua, uc, ud, color, info, len);
    } else {
      this.tri(A, C, B, ua, uc, ub, color, info, len);
      this.tri(A, D, C, ua, ud, uc, color, info, len);
    }
  }

  build(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("aInfo", new THREE.Float32BufferAttribute(this.info, 4));
    g.setAttribute("aLen", new THREE.Float32BufferAttribute(this.len, 1));
    g.computeVertexNormals(); // flat: one normal per face
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
