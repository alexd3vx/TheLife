import { skillLevel } from "./actions";
import { PLAYER, SINK, balance, transfer } from "./ledger";
import { clampNeed } from "./needs";
import { openStatus } from "./places";
import { clockOf } from "./sim";
import type { GameState } from "./types";

/**
 * The school: open on weekdays in school hours. You can read in the library (free), use the computer lab (a small fee) and join the
 * evening class (a bigger fee, a bigger gain). All of it trains a skill and costs a little energy; you need a rest between sessions so
 * studying cannot be spammed. The skills are the same ones the phone's courses and the jobs use.
 */
export interface SchoolService {
  id: string;
  name: string;
  blurb: string;
  price: number;
  skill: "knowledge" | "computer";
  xp: number;
  energy: number;
  fun: number;
}

export const SCHOOL_GAP = 60;

export const SCHOOL_SERVICES: SchoolService[] = [
  { id: "library", name: "Read in the library", blurb: "A quiet hour with the school's books. Free.", price: 0, skill: "knowledge", xp: 10, energy: 3, fun: 4 },
  { id: "lab", name: "Computer lab hour", blurb: "Typing, spreadsheets and the internet on the school's machines.", price: 300, skill: "computer", xp: 12, energy: 4, fun: 0 },
  { id: "evening", name: "Evening class: English and maths", blurb: "A teacher takes the class through a full lesson.", price: 1500, skill: "knowledge", xp: 30, energy: 8, fun: 0 },
];

export type SchoolResult = { ok: true; text: string } | { ok: false; reason: string };

export function schoolOpen(state: GameState): { open: boolean; text: string } {
  const clock = clockOf(state.minute);
  return openStatus("school", clock.hourFloat, (clock.day + 3) % 7);
}

/** Minutes until you can study again (0 when you can). */
export function schoolWait(state: GameState): number {
  const last = state.records?.lastSchool;
  return last === undefined ? 0 : Math.max(0, Math.ceil(last + SCHOOL_GAP - state.minute));
}

export function schoolService(state: GameState, id: string): SchoolResult {
  const s = SCHOOL_SERVICES.find((x) => x.id === id);
  if (!s) return { ok: false, reason: "The school does not offer that." };
  const open = schoolOpen(state);
  if (!open.open) return { ok: false, reason: `The school is closed (${open.text}).` };
  const wait = schoolWait(state);
  if (wait > 0) return { ok: false, reason: `Rest your mind first. You can study again in ${wait} minute${wait === 1 ? "" : "s"}.` };
  if (state.needs.energy < 20) return { ok: false, reason: "You are too tired to focus." };
  if (s.price > 0) {
    const r = transfer(state.ledger, PLAYER, SINK, s.price, s.name, state.minute);
    if (!r.ok) return { ok: false, reason: `${s.name} costs ₦${s.price.toLocaleString()}. You have ₦${balance(state.ledger, PLAYER).toLocaleString()}.` };
    state.stats.totalSpent += s.price;
  }
  const rec = (state.records ??= { reports: [] });
  rec.lastSchool = state.minute;
  const before = skillLevel(state.skills[s.skill] ?? 0);
  state.skills[s.skill] = (state.skills[s.skill] ?? 0) + s.xp;
  const level = skillLevel(state.skills[s.skill]!);
  state.needs.energy = clampNeed(state.needs.energy - s.energy);
  state.needs.fun = clampNeed(state.needs.fun + s.fun);
  return { ok: true, text: `${s.name}${s.price ? ` (₦${s.price.toLocaleString()})` : ""}: +${s.xp} ${s.skill} xp${level > before ? `, level ${level}!` : "."}` };
}
