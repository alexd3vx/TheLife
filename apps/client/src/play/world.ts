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
  scene.add(new THREE.HemisphereLight("#cfe0ff", "#8a7058", 1.05));
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
        mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone();
        materials.push(mesh.material as THREE.MeshStandardMaterial);
      });
      scene.add(group);
      group.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(group);
      items.push({ def, group, materials, bounds });
      if (def.interaction) pickables.push(group);
    }),
  );

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

  return {
    scene,
    nav,
    items,
    pickables,
    ground,
    updateWalls,
    dispose() {
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose?.();
      });
    },
  };
}
