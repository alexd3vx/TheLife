import type { Ledger } from "./types";

export const PLAYER = "player";
export const MINT = "mint"; // where new money comes from (wages, starting grant)
export const SINK = "sink"; // where spent money goes (shops, landlord)

export function createLedger(): Ledger {
  return { accounts: { [PLAYER]: 0, [MINT]: 0, [SINK]: 0 }, entries: [], nextId: 1 };
}

export function balance(ledger: Ledger, account = PLAYER): number {
  return ledger.accounts[account] ?? 0;
}

export type TransferResult = { ok: true } | { ok: false; reason: string };

/**
 * Moves `amount` (> 0, whole naira) from one account to another. The player can't go below zero; the mint is allowed to,
 * which is how new money enters the world. Nothing else changes balances, so the sum of all accounts is always 0.
 */
export function transfer(ledger: Ledger, from: string, to: string, amount: number, reason: string, minute: number): TransferResult {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) return { ok: false, reason: "Amount must be a positive whole number." };
  if (from === to) return { ok: false, reason: "Can't transfer to the same account." };
  if (from !== MINT && balance(ledger, from) < amount) return { ok: false, reason: "Not enough money." };
  ledger.accounts[from] = balance(ledger, from) - amount;
  ledger.accounts[to] = balance(ledger, to) + amount;
  ledger.entries.push({ id: ledger.nextId++, minute, from, to, amount, reason });
  if (ledger.entries.length > 300) ledger.entries.splice(0, ledger.entries.length - 300);
  return { ok: true };
}

/** For audits and tests: the sum of every account. Must be exactly 0. */
export function ledgerTotal(ledger: Ledger): number {
  return Object.values(ledger.accounts).reduce((sum, value) => sum + value, 0);
}
