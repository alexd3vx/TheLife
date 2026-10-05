import { describe, expect, it } from "vitest";
import { ACTIONS, ECONOMY, Sim, balance, createGameState, createLedger, ledgerTotal, mood, parseGameState, performance, simulateAbsence, transfer, MINT, PLAYER, SINK } from "./index.js";

const run = (sim: Sim, actionId: string) => {
  const result = sim.start(actionId);
  expect(result.ok).toBe(true);
  let guard = 0;
  while (sim.active && guard++ < 10000) sim.step(0.5);
};

describe("ledger", () => {
  it("keeps the total at zero across transfers", () => {
    const ledger = createLedger();
    transfer(ledger, MINT, PLAYER, 5000, "grant", 0);
    transfer(ledger, PLAYER, SINK, 1200, "shop", 1);
    expect(ledgerTotal(ledger)).toBe(0);
    expect(balance(ledger)).toBe(3800);
  });

  it("refuses overdrafts, fractions and self-transfers", () => {
    const ledger = createLedger();
    transfer(ledger, MINT, PLAYER, 100, "grant", 0);
    expect(transfer(ledger, PLAYER, SINK, 500, "x", 0).ok).toBe(false);
    expect(transfer(ledger, PLAYER, SINK, 10.5, "x", 0).ok).toBe(false);
    expect(transfer(ledger, PLAYER, PLAYER, 10, "x", 0).ok).toBe(false);
    expect(balance(ledger)).toBe(100);
  });
});

