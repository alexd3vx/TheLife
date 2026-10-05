import * as THREE from "three";
import { jointPos, type BodyRest } from "./bodyRest";
import { buildGeometry, clipPlane, extractTriangles, type Triangle } from "./geometryClip";

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
  return triangles.filter((tri) => {
    const cx = (tri[0].p[0] + tri[1].p[0] + tri[2].p[0]) / 3;
    const cy = (tri[0].p[1] + tri[1].p[1] + tri[2].p[1]) / 3;
    const cz = (tri[0].p[2] + tri[1].p[2] + tri[2].p[2]) / 3;
    const maxY = Math.max(tri[0].p[1], tri[1].p[1], tri[2].p[1]);
    if (maxY > neck.y + 0.11) return false;
    const distance = Math.hypot(cx - neck.x, cz - neck.z);
    const inNeck = distance < radius && cy > neck.y - drop;
    const inHead = Math.abs(cx - neck.x) < 0.115 && cy > neck.y + 0.035; // jaw, chin and face sit above the collar line, and stick out forwards
    return !(inNeck || inHead);
  });
}

/** Keep |x| <= limit (cuts both arms at the same distance from the body's centre line). */
function limitWidth(triangles: Triangle[], limit: number) {
  return clipPlane(clipPlane(triangles, [-1, 0, 0], limit), [1, 0, 0], limit);
}

function armX(rest: BodyRest, from: string, to: string, t: number) {
  const a = Math.abs(jointPos(rest, `${from}_l`).x);
  const b = Math.abs(jointPos(rest, `${to}_l`).x);
  return a + (b - a) * t;
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
      return limitWidth(out, armX(rest, "upperarm", "lowerarm", 0.5));
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
      return limitWidth(out, Math.abs(jointPos(rest, "upperarm_l").x) - 0.03);
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
      return limitWidth(out, armX(rest, "lowerarm", "hand", 0.7));
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
      return limitWidth(out, armX(rest, "lowerarm", "hand", 0.15));
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
      return clipPlane(clipPlane(tris, [0, -1, 0], waist), [0, 1, 0], -hem);
    },
  },
  p_trousers: {
    slot: "bottom",
    offset: 0.012,
    covers: ["pelvis", ...both("thigh"), ...both("calf")],
    cut(tris, rest) {
      const waist = jointPos(rest, "pelvis").y + 0.17;
      const ankle = jointPos(rest, "foot_l").y + 0.035;
      return clipPlane(clipPlane(tris, [0, -1, 0], waist), [0, 1, 0], -ankle);
    },
  },
  p_sneakers: {
    slot: "shoes",
    offset: 0.017,
    covers: [...both("foot"), ...both("ball"), ...both("ball_leaf")],
    cut(tris, rest) {
      const top = jointPos(rest, "foot_l").y + 0.075;
      return clipPlane(tris, [0, -1, 0], top);
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
  let triangles = extractTriangles(rest.geometry, () => true);
  triangles = spec.cut(triangles, rest);
  if (triangles.length === 0) return null;
  const geometry = buildGeometry(triangles, { offset: spec.offset, uvScale: 3.2, ...(spec.adjust ? { adjust: spec.adjust } : {}) });
  return { geometry, covers: spec.covers, slot: spec.slot };
}
