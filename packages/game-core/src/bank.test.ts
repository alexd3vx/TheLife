import { describe, expect, it } from "vitest";
import { createGameState } from "./sim";
import { MINT, PLAYER, balance, ledgerTotal, transfer } from "./ledger";
import { ATM_FEE, bankBorrow, bankDeposit, bankRepay, bankWithdraw, counterOpen, savingsBalance } from "./bank";

const weekdayMorning = () => {
  const s = createGameState();
  transfer(s.ledger, MINT, PLAYER, 50_000, "test", 0);
  for (let d = 10; d < 17; d++) {
    s.minute = d * 1440 + 10 * 60;
    if (counterOpen(s).open) break;
  }
  return s;
};

describe("the bank branch", () => {
  it("moves money to savings and back without creating any", () => {
    const s = weekdayMorning();
    expect(counterOpen(s).open).toBe(true);
    const start = balance(s.ledger, PLAYER);
    expect(bankDeposit(s, 20_000).ok).toBe(true);
    expect(savingsBalance(s)).toBe(20_000);
    expect(balance(s.ledger, PLAYER)).toBe(start - 20_000);
    expect(bankWithdraw(s, 5_000).ok).toBe(true);
    expect(savingsBalance(s)).toBe(15_000);
    expect(ledgerTotal(s.ledger)).toBe(0);
  });

  it("refuses what you do not have, and tiny amounts", () => {
    const s = weekdayMorning();
    expect(bankDeposit(s, 5_000_000).ok).toBe(false);
    expect(bankDeposit(s, 5).ok).toBe(false);
    expect(bankWithdraw(s, 1_000).ok).toBe(false);
  });

  it("closes the counter at night but the cash machine works, for a fee", () => {
    const s = weekdayMorning();
    s.minute = Math.floor(s.minute / 1440) * 1440 + 22 * 60;
    expect(bankDeposit(s, 1_000).ok).toBe(false);
    const before = balance(s.ledger, PLAYER);
    expect(bankDeposit(s, 1_000, true).ok).toBe(true);
    expect(balance(s.ledger, PLAYER)).toBe(before - 1_000 - ATM_FEE);
    expect(ledgerTotal(s.ledger)).toBe(0);
  });

  it("lends at the counter and takes the repayment", () => {
    const s = weekdayMorning();
    expect(bankBorrow(s, 10_000).ok).toBe(true);
    expect(s.phone.loan?.owed).toBe(11_000);
    expect(bankBorrow(s, 1_000).ok).toBe(false); // one loan at a time
    expect(bankRepay(s, 11_000).ok).toBe(true);
    expect(s.phone.loan).toBeNull();
  });
});
