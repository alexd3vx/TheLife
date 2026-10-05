import * as THREE from "three";
import { loadGLTF } from "../lab/loaders";
import { assetUrl, type AssetManifest } from "../lab/manifest";
import { metaFor, type ModelMeta } from "./models";
import { PROCEDURAL_BUILDERS, type FurnitureContext } from "./procedural";

/** A piece of furniture ready to place: origin at the footprint centre on the floor, front facing +z. */
export interface FurnitureInstance {
  id: string;
  object: THREE.Group;
  /** Size in metres (width, height, depth) and the box it occupies, relative to the object's origin. */
  size: THREE.Vector3;
  box: THREE.Box3;
  meta: ModelMeta;
  update(dt: number, ctx: FurnitureContext): void;
  /** True if it does something visible when used (a door opens, a fan spins...). */
  animated: boolean;
}

type Animator = (dt: number, ctx: FurnitureContext) => void;

/** Re-parents a node under a pivot at one of its edges, so rotating the pivot swings it like a real hinge. */
function hingeAt(node: THREE.Object3D, edge: "bottom" | "top" | "left" | "right"): THREE.Group {
  node.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(node);
  const centre = box.getCenter(new THREE.Vector3());
  const pivotWorld = centre.clone();
  if (edge === "bottom") pivotWorld.y = box.min.y;
  if (edge === "top") pivotWorld.y = box.max.y;
  if (edge === "left") pivotWorld.x = box.min.x;
  if (edge === "right") pivotWorld.x = box.max.x;
  pivotWorld.z = box.max.z; // hinge on the front face
  const parent = node.parent!;
  const pivot = new THREE.Group();
  parent.add(pivot);
  pivot.position.copy(parent.worldToLocal(pivotWorld.clone()));
  pivot.attach(node);
  return pivot;
}

function glbAnimator(id: string, object: THREE.Object3D, size: THREE.Vector3): Animator | null {
  if (id === "electric_stove") {
    const door = object.getObjectByName("door_top");
    if (!door) return null;
    const hinge = hingeAt(door, "bottom");
    let open = 0;
    return (dt, ctx) => {
      open += ((ctx.using ? 1 : 0) - open) * Math.min(1, dt * 3);
      hinge.rotation.x = open * 1.45;
    };
  }
  if (id === "ceiling_fan") {
    const blades = object.getObjectByName("ceiling_fan_blades");
    if (!blades) return null;
    let speed = 0;
    return (dt, ctx) => {
      speed += ((ctx.using ? 7 : 4.5) - speed) * Math.min(1, dt * 2);
      blades.rotation.y += speed * dt;
    };
  }
  if (id === "boombox" || id === "vintage_radio_transceiver") {
    const base = object.scale.clone();
    return (_dt, ctx) => {
      const pulse = ctx.using ? 1 + 0.012 * Math.max(0, Math.sin(ctx.time * 9.5)) : 1;
      object.scale.set(base.x * pulse, base.y * pulse, base.z * pulse);
    };
  }
  if (id === "television_02" || id === "Television_01") {
    const glow = new THREE.PointLight("#8fb4ff", 0, 3, 2);
    glow.position.set(0, size.y * 0.5, size.z * 0.5 + 0.4);
    object.add(glow);
    return (_dt, ctx) => {
      glow.intensity = ctx.using ? 1.6 + 0.6 * Math.sin(ctx.time * 6.1) * Math.sin(ctx.time * 2.7) : 0;
    };
  }
  return null;
}

function lampAnimator(meta: ModelMeta, object: THREE.Object3D): Animator | null {
  if (!meta.lamp) return null;
  const light = new THREE.PointLight(meta.lamp.color, 0, 4, 2);
  light.position.set(meta.lamp.x, meta.lamp.y, meta.lamp.z);
  object.add(light);
  // Lamps are switched on by the player (tap them); `using` means "switched on".
  return (_dt, ctx) => {
    const target = ctx.using ? meta.lamp!.strength : 0;
    light.intensity += (target - light.intensity) * Math.min(1, _dt * 10);
  };
}

function normalise(raw: THREE.Object3D, meta: ModelMeta): { object: THREE.Group; box: THREE.Box3; size: THREE.Vector3 } {
  // The model is turned and scaled inside `inner`; `inner`'s position then centres its footprint on the origin and rests it
  // on the floor (position is applied after the rotation, so it needs no rotation maths).
  const inner = new THREE.Group();
  inner.add(raw);
  inner.rotation.y = ((meta.rotation ?? 0) * Math.PI) / 180;
  inner.scale.setScalar(meta.scale ?? 1);
  const object = new THREE.Group();
  object.add(inner);
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const centre = box.getCenter(new THREE.Vector3());
  inner.position.set(-centre.x, -box.min.y, -centre.z);
  object.updateMatrixWorld(true);
  const final = new THREE.Box3().setFromObject(object);
  return { object, box: final, size: final.getSize(new THREE.Vector3()) };
}

/** A plain box in the item's real size, used if a model can't be loaded, so one bad download never breaks the room. */
function placeholder(id: string, manifest: AssetManifest): FurnitureInstance {
  const record = manifest.assets.find((a) => a.id === id);
  const [w = 0.6, h = 0.6, d = 0.6] = record?.sizeMetres ?? [];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: "#9b8f84", roughness: 0.9 }));
  mesh.position.y = h / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const object = new THREE.Group();
  object.add(mesh);
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  return { id, object, size: box.getSize(new THREE.Vector3()), box, meta: metaFor(id), animated: false, update() {} };
}

/** Loads a piece, trying twice (a dropped connection), and falls back to a plain box rather than failing. */
export async function createFurniture(id: string, manifest: AssetManifest): Promise<FurnitureInstance> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await buildFurniture(id, manifest);
    } catch (error) {
      console.warn(`furniture: could not load "${id}" (attempt ${attempt + 1})`, error);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  return placeholder(id, manifest);
}

async function buildFurniture(id: string, manifest: AssetManifest): Promise<FurnitureInstance> {
  const meta = metaFor(id);
  const animators: Animator[] = [];
  let raw: THREE.Object3D;

  if (id.startsWith("p_")) {
    const builder = PROCEDURAL_BUILDERS[id];
    if (!builder) throw new Error(`No procedural builder for ${id}`);
    const built = builder();
    raw = built.object;
    if (built.update) animators.push(built.update.bind(built));
  } else {
    const record = manifest.assets.find((a) => a.id === id && a.category === "realistic");
    if (!record) throw new Error(`No model for furniture "${id}"`);
    const gltf = await loadGLTF(assetUrl(record.file));
    raw = gltf.scene.clone(true);
    raw.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
  }

  const { object, box, size } = normalise(raw, meta);

  if (!id.startsWith("p_")) {
    const animator = glbAnimator(id, raw, size);
    if (animator) animators.push(animator);
  }
  const lamp = lampAnimator(meta, object);
  if (lamp) animators.push(lamp);

  return {
    id,
    object,
    size,
    box,
    meta,
    animated: animators.length > 0,
    update(dt, ctx) {
      for (const animate of animators) animate(dt, ctx);
    },
  };
}
