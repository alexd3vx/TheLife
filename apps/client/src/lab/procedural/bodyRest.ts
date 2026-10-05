import * as THREE from "three";

/** What garment and hair builders need to know about the body in its bind (T-)pose. */
export interface BodyRest {
  /** Unmasked copy of the body skin geometry, in the mesh's local space. */
  geometry: THREE.BufferGeometry;
  /** Joint position by bone name, in the mesh's local space. */
  joint: Map<string, THREE.Vector3>;
  /** Dominant bone index for each vertex. */
  vertexBone: Uint16Array;
  boneIndex: Map<string, number>;
  /** Transform from mesh-local space to a bone's local space (for rigid attachments such as hair). */
  toBoneSpace(name: string): THREE.Matrix4 | null;
}

export function readBodyRest(mesh: THREE.SkinnedMesh, pristine: THREE.BufferGeometry, vertexBone: Uint16Array): BodyRest {
  const skeleton = mesh.skeleton;
  const joint = new Map<string, THREE.Vector3>();
  const boneIndex = new Map<string, number>();
  skeleton.bones.forEach((bone, i) => {
    boneIndex.set(bone.name, i);
    const world = new THREE.Matrix4().copy(skeleton.boneInverses[i]!).invert();
    const local = new THREE.Matrix4().multiplyMatrices(mesh.bindMatrixInverse, world);
    joint.set(bone.name, new THREE.Vector3().setFromMatrixPosition(local));
  });
  return {
    geometry: pristine,
    joint,
    vertexBone,
    boneIndex,
    toBoneSpace(name) {
      const i = boneIndex.get(name);
      if (i === undefined) return null;
      return new THREE.Matrix4().multiplyMatrices(skeleton.boneInverses[i]!, mesh.bindMatrix);
    },
  };
}

export function jointPos(rest: BodyRest, name: string): THREE.Vector3 {
  const v = rest.joint.get(name);
  if (!v) throw new Error(`Skeleton has no bone "${name}"`);
  return v;
}
