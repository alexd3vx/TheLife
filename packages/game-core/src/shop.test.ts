import { describe, expect, it } from "vitest";
import { createGameState } from "./sim";
import { MINT, PLAYER, balance, ledgerTotal, transfer } from "./ledger";
import { SNACKS, shopOpen, shopSnack } from "./shop";

const at = (hour: number) => {
  const s = createGameState();
  transfer(s.ledger, MINT, PLAYER, 20_000, "test", 0);
  s.minute = 10 * 1440 + hour * 60;
  return s;
};

describe("the shops", () => {
  it("sells food that fills you and takes the money", () => {
    const s = at(12);
    s.needs.hunger = 20;
    const start = balance(s.ledger, PLAYER);
    expect(shopSnack(s, "market", "suya").ok).toBe(true);
    expect(s.needs.hunger).toBeGreaterThan(50);
    expect(balance(s.ledger, PLAYER)).toBe(start - 1500);
    expect(ledgerTotal(s.ledger)).toBe(0);
  });
  it("refuses when closed, broke, or for something they don't have", () => {
    const night = at(2);
    expect(shopOpen(night, "market").open).toBe(false);
    expect(shopSnack(night, "market", "pie").ok).toBe(false);
    const poor = at(12);
    transfer(poor.ledger, PLAYER, MINT, balance(poor.ledger, PLAYER), "test", 0);
    expect(shopSnack(poor, "fuel", "pie").ok).toBe(false);
    expect(shopSnack(at(12), "fuel", "nothing").ok).toBe(false);
    expect(shopSnack(at(12), "bank" as never, "pie").ok).toBe(false);
  });
  it("honours the thrifty price", () => {
    const a = at(12), b = at(12);
    shopSnack(a, "fuel", "pie", 0.9);
    shopSnack(b, "fuel", "pie");
    expect(balance(a.ledger, PLAYER)).toBeGreaterThan(balance(b.ledger, PLAYER));
  });
  it("has unique ids", () => expect(new Set(SNACKS.map((s) => s.id)).size).toBe(SNACKS.length));
});
