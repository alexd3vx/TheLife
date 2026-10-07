import * as THREE from "three";
import { BOTTOMS, SHOES, TOPS } from "../../iso/wardrobe";
import { jointPos, neckBase, type BodyRest } from "./bodyRest";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { loftGeometry, loftGrid, silhouette, type LoftGrid, type Silhouette } from "./loft";
import { buildGeometry, clipField, clipPlane, extractTriangles, type Triangle } from "./geometryClip";

export interface GarmentChoice {
  id: string;
  label: string;
}

export const PROC_TOPS: GarmentChoice[] = TOPS;
export const PROC_BOTTOMS: GarmentChoice[] = BOTTOMS;
export const PROC_SHOES: GarmentChoice[] = SHOES;

export interface GarmentResult {
  geometry: THREE.BufferGeometry;
  /** Bones whose skin triangles can be hidden because this garment fully covers them. */
  covers: string[];
  /** Indices of the body's triangles (in index-buffer order) that lie wholly under the garment, so their skin can be hidden. */
  coveredTriangles: Set<number>;
  slot: "top" | "bottom" | "shoes";
  /** One entry per layer of the geometry: a fixed colour (a white shirt under a jacket), or null to follow the garment's colour. */
  layers: (string | null)[];
  /** Hanging parts (not in `geometry` when simulating): the cloth simulation moves these. */
  lofts: LoftGrid[];
}

/** A part added onto a garment: a collar, lapels, the shirt showing under an open jacket. */
interface Extra {
  /** Picks the triangles it is made from: `main` is the garment's own surface, `body` the bare body. */
  select(main: Triangle[], body: Triangle[], rest: BodyRest): Triangle[];
  offset: number;
  smooth?: number;
  adjust?: (rest: BodyRest) => (p: THREE.Vector3, n: THREE.Vector3) => void;
  /** A fixed colour for this layer; without one it follows the garment's colour. */
  color?: string;
}

interface Spec {
  slot: GarmentResult["slot"];
  offset: number;
  covers: string[];
  /** Applies the cuts (hems, sleeve ends, neckline). */
  cut(triangles: Triangle[], rest: BodyRest): Triangle[];
  adjust?: (p: THREE.Vector3, n: THREE.Vector3) => void;
  /** Opens the front (a jacket's V) after the cuts. */
  open?: (tris: Triangle[], rest: BodyRest) => Triangle[];
  extras?: Extra[];
  /** Rounds of smoothing so the cloth hangs rather than copying the muscles under it (default 6 for tops, 4 for trousers). */
  smooth?: number;
  /** The part that hangs below the body-hugging part (a skirt, the body of a kaftan): lofted round the body instead of cut from it. */
  lower?(rest: BodyRest, sil: Silhouette): LoftGrid[];
  /** Shapes the legs of trousers (flare, room above the knee): returns a function that moves a vertex. */
  legs?(rest: BodyRest): (p: THREE.Vector3, n: THREE.Vector3) => void;
  /** Covers the legs (a long garment): a bottom worn with it would only be inside it. */
  long?: boolean;
}

const both = (name: string) => [`${name}_l`, `${name}_r`];

/**
 * Cuts a round neckline: drops everything above the shoulders and any triangle sitting inside a cylinder around
 * the neck. (A flat horizontal cut would slice through the sloping shoulder tops and leave ragged holes.)
 */
