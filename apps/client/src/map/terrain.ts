import * as THREE from "three";
import { BLOCK, MARKET, PARK, STREET, type District } from "@thelife/game-core";
import { lampMaterial } from "./chunkBuilder";

// The ground of the Lagos map: water, streets with pavements and lane lines, plazas, building plots, parks and the market.
// The island is 3 by 4.5 km, so the ground is one big plane whose pixels are worked out in the shader from two small maps (what
// kind of ground is here, and how far from the edge of the street). That keeps the edges smooth and the detail sharp at any zoom,
// with nothing to repaint as you walk.

export interface Terrain {
  group: THREE.Group;
  update(px: number, pz: number, budgetMs?: number): void;
  setNight(on: boolean): void;
  setVisible(v: boolean): void;
  dispose(): void;
}

const NOISE = /* glsl */ `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03) + 0.125 * vnoise(p * 4.1) + 0.0625 * vnoise(p * 8.3); }
`;

export function buildTerrain(d: District): Terrain {
  const t = d.terrain!;
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const w = t.width, h = t.height;

  // The two small maps.
  const splat = new Uint8Array(new ArrayBuffer(w * h * 4));
  const field = new Uint8Array(new ArrayBuffer(w * h * 4));
  for (let i = 0; i < w * h; i++) {
    const c = t.cls[i]!;
    splat[i * 4] = c === STREET ? 255 : 0;
    splat[i * 4 + 1] = c === BLOCK ? 255 : 0;
    splat[i * 4 + 2] = c === PARK ? 255 : 0;
    splat[i * 4 + 3] = c === MARKET ? 255 : 0;
    field[i * 4] = Math.min(255, Math.round(t.edt[i]! * 16));
    field[i * 4 + 1] = Math.min(255, Math.round(t.wide[i]! * 16));
    field[i * 4 + 3] = 255;
  }
  const mapTex = (data: Uint8Array<ArrayBuffer>) => {
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    disposables.push(tex);
    return tex;
  };
  const splatTex = mapTex(splat);
  const fieldTex = mapTex(field);

  const uniforms = {
    uSplat: { value: splatTex },
    uField: { value: fieldTex },
    uSize: { value: new THREE.Vector2(t.size.x, t.size.z) },
    uCell: { value: t.cell },
    uTexel: { value: new THREE.Vector2(1 / w, 1 / h) },
    uTime: { value: 0 },
    uNight: { value: 0 },
  };

  // ---- the land
  const landMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95, metalness: 0 });
  landMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vGround;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vGround;
