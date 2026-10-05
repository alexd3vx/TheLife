import * as THREE from "three";
import type { Rng } from "./rng";
import {
  FACADE_COLS,
  FACADE_ROWS,
  makeAwningTexture,
  makeCorrugatedTexture,
  makeSignTexture,
  type FacadeTextures,
} from "./textures";

export type BuildingStyle = "tower" | "shop" | "house";

export interface BuildingSpec {
  style: BuildingStyle;
  x: number;
  z: number;
  width: number;
  depth: number;
  floors: number;
  /** +1 = front faces +z (building sits on the -z side of the street), -1 = faces -z. */
  facing: 1 | -1;
  facade: FacadeTextures;
  signText?: string;
}

const FLOOR_HEIGHT = 3.4;
const BAY_WIDTH = 3.2;
const SHOP_NAMES = [
  ["Mama Ngozi Provisions", "#1f6f66", "#ffe9b0"],
  ["Bisi Hair & Beauty", "#7d3b8c", "#ffffff"],
  ["Tunde Auto Parts", "#b3361e", "#fff3d6"],
  ["Chop Life Grill", "#2a2a2a", "#ffbe4a"],
  ["Kobo Pharmacy", "#1d6b3a", "#ffffff"],
  ["Suya Spot", "#8a4b14", "#ffe2a8"],
] as const;

/** Scale box UVs so one facade tile always covers 4 bays x 4 floors, whatever the building size. */
function scaleBoxUVs(geometry: THREE.BoxGeometry, width: number, height: number, depth: number, rng: Rng) {
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  const tileW = BAY_WIDTH * FACADE_COLS;
  const tileH = FLOOR_HEIGHT * FACADE_ROWS;
  const faces = [
    { w: depth, h: height },
    { w: depth, h: height },
    { w: width, h: depth },
    { w: width, h: depth },
    { w: width, h: height },
    { w: width, h: height },
  ];
  faces.forEach((face, f) => {
    const offset = rng.next();
    const isRoof = f === 2 || f === 3;
    for (let i = 0; i < 4; i++) {
      const index = f * 4 + i;
      const tw = isRoof ? 4 : tileW;
      const th = isRoof ? 4 : tileH;
      uv.setXY(index, uv.getX(index) * (face.w / tw) + offset, uv.getY(index) * (face.h / th));
    }
  });
  uv.needsUpdate = true;
}

function shadowed<T extends THREE.Object3D>(object: T): T {
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return object;
}

export interface BuildingMaterials {
  roof: THREE.MeshStandardMaterial;
  tank: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  shopFront: THREE.MeshStandardMaterial;
}

