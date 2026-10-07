import { describe, expect, it } from "vitest";
import { PLAYER, balance, createGameState, homeBuy, homeLock, homeMove, homeSell, parseGameState, parseHome, runRpc, Sim, visitorMayEnter } from "./index.js";

const rich = () => {
  const s = createGameState();
  return s;
};

describe("home editing", () => {
  it("buys a piece, spends the money and keeps the ledger balanced", () => {
    const state = rich();
    const before = state.ledger.accounts[PLAYER] ?? 0;
    const r = homeBuy(state, "plastic_monobloc_chair_01", 1, 2, 90);
    if (before < 6500) expect(r.ok).toBe(false);
    else {
      expect(r.ok).toBe(true);
      expect(state.home?.added).toHaveLength(1);
      expect(balance(state.ledger, PLAYER)).toBe(before - 6500);
      expect(Object.values(state.ledger.accounts).reduce((a, b) => a + b, 0)).toBe(0);
    }
  });

  it("refuses what the shop doesn't sell and what you can't afford", () => {
    const state = rich();
    expect(homeBuy(state, "no_such_thing", 0, 0, 0).ok).toBe(false);
    state.ledger.accounts[PLAYER] = 0;
    expect(homeBuy(state, "sofa_03", 0, 0, 0).ok).toBe(false);
    expect(state.home?.added ?? []).toHaveLength(0);
  });

  it("moves and sells pieces, giving back only part of the price", () => {
    const state = rich();
    state.ledger.accounts[PLAYER] = (state.ledger.accounts[PLAYER] ?? 0) + 1_000_000;
    state.ledger.accounts["mint"] = (state.ledger.accounts["mint"] ?? 0) - 1_000_000;
    expect(homeMove(state, "bed", 2.5, 1.25, 180).ok).toBe(true);
    expect(state.home?.moved["bed"]).toEqual({ x: 2.5, z: 1.25, rot: 180 });
    const bought = homeBuy(state, "dining_chair_02", 0, 0, 0);
    expect(bought.ok).toBe(true);
    const money = balance(state.ledger, PLAYER);
    const id = state.home!.added[0]!.id;
    expect(homeSell(state, id).ok).toBe(true);
    expect(balance(state.ledger, PLAYER)).toBe(money + Math.floor(38_000 * 0.6));
    const start = balance(state.ledger, PLAYER);
    expect(homeSell(state, "sofa", "sofa_03").ok).toBe(true);
    expect(balance(state.ledger, PLAYER)).toBe(start + Math.floor(340_000 * 0.25));
    expect(homeSell(state, "sofa", "sofa_03").ok).toBe(false); // already sold
    expect(Object.values(state.ledger.accounts).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("is only reachable through checked remote calls and survives saving", () => {
    const sim = new Sim(createGameState());
    expect(runRpc(sim, "homeMove", ["bed", Number.NaN, 0, 0]).ok).toBe(false);
    expect(runRpc(sim, "homeMove", ["bed", 999, 0, 0]).ok).toBe(false);
    expect(runRpc(sim, "homeMove", ["bed", 1, 1, 90]).ok).toBe(true);
    const back = parseGameState(JSON.parse(JSON.stringify(sim.state)));
    expect(back?.home?.moved["bed"]).toEqual({ x: 1, z: 1, rot: 90 });
  });

  it("locks and unlocks the front door, and keeps visitors out while it is locked", () => {
    const s = createGameState();
    expect(visitorMayEnter(s, false)).toBe(true);
    expect(homeLock(s, true).ok).toBe(true);
    expect(s.home?.locked).toBe(true);
    expect(visitorMayEnter(s, false)).toBe(false);
    expect(visitorMayEnter(s, true)).toBe(true);
    expect(parseHome(JSON.parse(JSON.stringify(s.home))).locked).toBe(true);
    expect(homeLock(s, false).ok).toBe(true);
    expect(s.home?.locked).toBeUndefined();
    expect(homeLock(s, "yes" as never).ok).toBe(false);
  });
});
