import { PLAYER, SINK, transfer } from "./ledger";
import { clampNeed } from "./needs";
import { openStatus } from "./places";
import { clockOf } from "./sim";
import { NEED_IDS, type GameState, type NeedId } from "./types";

/**
 * The shops: a market (staples and fresh food for the kitchen, plus things to eat now) and the mini-mart at a fuel station (things to
 * eat now, and a few staples). Groceries use the kitchen's own rules (`buyIngredient`); this file adds the ready-to-eat counter.
 * Prices and opening hours are the same on the server as on the screen.
 */
export type ShopPlace = "market" | "fuel";

export interface Snack {
  id: string;
  name: string;
  blurb: string;
  price: number;
  effect: Partial<Record<NeedId, number>>;
}

export const SNACKS: Snack[] = [
  { id: "water", name: "Sachet water", blurb: "Cold pure water.", price: 100, effect: { energy: 2, hunger: 1 } },
  { id: "zobo", name: "Zobo", blurb: "Chilled hibiscus drink in a bottle.", price: 300, effect: { hunger: 4, fun: 4 } },
  { id: "cola", name: "Cold soft drink", blurb: "Fizzy and sweet. A quick lift.", price: 450, effect: { energy: 8, fun: 5 } },
  { id: "chinchin", name: "Chin chin", blurb: "A crunchy bag to nibble on.", price: 300, effect: { hunger: 10, fun: 3 } },
  { id: "pie", name: "Meat pie", blurb: "Warm from the glass case.", price: 700, effect: { hunger: 22 } },
  { id: "puff", name: "Puff-puff", blurb: "Hot, sugary, by the dozen.", price: 500, effect: { hunger: 14, fun: 5 } },
  { id: "suya", name: "Suya with onions", blurb: "Spiced beef on a stick, wrapped in paper.", price: 1500, effect: { hunger: 34, fun: 6 } },
  { id: "jollof", name: "Plate of jollof and chicken", blurb: "A full plate from the food stall.", price: 2500, effect: { hunger: 55, fun: 4 } },
];

export const snackById = (id: string): Snack | undefined => SNACKS.find((s) => s.id === id);

/** Staples the mini-mart at a fuel station keeps (the market has everything). */
export const MINIMART_STOCK = ["noodles", "bread", "egg", "oil", "garri"];

/** Is this kind of shop open now? */
export function shopOpen(state: GameState, kind: ShopPlace): { open: boolean; text: string } {
  const clock = clockOf(state.minute);
  const weekday = (clock.day + 3) % 7; // day 1 is a Thursday
  return openStatus(kind, clock.hourFloat, weekday);
}

export type ShopResult = { ok: true; text: string } | { ok: false; reason: string };

/** Buys something to eat or drink right now. `scale` is the buyer's price trait (thrifty and so on). */
export function shopSnack(state: GameState, kind: ShopPlace, id: string, scale = 1): ShopResult {
  if (kind !== "market" && kind !== "fuel") return { ok: false, reason: "That is not a shop." };
  const s = snackById(id);
  if (!s) return { ok: false, reason: "They don't sell that." };
  const hours = shopOpen(state, kind);
  if (!hours.open) return { ok: false, reason: `Closed (${hours.text}).` };
  const price = Math.max(1, Math.round(s.price * scale));
  const before = { ...state.needs };
  const r = transfer(state.ledger, PLAYER, SINK, price, s.name, state.minute);
  if (!r.ok) return { ok: false, reason: `${s.name} costs ₦${price.toLocaleString()}. You don't have enough.` };
  state.stats.totalSpent += price;
  for (const n of NEED_IDS) {
    const add = s.effect[n];
    if (add) state.needs[n] = clampNeed(state.needs[n] + add);
  }
  const gained = NEED_IDS.filter((n) => Math.round(state.needs[n]) > Math.round(before[n]));
  return { ok: true, text: `${s.name} (₦${price.toLocaleString()}): ${gained.length ? `${gained.join(", ")} up.` : "you were not hungry."}` };
}
