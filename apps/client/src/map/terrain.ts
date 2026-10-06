import * as THREE from "three";
import { BLOCK, MARKET, PARK, STREET, buildRoadField, type District } from "@thelife/game-core";
import { lampMaterial } from "./chunkBuilder";

// The ground of the Lagos map: water, streets with pavements and lane lines, building plots, parks and the market.
// The island is 4.5 by 3.2 km, so the ground is one big plane whose pixels are worked out in the shader from two small maps (what
// kind of ground is here, and the exact distance to the edge of the nearest street). That keeps the edges smooth and the detail sharp at any zoom,
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

  const roadField = buildRoadField(t);
  // The two small maps.
  const splat = new Uint8Array(new ArrayBuffer(w * h * 4));
  const fw = roadField.width, fh = roadField.height;
  const field = new Uint8Array(new ArrayBuffer(fw * fh * 4));
  for (let i = 0; i < fw * fh; i++) {
    field[i * 4] = roadField.edge[i]!;
    field[i * 4 + 1] = roadField.half[i]!;
    field[i * 4 + 2] = roadField.angle[i]!;
    field[i * 4 + 3] = roadField.lateral[i]!;
  }
  for (let i = 0; i < w * h; i++) {
    const c = t.cls[i]!;
    splat[i * 4] = c === STREET ? 255 : 0;
    splat[i * 4 + 1] = c === BLOCK ? 255 : 0;
    splat[i * 4 + 2] = c === PARK ? 255 : 0;
    splat[i * 4 + 3] = c === MARKET ? 255 : 0;
  }
  const mapTex = (data: Uint8Array<ArrayBuffer>, tw = w, th = h) => {
    const tex = new THREE.DataTexture(data, tw, th, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    disposables.push(tex);
    return tex;
  };
  const splatTex = mapTex(splat);
  const fieldTex = mapTex(field, fw, fh);

  const uniforms = {
    uSplat: { value: splatTex },
    uField: { value: fieldTex },
    uSize: { value: new THREE.Vector2(t.size.x, t.size.z) },
    uCell: { value: t.cell },
    uTexel: { value: new THREE.Vector2(1 / fw, 1 / fh) },
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
vec4 f = texture2D(uField, guv);
float edge = f.r * 255.0 / 8.0 - 8.0;                  // metres inside the street edge (negative = outside)
float halfW = f.g * 255.0 / 8.0;                       // half the width of this street
if (edge > 0.0) {
  // A street. The edge comes from the real street outline, so it is sharp however close you get.
  float grain = vnoise(p * 18.0) * 0.5 + vnoise(p * 70.0) * 0.5;
  float pave = clamp(halfW - 3.4, 0.35, 1.7);           // alleys get a thin kerb, avenues a wide pavement (never so wide it reaches the street's middle)
  if (edge < pave || halfW < 2.4) {
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
    if (halfW > 5.0) {
      line = max(line, smoothstep(0.09, 0.05, abs(edge - (pave + 0.45))));      // edge line
      if (halfW > 4.6) {
        // The centre line, dashed along the street. Skipped where streets meet and the direction is not clear.
        float th = f.b * 3.14159265;
        float along = dot(p, vec2(cos(th), sin(th)));
        float aR = texture2D(uField, guv + vec2(uTexel.x, 0.0)).b, aD = texture2D(uField, guv + vec2(0.0, uTexel.y)).b;
        float dR = abs(aR - f.b), dD = abs(aD - f.b);
        float steady = step(min(dR, 1.0 - dR), 0.03) * step(min(dD, 1.0 - dD), 0.03);
        float dash = step(0.45, fract(along / 7.0));
        float lateral = f.a * 255.0 / 10.625 - 12.0;
        float centre = smoothstep(0.16, 0.08, abs(lateral)) * dash * steady;
        line = max(line, centre);
      }
    }
    col = mix(col, vec3(0.86, 0.84, 0.7), line * 0.85);
  }
} else if (sp.r + sp.g >= sp.b && sp.r + sp.g >= sp.a) {
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

  // ---- the water: murky green-blue lagoon, lighter in the shallows, moving ripples that catch the sun, sky reflection at low angles and
  // foam along the shore
  const waterMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.1, metalness: 0.05 });
  waterMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vGround;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vGround;
uniform sampler2D uSplat;
uniform vec2 uSize;
uniform float uTime;
uniform float uNight;
${NOISE}
float landAt(vec2 q) { vec4 s = texture2D(uSplat, q / uSize); return s.r + s.g + s.b + s.a; }
float waves(vec2 q) { return fbm(q * 0.3 + vec2(uTime * 0.05, uTime * 0.03)) * 0.55 + fbm(q * 1.4 - vec2(uTime * 0.11, uTime * 0.05)) * 0.3 + vnoise(q * 4.5 + vec2(uTime * 0.2, -uTime * 0.13)) * 0.15; }
`,
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
vec2 p = vGround;
float near = 0.0, fine = 0.0;
for (int i = 0; i < 6; i++) {
  float a = float(i) * 1.0472;
  vec2 d = vec2(cos(a), sin(a));
  near += landAt(p + d * 18.0) + landAt(p + d * 42.0);
  fine += landAt(p + d * 2.5) + landAt(p + d * 6.0);
}
near = clamp(near / 6.0, 0.0, 1.0);
fine = clamp(fine / 12.0, 0.0, 1.0);
float ripple = waves(p);
vec3 deep = vec3(0.035, 0.17, 0.23), shallow = vec3(0.19, 0.46, 0.45);
vec3 wcol = mix(deep, shallow, clamp(near * 1.5, 0.0, 1.0)) * (0.85 + 0.3 * ripple);
float foamNoise = fbm(p * 1.1 + vec2(uTime * 0.12, uTime * 0.07));
float foam = smoothstep(0.55, 0.95, fine + 0.3 * (foamNoise - 0.5)) * (0.55 + 0.45 * sin(uTime * 0.9 + foamNoise * 12.0));
wcol = mix(wcol, vec3(0.9, 0.95, 0.95), clamp(foam, 0.0, 1.0) * 0.8);
wcol = mix(wcol, wcol * vec3(0.3, 0.4, 0.55), uNight);
diffuseColor.rgb = wcol;
`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `#include <normal_fragment_maps>
{
  // Moving ripples: tilt the surface a little, less and less with distance so far water stays calm.
  float fade = 1.0 - smoothstep(50.0, 260.0, length(vViewPosition));
  vec2 e = vec2(0.45, 0.0);
  vec2 grad = vec2(waves(p + e.xy) - waves(p - e.xy), waves(p + e.yx) - waves(p - e.yx));
  vec3 nWorld = normalize(vec3(-grad.x * 2.2 * fade, 1.0, -grad.y * 2.2 * fade));
  normal = normalize(mat3(viewMatrix) * nWorld);
}`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `#include <emissivemap_fragment>
{
  // The sky shows in the water most when you look across it at a low angle.
  float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 4.0);
  vec3 sky = mix(vec3(0.55, 0.72, 0.85), vec3(0.04, 0.06, 0.12), uNight);
  totalEmissiveRadiance += sky * fres * 0.55;
}`,
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
