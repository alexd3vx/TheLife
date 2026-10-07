import { describe, expect, it } from "vitest";
import { createGameState } from "./sim";
import { MINT, PLAYER, balance, ledgerTotal, transfer } from "./ledger";
import { HOSPITAL_SERVICES, criticalNeed, hospitalFirstAid, hospitalService } from "./hospital";

const rich = () => {
  const s = createGameState();
  transfer(s.ledger, MINT, PLAYER, 100_000, "test", 0);
  return s;
};

describe("the hospital", () => {
  it("charges for a service, applies it, and keeps the ledger balanced", () => {
    const s = rich();
    s.needs.energy = 20;
    const before = balance(s.ledger, PLAYER);
    const r = hospitalService(s, "general");
    expect(r.ok).toBe(true);
    expect(s.needs.energy).toBe(70);
    expect(balance(s.ledger, PLAYER)).toBe(before - 3500);
    expect(ledgerTotal(s.ledger)).toBe(0);
  });

  it("caps needs at 100 and refuses what you cannot pay for", () => {
    const s = rich();
    hospitalService(s, "private");
    expect(s.needs.energy).toBe(100);
    const poor = createGameState();
    poor.ledger.accounts[PLAYER] = 0;
    poor.ledger.accounts[MINT] = 0;
    const r = hospitalService(poor, "private");
    expect(r.ok).toBe(false);
  });

  it("the check-up sees to the neediest need, and the toilet is free", () => {
    const s = rich();
    s.needs.hunger = 5;
    hospitalService(s, "checkup");
    expect(s.needs.hunger).toBe(35);
    s.needs.bladder = 10;
    const cash = balance(s.ledger, PLAYER);
    hospitalService(s, "toilet");
    expect(s.needs.bladder).toBe(100);
    expect(balance(s.ledger, PLAYER)).toBe(cash);
  });

  it("treats someone about to collapse for free, and nobody else", () => {
    const s = createGameState();
    expect(hospitalFirstAid(s).ok).toBe(false);
    s.needs.energy = 4;
    expect(criticalNeed(s)).toBe("energy");
    expect(hospitalFirstAid(s).ok).toBe(true);
    expect(s.needs.energy).toBe(45);
  });

  it("every service has a known id and sensible price", () => {
    for (const x of HOSPITAL_SERVICES) {
      expect(x.price).toBeGreaterThanOrEqual(0);
      expect(hospitalService(rich(), x.id).ok).toBe(true);
    }
  });
});