describe("needs", () => {
  it("fall over time and never go below zero", () => {
    const sim = new Sim();
    sim.advance(60 * 40);
    for (const v of Object.values(sim.state.needs)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("mood and performance track the needs", () => {
    const sim = new Sim();
    const happy = performance(sim.state.needs);
    sim.state.needs = { hunger: 5, energy: 5, hygiene: 10, bladder: 50, fun: 10 };
    expect(performance(sim.state.needs)).toBeLessThan(happy);
    expect(mood(sim.state.needs)).toBeLessThan(30);
  });
});

describe("actions", () => {
  it("snacking uses a portion and raises hunger", () => {
    const sim = new Sim();
    sim.state.needs.hunger = 30;
    run(sim, "snack");
    expect(sim.state.inventory.portions).toBe(2);
    expect(sim.state.needs.hunger).toBeGreaterThan(40);
  });

  it("cooking makes a meal that can be eaten", () => {
    const sim = new Sim();
    sim.state.needs.hunger = 20;
    run(sim, "cook");
    expect(sim.state.inventory.meals).toBe(1);
    expect(sim.state.inventory.portions).toBe(1);
    run(sim, "eatMeal");
    expect(sim.state.needs.hunger).toBeGreaterThan(70);
    expect(sim.state.inventory.meals).toBe(0);
  });

  it("explains why an action can't start", () => {
    const sim = new Sim();
    sim.state.inventory.portions = 0;
    const r = sim.start("snack");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/fridge is empty/i);
    expect(sim.start("eatMeal").ok).toBe(false);
    expect(sim.start("sleep").ok).toBe(false); // not tired
    sim.state.needs.energy = 5;
    expect(sim.start("work").ok).toBe(false); // too tired
  });

  it("working pays more with a good mood and skill, and stops being possible when exhausted", () => {
    const rested = new Sim();
    const moneyBefore = rested.money;
    run(rested, "work");
    const earnedRested = rested.money - moneyBefore;
    expect(earnedRested).toBeGreaterThan(1500);

    const miserable = new Sim();
    miserable.state.needs = { hunger: 12, energy: 35, hygiene: 20, bladder: 60, fun: 15 };
    const before = miserable.money;
    run(miserable, "work");
    expect(miserable.money - before).toBeLessThan(earnedRested);
  });

  it("sleep restores energy and ends by itself once rested", () => {
    const sim = new Sim();
    sim.state.needs.energy = 20;
    run(sim, "sleep");
    expect(sim.state.needs.energy).toBeGreaterThanOrEqual(99);
    expect(sim.active).toBeNull();
  });

  it("cancelling keeps partial effects but grants nothing", () => {
    const sim = new Sim();
    sim.state.needs.hunger = 20;
    sim.start("cook");
    sim.step(2); // ~10 of 30 minutes
    sim.cancel();
    expect(sim.state.inventory.meals).toBe(0);
    expect(sim.state.inventory.portions).toBe(1); // ingredients were used
  });

  it("the toilet and shower fix their needs", () => {
    const sim = new Sim();
    sim.state.needs.bladder = 10;
    sim.state.needs.hygiene = 20;
    run(sim, "toilet");
    run(sim, "shower");
    expect(sim.state.needs.bladder).toBeGreaterThan(90);
    expect(sim.state.needs.hygiene).toBeGreaterThan(90);
  });
});

describe("consequences", () => {
  it("collapses from exhaustion and sleeps where it stands", () => {
    const sim = new Sim();
    sim.state.needs.energy = 1;
    sim.advance(60);
    expect(sim.state.stats.timesPassedOut).toBe(1);
    expect(sim.active?.def.id).toBe("passout");
    expect(sim.drainEvents().some((e) => /collapsed/i.test(e.text))).toBe(true);
  });

  it("has an accident when the bladder empties", () => {
    const sim = new Sim();
    sim.state.needs.bladder = 2;
    sim.advance(30);
    expect(sim.state.needs.bladder).toBeGreaterThan(40);
    expect(sim.drainEvents().some((e) => /toilet in time/i.test(e.text))).toBe(true);
  });

  it("warns once per dip", () => {
    const sim = new Sim();
    sim.state.needs.hunger = 26;
    sim.advance(60);
    const warnings = sim.drainEvents().filter((e) => /hungry/i.test(e.text));
    expect(warnings).toHaveLength(1);
  });
});

describe("rent and money", () => {
  it("buying groceries moves money through the ledger", () => {
    const sim = new Sim();
    const before = sim.money;
    expect(sim.buyGroceries().ok).toBe(true);
    expect(sim.money).toBe(before - ECONOMY.groceriesPrice);
    expect(sim.state.inventory.portions).toBe(3 + ECONOMY.groceriesPortions);
    expect(ledgerTotal(sim.state.ledger)).toBe(0);
  });

  it("can't buy groceries without the money", () => {
    const sim = new Sim();
    transfer(sim.state.ledger, PLAYER, SINK, sim.money, "spent", 0);
    expect(sim.buyGroceries().ok).toBe(false);
  });

  it("charges rent on day 7 and takes it if there is money", () => {
    const sim = new Sim();
    transfer(sim.state.ledger, MINT, PLAYER, 10000, "bonus", 0);
    sim.state.minute = 6 * 24 * 60 + 7 * 60; // Day 7, 07:00
    const before = sim.money;
    sim.advance(120);
    expect(sim.money).toBe(before - ECONOMY.rentPerWeek);
    expect(sim.state.rentOwed).toBe(0);
  });

  it("adds a late fee and a warning when the rent can't be paid", () => {
    const sim = new Sim();
    transfer(sim.state.ledger, PLAYER, SINK, sim.money - 500, "spent", 0);
    sim.state.minute = 6 * 24 * 60 + 7 * 60;
    sim.advance(120);
    expect(sim.state.rentOwed).toBe(ECONOMY.rentPerWeek - 500 + ECONOMY.lateFee);
    expect(sim.drainEvents().some((e) => /late fee/i.test(e.text))).toBe(true);
    expect(ledgerTotal(sim.state.ledger)).toBe(0);
  });
});

describe("balance", () => {
  it("the starting money alone can't cover the first rent, so the player has to work in week one", () => {
    expect(ECONOMY.startingMoney).toBeLessThan(ECONOMY.rentPerWeek);
  });

  it("an ordinary week (work, groceries) can earn the rent", () => {
    const sim = new Sim();
    const start = sim.money;
    for (let day = 0; day < 6; day++) {
      if (sim.state.needs.energy > 30) run(sim, "work");
      if (sim.state.needs.hunger < 60 && sim.state.inventory.portions > 0) run(sim, "snack");
      if (sim.state.needs.bladder < 30) run(sim, "toilet");
      if (sim.state.needs.energy < 80) run(sim, "sleep");
      if (sim.state.inventory.portions < 2 && sim.money > 5000) sim.buyGroceries();
    }
    expect(sim.state.stats.totalEarned).toBeGreaterThan(8000);
    expect(sim.money).toBeGreaterThan(start - 6000); // not bleeding money
  });
});

describe("absence and saving", () => {
  it("catches up while away without anything dramatic", () => {
    const state = createGameState();
    state.needs.bladder = 45;
    const summary = simulateAbsence(state, 600);
    expect(summary.gameMinutes).toBe(600);
    expect(summary.lines.length).toBeGreaterThan(1);
    expect(state.needs.bladder).toBeGreaterThanOrEqual(40);
    expect(state.stats.timesPassedOut).toBe(0);
  });

  it("ignores very short absences and caps long ones", () => {
    expect(simulateAbsence(createGameState(), 2).gameMinutes).toBe(0);
    expect(simulateAbsence(createGameState(), 99999).gameMinutes).toBe(720);
  });

  it("round-trips a save and rejects a tampered ledger", () => {
    const sim = new Sim();
    sim.buyGroceries();
    const parsed = parseGameState(JSON.parse(JSON.stringify(sim.state)));
    expect(parsed?.inventory.portions).toBe(sim.state.inventory.portions);
    const tampered = JSON.parse(JSON.stringify(sim.state));
    tampered.ledger.accounts.player += 1_000_000;
    expect(parseGameState(tampered)).toBeNull();
    expect(parseGameState("nonsense")).toBeNull();
  });

  it("every action refers to real needs and sane durations", () => {
    for (const def of Object.values(ACTIONS)) {
      expect(def.minutes).toBeGreaterThan(0);
      expect(def.minutesPerSecond).toBeGreaterThan(0);
      const seconds = def.minutes / def.minutesPerSecond;
      expect(seconds).toBeLessThan(45); // a long activity is a time-lapse of at most ~45 real seconds
      expect(seconds).toBeGreaterThanOrEqual(3); // and never so quick it can't be seen
    }
  });
});

describe("furniture catalog", () => {
  it("has unique ids, positive whole-naira prices and real actions", async () => {
    const { FURNITURE } = await import("./index.js");
    const ids = new Set<string>();
    for (const f of FURNITURE) {
      expect(ids.has(f.id), `duplicate ${f.id}`).toBe(false);
      ids.add(f.id);
      expect(Number.isInteger(f.price) && f.price > 0, `${f.id} price`).toBe(true);
      if (f.action) expect(ACTIONS[f.action], `${f.id} action ${f.action}`).toBeDefined();
    }
    expect(FURNITURE.length).toBeGreaterThan(60);
  });
});
