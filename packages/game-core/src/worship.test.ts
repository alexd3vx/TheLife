import { describe, expect, it } from "vitest";
import { clockOf, createGameState } from "./sim";
import { MINT, PLAYER, balance, ledgerTotal, transfer } from "./ledger";
import { serviceOn, worshipService } from "./worship";

const at = (weekday: number, hour: number) => {
  const s = createGameState();
  transfer(s.ledger, MINT, PLAYER, 30_000, "test", 0);
  for (let d = 10; d < 17; d++) {
    s.minute = d * 1440 + hour * 60;
    if ((clockOf(s.minute).day + 3) % 7 === weekday) break;
  }
  s.needs.fun = 20;
  return s;
};

describe("church and mosque", () => {
  it("lets you give, takes the money and lifts you", () => {
    const s = at(1, 12);
    const start = balance(s.ledger, PLAYER);
    expect(worshipService(s, "church", "offering_2000").ok).toBe(true);
    expect(balance(s.ledger, PLAYER)).toBe(start - 2000);
    expect(s.needs.fun).toBe(27);
    expect(s.records!.giving).toBe(2000);
    expect(ledgerTotal(s.ledger)).toBe(0);
  });
  it("only has the main service at its time, once", () => {
    const wrong = at(3, 9);
    expect(serviceOn(wrong, "church").on).toBe(false);
    expect(worshipService(wrong, "church", "service").ok).toBe(false);
    const sunday = at(0, 9);
    expect(serviceOn(sunday, "church").on).toBe(true);
    expect(worshipService(sunday, "church", "service").ok).toBe(true);
    expect(worshipService(sunday, "church", "service").ok).toBe(false);
    const friday = at(5, 13);
    expect(worshipService(friday, "mosque", "service").ok).toBe(true);
  });
  it("spaces out prayer and talks, refuses when closed or broke", () => {
    const s = at(2, 10);
    expect(worshipService(s, "mosque", "pray").ok).toBe(true);
    expect(worshipService(s, "mosque", "pray").ok).toBe(false);
    s.minute += 4 * 60;
    expect(worshipService(s, "mosque", "pray").ok).toBe(true);
    expect(worshipService(s, "church", "counsel").ok).toBe(true);
    expect(worshipService(s, "church", "counsel").ok).toBe(false);
    const night = at(2, 2);
    expect(worshipService(night, "church", "pray").ok).toBe(false);
    const poor = at(2, 10);
    transfer(poor.ledger, PLAYER, MINT, balance(poor.ledger, PLAYER), "test", 0);
    expect(worshipService(poor, "church", "candle").ok).toBe(false);
    expect(worshipService(poor, "bank" as never, "pray").ok).toBe(false);
  });
});
