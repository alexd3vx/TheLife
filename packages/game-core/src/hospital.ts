import { PLAYER, SINK, balance, transfer } from "./ledger";
import { clampNeed, mostUrgent } from "./needs";
import { NEED_IDS, type GameState, type NeedId } from "./types";

/**
 * The hospital: the one place that mends what a day wears down, for a price. It is open all day and night. Services change the
 * character's needs straight away; the money goes to the hospital (the sink). If someone is about to collapse, the nurses see them
 * first, free, even with empty pockets.
 */
export type HospitalGroup = "care" | "ward" | "pharmacy" | "canteen";

export interface HospitalService {
  id: string;
  group: HospitalGroup;
  name: string;
  blurb: string;
  price: number;
  /** Added to each need (0-100, capped). */
  effect: Partial<Record<NeedId, number>>;
  /** Sets these needs to at least this much. */
  atLeast?: Partial<Record<NeedId, number>>;
}

export const HOSPITAL_SERVICES: HospitalService[] = [
  { id: "checkup", group: "care", name: "Check-up", blurb: "A nurse looks you over and sees to what you need most.", price: 3000, effect: {}, atLeast: {} },
  { id: "toilet", group: "care", name: "Use the toilet", blurb: "Free. The staff toilet is kept clean.", price: 0, effect: { bladder: 100 } },
  { id: "general", group: "ward", name: "General ward bed", blurb: "A bed in the open ward. Noisy but you rest.", price: 3500, effect: { energy: 50 } },
  { id: "private", group: "ward", name: "Private ward", blurb: "A quiet room with a fan, clean sheets and a shower.", price: 12000, effect: { energy: 100, hygiene: 25, fun: 10 } },
  { id: "drip", group: "ward", name: "Glucose drip", blurb: "Quick strength when you have not eaten.", price: 4500, effect: { hunger: 40, energy: 15 } },
  { id: "vitamins", group: "pharmacy", name: "Vitamin C and multivitamins", blurb: "Gets you through a long day.", price: 1500, effect: { energy: 10, fun: 3 } },
  { id: "soap", group: "pharmacy", name: "Soap and sanitiser", blurb: "Hands, face, and a fresher you.", price: 800, effect: { hygiene: 20 } },
  { id: "ors", group: "pharmacy", name: "ORS and water", blurb: "Rehydration salts for a hot day.", price: 600, effect: { hunger: 8, energy: 5 } },
  { id: "canteen", group: "canteen", name: "Canteen: rice and chicken", blurb: "A hot plate from the hospital canteen.", price: 2200, effect: { hunger: 50 } },
];

export const serviceById = (id: string): HospitalService | undefined => HOSPITAL_SERVICES.find((s) => s.id === id);

/** How low a need must be for the nurses to treat you without payment. */
export const CRITICAL = 15;

export type HospitalResult = { ok: true; text: string } | { ok: false; reason: string };

/** Which need is dangerously low right now, if any. */
export function criticalNeed(state: GameState): NeedId | null {
  const n = mostUrgent(state.needs, CRITICAL);
  return n;
}

export function hospitalService(state: GameState, id: string): HospitalResult {
  const s = serviceById(id);
  if (!s) return { ok: false, reason: "They don't offer that." };
  const before = { ...state.needs };
  // the check-up sees to the neediest thing
  const effect: Partial<Record<NeedId, number>> = { ...s.effect };
  let advice = "";
  if (s.id === "checkup") {
    const need = mostUrgent(state.needs, 101) ?? "energy";
    effect[need] = 30;
    advice = ` Mostly you needed ${need === "hunger" ? "a proper meal" : need === "energy" ? "sleep" : need === "hygiene" ? "a wash" : need === "bladder" ? "the toilet" : "some fun"}.`;
  }
  if (s.price > 0) {
    const r = transfer(state.ledger, PLAYER, SINK, s.price, s.name, state.minute);
    if (!r.ok) return { ok: false, reason: `${s.name} costs ₦${s.price.toLocaleString()}. You have ₦${balance(state.ledger, PLAYER).toLocaleString()}.` };
    state.stats.totalSpent += s.price;
  }
  for (const id2 of NEED_IDS) {
    const add = effect[id2];
    if (add) state.needs[id2] = clampNeed(state.needs[id2] + add);
  }
  const gained = NEED_IDS.filter((n) => Math.round(state.needs[n]) > Math.round(before[n]));
  return { ok: true, text: `${s.name}${s.price > 0 ? ` (₦${s.price.toLocaleString()})` : ""}: ${gained.length ? `${gained.join(", ")} improved.` : "you were already fine."}${advice}` };
}

/** Free first aid for someone about to collapse: the neediest need is brought up to a safe level. */
export function hospitalFirstAid(state: GameState): HospitalResult {
  const need = criticalNeed(state);
  if (!need) return { ok: false, reason: "The nurses say you look all right. They only treat for free when someone is about to collapse." };
  state.needs[need] = Math.max(state.needs[need], 45);
  return { ok: true, text: `The nurses saw you first and did not ask for money. ${need[0]!.toUpperCase()}${need.slice(1)} is back to a safe level.` };
}
