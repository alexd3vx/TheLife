import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { blockOutside, blockRect, createNavGrid, findPath, isFree, type NavGrid } from "@thelife/shared";
import { furnitureById, type FurnitureDef } from "@thelife/game-core";
import { createFurniture, type FurnitureInstance } from "../furniture/instance";
import type { AssetManifest } from "../lab/manifest";
import { deriveInteractions, type DerivedItem, type Interaction } from "./interactions";
import type { Layout, Placement } from "./layout";

const CHARACTER_RADIUS = 0.27;
export const NAV_CELL = 0.125; // fine enough that 1.4 m doorways stay open after padding for the character's width

export interface PlacedItem {
  def: Placement;
  catalog: FurnitureDef;
  instance: FurnitureInstance;
  group: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  bounds: THREE.Box3;
}

export interface World {
  scene: THREE.Scene;
  layout: Layout;
  nav: NavGrid;
  items: PlacedItem[];
  /** Placed items that can be tapped (they, or the item they point to, have something to do). */
  pickables: THREE.Object3D[];
  interactions: Map<string, Interaction[]>;
  ground: THREE.Mesh;
  /** What tapping this item does: its own interactions, or those of the item it points to. */
  interactionsFor(itemId: string): Interaction[];
  /** Furniture reacts to being used: doors open, fans spin, the TV glows. */
  updateFurniture(dt: number, time: number, using: ReadonlySet<string>): void;
  /** Lights one item (hover); null clears. */
  highlight(itemId: string | null): void;
  /** Fades the walls between the camera and the house so you can always see in. */
  updateWalls(camera: THREE.Camera, delta: number): void;
  /** Sun, sky and house lights for a time of day (hours, 0-24). */
  setTimeOfDay(hour: number): void;
  /** 0 (day) to 1 (night), as last set. */
  readonly night: number;
  dispose(): void;
}

function canvasTexture(size: number, paint: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const el = document.createElement("canvas");
  el.width = el.height = size;
  const ctx = el.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  paint(ctx);
  const texture = new THREE.CanvasTexture(el);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function woodTexture(): THREE.CanvasTexture {
  return canvasTexture(512, (ctx) => {
    const plank = 64;
    let seed = 9;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let row = 0; row < 8; row++) {
      const tone = 150 + rand() * 40;
      ctx.fillStyle = `rgb(${tone + 30},${tone - 10},${tone - 55})`;
      ctx.fillRect(0, row * plank, 512, plank - 2);
      for (let g = 0; g < 26; g++) {
        ctx.strokeStyle = `rgba(60,30,10,${0.05 + rand() * 0.1})`;
        ctx.beginPath();
        const y = row * plank + rand() * plank;
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(170, y + rand() * 6 - 3, 340, y + rand() * 6 - 3, 512, y);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(40,20,5,.5)";
      ctx.fillRect(0, row * plank + plank - 2, 512, 2);
      ctx.fillRect(rand() * 512, row * plank, 2, plank);
    }
  });
}

function grassTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (ctx) => {
    ctx.fillStyle = "#5c8a3c";
    ctx.fillRect(0, 0, 256, 256);
    let seed = 4;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = `rgba(${40 + rand() * 60},${100 + rand() * 70},${30 + rand() * 40},${0.25 + rand() * 0.4})`;
      ctx.fillRect(rand() * 256, rand() * 256, 2, 4 + rand() * 6);
    }
  });
}

function concreteTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (ctx) => {
    ctx.fillStyle = "#a9a49a";
    ctx.fillRect(0, 0, 256, 256);
    let seed = 2;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 3000; i++) {
      const v = rand() < 0.5 ? 0 : 255;
      ctx.fillStyle = `rgba(${v},${v},${v},${rand() * 0.1})`;
      ctx.fillRect(rand() * 256, rand() * 256, 2, 2);
    }
    ctx.strokeStyle = "rgba(0,0,0,.25)";
    ctx.strokeRect(1, 1, 254, 254);
  });
}

interface WallMesh {
  mesh: THREE.Mesh;
  centre: THREE.Vector3;
  outward: THREE.Vector3 | null;
  opacity: number;
}

const FLOOR_Y = 0;

