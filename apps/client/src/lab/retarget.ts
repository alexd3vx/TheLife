import * as THREE from "three";

// Brings an animation made for a different skeleton (the KayKit rig) onto our bodies. Both rigs rest in a T-pose, so each mapped bone's
// turn is measured in world space against its own rest orientation and applied to the matching bone of our skeleton on top of its rest.
// The hips' travel is scaled to our body's size. Bones that have no partner stay as they rest (they follow whatever they hang from).

/** Our bone -> the KayKit bone that drives it. */
export const KAYKIT_BONES: Record<string, string> = {
  pelvis: "hips",
  spine_01: "spine",
  spine_02: "chest",
  Head: "head",
  upperarm_l: "upperarm.l",
  lowerarm_l: "lowerarm.l",
  hand_l: "hand.l",
  upperarm_r: "upperarm.r",
  lowerarm_r: "lowerarm.r",
  hand_r: "hand.r",
  thigh_l: "upperleg.l",
  calf_l: "lowerleg.l",
  foot_l: "foot.l",
  ball_l: "toes.l",
  thigh_r: "upperleg.r",
  calf_r: "lowerleg.r",
  foot_r: "foot.r",
  ball_r: "toes.r",
};

/** Our bone -> the Mixamo bone that drives it (the loader drops the colon: "mixamorig:Hips" arrives as "mixamorigHips"). */
export const MIXAMO_BONES: Record<string, string> = {
  pelvis: "mixamorig:Hips",
  spine_01: "mixamorig:Spine",
  spine_02: "mixamorig:Spine1",
  spine_03: "mixamorig:Spine2",
  neck_01: "mixamorig:Neck",
  Head: "mixamorig:Head",
  upperarm_l: "mixamorig:LeftArm",
  lowerarm_l: "mixamorig:LeftForeArm",
  hand_l: "mixamorig:LeftHand",
  upperarm_r: "mixamorig:RightArm",
  lowerarm_r: "mixamorig:RightForeArm",
  hand_r: "mixamorig:RightHand",
  thigh_l: "mixamorig:LeftUpLeg",
  calf_l: "mixamorig:LeftLeg",
  foot_l: "mixamorig:LeftFoot",
  ball_l: "mixamorig:LeftToeBase",
  thigh_r: "mixamorig:RightUpLeg",
  calf_r: "mixamorig:RightLeg",
  foot_r: "mixamorig:RightFoot",
  ball_r: "mixamorig:RightToeBase",
};

/** A skeleton's rest pose, taken before any animation moves it (retargeting is measured against it). */
export interface RestPose {
  local: Map<string, THREE.Quaternion>;
  world: Map<string, THREE.Quaternion>;
  pelvisPosition: THREE.Vector3;
  pelvisWorld: THREE.Vector3;
  headWorld: THREE.Vector3;
  pelvisParentQ: THREE.Quaternion;
  pelvisParentScale: THREE.Vector3;
  rootParentWorld: Map<string, THREE.Quaternion>;
  /** each bone's position in the frame's space */
  position: Map<string, THREE.Vector3>;
}

/** @param frame the body's own scene: everything is measured relative to it, so where the character stands or faces does not matter */
export function captureRest(bones: THREE.Bone[], frame: THREE.Object3D): RestPose {
  frame.updateMatrixWorld(true);
  const inv = frame.getWorldQuaternion(new THREE.Quaternion()).invert();
  const fs = frame.getWorldScale(new THREE.Vector3());
  const rel = (o: THREE.Object3D) => new THREE.Quaternion().copy(inv).multiply(o.getWorldQuaternion(new THREE.Quaternion()));
  const local = new Map<string, THREE.Quaternion>(), world = new Map<string, THREE.Quaternion>(), rootParentWorld = new Map<string, THREE.Quaternion>(), position = new Map<string, THREE.Vector3>();
  for (const b of bones) {
    position.set(b.name, frame.worldToLocal(b.getWorldPosition(new THREE.Vector3())));
    local.set(b.name, b.quaternion.clone());
    world.set(b.name, rel(b));
    if (b.parent && !(b.parent as THREE.Bone).isBone) rootParentWorld.set(b.name, rel(b.parent));
  }
  const pelvis = bones.find((b) => b.name === "pelvis");
  const head = bones.find((b) => b.name === "Head");
  // the hips' height in the frame's own units
  const pelvisWorld = pelvis ? frame.worldToLocal(pelvis.getWorldPosition(new THREE.Vector3())) : new THREE.Vector3(0, 1, 0);
  return {
    local,
    world,
    pelvisPosition: pelvis ? pelvis.position.clone() : new THREE.Vector3(),
    pelvisWorld,
    headWorld: head ? frame.worldToLocal(head.getWorldPosition(new THREE.Vector3())) : new THREE.Vector3(0, 1.6, 0),
    pelvisParentQ: pelvis?.parent ? rel(pelvis.parent) : new THREE.Quaternion(),
    pelvisParentScale: pelvis?.parent ? pelvis.parent.getWorldScale(new THREE.Vector3()).divide(fs) : new THREE.Vector3(1, 1, 1),
    rootParentWorld,
    position,
  };
}

