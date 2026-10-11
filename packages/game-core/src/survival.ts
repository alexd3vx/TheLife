import { PLAYER, SINK, balance, transfer } from "./ledger";
import { clampNeed } from "./needs";
import { isPowerCut } from "./phoneData";
import { seeded, weatherFor } from "./phoneContent";
import type { GameState } from "./types";
import { DAY_MINUTES } from "./types";

/**
 * Staying alive in Lagos, at medium depth: you get thirsty, rain makes you wet and a wet person catches cold, mosquitoes bring malaria at
 * night, a bad plate makes you ill, a slip on a wet road hurts, and when NEPA takes the light you need a generator and fuel. Everything is
 * deterministic from the game minute (so the server and a test agree) and softened when you are away. Treatment costs money, which is what
 * makes it matter: an umbrella and a net are cheap, a ward bed is not.
 *
 * Rates are per game hour at plain pace; `speed` is the real-clock needs speed (see sim.ts), so thirst falls as slowly as hunger does.
 */
export type IllnessId = "cold" | "malaria" | "poisoning" | "infection";
export type InjuryId = "sprain" | "cut";

export interface Illness {
  id: IllnessId;
  /** Game minute it began. */
  since: number;
  /** 1 mild, 2 bad, 3 serious. Untreated, it climbs. */
  stage: 1 | 2 | 3;
  /** Painkillers have taken the edge off until this minute. */
  eased: number;
}
export interface Injury {
  id: InjuryId;
  since: number;
  /** Heals by itself at this game minute. */
  until: number;
}
export interface SurvivalState {
  /** 0 (dead on your feet) to 100. */
  health: number;
  /** Hydration, 0 (parched) to 100. */
  thirst: number;
  illness: Illness | null;
  injury: Injury | null;
  /** Minutes of being drenched; it dries off indoors. */
  wet: number;
  umbrella: boolean;
  bednet: boolean;
  firstAid: number;
  generator: { owned: boolean; fuel: number };
  /** Last game minute a hazard was rolled (so a long step does not roll again and again). */
  rolled: number;
  collapses: number;
}

export interface SurvivalContext {
  outdoors: boolean;
  asleep: boolean;
  /** Catching up on time you were away: no new trouble. */
  offline: boolean;
  /** The real-clock needs speed (2) or 1. */
  speed: number;
}

export interface SurvivalEvent {
  kind: "info" | "good" | "warn" | "bad";
  text: string;
}

export const ILLNESS: Record<IllnessId, { name: string; blurb: string; treat: number; days: number }> = {
  cold: { name: "Cold and cough", blurb: "A runny nose and a cough. Rest, water and a painkiller see it off.", treat: 2_500, days: 2 },
  malaria: { name: "Malaria", blurb: "Fever, shivers, aching. It gets worse every day it is not treated.", treat: 8_500, days: 4 },
  poisoning: { name: "Food poisoning", blurb: "A bad plate. It passes, but drink plenty of water.", treat: 4_000, days: 1 },
  infection: { name: "Infected wound", blurb: "A dirty cut that turned bad.", treat: 6_000, days: 3 },
};
export const INJURY: Record<InjuryId, { name: string; blurb: string; treat: number; hours: number }> = {
  sprain: { name: "Sprained ankle", blurb: "You walk slowly until it heals.", treat: 3_000, hours: 36 },
  cut: { name: "Cut", blurb: "Clean it. A dirty cut can turn into an infection.", treat: 2_500, hours: 18 },
};

/** Prices of the things that keep trouble away. */
export const SURVIVAL_PRICES = { umbrella: 3_500, bednet: 2_500, firstAid: 1_800, painkiller: 600, antimalarial: 3_500, generator: 120_000, fuelPerLitre: 700 } as const;
export const GENERATOR_TANK = 20;
const GENERATOR_LITRES_PER_HOUR = 1.2;

export function createSurvival(): SurvivalState {
  return { health: 100, thirst: 85, illness: null, injury: null, wet: 0, umbrella: false, bednet: false, firstAid: 0, generator: { owned: false, fuel: 0 }, rolled: 0, collapses: 0 };
}