export async function buildWorld(manifest: AssetManifest, layout: Layout, renderer: THREE.WebGLRenderer, shadowSize: number): Promise<World> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#a9c9e8");
  scene.fog = new THREE.Fog("#a9c9e8", 40, 110);

  // Image-based light so metal, glass and glossy wood have something to reflect.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  // ---- lighting
  const hemi = new THREE.HemisphereLight("#cfe0ff", "#8a7058", 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff0d6", 2.8);
  sun.position.set(-9, 16, 11);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  const area = layout.area;
  const cx = (area.minX + area.maxX) / 2;
  const cz = (area.minZ + area.maxZ) / 2;
  const halfSpan = Math.max(area.maxX - area.minX, area.maxZ - area.minZ) / 2 + 3;
  sun.target.position.set(cx, 0, cz);
  scene.add(sun.target);
  const cam = sun.shadow.camera;
  cam.left = -halfSpan;
  cam.right = halfSpan;
  cam.top = halfSpan;
  cam.bottom = -halfSpan;
  cam.near = 2;
  cam.far = 60 + halfSpan;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);

  // ---- ground
  const house = layout.house;
  const grass = grassTexture();
  grass.repeat.set(24, 24);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  ground.receiveShadow = true;
  scene.add(ground);

  const wood = woodTexture();
  if (house) {
    const concrete = concreteTexture();
    concrete.repeat.set(2, 4);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.2), new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.95 }));
    path.rotation.x = -Math.PI / 2;
    path.position.set(-3, -0.012, 6.6);
    path.receiveShadow = true;
    scene.add(path);

    const b = house.bounds;
    wood.repeat.set(3, 2.25);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((b.minX + b.maxX) / 2, FLOOR_Y, (b.minZ + b.maxZ) / 2);
    floor.receiveShadow = true;
    scene.add(floor);
  } else {
    // Showroom: one big light floor, with faint aisle lines so scale is easy to judge.
    const concrete = concreteTexture();
    concrete.repeat.set((area.maxX - area.minX) / 2, (area.maxZ - area.minZ) / 2);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(area.maxX - area.minX + 4, area.maxZ - area.minZ + 4),
      new THREE.MeshStandardMaterial({ map: concrete, color: "#d8d4cc", roughness: 0.85 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, FLOOR_Y, cz);
    floor.receiveShadow = true;
    scene.add(floor);
  }

  // ---- walls
  const wallMeshes: WallMesh[] = [];
  const wallHeight = house?.wallHeight ?? 2.6;
  const wallThickness = house?.wallThickness ?? 0.2;
  const wallMaterial = new THREE.MeshStandardMaterial({ color: "#efe6d6", roughness: 0.95 });
  for (const wall of layout.walls) {
    const dx = wall.b[0] - wall.a[0];
    const dz = wall.b[1] - wall.a[1];
    const length = Math.hypot(dx, dz);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(dx) > 0 ? length : wallThickness, wallHeight, Math.abs(dz) > 0 ? length : wallThickness), wallMaterial.clone());
    const centre = new THREE.Vector3((wall.a[0] + wall.b[0]) / 2, wallHeight / 2, (wall.a[1] + wall.b[1]) / 2);
    mesh.position.copy(centre);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    wallMeshes.push({ mesh, centre, outward: wall.outward ? new THREE.Vector3(wall.outward[0], 0, wall.outward[1]) : null, opacity: 1 });
  }

  // ---- warm lights inside the house, switched on by setTimeOfDay at dusk
  const houseLights: THREE.PointLight[] = [];
  if (house) {
    for (const [x, z] of [[-3.5, -0.5], [-3.5, 3.0], [3.7, -1.5], [3.7, 3.2]] as const) {
      const light = new THREE.PointLight("#ffcf9a", 0, 9, 1.6);
      light.position.set(x, 2.3, z);
      scene.add(light);
      houseLights.push(light);
    }
  }

  // ---- navigation grid: walls and furniture block, the play area edge blocks
  const nav = createNavGrid(layout.area, NAV_CELL);
  blockOutside(nav, layout.area, 0.4);
  for (const wall of layout.walls) {
    const t = wallThickness / 2;
    blockRect(
      nav,
      { minX: Math.min(wall.a[0], wall.b[0]) - t, maxX: Math.max(wall.a[0], wall.b[0]) + t, minZ: Math.min(wall.a[1], wall.b[1]) - t, maxZ: Math.max(wall.a[1], wall.b[1]) + t },
      CHARACTER_RADIUS,
    );
  }

  // ---- furniture
  const items: PlacedItem[] = [];
  const built = await Promise.all(
    layout.items.map(async (def) => {
      const catalog = furnitureById(def.furniture);
      if (!catalog) throw new Error(`Layout item "${def.id}" uses unknown furniture "${def.furniture}"`);
      const instance = await createFurniture(def.furniture, manifest);
      return { def, catalog, instance };
    }),
  );
  for (const { def, catalog, instance } of built) {
    const group = instance.object;
    group.userData.itemId = def.id;
    group.rotation.y = ((def.rot ?? 0) * Math.PI) / 180;
    const ceiling = instance.meta.ceiling;
    group.position.set(def.x, FLOOR_Y + (def.y ?? 0) + (ceiling ? wallHeight - instance.size.y : 0), def.z);
    const materials: THREE.MeshStandardMaterial[] = [];
    group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const clone = (m: THREE.Material) => {
        const c = m.clone();
        const std = c as THREE.MeshStandardMaterial;
        if (std.isMeshStandardMaterial) {
          std.userData.baseEmissive = std.emissive.clone();
          materials.push(std);
        }
        return c;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
    });
    scene.add(group);
    group.updateMatrixWorld(true);
    items.push({ def, catalog, instance, group, materials, bounds: new THREE.Box3().setFromObject(group) });
  }

  // Items that rest on others take their height from the item below (resolved in dependency order).
  const byId = new Map(items.map((i) => [i.def.id, i]));
  const settled = new Set(items.filter((i) => !i.def.onTopOf).map((i) => i.def.id));
  let remaining = items.filter((i) => i.def.onTopOf);
  for (let pass = 0; pass < 4 && remaining.length; pass++) {
    const next: PlacedItem[] = [];
    for (const item of remaining) {
      const base = byId.get(item.def.onTopOf!);
      if (!base || !settled.has(base.def.id)) {
        next.push(item);
        continue;
      }
      item.group.position.y = base.bounds.max.y + (item.def.y ?? 0);
      item.group.updateMatrixWorld(true);
      item.bounds = new THREE.Box3().setFromObject(item.group);
      settled.add(item.def.id);
    }
    remaining = next;
  }

  // Only things you'd bump into block walking: not rugs, wall-hung pieces, fans or things on tables.
  for (const item of items) {
    const b = item.bounds;
    if (item.def.onTopOf || b.max.y - b.min.y < 0.12 || b.min.y > 0.7) continue;
    blockRect(nav, { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z }, CHARACTER_RADIUS);
  }

  // ---- what you can do with each piece, worked out from its shape
  const derived: DerivedItem[] = items.map((item) => {
    const base = item.def.onTopOf ? byId.get(item.def.onTopOf) : undefined;
    return { def: item.def, category: item.catalog.category, action: item.catalog.action, meta: item.instance.meta, group: item.group, box: item.bounds, reach: base?.bounds ?? item.bounds };
  });
  const start = { x: layout.start.x, z: layout.start.z };
  const reachable = (x: number, z: number) => isFree(nav, x, z) && findPath(nav, start, { x, z }) !== null;
  const interactions = deriveInteractions(derived, reachable);

  // Interaction spots must always be reachable, even if furniture padding covered them.
  for (const list of interactions.values()) {
    for (const interaction of list) {
      const [x, z] = interaction.approach;
      const cellX = Math.floor((x - nav.minX) / nav.cell);
      const cellZ = Math.floor((z - nav.minZ) / nav.cell);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) nav.blocked[(cellZ + dz) * nav.width + (cellX + dx)] = 0;
    }
  }

  function interactionsFor(itemId: string): Interaction[] {
    const own = interactions.get(itemId);
    if (own?.length) return own;
    const via = byId.get(itemId)?.def.via;
    return via ? (interactions.get(via) ?? []) : [];
  }
  const pickables = items.filter((i) => interactionsFor(i.def.id).length > 0).map((i) => i.group);

  // ---- furniture reactions and hover
  function updateFurniture(dt: number, t: number, using: ReadonlySet<string>) {
    for (const item of items) {
      if (!item.instance.animated) continue;
      item.instance.update(dt, { using: using.has(item.def.id), night: currentNight, time: t });
    }
  }
  function highlight(itemId: string | null) {
    for (const item of items) {
      const on = item.def.id === itemId;
      for (const m of item.materials) {
        const base = m.userData.baseEmissive as THREE.Color;
        m.emissive.copy(base);
        if (on) m.emissive.add(new THREE.Color(0x442200));
      }
    }
  }

  const ceilingItems = items.filter((i) => i.instance.meta.ceiling);

  // Walls fade out when the camera is outside them.
  const camPos = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  function updateWalls(camera: THREE.Camera, delta: number) {
    camera.getWorldPosition(camPos);
    // Like any life sim, the ceiling is cut away: ceiling fans only show when the camera is below the ceiling.
    if (house) for (const item of ceilingItems) item.group.visible = camPos.y < wallHeight;
    for (const wall of wallMeshes) {
      if (!wall.outward) continue;
      toCamera.copy(camPos).sub(wall.centre);
      const outside = toCamera.dot(wall.outward) > 0.3;
      const target = outside ? 0.0 : 1;
      wall.opacity += (target - wall.opacity) * Math.min(1, delta * 8);
      const material = wall.mesh.material as THREE.MeshStandardMaterial;
      material.transparent = wall.opacity < 0.99;
      material.opacity = Math.max(wall.opacity, 0);
      wall.mesh.visible = wall.opacity > 0.03;
      material.depthWrite = wall.opacity > 0.5;
    }
  }

  // ---- time of day
  const keys: { hour: number; sky: string; sun: string; sunPower: number; hemi: number; hemiSky: string }[] = [
    { hour: 0, sky: "#0b1226", sun: "#6f86d8", sunPower: 0.25, hemi: 0.3, hemiSky: "#3a4a8a" },
    { hour: 5, sky: "#1d2750", sun: "#8da0e8", sunPower: 0.3, hemi: 0.34, hemiSky: "#4a5a9a" },
    { hour: 6.5, sky: "#f0a06a", sun: "#ffb072", sunPower: 1.6, hemi: 0.55, hemiSky: "#e8b8a0" },
    { hour: 9, sky: "#a9c9e8", sun: "#fff0d6", sunPower: 2.8, hemi: 0.7, hemiSky: "#cfe0ff" },
    { hour: 14, sky: "#9fc4ea", sun: "#fff6e6", sunPower: 3.1, hemi: 0.75, hemiSky: "#cfe4ff" },
    { hour: 17.5, sky: "#e8b078", sun: "#ffb06a", sunPower: 2.2, hemi: 0.6, hemiSky: "#f0c8a0" },
    { hour: 19, sky: "#6a3a52", sun: "#ff8a5a", sunPower: 0.9, hemi: 0.4, hemiSky: "#8a6a9a" },
    { hour: 20.5, sky: "#141b3a", sun: "#6f86d8", sunPower: 0.3, hemi: 0.32, hemiSky: "#3a4a8a" },
    { hour: 24, sky: "#0b1226", sun: "#6f86d8", sunPower: 0.25, hemi: 0.3, hemiSky: "#3a4a8a" },
  ];
  const skyColor = new THREE.Color();
  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();
  let currentNight = 0;
  function setTimeOfDay(hour: number) {
    const h = ((hour % 24) + 24) % 24;
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1]!.hour <= h) i++;
    const a = keys[i]!;
    const b = keys[i + 1]!;
    const t = (h - a.hour) / (b.hour - a.hour);
    skyColor.set(a.sky).lerp(tmpA.set(b.sky), t);
    (scene.background as THREE.Color).copy(skyColor);
    (scene.fog as THREE.Fog).color.copy(skyColor);
    sun.color.set(a.sun).lerp(tmpB.set(b.sun), t);
    sun.intensity = a.sunPower + (b.sunPower - a.sunPower) * t;
    hemi.intensity = a.hemi + (b.hemi - a.hemi) * t;
    hemi.color.set(a.hemiSky).lerp(tmpB.set(b.hemiSky), t);
    scene.environmentIntensity = 0.12 + (hemi.intensity - 0.3) * 1.0;
    // The sun crosses the sky from east (6:00) to west (18:00); at night it becomes a dim moon from the same side.
    const day = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI));
    const angle = ((h - 6) / 12) * Math.PI;
    sun.position.set(cx + Math.cos(angle) * 16 * -1, 6 + day * 12, cz + 9);
    const dark = h < 6.5 || h > 19.5 ? 1 : h < 8 ? (8 - h) / 1.5 : h > 18 ? (h - 18) / 1.5 : 0;
    currentNight = Math.min(1, Math.max(0, dark));
    for (const light of houseLights) light.intensity = currentNight * 14;
  }
  setTimeOfDay(9);

  return {
    scene,
    layout,
    nav,
    items,
    pickables,
    interactions,
    ground,
    interactionsFor,
    updateFurniture,
    highlight,
    updateWalls,
    setTimeOfDay,
    get night() {
      return currentNight;
    },
    dispose() {
      envTexture.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose?.();
      });
    },
  };
}
