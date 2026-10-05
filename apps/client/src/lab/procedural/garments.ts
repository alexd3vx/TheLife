import * as THREE from "three";
import { jointPos, type BodyRest } from "./bodyRest";
import { buildGeometry, clipField, clipPlane, extractTriangles, type Triangle } from "./geometryClip";

export interface GarmentChoice {
  id: string;
  label: string;
}

export const PROC_TOPS: GarmentChoice[] = [
  { id: "p_tee", label: "T-shirt" },
  { id: "p_tank", label: "Tank top" },
  { id: "p_long", label: "Long sleeve" },
  { id: "p_kaftan", label: "Kaftan" },
];
export const PROC_BOTTOMS: GarmentChoice[] = [
  { id: "p_shorts", label: "Shorts" },
  { id: "p_trousers", label: "Trousers" },
];
export const PROC_SHOES: GarmentChoice[] = [{ id: "p_sneakers", label: "Sneakers" }];

export interface GarmentResult {
  geometry: THREE.BufferGeometry;
  /** Bones whose skin triangles can be hidden because this garment fully covers them. */
  covers: string[];
  /** Indices of the body's triangles (in index-buffer order) that lie wholly under the garment, so their skin can be hidden. */
  coveredTriangles: Set<number>;
  slot: "top" | "bottom" | "shoes";
}

interface Spec {
  slot: GarmentResult["slot"];
  offset: number;
  covers: string[];
  /** Applies the cuts (hems, sleeve ends, neckline). */
  cut(triangles: Triangle[], rest: BodyRest): Triangle[];
  adjust?: (p: THREE.Vector3, n: THREE.Vector3) => void;
}

const both = (name: string) => [`${name}_l`, `${name}_r`];

/**
 * Cuts a round neckline: drops everything above the shoulders and any triangle sitting inside a cylinder around
 * the neck. (A flat horizontal cut would slice through the sloping shoulder tops and leave ragged holes.)
 */
function cutNeckline(triangles: Triangle[], rest: BodyRest, radius: number, drop: number): Triangle[] {
  const neck = jointPos(rest, "neck_01");
  // A signed distance to the kept region: positive outside the three removed zones (above the shoulders, the neck
  // cylinder, and the jaw/face box), so the cut follows a clean line even where the body mesh is coarse.
  return clipField(triangles, (p) => {
    const aboveShoulders = neck.y + 0.11 - p[1];
    const inNeck = Math.max(Math.hypot(p[0] - neck.x, p[2] - neck.z) - radius, neck.y - drop - p[1]);
    const inHead = Math.max(Math.abs(p[0] - neck.x) - 0.115, neck.y + 0.035 - p[1]);
    return Math.min(aboveShoulders, inNeck, inHead);
  });
}

const ARM_BONE = /^(upperarm|lowerarm|hand|index|middle|ring|pinky|thumb)/;

/** Bone indices of one arm (shoulder joint to fingertips), for telling arm triangles from body triangles. */
function armBones(rest: BodyRest, side: "l" | "r"): Set<number> {
  const out = new Set<number>();
  for (const [name, index] of rest.boneIndex) if (name.endsWith(`_${side}`) && ARM_BONE.test(name)) out.add(index);
  return out;
}

function armWeight(v: Triangle[number], bones: Set<number>): number {
  let total = 0;
  for (let k = 0; k < 4; k++) if (bones.has(v.si[k]!)) total += v.sw[k]!;
  return total;
}

const isArmTriangle = (tri: Triangle, bones: Set<number>) => tri.every((v) => armWeight(v, bones) > 0.5);

/**
 * Cuts both sleeves with a plane square to the arm, `t` of the way from joint `from` to joint `to` (0 = the shoulder
 * end, 1 = the far end). Works whatever pose the body is in: T-pose arms stick out sideways, A-pose arms hang down.
 * Only triangles that belong to the arm are cut, so the torso is never touched.
 */
function cutSleeves(triangles: Triangle[], rest: BodyRest, from: string, to: string, t: number): Triangle[] {
  let out = triangles;
  for (const side of ["l", "r"] as const) {
    const bones = armBones(rest, side);
    const a = jointPos(rest, `${from}_${side}`);
    const b = jointPos(rest, `${to}_${side}`);
    const dir = b.clone().sub(a).normalize();
    const q = a.clone().lerp(b, t);
    const arm = out.filter((tri) => isArmTriangle(tri, bones));
    const body = out.filter((tri) => !isArmTriangle(tri, bones));
    const kept = clipPlane(arm, [-dir.x, -dir.y, -dir.z], dir.dot(q));
    out = [...body, ...kept];
  }
  return out;
}