export function parseSurvival(raw: unknown): SurvivalState {
  const fresh = createSurvival();
  if (!raw || typeof raw !== "object") return fresh;
  const r = raw as Partial<SurvivalState>;
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const ill = r.illness && typeof r.illness === "object" && r.illness.id in ILLNESS ? r.illness : null;
  const inj = r.injury && typeof r.injury === "object" && r.injury.id in INJURY ? r.injury : null;
  return {
    health: num(r.health, 0, 100, 100),
    thirst: num(r.thirst, 0, 100, 85),
    illness: ill ? { id: ill.id, since: num(ill.since, 0, 1e9, 0), stage: ([1, 2, 3].includes(ill.stage) ? ill.stage : 1) as 1 | 2 | 3, eased: num(ill.eased, 0, 1e9, 0) } : null,
    injury: inj ? { id: inj.id, since: num(inj.since, 0, 1e9, 0), until: num(inj.until, 0, 1e9, 0) } : null,
    wet: num(r.wet, 0, 600, 0),
    umbrella: r.umbrella === true,
    bednet: r.bednet === true,
    firstAid: Math.floor(num(r.firstAid, 0, 20, 0)),
    generator: { owned: r.generator?.owned === true, fuel: num(r.generator?.fuel, 0, GENERATOR_TANK, 0) },
    rolled: num(r.rolled, 0, 1e9, 0),
    collapses: Math.floor(num(r.collapses, 0, 1e6, 0)),
  };
}

export const survivalOf = (state: GameState): SurvivalState => (state.survival ??= createSurvival());

// ---------------------------------------------------------------- the weather where you stand

const hourOf = (minute: number): number => (minute % DAY_MINUTES) / 60;
const dayOf = (minute: number): number => Math.floor(minute / DAY_MINUTES) + 1;

/** Is it raining at this minute? Rainy days rain through the afternoon; storms start earlier and last longer. */
export function isRaining(minute: number): boolean {
  const w = weatherFor(dayOf(minute));
  const h = hourOf(minute);
  if (w.sky === "storm") return h >= 11 && h < 21;
  if (w.sky === "rain") return h >= 13 && h < 19;
  return false;
}
export const isHot = (minute: number): boolean => {
  const h = hourOf(minute);
  return weatherFor(dayOf(minute)).highC >= 32 && h >= 11 && h < 17;
};
export const isNight = (minute: number): boolean => hourOf(minute) >= 19.5 || hourOf(minute) < 5.5;

/** Is there light and a fan? NEPA, or your own generator with fuel in it. */
export function powerAvailable(state: GameState): boolean {
  const sv = survivalOf(state);
  return !isPowerCut(state.minute) || (sv.generator.owned && sv.generator.fuel > 0);
}

// ---------------------------------------------------------------- the clock

/** A number in [0, 1) for this half hour and this kind of chance. */
const roll = (minute: number, salt: number): number => seeded(Math.floor(minute / 30), salt, 77);