function cutNeckline(triangles: Triangle[], rest: BodyRest, radius: number, drop: number): Triangle[] {
  const neck = neckBase(rest);
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


const centroid = (t: Triangle) => [(t[0].p[0] + t[1].p[0] + t[2].p[0]) / 3, (t[0].p[1] + t[1].p[1] + t[2].p[1]) / 3, (t[0].p[2] + t[1].p[2] + t[2].p[2]) / 3] as const;

/** The collar ring: the triangles round the base of the neck, raised and flared a little so they stand up. */
function collarOf(main: Triangle[], rest: BodyRest, reach = 0.15): Triangle[] {
  const neck = neckBase(rest);
  // cut with a field (not whole triangles) so the collar's edge is a clean curve instead of a ragged fringe
  return clipField(main, (p) => Math.min(reach - Math.hypot(p[0] - neck.x, p[2] - neck.z), p[1] - (neck.y - 0.05)));
}
const standUp = (lift: number, flare: number, neckY: number) => (p: THREE.Vector3) => {
  p.y += lift * Math.max(0, Math.min(1, (p.y - (neckY - 0.06)) / 0.06));
  p.x *= 1 + flare;
};

/** Half the width of the V that an open jacket makes, at `drop` metres below the neck (0 below the point of the V). */
const vHalf = (drop: number) => Math.max(0, 0.075 * (1 - drop / 0.36));

/** The opening at the front of a jacket: a V from the neck to the chest. */
function jacketOpening(tris: Triangle[], rest: BodyRest): Triangle[] {
  const neck = neckBase(rest);
  const zc = neck.z + 0.03;
  return clipField(tris, (p) => {
    const drop = neck.y - p[1];
    return Math.max(zc - p[2], drop - 0.36, 0.02 - drop, Math.abs(p[0] - neck.x) - vHalf(drop));
  });
}

/** What shows through the V: the shirt under the jacket (only a little wider than the opening). */
function shirtUnderJacket(_main: Triangle[], body: Triangle[], rest: BodyRest): Triangle[] {
  const neck = neckBase(rest);
  const zc = neck.z + 0.03;
  return clipField(body, (p) => {
    const drop = neck.y - p[1];
    return Math.min(p[2] - zc, 0.4 - drop, drop + 0.06, vHalf(drop) + 0.03 - Math.abs(p[0] - neck.x));
  });
}

/** The two lapels: bands of cloth along both edges of the V, standing a little off the jacket. */
function lapels(main: Triangle[], _body: Triangle[], rest: BodyRest): Triangle[] {
  const neck = neckBase(rest);
  const zc = neck.z + 0.03;
  return clipField(main, (p) => {
    const drop = neck.y - p[1];
    const dx = Math.abs(p[0] - neck.x);
    return Math.min(p[2] - zc, 0.3 - drop, drop - 0.0, dx - vHalf(drop) + 0.01, vHalf(drop) + 0.075 - dx);
  });
}

/** A necktie: a strip down the middle of the chest, narrow at the knot and widest at the tip. */
export function tieTriangles(rest: BodyRest): Triangle[] {
  const neck = neckBase(rest);
  const zc = neck.z + 0.03;
  const all = extractTriangles(rest.geometry, () => true);
  return clipField(all, (p) => {
    const drop = neck.y - p[1];
    const w = 0.014 + Math.min(1, Math.max(0, (drop - 0.05) / 0.25)) * 0.02;
    return Math.min(p[2] - zc, 0.36 - drop, drop - 0.03, w - Math.abs(p[0] - neck.x));
  });
}


/** Heights the long garments are measured from. */
const hipY = (r: BodyRest) => jointPos(r, "pelvis").y - 0.03;
const chestY = (r: BodyRest) => jointPos(r, "spine_03").y - 0.02;
const kneeY = (r: BodyRest) => jointPos(r, "calf_l").y;
const floorY = (r: BodyRest) => jointPos(r, "foot_l").y;

/**
 * A garment that hugs the body down to `from` and hangs below it: a lofted sleeve of cloth from there to the hem. `slack` is the ease
 * round the body at the top; `hang` makes it hang from the widest point above (kaftans and agbada skip the waist).
 */
function hanging(o: { from(r: BodyRest): number; hem(r: BodyRest): number; offset: number; top?: number; flare(t: number): number; hang?: boolean; fold?: number; folds?: number; back?: number; follow?: number; easeLen?: number; up?: number }): NonNullable<Spec["lower"]> {
  return (rest, sil) => [
    loftGrid(rest, sil, {
      yTop: o.from(rest) + (o.up ?? 0.03),
      yBottom: o.hem(rest),
      offset: o.offset,
      offsetTop: o.top ?? 0.03,
      ...(o.easeLen !== undefined ? { easeLen: o.easeLen } : {}),
      flare: o.flare,
      ...(o.hang !== undefined ? { hang: o.hang } : {}),
      ...(o.fold !== undefined ? { fold: o.fold } : {}),
      ...(o.folds !== undefined ? { folds: o.folds } : {}),
      ...(o.follow !== undefined ? { follow: o.follow } : {}),
      ...(o.back ? { extra: (u: number, t: number) => o.back! * t * Math.max(0, -Math.cos(u)) } : {}),
    }),
  ];
}

const bodiceCut = (from: (r: BodyRest) => number, neck: [number, number], sleeves: [string, string, number] | null) => (tris: Triangle[], rest: BodyRest) => {
  let out = clipPlane(tris, [0, 1, 0], -from(rest));
  out = cutNeckline(out, rest, neck[0], neck[1]);
  return sleeves ? cutSleeves(out, rest, sleeves[0], sleeves[1], sleeves[2]) : withoutArms(out, rest);
};


/**
 * A top that hangs: the shoulders, chest and sleeves follow the body, and below the chest the cloth hangs from there (a lofted sleeve that
 * the cloth simulation moves). `hem` is the hem height above the hips, `slack` the ease round the body.
 */
function looseTop(o: { offset: number; neck: [number, number]; sleeves: [string, string, number]; hem: number; slack: number; flare?: number; smooth?: number; extras?: Extra[] }): Spec {
  return {
    slot: "top",
    offset: o.offset,
    smooth: o.smooth ?? 7,
    covers: [],
    cut: bodiceCut(chestY, o.neck, o.sleeves),
    lower: hanging({ from: chestY, hem: (r) => jointPos(r, "pelvis").y + o.hem, offset: o.slack, top: o.offset - 0.002, easeLen: 0.55, up: 0.1, flare: (t) => (o.flare ?? 0.01) * t, hang: true, fold: 0.004, folds: 9 }),
    ...(o.extras ? { extras: o.extras } : {}),
  };
}
const collar = (reach: number, lift: number, flare: number, off: number): Extra => ({ select: (main, _b, rest) => collarOf(main, rest, reach), offset: off, adjust: (r) => standUp(lift, flare, neckBase(r).y) });

const LONG_SPECS: Record<string, Spec> = {
  p_tee: looseTop({ offset: 0.02, neck: [0.085, 0.03], sleeves: ["upperarm", "lowerarm", 0.5], hem: 0.08, slack: 0.04 }),
  p_tank: looseTop({ offset: 0.018, neck: [0.12, 0.09], sleeves: ["upperarm", "lowerarm", -0.1], hem: 0.08, slack: 0.034 }),
  p_vest: looseTop({ offset: 0.016, neck: [0.13, 0.13], sleeves: ["upperarm", "lowerarm", -0.2], hem: 0.08, slack: 0.03 }),
  p_polo: looseTop({ offset: 0.021, neck: [0.075, 0.015], sleeves: ["upperarm", "lowerarm", 0.42], hem: 0.05, slack: 0.042 }),
  p_long: looseTop({ offset: 0.02, neck: [0.085, 0.03], sleeves: ["lowerarm", "hand", 0.7], hem: 0.08, slack: 0.04 }),
  p_hoodie: looseTop({ offset: 0.036, neck: [0.095, 0.015], sleeves: ["lowerarm", "hand", 0.85], hem: 0.0, slack: 0.07, flare: 0.02, smooth: 9 }),
  p_jersey: looseTop({ offset: 0.028, neck: [0.1, 0.05], sleeves: ["upperarm", "lowerarm", 0.25], hem: 0.0, slack: 0.055 }),
  p_shirt: looseTop({ offset: 0.022, neck: [0.075, 0.012], sleeves: ["lowerarm", "hand", 0.8], hem: 0.0, slack: 0.045, extras: [collar(0.14, 0.022, 0.05, 0.014)] }),
  p_sweater: looseTop({ offset: 0.04, neck: [0.082, 0.02], sleeves: ["lowerarm", "hand", 0.92], hem: -0.02, slack: 0.065, smooth: 9, extras: [collar(0.13, 0.014, 0.04, 0.056)] }),
  p_dress: {
    slot: "top",
    long: true,
    offset: 0.024,
    covers: [],
    cut: bodiceCut(hipY, [0.11, 0.08], ["upperarm", "lowerarm", 0.1]),
    lower: hanging({ from: hipY, hem: (r) => kneeY(r) - 0.05, top: 0.06, hang: true, offset: 0.065, flare: (t) => 0.1 * Math.pow(t, 1.3), fold: 0.006, folds: 11 }),
  },
  p_gown: {
    slot: "top",
    long: true,
    offset: 0.024,
    covers: [],
    cut: bodiceCut(hipY, [0.125, 0.11], ["upperarm", "lowerarm", -0.2]),
    lower: hanging({ from: hipY, hem: (r) => floorY(r) + 0.02, top: 0.06, hang: true, offset: 0.065, flare: (t) => 0.17 * Math.pow(t, 1.4), fold: 0.012, folds: 9, back: 0.08 }),
  },
  p_kaftan: {
    slot: "top",
    long: true,
    offset: 0.04,
    smooth: 8,
    covers: [],
    cut: bodiceCut(chestY, [0.085, 0.03], ["lowerarm", "hand", 0.15]),
    lower: hanging({ from: chestY, hem: (r) => kneeY(r) - 0.12, offset: 0.05, flare: (t) => 0.035 * t, hang: true, fold: 0.007, folds: 8 }),
  },
  p_agbada: {
    slot: "top",
    long: true,
    offset: 0.07,
    smooth: 10,
    covers: [],
    cut: bodiceCut(chestY, [0.095, 0.035], ["lowerarm", "hand", 0.6]),
    lower: hanging({ from: chestY, hem: (r) => floorY(r) + 0.12, offset: 0.1, flare: (t) => 0.09 * t, hang: true, fold: 0.014, folds: 7 }),
  },
  p_buba: {
    slot: "top",
    offset: 0.045,
    smooth: 9,
    covers: [],
    cut: bodiceCut(chestY, [0.1, 0.045], ["lowerarm", "hand", 0.3]),
    lower: hanging({ from: chestY, hem: (r) => jointPos(r, "pelvis").y - 0.04, offset: 0.05, flare: (t) => 0.025 * t, hang: true, fold: 0.006, folds: 8 }),
  },
  p_senator: {
    slot: "top",
    offset: 0.026,
    smooth: 8,
    covers: [],
    cut: bodiceCut(chestY, [0.075, 0.02], ["lowerarm", "hand", 0.85]),
    lower: hanging({ from: chestY, hem: (r) => jointPos(r, "pelvis").y - 0.17, offset: 0.03, flare: (t) => 0.012 * t, hang: true }),
    extras: [{ select: (main, _b, rest) => collarOf(main, rest, 0.12), offset: 0.012, adjust: (r) => standUp(0.014, 0.03, neckBase(r).y) }],
  },
  p_nightgown: {
    slot: "top",
    long: true,
    offset: 0.02,
    smooth: 8,
    covers: [],
    cut: bodiceCut(chestY, [0.12, 0.1], ["upperarm", "lowerarm", -0.2]),
    lower: hanging({ from: chestY, hem: (r) => kneeY(r) - 0.12, offset: 0.03, flare: (t) => 0.07 * t, hang: true, fold: 0.008, folds: 10 }),
  },
  p_pyjama_top: {
    slot: "top",
    offset: 0.03,
    smooth: 8,
    covers: [],
    cut: bodiceCut(chestY, [0.085, 0.025], ["lowerarm", "hand", 0.85]),
    lower: hanging({ from: chestY, hem: (r) => jointPos(r, "pelvis").y - 0.02, offset: 0.034, flare: (t) => 0.012 * t, hang: true }),
    extras: [{ select: (main, _b, rest) => collarOf(main, rest, 0.12), offset: 0.012, adjust: (r) => standUp(0.014, 0.03, neckBase(r).y) }],
  },
  p_towel: {
    slot: "top",
    long: true,
    offset: 0.026,
    covers: [],
    cut(tris, rest) {
      const armpit = jointPos(rest, "spine_03").y + 0.08;
      return clipPlane(clipPlane(withoutArms(tris, rest), [0, -1, 0], armpit), [0, 1, 0], -hipY(rest));
    },
    lower: hanging({ from: hipY, hem: (r) => jointPos(r, "pelvis").y - 0.3, top: 0.05, hang: true, offset: 0.04, flare: (t) => 0.02 * t, fold: 0.004, folds: 12 }),
  },
  p_skirt: {
    slot: "bottom",
    offset: 0.012,
    covers: [],
    cut: (tris, rest) => clipPlane(clipPlane(withoutArms(tris, rest), [0, -1, 0], jointPos(rest, "pelvis").y + 0.17), [0, 1, 0], -hipY(rest)),
    lower: hanging({ from: hipY, hem: (r) => kneeY(r) + 0.02, top: 0.06, hang: true, offset: 0.06, flare: (t) => 0.1 * Math.pow(t, 1.2), fold: 0.006, folds: 12 }),
  },
  p_longskirt: {
    slot: "bottom",
    long: true,
    offset: 0.012,
    covers: [],
    cut: (tris, rest) => clipPlane(clipPlane(withoutArms(tris, rest), [0, -1, 0], jointPos(rest, "pelvis").y + 0.17), [0, 1, 0], -hipY(rest)),
    lower: hanging({ from: hipY, hem: (r) => floorY(r) + 0.04, top: 0.06, hang: true, offset: 0.06, flare: (t) => 0.15 * Math.pow(t, 1.3), fold: 0.01, folds: 10 }),
  },
  p_wrapper: {
    slot: "bottom",
    long: true,
    offset: 0.012,
    covers: [],
    cut: (tris, rest) => clipPlane(clipPlane(withoutArms(tris, rest), [0, -1, 0], jointPos(rest, "pelvis").y + 0.17), [0, 1, 0], -hipY(rest)),
    lower: hanging({ from: hipY, hem: (r) => floorY(r) + 0.05, offset: 0.026, flare: (t) => 0.02 * t, follow: 0.35, fold: 0.004, folds: 7 }),
  },
  p_pyjama_bottom: {
    slot: "bottom",
    offset: 0.026,
    smooth: 8,
    covers: [],
    cut(tris, rest) {
      const waist = jointPos(rest, "pelvis").y + 0.17;
      const ankle = jointPos(rest, "foot_l").y + 0.03;
      return clipPlane(clipPlane(withoutArms(tris, rest), [0, -1, 0], waist), [0, 1, 0], -ankle);
    },
    legs: legCut((t) => 0.03 * t, 0.014),
  },
};

/**
 * Gives trouser legs a cut: pushes the cloth away from the leg's own axis (hip to ankle) by `flare(t)` metres, t from 0 at the knee to 1
 * at the ankle (and `thigh` metres of extra room above the knee), so straight, wide and tapered legs differ.
 */
function legCut(flare: (t: number) => number, thigh = 0) {
  return (rest: BodyRest) => {
    const axes = (["l", "r"] as const).map((s) => ({ hip: jointPos(rest, `thigh_${s}`), knee: jointPos(rest, `calf_${s}`), foot: jointPos(rest, `foot_${s}`) }));
    return (p: THREE.Vector3) => {
      const a = p.x >= 0 ? axes[0]! : axes[1]!;
      if (p.y > a.hip.y - 0.02) return;
      const toward = p.y > a.knee.y ? a.hip.clone().lerp(a.knee, (a.hip.y - p.y) / (a.hip.y - a.knee.y)) : a.knee.clone().lerp(a.foot, (a.knee.y - p.y) / (a.knee.y - a.foot.y));
      const t = Math.max(0, Math.min(1, (a.knee.y - p.y) / (a.knee.y - a.foot.y)));
      const extra = (p.y > a.knee.y ? thigh * Math.min(1, (a.hip.y - p.y) / (a.hip.y - a.knee.y)) : 0) + (p.y <= a.knee.y ? flare(t) : 0);
      const dx = p.x - toward.x, dz = p.z - toward.z;
      const d = Math.hypot(dx, dz) || 1;
      p.x += (dx / d) * extra;
      p.z += (dz / d) * extra;
    };
  };
}

const SPECS: Record<string, Spec> = {
  p_crop: {
    slot: "top",
    offset: 0.018,
    covers: ["spine_02", "spine_03", ...both("clavicle")],
    cut(tris, rest) {
      const hem = jointPos(rest, "pelvis").y + 0.27;
      let out = clipPlane(tris, [0, 1, 0], -hem);
      out = cutNeckline(out, rest, 0.085, 0.03);
      return cutSleeves(out, rest, "upperarm", "lowerarm", 0.35);
    },
  },
  p_jeans: {
    slot: "bottom",
    offset: 0.017,
    smooth: 6,
    covers: ["pelvis", ...both("thigh"), ...both("calf")],
    cut(tris, rest) {
      const waist = jointPos(rest, "pelvis").y + 0.17;
      const ankle = jointPos(rest, "foot_l").y + 0.045;
      return clipPlane(clipPlane(withoutArms(tris, rest), [0, -1, 0], waist), [0, 1, 0], -ankle);
    },
    legs: legCut((t) => 0.008 * t, 0.004),
  },
  p_capri: {
    slot: "bottom",
    offset: 0.016,
    smooth: 6,
    covers: ["pelvis", ...both("thigh")],
    cut(tris, rest) {
      const thigh = jointPos(rest, "thigh_l").y;
      const calf = jointPos(rest, "calf_l").y;
      const foot = jointPos(rest, "foot_l").y;
      const waist = jointPos(rest, "pelvis").y + 0.17;
      const hem = calf + (foot - calf) * 0.35;
      void thigh;
      return clipPlane(clipPlane(withoutArms(tris, rest), [0, -1, 0], waist), [0, 1, 0], -hem);
    },
    legs: legCut((t) => 0.006 * t, 0.006),
  },
  p_palazzo: {
    slot: "bottom",
    offset: 0.03,
    smooth: 10,
    covers: ["pelvis", ...both("thigh"), ...both("calf")],
    cut(tris, rest) {
      const waist = jointPos(rest, "pelvis").y + 0.17;
      const ankle = jointPos(rest, "foot_l").y + 0.03;
      return clipPlane(clipPlane(withoutArms(tris, rest), [0, -1, 0], waist), [0, 1, 0], -ankle);
    },
    legs: legCut((t) => 0.1 * t, 0.02),
  },
  p_slippers: {
    slot: "shoes",
    offset: 0.012,
    covers: [...both("foot"), ...both("ball"), ...both("ball_leaf")],
    cut(tris, rest) {
      const top = jointPos(rest, "foot_l").y + 0.035;
      return clipPlane(withoutArms(tris, rest), [0, -1, 0], top);
    },
  },
  p_sandals: {
    slot: "shoes",
    offset: 0.014,
    covers: [...both("ball"), ...both("ball_leaf")],
    cut(tris, rest) {
      const top = jointPos(rest, "foot_l").y + 0.045;
      return clipPlane(withoutArms(tris, rest), [0, -1, 0], top);
    },
  },
  p_boots: {
    slot: "shoes",
    offset: 0.02,
    covers: [...both("foot"), ...both("ball"), ...both("ball_leaf")],
    cut(tris, rest) {
      const top = jointPos(rest, "foot_l").y + 0.17;
      return clipPlane(withoutArms(tris, rest), [0, -1, 0], top);
    },
    adjust(p) {
      if (p.y < 0.05) p.y -= (0.05 - p.y) * 0.5;
    },
  },
  p_formal: {
    slot: "shoes",
    offset: 0.015,
    covers: [...both("foot"), ...both("ball"), ...both("ball_leaf")],
    cut(tris, rest) {
      const top = jointPos(rest, "foot_l").y + 0.085;
      return clipPlane(withoutArms(tris, rest), [0, -1, 0], top);
    },
  },
  p_blazer: {
    slot: "top",
    offset: 0.04,
    smooth: 8,
    covers: [],
    cut: bodiceCut((r) => jointPos(r, "pelvis").y + 0.06, [0.085, 0.02], ["lowerarm", "hand", 0.88]),
    lower: hanging({ from: (r) => jointPos(r, "pelvis").y + 0.06, hem: (r) => jointPos(r, "pelvis").y - 0.14, offset: 0.05, top: 0.04, flare: (t) => 0.02 * t, hang: true, follow: 0.5 }),
    open: jacketOpening,
    extras: [
      { select: shirtUnderJacket, offset: 0.024, smooth: 3, color: "#f2efe8" },
      { select: lapels, offset: 0.052, smooth: 2 },
      { select: (main, _b, rest) => collarOf(main, rest, 0.15), offset: 0.05, adjust: (r) => standUp(0.02, 0.05, neckBase(r).y) },
    ],
  },
  p_slacks: {
    slot: "bottom",
    offset: 0.026,
    smooth: 10,
    covers: ["pelvis", ...both("thigh"), ...both("calf")],
    cut(tris, rest) {
      const waist = jointPos(rest, "pelvis").y + 0.17;
      const ankle = jointPos(rest, "foot_l").y + 0.03;
      return clipPlane(clipPlane(withoutArms(tris, rest), [0, -1, 0], waist), [0, 1, 0], -ankle);
    },
    legs: legCut((t) => 0.006 * t, 0.012),
  },
  p_shorts: {
    slot: "bottom",
    offset: 0.024,
    smooth: 6,
    covers: ["pelvis"],
    cut(tris, rest) {
      const thigh = jointPos(rest, "thigh_l").y;
      const calf = jointPos(rest, "calf_l").y;
      const waist = jointPos(rest, "pelvis").y + 0.17;
      const hem = thigh + (calf - thigh) * 0.5;
      return clipPlane(clipPlane(withoutArms(tris, rest), [0, -1, 0], waist), [0, 1, 0], -hem);
    },
    legs: legCut((t) => 0.02 * t, 0.014),
  },
  p_trousers: {
    slot: "bottom",
    offset: 0.024,
    smooth: 8,
    covers: ["pelvis", ...both("thigh"), ...both("calf")],
    cut(tris, rest) {
      const waist = jointPos(rest, "pelvis").y + 0.17;
      const ankle = jointPos(rest, "foot_l").y + 0.035;
      return clipPlane(clipPlane(withoutArms(tris, rest), [0, -1, 0], waist), [0, 1, 0], -ankle);
    },
    legs: legCut((t) => 0.012 * t, 0.006),
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

Object.assign(SPECS, LONG_SPECS);

/** Long garments cover the legs: a bottom worn with one is not shown. */
export function coversLegs(id: string | null): boolean {
  return !!id && !!SPECS[id]?.long;
}

export function isProceduralGarment(id: string | null): id is string {
  return !!id && id in SPECS;
}

export function buildGarment(rest: BodyRest, id: string, simulate = false): GarmentResult | null {
  const spec = SPECS[id];
  if (!spec) return null;
  // The cut planes alone define each garment's area (bone boundaries are ragged, planes are clean).
  const all = extractTriangles(rest.geometry, () => true);
  const order = new Map<Triangle, number>(all.map((tri, i) => [tri, i]));
  const cutTriangles = spec.cut(all, rest);
  if (cutTriangles.length === 0) return null;
  // Whole triangles come through the cuts as the same objects; those are exactly the ones under the garment.
  const coveredTriangles = new Set<number>();
  for (const tri of cutTriangles) {
    const id = order.get(tri);
    if (id !== undefined) coveredTriangles.add(id);
  }
  const triangles = spec.open ? spec.open(cutTriangles, rest) : cutTriangles;
  const smooth = spec.smooth ?? (spec.slot === "top" ? 6 : spec.slot === "bottom" ? 4 : 0);
  const parts: THREE.BufferGeometry[] = [buildGeometry(triangles, { offset: spec.offset, uvScale: 3.2, smooth, ...(spec.adjust ? { adjust: spec.adjust } : spec.legs ? { adjust: spec.legs(rest) } : {}) })];
  const layers: (string | null)[] = [null];
  const lofts: LoftGrid[] = [];
  if (spec.lower) {
    const reachTop = Math.max(jointPos(rest, "spine_03").y + 0.1, 1.3);
    for (const grid of spec.lower(rest, silhouette(rest, 0.02, reachTop))) {
      if (simulate) lofts.push(grid);
      else {
        parts.push(loftGeometry(grid, false));
        layers.push(null);
      }
    }
  }
  for (const extra of spec.extras ?? []) {
    const picked = extra.select(triangles, all, rest);
    if (!picked.length) continue;
    parts.push(buildGeometry(picked, { offset: extra.offset, uvScale: 3.2, smooth: extra.smooth ?? 2, ...(extra.adjust ? { adjust: extra.adjust(rest) } : {}) }));
    layers.push(extra.color ?? null);
  }
  // each part becomes its own group, so it can have its own material (a white shirt under a coloured jacket)
  const geometry = parts.length === 1 ? parts[0]! : mergeGeometries(parts, true)!;
  return { geometry, covers: [], coveredTriangles, slot: spec.slot, layers, lofts };
}
