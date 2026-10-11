import { describe, expect, it } from "vitest";
import { createGameState } from "./sim";
import { MINT, PLAYER, balance, ledgerTotal, transfer } from "./ledger";
import { powerCutOn, isPowerCut } from "./phoneData";
import { weatherFor } from "./phoneContent";
import { parseGameState } from "./persist";
import { hospitalService, treatmentPrice } from "./hospital";
import {
  GENERATOR_TANK, ILLNESS, SURVIVAL_PRICES, buyFuel, buyItem, createSurvival, drink, isRaining, makeIll, moodles, parseSurvival, powerAvailable, survivalOf, survivalSpeed, tickSurvival, treat, useFirstAid,
  type SurvivalContext,
} from "./survival";
import type { GameState } from "./types";

const ctx = (over: Partial<SurvivalContext> = {}): SurvivalContext => ({ outdoors: false, asleep: false, offline: false, speed: 1, ...over });
const withMoney = (n = 100_000): GameState => {
  const s = createGameState();
  transfer(s.ledger, MINT, PLAYER, n, "test", 0);
  return s;
};
/** The first day (from 1) the weather is of this kind. */
const dayWith = (sky: string): number => {
  for (let d = 1; d < 400; d++) if (weatherFor(d).sky === sky) return d;
  throw new Error(`no ${sky} day`);
};
const at = (day: number, hour: number): number => (day - 1) * 1440 + hour * 60;
/** Runs the clock forward in ten-minute slices, as the sim does. */
function run(s: GameState, minutes: number, c: SurvivalContext): string[] {
  const log: string[] = [];
  for (let m = 0; m < minutes; m += 10) {
    s.minute += 10;
    for (const e of tickSurvival(s, 10, c)) log.push(e.text);
  }
  return log;
}

describe("thirst and health", () => {
  it("makes you thirsty over time, and water puts it right", () => {
    const s = withMoney();
    s.minute = at(dayWith("cloudy"), 9);
    run(s, 8 * 60, ctx());
    expect(survivalOf(s).thirst).toBeLessThan(45);
    expect(moodles(s).some((m) => m.id === "thirst")).toBe(true);
    drink(s, 45);
    expect(survivalOf(s).thirst).toBeGreaterThan(60);
  });

  it("drains health when you are parched, and an emergency ward bill comes with a collapse", () => {
    const s = withMoney(40_000);
    s.minute = at(dayWith("cloudy"), 9);
    survivalOf(s).thirst = 0;
    survivalOf(s).health = 6;
    const before = balance(s.ledger, PLAYER);
    const log = run(s, 120, ctx());
    expect(log.join(" ")).toMatch(/collapsed/);
    expect(balance(s.ledger, PLAYER)).toBe(before - 15_000);
    expect(survivalOf(s).health).toBeGreaterThanOrEqual(45);
    expect(ledgerTotal(s.ledger)).toBe(0);
  });

  it("heals slowly when you are fed, watered and rested", () => {
    const s = withMoney();
    s.minute = at(dayWith("cloudy"), 9);
    survivalOf(s).health = 60;
    drink(s, 30);
    run(s, 4 * 60, ctx());
    expect(survivalOf(s).health).toBeGreaterThan(60);
  });
});

describe("rain, cold and the umbrella", () => {
  it("soaks you in the rain unless you have an umbrella, and a soaked person can catch a cold", () => {
    const rainy = dayWith("storm");
    const s = withMoney();
    s.minute = at(rainy, 12);
    expect(isRaining(s.minute + 120)).toBe(true);
    run(s, 4 * 60, ctx({ outdoors: true }));
    expect(survivalOf(s).wet).toBeGreaterThan(60);
    expect(moodles(s).some((m) => m.id === "wet")).toBe(true);
    // somewhere in a stormy fortnight of soakings somebody catches something
    let colds = 0;
    for (let d = rainy; d < rainy + 60; d++) {
      if (weatherFor(d).sky !== "storm") continue;
      const t = createGameState();
      t.minute = at(d, 11);
      run(t, 8 * 60, ctx({ outdoors: true }));
      if (survivalOf(t).illness) colds++;
    }
    expect(colds).toBeGreaterThan(0);
    // dry indoors
    run(s, 6 * 60, ctx());
    expect(survivalOf(s).wet).toBe(0);
    // with the umbrella nothing sticks
    const u = withMoney();
    expect(buyItem(u, "umbrella").ok).toBe(true);
    u.minute = at(rainy, 12);
    run(u, 4 * 60, ctx({ outdoors: true }));
    expect(survivalOf(u).wet).toBe(0);
    expect(buyItem(u, "umbrella").ok).toBe(false);
  });
});

