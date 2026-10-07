import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Avatar } from "../lab/avatar";
import { createCharacter, resolveLook } from "../lab/character";
import { locomotionRate } from "../lab/locomotion";
import { assetUrl } from "../lab/manifest";
import type { FilmBeat, Tier } from "./filmCanvas";

/**
 * The opening film in real 3D, with the player's own character: the plane over the city at dusk, the landing, the terminal, the ride
 * home in a vehicle that matches the background, and the walk to the front door. Four small sets are built once and far apart; each beat
 * just points the camera at one of them. Everything is simple shapes (a few draw calls), so it runs on a weak phone.
 */

const BEAT_SECS: Record<string, number> = { flight: 5.5, landing: 8.2, taxi: 4, ride: 7.5, home: 3.8, welcome: 4 };

// where each set stands in the world
const SET_CITY = new THREE.Vector3(0, 0, 0);
const SET_AIRPORT = new THREE.Vector3(2000, 0, 0);
const SET_ROAD = new THREE.Vector3(0, 0, 2000);
const SET_HOME = new THREE.Vector3(-2000, 0, 0);

const VEHICLE: Record<Tier, { file: string; tint?: string }> = {
  nepo: { file: "vehicles/suv-luxury.glb" },
  middle: { file: "vehicles/taxi.glb" },
  lapo: { file: "vehicles/van.glb", tint: "#f2c230" },
};

const rand = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

