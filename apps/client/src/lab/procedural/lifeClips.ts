import * as THREE from "three";

// Everyday-life animations (sleep, eat, drink, type, phone, wave, cook) authored in code on top of the
// imported library clips. Each one starts from a base clip (Idle or Sitting) so it keeps natural breathing and sway,
// and adds or replaces motion on a few joints.
//
// How a bend is chosen: rigs differ in how their bones are twisted, so instead of assuming which local axis is
// "elbow", we pose the real skeleton on the base clip, try each local axis, and keep the one that moves the child
// joint (hand) toward a goal direction (forward, up, out). That works for both bodies and any base pose.

/** Every clip this module builds; tests check that game actions only use clips that exist. */
export const LIFE_CLIP_NAMES = [
  "Life_Eat_Standing_Loop",
  "Life_Eat_Loop",
  "Life_Drink_Loop",
  "Life_Type_Loop",
  "Life_Phone_Loop",
  "Life_Wave_Loop",
  "Life_Wash_Loop",
  "Life_Brush_Loop",
  "Life_Read_Loop",
  "Life_Cook_Loop",
  "Life_Sleep_Loop",
  // short body-language clips the character plays when idle (played once)
  "Life_Yawn",
  "Life_Stretch",
  "Life_BellyRub",
  "Life_Fidget",
] as const;

const DEG = Math.PI / 180;
const AXES = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

const CHILD: Record<string, string> = {
  upperarm_l: "lowerarm_l",
  upperarm_r: "lowerarm_r",
  lowerarm_l: "hand_l",
  lowerarm_r: "hand_r",
  thigh_l: "calf_l",
  thigh_r: "calf_r",
  spine_01: "spine_02",
  spine_02: "spine_03",
  spine_03: "neck_01",
  neck_01: "Head",
};

interface Context {
  root: THREE.Object3D;
  bones: Map<string, THREE.Bone>;
}

function posedAt(ctx: Context, clip: THREE.AnimationClip): void {
  const mixer = new THREE.AnimationMixer(ctx.root);
  mixer.clipAction(clip).play();
  mixer.setTime(0);
  ctx.root.updateMatrixWorld(true);
  mixer.stopAllAction();
  mixer.uncacheRoot(ctx.root);
}

/**
 * The local rotation of `bone` (by `degrees`) that moves its child joint toward `goal` (a world direction),
 * given the skeleton's current pose.
 */
function bend(ctx: Context, boneName: string, goal: THREE.Vector3, degrees: number): THREE.Quaternion {
  const bone = ctx.bones.get(boneName);
  const child = ctx.bones.get(CHILD[boneName] ?? "");
  if (!bone || !child) return new THREE.Quaternion();

  const worldQ = bone.getWorldQuaternion(new THREE.Quaternion());
  const inverse = worldQ.clone().invert();
  const arm = child.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3()));
  const goalDir = goal.clone().normalize();

  let best = AXES[0]!;
  let bestScore = -Infinity;
  for (const axis of AXES) {
    const trial = new THREE.Quaternion().setFromAxisAngle(axis, 15 * DEG);
    const moved = arm.clone().applyQuaternion(inverse).applyQuaternion(trial).applyQuaternion(worldQ).sub(arm);
    const score = moved.dot(goalDir);
    if (score > bestScore) {
      bestScore = score;
      best = axis;
    }
  }
  return new THREE.Quaternion().setFromAxisAngle(best, degrees * DEG);
}

type Keyframe = { t: number; q: THREE.Quaternion };

function sampleQuat(track: THREE.KeyframeTrack, t: number): THREE.Quaternion {
  const out = track.createInterpolant().evaluate(t) as unknown as ArrayLike<number>;
  return new THREE.Quaternion(out[0], out[1], out[2], out[3]);
}

function findTrack(clip: THREE.AnimationClip, bone: string, property: "quaternion" | "position"): THREE.KeyframeTrack | undefined {
  return clip.tracks.find((t) => t.name === `${bone}.${property}`);
}

/** Multiplies a bone's animated rotation by a keyframed local offset. */
function addRotation(clip: THREE.AnimationClip, bone: string, offsets: Keyframe[]) {
  const existing = findTrack(clip, bone, "quaternion");
  if (!existing) return;
  const values: number[] = [];
  for (const key of offsets) {
    const q = sampleQuat(existing, key.t % clip.duration).multiply(key.q);
    values.push(q.x, q.y, q.z, q.w);
  }
  const track = new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, offsets.map((k) => k.t), values);
  clip.tracks = clip.tracks.filter((t) => t !== existing).concat(track);
}

