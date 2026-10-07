import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { blockOutside, blockRect, createNavGrid, findPath, isFree, nearestFree, type NavGrid } from "@thelife/shared";
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
  /** The sun, so the settings can change its shadows. */
  sun: THREE.DirectionalLight;
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
  /** Uploads every texture to the graphics card and compiles shaders now, so nothing stalls once play starts. */
  prewarm(renderer: THREE.WebGLRenderer, camera: THREE.Camera): Promise<void>;
  /** Fades the walls between the camera and the house so you can always see in. */
  updateWalls(camera: THREE.Camera, delta: number): void;
  /** Sun, sky and house lights for a time of day (hours, 0-24). */
  setTimeOfDay(hour: number): void;
  /** Puts the furniture where a changed layout says (pieces moved, sold or bought), keeping the pieces that didn't change. */
  relayout(next: Layout): Promise<void>;
  /** Can this piece (a placed one by id, or a new one of this furniture and size) stand here? Inside the walls, clear of other furniture, and not shutting anything in. */
  fits(selfId: string | null, furniture: string, size: THREE.Vector3, x: number, z: number, rotDeg: number, why?: { r: string }): boolean;
  /** The size of a piece of furniture in metres. */
  sizeOf(furniture: string): Promise<THREE.Vector3>;
  /** The free spot nearest the middle of the house for a piece of furniture. */
  findSpot(furniture: string, size: THREE.Vector3): { x: number; z: number } | null;
  /** The front door (null in the showroom): its parts for picking, where it stands, and a way to close or open its leaf. */
  frontDoor: { parts: THREE.Object3D[]; x: number; z: number; setLocked(locked: boolean): void } | null;
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

