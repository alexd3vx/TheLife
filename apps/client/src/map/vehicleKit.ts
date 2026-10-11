import * as THREE from "three";
import { loadGLTF } from "../lab/loaders";

/**
 * A Kenney Car Kit vehicle (CC0) as ready-to-instance parts: every mesh of the model in the model's own frame, as plain float
 * geometry, the base on the ground at the middle, the front towards +z. `length` scales it to a real size in metres.
 */
export interface CarModel {
  parts: { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial }[];
  /** Size after scaling, in metres. */
  w: number;
  h: number;
  l: number;
}

const cache = new Map<string, Promise<CarModel>>();

export function loadCar(name: string, length: number): Promise<CarModel> {
  const key = `${name}|${length}`;
  let p = cache.get(key);
  if (!p) {
    p = build(name, length);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

async function build(name: string, length: number): Promise<CarModel> {
  const gltf = await loadGLTF(`${import.meta.env.BASE_URL}assets/vehicles/${name}.glb`);
  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());
  // the car's long side is its length, whichever way the file has it
  const lengthAxis = size.z >= size.x ? "z" : "x";
  const k = length / Math.max(1e-3, Math.max(size.x, size.z));
  const centre = box.getCenter(new THREE.Vector3());
  const parts: CarModel["parts"] = [];
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.geometry;
    const geo = new THREE.BufferGeometry();
    for (const attr of ["position", "normal", "uv"] as const) {
      const a = src.getAttribute(attr);
      if (!a) continue;
      const out = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
      geo.setAttribute(attr, new THREE.BufferAttribute(out, a.itemSize));
    }
    if (src.index) geo.setIndex(src.index.clone());
    geo.applyMatrix4(mesh.matrixWorld);
    geo.translate(-centre.x, -box.min.y, -centre.z);
    if (lengthAxis === "x") geo.rotateY(Math.PI / 2);
    geo.scale(k, k, k);
    geo.computeBoundingSphere();
    const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
    mat.roughness = 0.5;
    mat.metalness = 0.1;
    parts.push({ geo, mat });
  });
  const w = lengthAxis === "z" ? size.x : size.z;
  return { parts, w: w * k, h: size.y * k, l: (lengthAxis === "z" ? size.z : size.x) * k };
}
