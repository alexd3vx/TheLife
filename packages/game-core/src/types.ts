// The game's rules as plain data and pure functions. No rendering, no browser APIs: the same code runs in the
// offline game today and on the authoritative server later.

export const NEED_IDS = ["hunger", "energy", "hygiene", "bladder", "fun"] as const;
export type NeedId = (typeof NEED_IDS)[number];

/** 0 (empty / urgent) to 100 (full / fine). */
export type Needs = Record<NeedId, number>;

export interface LedgerEntry {
  id: number;
  minute: number;
  from: string;
  to: string;
  amount: number;
  reason: string;
}

/** Double-entry money: every transfer moves value between two accounts, so the total of all accounts is always 0. */
export interface Ledger {
  accounts: Record<string, number>;
  entries: LedgerEntry[];
  nextId: number;
}

import type { Profile } from "./profile.js";
import type { PhoneState } from "./phone.js";
import type { KitchenState } from "./kitchen.js";

export interface Inventory {
  /** Raw food portions from the shop. */
  portions: number;
  /** Cooked meals. */
  meals: number;
}

export interface GameState {
  version: 1;
  /** Absolute game minutes since Day 1, 00:00. */
  minute: number;
  needs: Needs;
  ledger: Ledger;
  inventory: Inventory;
  /** The fridge, the cupboard and the cooked food. */
  kitchen: KitchenState;
  /** How the character looks (a cleaned JSON string; see the client's Look). Kept with the life, on the server. */
  look?: string;
  /** Skill experience by skill id. */
  skills: Record<string, number>;
  /** Pay earned but not yet paid out (fractions of a naira). */
  incomeCarry: number;
  /** Rent owed and unpaid (including late fees). */
  rentOwed: number;
  /** Game day number on which rent was last charged. */
  lastRentDay: number;
  /** Who the player is and the background that set their start. Null in saves from before backgrounds existed. */
  profile: Profile | null;
  /** Game day number on which the family allowance was last paid. */
  lastAllowanceDay: number;
  /** The phone: battery, chats, bank extras, deliveries, job. */
  phone: PhoneState;
  /** Needs that already triggered their "low" warning, so each warning fires once per dip. */
  warned: Partial<Record<NeedId, boolean>>;
  stats: { daysSurvived: number; totalEarned: number; totalSpent: number; timesPassedOut: number };
}

export type SimEventKind = "info" | "good" | "warn" | "bad";

export interface SimEvent {
  kind: SimEventKind;
  text: string;
  minute: number;
}

export interface ActionDef {
  id: string;
  label: string;
  /** How the character performs it: standing, sitting or lying. */
  pose: "stand" | "seat" | "lie";
  /** Animation clip name. */
  clip: string;
  /** How many game minutes the full action takes. */
  minutes: number;
  /** Game minutes that pass per real second while doing it (time is skipped for long actions). */
  minutesPerSecond: number;
  /** Total change to each need over the whole action (spread evenly across it). */
  needs: Partial<Needs>;
  /** Fraction of normal need decay that still applies (default 1). 0 = needs don't decay while doing this. */
  decay?: Partial<Record<NeedId, number>>;
  /** Taken at the start. */
  cost?: { money?: number; portions?: number; meals?: number };
  /** Granted at the end (only if the action runs to completion). */
  gives?: { meals?: number };
  /** Money earned per game hour, before mood and skill multipliers. */
  incomePerHour?: number;
  /** Skill experience gained per game hour. */
  skill?: { id: string; xpPerHour: number };
  /** Keeps going until this need reaches the value (e.g. sleep until energy is full), up to `minutes`. */
  until?: { need: NeedId; atLeast: number };
  /** Refuse to start when a need is already at or above this level ("You're not tired."). */
  blockedIf?: { need: NeedId; atLeast: number; message: string };
  /** Refuse to start while a need is below this level ("You're too tired to work."). */
  needsAtLeast?: { need: NeedId; atLeast: number; message: string };
}

export const DAY_MINUTES = 24 * 60;
