import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { Avatar } from "./avatar";
import { KAYKIT_BONES, MIXAMO_BONES } from "./retarget";

export interface Imported {
  name: string;
  clip: THREE.AnimationClip;
}

const clean = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "clip";

/**
 * Reads an animation file the owner made or downloaded (a Mixamo .fbx or .glb, a Quaternius or KayKit .glb, or a clip on our own
 * skeleton) and puts every clip in it onto our body. Returns the clips ready to preview and assign.
 */
export async function importAnimationFile(file: File, avatar: Avatar): Promise<Imported[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const buffer = await file.arrayBuffer();
  let root: THREE.Object3D;
  let clips: THREE.AnimationClip[];
  if (ext === "fbx") {
    root = new FBXLoader().parse(buffer, "");
    clips = root.animations;
  } else if (ext === "glb" || ext === "gltf") {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(buffer, "");
    root = gltf.scene;
    clips = gltf.animations;
  } else throw new Error("Use a .fbx, .glb or .gltf file.");
  if (clips.length === 0) throw new Error("That file has no animation in it.");

  const names = new Set<string>();
  root.traverse((o) => names.add(o.name));
  const has = (n: string) => [...names].some((x) => x === n || x.toLowerCase().includes(n.toLowerCase()));
  let map: Record<string, string> | null = null;
  if (has("mixamorig")) map = MIXAMO_BONES;
  else if (names.has("hips") || names.has("upperlegl") || names.has("upperleg.l")) map = KAYKIT_BONES;
  else if (!names.has("pelvis")) throw new Error("This skeleton isn't one I know (Mixamo, KayKit or ours).");
  // a file that stores a T-pose clip uses it as the rest pose
  const rest = clips.find((c) => /t-?pose/i.test(c.name));
  const out: Imported[] = [];
  for (const clip of clips) {
    if (clip === rest) continue;
    const moved = avatar.retargetFrom(root, clip, map, rest);
    if (moved && moved.tracks.length > 0) {
      const name = clean(clips.length === 1 ? file.name.replace(/\.[^.]+$/, "") : `${file.name.replace(/\.[^.]+$/, "")}_${clip.name}`);
      moved.name = name;
      out.push({ name, clip: moved });
    }
  }
  if (out.length === 0) throw new Error("I couldn't match that skeleton to the body.");
  return out;
}
