import * as THREE from "three";
import { liteRender } from "../lab/renderTier";
import { hash, loadKitLibrary, lotMatrix, type KitLibrary, type Model } from "../map/kit";
import { loadCar } from "../map/vehicleKit";
import { buildKeke, buildOkada } from "../map/vehicles3d";

/**
 * A short real-3D scene of a Lagos street: the road, buildings and trees from the city kit, traffic coming the other way, and the
 * vehicle you are in (a danfo, a keke, a taxi, your driver's car). Used for the ride between two places and, without a hero vehicle,
 * as the slow street behind "welcome back". Everything is a real model; nothing is drawn flat.
 */
export type RideKind = "danfo" | "keke" | "taxi" | "driver" | "okada";

const ROAD_HALF = 7;
const LANE_HERO = -2.6; // z of the hero's lane (driving towards -x)
const LANE_ONCOMING = 2.6;

interface Sky {
  top: string;
  bottom: string;
  sun: string;
  sunPower: number;
  hemi: number;
}
/** The look of the sky by hour: dawn, day, golden hour, dusk, night. */
function skyAt(hour: number): Sky {
  if (hour < 5 || hour >= 20) return { top: "#2a3f78", bottom: "#3b4c80", sun: "#aebfff", sunPower: 1.5, hemi: 1.7 };
  if (hour < 7.5) return { top: "#5a78b8", bottom: "#f4b78a", sun: "#ffc79a", sunPower: 1.8, hemi: 1.1 };
  if (hour < 16.5) return { top: "#4d8fe0", bottom: "#cfe6fb", sun: "#fff4dc", sunPower: 2.8, hemi: 1.5 };
  if (hour < 18.5) return { top: "#5878c0", bottom: "#ffc58a", sun: "#ffbd7a", sunPower: 2.4, hemi: 1.2 };
  return { top: "#2b2f6b", bottom: "#d98a78", sun: "#ff9d74", sunPower: 1.4, hemi: 1.0 };
}