export function tickSurvival(state: GameState, minutes: number, ctx: SurvivalContext): SurvivalEvent[] {
  const sv = survivalOf(state);
  const out: SurvivalEvent[] = [];
  const hours = minutes / 60;
  const rate = ctx.speed;
  const now = state.minute;
  const raining = isRaining(now);
  const hot = isHot(now);
  const dark = isPowerCut(now) && !(sv.generator.owned && sv.generator.fuel > 0);

  // a generator burns fuel only while it is keeping the lights on
  if (isPowerCut(now) && sv.generator.owned && sv.generator.fuel > 0) {
    const before = sv.generator.fuel;
    sv.generator.fuel = Math.max(0, sv.generator.fuel - GENERATOR_LITRES_PER_HOUR * hours);
    if (before > 0 && sv.generator.fuel <= 0) out.push({ kind: "warn", text: "The generator coughed and died: it is out of fuel." });
  }

  // thirst: the day's heat dries you out, sleep slows it, illness (fever) speeds it
  let thirstPerHour = -6 * rate;
  if (ctx.outdoors && hot) thirstPerHour *= 1.7;
  if (ctx.asleep) thirstPerHour *= 0.4;
  if (sv.illness && sv.illness.id !== "cold") thirstPerHour *= 1.4;
  sv.thirst = ctx.offline ? Math.max(25, sv.thirst + thirstPerHour * hours * 0.4) : clampNeed(sv.thirst + thirstPerHour * hours);
  if (sv.thirst < 22 && !ctx.offline) {
    state.needs.energy = clampNeed(state.needs.energy - 2 * rate * hours);
    state.needs.fun = clampNeed(state.needs.fun - 1 * rate * hours);
  }
  if (sv.thirst < 25 && !warned.has(state)) {
    warned.add(state);
    out.push({ kind: "warn", text: "You are very thirsty. Drink some water." });
  } else if (sv.thirst >= 45) warned.delete(state);

  // wet and cold
  if (ctx.outdoors && raining && !sv.umbrella) sv.wet = Math.min(600, sv.wet + minutes);
  else sv.wet = Math.max(0, sv.wet - minutes * (ctx.outdoors ? 0.4 : 1));
  if (sv.wet > 60 && !ctx.offline) state.needs.fun = clampNeed(state.needs.fun - 1.5 * rate * hours);

  // the dark: no fan and no light is miserable, and a hot night is no rest
  if (dark && !ctx.offline) {
    state.needs.fun = clampNeed(state.needs.fun - 2 * rate * hours);
    if (ctx.asleep) state.needs.energy = clampNeed(state.needs.energy - 1.6 * rate * hours); // sleep that does not rest you
  }

  // new trouble, rolled once for each half hour that passes
  if (!ctx.offline && now - sv.rolled >= 30) {
    sv.rolled = now;
    // a cold from being drenched (more likely when you are filthy)
    if (!sv.illness && sv.wet > 60 && roll(now, 1) < 0.2 + (state.needs.hygiene < 30 ? 0.15 : 0)) out.push(...fallIll(state, "cold", "You are soaked through and you've started sneezing."));
    // malaria: mosquitoes after dark, worst in the rains, much less under a net
    const bites = (ctx.outdoors || !sv.bednet) && isNight(now) ? (raining || weatherFor(dayOf(now)).sky !== "sunny" ? 0.022 : 0.01) * (sv.bednet && !ctx.outdoors ? 0.1 : 1) : 0;
    if (!sv.illness && bites > 0 && roll(now, 2) < bites) out.push(...fallIll(state, "malaria", "A mosquito got you in the night. You feel a fever coming."));
    // a fall on a wet or dark road
    if (!sv.injury && ctx.outdoors) {
      const risk = 0.006 * (raining ? 3 : 1) * (isNight(now) ? 2 : 1);
      if (roll(now, 3) < risk) {
        const id: InjuryId = roll(now, 4) < 0.5 ? "sprain" : "cut";
        sv.injury = { id, since: now, until: now + INJURY[id].hours * 60 / rate };
        out.push({ kind: "bad", text: id === "sprain" ? "You slipped and twisted your ankle." : "You cut yourself on a rusty edge." });
      }
    }
  }

  // an injury heals, or a dirty cut turns bad
  if (sv.injury) {
    if (now >= sv.injury.until) {
      out.push({ kind: "good", text: `Your ${INJURY[sv.injury.id].name.toLowerCase()} has healed.` });
      sv.injury = null;
    } else if (sv.injury.id === "cut" && !sv.illness && state.needs.hygiene < 25 && !ctx.offline && now - sv.injury.since > 8 * 60 && roll(now, 5) < 0.3) {
      out.push(...fallIll(state, "infection", "Your cut has gone red and hot. It is infected."));
      sv.injury = null;
    }
  }

  // illness: the effects, the climb, the cure
  let drain = 0;
  if (sv.illness) {
    const ill = sv.illness;
    const hoursIll = ((now - ill.since) * rate) / 60;
    const eased = now < ill.eased ? 0.5 : 1;
    const days = ILLNESS[ill.id].days;
    if (ill.id === "cold") {
      state.needs.energy = clampNeed(state.needs.energy - 1.2 * rate * hours * eased);
      if (hoursIll >= days * 24) {
        out.push({ kind: "good", text: "Your cold has passed." });
        sv.illness = null;
      } else if (hoursIll >= days * 24 * 0.6 && ill.stage < 2 && sv.thirst < 30) {
        ill.stage = 2; // a cold you don't look after turns into something worse
        out.push({ kind: "warn", text: "Your cough is worse. You need rest and water." });
      }
      drain = ill.stage >= 2 ? 0.8 : 0;
    } else if (ill.id === "malaria") {
      state.needs.energy = clampNeed(state.needs.energy - (2 + ill.stage * 1.2) * rate * hours * eased);
      state.needs.fun = clampNeed(state.needs.fun - 1 * rate * hours);
      const want: 1 | 2 | 3 = hoursIll >= 22 ? 3 : hoursIll >= 11 ? 2 : 1;
      if (want > ill.stage) {
        ill.stage = want;
        out.push({ kind: want === 3 ? "bad" : "warn", text: want === 3 ? "The fever is dangerous now. Get to the hospital." : "The fever is climbing. Malaria does not go away by itself." });
      }
      drain = (ill.stage === 1 ? 0.6 : ill.stage === 2 ? 2 : 5) * eased;
    } else if (ill.id === "poisoning") {
      state.needs.bladder = clampNeed(state.needs.bladder - 5 * rate * hours);
      state.needs.hunger = clampNeed(state.needs.hunger - 3 * rate * hours);
      drain = 1.5;
      if (hoursIll >= days * 24 * 0.5 + 6) {
        out.push({ kind: "good", text: "The stomach upset has passed." });
        sv.illness = null;
      }
    } else {
      state.needs.energy = clampNeed(state.needs.energy - 1.5 * rate * hours * eased);
      drain = ill.stage >= 2 ? 3 : 1.2;
      if (hoursIll >= 14 && ill.stage < 2) ill.stage = 2;
      if (hoursIll >= days * 24 * 0.9) {
        out.push({ kind: "good", text: "The infection has cleared." });
        sv.illness = null;
      }
    }
  }

  // health: it mends when you are looked after, and wears away when you are not
  if (!ctx.offline) {
    let hp = drain;
    if (state.needs.hunger < 8) hp += 2;
    if (state.needs.energy < 8) hp += 1;
    if (sv.thirst < 6) hp += 6;
    if (hp > 0) sv.health = Math.max(0, sv.health - hp * rate * hours);
    else if (!sv.illness && state.needs.hunger > 35 && sv.thirst > 35 && state.needs.energy > 25) sv.health = Math.min(100, sv.health + 2.5 * rate * hours);
    if (sv.health <= 0) out.push(...collapse(state));
  }
  return out;
}

