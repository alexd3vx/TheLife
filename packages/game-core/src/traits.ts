// Traits the player chooses at character creation. Strengths help, weaknesses cost; taking one weakness unlocks a third
// strength. Effects are small multipliers the simulation applies, so they are data, not code.

import type { NeedId } from "./types";

export interface TraitEffect {
  /** Multiplier on how fast a need falls (below 1 = falls slower). */
  decay?: Partial<Record<NeedId, number>>;
  /** Multiplier on pay from working. */
  workPay?: number;
  /** Multiplier on the price of groceries. */
  groceries?: number;
  /** Skill experience at the start. */
  skills?: Record<string, number>;
}

export interface TraitDef {
  id: string;
  label: string;
  kind: "strength" | "weakness";
  /** What it does, in plain words. */
  text: string;
  effect: TraitEffect;
}

export const TRAITS: TraitDef[] = [
  { id: "hustler", label: "Hustler", kind: "strength", text: "Earns 10% more from work.", effect: { workPay: 1.1 } },
  { id: "thrifty", label: "Thrifty", kind: "strength", text: "Groceries cost 10% less.", effect: { groceries: 0.9 } },
  { id: "iron_stomach", label: "Iron stomach", kind: "strength", text: "Gets hungry 20% slower.", effect: { decay: { hunger: 0.8 } } },
  { id: "energetic", label: "Energetic", kind: "strength", text: "Gets tired 15% slower.", effect: { decay: { energy: 0.85 } } },
  { id: "tidy", label: "Tidy", kind: "strength", text: "Stays fresh 20% longer.", effect: { decay: { hygiene: 0.8 } } },
  { id: "good_company", label: "Good company", kind: "strength", text: "Gets bored 20% slower.", effect: { decay: { fun: 0.8 } } },
  { id: "bookworm", label: "Bookworm", kind: "strength", text: "Starts with a head start in knowledge.", effect: { skills: { knowledge: 72 } } },
  { id: "techie", label: "Techie", kind: "strength", text: "Starts with a head start in computers, so work pays more.", effect: { skills: { computer: 72 } } },
  { id: "strong_bladder", label: "Strong bladder", kind: "strength", text: "Needs the toilet 20% less often.", effect: { decay: { bladder: 0.8 } } },

  { id: "big_appetite", label: "Big appetite", kind: "weakness", text: "Gets hungry 25% faster.", effect: { decay: { hunger: 1.25 } } },
  { id: "light_sleeper", label: "Light sleeper", kind: "weakness", text: "Gets tired 20% faster.", effect: { decay: { energy: 1.2 } } },
  { id: "lazy", label: "Lazy streak", kind: "weakness", text: "Earns 10% less from work.", effect: { workPay: 0.9 } },
  { id: "spender", label: "Big spender", kind: "weakness", text: "Groceries cost 15% more.", effect: { groceries: 1.15 } },
  { id: "restless", label: "Restless", kind: "weakness", text: "Gets bored 25% faster.", effect: { decay: { fun: 1.25 } } },
  { id: "weak_bladder", label: "Weak bladder", kind: "weakness", text: "Needs the toilet 25% more often.", effect: { decay: { bladder: 1.25 } } },
];

const byId = new Map(TRAITS.map((t) => [t.id, t]));
export const traitById = (id: string): TraitDef | undefined => byId.get(id);

/** How many strengths a player may take: two, or three if they also take a weakness. */
export function strengthSlots(weaknesses: number): number {
  return weaknesses > 0 ? 3 : 2;
}

/** Keeps only valid, allowed choices (unknown ids dropped, at most one weakness, strengths within the slots). */
export function sanitizeTraits(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  for (const id of ids) {
    const t = byId.get(id);
    if (!t || seen.has(id)) continue;
    seen.add(id);
    if (t.kind === "weakness") weaknesses.push(id);
    else strengths.push(id);
  }
  const weak = weaknesses.slice(0, 1);
  return [...strengths.slice(0, strengthSlots(weak.length)), ...weak];
}

export interface TraitEffects {
  decay: Record<NeedId, number>;
  workPay: number;
  groceries: number;
  skills: Record<string, number>;
}

/** Combines the effects of a set of trait ids. */
export function combineTraits(ids: readonly string[] | undefined): TraitEffects {
  const out: TraitEffects = { decay: { hunger: 1, energy: 1, hygiene: 1, bladder: 1, fun: 1 }, workPay: 1, groceries: 1, skills: {} };
  for (const id of ids ?? []) {
    const e = byId.get(id)?.effect;
    if (!e) continue;
    for (const [need, mult] of Object.entries(e.decay ?? {})) out.decay[need as NeedId] *= mult;
    out.workPay *= e.workPay ?? 1;
    out.groceries *= e.groceries ?? 1;
    for (const [skill, xp] of Object.entries(e.skills ?? {})) out.skills[skill] = (out.skills[skill] ?? 0) + xp;
  }
  return out;
}
