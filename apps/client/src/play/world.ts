import * as THREE from "three";
import { blockOutside, blockRect, createNavGrid, type NavGrid } from "@thelife/shared";
import { loadGLTF } from "../lab/loaders";
import { assetUrl, type AssetManifest } from "../lab/manifest";
import { HOUSE, INTERACTIONS, ITEMS, PLAY_AREA, WALLS, type ItemDef } from "./layout";

const CHARACTER_RADIUS = 0.27;
export const NAV_CELL = 0.125; // fine enough that 1.4 m doorways stay open after padding for the character's width

export interface PlacedItem {
  def: ItemDef;
  group: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  bounds: THREE.Box3;
}

export interface World {
  scene: THREE.Scene;
  nav: NavGrid;
  items: PlacedItem[];
  pickables: THREE.Object3D[];
  ground: THREE.Mesh;
  /** Fades the walls between the camera and the house so you can always see in. */
  updateWalls(camera: THREE.Camera, delta: number): void;
  /** Sun, sky and house lights for a time of day (hours, 0-24). */
  setTimeOfDay(hour: number): void;
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

export async function buildWorld(manifest: AssetManifest, shadowSize: number): Promise<World> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#a9c9e8");
  scene.fog = new THREE.Fog("#a9c9e8", 40, 90);

  // ---- lighting
  const hemi = new THREE.HemisphereLight("#cfe0ff", "#8a7058", 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff0d6", 2.8);
  sun.position.set(-9, 16, 11);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  const cam = sun.shadow.camera;
  cam.left = -15;
  cam.right = 15;
  cam.top = 15;
  cam.bottom = -15;
  cam.near = 2;
  cam.far = 50;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);