function cycle(duration: number, steps: number, make: (phase: number) => THREE.Quaternion): Keyframe[] {
  const keys: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) keys.push({ t: (i / steps) * duration, q: make(i / steps) });
  return keys;
}

const identity = () => new THREE.Quaternion();
const slerp = (a: THREE.Quaternion, b: THREE.Quaternion, t: number) => a.clone().slerp(b, t);

/** 0 -> 1 -> hold -> 0, smooth. */
function pulse(phase: number, rise = 0.25, hold = 0.35): number {
  if (phase < rise) return 0.5 - 0.5 * Math.cos((phase / rise) * Math.PI);
  if (phase < rise + hold) return 1;
  const f = (phase - rise - hold) / (1 - rise - hold);
  return 0.5 + 0.5 * Math.cos(f * Math.PI);
}

function cloneClip(base: THREE.AnimationClip, name: string, duration?: number): THREE.AnimationClip {
  const clip = base.clone();
  clip.name = name;
  if (duration) clip.duration = duration;
  return clip;
}

const FORWARD = new THREE.Vector3(0, 0, 1);

export function buildLifeClips(
  ctx: Context,
  library: Map<string, THREE.AnimationClip>,
): THREE.AnimationClip[] {
  const idle = library.get("Idle_Loop");
  const sitting = library.get("Sitting_Idle_Loop");
  if (!idle || !sitting) return [];
  const out: THREE.AnimationClip[] = [];

  // Bringing a hand to the mouth: lift the upper arm forward, bend the elbow, hold, lower.
  const handToMouth = (base: THREE.AnimationClip, name: string, duration: number, shoulderDeg: number, elbowDeg: number, rise: number, hold: number) => {
    const clip = cloneClip(base, name, duration);
    posedAt(ctx, base);
    const shoulder = bend(ctx, "upperarm_r", FORWARD, shoulderDeg);
    const elbow = bend(ctx, "lowerarm_r", FORWARD, elbowDeg);
    addRotation(clip, "upperarm_r", cycle(duration, 12, (p) => slerp(identity(), shoulder, pulse(p, rise, hold))));
    addRotation(clip, "lowerarm_r", cycle(duration, 12, (p) => slerp(identity(), elbow, pulse(p, rise, hold))));
    out.push(clip);
  };
  handToMouth(idle, "Life_Eat_Standing_Loop", 3.2, 38, 95, 0.22, 0.3);
  handToMouth(sitting, "Life_Eat_Loop", 3.2, 30, 70, 0.22, 0.3);
  handToMouth(sitting, "Life_Drink_Loop", 4.4, 32, 82, 0.2, 0.45);

  // Typing: forearms forward over the keyboard, wrists tapping alternately.
  {
    const clip = cloneClip(sitting, "Life_Type_Loop", 2);
    posedAt(ctx, sitting);
    for (const side of ["l", "r"] as const) {
      const shoulder = bend(ctx, `upperarm_${side}`, FORWARD, 14);
      const elbow = bend(ctx, `lowerarm_${side}`, FORWARD, 22);
      const tap = bend(ctx, `lowerarm_${side}`, new THREE.Vector3(0, -1, 0), 4);
      const offset = side === "l" ? 0 : 0.5;
      addRotation(clip, `upperarm_${side}`, cycle(2, 4, () => shoulder.clone()));
      addRotation(clip, `lowerarm_${side}`, cycle(2, 16, (p) => elbow.clone().multiply(slerp(identity(), tap, 0.5 + 0.5 * Math.sin((p * 4 + offset) * Math.PI * 2)))));
    }
    out.push(clip);
  }

  // Phone call: right hand held at the ear.
  {
    const clip = cloneClip(idle, "Life_Phone_Loop");
    posedAt(ctx, idle);
    const shoulder = bend(ctx, "upperarm_r", FORWARD, 52);
    const elbow = bend(ctx, "lowerarm_r", FORWARD, 100);
    addRotation(clip, "upperarm_r", cycle(clip.duration, 4, () => shoulder.clone()));
    addRotation(clip, "lowerarm_r", cycle(clip.duration, 4, () => elbow.clone()));
    out.push(clip);
  }

  // Wave hello: right arm lifted in front, forearm up, swinging back and forth.
  {
    const clip = cloneClip(idle, "Life_Wave_Loop", 1.6);
    posedAt(ctx, idle);
    const shoulder = bend(ctx, "upperarm_r", FORWARD, 100);
    const elbow = bend(ctx, "lowerarm_r", FORWARD, 30);
    const swing = bend(ctx, "lowerarm_r", FORWARD, 30);
    addRotation(clip, "upperarm_r", cycle(1.6, 4, () => shoulder.clone()));
    addRotation(clip, "lowerarm_r", cycle(1.6, 16, (p) => elbow.clone().multiply(slerp(identity(), swing, 0.5 + 0.5 * Math.sin(p * 4 * Math.PI * 2)))));
    out.push(clip);
  }

  // Cooking: hands forward at waist height, stirring in small circles.
  {
    const clip = cloneClip(idle, "Life_Cook_Loop", 2.4);
    posedAt(ctx, idle);
    for (const side of ["l", "r"] as const) {
      const shoulder = bend(ctx, `upperarm_${side}`, FORWARD, 14);
      const elbow = bend(ctx, `lowerarm_${side}`, FORWARD, 64);
      const stir = bend(ctx, `upperarm_${side}`, FORWARD, 7);
      const offset = side === "l" ? 0 : 1.6;
      addRotation(clip, `upperarm_${side}`, cycle(2.4, 12, (p) => shoulder.clone().multiply(slerp(identity(), stir, Math.sin(p * Math.PI * 2 + offset)))));
      addRotation(clip, `lowerarm_${side}`, cycle(2.4, 4, () => elbow.clone()));
    }
    out.push(clip);
  }

  // Washing in the shower: both hands up, scrubbing the head.
  {
    const clip = cloneClip(idle, "Life_Wash_Loop", 2);
    posedAt(ctx, idle);
    for (const side of ["l", "r"] as const) {
      const shoulder = bend(ctx, `upperarm_${side}`, FORWARD, 70);
      const elbow = bend(ctx, `lowerarm_${side}`, FORWARD, 112);
      const scrub = bend(ctx, `lowerarm_${side}`, FORWARD, 14);
      const offset = side === "l" ? 0 : 0.5;
      addRotation(clip, `upperarm_${side}`, cycle(2, 4, () => shoulder.clone()));
      addRotation(clip, `lowerarm_${side}`, cycle(2, 16, (p) => elbow.clone().multiply(slerp(identity(), scrub, 0.5 + 0.5 * Math.sin((p * 4 + offset) * Math.PI * 2)))));
    }
    out.push(clip);
  }

  // Brushing teeth: right hand at the mouth, quick short strokes.
  {
    const clip = cloneClip(idle, "Life_Brush_Loop", 1.2);
    posedAt(ctx, idle);
    const shoulder = bend(ctx, "upperarm_r", FORWARD, 36);
    const elbow = bend(ctx, "lowerarm_r", FORWARD, 96);
    const stroke = bend(ctx, "lowerarm_r", FORWARD, 9);
    addRotation(clip, "upperarm_r", cycle(1.2, 4, () => shoulder.clone()));
    addRotation(clip, "lowerarm_r", cycle(1.2, 12, (p) => elbow.clone().multiply(slerp(identity(), stroke, 0.5 + 0.5 * Math.sin(p * 6 * Math.PI * 2)))));
    out.push(clip);
  }

  // Reading: holding a book in both hands in front of the chest.
  {
    const clip = cloneClip(idle, "Life_Read_Loop");
    posedAt(ctx, idle);
    for (const side of ["l", "r"] as const) {
      const shoulder = bend(ctx, `upperarm_${side}`, FORWARD, 24);
      const elbow = bend(ctx, `lowerarm_${side}`, FORWARD, 78);
      addRotation(clip, `upperarm_${side}`, cycle(clip.duration, 4, () => shoulder.clone()));
      addRotation(clip, `lowerarm_${side}`, cycle(clip.duration, 4, () => elbow.clone()));
    }
    out.push(clip);
  }

  // Sleeping: lie on the back, legs straight, breathing from the idle clip.
  {
    const clip = cloneClip(idle, "Life_Sleep_Loop");
    const lie = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const rotation = findTrack(clip, "pelvis", "quaternion");
    if (rotation) {
      const times = Array.from(rotation.times);
      const values: number[] = [];
      for (const t of times) {
        const q = lie.clone().multiply(sampleQuat(rotation, t));
        values.push(q.x, q.y, q.z, q.w);
      }
      clip.tracks = clip.tracks.filter((t) => t !== rotation).concat(new THREE.QuaternionKeyframeTrack("pelvis.quaternion", times, values));
    }
    const position = findTrack(clip, "pelvis", "position");
    if (position) {
      const times = Array.from(position.times);
      const values: number[] = [];
      for (let i = 0; i < times.length; i++) values.push(position.values[i * 3]!, 0.2, 0);
      clip.tracks = clip.tracks.filter((t) => t !== position).concat(new THREE.VectorKeyframeTrack("pelvis.position", times, values));
    }
    // Idle has a weight-shift pose; lying down that becomes a raised knee. Drop the leg tracks so legs stay straight.
    clip.tracks = clip.tracks.filter((t) => !/^(thigh|calf|foot|ball)/.test(t.name));
    out.push(clip);
  }

  // ---- body language, played once while standing idle (see the controller's idle behaviours)
  const UP_FORWARD = new THREE.Vector3(0, 1, 0.6);
  const BACK = new THREE.Vector3(0, 0, -1);
  const IN = { l: new THREE.Vector3(-1, 0, 0), r: new THREE.Vector3(1, 0, 0) };

  // Yawn: hand to the mouth, head tipped back, a deep breath.
  {
    const clip = cloneClip(idle, "Life_Yawn", 4.6);
    posedAt(ctx, idle);
    const shoulder = bend(ctx, "upperarm_r", FORWARD, 52);
    const elbow = bend(ctx, "lowerarm_r", FORWARD, 112);
    const head = bend(ctx, "neck_01", BACK, 15);
    const chest = bend(ctx, "spine_03", BACK, 7);
    const wave = (p: number) => pulse(p, 0.22, 0.4);
    addRotation(clip, "upperarm_r", cycle(4.6, 16, (p) => slerp(identity(), shoulder, wave(p))));
    addRotation(clip, "lowerarm_r", cycle(4.6, 16, (p) => slerp(identity(), elbow, wave(p))));
    addRotation(clip, "neck_01", cycle(4.6, 16, (p) => slerp(identity(), head, wave(p))));
    addRotation(clip, "spine_03", cycle(4.6, 16, (p) => slerp(identity(), chest, wave(p))));
    out.push(clip);
  }

  // Stretch: both arms up over the head, back arched, then relax.
  {
    const clip = cloneClip(idle, "Life_Stretch", 5);
    posedAt(ctx, idle);
    const wave = (p: number) => pulse(p, 0.3, 0.32);
    for (const side of ["l", "r"] as const) {
      const lift = bend(ctx, `upperarm_${side}`, UP_FORWARD, 150);
      addRotation(clip, `upperarm_${side}`, cycle(5, 20, (p) => slerp(identity(), lift, wave(p))));
    }
    const arch = bend(ctx, "spine_02", BACK, 9);
    const archHigh = bend(ctx, "spine_03", BACK, 7);
    const head = bend(ctx, "neck_01", BACK, 10);
    addRotation(clip, "spine_02", cycle(5, 20, (p) => slerp(identity(), arch, wave(p))));
    addRotation(clip, "spine_03", cycle(5, 20, (p) => slerp(identity(), archHigh, wave(p))));
    addRotation(clip, "neck_01", cycle(5, 20, (p) => slerp(identity(), head, wave(p))));
    out.push(clip);
  }

  // Hungry: rubbing the stomach in slow circles, a slight hunch.
  {
    const clip = cloneClip(idle, "Life_BellyRub", 3.6);
    posedAt(ctx, idle);
    const shoulder = bend(ctx, "upperarm_r", FORWARD, 9);
    const elbow = bend(ctx, "lowerarm_r", FORWARD, 60);
    const circle = bend(ctx, "upperarm_r", FORWARD, 6);
    const hunch = bend(ctx, "spine_02", FORWARD, 7);
    const wave = (p: number) => pulse(p, 0.15, 0.7);
    addRotation(clip, "upperarm_r", cycle(3.6, 24, (p) => slerp(identity(), shoulder, wave(p)).multiply(slerp(identity(), circle, Math.sin(p * 3 * Math.PI * 2) * wave(p)))));
    addRotation(clip, "lowerarm_r", cycle(3.6, 24, (p) => slerp(identity(), elbow, wave(p))));
    addRotation(clip, "spine_02", cycle(3.6, 24, (p) => slerp(identity(), hunch, wave(p))));
    out.push(clip);
  }

  // Needs the toilet: knees together, weight shifting from foot to foot.
  {
    const clip = cloneClip(idle, "Life_Fidget", 2.4);
    posedAt(ctx, idle);
    for (const side of ["l", "r"] as const) {
      const squeeze = bend(ctx, `thigh_${side}`, IN[side], 7);
      const offset = side === "l" ? 0 : Math.PI;
      addRotation(clip, `thigh_${side}`, cycle(2.4, 24, (p) => slerp(identity(), squeeze, 0.55 + 0.45 * Math.sin(p * 2 * Math.PI * 2 + offset))));
    }
    out.push(clip);
  }

  // Leave the skeleton the way we found it.
  ctx.root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.pose();
  });
  return out;
}