export function createBuildingMaterials(roofTexture: THREE.Texture): BuildingMaterials {
  const roofMap = roofTexture.clone();
  roofMap.needsUpdate = true;
  return {
    roof: new THREE.MeshStandardMaterial({ map: roofMap, color: "#8d8a85", roughness: 0.95 }),
    tank: new THREE.MeshStandardMaterial({ color: "#1d2a3a", roughness: 0.5, metalness: 0.2 }),
    trim: new THREE.MeshStandardMaterial({ color: "#c9c3b6", roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({
      color: "#ffcf8e",
      emissive: "#ffb35e",
      emissiveIntensity: 0.85,
      roughness: 0.2,
    }),
    shopFront: new THREE.MeshStandardMaterial({ color: "#2a2d31", roughness: 0.7 }),
  };
}

export function createBuilding(spec: BuildingSpec, mats: BuildingMaterials, rng: Rng): THREE.Group {
  const group = new THREE.Group();
  const { width, depth, facade } = spec;
  const height = spec.style === "house" ? 3.4 : spec.floors * FLOOR_HEIGHT;

  const wallMaterial = new THREE.MeshStandardMaterial({
    map: facade.map,
    emissiveMap: facade.emissiveMap,
    emissive: new THREE.Color("#ffffff"),
    emissiveIntensity: 1.25,
    bumpMap: facade.bumpMap,
    bumpScale: 2.2,
    roughness: 0.88,
  });

  const bodyGeometry = new THREE.BoxGeometry(width, height, depth);
  scaleBoxUVs(bodyGeometry, width, height, depth, rng);
  const body = new THREE.Mesh(bodyGeometry, [
    wallMaterial,
    wallMaterial,
    mats.roof,
    mats.roof,
    wallMaterial,
    wallMaterial,
  ]);
  body.position.y = height / 2;
  group.add(body);

  if (spec.style === "house") addGabledRoof(group, width, depth, height, rng);
  else addFlatRoof(group, width, depth, height, mats, rng);

  if (spec.style !== "tower" || rng.chance(0.45)) {
    addStorefront(group, width, depth, mats, rng, spec.signText);
  }

  group.position.set(spec.x, 0, spec.z);
  if (spec.facing === -1) group.rotation.y = Math.PI;
  return shadowed(group);
}

function addFlatRoof(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  mats: BuildingMaterials,
  rng: Rng,
) {
  const parapet = 0.6;
  const t = 0.3;
  const sides: [number, number, number, number, number][] = [
    [width, parapet, t, 0, depth / 2 - t / 2],
    [width, parapet, t, 0, -depth / 2 + t / 2],
    [t, parapet, depth, width / 2 - t / 2, 0],
    [t, parapet, depth, -width / 2 + t / 2, 0],
  ];
  for (const [w, h, d, x, z] of sides) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.trim);
    wall.position.set(x, height + h / 2, z);
    group.add(wall);
  }

  if (rng.chance(0.7)) {
    const tank = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 16), mats.tank);
    barrel.position.y = 2.1;
    tank.add(barrel);
    for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), mats.trim);
      leg.position.set(lx, 0.6, lz);
      tank.add(leg);
    }
    tank.position.set(rng.range(-width / 4, width / 4), height + parapet, rng.range(-depth / 4, depth / 4));
    group.add(tank);
  }

  const acCount = rng.int(1, 3);
  for (let i = 0; i < acCount; i++) {
    const unit = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 1), mats.trim);
    unit.position.set(rng.range(-width / 3, width / 3), height + parapet + 0.45, rng.range(-depth / 3, depth / 3));
    group.add(unit);
  }

  if (rng.chance(0.35)) {
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 6, 6),
      new THREE.MeshStandardMaterial({ color: "#555", metalness: 0.6, roughness: 0.4 }),
    );
    mast.position.set(width / 3, height + parapet + 3, -depth / 4);
    group.add(mast);
  }
}

const ROOF_COLORS = ["#8a4b3a", "#3f6d8a", "#5a7a4a", "#8a8d90"];

function addGabledRoof(group: THREE.Group, width: number, depth: number, height: number, rng: Rng) {
  const rise = 1.6;
  const overhang = 0.5;
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2 - overhang, 0);
  shape.lineTo(width / 2 + overhang, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: depth + overhang * 2, bevelEnabled: false });
  geometry.translate(0, 0, -(depth + overhang * 2) / 2);

  const texture = makeCorrugatedTexture(rng.pick(ROOF_COLORS), rng);
  texture.repeat.set(0.25, 0.25);
  const roof = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55, metalness: 0.35 }));
  roof.position.y = height;
  group.add(roof);
}

function addStorefront(
  group: THREE.Group,
  width: number,
  depth: number,
  mats: BuildingMaterials,
  rng: Rng,
  signText?: string,
) {
  const [name, background, foreground] = rng.pick(SHOP_NAMES);
  const frontZ = depth / 2;
  const w = width - 1.4;

  const front = new THREE.Mesh(new THREE.BoxGeometry(w, 3.2, 0.5), mats.shopFront);
  front.position.set(0, 1.6, frontZ + 0.1);
  group.add(front);

  const paneWidth = (w - 1.2) / 2;
  for (const x of [-(paneWidth / 2 + 0.3), paneWidth / 2 + 0.3]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(paneWidth, 1.9), mats.glass);
    pane.position.set(x, 1.35, frontZ + 0.36);
    group.add(pane);
  }

  const awningTexture = makeAwningTexture(rng.pick(["#c4543f", "#2f7f6d", "#d19a2a"]), "#f4efe4");
  awningTexture.repeat.set(Math.max(2, Math.round(w / 1.2)), 1);
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.4, 0.1, 1.5),
    new THREE.MeshStandardMaterial({ map: awningTexture, roughness: 0.85 }),
  );
  awning.position.set(0, 3.1, frontZ + 0.95);
  awning.rotation.x = 0.28;
  group.add(awning);

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.min(w, 6.4), 1.1),
    new THREE.MeshStandardMaterial({
      map: makeSignTexture(signText ?? name, background, foreground),
      emissive: new THREE.Color("#ffffff"),
      emissiveIntensity: 0.18,
      roughness: 0.5,
    }),
  );
  sign.material.emissiveMap = sign.material.map;
  sign.position.set(0, 3.95, frontZ + 0.37);
  group.add(sign);
}