function canvasTex(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const el = document.createElement("canvas");
  el.width = w;
  el.height = h;
  paint(el.getContext("2d")!);
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Film3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(46, 1, 0.5, 4000);
  private beat: FilmBeat = "flight";
  private t = 0;
  private gone = false;

  private plane = new THREE.Group();
  private planeLights: THREE.Mesh[] = [];
  private smoke: { s: THREE.Sprite; age: number; life: number; vx: number; size: number }[] = [];
  private smokeTex: THREE.Texture;
  private vehicle: THREE.Object3D | null = null;
  private traffic: { o: THREE.Object3D; speed: number; lane: number; z0: number }[] = [];
  private lampTrain: THREE.Object3D[] = [];
  private avatar: Avatar | null = null;
  private door = new THREE.Group();
  private tier: Tier;
  private lookJson: string | null | undefined;

  constructor(private canvas: HTMLCanvasElement, tier: Tier, lookJson?: string | null) {
    this.tier = tier;
    this.lookJson = lookJson;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.smokeTex = canvasTex(64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
      g.addColorStop(0, "rgba(255,255,255,.9)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    });
    this.buildSky();
    this.buildLights();
    this.buildCity();
    this.buildAirport();
    this.buildRoad();
    this.buildHome();
    this.buildPlane();
    void this.loadVehicles();
    void this.loadCharacter();
    this.resize();
    window.addEventListener("resize", this.resize);
    this.setBeat("flight");
  }

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // portrait phones get a wider view so the plane and the car stay in frame
    this.camera.fov = this.camera.aspect < 0.8 ? 62 : 46;
    this.camera.updateProjectionMatrix();
  };

  setBeat(kind: FilmBeat) {
    this.beat = kind;
    this.t = 0;
    if (kind === "landing") this.smoke.forEach((p) => this.scene.remove(p.s)), (this.smoke = []);
  }

  dispose() {
    this.gone = true;
    window.removeEventListener("resize", this.resize);
    this.avatar?.dispose();
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------- building the sets

  private buildSky() {
    const sky = canvasTex(8, 256, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, "#100a2c");
      g.addColorStop(0.45, "#3a2466");
      g.addColorStop(0.72, "#b8587a");
      g.addColorStop(0.9, "#f09a6a");
      g.addColorStop(1, "#f6c58a");
      c.fillStyle = g;
      c.fillRect(0, 0, 8, 256);
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3000, 24, 16), new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, fog: false, depthWrite: false }));
    dome.rotation.y = 0;
    this.scene.add(dome);
    const starTex = canvasTex(16, 16, (c) => {
      const g = c.createRadialGradient(8, 8, 0, 8, 8, 8);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 16, 16);
    });
    const stars = new Float32Array(600 * 3);
    const r = rand(7);
    for (let i = 0; i < 600; i++) {
      const a = r() * Math.PI * 2, e = 0.25 + r() * 1.0;
      stars[i * 3] = Math.cos(a) * Math.cos(e) * 2900;
      stars[i * 3 + 1] = Math.sin(e) * 2900;
      stars[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 2900;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(stars, 3));
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: "#ffffff", size: 4, map: starTex, alphaTest: 0.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false })));
    this.scene.fog = new THREE.Fog("#c4708a", 260, 1500);
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight("#ffd8c0", "#3a3560", 1.15));
    const sun = new THREE.DirectionalLight("#ffb07a", 2.4);
    sun.position.set(-400, 120, 300);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight("#8ea4ff", 0.6);
    fill.position.set(300, 200, -200);
    this.scene.add(fill);
  }

  private windowMaterial(): THREE.MeshStandardMaterial {
    const r = rand(11);
    const tex = canvasTex(128, 256, (c) => {
      c.fillStyle = "#2a2540";
      c.fillRect(0, 0, 128, 256);
      for (let y = 6; y < 252; y += 14) for (let x = 6; x < 124; x += 14) {
        c.fillStyle = r() < 0.42 ? (r() < 0.5 ? "#ffd98a" : "#fff0c8") : "#3a3558";
        c.fillRect(x, y, 8, 9);
      }
    }, true);
    tex.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: "#ffffff", emissiveIntensity: 0.55, roughness: 0.9 });
  }

  /** Boxes with windows whose size does not stretch with the building's height. */
  private buildings(list: { x: number; z: number; w: number; d: number; h: number }[], origin: THREE.Vector3, mat: THREE.Material): THREE.Mesh {
    const geos = list.map((b) => {
      const g = new THREE.BoxGeometry(b.w, b.h, b.d);
      const uv = g.getAttribute("uv") as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (b.w / 9), uv.getY(i) * (b.h / 16));
      g.translate(origin.x + b.x, origin.y + b.h / 2, origin.z + b.z);
      return g;
    });
    return new THREE.Mesh(mergeGeometries(geos)!, mat);
  }

  private ground(origin: THREE.Vector3, w: number, d: number, color: string, y = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(origin.x, y, origin.z);
    this.scene.add(m);
    return m;
  }

  private buildCity() {
    const o = SET_CITY;
    // land, then the lagoon running through the middle with a long bridge across it
    this.ground(o, 3000, 3000, "#2c2a44", -0.2);
    const water = this.ground(o, 3000, 260, "#16406e", 0.05);
    (water.material as THREE.MeshStandardMaterial).emissive = new THREE.Color("#0a2850");
    (water.material as THREE.MeshStandardMaterial).roughness = 0.25;
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(60, 3, 380), new THREE.MeshStandardMaterial({ color: "#8c8a96", roughness: 0.8 }));
    bridge.position.set(o.x - 100, 12, o.z);
    this.scene.add(bridge);
    for (let i = -2; i <= 2; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 14, 8), new THREE.MeshStandardMaterial({ color: "#6c6a78" }));
      p.position.set(o.x - 100 + i * 20, 5, o.z + i * 70);
      this.scene.add(p);
    }
    const r = rand(3);
    const list: { x: number; z: number; w: number; d: number; h: number }[] = [];
    for (let i = 0; i < 420; i++) {
      const side = r() < 0.5 ? -1 : 1;
      const z = side * (170 + r() * 900);
      const x = -900 + r() * 1800;
      const downtown = Math.max(0, 1 - Math.hypot(x - 200, z - (side > 0 ? 300 : -300)) / 500);
      list.push({ x, z, w: 14 + r() * 26, d: 14 + r() * 26, h: 14 + r() * 60 + downtown * 140 * r() });
    }
    this.scene.add(this.buildings(list, o, this.windowMaterial()));
  }

  private buildAirport() {
    const o = SET_AIRPORT;
    this.ground(o, 2400, 1400, "#26263a", -0.2);
    const runway = this.ground(o.clone().add(new THREE.Vector3(250, 0, 0)), 760, 46, "#3a3a46", 0.02);
    runway.rotation.z = Math.PI / 2;
    runway.rotation.x = -Math.PI / 2;
    // the markings and edge lights
    const dash = new THREE.BoxGeometry(14, 0.05, 1.2);
    const dashMat = new THREE.MeshBasicMaterial({ color: "#e8e4d8" });
    const light = new THREE.SphereGeometry(0.6, 6, 4);
    const lightMat = new THREE.MeshBasicMaterial({ color: "#ffe9a8" });
    for (let i = 0; i < 40; i++) {
      const d = new THREE.Mesh(dash, dashMat);
      d.position.set(o.x - 120 + i * 18, 0.08, o.z);
      this.scene.add(d);
    }
    for (let i = 0; i < 50; i++) for (const s of [-1, 1]) {
      const l = new THREE.Mesh(light, lightMat);
      l.position.set(o.x - 130 + i * 16, 0.5, o.z + s * 23);
      this.scene.add(l);
    }
    // the terminal: a long glass building with a canopy and a jet bridge
    const term = new THREE.Mesh(new THREE.BoxGeometry(260, 16, 40), new THREE.MeshStandardMaterial({ color: "#2e3f5e", roughness: 0.3, metalness: 0.2, emissive: "#ffd9a0", emissiveIntensity: 0.25 }));
    term.position.set(o.x + 200, 8, o.z - 120);
    this.scene.add(term);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(270, 2, 52), new THREE.MeshStandardMaterial({ color: "#d8dce8" }));
    roof.position.set(o.x + 200, 17, o.z - 118);
    this.scene.add(roof);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 46), new THREE.MeshStandardMaterial({ color: "#b8bcc8" }));
    bridge.position.set(o.x + 222, 5, o.z - 78);
    this.scene.add(bridge);
    const r = rand(5);
    const list = Array.from({ length: 40 }, (_, i) => ({ x: -300 + i * 70 + r() * 20, z: -420 - r() * 160, w: 30, d: 30, h: 20 + r() * 40 }));
    this.scene.add(this.buildings(list, o, this.windowMaterial()));
  }

  private buildRoad() {
    const o = SET_ROAD;
    this.ground(o, 400, 1400, "#34303f", -0.2);
    const road = this.ground(o, 16, 1400, "#23222c", 0.02);
    road.position.y = 0.02;
    // lane dashes and kerbs
    const dash = new THREE.BoxGeometry(0.3, 0.04, 4);
    const dashMat = new THREE.MeshBasicMaterial({ color: "#e9dfb6" });
    for (let i = 0; i < 160; i++) {
      const d = new THREE.Mesh(dash, dashMat);
      d.position.set(o.x, 0.06, o.z - 700 + i * 8.8);
      this.scene.add(d);
    }
    const r = rand(9);
    const list: { x: number; z: number; w: number; d: number; h: number }[] = [];
    for (let i = 0; i < 130; i++) {
      const side = i % 2 ? 1 : -1;
      list.push({ x: side * (16 + r() * 22), z: -690 + Math.floor(i / 2) * 21 + r() * 4, w: 14 + r() * 8, d: 14 + r() * 8, h: 10 + r() * 38 });
    }
    this.scene.add(this.buildings(list, o, this.windowMaterial()));
    // street lamps with a glowing head, and trees
    const pole = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: "#555a66" });
    const head = new THREE.SphereGeometry(0.55, 8, 6);
    const headMat = new THREE.MeshBasicMaterial({ color: "#fff1c8" });
    const trunk = new THREE.CylinderGeometry(0.2, 0.3, 2.6, 6);
    const leaf = new THREE.IcosahedronGeometry(1.8, 1);
    for (let i = 0; i < 60; i++) for (const s of [-1, 1]) {
      const z = o.z - 690 + i * 22;
      const p = new THREE.Mesh(pole, poleMat);
      p.position.set(o.x + s * 9, 3.5, z);
      const h = new THREE.Mesh(head, headMat);
      h.position.set(o.x + s * 8.4, 7.1, z);
      this.scene.add(p, h);
      if (i % 2) {
        const tr = new THREE.Mesh(trunk, new THREE.MeshStandardMaterial({ color: "#5a4030" }));
        tr.position.set(o.x + s * 12.5, 1.3, z + 8);
        const lf = new THREE.Mesh(leaf, new THREE.MeshStandardMaterial({ color: "#2f6b4a", roughness: 1 }));
        lf.position.set(o.x + s * 12.5, 4.0, z + 8);
        this.scene.add(tr, lf);
      }
    }
  }

  private buildHome() {
    const o = SET_HOME;
    this.ground(o, 300, 300, "#2f3a3a", -0.2);
    this.ground(o.clone().add(new THREE.Vector3(0, 0, 40)), 300, 12, "#23222c", 0.02); // the street
    const walls = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 7), new THREE.MeshStandardMaterial({ color: "#d9c9ac", roughness: 1 }));
    walls.position.set(o.x, 2, o.z - 3.5);
    this.scene.add(walls);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.4, 7.8), new THREE.MeshStandardMaterial({ color: "#7a4a3a" }));
    roof.position.set(o.x, 4.2, o.z - 3.5);
    this.scene.add(roof);
    // two windows, a path, a step and the door in its frame (the door swings open at the end of the film)
    for (const x of [-3.2, 3.2]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 0.1), new THREE.MeshStandardMaterial({ color: "#ffd98a", emissive: "#ffcf80", emissiveIntensity: 1.1 }));
      w.position.set(o.x + x, 2.2, o.z + 0.06);
      this.scene.add(w);
    }
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.5, 0.3), new THREE.MeshStandardMaterial({ color: "#5a3c24" }));
    frame.position.set(o.x, 1.25, o.z + 0.02);
    this.scene.add(frame);
    const dark = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.3, 0.1), new THREE.MeshBasicMaterial({ color: "#2a1c10" }));
    dark.position.set(o.x, 1.15, o.z + 0.14);
    this.scene.add(dark);
    const hinge = new THREE.Group();
    hinge.position.set(o.x - 0.6, 0, o.z + 0.2);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.3, 0.07), new THREE.MeshStandardMaterial({ color: "#a37a4f" }));
    leaf.position.set(0.6, 1.15, 0);
    hinge.add(leaf);
    this.door = hinge;
    this.scene.add(hinge);
    const path = this.ground(o.clone().add(new THREE.Vector3(0, 0, 14)), 2.4, 28, "#9a9486", 0.03);
    path.position.z = o.z + 14.2;
    const lamp = new THREE.PointLight("#ffcf90", 60, 22, 1.8);
    lamp.position.set(o.x + 1.6, 3, o.z + 1.5);
    this.scene.add(lamp);
  }

  private buildPlane() {
    const paint = this.tier === "nepo" ? { body: "#f4f1ea", tail: "#c8a24a" } : { body: "#eef0f4", tail: "#1f8a5a" };
    const bodyMat = new THREE.MeshStandardMaterial({ color: paint.body, roughness: 0.4, metalness: 0.1 });
    const tailMat = new THREE.MeshStandardMaterial({ color: paint.tail, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: "#2a2d38", roughness: 0.6 });
    const long = this.tier === "nepo" ? 16 : 40;
    const fus = new THREE.Mesh(new THREE.CapsuleGeometry(this.tier === "nepo" ? 1.5 : 3, long, 6, 16), bodyMat);
    fus.rotation.z = Math.PI / 2;
    this.plane.add(fus);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(this.tier === "nepo" ? 6 : 12, 0.4, this.tier === "nepo" ? 24 : 52), bodyMat);
    wing.position.set(-1, -0.6, 0);
    wing.geometry.translate(0, 0, 0);
    this.plane.add(wing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(7, 9, 0.5), tailMat);
    tail.position.set(-long / 2 - 4, 4.4, 0);
    tail.rotation.z = -0.35;
    this.plane.add(tail);
    const stab = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 16), bodyMat);
    stab.position.set(-long / 2 - 3, 1.2, 0);
    this.plane.add(stab);
    for (const z of this.tier === "nepo" ? [-3] : [-9, 9]) {
      const e = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 5, 12), dark);
      e.rotation.z = Math.PI / 2;
      e.position.set(2, -2.2, z);
      this.plane.add(e);
    }
    if (this.tier === "nepo") {
      const e = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 4, 12), dark);
      e.rotation.z = Math.PI / 2;
      e.position.set(2, -2, 3);
      this.plane.add(e);
    }
    // the windows' glow and the nav lights (red left, green right, a white strobe)
    const win = new THREE.Mesh(new THREE.BoxGeometry(long * 0.7, 0.5, 6.2), new THREE.MeshBasicMaterial({ color: "#ffe6a8" }));
    win.position.set(0, 0.9, 0);
    win.scale.set(1, 1, 0.97);
    this.plane.add(win);
    const lamps: [string, number, number][] = [["#ff3030", -1, this.tier === "nepo" ? -12 : -26], ["#30ff60", -1, this.tier === "nepo" ? 12 : 26], ["#ffffff", -long / 2 - 5, 0]];
    for (const [c, x, z] of lamps) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ color: c }));
      l.position.set(x, 0.2, z);
      this.plane.add(l);
      this.planeLights.push(l);
    }
    this.plane.scale.setScalar(1);
    this.scene.add(this.plane);
  }

  private async loadVehicles() {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const load = (file: string) => loader.loadAsync(assetUrl(file));
    try {
      const spec = VEHICLE[this.tier];
      const car = (await load(spec.file)).scene;
      if (spec.tint) {
        car.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && (m.material as THREE.MeshStandardMaterial).color) {
            const mat = (m.material as THREE.MeshStandardMaterial).clone();
            if (mat.color.getHex() !== 0x000000 && mat.color.r + mat.color.g + mat.color.b > 0.9) mat.color.set(spec.tint!);
            m.material = mat;
          }
        });
      }
      if (this.gone) return;
      this.vehicle = car;
      this.scene.add(car);
      const others = ["vehicles/sedan.glb", "vehicles/suv.glb", "vehicles/truck.glb", "vehicles/delivery.glb", "vehicles/hatchback-sports.glb", "vehicles/van.glb"];
      const r = rand(21);
      const made = await Promise.all(others.map((f) => load(f).then((g) => g.scene).catch(() => null)));
      if (this.gone) return;
      for (let i = 0; i < 9; i++) {
        const base = made[i % made.length];
        if (!base) continue;
        const o = base.clone(true);
        const lane = i % 3 === 0 ? 1 : -1; // some oncoming
        const z0 = SET_ROAD.z - 80 + i * 55 + r() * 20;
        o.rotation.y = lane > 0 ? Math.PI : 0;
        this.scene.add(o);
        this.traffic.push({ o, speed: lane > 0 ? -16 : 11 + r() * 4, lane: lane * (lane > 0 ? 2.6 : -2.6), z0 });
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn("film vehicles", e);
      /* the film still plays without the cars */
    }
  }

  private async loadCharacter() {
    try {
      const a = await createCharacter(resolveLook(this.lookJson));
      if (this.gone) return a.dispose();
      this.avatar = a;
      a.root.visible = false;
      this.scene.add(a.root);
      a.play("Idle_Loop", 0);
    } catch (e) {
      if (import.meta.env.DEV) console.warn("film character", e);
      /* the film still plays without them */
    }
  }

  // ---------------------------------------------------------------- the film

  draw(dt: number) {
    if (this.gone) return;
    this.t += dt;
    const secs = BEAT_SECS[this.beat] ?? 4;
    const k = Math.min(1, this.t / secs);
    this.avatar && (this.avatar.root.visible = this.beat === "home");
    this.vehicle && (this.vehicle.visible = this.beat === "ride" || this.beat === "home");
    for (const l of this.planeLights) l.visible = true;
    // strobe
    this.planeLights[2] && (this.planeLights[2]!.visible = Math.floor(this.t * 2.2) % 2 === 0);
    this.plane.visible = this.beat === "flight" || this.beat === "landing" || this.beat === "taxi";
    this.traffic.forEach((c) => (c.o.visible = this.beat === "ride"));

    switch (this.beat) {
      case "flight": this.flight(k); break;
      case "landing": this.landing(k, dt); break;
      case "taxi": this.taxi(k, dt); break;
      case "ride": this.ride(k); break;
      case "home": this.home(k, dt); break;
      default: this.flight(k);
    }
    // smoke
    for (const p of this.smoke) {
      p.age += dt;
      const a = p.age / p.life;
      p.s.position.x += p.vx * dt;
      p.s.position.y += 1.6 * dt;
      p.s.scale.setScalar(p.size * (1 + a * 4));
      (p.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 0.55 * (1 - a));
    }
    this.renderer.render(this.scene, this.camera);
  }

  private flight(k: number) {
    const o = SET_CITY;
    const x = o.x - 400 + k * 330;
    this.plane.position.set(x, 130, o.z - 40 + Math.sin(k * 3) * 6);
    this.plane.rotation.set(Math.sin(k * 4) * 0.04, 0, -0.04 + Math.sin(k * 3) * 0.05);
    const az = 2.6 + k * 0.7;
    this.camera.position.set(x + Math.cos(az) * 70, 138 - k * 8, this.plane.position.z + Math.sin(az) * 70);
    this.camera.lookAt(x + 10, 126, this.plane.position.z);
  }

  private planeAt(x: number, y: number, pitch: number) {
    this.plane.position.set(SET_AIRPORT.x + x, y, SET_AIRPORT.z);
    this.plane.rotation.set(0, 0, pitch);
  }

  private puff(x: number, z: number, n: number) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, color: "#e8e6ee", transparent: true, depthWrite: false }));
      s.position.set(SET_AIRPORT.x + x, 0.8, SET_AIRPORT.z + z + (Math.random() - 0.5) * 2);
      s.scale.setScalar(2);
      this.scene.add(s);
      this.smoke.push({ s, age: 0, life: 1.6 + Math.random() * 0.8, vx: (Math.random() - 0.3) * 6, size: 2 + Math.random() * 2 });
    }
  }

  private touched = -1;
  private landing(k: number, dt: number) {
    const secs = BEAT_SECS.landing!;
    const t = k * secs;
    const touch = 4.4;
    let x: number, y: number, pitch: number;
    if (t < touch) {
      const a = t / touch;
      x = -230 + t * 66;
      y = 38 * Math.pow(1 - a, 1.5) + 4.2;
      pitch = 0.04 * (1 - a) - 0.01;
    } else {
      const u = t - touch;
      const v = Math.max(6, 66 * Math.exp(-u * 0.6));
      x = -230 + touch * 66 + (66 - v) * 0 + (66 / 0.6) * (1 - Math.exp(-u * 0.6));
      y = 4.2 - Math.min(1, u * 3) * 0.05;
      pitch = Math.max(0, 0.03 - u * 0.04);
      if (this.touched < 0) {
        this.touched = 1;
        this.puff(x - 4, -3, 6);
        this.puff(x - 4, 3, 6);
      } else if (u < 1.4 && Math.random() < dt * 14) this.puff(x - 4, Math.random() < 0.5 ? -3 : 3, 1);
    }
    if (t < 0.1) this.touched = -1;
    this.planeAt(x, y, pitch);
    // a camera at the runway's edge turns to follow the plane
    this.camera.position.set(SET_AIRPORT.x + 60 + k * 60, 3 + k * 2, SET_AIRPORT.z + 38);
    this.camera.lookAt(SET_AIRPORT.x + x, y, SET_AIRPORT.z);
  }

  private taxi(k: number, dt: number) {
    void dt;
    const x = 80 + (1 - Math.pow(1 - k, 2)) * 90;
    this.planeAt(x, 4.2, 0);
    this.plane.position.z = SET_AIRPORT.z - 22 * k;
    this.plane.rotation.y = -0.4 * k;
    this.camera.position.set(SET_AIRPORT.x + 120 + k * 30, 6, SET_AIRPORT.z + 90);
    this.camera.lookAt(SET_AIRPORT.x + x + 20, 8, SET_AIRPORT.z - 40);
  }

  private ride(k: number) {
    const v = this.vehicle;
    const speed = 22;
    const z = SET_ROAD.z - 300 + k * BEAT_SECS.ride! * speed;
    if (v) {
      v.position.set(SET_ROAD.x + 2.6, 0, z);
      v.rotation.set(0, 0, Math.sin(k * 20) * 0.004);
    }
    for (const c of this.traffic) {
      c.o.position.set(SET_ROAD.x + c.lane, 0, c.z0 + k * BEAT_SECS.ride! * c.speed);
    }
    this.camera.position.set(SET_ROAD.x + 2.6 + Math.sin(k * 2) * 0.8, 2.4 + Math.sin(k * 6) * 0.03, z - 7.5);
    this.camera.lookAt(SET_ROAD.x + 2.6, 1.3, z + 6);
  }

  private home(k: number, dt: number) {
    const o = SET_HOME;
    const v = this.vehicle;
    if (v) {
      // parked at the kerb, nose to the gate
      v.position.set(o.x + 5.2, 0, o.z + 10.5);
      v.rotation.set(0, Math.PI, 0);
    }
    const a = this.avatar;
    const walkSecs = 3.0;
    if (a) {
      const w = Math.min(1, (k * BEAT_SECS.home!) / walkSecs);
      const sx = o.x + 3.1, sz = o.z + 9;
      const ex = o.x + 0.05, ez = o.z + 1.7;
      // along the path: first across to the path, then up to the door
      const px = sx + (ex - sx) * Math.min(1, w * 1.5), pz = sz + (ez - sz) * w;
      a.root.position.set(px, 0, pz);
      a.root.rotation.y = Math.atan2(ex - px, ez - pz);
      a.play(w < 1 ? "Walk_Loop" : "Idle_Loop", 0.2);
      a.setSpeed(locomotionRate(w < 1 ? 1.5 : 0, "Walk_Loop"));
      a.update(dt);
    }
    // the door opens as they arrive
    this.door.rotation.y = -Math.min(1, Math.max(0, (k - 0.72) / 0.22)) * 1.35;
    // the camera drifts in from the street
    const t = k;
    this.camera.position.set(o.x - 1.6 + t * 0.6, 1.55, o.z + 14.5 - t * 3);
    this.camera.lookAt(o.x + 1.2, 1.25, o.z + 4.2);
  }
}
