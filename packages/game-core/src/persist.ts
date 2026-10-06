import { createGameState } from "./sim";
import { parsePhone } from "./phone";
import { parseProfile } from "./profile";
import { parseKitchen } from "./kitchen";
import { parseHome } from "./home";
import { createNeeds } from "./needs";
import { NEED_IDS, type GameState } from "./types";

/**
 * Reads a saved game from untrusted JSON (local storage today, the server later). Anything missing or out of range
 * falls back to a sensible default rather than crashing, and the ledger must still balance or the save is rejected.
 */
export function parseGameState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<GameState>;
  if (r.version !== 1 || typeof r.minute !== "number" || !r.ledger || typeof r.ledger !== "object") return null;

  const accounts = (r.ledger as GameState["ledger"]).accounts;
  if (!accounts || typeof accounts !== "object") return null;
  let total = 0;
  for (const value of Object.values(accounts)) {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    total += value;
  }
  if (total !== 0) return null; // money was created or destroyed outside the ledger

  const fresh = createGameState();
  const needs = createNeeds();
  for (const id of NEED_IDS) {
    const value = (r.needs as Partial<Record<string, number>> | undefined)?.[id];
    needs[id] = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fresh.needs[id];
  }
  const entries = Array.isArray((r.ledger as GameState["ledger"]).entries) ? (r.ledger as GameState["ledger"]).entries.slice(-300) : [];
  const inventory = {
    portions: Math.max(0, Math.floor(r.inventory?.portions ?? 0)),
    meals: Math.max(0, Math.floor(r.inventory?.meals ?? 0)),
  };
  const profile = parseProfile(r.profile);
  return {
    version: 1,
    minute: Math.max(0, r.minute),
    needs,
    ledger: { accounts: { ...accounts }, entries, nextId: (r.ledger as GameState["ledger"]).nextId ?? entries.length + 1 },
    inventory,
    kitchen: parseKitchen(r.kitchen, profile?.tier),
    ...(r.home ? { home: parseHome(r.home) } : {}),
    ...(typeof r.look === "string" && r.look.length <= 1500 ? { look: r.look } : {}),
    skills: typeof r.skills === "object" && r.skills ? { ...r.skills } : {},
    incomeCarry: typeof r.incomeCarry === "number" ? r.incomeCarry : 0,
    rentOwed: Math.max(0, r.rentOwed ?? 0),
    lastRentDay: Math.max(0, r.lastRentDay ?? 0),
    profile,
    phone: parsePhone(r.phone, profile),
    lastAllowanceDay: Math.max(0, r.lastAllowanceDay ?? 0),
    warned: {},
    stats: { ...fresh.stats, ...(r.stats ?? {}) },
  };
}