describe("illness", () => {
  it("malaria climbs by the hour, drains health, and the tablets cure it only if it is caught", () => {
    const s = withMoney();
    s.minute = at(dayWith("cloudy"), 8);
    drink(s, 60);
    makeIll(s, "malaria");
    expect(survivalOf(s).illness?.id).toBe("malaria");
    run(s, 12 * 60, ctx());
    expect(survivalOf(s).illness?.stage).toBe(2);
    const early = withMoney();
    early.minute = s.minute;
    makeIll(early, "malaria");
    expect(buyItem(early, "antimalarial").ok).toBe(true);
    expect(survivalOf(early).illness).toBeNull();
    // left alone the fever becomes dangerous
    survivalOf(s).health = 100;
    survivalOf(s).thirst = 100;
    run(s, 12 * 60, ctx());
    expect(survivalOf(s).illness?.stage).toBe(3);
    expect(survivalOf(s).health).toBeLessThan(100);
    expect(buyItem(s, "antimalarial").ok).toBe(true);
    expect(survivalOf(s).illness?.stage).toBe(2); // too far gone for tablets alone
    expect(treatmentPrice(s, "treat_illness")).toBe(ILLNESS.malaria.treat);
    const cash = balance(s.ledger, PLAYER);
    const r = hospitalService(s, "treat_illness");
    expect(r.ok).toBe(true);
    expect(balance(s.ledger, PLAYER)).toBe(cash - ILLNESS.malaria.treat);
    expect(survivalOf(s).illness).toBeNull();
    expect(hospitalService(s, "treat_illness").ok).toBe(false); // nothing left to treat
    expect(ledgerTotal(s.ledger)).toBe(0);
  });

  it("a cold passes by itself in a couple of days, food poisoning in half a day, and painkillers ease it", () => {
    const s = withMoney();
    s.minute = at(dayWith("cloudy"), 8);
    drink(s, 60);
    makeIll(s, "cold");
    buyItem(s, "painkiller");
    expect(survivalOf(s).illness?.eased).toBeGreaterThan(s.minute);
    const log = run(s, 3 * 24 * 60, ctx());
    expect(log.join(" ")).toMatch(/cold has passed/);
    drink(s, 100);
    survivalOf(s).health = 100;
    makeIll(s, "poisoning");
    expect(run(s, 20 * 60, ctx()).join(" ")).toMatch(/stomach upset has passed/);
  });

  it("does nothing new while you are away", () => {
    const s = withMoney();
    s.minute = at(dayWith("storm"), 15);
    run(s, 6 * 60, ctx({ outdoors: true, offline: true }));
    expect(survivalOf(s).illness).toBeNull();
    expect(survivalOf(s).injury).toBeNull();
    expect(survivalOf(s).thirst).toBeGreaterThanOrEqual(25);
  });
});

describe("injury", () => {
  it("a fall slows you down and heals by itself, faster with a first aid kit", () => {
    let hurt: GameState | null = null;
    for (let d = 1; d < 120 && !hurt; d++) {
      const t = createGameState();
      transfer(t.ledger, MINT, PLAYER, 50_000, "test", 0);
      t.minute = at(d, 21);
      drink(t, 100);
      run(t, 5 * 60, ctx({ outdoors: true }));
      if (survivalOf(t).injury) hurt = t;
    }
    expect(hurt).not.toBeNull();
    const s = hurt!;
    const inj = survivalOf(s).injury!;
    if (inj.id === "sprain") expect(survivalSpeed(s)).toBeLessThan(1);
    expect(useFirstAid(s).ok).toBe(false); // no kit yet
    buyItem(s, "firstAid");
    expect(useFirstAid(s).ok).toBe(true);
    expect(survivalOf(s).injury!.until).toBeLessThanOrEqual(s.minute + 120);
    drink(s, 100);
    run(s, 3 * 60, ctx());
    expect(survivalOf(s).injury).toBeNull();
  });
});

describe("NEPA and the generator", () => {
  it("keeps the lights on through a power cut as long as there is fuel, and charges for fuel by the litre", () => {
    let day = 0;
    for (let d = 1; d < 200 && !day; d++) if (powerCutOn(d)) day = d;
    const cut = powerCutOn(day)!;
    const s = withMoney(500_000);
    s.minute = cut.startMinute + 5;
    expect(isPowerCut(s.minute)).toBe(true);
    expect(powerAvailable(s)).toBe(false);
    expect(moodles(s).some((m) => m.id === "dark")).toBe(true);
    expect(buyFuel(s, 5).ok).toBe(false); // no generator yet
    expect(buyItem(s, "generator").ok).toBe(true);
    const cash = balance(s.ledger, PLAYER);
    expect(buyFuel(s, 5).ok).toBe(true);
    expect(balance(s.ledger, PLAYER)).toBe(cash - 5 * SURVIVAL_PRICES.fuelPerLitre);
    expect(powerAvailable(s)).toBe(true);
    expect(moodles(s).some((m) => m.id === "dark")).toBe(false);
    run(s, 4 * 60, ctx());
    expect(survivalOf(s).generator.fuel).toBeLessThan(1);
    expect(buyFuel(s, 99).ok).toBe(true);
    expect(survivalOf(s).generator.fuel).toBeLessThanOrEqual(GENERATOR_TANK);
    expect(buyFuel(s, 1).ok).toBe(false); // the tank is full
    expect(ledgerTotal(s.ledger)).toBe(0);
  });
});

describe("saving", () => {
  it("is kept when the life is saved and loaded, and bad data falls back", () => {
    const s = withMoney();
    makeIll(s, "cold");
    buyItem(s, "umbrella");
    const back = parseGameState(JSON.parse(JSON.stringify(s)))!;
    expect(survivalOf(back).illness?.id).toBe("cold");
    expect(survivalOf(back).umbrella).toBe(true);
    expect(parseSurvival({ health: "x", illness: { id: "plague" } })).toEqual(createSurvival());
    expect(treat(createGameState(), "injury").ok).toBe(false);
  });
});