const warned = new WeakSet<GameState>();

function fallIll(state: GameState, id: IllnessId, text: string): SurvivalEvent[] {
  const sv = survivalOf(state);
  if (sv.illness) return [];
  sv.illness = { id, since: state.minute, stage: 1, eased: 0 };
  return [{ kind: "bad", text: `${text} (${ILLNESS[id].name})` }];
}

/** Public: a bad plate, a dirty wound or anything else that makes the character ill. */
export function makeIll(state: GameState, id: IllnessId): SurvivalEvent[] {
  return fallIll(state, id, id === "poisoning" ? "That food was bad. Your stomach is in knots." : "You are ill.");
}

/** At zero health you are carried to the hospital: they patch you up and the bill comes out of whatever you have. */
function collapse(state: GameState): SurvivalEvent[] {
  const sv = survivalOf(state);
  sv.collapses++;
  const fee = Math.min(balance(state.ledger, PLAYER), 15_000);
  if (fee > 0) {
    transfer(state.ledger, PLAYER, SINK, fee, "Emergency ward", state.minute);
    state.stats.totalSpent += fee;
  }
  sv.health = 45;
  sv.thirst = Math.max(sv.thirst, 60);
  state.needs.hunger = Math.max(state.needs.hunger, 40);
  state.needs.energy = Math.max(state.needs.energy, 40);
  if (sv.illness) sv.illness.stage = Math.max(1, sv.illness.stage - 1) as 1 | 2 | 3;
  sv.injury = null;
  return [{ kind: "bad", text: `You collapsed and were carried to the emergency ward.${fee ? ` The bill: ₦${fee.toLocaleString()}.` : " They treated you free: you had no money."}` }];
}

