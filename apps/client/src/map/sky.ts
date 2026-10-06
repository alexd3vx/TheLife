import * as THREE from "three";

// The sky: a gradient dome with a sun, stars and drifting clouds, a day that turns smoothly with the clock, and weather (cloud, rain,
// thunderstorms) from the game's forecast. One big sphere, one rain draw call, a few birds.

export type SkyKind = "sunny" | "cloudy" | "rain" | "storm";

const KEYS: { h: number; zenith: string; horizon: string; sun: string }[] = [
  { h: 0, zenith: "#060a1a", horizon: "#0f1830", sun: "#8fa8d8" },
  { h: 5, zenith: "#10173a", horizon: "#3a3558", sun: "#8fa8d8" },
  { h: 6.2, zenith: "#46689e", horizon: "#f0a070", sun: "#ffb27a" },
  { h: 7.6, zenith: "#4f8fd2", horizon: "#c4d8ea", sun: "#ffe2b8" },
  { h: 12, zenith: "#3a82d6", horizon: "#b8d6f0", sun: "#fff4dc" },
  { h: 16.6, zenith: "#4486d4", horizon: "#c6d8ea", sun: "#ffe8c0" },
  { h: 18.2, zenith: "#4a5c98", horizon: "#f09a58", sun: "#ff9560" },
  { h: 19.3, zenith: "#1e2552", horizon: "#74506e", sun: "#8fa8d8" },
  { h: 20.8, zenith: "#0b1126", horizon: "#161f42", sun: "#8fa8d8" },
  { h: 24, zenith: "#060a1a", horizon: "#0f1830", sun: "#8fa8d8" },
];
const COLOURS = KEYS.map((k) => ({ h: k.h, zenith: new THREE.Color(k.zenith), horizon: new THREE.Color(k.horizon), sun: new THREE.Color(k.sun) }));