const TRUNK = new Set(["pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head"]);
const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion();

/**
 * @param targetBones all bones of our skeleton (in their rest pose when called)
 * @param sourceRoot the loaded KayKit scene (its nodes in their rest pose)
 */
export function retargetClip(targetBones: THREE.Bone[], rest: RestPose, sourceRoot: THREE.Object3D, clip: THREE.AnimationClip, map: Record<string, string> = KAYKIT_BONES, fps = 30, restClip?: THREE.AnimationClip): THREE.AnimationClip {
  const byName = new Map(targetBones.map((b) => [b.name, b]));
  const srcByName = new Map<string, THREE.Object3D>();
  // the loader strips dots from node names ("upperleg.l" arrives as "upperlegl"), so look the partners up by that spelling
  sourceRoot.traverse((o) => srcByName.set(o.name, o));
  const clean = (n: string) => THREE.PropertyBinding.sanitizeNodeName(n);
  map = Object.fromEntries(Object.entries(map).map(([k, v]) => [k, srcByName.has(v) ? v : clean(v)]));
  sourceRoot.updateMatrixWorld(true);

  // our skeleton: rest local rotations, rest world rotations, and the bones in parent-first order
  const restLocal = new Map<THREE.Bone, THREE.Quaternion>(targetBones.map((b) => [b, rest.local.get(b.name)!]));
  const restWorld = new Map<THREE.Bone, THREE.Quaternion>(targetBones.map((b) => [b, rest.world.get(b.name)!]));
  const order = [...targetBones].sort((a, b) => depth(a) - depth(b));
  function depth(o: THREE.Object3D): number {
    let d = 0;
    for (let p = o.parent; p; p = p.parent) d++;
    return d;
  }
  const rootParentWorld = (b: THREE.Bone) => rest.rootParentWorld.get(b.name) ?? null;

  // the source's rest: its own T-pose clip when it has one (the nodes alone may not be stored in a T-pose)
  if (restClip) {
    const rm = new THREE.AnimationMixer(sourceRoot);
    rm.clipAction(restClip).play();
    rm.setTime(0);
    sourceRoot.updateMatrixWorld(true);
    rm.stopAllAction();
  }
  const srcRest = new Map<string, THREE.Quaternion>();
  const srcRestHips = new THREE.Vector3();
  for (const name of Object.values(map)) {
    const o = srcByName.get(name);
    if (o) srcRest.set(name, o.getWorldQuaternion(new THREE.Quaternion()));
  }
  const hipsSrc = srcByName.get(map["pelvis"]!);
  if (hipsSrc) hipsSrc.getWorldPosition(srcRestHips);
  const pelvis = byName.get("pelvis");
  // the travel is scaled by body height (the head), not by the hips: the stylised source has short legs
  const headSrc = srcByName.get(map["Head"]!);
  const srcHead = headSrc ? headSrc.getWorldPosition(new THREE.Vector3()) : null;
  const scale = srcHead && srcHead.y > 0.01 ? rest.headWorld.y / srcHead.y : 1;

  // our body does not rest in the same pose as the source (arms down at our sides against a T-pose): turn each bone so it points the
  // way its source partner points at rest, and the source's own movement then lands where it should
  const srcRestPos = new Map<string, THREE.Vector3>();
  for (const name of Object.values(map)) {
    const o = srcByName.get(name);
    if (o) srcRestPos.set(name, o.getWorldPosition(new THREE.Vector3()));
  }
  // some files face the other way (+Z or -Z, or turned on their root): measure which way each skeleton's feet point at rest and turn the
  // source's whole movement to face the way our body faces
  const feetAngle = (foot: (side: "l" | "r") => THREE.Vector3 | undefined, ball: (side: "l" | "r") => THREE.Vector3 | undefined): number | null => {
    let x = 0, z = 0;
    for (const side of ["l", "r"] as const) {
      const f = foot(side), b = ball(side);
      if (!f || !b) continue;
      x += b.x - f.x;
      z += b.z - f.z;
    }
    return Math.hypot(x, z) > 1e-4 ? Math.atan2(x, z) : null;
  };
  const tgtAng = feetAngle((sd) => rest.position.get(`foot_${sd}`), (sd) => rest.position.get(`ball_${sd}`));
  const srcAng = feetAngle((sd) => srcRestPos.get(map[`foot_${sd}`] ?? ""), (sd) => srcRestPos.get(map[`ball_${sd}`] ?? ""));
  const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tgtAng !== null && srcAng !== null ? tgtAng - srcAng : 0);
  const yawInv = yawQ.clone().invert();
  const correction = new Map<THREE.Bone, THREE.Quaternion>();
  for (const b of order) {
    const mine = map[b.name];
    if (!mine) continue;
    // the trunk, neck and head keep their own rest direction (only the limbs need turning to the source's rest pose)
    const child = TRUNK.has(b.name) ? undefined : b.children.find((c): c is THREE.Bone => (c as THREE.Bone).isBone && !!map[c.name]);
    let fix = new THREE.Quaternion();
    if (child) {
      const dt = rest.position.get(child.name)!.clone().sub(rest.position.get(b.name)!).normalize();
      const ds = srcRestPos.get(map[child.name]!)!.clone().sub(srcRestPos.get(mine)!).normalize().applyQuaternion(yawQ);
      if (dt.lengthSq() > 0.5 && ds.lengthSq() > 0.5) fix = new THREE.Quaternion().setFromUnitVectors(dt, ds);
    } else if (!TRUNK.has(b.name) && b.parent && correction.has(b.parent as THREE.Bone)) fix = correction.get(b.parent as THREE.Bone)!.clone();
    correction.set(b, fix);
  }

  // sample the source pose at every frame
  sourceRoot.updateMatrixWorld(true);
  const mixer = new THREE.AnimationMixer(sourceRoot);
  const action = mixer.clipAction(clip);
  action.play();
  const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times: number[] = [];
  const values = new Map<string, number[]>();
  const hipPos: number[] = [];
  for (const b of order) if (map[b.name]) values.set(b.name, []);
  const worldNow = new Map<THREE.Bone, THREE.Quaternion>();

  for (let f = 0; f < frames; f++) {
    const t = Math.min(clip.duration, f / fps);
    times.push(t);
    mixer.setTime(t);
    sourceRoot.updateMatrixWorld(true);
    for (const b of order) {
      const parent = b.parent as THREE.Bone | null;
      const parentWorld = parent && (parent as THREE.Bone).isBone ? worldNow.get(parent)! : rootParentWorld(b) ?? q3.identity();
      const src = map[b.name] ? srcByName.get(map[b.name]!) : undefined;
      let local: THREE.Quaternion;
      if (src) {
        // how far the source bone has turned from its rest, in world space, applied on top of our bone's own rest world rotation
        const delta = new THREE.Quaternion().copy(yawQ).multiply(src.getWorldQuaternion(q).multiply(q2.copy(srcRest.get(map[b.name]!)!).invert())).multiply(yawInv);
        const wanted = new THREE.Quaternion().copy(delta).multiply(correction.get(b)!).multiply(restWorld.get(b)!);
        local = new THREE.Quaternion().copy(parentWorld).invert().multiply(wanted);
        const arr = values.get(b.name)!;
        arr.push(local.x, local.y, local.z, local.w);
      } else local = restLocal.get(b)!;
      worldNow.set(b, new THREE.Quaternion().copy(parentWorld).multiply(local));
    }
    if (hipsSrc) {
      const p = hipsSrc.getWorldPosition(new THREE.Vector3());
      const d = new THREE.Vector3((p.x - srcRestHips.x) * scale, (p.y - srcRestHips.y) * scale, (p.z - srcRestHips.z) * scale).applyQuaternion(yawQ);
      hipPos.push(d.x, d.y, d.z);
    }
  }
  mixer.stopAllAction();

  const tracks: THREE.KeyframeTrack[] = [];
  for (const [name, arr] of values) tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, arr));
  if (pelvis && hipPos.length) {
    const base = rest.pelvisPosition;
    // the hips' travel was measured in the world: bring it into the space of the bone's parent
    if (pelvis.parent) {
      const pq = rest.pelvisParentQ.clone().invert();
      const ps = rest.pelvisParentScale;
      const v = new THREE.Vector3();
      for (let i = 0; i < hipPos.length; i += 3) {
        v.set(hipPos[i]!, hipPos[i + 1]!, hipPos[i + 2]!).applyQuaternion(pq).divide(ps);
        hipPos[i] = v.x;
        hipPos[i + 1] = v.y;
        hipPos[i + 2] = v.z;
      }
    }
    tracks.push(new THREE.VectorKeyframeTrack("pelvis.position", times, hipPos.map((v, i) => v + [base.x, base.y, base.z][i % 3]!)));
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
