/**
 * A person's body as a handful of numbers, and which morphs (see bodyMorph.ts) those numbers switch on. Pure data and arithmetic, so the
 * look code can use it without pulling in three.js.
 */

export interface BodyShape {
  /** 0 feminine, 0.5 neutral, 1 masculine */
  sex: number;
  /** years, 18 to 70 */
  age: number;
  /** each -1 to 1 (negative: soft / slim / short / uncommon, positive: muscular / heavy / tall / ideal) */
  muscle: number;
  weight: number;
  height: number;
  proportions: number;
  /** 0 to 1: how far the face and body lean towards these features */
  european: number;
  eastAsian: number;
  /** -1 small, 1 full (feminine bodies) */
  bust: number;
  /** slider id -> -1 to 1 */
  detail: Record<string, number>;
}

export const DEFAULT_SHAPE: BodyShape = { sex: 0.5, age: 25, muscle: 0, weight: 0, height: 0, proportions: 0, european: 0, eastAsian: 0, bust: 0, detail: {} };

const pos = (v: number) => Math.max(0, v);
const neg = (v: number) => Math.max(0, -v);

/** Which morphs a shape switches on, and how far (a plain weighted sum; measured against the exact MakeHuman result to within a few mm). */
export function shapeWeights(s: BodyShape): Record<string, number> {
  const w: Record<string, number> = {};
  const put = (k: string, v: number) => {
    if (Math.abs(v) > 1e-4) w[k] = (w[k] ?? 0) + v;
  };
  const m = Math.min(1, Math.max(0, s.sex)), f = 1 - m;
  put("masculine", pos(2 * m - 1));
  put("feminine", pos(1 - 2 * m));
  const both = (name: string, v: number) => {
    put(`${name}@m`, v * m);
    put(`${name}@f`, v * f);
  };
  const age = Math.min(70, Math.max(18, s.age));
  both("older", age > 25 ? (age - 25) / 45 : 0);
  both("younger", age < 25 ? (25 - age) / 7 : 0);
  both("muscular", pos(s.muscle));
  both("soft", neg(s.muscle));
  both("heavy", pos(s.weight));
  both("slim", neg(s.weight));
  both("tall", pos(s.height));
  both("short", neg(s.height));
  both("proportions_ideal", pos(s.proportions));
  both("proportions_uncommon", neg(s.proportions));
  both("features_european", s.european);
  both("features_east_asian", s.eastAsian);
  // the bust only exists for feminine bodies
  put("bust_full", pos(s.bust) * f);
  put("bust_small", neg(s.bust) * f);
  for (const [id, v] of Object.entries(s.detail)) {
    put(v >= 0 ? `${id}+` : `${id}-`, Math.abs(v));
  }
  return w;
}