  // ---- ground: grass yard, a concrete path from the door, wooden house floor
  const grass = grassTexture();
  grass.repeat.set(20, 20);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const concrete = concreteTexture();
  concrete.repeat.set(2, 4);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.2), new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.95 }));
  path.rotation.x = -Math.PI / 2;
  path.position.set(-3, 0.012, 6.6);
  path.receiveShadow = true;
  scene.add(path);

  const wood = woodTexture();
  wood.repeat.set(3, 2.25);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(HOUSE.maxX - HOUSE.minX, HOUSE.maxZ - HOUSE.minZ),
    new THREE.MeshStandardMaterial({ map: wood, roughness: 0.6 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.02, 0);
  floor.receiveShadow = true;
  scene.add(floor);

  // ---- walls
  const wallMeshes: WallMesh[] = [];
  const wallMaterial = new THREE.MeshStandardMaterial({ color: "#efe6d6", roughness: 0.95 });
  for (const wall of WALLS) {
    const dx = wall.b[0] - wall.a[0];
    const dz = wall.b[1] - wall.a[1];
    const length = Math.hypot(dx, dz);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(Math.abs(dx) > 0 ? length : HOUSE.wallThickness, HOUSE.wallHeight, Math.abs(dz) > 0 ? length : HOUSE.wallThickness),
      wallMaterial.clone(),
    );
    const centre = new THREE.Vector3((wall.a[0] + wall.b[0]) / 2, HOUSE.wallHeight / 2, (wall.a[1] + wall.b[1]) / 2);
    mesh.position.copy(centre);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    wallMeshes.push({ mesh, centre, outward: wall.outward ? new THREE.Vector3(wall.outward[0], 0, wall.outward[1]) : null, opacity: 1 });
  }

  // ---- warm lights inside the house, switched on by setTimeOfDay at dusk
  const houseLights: THREE.PointLight[] = [];
  for (const [x, z] of [[-3.5, -0.5], [-3.5, 3.0], [3.7, -1.5], [3.7, 3.2]] as const) {
    const light = new THREE.PointLight("#ffcf9a", 0, 9, 1.6);
    light.position.set(x, 2.3, z);
    scene.add(light);
    houseLights.push(light);
  }

  // ---- navigation grid: walls and furniture block, the play area edge blocks
  const nav = createNavGrid(PLAY_AREA, NAV_CELL);
  blockOutside(nav, PLAY_AREA, 0.4);
  for (const wall of WALLS) {
    const t = HOUSE.wallThickness / 2;
    blockRect(
      nav,
      { minX: Math.min(wall.a[0], wall.b[0]) - t, maxX: Math.max(wall.a[0], wall.b[0]) + t, minZ: Math.min(wall.a[1], wall.b[1]) - t, maxZ: Math.max(wall.a[1], wall.b[1]) + t },
      CHARACTER_RADIUS,
    );
  }

  // ---- furniture
  const items: PlacedItem[] = [];
  const pickables: THREE.Object3D[] = [];
  await Promise.all(
    ITEMS.map(async (def) => {
      const record = manifest.assets.find((a) => a.id === def.asset);
      if (!record) {
        console.warn(`play: unknown asset ${def.asset}`);
        return;
      }
      const gltf = await loadGLTF(assetUrl(record.file));
      const model = gltf.scene.clone(true);
      const box = new THREE.Box3().setFromObject(model);
      const centre = box.getCenter(new THREE.Vector3());
      model.position.set(-centre.x, -box.min.y, -centre.z); // centred on its footprint, resting on the floor

      const group = new THREE.Group();
      group.add(model);
      group.scale.setScalar(def.scale ?? 2);
      group.rotation.y = ((def.rot ?? 0) * Math.PI) / 180;
      group.position.set(def.x, (def.y ?? 0) + 0.02, def.z);
      group.userData.itemId = def.id;

      const materials: THREE.MeshStandardMaterial[] = [];
      group.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const material = (mesh.material as THREE.MeshStandardMaterial).clone();
        if (def.ghost !== undefined) {
          material.transparent = true;
          material.opacity = def.ghost;
          material.depthWrite = false;
          mesh.castShadow = false;
        }
        mesh.material = material;
        materials.push(material);
      });
      scene.add(group);
      group.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(group);
      items.push({ def, group, materials, bounds });
      if (def.interaction) pickables.push(group);
    }),
  );

  // Items that rest on others take their height from the item below (resolved in dependency order).
  const placed = new Set(items.filter((i) => !i.def.onTopOf).map((i) => i.def.id));
  let remaining = items.filter((i) => i.def.onTopOf);
  for (let pass = 0; pass < 4 && remaining.length; pass++) {
    const next: PlacedItem[] = [];
    for (const item of remaining) {
      const base = items.find((i) => i.def.id === item.def.onTopOf);
      if (!base || !placed.has(base.def.id)) {
        next.push(item);
        continue;
      }
      item.group.position.y = base.bounds.max.y + (item.def.y ?? 0);
      item.group.updateMatrixWorld(true);
      item.bounds = new THREE.Box3().setFromObject(item.group);
      placed.add(item.def.id);
    }
    remaining = next;
  }

  for (const item of items) {
    if (item.def.blocks === false) continue;
    const b = item.bounds;
    blockRect(nav, { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z }, CHARACTER_RADIUS);
  }
  // Interaction spots must always be reachable, even if furniture padding covered them.
  for (const interaction of Object.values(INTERACTIONS)) {
    const [x, z] = interaction.approach;
    blockRect(nav, { minX: x, maxX: x, minZ: z, maxZ: z }, 0);
    const cx = Math.floor((x - nav.minX) / nav.cell);
    const cz = Math.floor((z - nav.minZ) / nav.cell);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) nav.blocked[(cz + dz) * nav.width + (cx + dx)] = 0;
  }

  // Walls fade out when the camera is outside them.
  const camPos = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  function updateWalls(camera: THREE.Camera, delta: number) {
    camera.getWorldPosition(camPos);
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
  const keys: { hour: number; sky: string; sun: string; sunPower: number; hemi: number; hemiSky: string; exposure: number }[] = [
    { hour: 0, sky: "#0b1226", sun: "#6f86d8", sunPower: 0.25, hemi: 0.35, hemiSky: "#3a4a8a", exposure: 1 },
    { hour: 5, sky: "#1d2750", sun: "#8da0e8", sunPower: 0.3, hemi: 0.4, hemiSky: "#4a5a9a", exposure: 1 },
    { hour: 6.5, sky: "#f0a06a", sun: "#ffb072", sunPower: 1.6, hemi: 0.75, hemiSky: "#e8b8a0", exposure: 1 },
    { hour: 9, sky: "#a9c9e8", sun: "#fff0d6", sunPower: 2.8, hemi: 1.05, hemiSky: "#cfe0ff", exposure: 1 },
    { hour: 14, sky: "#9fc4ea", sun: "#fff6e6", sunPower: 3.1, hemi: 1.1, hemiSky: "#cfe4ff", exposure: 1 },
    { hour: 17.5, sky: "#e8b078", sun: "#ffb06a", sunPower: 2.2, hemi: 0.85, hemiSky: "#f0c8a0", exposure: 1 },
    { hour: 19, sky: "#6a3a52", sun: "#ff8a5a", sunPower: 0.9, hemi: 0.5, hemiSky: "#8a6a9a", exposure: 1 },
    { hour: 20.5, sky: "#141b3a", sun: "#6f86d8", sunPower: 0.3, hemi: 0.38, hemiSky: "#3a4a8a", exposure: 1 },
    { hour: 24, sky: "#0b1226", sun: "#6f86d8", sunPower: 0.25, hemi: 0.35, hemiSky: "#3a4a8a", exposure: 1 },
  ];
  const skyColor = new THREE.Color();
  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();
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
    // The sun crosses the sky from east (6:00) to west (18:00); at night it becomes a dim moon from the same side.
    const day = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI));
    const angle = ((h - 6) / 12) * Math.PI;
    sun.position.set(Math.cos(angle) * 16 * -1, 6 + day * 12, 9);
    const dark = h < 6.5 || h > 19.5 ? 1 : h < 8 ? (8 - h) / 1.5 : h > 18 ? (h - 18) / 1.5 : 0;
    for (const light of houseLights) light.intensity = Math.min(1, Math.max(0, dark)) * 14;
  }
  setTimeOfDay(9);

  return {
    scene,
    nav,
    items,
    pickables,
    ground,
    updateWalls,
    setTimeOfDay,
    dispose() {
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose?.();
      });
    },
  };
}
