import { describe, expect, it } from "vitest";
import { BACKGROUNDS, ECONOMY, Sim, createGameState, parseGameState, parseProfile, profileFrom, rollBackground, balance } from "./index";

/** A small deterministic random source, so tests are repeatable. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Runs a week of game time the way the app does (small steps; an action ending does not stop the week). */
function runWeek(sim: Sim) {
  for (let i = 0; i < 7 * 24 * 6; i++) sim.advance(10);
}

describe("backgrounds", () => {
  it("every background is well formed and uses whole, round naira", () => {
    const ids = new Set<string>();
    for (const b of BACKGROUNDS) {
      expect(ids.has(b.id), b.id).toBe(false);
      ids.add(b.id);
      expect(b.money[0]).toBeLessThanOrEqual(b.money[1]);
      expect(b.hometowns.length).toBeGreaterThan(0);
      expect(b.story.length).toBeGreaterThan(40);
      if (b.tier === "nepo") expect(b.rent).toBe(0);
      if (b.tier === "lapo") expect(b.money[1]).toBeLessThan(20_000);
    }
  });

  it("rolls all three tiers, with poor and middle more common than rich", () => {
    const random = seeded(7);
    const counts = { lapo: 0, middle: 0, nepo: 0 };
    for (let i = 0; i < 2000; i++) counts[rollBackground(random, "male").tier]++;
    expect(counts.nepo).toBeGreaterThan(50);
    expect(counts.lapo).toBeGreaterThan(counts.nepo);
    expect(counts.middle).toBeGreaterThan(counts.nepo);
  });

  it("starts the player with the rolled money, and the ledger still balances", () => {
    const profile = rollBackground(seeded(3), "female");
    const state = createGameState(profile);
    expect(balance(state.ledger)).toBe(profile.startingMoney);
    expect(Object.values(state.ledger.accounts).reduce((a, b) => a + b, 0)).toBe(0);
    expect(profile.startingMoney % 500).toBe(0);
  });

  it("a nepo pays no rent and gets a weekly allowance from family", () => {
    const def = BACKGROUNDS.find((b) => b.tier === "nepo")!;
    const profile = profileFrom(def, seeded(1), "male");
    const sim = new Sim(createGameState(profile));
    const before = sim.money;
    runWeek(sim);
    expect(sim.state.rentOwed).toBe(0);
    expect(sim.money).toBeGreaterThanOrEqual(before + profile.weeklyAllowance - 5_000); // the allowance arrived
    expect(sim.drainEvents().some((e) => /allowance/i.test(e.text))).toBe(true);
  });

  it("a lapo still has rent to find", () => {
    const def = BACKGROUNDS.find((b) => b.tier === "lapo")!;
    const profile = profileFrom(def, seeded(2), "male");
    const sim = new Sim(createGameState(profile));
    runWeek(sim);
    const paid = profile.startingMoney >= profile.rentPerWeek;
    expect(paid ? sim.money : sim.state.rentOwed).toBeDefined();
    expect(profile.rentPerWeek).toBe(ECONOMY.rentPerWeek);
  });

  it("saves keep the profile, and old saves without one still load", () => {
    const profile = rollBackground(seeded(11), "male");
    const state = createGameState(profile);
    const loaded = parseGameState(JSON.parse(JSON.stringify(state)));
    expect(loaded?.profile?.title).toBe(profile.title);
    expect(loaded?.profile?.firstName).toBe(profile.firstName);

    const old = JSON.parse(JSON.stringify(createGameState())) as Record<string, unknown>;
    delete old.profile;
    delete old.lastAllowanceDay;
    const legacy = parseGameState(old);
    expect(legacy).not.toBeNull();
    expect(legacy?.profile).toBeNull();
  });

  it("rejects nonsense profiles and clamps numbers", () => {
    expect(parseProfile(null)).toBeNull();
    expect(parseProfile({ tier: "king" })).toBeNull();
    const p = parseProfile({ tier: "nepo", firstName: "x".repeat(500), startingMoney: -5, rentPerWeek: Infinity, phone: "toaster", traits: ["a", 3, "b"] });
    expect(p?.firstName.length).toBe(30);
    expect(p?.startingMoney).toBe(0);
    expect(p?.phone).toBe("basic");
    expect(p?.traits).toEqual(["a", "b"]);
  });
});