// ---------------------------------------------------------------- what the character does about it

export type SurvivalResult = { ok: true; text: string } | { ok: false; reason: string };
const ok = (text: string): SurvivalResult => ({ ok: true, text });
const no = (reason: string): SurvivalResult => ({ ok: false, reason });

function pay(state: GameState, price: number, what: string): SurvivalResult | null {
  const r = transfer(state.ledger, PLAYER, SINK, price, what, state.minute);
  if (!r.ok) return no(`${what} costs ₦${price.toLocaleString()}. You have ₦${balance(state.ledger, PLAYER).toLocaleString()}.`);
  state.stats.totalSpent += price;
  return null;
}

/** Water (a sachet, a glass, a bottle): adds to hydration. */
export function drink(state: GameState, amount: number): void {
  const sv = survivalOf(state);
  sv.thirst = clampNeed(sv.thirst + amount);
}

export function buyItem(state: GameState, item: "umbrella" | "bednet" | "firstAid" | "painkiller" | "antimalarial" | "generator"): SurvivalResult {
  const sv = survivalOf(state);
  if (item === "umbrella" && sv.umbrella) return no("You already have an umbrella.");
  if (item === "bednet" && sv.bednet) return no("You already sleep under a net.");
  if (item === "generator" && sv.generator.owned) return no("You already have a generator.");
  const bad = pay(state, SURVIVAL_PRICES[item], item === "firstAid" ? "First aid kit" : item === "painkiller" ? "Painkillers" : item === "antimalarial" ? "Malaria tablets" : item[0]!.toUpperCase() + item.slice(1));
  if (bad) return bad;
  if (item === "umbrella") {
    sv.umbrella = true;
    return ok("You bought an umbrella. Rain will not soak you now.");
  }
  if (item === "bednet") {
    sv.bednet = true;
    return ok("You hung a mosquito net over your bed. Malaria is much less likely indoors.");
  }
  if (item === "firstAid") {
    sv.firstAid = Math.min(20, sv.firstAid + 1);
    return ok("A first aid kit: it cleans and dresses a cut or a sprain.");
  }
  if (item === "generator") {
    sv.generator = { owned: true, fuel: 0 };
    return ok("A generator. It needs fuel: buy some at the fuel station.");
  }
  if (item === "painkiller") {
    if (sv.illness) sv.illness.eased = state.minute + 6 * 60;
    sv.health = Math.min(100, sv.health + 3);
    return ok(sv.illness ? "The tablets take the edge off for a few hours." : "You took a painkiller. You were not in pain.");
  }
  // antimalarial: cures malaria caught before it is serious, and helps a bad case
  if (sv.illness?.id === "malaria") {
    if (sv.illness.stage <= 2) {
      sv.illness = null;
      sv.health = Math.min(100, sv.health + 10);
      return ok("The malaria tablets work. The fever breaks.");
    }
    sv.illness.stage = 2;
    return ok("The tablets help, but it was far gone. See a doctor.");
  }
  return ok("You took the tablets. You did not have malaria.");
}

/** Fuel for the generator, by the litre. */
export function buyFuel(state: GameState, litres: number): SurvivalResult {
  const sv = survivalOf(state);
  if (!sv.generator.owned) return no("You don't have a generator.");
  const n = Math.floor(litres);
  const room = Math.floor(GENERATOR_TANK - sv.generator.fuel);
  if (n < 1) return no("Buy at least a litre.");
  if (room < 1) return no("The tank is full.");
  const take = Math.min(n, room);
  const bad = pay(state, take * SURVIVAL_PRICES.fuelPerLitre, "Generator fuel");
  if (bad) return bad;
  sv.generator.fuel = Math.min(GENERATOR_TANK, sv.generator.fuel + take);
  return ok(`${take} litre${take === 1 ? "" : "s"} of fuel in the tank (${sv.generator.fuel.toFixed(0)} of ${GENERATOR_TANK}). That is about ${Math.round(sv.generator.fuel / GENERATOR_LITRES_PER_HOUR)} hours of light.`);
}

