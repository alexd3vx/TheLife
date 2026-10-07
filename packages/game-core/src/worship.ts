import { PLAYER, SINK, balance, transfer } from "./ledger";
import { clampNeed } from "./needs";
import { openStatus } from "./places";
import { clockOf } from "./sim";
import type { GameState } from "./types";

/**
 * Church and mosque. You can pray (a quiet moment, once in a while), light a candle or lay out prayer beads for a small cost, give an
 * offering (money goes to the place and lifts your spirits), talk with the pastor or imam, and join the main service when it is on
 * (Sunday morning at church, Friday midday at the mosque). All of it is about feeling better: it raises fun and eases tiredness a little.
 */
export type Faith = "church" | "mosque";

export interface WorshipService {
  id: string;
  name: string;
  blurb: string;
  price: number;
}

export const WORSHIP_SERVICES: WorshipService[] = [
  { id: "service", name: "Join the service", blurb: "The main gathering of the week. Free. Songs, a sermon and company.", price: 0 },
  { id: "counsel", name: "Talk with the pastor", blurb: "A listening ear and a few kind words. Free.", price: 0 },
  { id: "pray", name: "Pray quietly", blurb: "Sit still for a while. Free.", price: 0 },
  { id: "candle", name: "Light a candle", blurb: "A small light for someone you love.", price: 200 },
  { id: "offering_500", name: "Give ₦500", blurb: "A small offering.", price: 500 },
  { id: "offering_2000", name: "Give ₦2,000", blurb: "An offering for the poor box.", price: 2000 },
  { id: "offering_10000", name: "Give ₦10,000", blurb: "A generous gift to the community.", price: 10000 },
];

const HOUR = 60;
const PRAYER_GAP = 3 * HOUR;
const COUNSEL_GAP = 6 * HOUR;

const WORDS_CHURCH = [
  "\"Do not worry about tomorrow. Today has enough of its own trouble.\" Go well, my child.",
  "The pastor smiles. \"Hard days pass. Keep showing up for the people around you.\"",
  "\"Be kind to yourself too. You cannot pour from an empty cup.\"",
  "\"Work hard, rest well, and give thanks for small things.\"",
];
const WORDS_MOSQUE = [
  "The imam nods. \"With hardship comes ease. Be patient, and keep your word.\"",
  "\"Look after your neighbour, and your neighbour will look after you.\"",
  "\"Eat well, sleep well, and be thankful. That is half of health.\"",
  "\"A good deed done quietly is worth more than a loud one.\"",
];

export type WorshipResult = { ok: true; text: string } | { ok: false; reason: string };

/** Is the main service on right now? Sunday 8-11 at church, Friday 12-14 at the mosque. */
export function serviceOn(state: GameState, faith: Faith): { on: boolean; text: string } {
  const clock = clockOf(state.minute);
  const weekday = (clock.day + 3) % 7; // day 1 is a Thursday; 0 = Sunday
  const [day, from, to, label] = faith === "church" ? [0, 8, 11, "Sunday 8AM-11AM"] : [5, 12, 14, "Friday 12PM-2PM"];
  return { on: weekday === day && clock.hourFloat >= from && clock.hourFloat < to, text: label };
}

export function houseOpen(state: GameState, faith: Faith): { open: boolean; text: string } {
  const clock = clockOf(state.minute);
  return openStatus(faith, clock.hourFloat, (clock.day + 3) % 7);
}

const wait = (last: number | undefined, now: number, gap: number) => (last === undefined ? 0 : Math.max(0, last + gap - now));
const hoursText = (min: number) => (min >= 90 ? `${Math.round(min / 60)} hours` : `${Math.max(1, Math.ceil(min))} minutes`);

export function worshipService(state: GameState, faith: Faith, id: string): WorshipResult {
  if (faith !== "church" && faith !== "mosque") return { ok: false, reason: "That is not a place of worship." };
  const s = WORSHIP_SERVICES.find((x) => x.id === id);
  if (!s) return { ok: false, reason: "They do not offer that." };
  const open = houseOpen(state, faith);
  if (!open.open) return { ok: false, reason: `It is closed (${open.text}).` };
  const rec = (state.records ??= { reports: [] });
  const now = state.minute;
  const bump = (fun: number, energy = 0) => {
    state.needs.fun = clampNeed(state.needs.fun + fun);
    state.needs.energy = clampNeed(state.needs.energy + energy);
  };
  const house = faith === "church" ? "church" : "mosque";

  if (s.id === "service") {
    const on = serviceOn(state, faith);
    if (!on.on) return { ok: false, reason: `The main service is ${on.text}.` };
    if (wait(rec.lastService, now, 12 * HOUR) > 0) return { ok: false, reason: "You have already joined this service." };
    rec.lastService = now;
    bump(25, -5);
    return { ok: true, text: `You join the service. The singing and the company lift you. Fun +25, a little tired.` };
  }
  if (s.id === "pray") {
    const w = wait(rec.lastPrayer, now, PRAYER_GAP);
    if (w > 0) return { ok: false, reason: `You have prayed a moment ago. Come back in ${hoursText(w)}.` };
    rec.lastPrayer = now;
    bump(8, 4);
    return { ok: true, text: `You sit quietly in the ${house} for a while. You feel calmer. Fun +8, rested a little.` };
  }
  if (s.id === "counsel") {
    const w = wait(rec.lastCounsel, now, COUNSEL_GAP);
    if (w > 0) return { ok: false, reason: `They have just spoken with you. Come back in ${hoursText(w)}.` };
    rec.lastCounsel = now;
    bump(8);
    const words = faith === "church" ? WORDS_CHURCH : WORDS_MOSQUE;
    return { ok: true, text: words[Math.floor(now / HOUR) % words.length]! };
  }
  // candle and offerings cost money, which goes to the house
  if (s.price > 0) {
    const r = transfer(state.ledger, PLAYER, SINK, s.price, s.id === "candle" ? "Candle" : "Offering", now);
    if (!r.ok) return { ok: false, reason: `That is ₦${s.price.toLocaleString()}. You have ₦${balance(state.ledger, PLAYER).toLocaleString()}.` };
    state.stats.totalSpent += s.price;
  }
  if (s.id === "candle") {
    bump(4);
    return { ok: true, text: "You light a candle and say a name. Fun +4." };
  }
  rec.giving = (rec.giving ?? 0) + s.price;
  const fun = s.price >= 10000 ? 12 : s.price >= 2000 ? 7 : 3;
  bump(fun);
  return { ok: true, text: `Thank you. May it come back to you many times. Fun +${fun}. You have given ₦${rec.giving.toLocaleString()} in all.` };
}
