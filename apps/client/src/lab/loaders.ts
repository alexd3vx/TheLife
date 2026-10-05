import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const gltfCache = new Map<string, Promise<GLTF>>();

/** Each file is downloaded and parsed once; callers clone what they need. */
export function loadGLTF(url: string): Promise<GLTF> {
  let pending = gltfCache.get(url);
  if (!pending) {
    pending = loader.loadAsync(url);
    pending.catch(() => gltfCache.delete(url));
    gltfCache.set(url, pending);
  }
  return pending;
}

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map<string, Promise<THREE.Texture>>();

/** Loads an image the way glTF textures are stored (no vertical flip, sRGB). */
export function loadGltfTexture(url: string): Promise<THREE.Texture> {
  let pending = textureCache.get(url);
  if (!pending) {
    pending = textureLoader.loadAsync(url).then((texture) => {
      texture.flipY = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      return texture;
    });
    textureCache.set(url, pending);
  }
  return pending;
}