/** Drops the arms completely (trousers and shorts: in an A-pose the hands hang beside the hips). */
function withoutArms(triangles: Triangle[], rest: BodyRest): Triangle[] {
  const left = armBones(rest, "l");
  const right = armBones(rest, "r");
  return triangles.filter((tri) => !tri.some((v) => armWeight(v, left) > 0.5 || armWeight(v, right) > 0.5));
}

const SPECS: Record<string, Spec> = {
  p_tee: {
    slot: "top",
    offset: 0.02,
    covers: ["spine_01", "spine_02", "spine_03", ...both("clavicle")],
    cut(tris, rest) {
      const hem = jointPos(rest, "pelvis").y + 0.1;
      let out = clipPlane(tris, [0, 1, 0], -hem);
      out = cutNeckline(out, rest, 0.085, 0.03);
      return cutSleeves(out, rest, "upperarm", "lowerarm", 0.5);
    },
  },
  p_tank: {
    slot: "top",
    offset: 0.018,
    covers: ["spine_01", "spine_02", "spine_03"],
    cut(tris, rest) {
      const hem = jointPos(rest, "pelvis").y + 0.1;
      let out = clipPlane(tris, [0, 1, 0], -hem);
      out = cutNeckline(out, rest, 0.12, 0.09);
      return cutSleeves(out, rest, "upperarm", "lowerarm", -0.1);
    },
  },
  p_long: {
    slot: "top",
    offset: 0.02,
    covers: ["spine_01", "spine_02", "spine_03", ...both("clavicle")],
    cut(tris, rest) {
      const hem = jointPos(rest, "pelvis").y + 0.1;
      let out = clipPlane(tris, [0, 1, 0], -hem);
      out = cutNeckline(out, rest, 0.085, 0.03);
      return cutSleeves(out, rest, "lowerarm", "hand", 0.7);
    },
  },
  p_kaftan: {
    slot: "top",
    offset: 0.032,
    covers: ["spine_01", "spine_02", "spine_03", ...both("clavicle")],
    cut(tris, rest) {
      const thigh = jointPos(rest, "thigh_l").y;
      const calf = jointPos(rest, "calf_l").y;
      const hem = thigh + (calf - thigh) * 0.55;
      let out = clipPlane(tris, [0, 1, 0], -hem);
      out = cutNeckline(out, rest, 0.085, 0.03);
      return cutSleeves(out, rest, "lowerarm", "hand", 0.15);
    },
  },
  p_shorts: {
    slot: "bottom",
    offset: 0.012,
    covers: ["pelvis"],
    cut(tris, rest) {
      const thigh = jointPos(rest, "thigh_l").y;
      const calf = jointPos(rest, "calf_l").y;
      const waist = jointPos(rest, "pelvis").y + 0.17;
      const hem = thigh + (calf - thigh) * 0.5;
      return clipPlane(clipPlane(withoutArms(tris, rest), [0, -1, 0], waist), [0, 1, 0], -hem);
    },
  },
  p_trousers: {
    slot: "bottom",
    offset: 0.012,
    covers: ["pelvis", ...both("thigh"), ...both("calf")],
    cut(tris, rest) {
      const waist = jointPos(rest, "pelvis").y + 0.17;
      const ankle = jointPos(rest, "foot_l").y + 0.035;
      return clipPlane(clipPlane(withoutArms(tris, rest), [0, -1, 0], waist), [0, 1, 0], -ankle);
    },
  },
  p_sneakers: {
    slot: "shoes",
    offset: 0.017,
    covers: [...both("foot"), ...both("ball"), ...both("ball_leaf")],
    cut(tris, rest) {
      const top = jointPos(rest, "foot_l").y + 0.075;
      return clipPlane(withoutArms(tris, rest), [0, -1, 0], top);
    },
    adjust(p) {
      // Thicker sole: pull the underside down a little.
      if (p.y < 0.05) p.y -= (0.05 - p.y) * 0.4;
    },
  },
};

export function isProceduralGarment(id: string | null): id is string {
  return !!id && id in SPECS;
}

export function buildGarment(rest: BodyRest, id: string): GarmentResult | null {
  const spec = SPECS[id];
  if (!spec) return null;
  // The cut planes alone define each garment's area (bone boundaries are ragged, planes are clean).
  const all = extractTriangles(rest.geometry, () => true);
  const order = new Map<Triangle, number>(all.map((tri, i) => [tri, i]));
  const triangles = spec.cut(all, rest);
  if (triangles.length === 0) return null;
  // Whole triangles come through the cuts as the same objects; those are exactly the ones under the garment.
  const coveredTriangles = new Set<number>();
  for (const tri of triangles) {
    const id = order.get(tri);
    if (id !== undefined) coveredTriangles.add(id);
  }
  const geometry = buildGeometry(triangles, { offset: spec.offset, uvScale: 3.2, ...(spec.adjust ? { adjust: spec.adjust } : {}) });
  return { geometry, covers: [], coveredTriangles, slot: spec.slot };
}