const COVER: Record<SkyKind, number> = { sunny: 0.2, cloudy: 0.62, rain: 0.86, storm: 1 };
const GREY = new THREE.Color("#69727f");

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always at the far plane
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uZenith, uHorizon, uSunColor, uSunDir;
uniform float uCover, uDay, uTime, uFlash, uDark;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.5));
  // stars
  float night = 1.0 - uDay;
  vec3 sp = floor(d * 260.0);
  float star = step(0.9965, hash(sp.xy + sp.z * 7.3)) * smoothstep(0.05, 0.4, d.y) * night * (1.0 - uCover);
  col += vec3(star);
  // the sun (or moon) and its glow
  float sd = max(dot(d, uSunDir), 0.0);
  float disc = smoothstep(0.9993, 0.9998, sd);
  col += uSunColor * (disc * 4.0 + pow(sd, 8.0) * 0.28 * (1.0 - uCover * 0.8));
  // clouds on a flat layer
  float up = max(d.y, 0.02);
  vec2 cp = d.xz / (up + 0.18) * 0.9 + vec2(uTime * 0.006, uTime * 0.002);
  float n = fbm(cp * 1.3);
  float edge = 1.0 - uCover * 0.85;
  float cl = smoothstep(edge - 0.12, edge + 0.2, n) * smoothstep(0.0, 0.22, d.y);
  vec3 lit = mix(vec3(1.0), uSunColor, 0.35) * mix(0.35, 1.0, uDay);
  vec3 cloud = mix(lit, GREYDARK * mix(0.3, 1.0, uDay), uDark * (0.4 + 0.6 * smoothstep(edge, edge + 0.4, n)));
  col = mix(col, cloud, cl * 0.92);
  col += vec3(0.75, 0.8, 1.0) * uFlash * (0.5 + cl);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`.replace("GREYDARK", "vec3(0.32, 0.35, 0.4)");

const RAIN_VERT = /* glsl */ `
attribute float aEnd;
attribute float aRank;
uniform float uTime, uAmount;
uniform vec3 uCam;
uniform vec3 uBox;
void main() {
  vec3 base = position;
  base.y -= uTime * 16.0;
  base.x += uTime * 2.2;
  vec3 rel = mod(base - uCam + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 p = uCam + rel;
  p += aEnd * vec3(0.18, 0.9, 0.0);
  float keep = step(aRank, uAmount);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  gl_Position.w = mix(-1.0, gl_Position.w, keep); // dropped streaks fall outside the view
}`;
const RAIN_FRAG = /* glsl */ `
uniform float uAlpha;
void main() { gl_FragColor = vec4(0.78, 0.85, 0.95, uAlpha); }`;

export class SkySystem {
  private readonly dome: THREE.Mesh;
  private readonly rain: THREE.LineSegments;
  private readonly rainMat: THREE.ShaderMaterial;
  private readonly uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uCover: { value: 0.2 },
    uDay: { value: 1 },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uDark: { value: 0 },
  };
  private hour = 12;
  private kind: SkyKind = "sunny";
  private cover = 0.2;
  private rainAmount = 0;
  private rainTarget = 0;
  private time = 0;
  private flash = 0;
  private nextBolt = 8;
  private readonly zenith = new THREE.Color();
  private readonly horizon = new THREE.Color();
  private readonly sunCol = new THREE.Color();
  private readonly tmp = new THREE.Color();
  private nightState: boolean | null = null;
  private readonly birds: THREE.InstancedMesh;
  private readonly birdGeo: THREE.BufferGeometry;
  private readonly birdMat = new THREE.MeshBasicMaterial({ color: "#1b1d22", side: THREE.DoubleSide });
  private readonly birdCount: number;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();

  /** 0 (night) to 1 (full day) of how bright it is, for lamps, lights and the world to match. */
  daylight = 1;
  /** How much rain is falling right now, 0 to 1. */
  get raining(): number {
    return this.rainAmount;
  }
  /** How much of the sky is cloud, 0 to 1. */
  get cloud(): number {
    return this.cover;
  }
  onNight?: (night: boolean) => void;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly hemi: THREE.HemisphereLight,
    private readonly sun: THREE.DirectionalLight,
    private readonly sunOffset: THREE.Vector3,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly background: THREE.Color,
    lowEnd: boolean,
  ) {
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // Rain: short streaks that wrap around the camera inside a box.
    const n = lowEnd ? 700 : 1500;
    const box = new THREE.Vector3(46, 34, 46);
    const pos = new Float32Array(n * 6), end = new Float32Array(n * 2), rank = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * box.x, y = Math.random() * box.y, z = Math.random() * box.z;
      pos.set([x, y, z, x, y, z], i * 6);
      end[i * 2] = 0;
      end[i * 2 + 1] = 1;
      rank[i * 2] = rank[i * 2 + 1] = i / n;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aEnd", new THREE.BufferAttribute(end, 1));
    g.setAttribute("aRank", new THREE.BufferAttribute(rank, 1));
    this.rainMat = new THREE.ShaderMaterial({ vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: box }, uAlpha: { value: 0.32 } } });
    this.rain = new THREE.LineSegments(g, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);

    // Kites and egrets gliding high over the city.
    this.birdCount = lowEnd ? 5 : 9;
    this.birdGeo = new THREE.BufferGeometry();
    this.birdGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-2.2, 0, 0.2, 0, 0, -0.4, 0, 0, 0.6, 2.2, 0, 0.2, 0, 0, 0.6, 0, 0, -0.4]), 3));
    this.birds = new THREE.InstancedMesh(this.birdGeo, this.birdMat, this.birdCount);
    this.birds.frustumCulled = false;
    scene.add(this.birds);
  }

  setHour(hour: number): void {
    this.hour = ((hour % 24) + 24) % 24;
  }

  setWeather(kind: SkyKind): void {
    this.kind = kind;
  }

  private palette(): void {
    const h = this.hour;
    let i = 0;
    while (i < COLOURS.length - 2 && h >= COLOURS[i + 1]!.h) i++;
    const a = COLOURS[i]!, b = COLOURS[i + 1]!;
    const t = Math.max(0, Math.min(1, (h - a.h) / (b.h - a.h)));
    this.zenith.copy(a.zenith).lerp(b.zenith, t);
    this.horizon.copy(a.horizon).lerp(b.horizon, t);
    this.sunCol.copy(a.sun).lerp(b.sun, t);
  }

  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3, drawDistance: number): void {
    this.time += dt;
    this.palette();
    // Weather eases in and out; "rain" comes and goes in showers.
    const wantCover = COVER[this.kind];
    this.cover += (wantCover - this.cover) * Math.min(1, dt * 0.35);
    const shower = 0.5 + 0.5 * Math.sin(this.time * 0.045) * Math.sin(this.time * 0.017 + 1.3);
    this.rainTarget = this.kind === "storm" ? 1 : this.kind === "rain" ? 0.25 + 0.75 * Math.max(0, shower * 1.4 - 0.1) : 0;
    this.rainAmount += (this.rainTarget - this.rainAmount) * Math.min(1, dt * 0.5);

    // The sun's path: up in the east at 6, over at noon, down in the west at 18.
    const h = this.hour;
    const dayT = (h - 6) / 12; // 0 to 1 across the day
    const alt = Math.sin(Math.max(0, Math.min(1, dayT)) * Math.PI);
    const dayLight = THREE.MathUtils.smoothstep(h, 5.6, 7.2) * (1 - THREE.MathUtils.smoothstep(h, 17.6, 19.2));
    this.daylight = dayLight;
    const isNight = dayLight < 0.12;
    const dir = new THREE.Vector3();
    if (dayLight > 0.02) dir.set(Math.cos(Math.PI * dayT), 0.12 + alt * 0.88, -0.35).normalize();
    else dir.set(-0.4, 0.85, 0.3).normalize(); // the moon
    this.uniforms.uSunDir.value.copy(dir);
    this.sunOffset.copy(dir).multiplyScalar(70);
    if (this.sunOffset.y < 14) this.sunOffset.y = 14;

    const c = this.cover;
    const grey = this.tmp.copy(GREY).multiplyScalar(0.35 + 0.65 * dayLight);
    this.uniforms.uZenith.value.copy(this.zenith).lerp(grey, c * 0.7);
    this.uniforms.uHorizon.value.copy(this.horizon).lerp(grey, c * 0.6);
    this.uniforms.uSunColor.value.copy(this.sunCol);
    this.uniforms.uCover.value = c;
    this.uniforms.uDay.value = dayLight;
    this.uniforms.uTime.value = this.time;
    this.uniforms.uDark.value = Math.max(0, (c - 0.5) * 2);

    // Lightning in a storm.
    this.flash = Math.max(0, this.flash - dt * 3.2);
    if (this.kind === "storm") {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.flash = 1;
        this.nextBolt = 5 + Math.random() * 11;
      }
    }
    this.uniforms.uFlash.value = this.flash * 0.7;

    // Light on the world.
    const dim = 1 - 0.72 * c;
    this.sun.intensity = (isNight ? 0.35 : 2.6 * Math.max(0.05, dayLight)) * (isNight ? 1 : dim) + this.flash * 1.5;
    this.sun.color.copy(this.sunCol);
    this.hemi.intensity = (0.38 + 0.47 * dayLight) * (1 - 0.12 * c) + this.flash * 0.9;
    this.hemi.color.copy(this.uniforms.uZenith.value).lerp(new THREE.Color("#ffffff"), 0.55);
    this.renderer.toneMappingExposure = isNight ? 1.25 : 1 + (c > 0.6 ? 0.1 : 0);

    // Fog takes the colour of the horizon, and closes in with rain.
    this.background.copy(this.uniforms.uHorizon.value);
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.copy(this.background);
      const near = isNight ? 90 : 140, far = isNight ? 360 : 330;
      const closing = 1 - 0.55 * this.rainAmount - 0.15 * c;
      fog.near = near * drawDistance * closing;
      fog.far = far * drawDistance * closing;
    }

    // Rain streaks follow the camera.
    this.rain.visible = this.rainAmount > 0.02;
    this.rainMat.uniforms.uTime!.value = this.time;
    this.rainMat.uniforms.uAmount!.value = this.rainAmount;
    (this.rainMat.uniforms.uCam!.value as THREE.Vector3).copy(camera.position);
    this.rainMat.uniforms.uAlpha!.value = 0.22 + 0.18 * this.rainAmount;

    // The dome stays centred on the camera.
    this.dome.position.copy(camera.position);

    // Birds circle over the player on fair days.
    const show = dayLight > 0.3 && this.rainAmount < 0.1 && this.kind !== "storm";
    this.birds.visible = show;
    if (show) {
      for (let i = 0; i < this.birdCount; i++) {
        const r = 40 + (i % 4) * 22, speed = (0.07 + (i % 3) * 0.02) * (i % 2 ? 1 : -1);
        const a = this.time * speed + i * 2.1;
        const y = 48 + (i % 5) * 9 + Math.sin(this.time * 0.3 + i) * 2;
        this.e.set(Math.sin(this.time * 0.8 + i) * 0.12, a + (speed > 0 ? Math.PI : 0), 0.18 * Math.sign(speed));
        this.q.setFromEuler(this.e);
        this.m.compose(new THREE.Vector3(focus.x + Math.cos(a) * r, y, focus.z + Math.sin(a) * r), this.q, new THREE.Vector3(1.6, 1, 1.6));
        this.birds.setMatrixAt(i, this.m);
      }
      this.birds.instanceMatrix.needsUpdate = true;
    }

    if (this.nightState !== isNight) {
      this.nightState = isNight;
      this.onNight?.(isNight);
    }
  }

  dispose(): void {
    this.dome.removeFromParent();
    (this.dome.material as THREE.Material).dispose();
    this.dome.geometry.dispose();
    this.rain.removeFromParent();
    this.rain.geometry.dispose();
    this.rainMat.dispose();
    this.birds.removeFromParent();
    this.birds.dispose();
    this.birdGeo.dispose();
    this.birdMat.dispose();
  }
}
