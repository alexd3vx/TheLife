import { PHONE_MODELS, chargerById } from "./phoneData.js";
import { balance } from "./ledger.js";
import type { GameState } from "./types.js";

// What the player carries. Every item has a size on the bag's grid (one cell is a hand's width), and the bag only has so many cells, so
// carrying more means choosing. The list is worked out from the life itself (phone, wallet, food, chargers); nothing is stored twice.

export type BagIcon = "phone" | "cash" | "key" | "id" | "charger" | "bank" | "food" | "meal";

export interface BagItem {
  id: string;
  name: string;
  /** Size on the grid, in cells. */
  w: number;
  h: number;
  icon: BagIcon;
  qty?: number;
  note: string;
}

export interface BagSpec {
  name: string;
  cols: number;
  rows: number;
}

export const BAGS: Record<"lapo" | "middle" | "nepo", BagSpec> = {
  lapo: { name: "Ankara tote bag", cols: 5, rows: 4 },
  middle: { name: "Backpack", cols: 6, rows: 5 },
  nepo: { name: "Leather satchel", cols: 7, rows: 5 },
};

const FOOD_PER_BAG = 3;
const MEALS_PER_BOX = 2;

export function bagSpecFor(state: GameState): BagSpec {
  return BAGS[state.profile?.tier ?? "middle"];
}

/** Everything the person has on them, with sizes. */
export function bagItems(state: GameState): BagItem[] {
  const out: BagItem[] = [];
  const phone = PHONE_MODELS[state.phone.model];
  out.push({ id: "phone", name: phone.name, w: 1, h: 2, icon: "phone", note: `${Math.round(state.phone.battery)}% battery` });
  out.push({ id: "wallet", name: "Wallet", w: 2, h: 1, icon: "cash", note: `₦${Math.max(0, Math.round(balance(state.ledger))).toLocaleString("en-NG")} in your account` });
  out.push({ id: "keys", name: "House key", w: 1, h: 1, icon: "key", note: "Opens your door" });
  out.push({ id: "id", name: "ID card", w: 1, h: 1, icon: "id", note: state.profile ? `${state.profile.firstName} ${state.profile.surname}`.trim() : "Your ID" });
  for (const cid of state.phone.chargers) {
    const c = chargerById(cid);
    if (c) out.push({ id: `charger:${cid}`, name: c.name, w: 1, h: 1, icon: "charger", note: `${c.rate}% battery per hour` });
  }
  if (state.phone.powerBank.owned) out.push({ id: "powerbank", name: "Power bank", w: 1, h: 2, icon: "bank", note: `${Math.round(state.phone.powerBank.charge)} charge stored` });
  const food = Math.max(0, Math.floor(state.inventory.portions));
  for (let i = 0; i * FOOD_PER_BAG < food; i++) {
    const n = Math.min(FOOD_PER_BAG, food - i * FOOD_PER_BAG);
    out.push({ id: `food:${i}`, name: "Groceries", w: 2, h: 1, icon: "food", qty: n, note: `${n} portion${n === 1 ? "" : "s"} to cook` });
  }
  const meals = Math.max(0, Math.floor(state.inventory.meals));
  for (let i = 0; i * MEALS_PER_BOX < meals; i++) {
    const n = Math.min(MEALS_PER_BOX, meals - i * MEALS_PER_BOX);
    out.push({ id: `meal:${i}`, name: "Packed meal", w: 1, h: 2, icon: "meal", qty: n, note: `${n} cooked meal${n === 1 ? "" : "s"}, ready to eat` });
  }
  return out;
}

export interface PlacedItem {
  item: BagItem;
  x: number;
  y: number;
}

/** Fits the items on the grid, biggest first, each at the first free spot. What does not fit is left over. */
export function packBag(items: BagItem[], cols: number, rows: number): { placed: PlacedItem[]; leftOver: BagItem[] } {
  const grid: boolean[] = new Array(cols * rows).fill(false);
  const placed: PlacedItem[] = [];
  const leftOver: BagItem[] = [];
  const order = items.map((item, i) => ({ item, i })).sort((a, b) => b.item.w * b.item.h - a.item.w * a.item.h || a.i - b.i);
  for (const { item } of order) {
    let spot: { x: number; y: number } | null = null;
    for (let y = 0; y + item.h <= rows && !spot; y++) {
      for (let x = 0; x + item.w <= cols && !spot; x++) {
        let free = true;
        for (let dy = 0; dy < item.h && free; dy++) for (let dx = 0; dx < item.w; dx++) if (grid[(y + dy) * cols + x + dx]) free = false;
        if (free) spot = { x, y };
      }
    }
    if (!spot) {
      leftOver.push(item);
      continue;
    }
    for (let dy = 0; dy < item.h; dy++) for (let dx = 0; dx < item.w; dx++) grid[(spot.y + dy) * cols + spot.x + dx] = true;
    placed.push({ item, ...spot });
  }
  return { placed, leftOver };
}
