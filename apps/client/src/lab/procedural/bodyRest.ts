import * as THREE from "three";

/** What garment and hair builders need to know about the body in its bind (T-)pose. */
export interface BodyRest {
  /** Unmasked copy of the body skin geometry, in the mesh's local space. */
  geometry: THREE.BufferGeometry;
  /** Joint position by bone name, in the mesh's local space. */
  joint: Map<string, THREE.Vector3>;
  /** Joint rotation by bone name in the bind pose (world, mesh-local space). */
  jointQuat: Map<string, THREE.Quaternion>;
  /** Dominant bone index for each vertex. */
  vertexBone: Uint16Array;
  boneIndex: Map<string, number>;
  /** Transform from mesh-local space to a bone's local space (for rigid attachments such as hair). */
  toBoneSpace(name: string): THREE.Matrix4 | null;
}

export function readBodyRest(mesh: THREE.SkinnedMesh, pristine: THREE.BufferGeometry, vertexBone: Uint16Array): BodyRest {
  const skeleton = mesh.skeleton;
  const joint = new Map<string, THREE.Vector3>();
  const jointQuat = new Map<string, THREE.Quaternion>();
  const boneIndex = new Map<string, number>();
  skeleton.bones.forEach((bone, i) => {
    boneIndex.set(bone.name, i);
    const world = new THREE.Matrix4().copy(skeleton.boneInverses[i]!).invert();
    const local = new THREE.Matrix4().multiplyMatrices(mesh.bindMatrixInverse, world);
    joint.set(bone.name, new THREE.Vector3().setFromMatrixPosition(local));
    jointQuat.set(bone.name, new THREE.Quaternion().setFromRotationMatrix(local));
  });
  return {
    geometry: pristine,
    joint,
    jointQuat,
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

/** The box around the skin the Head bone moves (the skull, face and jaw), in the mesh's local space. */
export function headBox(rest: BodyRest): THREE.Box3 | null {
  const head = rest.boneIndex.get("Head");
  if (head === undefined) return null;
  const position = rest.geometry.getAttribute("position");
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    if (rest.vertexBone[i] !== head) continue;
    box.expandByPoint(point.fromBufferAttribute(position, i));
  }
  return box.isEmpty() ? null : box;
}

/** The same box for the stylised (Superhero) bodies the Quaternius hairstyles were modelled for. */
export const STYLISED_HEAD_BOX: Record<"male" | "female", THREE.Box3> = {
  male: new THREE.Box3(new THREE.Vector3(-0.091, 1.577, -0.106), new THREE.Vector3(0.091, 1.81, 0.115)),
  female: new THREE.Box3(new THREE.Vector3(-0.089, 1.538, -0.113), new THREE.Vector3(0.089, 1.767, 0.112)),
};