export function grassTexture(): THREE.CanvasTexture {
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

/** Painted plaster: a warm base with soft mottling and faint trowel strokes, tileable. */
function plasterTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = "#e8e0d2";
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 6 + Math.random() * 26;
    const l = 205 + Math.random() * 40;
    g.fillStyle = `rgba(${l},${l - 6},${l - 18},${0.05 + Math.random() * 0.06})`;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      g.beginPath();
      g.ellipse(x + ox, y + oy, r, r * (0.4 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

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
    const front = layout.doors?.find((d) => d.outward);
    path.position.set(front?.x ?? -3, -0.012, (front?.z ?? 4.5) + 2.2 + 0.2);
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
  const plaster = plasterTexture();
  const wallMaterial = new THREE.MeshStandardMaterial({ color: "#efe6d6", roughness: 0.95, map: plaster, bumpMap: plaster, bumpScale: 0.6 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: "#f7f1e6", roughness: 0.7 });
  for (const wall of layout.walls) {
    const dx = wall.b[0] - wall.a[0];
    const dz = wall.b[1] - wall.a[1];
    const length = Math.hypot(dx, dz);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(dx) > 0 ? length : wallThickness, wallHeight, Math.abs(dz) > 0 ? length : wallThickness), wallMaterial.clone());
    const centre = new THREE.Vector3((wall.a[0] + wall.b[0]) / 2, wallHeight / 2, (wall.a[1] + wall.b[1]) / 2);
    mesh.position.copy(centre);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // skirting at the foot and a crown at the top, so a wall reads as part of a finished room
    const alongX = Math.abs(dx) > 0;
    const trim = (h: number, y: number, over: number) => {
      const t = new THREE.Mesh(new THREE.BoxGeometry(alongX ? length + 0.002 : wallThickness + over, h, alongX ? wallThickness + over : length + 0.002), trimMaterial.clone());
      t.position.y = y;
      t.receiveShadow = true;
      mesh.add(t);
    };
    if (house) {
      trim(0.14, -wallHeight / 2 + 0.07, 0.03);
      trim(0.07, wallHeight / 2 - 0.035, 0.04);
    }
    scene.add(mesh);
    wallMeshes.push({ mesh, centre, outward: wall.outward ? new THREE.Vector3(wall.outward[0], 0, wall.outward[1]) : null, opacity: 1 });
  }

  // ---- doorways: a frame, a lintel over the gap, and a door leaf standing open where there is a real door
  let frontDoor: World["frontDoor"] = null;
  const doorSwing = { hinge: null as THREE.Group | null, open: 0, now: 0, target: 0 };
  if (house && layout.doors) {
    const frameMat = new THREE.MeshStandardMaterial({ color: "#6b4a2d", roughness: 0.7 });
    const leafMat = new THREE.MeshStandardMaterial({ color: "#a37a4f", roughness: 0.6 });
    const doorHeight = Math.min(2.1, wallHeight - 0.35);
    for (const d of layout.doors) {
      const g = new THREE.Group();
      g.position.set(d.x, 0, d.z);
      if (d.axis === "z") g.rotation.y = Math.PI / 2;
      // lintel: the wall above the gap (a wall piece, so it fades with the wall)
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(d.width + 0.1, wallHeight - doorHeight, wallThickness), wallMaterial.clone());
      lintel.position.set(d.x, doorHeight + (wallHeight - doorHeight) / 2, d.z);
      if (d.axis === "z") lintel.rotation.y = Math.PI / 2;
      lintel.castShadow = true;
      scene.add(lintel);
      wallMeshes.push({ mesh: lintel, centre: lintel.position.clone(), outward: d.outward ? new THREE.Vector3(d.outward[0], 0, d.outward[1]) : null, opacity: 1 });
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, doorHeight, wallThickness + 0.04), frameMat);
        post.position.set((side * d.width) / 2, doorHeight / 2, 0);
        post.castShadow = true;
        g.add(post);
      }
      const head = new THREE.Mesh(new THREE.BoxGeometry(d.width + 0.07, 0.07, wallThickness + 0.04), frameMat);
      head.position.set(0, doorHeight, 0);
      g.add(head);
      if (d.leaf) {
        // the leaf hangs on one post and stands open, close to the wall beside the gap
        const hinge = new THREE.Group();
        hinge.position.set((-d.leaf * d.width) / 2 + d.leaf * 0.02, 0, 0);
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(d.width - 0.06, doorHeight - 0.04, 0.045), leafMat);
        leaf.position.set(d.leaf * (d.width / 2 - 0.03), doorHeight / 2, 0);
        leaf.castShadow = true;
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: "#d9c27a", metalness: 0.7, roughness: 0.3 }));
        knob.position.set(d.leaf * (d.width - 0.2), doorHeight * 0.48, 0.04);
        hinge.add(leaf, knob);
        hinge.rotation.y = d.leaf * (-Math.PI / 2 + 0.25);
        g.add(hinge);
        if (d.outward) {
          doorSwing.hinge = hinge;
          doorSwing.open = doorSwing.now = doorSwing.target = hinge.rotation.y;
          frontDoor = { parts: [g], x: d.x, z: d.z, setLocked: (locked) => { doorSwing.target = locked ? 0 : doorSwing.open; } };
        }
      }
      scene.add(g);
    }
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
  function makeBaseNav(): NavGrid {
    const grid = createNavGrid(layout.area, NAV_CELL);
    blockOutside(grid, layout.area, 0.4);
    // Nobody walks round the outside of a house or through its walls: the garden is shut off, except the step in front of the door
    // (so a thing is always used from inside the house, never from the other side of a wall).
    if (house) {
      const hb = house.bounds, A = layout.area, t = wallThickness / 2;
      const front = layout.doors?.find((d) => d.outward);
      const gap = front ? { a: front.x - front.width / 2 + CHARACTER_RADIUS, b: front.x + front.width / 2 - CHARACTER_RADIUS } : null;
      const step = 2.4;
      blockRect(grid, { minX: A.minX, maxX: hb.minX - t, minZ: A.minZ, maxZ: A.maxZ }, CHARACTER_RADIUS);
      blockRect(grid, { minX: hb.maxX + t, maxX: A.maxX, minZ: A.minZ, maxZ: A.maxZ }, CHARACTER_RADIUS);
      blockRect(grid, { minX: hb.minX, maxX: hb.maxX, minZ: A.minZ, maxZ: hb.minZ - t }, CHARACTER_RADIUS);
      if (gap) {
        blockRect(grid, { minX: hb.minX, maxX: gap.a, minZ: hb.maxZ + t, maxZ: A.maxZ }, 0);
        blockRect(grid, { minX: gap.b, maxX: hb.maxX, minZ: hb.maxZ + t, maxZ: A.maxZ }, 0);
        blockRect(grid, { minX: gap.a, maxX: gap.b, minZ: hb.maxZ + step, maxZ: A.maxZ }, 0);
      } else blockRect(grid, { minX: hb.minX, maxX: hb.maxX, minZ: hb.maxZ + t, maxZ: A.maxZ }, CHARACTER_RADIUS);
    }
    for (const wall of layout.walls) {
      const t = wallThickness / 2;
      blockRect(
        grid,
        { minX: Math.min(wall.a[0], wall.b[0]) - t, maxX: Math.max(wall.a[0], wall.b[0]) + t, minZ: Math.min(wall.a[1], wall.b[1]) - t, maxZ: Math.max(wall.a[1], wall.b[1]) + t },
        CHARACTER_RADIUS,
      );
    }
    return grid;
  }

  // ---- furniture
  const items: PlacedItem[] = [];

  /** Builds one piece (its model, placed and turned) and adds it to the scene. */
  async function makeItem(def: Placement): Promise<PlacedItem> {
    const catalog = furnitureById(def.furniture);
    if (!catalog) throw new Error(`Layout item "${def.id}" uses unknown furniture "${def.furniture}"`);
    const instance = await createFurniture(def.furniture, manifest);
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
    return { def, catalog, instance, group, materials, bounds: new THREE.Box3().setFromObject(group) };
  }
  items.push(...(await Promise.all(layout.items.map(makeItem))));

  let nav: NavGrid = makeBaseNav();
  let byId = new Map<string, PlacedItem>();
  let interactions = new Map<string, Interaction[]>();
  let pickables: THREE.Object3D[] = [];
  /** The ways of using things that could be reached when the room was last settled: rearranging must not cut any of them off. */
  let reachableUses = new Set<string>();
  const start = { x: layout.start.x, z: layout.start.z };

  /** Works out everything that depends on where the furniture is: heights, the walkable floor, what each piece can be used for. */
  function settle() {
    byId = new Map(items.map((i) => [i.def.id, i]));
    // Items that rest on others take their height from the item below (resolved in dependency order).
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
        item.group.position.set(item.def.x, base.bounds.max.y + (item.def.y ?? 0), item.def.z);
        item.group.updateMatrixWorld(true);
        item.bounds = new THREE.Box3().setFromObject(item.group);
        settled.add(item.def.id);
      }
      remaining = next;
    }

    // Small things (cups, lamps, plants' leaves, books) barely show a shadow, so they skip the shadow pass: fewer draw calls per frame.
    for (const item of items) {
      const size = item.bounds.getSize(new THREE.Vector3());
      if (Math.max(size.x, size.y, size.z) < 0.45) item.group.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = false) : undefined));
    }

    // Only things you'd bump into block walking: not rugs, wall-hung pieces, fans or things on tables.
    nav = makeBaseNav();
    for (const item of items) {
      const b = item.bounds;
      if (item.def.onTopOf || b.max.y - b.min.y < 0.12 || b.min.y > 0.7) continue;
      blockRect(nav, { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z }, CHARACTER_RADIUS);
    }

    // ---- what you can do with each piece, worked out from its shape
    const derived: DerivedItem[] = items.map((item) => {
      const base = item.def.onTopOf ? byId.get(item.def.onTopOf) : undefined;
      return { def: item.def, category: item.catalog.category, action: item.catalog.action, toggle: item.catalog.toggle, meta: item.instance.meta, group: item.group, box: item.bounds, reach: base?.bounds ?? item.bounds };
    });
    const reachable = (x: number, z: number) => isFree(nav, x, z) && findPath(nav, start, { x, z }) !== null;
    interactions = deriveInteractions(derived, reachable, (id) => byId.get(id)?.bounds);

    // Interaction spots must always be reachable, even if furniture padding covered them.
    for (const list of interactions.values()) {
      for (const interaction of list) {
        const [x, z] = interaction.approach;
        const cellX = Math.floor((x - nav.minX) / nav.cell);
        const cellZ = Math.floor((z - nav.minZ) / nav.cell);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) nav.blocked[(cellZ + dz) * nav.width + (cellX + dx)] = 0;
      }
    }
    pickables = items.filter((i) => interactionsFor(i.def.id).length > 0).map((i) => i.group);
    reachableUses = new Set();
    const from = nearestFree(nav, start.x, start.z, 1.5);
    if (from) {
      for (const list of interactions.values()) {
        for (const it of list) {
          const goal = nearestFree(nav, it.approach[0], it.approach[1], 0.6);
          if (goal && findPath(nav, from, goal)) reachableUses.add(`${it.itemId}:${it.id}`);
        }
      }
    }
  }

  function interactionsFor(itemId: string): Interaction[] {
    const own = interactions.get(itemId);
    if (own?.length) return own;
    const via = byId.get(itemId)?.def.via;
    return via ? (interactions.get(via) ?? []) : [];
  }
  settle();


  // ---- rearranging the home
  const FLAT_PIECES = new Set(["p_rug", "p_doormat"]);
  const sizes = new Map<string, THREE.Vector3>();
  async function sizeOf(furniture: string): Promise<THREE.Vector3> {
    const known = sizes.get(furniture);
    if (known) return known;
    const inst = await createFurniture(furniture, manifest);
    const size = inst.size.clone();
    sizes.set(furniture, size);
    return size;
  }
  for (const i of items) sizes.set(i.def.furniture, i.instance.size.clone());

  function fits(selfId: string | null, furniture: string, size: THREE.Vector3, x: number, z: number, rotDeg: number, why?: { r: string }): boolean {
    const no = (r: string) => {
      if (why) why.r = r;
      return false;
    };
    const quarter = (((Math.round(rotDeg / 90) % 2) + 2) % 2) === 1;
    const hx = (quarter ? size.z : size.x) / 2, hz = (quarter ? size.x : size.z) / 2;
    const r = { minX: x - hx + 0.03, maxX: x + hx - 0.03, minZ: z - hz + 0.03, maxZ: z + hz - 0.03 };
    const hit = (a: { minX: number; maxX: number; minZ: number; maxZ: number }) => r.minX < a.maxX && r.maxX > a.minX && r.minZ < a.maxZ && r.maxZ > a.minZ;
    const t = wallThickness / 2;
    const b = house?.bounds ?? layout.area;
    if (r.minX < b.minX + t || r.maxX > b.maxX - t || r.minZ < b.minZ + t || r.maxZ > b.maxZ - t) return no("outside");
    for (const w of layout.walls) {
      if (hit({ minX: Math.min(w.a[0], w.b[0]) - t, maxX: Math.max(w.a[0], w.b[0]) + t, minZ: Math.min(w.a[1], w.b[1]) - t, maxZ: Math.max(w.a[1], w.b[1]) + t })) return no("wall");
    }
    const flat = FLAT_PIECES.has(furniture);
    const kids = new Set(items.filter((o) => selfId && o.def.onTopOf === selfId).map((o) => o.def.id));
    const others = items.filter((o) => o.def.id !== selfId && !kids.has(o.def.id));
    if (!flat) {
      for (const o of others) {
        if (o.def.onTopOf || o.def.y || FLAT_PIECES.has(o.def.furniture) || o.instance.meta.ceiling) continue;
        const ob = o.bounds;
        if (ob.max.y - ob.min.y < 0.12 || ob.min.y > 0.7) continue;
        if (hit({ minX: ob.min.x, maxX: ob.max.x, minZ: ob.min.z, maxZ: ob.max.z })) return no("item " + o.def.id);
      }
    }
    if (flat) return true;
    // never wall yourself in: everything you could reach before must stay reachable
    const test = makeBaseNav();
    for (const o of others) {
      const ob = o.bounds;
      if (o.def.onTopOf || ob.max.y - ob.min.y < 0.12 || ob.min.y > 0.7) continue;
      blockRect(test, { minX: ob.min.x, maxX: ob.max.x, minZ: ob.min.z, maxZ: ob.max.z }, CHARACTER_RADIUS);
    }
    blockRect(test, { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz }, CHARACTER_RADIUS);
    // like the real floor, the spots where things are used stay open even where furniture padding covers them
    for (const list of interactions.values()) {
      for (const it of list) {
        if (selfId && it.itemId === selfId) continue;
        const cellX = Math.floor((it.approach[0] - test.minX) / test.cell);
        const cellZ = Math.floor((it.approach[1] - test.minZ) / test.cell);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) test.blocked[(cellZ + dz) * test.width + (cellX + dx)] = 0;
      }
    }
    const from = nearestFree(test, start.x, start.z, 1.5);
    if (!from) return no("start blocked");
    for (const list of interactions.values()) {
      for (const it of list) {
        if ((selfId && it.itemId === selfId) || !reachableUses.has(`${it.itemId}:${it.id}`)) continue;
        const [ax, az] = it.approach;
        const goal = nearestFree(test, ax, az, 0.6);
        if (!goal || !findPath(test, from, goal)) return no("unreachable " + it.itemId);
      }
    }
    return true;
  }

  function findSpot(furniture: string, size: THREE.Vector3): { x: number; z: number } | null {
    const b = house?.bounds ?? layout.area;
    const cxh = (b.minX + b.maxX) / 2, czh = (b.minZ + b.maxZ) / 2;
    const cands: { x: number; z: number; d: number }[] = [];
    for (let x = b.minX; x <= b.maxX; x += 0.25) for (let z = b.minZ; z <= b.maxZ; z += 0.25) cands.push({ x, z, d: Math.hypot(x - cxh, z - czh) });
    cands.sort((p, q) => p.d - q.d);
    for (const c of cands) if (fits(null, furniture, size, c.x, c.z, 0)) return { x: c.x, z: c.z };
    return null;
  }

  let currentLayout = layout;
  async function relayout(next: Layout): Promise<void> {
    const old = new Map(items.map((i) => [i.def.id, i]));
    const out: PlacedItem[] = [];
    for (const def of next.items) {
      const have = old.get(def.id);
      if (have && have.def.furniture === def.furniture) {
        old.delete(def.id);
        have.def = def;
        have.group.rotation.y = ((def.rot ?? 0) * Math.PI) / 180;
        const ceiling = have.instance.meta.ceiling;
        have.group.position.set(def.x, FLOOR_Y + (def.y ?? 0) + (ceiling ? wallHeight - have.instance.size.y : 0), def.z);
        have.group.updateMatrixWorld(true);
        have.bounds = new THREE.Box3().setFromObject(have.group);
        out.push(have);
      } else out.push(await makeItem(def));
    }
    for (const gone of old.values()) scene.remove(gone.group);
    items.length = 0;
    items.push(...out);
    currentLayout = next;
    settle();
  }

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
    if (doorSwing.hinge && doorSwing.now !== doorSwing.target) {
      doorSwing.now += (doorSwing.target - doorSwing.now) * Math.min(1, delta * 6);
      if (Math.abs(doorSwing.target - doorSwing.now) < 0.01) doorSwing.now = doorSwing.target;
      doorSwing.hinge.rotation.y = doorSwing.now;
    }
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
      for (const child of wall.mesh.children) {
        const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (!m) continue;
        m.transparent = material.transparent;
        m.opacity = material.opacity;
        m.depthWrite = material.depthWrite;
      }
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

  async function prewarm(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    const textures = new Set<THREE.Texture>();
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const m = material as THREE.MeshStandardMaterial;
        for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.aoMap, m.emissiveMap]) if (t) textures.add(t);
      }
    });
    // A few at a time, so the page keeps responding while the graphics card takes them in.
    const list = [...textures];
    for (let i = 0; i < list.length; i += 6) {
      for (const t of list.slice(i, i + 6)) renderer.initTexture(t);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    }
    try {
      await renderer.compileAsync(scene, camera);
    } catch {
      // shader pre-compilation is an optimisation only
    }
  }

  return {
    scene,
    sun,
    get layout() {
      return currentLayout;
    },
    prewarm,
    get nav() {
      return nav;
    },
    items,
    get pickables() {
      return pickables;
    },
    get interactions() {
      return interactions;
    },
    ground,
    relayout,
    fits,
    sizeOf,
    findSpot,
    interactionsFor,
    updateFurniture,
    highlight,
    updateWalls,
    get frontDoor() {
      return frontDoor;
    },
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
