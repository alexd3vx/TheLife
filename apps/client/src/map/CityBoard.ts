import * as THREE from "three";
import { LAGOS_DISTRICTS, LAGOS_ROADS, type District, type Prop } from "@thelife/game-core";
import { loadGLTF } from "../lab/loaders";
import { liteRender } from "../lab/renderTier";
import { addPlane } from "./landmarks";
import { CityModels } from "./cityModels";
import { MeshBuilder } from "./meshBuilder";
import { addProp } from "./props";

/**
 * The city board: Lagos from above as a solid 3D model. Every district is a plate standing in the sea, the buildings are standing
 * solids (the named places have their own models: terminals, stadium stands, port cranes, towers), cars, buses and taxis from the
 * Kenney car kit drive along the real roads, planes take off and land at the airport, boats cross the lagoon, and the sea moves.
 * Drawn with three.js from the same data as the street world. One scene, about a dozen draw calls.
 */

export interface Look {
  night: boolean;
  ocean: string;
  slab: string;
  rgb: { street: readonly number[]; block: readonly number[]; park: readonly number[]; market: readonly number[] };
  walls: string[];
  sky: string;
  light: { hemi: [string, string, number]; sun: string; sunPower: number };
}
export const DAY: Look = {
  night: false, ocean: "#2f78cf", slab: "#7f8aa0", sky: "#8fc0f0",
  rgb: { street: [196, 204, 218], block: [226, 229, 238], park: [150, 204, 160], market: [236, 208, 168] },
  walls: ["#e6ebf5", "#d6deee", "#ede4d2", "#cdd8ec", "#dfe7f6", "#c9d3e4"],
  light: { hemi: ["#dbe8ff", "#8a93a6", 1.5], sun: "#fff1d6", sunPower: 2.4 },
};
export const NIGHT: Look = {
  night: true, ocean: "#123f93", slab: "#2a374b", sky: "#071a3d",
  rgb: { street: [74, 86, 106], block: [52, 64, 82], park: [40, 92, 66], market: [110, 78, 52] },
  walls: ["#6a7fa6", "#5d729a", "#7388b0", "#566a90", "#6b80a8", "#52668c"],
  light: { hemi: ["#9db6f0", "#2a3552", 2.0], sun: "#b4c8ff", sunPower: 1.8 },
};
export const lookFor = (hour: number): Look => (hour < 5.5 || hour >= 18.5 ? NIGHT : DAY);

const FOV = 38;
const PITCH = (55 * Math.PI) / 180;
const SEA_LEVEL = -8;
const BOARD_PROPS = new Set<Prop["kind"]>(["stall", "container", "pitch", "stand", "billboard", "plane", "boat"]);
/** What the board paints a place's building in (a tint of the place's colour). */
const TINT: Record<string, string> = {
  hospital: "#e86a72", bank: "#d8b24a", government: "#6aa8d8", hotel: "#d97aa4", museum: "#c58a5a", station: "#7c88e6", market: "#ee9a4e",
  church: "#b794ec", mosque: "#4fc2bc", police: "#6a8fe0", school: "#eac75c", fire: "#ef7a50", fuel: "#f0b840", stadium: "#6ccf7a", airport: "#7fb0ff", port: "#5aa6d8", park: "#6ccf7a",
};

const hash2 = (x: number, z: number) => ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1 + 1) % 1;

function waterTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#b9c8e0";
  g.fillRect(0, 0, 256, 256);
  g.lineCap = "round";
  for (let i = 0; i < 90; i++) {
    const x = hash2(i, 1) * 256, y = hash2(i, 2) * 256, l = 8 + hash2(i, 3) * 26;
    g.strokeStyle = `rgba(255,255,255,${0.5 + hash2(i, 4) * 0.5})`;
    g.lineWidth = 1 + hash2(i, 5) * 1.6;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + l / 2, y - 3, x + l, y);
    g.stroke();
    // wrap round the edges so the tile joins up
    if (x + l > 256) {
      g.beginPath();
      g.moveTo(x - 256, y);
      g.quadraticCurveTo(x - 256 + l / 2, y - 3, x - 256 + l, y);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function groundTexture(district: District, look: Look): THREE.CanvasTexture {
  const t = district.terrain!;
  const c = document.createElement("canvas");
  c.width = t.width;
  c.height = t.height;
  const g = c.getContext("2d")!;
  const img = g.createImageData(c.width, c.height);
  for (let i = 0; i < t.cls.length; i++) {
    const k = t.cls[i]!;
    const rgb = k === 1 ? look.rgb.street : k === 2 ? look.rgb.block : k === 3 ? look.rgb.park : look.rgb.market;
    const v = (((i * 2654435761) >>> 24) % 7) - 3;
    img.data[i * 4] = rgb[0]! + v;
    img.data[i * 4 + 1] = rgb[1]! + v;
    img.data[i * 4 + 2] = rgb[2]! + v;
    img.data[i * 4 + 3] = k === 0 ? 0 : 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

/** What is not a kit model: the named places' extras are left to the kit, so this is the big props only (stalls, pitches, stands, billboards, aircraft). When the kit cannot load, plain blocks stand in for the buildings. */
function cityGeometry(district: District, look: Look, blocks: boolean): THREE.BufferGeometry | null {
  const b = new MeshBuilder();
  if (blocks) {
    for (const lot of district.lots) {
      if (lot.kind === "stall") continue;
      const f = lot.footprint;
      const h = Math.max(3.4, lot.floors * lot.storey) * 1.18;
      let colour = new THREE.Color(look.walls[lot.colour % look.walls.length]!);
      if (lot.landmark) colour = colour.lerp(new THREE.Color(TINT[lot.landmark] ?? "#ffffff"), 0.5);
      b.box(f.minX, 0, f.minZ, f.maxX, h, f.maxZ, colour, 0.8);
    }
  }
  for (const p of district.props) if (BOARD_PROPS.has(p.kind) && p.kind !== "plane" && p.kind !== "boat" && p.kind !== "container") addProp(b, p, true);
  for (const p of district.props) if (p.kind === "plane") addPlane(b, p.x, p.z, p.variant, true);
  return b.build();
}

interface Mover {
  /** The road (points, cumulative lengths) it drives along. */
  road: number;
  t: number;
  dir: 1 | -1;
  speed: number;
  slot: number;
  model: number;
}
interface RoadLine {
  pts: number[];
  cum: number[];
  half: number;
}

const VEHICLES = ["taxi", "sedan", "suv", "van", "truck", "delivery", "police", "hatchback-sports", "ambulance", "garbage-truck"];

/** Cars, buses and taxis from the Kenney car kit, instanced: each model becomes one InstancedMesh per material. */
class Traffic {
  readonly root = new THREE.Group();
  private readonly movers: Mover[] = [];
  private readonly parts: { mesh: THREE.InstancedMesh; model: number }[] = [];
  private readonly counts: number[] = [];
  private readonly roads: RoadLine[];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly pos = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private gone = false;
  /** Cars are drawn this many times life size, or they would be dots. */
  static readonly SCALE = 4.2;

  constructor() {
    this.roads = [];
    for (const row of LAGOS_ROADS) {
      if (row[0]! < 90) continue; // only the streets wide enough to carry a lane of traffic on the board
      const pts: number[] = [];
      let x = row[1]! / 10, z = row[2]! / 10;
      pts.push(x, z);
      for (let i = 3; i + 1 < row.length; i += 2) {
        x += row[i]! / 10;
        z += row[i + 1]! / 10;
        pts.push(x, z);
      }
      const cum = [0];
      for (let i = 0; i + 3 < pts.length; i += 2) cum.push(cum[cum.length - 1]! + Math.hypot(pts[i + 2]! - pts[i]!, pts[i + 3]! - pts[i + 1]!));
      if (cum[cum.length - 1]! > 60) this.roads.push({ pts, cum, half: row[0]! / 20 });
    }
  }

  async load(count: number): Promise<void> {
    const per = Math.max(2, Math.round(count / VEHICLES.length));
    await Promise.all(
      VEHICLES.map(async (name, model) => {
        let gltf;
        try {
          gltf = await loadGLTF(`${import.meta.env.BASE_URL}assets/vehicles/${name}.glb`);
        } catch {
          return;
        }
        if (this.gone) return;
        gltf.scene.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(gltf.scene.matrixWorld).invert();
        this.counts[model] = per;
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const geo = mesh.geometry.clone();
          geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
          const mat = (mesh.material as THREE.Material).clone() as THREE.MeshStandardMaterial;
          if ("metalness" in mat) mat.metalness = 0.15;
          const im = new THREE.InstancedMesh(geo, mat, per);
          im.frustumCulled = false;
          im.count = 0;
          this.root.add(im);
          this.parts.push({ mesh: im, model });
        });
        for (let i = 0; i < per; i++) this.spawn(model, i);
      }),
    );
  }

  private spawn(model: number, slot: number) {
    if (!this.roads.length) return;
    // longer roads carry more of the traffic
    let total = 0;
    for (const r of this.roads) total += r.cum[r.cum.length - 1]!;
    let pick = Math.random() * total, ri = 0;
    for (; ri < this.roads.length - 1; ri++) {
      pick -= this.roads[ri]!.cum[this.roads[ri]!.cum.length - 1]!;
      if (pick <= 0) break;
    }
    const r = this.roads[ri]!;
    this.movers.push({ road: ri, t: Math.random() * r.cum[r.cum.length - 1]!, dir: Math.random() < 0.5 ? 1 : -1, speed: 14 + Math.random() * 16, slot, model });
  }

  update(dt: number): void {
    const n = new Map<number, number>();
    for (const mv of this.movers) {
      const r = this.roads[mv.road]!;
      const len = r.cum[r.cum.length - 1]!;
      mv.t += mv.dir * mv.speed * dt;
      if (mv.t > len || mv.t < 0) {
        // at the end of the road: turn round and take the other lane
        mv.dir = mv.dir === 1 ? -1 : 1;
        mv.t = Math.max(0, Math.min(len, mv.t));
      }
      let leg = 0;
      while (leg < r.cum.length - 2 && r.cum[leg + 1]! < mv.t) leg++;
      const f = (mv.t - r.cum[leg]!) / Math.max(1e-6, r.cum[leg + 1]! - r.cum[leg]!);
      const ax = r.pts[leg * 2]!, az = r.pts[leg * 2 + 1]!, bx = r.pts[leg * 2 + 2]!, bz = r.pts[leg * 2 + 3]!;
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
      // right-hand traffic: a lane to the right of the way it is heading
      const lane = Math.min(r.half * 0.5, 4);
      const ux = (dx / l) * mv.dir, uz = (dz / l) * mv.dir;
      const x = ax + dx * f - uz * lane, z = az + dz * f + ux * lane;
      const yaw = Math.atan2(ux, uz);
      this.e.set(0, yaw, 0);
      this.q.setFromEuler(this.e);
      this.pos.set(x, 0.1, z);
      this.sc.setScalar(Traffic.SCALE);
      this.m.compose(this.pos, this.q, this.sc);
      const slot = mv.slot;
      for (const p of this.parts) if (p.model === mv.model) p.mesh.setMatrixAt(slot, this.m);
      n.set(mv.model, Math.max(n.get(mv.model) ?? 0, slot + 1));
    }
    for (const p of this.parts) {
      p.mesh.count = n.get(p.model) ?? 0;
      p.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    this.gone = true;
    for (const p of this.parts) {
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
      p.mesh.dispose();
    }
  }
}

/** Planes in the air and boats on the water: the same little models as the street world, moving on loops. */
class Sky {
  readonly root = new THREE.Group();
  private readonly planes: { mesh: THREE.Mesh; phase: number; kind: "circle" | "runway" }[] = [];
  private readonly boats: { mesh: THREE.Mesh; x0: number; z0: number; x1: number; z1: number; t: number; speed: number }[] = [];
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly airport: { x: number; z: number } | null;

  constructor(district: District, look: Look) {
    const planeB = new MeshBuilder();
    addPlane(planeB, 0, 0, 0, true);
    const planeGeo = planeB.build()!;
    planeGeo.scale(3.4, 3.4, 3.4);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
    this.geos.push(planeGeo);
    const ap = district.landmarks.find((l) => l.kind === "airport");
    this.airport = ap ? { x: ap.x, z: ap.z } : null;
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.frustumCulled = false;
      this.root.add(mesh);
      this.planes.push({ mesh, phase: i / 3, kind: i === 0 && ap ? "runway" : "circle" });
    }
    // boats: wooden canoes and small ferries crossing the lagoon and the creeks, between the plates
    const boatB = new MeshBuilder();
    addProp(boatB, { kind: "boat", x: 0, z: 0, yaw: 0, variant: 1 }, true);
    const boatGeo = boatB.build()!;
    boatGeo.scale(3, 3, 3);
    this.geos.push(boatGeo);
    const lanes: [number, number, number, number][] = [
      [840, 840, 1900, 840], [1900, 780, 2600, 800], [100, 880, 700, 880], [1500, 900, 1500, 760], [780, 1960, 1300, 1990], [1400, 2060, 2600, 2000], [1840, 1000, 1840, 1900], [1320, 940, 1320, 1900],
    ];
    for (let i = 0; i < lanes.length; i++) {
      const mesh = new THREE.Mesh(boatGeo, mat);
      mesh.frustumCulled = false;
      this.root.add(mesh);
      const [x0, z0, x1, z1] = lanes[i]!;
      this.boats.push({ mesh, x0, z0, x1, z1, t: (i * 0.37) % 1, speed: 0.012 + (i % 3) * 0.006 });
    }
    void look;
  }

  update(dt: number, time: number): void {
    for (const p of this.planes) {
      const t = (time * 0.012 + p.phase) % 1;
      if (p.kind === "runway" && this.airport) {
        // takes off along the runway, climbs away over the lagoon, comes back round and lands
        const a = this.airport;
        const u = (time * 0.035 + p.phase) % 1;
        const x = a.x - 190 + u * 760, z = 92;
        const climb = Math.max(0, (u - 0.4) / 0.6);
        p.mesh.position.set(x, 3 + climb * climb * 160, z);
        p.mesh.rotation.set(0, 0, climb * 0.35);
      } else {
        const ang = t * Math.PI * 2;
        const cx = 1350, cz = 1050, r = 900;
        p.mesh.position.set(cx + Math.cos(ang) * r * 1.2, 150 + p.phase * 60, cz + Math.sin(ang) * r * 0.7);
        p.mesh.rotation.set(0, -ang - Math.PI / 2 + Math.PI, 0.22);
      }
    }
    for (const b of this.boats) {
      b.t += b.speed * dt * 0.5;
      const k = b.t % 2;
      const u = k < 1 ? k : 2 - k;
      b.mesh.position.set(b.x0 + (b.x1 - b.x0) * u, SEA_LEVEL + 1 + Math.sin(time * 1.6 + b.x0) * 0.5, b.z0 + (b.z1 - b.z0) * u);
      b.mesh.rotation.y = Math.atan2(k < 1 ? b.x1 - b.x0 : b.x0 - b.x1, k < 1 ? b.z1 - b.z0 : b.z0 - b.z1) + Math.PI / 2;
    }
  }

  dispose() {
    for (const g of this.geos) g.dispose();
  }
}

/** The camera looks at (cx, cz) from the south, tilted; `s` is how many screen pixels one metre of ground takes there. */
export class CityBoard {
  readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 20, 40000);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly water: THREE.Mesh;
  private readonly waterTex: THREE.Texture;
  private city: THREE.Mesh | null;
  private city2: THREE.Mesh | null = null;
  private readonly models: CityModels;
  private viewKey = "";
  private readonly ground: THREE.Mesh;
  private readonly lamps: THREE.Points | null;
  private readonly traffic = new Traffic();
  private readonly sky: Sky;
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private w = 1;
  private h = 1;
  private view = { cx: 0, cz: 0, s: 0.5 };
  private time = 0;
  private acc = 0;
  private raf = 0;
  private gone = false;
  private readonly lite = liteRender();
  private readonly tmp = new THREE.Vector3();
  onFrame: () => void = () => {};

  constructor(private readonly canvas: HTMLCanvasElement, private readonly district: District, readonly look: Look) {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.lite, powerPreference: "high-performance" }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lite ? 1.25 : 1.75));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color(look.sky);

    this.hemi = new THREE.HemisphereLight(look.light.hemi[0], look.light.hemi[1], look.light.hemi[2]);
    this.sun = new THREE.DirectionalLight(look.light.sun, look.light.sunPower);
    this.sun.position.set(-600, 900, 500);
    this.scene.add(this.hemi, this.sun);

    // the sea, moving
    this.waterTex = waterTexture();
    this.waterTex.repeat.set(40, 32);
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(14000, 11000).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: look.ocean, map: this.waterTex, toneMapped: false }),
    );
    this.water.position.set(1350, SEA_LEVEL, 1050);
    (this.water.material as THREE.MeshBasicMaterial).color.set(look.ocean).multiplyScalar(look.night ? 1.0 : 1.0);
    this.scene.add(this.water);
    // the plates: a slab under every district, and the ground picture on top (the sea shows through where it is clear)
    const slabMat = new THREE.MeshStandardMaterial({ color: look.slab, roughness: 0.9 });
    for (const d of LAGOS_DISTRICTS) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(d.x1 - d.x0, -SEA_LEVEL + 0.0, d.z1 - d.z0), slabMat);
      slab.position.set((d.x0 + d.x1) / 2, SEA_LEVEL / 2, (d.z0 + d.z1) / 2);
      this.scene.add(slab);
    }
    const t = district.terrain!;
    const gtex = groundTexture(district, look);
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(t.width * t.cell, t.height * t.cell).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: gtex, alphaTest: 0.45, roughness: 0.95 }),
    );
    this.ground.position.set((t.width * t.cell) / 2, 0.06, (t.height * t.cell) / 2);
    this.scene.add(this.ground);

    this.city = this.addCity(cityGeometry(district, look, false));
    this.models = new CityModels(district, look.night, this.lite);
    this.scene.add(this.models.root);
    this.models.load().then(
      () => (this.viewKey = ""),
      (e) => {
        // the kit did not load: plain blocks, so the city is never empty
        if (import.meta.env.DEV) console.warn("city kit", e);
        if (!this.gone) this.city2 = this.addCity(cityGeometry(district, look, true));
      },
    );

    // street lamps: little glowing points along the roads at night
    if (look.night) {
      const pts: number[] = [];
      const lampList = district.lamps;
      for (let i = 0; i < lampList.length; i += 2) pts.push(lampList[i]!.x, 7, lampList[i]!.z);
      for (const p of district.props) if (p.kind === "pole") pts.push(p.x, 8, p.z);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      this.lamps = new THREE.Points(g, new THREE.PointsMaterial({ color: "#ffd98a", size: 9, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
      this.scene.add(this.lamps);
    } else this.lamps = null;

    this.scene.add(this.traffic.root);
    void this.traffic.load(this.lite ? 70 : 140);
    this.sky = new Sky(district, look);
    this.scene.add(this.sky.root);
    this.loop(performance.now());
  }

  private addCity(geo: THREE.BufferGeometry | null): THREE.Mesh | null {
    if (!geo) return null;
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }));
    this.scene.add(m);
    return m;
  }

  setSize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.place();
  }

  setView(cx: number, cz: number, s: number) {
    this.view = { cx, cz, s };
    this.place();
  }

  private place() {
    const { cx, cz, s } = this.view;
    const d = this.h / 2 / (s * Math.tan((FOV * Math.PI) / 360));
    this.camera.position.set(cx, Math.sin(PITCH) * d, cz + Math.cos(PITCH) * d);
    // keep the depth range tight round the board so near and far things never fight over the same depth value
    this.camera.near = Math.max(10, d * 0.12);
    this.camera.far = d * 2.2 + 4000;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(cx, 0, cz);
    this.camera.updateMatrixWorld(true);
  }

  /** Where a point of the world is on the screen (CSS pixels). */
  project(x: number, z: number, y = 0): [number, number] {
    this.tmp.set(x, y, z).project(this.camera);
    return [((this.tmp.x + 1) / 2) * this.w, ((1 - this.tmp.y) / 2) * this.h];
  }

  /** Is the point in front of the camera and on screen (with a margin)? */
  visible(x: number, z: number, y = 0): boolean {
    this.tmp.set(x, y, z).project(this.camera);
    return this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.15 && Math.abs(this.tmp.y) < 1.2;
  }

  /** How many metres of ground a pixel of dragging moves the view, along x and along z. */
  dragScale(): { x: number; z: number } {
    return { x: 1 / this.view.s, z: 1 / (this.view.s * Math.sin(PITCH)) };
  }

  private loop = (now: number) => {
    if (this.gone) return;
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const dt = Math.min(0.1, (now - (this.time || now)) / 1000);
    this.time = now;
    this.acc += dt;
    if (this.lite && this.acc < 0.03) return;
    const step = this.acc;
    this.acc = 0;
    const secs = now / 1000;
    this.waterTex.offset.set((secs * 0.004) % 1, (secs * 0.0025) % 1);
    this.models.update(this.view.cx, this.view.cz, this.view.s);
    this.traffic.update(step);
    this.sky.update(step, secs);
    this.renderer.render(this.scene, this.camera);
    this.onFrame();
  };

  dispose() {
    this.gone = true;
    cancelAnimationFrame(this.raf);
    this.models.dispose();
    this.traffic.dispose();
    this.sky.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Points).isPoints) {
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[];
        for (const x of Array.isArray(mat) ? mat : [mat]) {
          (x as THREE.MeshStandardMaterial).map?.dispose();
          x.dispose();
        }
      }
    });
    this.waterTex.dispose();
    this.renderer.dispose();
    void this.canvas;
  }
}