function asphalt(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#4a4d55";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${hash(i, 1) > 0.5 ? 255 : 0},${hash(i, 1) > 0.5 ? 255 : 0},${hash(i, 1) > 0.5 ? 255 : 0},0.04)`;
    g.fillRect(hash(i, 2) * 256, hash(i, 3) * 256, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Mover {
  obj: THREE.Object3D;
  speed: number;
  dir: 1 | -1;
}

export class RideScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.2, 700);
  private readonly lite = liteRender();
  private readonly movers: Mover[] = [];
  private hero: THREE.Object3D | null = null;
  private clock = 0;
  private acc = 0;
  private gone = false;
  private readonly sun: THREE.DirectionalLight;
  private readonly disposables: { dispose(): void }[] = [];
  private readonly heroSpeed: number;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly opts: { ride: RideKind | null; hour: number; mode: "ride" | "welcome" }) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.lite, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lite ? 1.25 : 1.6));
    this.renderer.shadowMap.enabled = !this.lite;
    const sky = skyAt(opts.hour);
    const horizon = new THREE.Color(sky.bottom);
    this.scene.background = horizon;
    this.scene.fog = new THREE.Fog(horizon, 70, 330);
    const hemi = new THREE.HemisphereLight(sky.top, "#8a8478", sky.hemi);
    this.sun = new THREE.DirectionalLight(sky.sun, sky.sunPower);
    this.sun.position.set(-40, 60, 30);
    if (!this.lite) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      Object.assign(this.sun.shadow.camera, { left: -30, right: 30, top: 20, bottom: -20, near: 5, far: 150 });
    }
    this.scene.add(hemi, this.sun, this.sun.target);
    this.heroSpeed = opts.ride === "keke" ? 9 : opts.ride === "danfo" ? 10 : 12;
    this.buildStreet();
    void this.populate();
    this.resize();
    window.addEventListener("resize", this.resize);
  }

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 58 : 42;
    this.camera.updateProjectionMatrix();
  };

  /** The road, the pavements and the ground, long enough for the whole drive. */
  private buildStreet() {
    const tex = asphalt();
    tex.repeat.set(60, 3);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(900, ROAD_HALF * 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    road.receiveShadow = true;
    this.scene.add(road);
    // the dashed centre line and the edge lines
    const paint = new THREE.MeshBasicMaterial({ color: "#e9e6d8", toneMapped: false });
    for (let x = -440; x < 440; x += 8) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.16).rotateX(-Math.PI / 2), paint);
      dash.position.set(x, 0.02, 0);
      this.scene.add(dash);
    }
    for (const z of [-ROAD_HALF + 0.5, ROAD_HALF - 0.5]) {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(900, 0.12).rotateX(-Math.PI / 2), paint);
      edge.position.set(0, 0.02, z);
      this.scene.add(edge);
    }
    const walk = new THREE.MeshStandardMaterial({ color: "#b9b2a4", roughness: 0.95 });
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(900, 0.22, 3.2), walk);
      w.position.set(0, 0.11, s * (ROAD_HALF + 1.6));
      w.receiveShadow = true;
      this.scene.add(w);
      const yard = new THREE.Mesh(new THREE.PlaneGeometry(900, 90).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#a79f8c", roughness: 1 }));
      yard.position.set(0, 0.01, s * (ROAD_HALF + 3.2 + 45));
      this.scene.add(yard);
    }
    // power poles with their cables
    const pole = new THREE.MeshStandardMaterial({ color: "#6b5640", roughness: 0.9 });
    const wire: number[] = [];
    for (let x = -420; x <= 420; x += 34) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 8.4, 8), pole);
      p.position.set(x, 4.2, ROAD_HALF + 2.4);
      p.castShadow = true;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.9), pole);
      arm.position.set(x, 7.8, ROAD_HALF + 2.4);
      this.scene.add(p, arm);
      if (x < 420) for (const dz of [-0.8, 0, 0.8]) wire.push(x, 7.75, ROAD_HALF + 2.4 + dz, x + 17, 7.35, ROAD_HALF + 2.4 + dz, x + 17, 7.35, ROAD_HALF + 2.4 + dz, x + 34, 7.75, ROAD_HALF + 2.4 + dz);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", new THREE.Float32BufferAttribute(wire, 3));
    this.scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: "#1c1d20" })));
    this.disposables.push(wg, tex);
  }

  /** Buildings and trees from the city kit along both sides, then the vehicles. */
  private async populate() {
    let lib: KitLibrary | null = null;
    try {
      lib = await loadKitLibrary();
    } catch {
      lib = null;
    }
    if (this.gone) return;
    if (lib) this.lineStreet(lib);
    await this.vehicles();
  }

  private lineStreet(lib: KitLibrary) {
    const buckets = new Map<Model, THREE.Matrix4[]>();
    const m = new THREE.Matrix4();
    for (const side of [-1, 1]) {
      let x = -430;
      let i = 0;
      while (x < 430) {
        const w = 10 + hash(x, side) * 12, d = 12 + hash(side, x) * 8;
        const pool = hash(x * 3, side) < 0.45 ? lib.housesFull : lib.towersFull;
        const floors = pool === lib.housesFull ? 1 + Math.floor(hash(x, 9) * 2) : 2 + Math.floor(hash(x, 7) * 5);
        const fakeLot = {
          footprint: { minX: x, maxX: x + w, minZ: side > 0 ? ROAD_HALF + 7 : -ROAD_HALF - 7 - d, maxZ: side > 0 ? ROAD_HALF + 7 + d : -ROAD_HALF - 7 },
          floors, storey: 3.2, facing: side > 0 ? 0 : 2, kind: "house", yaw: 0,
        };
        const model = pool[Math.floor(hash(x, side * 5) * pool.length)]!;
        const list = buckets.get(model) ?? buckets.set(model, []).get(model)!;
        list.push(lotMatrix(fakeLot as never, model, floors * 3.2, m).clone());
        x += w + 3 + hash(x, 4) * 5;
        i++;
      }
    }
    for (const [model, mats] of buckets) {
      const im = new THREE.InstancedMesh(model.geo, model.mat, mats.length);
      mats.forEach((mm, k) => im.setMatrixAt(k, mm));
      im.castShadow = !this.lite;
      im.receiveShadow = !this.lite;
      this.scene.add(im);
      this.disposables.push(im);
    }
    const tree = lib.sub.get("tree-large");
    if (tree) {
      const ms: THREE.Matrix4[] = [];
      for (let x = -420; x < 420; x += 13) for (const side of [-1, 1]) {
        if (hash(x, side + 3) < 0.35) continue;
        const s = (7 + hash(x, side) * 3) / Math.max(1e-3, tree.bh);
        ms.push(new THREE.Matrix4().compose(new THREE.Vector3(x + hash(side, x) * 5, 0.2, side * (ROAD_HALF + 3.0)), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
      }
      const im = new THREE.InstancedMesh(tree.geo, tree.mat, ms.length);
      ms.forEach((mm, k) => im.setMatrixAt(k, mm));
      im.castShadow = !this.lite;
      this.scene.add(im);
      this.disposables.push(im);
    }
  }

  /** A vehicle model as an object: a kit car, or our own okada or keke. */
  private async vehicleObject(kind: RideKind | "sedan" | "hatch" | "suv" | "van"): Promise<THREE.Object3D> {
    const g = new THREE.Group();
    const car = async (file: string, length: number, tint?: string) => {
      const c = await loadCar(file, length);
      for (const p of c.parts) {
        const mat = p.mat.clone();
        if (tint) mat.color.set(tint).multiplyScalar(2.3); // the kit's colour picture is dark; a bright tint lifts it
        const mesh = new THREE.Mesh(p.geo, mat);
        mesh.castShadow = !this.lite;
        g.add(mesh);
        this.disposables.push(mat);
      }
    };
    switch (kind) {
      case "taxi": await car("taxi", 4.5); break;
      case "driver": await car("suv-luxury", 4.9, "#2a2d36"); break;
      case "danfo": await car("van", 5.4, "#f6c92a"); break;
      case "sedan": await car("sedan", 4.5); break;
      case "hatch": await car("hatchback-sports", 4.1); break;
      case "suv": await car("suv", 4.8); break;
      case "van": await car("delivery", 5.2); break;
      case "keke": {
        const geo = buildKeke();
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }));
        mesh.castShadow = !this.lite;
        g.add(mesh);
        this.disposables.push(geo);
        break;
      }
      case "okada": {
        const geo = buildOkada();
        g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })));
        this.disposables.push(geo);
        break;
      }
    }
    return g;
  }

  private async vehicles() {
    try {
      if (this.opts.ride) {
        const hero = await this.vehicleObject(this.opts.ride);
        if (this.gone) return;
        hero.position.set(0, 0.02, LANE_HERO);
        hero.rotation.y = -Math.PI / 2; // front towards -x
        this.hero = hero;
        this.scene.add(hero);
      }
      // traffic coming the other way, a slow okada and a keke in the same lane, and a car ahead
      const specs: { kind: RideKind | "sedan" | "hatch" | "suv" | "van"; x: number; speed: number; dir: 1 | -1; z: number }[] = [
        { kind: "sedan", x: -150, speed: 10, dir: 1, z: LANE_ONCOMING },
        { kind: "okada", x: -90, speed: 12, dir: 1, z: LANE_ONCOMING + 1.6 },
        { kind: "suv", x: -40, speed: 9, dir: 1, z: LANE_ONCOMING },
        { kind: "keke", x: 10, speed: 8, dir: 1, z: LANE_ONCOMING + 0.8 },
        { kind: "van", x: 60, speed: 9, dir: 1, z: LANE_ONCOMING },
        { kind: "hatch", x: 110, speed: 11, dir: 1, z: LANE_ONCOMING },
        { kind: "taxi", x: 190, speed: 10, dir: 1, z: LANE_ONCOMING },
        { kind: "okada", x: -40 - 60 * 1, speed: 7, dir: -1, z: LANE_HERO - 2.2 },
        { kind: "sedan", x: -120, speed: this.opts.mode === "ride" ? 6 : 5, dir: -1, z: LANE_HERO },
        { kind: "suv", x: -260, speed: 8, dir: -1, z: LANE_HERO },
      ];
      for (const s of specs) {
        const obj = await this.vehicleObject(s.kind);
        if (this.gone) return;
        obj.position.set(s.x, 0.02, s.z);
        obj.rotation.y = s.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
        this.scene.add(obj);
        this.movers.push({ obj, speed: s.speed, dir: s.dir });
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn("ride scene vehicles", e);
    }
  }

  draw(dt: number) {
    if (this.gone) return;
    this.acc += dt;
    if (this.lite && this.acc < 0.03) return;
    dt = this.acc;
    this.acc = 0;
    this.clock += dt;
    const t = this.clock;
    for (const m of this.movers) {
      m.obj.position.x += m.dir * m.speed * dt;
      if (m.obj.position.x > 260) m.obj.position.x = -260;
      if (m.obj.position.x < -260) m.obj.position.x = 260;
      m.obj.position.y = 0.02 + Math.sin(t * 9 + m.speed) * 0.012;
    }
    if (this.opts.mode === "ride" && this.hero) {
      this.hero.position.x -= this.heroSpeed * dt;
      this.hero.position.y = 0.02 + Math.sin(t * 11) * 0.015;
      this.hero.rotation.z = Math.sin(t * 5) * 0.008;
      // a tracking shot that slides from behind the vehicle round to its front quarter
      const k = Math.min(1, t / 6);
      const ease = k * k * (3 - 2 * k);
      const hx = this.hero.position.x;
      this.camera.position.set(hx + 5 - ease * 8.5, 1.45 + ease * 0.3, LANE_HERO + 6.4 - ease * 1.2);
      this.camera.lookAt(hx - 0.4 - ease * 1.2, 0.95, LANE_HERO);
      this.sun.position.set(hx - 30, 60, 30);
      this.sun.target.position.set(hx, 0, 0);
    } else {
      // welcome: the camera drifts slowly along the pavement
      const x = -20 + t * 2.4;
      this.camera.position.set(x, 1.7, ROAD_HALF + 1.2);
      this.camera.lookAt(x + 18, 2.2, -2);
      this.sun.position.set(x - 30, 60, 30);
      this.sun.target.position.set(x, 0, 0);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.gone = true;
    window.removeEventListener("resize", this.resize);
    for (const d of this.disposables) d.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !(mesh as unknown as THREE.InstancedMesh).isInstancedMesh && mesh.geometry) {
        // shared kit and car geometry stays; our own planes and boxes go
        if (mesh.geometry.type === "PlaneGeometry" || mesh.geometry.type === "BoxGeometry" || mesh.geometry.type === "CylinderGeometry") mesh.geometry.dispose();
      }
    });
    this.renderer.dispose();
  }
}