uniform sampler2D uSplat;
uniform sampler2D uField;
uniform vec2 uSize;
uniform vec2 uTexel;
uniform float uCell;
${NOISE}
`,
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
vec2 guv = vGround / uSize;
vec4 sp = texture2D(uSplat, guv);
float land = sp.r + sp.g + sp.b + sp.a;
if (land < 0.5) discard;
float detail = 1.0 - smoothstep(30.0, 110.0, length(vViewPosition));
vec2 p = vGround;
vec3 col;
if (sp.r >= sp.g && sp.r >= sp.b && sp.r >= sp.a) {
  // A street, or open paved ground.
  vec4 f = texture2D(uField, guv);
  float edge = max(0.0, f.r * 16.0 - 0.5) * uCell;      // metres from the nearest block / water / park
  float wideCells = f.g * 16.0;
  float halfW = max(0.0, wideCells - 0.5) * uCell;       // half the width of this street
  float grain = vnoise(p * 18.0) * 0.5 + vnoise(p * 70.0) * 0.5;
  if (wideCells > 3.2) {
    // Open ground: paving slabs with a little colour variation.
    vec2 cellId = floor(p / 1.6);
    vec2 g = abs(fract(p / 1.6) - 0.5);
    float seam = smoothstep(0.47, 0.5, max(g.x, g.y));
    col = mix(vec3(0.74, 0.71, 0.65), vec3(0.67, 0.64, 0.58), h21(cellId) * 0.8);
    col *= 1.0 - seam * 0.18 * detail;
    col *= 0.95 + 0.1 * grain * detail;
  } else if (edge < 1.7) {
    // Pavement beside the street: small slabs, and a darker kerb line where it meets the road.
    vec2 cellId = floor(p / 0.6);
    vec2 g = abs(fract(p / 0.6) - 0.5);
    float seam = smoothstep(0.46, 0.5, max(g.x, g.y));
    col = mix(vec3(0.72, 0.69, 0.63), vec3(0.62, 0.59, 0.53), h21(cellId) * 0.7);
    col *= 1.0 - seam * 0.22 * detail;
    col *= 0.96 + 0.08 * grain * detail;
    col = mix(col, vec3(0.5, 0.48, 0.44), smoothstep(0.28, 0.0, edge) * 0.8);
  } else {
    // Tarmac: grain, worn patches, lane edge lines and a dashed centre line.
    float worn = fbm(p * 0.35);
    col = vec3(0.235, 0.24, 0.255) * (0.9 + 0.35 * worn);
    col *= 0.93 + 0.14 * grain * detail;
    float crack = smoothstep(0.012, 0.0, abs(vnoise(p * 2.2) - 0.5) - 0.45) * detail;
    col *= 1.0 - crack * 0.25;
    float line = 0.0;
    if (halfW > 3.0) {
      line = max(line, smoothstep(0.09, 0.05, abs(edge - 2.15)));      // edge line
      // The centre line: where the distance to the edge matches the half width. Dashes run along the street.
      vec2 gx = vec2(uTexel.x * 1.5, 0.0), gz = vec2(0.0, uTexel.y * 1.5);
      vec2 grad = vec2(texture2D(uField, guv + gx).r - texture2D(uField, guv - gx).r, texture2D(uField, guv + gz).r - texture2D(uField, guv - gz).r);
      float gl = length(grad);
      if (halfW > 4.6 && gl > 0.01) {
        vec2 dir = grad / gl;
        float along = dot(p, vec2(-dir.y, dir.x));
        float dash = step(0.45, fract(along / 7.0));
        float centre = smoothstep(0.1, 0.05, abs(edge - halfW)) * dash * smoothstep(0.01, 0.04, gl);
        line = max(line, centre);
      }
    }
    col = mix(col, vec3(0.86, 0.84, 0.7), line * 0.85);
  }
} else if (sp.g >= sp.b && sp.g >= sp.a) {
  // The ground between and around buildings: concrete and compacted earth.
  float n = fbm(p * 0.5);
  col = mix(vec3(0.5, 0.47, 0.41), vec3(0.6, 0.57, 0.5), n);
  col *= 0.92 + 0.16 * vnoise(p * 22.0) * detail;
} else if (sp.b >= sp.a) {
  // Park: grass with lighter and darker patches.
  float n = fbm(p * 0.28);
  col = mix(vec3(0.2, 0.38, 0.12), vec3(0.34, 0.52, 0.2), n);
  col *= 0.9 + 0.2 * vnoise(p * 30.0) * detail;
} else {
  // The market: trodden earth, dusty orange, with dark worn lines.
  float n = fbm(p * 0.9);
  col = mix(vec3(0.52, 0.38, 0.26), vec3(0.64, 0.5, 0.34), n);
  col *= 0.9 + 0.2 * vnoise(p * 25.0) * detail;
}
// The shore: a pale strip of sand where the land is about to end.
float shore = smoothstep(0.82, 0.52, land);
col = mix(col, vec3(0.78, 0.72, 0.58), shore * 0.7);
diffuseColor.rgb = col;
`,
      );
  };
  const landGeo = new THREE.PlaneGeometry(t.size.x, t.size.z, 40, 56); // many small triangles: huge ones lose precision close to the camera
  const land = new THREE.Mesh(landGeo, landMat);
  land.rotation.x = -Math.PI / 2;
  land.position.set(t.size.x / 2, -0.02, t.size.z / 2);
  land.receiveShadow = true;
  land.frustumCulled = false;
  group.add(land);
  disposables.push(landMat, landGeo);

  // ---- the water: deep and shallow blue, with slow ripples and a paler edge near the shore
  const waterMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.18, metalness: 0.2 });
  waterMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vGround;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec2 vGround;\nuniform sampler2D uSplat;\nuniform vec2 uSize;\nuniform float uTime;\nuniform float uNight;\n${NOISE}\nfloat landAt(vec2 q) { vec4 s = texture2D(uSplat, q / uSize); return s.r + s.g + s.b + s.a; }\n`)
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
vec2 p = vGround;
float near = 0.0;
for (int i = 0; i < 6; i++) {
  float a = float(i) * 1.0472;
  near += landAt(p + vec2(cos(a), sin(a)) * 18.0);
  near += landAt(p + vec2(cos(a), sin(a)) * 42.0);
}
near = clamp(near / 6.0, 0.0, 1.0);
float ripple = fbm(p * 0.07 + vec2(uTime * 0.02, uTime * 0.013)) * 0.6 + fbm(p * 0.4 - vec2(uTime * 0.05, 0.0)) * 0.4;
vec3 deep = vec3(0.07, 0.30, 0.46), shallow = vec3(0.22, 0.58, 0.68);
vec3 wcol = mix(deep, shallow, clamp(near * 1.4, 0.0, 1.0)) * (0.88 + 0.28 * ripple);
wcol = mix(wcol, wcol * vec3(0.35, 0.45, 0.6), uNight);
diffuseColor.rgb = wcol;
`,
      );
  };
  // Many small triangles and a nudge backwards: two huge triangles lose depth precision and could be drawn over the land.
  const waterGeo = new THREE.PlaneGeometry(24_000, 24_000, 64, 64);
  waterMat.polygonOffset = true;
  waterMat.polygonOffsetFactor = 4;
  waterMat.polygonOffsetUnits = 4;
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(t.size.x / 2, -0.35, t.size.z / 2);
  water.receiveShadow = true;
  water.frustumCulled = false;
  group.add(water);
  disposables.push(waterMat, waterGeo);

  // ---- pools of light under the street lamps (night only), one draw call for all of them
  const pool: number[] = [];
  const poolUv: number[] = [];
  for (const l of d.lamps) {
    const dx = l.facing === 3 ? -1.6 : l.facing === 1 ? 1.6 : 0;
    const dz = l.facing === 0 ? -1.6 : l.facing === 2 ? 1.6 : 0;
    const x = l.x + dx, z = l.z + dz, s = 8;
    pool.push(x - s, 0.05, z - s, x + s, 0.05, z - s, x + s, 0.05, z + s, x - s, 0.05, z - s, x + s, 0.05, z + s, x - s, 0.05, z + s);
    poolUv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  }
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = 64;
  {
    const g = glowCanvas.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,214,140,0.9)");
    grad.addColorStop(1, "rgba(255,214,140,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const glow = new THREE.CanvasTexture(glowCanvas);
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

  let time = 0;
  return {
    group,
    update() {
      time += 1 / 60;
      uniforms.uTime.value = time;
    },
    setNight(on) {
      poolMaterial.opacity = on ? 1 : 0;
      lampMaterial.emissiveIntensity = on ? 2.2 : 0;
      uniforms.uNight.value = on ? 1 : 0;
    },
    setVisible(v) {
      group.visible = v;
    },
    dispose() {
      group.removeFromParent();
      for (const x of disposables) x.dispose();
    },
  };
}
