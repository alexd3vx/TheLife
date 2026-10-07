import { describe, expect, it } from "vitest";
import { clockOf, createGameState } from "./sim";
import { MINT, PLAYER, balance, ledgerTotal, transfer } from "./ledger";
import { schoolOpen, schoolService, schoolWait } from "./school";

const weekday = (hour: number) => {
  const s = createGameState();
  transfer(s.ledger, MINT, PLAYER, 10_000, "test", 0);
  for (let d = 10; d < 17; d++) {
    s.minute = d * 1440 + hour * 60;
    if (schoolOpen(s).open || hour < 7 || hour >= 16) { if ((clockOf(s.minute).day + 3) % 7 % 6 !== 0) break; }
  }
  return s;
};

describe("the school", () => {
  it("trains a skill for a fee and needs a rest between sessions", () => {
    const s = weekday(10);
    expect(schoolOpen(s).open).toBe(true);
    const start = balance(s.ledger, PLAYER);
    const xp = s.skills.computer ?? 0;
    expect(schoolService(s, "lab").ok).toBe(true);
    expect(s.skills.computer).toBe(xp + 12);
    expect(balance(s.ledger, PLAYER)).toBe(start - 300);
    expect(ledgerTotal(s.ledger)).toBe(0);
    expect(schoolService(s, "library").ok).toBe(false);
    expect(schoolWait(s)).toBeGreaterThan(0);
    s.minute += 61;
    expect(schoolService(s, "library").ok).toBe(true);
  });
  it("refuses when closed, tired or broke", () => {
    expect(schoolService(weekday(20), "library").ok).toBe(false);
    const tired = weekday(10);
    tired.needs.energy = 10;
    expect(schoolService(tired, "library").ok).toBe(false);
    const poor = weekday(10);
    transfer(poor.ledger, PLAYER, MINT, balance(poor.ledger, PLAYER), "test", 0);
    expect(schoolService(poor, "evening").ok).toBe(false);
    expect(schoolService(weekday(10), "nope").ok).toBe(false);
  });
});
