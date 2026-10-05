import { NEED_IDS, type NeedId, type Needs } from "./types";

/** How much each need falls per game hour just from living. */
export const BASE_DECAY_PER_HOUR: Needs = { hunger: 4.2, energy: 3.6, hygiene: 2.2, bladder: 6.5, fun: 3.0 };

const MOOD_WEIGHTS: Needs = { hunger: 0.25, energy: 0.3, hygiene: 0.15, bladder: 0.1, fun: 0.2 };

export const clampNeed = (value: number) => Math.max(0, Math.min(100, value));

export function createNeeds(): Needs {
  return { hunger: 80, energy: 85, hygiene: 85, bladder: 90, fun: 70 };
}

/** Overall wellbeing, 0-100. */
export function mood(needs: Needs): number {
  let total = 0;
  for (const id of NEED_IDS) total += needs[id] * MOOD_WEIGHTS[id];
  return Math.round(total);
}

/** How well the character performs at work: 0.5 when miserable up to 1.2 when thriving. */
export function performance(needs: Needs): number {
  const base = 0.5 + (mood(needs) / 100) * 0.7;
  // Dead tired or starving hurts on top of the average.
  const penalty = (needs.energy < 15 ? 0.15 : 0) + (needs.hunger < 10 ? 0.1 : 0) + (needs.hygiene < 15 ? 0.05 : 0);
  return Math.max(0.35, base - penalty);
}

export function moodLabel(needs: Needs): string {
  const m = mood(needs);
  if (m >= 80) return "Great";
  if (m >= 62) return "Good";
  if (m >= 45) return "Okay";
  if (m >= 28) return "Low";
  return "Miserable";
}

/** The most pressing need (lowest), if any is below `threshold`. */
export function mostUrgent(needs: Needs, threshold = 35): NeedId | null {
  let worst: NeedId | null = null;
  for (const id of NEED_IDS) if (needs[id] < threshold && (worst === null || needs[id] < needs[worst])) worst = id;
  return worst;
}

/** Movement speed multiplier: tired or starving characters walk slower. */
export function speedFactor(needs: Needs): number {
  if (needs.energy < 15) return 0.65;
  if (needs.energy < 30 || needs.hunger < 10) return 0.85;
  return 1;
}
