import { PLAYER, SINK, balance, transfer } from "./ledger";
import { SAVINGS, loanLimit } from "./phone";
import { openStatus } from "./places";
import { clockOf } from "./sim";
import type { GameState } from "./types";

/**
 * The bank branch: the same savings account and loans as the phone's LifePay, but in person, so it works on any phone, even the basic
 * one that has no banking. The counter is free and open in office hours; the cash machine works any time for a small fee (and cannot
 * lend). Savings earn the weekly interest the phone already pays.
 */
export const ATM_FEE = 65;
export const MIN_AMOUNT = 100;

export type BankResult = { ok: true; text: string } | { ok: false; reason: string };

export const savingsBalance = (state: GameState): number => balance(state.ledger, SAVINGS);

/** Is the counter open now? (Cash machines always are.) */
export function counterOpen(state: GameState): { open: boolean; text: string } {
  const clock = clockOf(state.minute);
  const weekday = (clock.day + 3) % 7; // day 1 is a Thursday
  return openStatus("bank", clock.hourFloat, weekday);
}

function check(state: GameState, amount: number, atm: boolean): string | null {
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < MIN_AMOUNT) return `The smallest amount is ₦${MIN_AMOUNT}.`;
  if (amount > 100_000_000) return "That is more than the bank handles at once.";
  if (!atm) {
    const c = counterOpen(state);
    if (!c.open) return `The counter is closed (${c.text}). Use the cash machine, or come back.`;
  }
  return null;
}

function takeFee(state: GameState): void {
  if (balance(state.ledger, PLAYER) >= ATM_FEE) {
    transfer(state.ledger, PLAYER, SINK, ATM_FEE, "Cash machine fee", state.minute);
    state.stats.totalSpent += ATM_FEE;
  }
}

export function bankDeposit(state: GameState, amount: number, atm = false): BankResult {
  const bad = check(state, amount, atm);
  if (bad) return { ok: false, reason: bad };
  const fee = atm ? ATM_FEE : 0;
  if (balance(state.ledger, PLAYER) < amount + fee) return { ok: false, reason: fee ? `You need ₦${(amount + fee).toLocaleString()} (the machine takes ₦${fee}).` : "You don't have that much." };
  transfer(state.ledger, PLAYER, SAVINGS, amount, "Paid into savings", state.minute);
  if (fee) takeFee(state);
  return { ok: true, text: `Saved ₦${amount.toLocaleString()}. Savings: ₦${savingsBalance(state).toLocaleString()}.` };
}

export function bankWithdraw(state: GameState, amount: number, atm = false): BankResult {
  const bad = check(state, amount, atm);
  if (bad) return { ok: false, reason: bad };
  if (savingsBalance(state) < amount) return { ok: false, reason: `You only have ₦${savingsBalance(state).toLocaleString()} saved.` };
  transfer(state.ledger, SAVINGS, PLAYER, amount, "Taken out of savings", state.minute);
  if (atm) takeFee(state);
  return { ok: true, text: `Took out ₦${amount.toLocaleString()}. Savings: ₦${savingsBalance(state).toLocaleString()}.` };
}

/** A loan at the counter (the same 10% fee and late charge as the phone's). */
export function bankBorrow(state: GameState, amount: number): BankResult {
  const bad = check(state, amount, false);
  if (bad) return { ok: false, reason: bad };
  const p = state.phone;
  if (p.loan) return { ok: false, reason: "Pay off your current loan first." };
  if (amount > loanLimit(state.profile)) return { ok: false, reason: `The most they will lend you is ₦${loanLimit(state.profile).toLocaleString()}.` };
  // the money comes from the mint, like wages
  transfer(state.ledger, "mint", PLAYER, amount, "Loan from the bank", state.minute);
  p.loan = { owed: Math.round(amount * 1.1), sinceDay: Math.floor(state.minute / 1440) + 1 };
  return { ok: true, text: `₦${amount.toLocaleString()} paid out. You owe ₦${p.loan.owed.toLocaleString()} (10% fee).` };
}

export function bankRepay(state: GameState, amount: number): BankResult {
  const bad = check(state, amount, false);
  if (bad) return { ok: false, reason: bad };
  const p = state.phone;
  if (!p.loan) return { ok: false, reason: "You have no loan." };
  const pay = Math.min(amount, p.loan.owed, balance(state.ledger, PLAYER));
  if (pay <= 0) return { ok: false, reason: "You don't have enough." };
  transfer(state.ledger, PLAYER, SINK, pay, "Loan repayment", state.minute);
  p.loan.owed -= pay;
  if (p.loan.owed <= 0) p.loan = null;
  return { ok: true, text: `Repaid ₦${pay.toLocaleString()}.${p.loan ? "" : " Loan cleared."}` };
}