/** A first aid kit on a cut or a sprain. */
export function useFirstAid(state: GameState): SurvivalResult {
  const sv = survivalOf(state);
  if (!sv.injury) return no("You are not hurt.");
  if (sv.firstAid < 1) return no("You have no first aid kit. Buy one, or go to the hospital.");
  sv.firstAid--;
  const was = sv.injury.id;
  sv.injury.until = Math.min(sv.injury.until, state.minute + 2 * 60);
  return ok(was === "cut" ? "You cleaned and dressed the cut. It should heal cleanly." : "You strapped the ankle. It will be better soon.");
}

/** The hospital treats what is wrong with you, for the price on the illness or injury. */
export function treat(state: GameState, what: "illness" | "injury"): SurvivalResult {
  const sv = survivalOf(state);
  if (what === "illness") {
    if (!sv.illness) return no("Nothing is wrong with you that they can treat.");
    const info = ILLNESS[sv.illness.id];
    const bad = pay(state, info.treat, `Treatment: ${info.name}`);
    if (bad) return bad;
    sv.illness = null;
    sv.health = Math.min(100, sv.health + 20);
    return ok(`${info.name} treated (₦${info.treat.toLocaleString()}). The doctor says rest and drink water.`);
  }
  if (!sv.injury) return no("You are not hurt.");
  const info = INJURY[sv.injury.id];
  const bad = pay(state, info.treat, `Treatment: ${info.name}`);
  if (bad) return bad;
  sv.injury = null;
  return ok(`${info.name} seen to (₦${info.treat.toLocaleString()}).`);
}

// ---------------------------------------------------------------- what the screen shows

export interface Moodle {
  id: string;
  label: string;
  /** 1 a little, 2 bad, 3 serious. */
  level: 1 | 2 | 3;
  hint: string;
}

/** The troubles the character has right now, worst first, for the row of icons. */
export function moodles(state: GameState): Moodle[] {
  const sv = survivalOf(state);
  const out: Moodle[] = [];
  if (sv.thirst < 50) out.push({ id: "thirst", label: "Thirsty", level: sv.thirst < 12 ? 3 : sv.thirst < 28 ? 2 : 1, hint: "Drink water: a sachet is ₦100." });
  if (sv.illness) out.push({ id: "ill", label: ILLNESS[sv.illness.id].name, level: sv.illness.stage, hint: ILLNESS[sv.illness.id].blurb });
  if (sv.injury) out.push({ id: "hurt", label: INJURY[sv.injury.id].name, level: sv.injury.id === "sprain" ? 2 : 1, hint: INJURY[sv.injury.id].blurb });
  if (sv.wet > 60) out.push({ id: "wet", label: "Soaked", level: sv.wet > 180 ? 2 : 1, hint: "Get indoors and dry off. An umbrella helps." });
  if (isPowerCut(state.minute) && !powerAvailable(state)) out.push({ id: "dark", label: "No power", level: 1, hint: "NEPA took the light. A generator and fuel would help." });
  if (sv.health < 60) out.push({ id: "weak", label: "Weak", level: sv.health < 20 ? 3 : sv.health < 40 ? 2 : 1, hint: "Your health is low. Eat, drink, rest, and see a doctor if you are ill." });
  return out.sort((a, b) => b.level - a.level);
}

/** Walking slower when hurt or very ill. */
export function survivalSpeed(state: GameState): number {
  const sv = survivalOf(state);
  let f = 1;
  if (sv.injury?.id === "sprain") f *= 0.75;
  if (sv.illness && sv.illness.stage >= 2) f *= 0.85;
  return f;
}
