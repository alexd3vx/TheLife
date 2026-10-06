import { PLAYER, SINK, transfer } from "./ledger.js";
import { wallPower } from "./phone.js";
import type { GameState } from "./types.js";

// The kitchen: what is in the fridge and the store cupboard, how fast it goes bad, what can be cooked from it, and what is left to eat.
// Time here is the real clock (minutes), so a tomato really does last a few days and cooked rice about half a day without a fridge.
// All of it is pure rules over the game state, so the server runs the same code as the player's screen.

export interface Ingredient {
  id: string;
  name: string;
  /** What one serving is, for the label. */
  unit: string;
  /** Price of one serving in naira. */
  price: number;
  /** Minutes it stays good in a warm kitchen. */
  shelfLife: number;
  /** Space it takes in the fridge / store, per bundle of up to 4 servings. */
  w: number;
  h: number;
  /** Needs a fridge to last (otherwise it keeps well in a cupboard). */
  fresh: boolean;
  icon: "apple" | "carrot" | "pepper" | "fish" | "egg" | "cookie" | "seed" | "lemon" | "drumstick" | "bowl";
}

const DAY = 1440;

export const INGREDIENTS: Ingredient[] = [
  { id: "rice", name: "Rice", unit: "cup", price: 350, shelfLife: 90 * DAY, w: 2, h: 1, fresh: false, icon: "seed" },
  { id: "beans", name: "Beans", unit: "cup", price: 300, shelfLife: 90 * DAY, w: 2, h: 1, fresh: false, icon: "seed" },
  { id: "garri", name: "Garri", unit: "cup", price: 200, shelfLife: 120 * DAY, w: 2, h: 1, fresh: false, icon: "seed" },
  { id: "noodles", name: "Noodles", unit: "pack", price: 250, shelfLife: 180 * DAY, w: 1, h: 1, fresh: false, icon: "cookie" },
  { id: "oil", name: "Vegetable oil", unit: "spoon", price: 150, shelfLife: 180 * DAY, w: 1, h: 1, fresh: false, icon: "lemon" },
  { id: "tomato", name: "Tomatoes", unit: "basket", price: 200, shelfLife: 4 * DAY, w: 2, h: 1, fresh: true, icon: "apple" },
  { id: "pepper", name: "Peppers", unit: "handful", price: 120, shelfLife: 5 * DAY, w: 1, h: 1, fresh: true, icon: "pepper" },
  { id: "onion", name: "Onions", unit: "bulb", price: 100, shelfLife: 14 * DAY, w: 1, h: 1, fresh: false, icon: "carrot" },
  { id: "plantain", name: "Plantain", unit: "finger", price: 250, shelfLife: 5 * DAY, w: 1, h: 2, fresh: true, icon: "carrot" },
  { id: "yam", name: "Yam", unit: "slice", price: 450, shelfLife: 7 * DAY, w: 2, h: 1, fresh: false, icon: "carrot" },
  { id: "egg", name: "Eggs", unit: "egg", price: 200, shelfLife: 14 * DAY, w: 1, h: 1, fresh: true, icon: "egg" },
  { id: "bread", name: "Bread", unit: "slice", price: 350, shelfLife: 3 * DAY, w: 2, h: 1, fresh: false, icon: "cookie" },
  { id: "fish", name: "Fish", unit: "piece", price: 900, shelfLife: DAY, w: 2, h: 1, fresh: true, icon: "fish" },
  { id: "chicken", name: "Chicken", unit: "piece", price: 1500, shelfLife: DAY, w: 2, h: 1, fresh: true, icon: "drumstick" },
];

const byIngredient = new Map(INGREDIENTS.map((i) => [i.id, i]));
export const ingredientById = (id: string): Ingredient | undefined => byIngredient.get(id);

export interface Recipe {
  id: string;
  name: string;
  blurb: string;
  /** Servings of each ingredient. */
  needs: Record<string, number>;
  /** Plates it makes. */
  plates: number;
  /** Hunger one plate fills (0 to 100) and the mood boost. */
  hunger: number;
  fun: number;
  /** Needs a real stove (not just a kettle). */
  action: "cook" | "cookQuick";
}

export const DISH_RECIPES: Recipe[] = [
  { id: "jollof", name: "Jollof rice", blurb: "Party rice. Everyone has an opinion on it.", needs: { rice: 2, tomato: 1, pepper: 1, onion: 1, oil: 1 }, plates: 3, hunger: 70, fun: 10, action: "cook" },
  { id: "beans_plantain", name: "Beans and plantain", blurb: "Cheap, filling and good.", needs: { beans: 2, plantain: 1, oil: 1, onion: 1 }, plates: 2, hunger: 68, fun: 6, action: "cook" },
  { id: "fried_rice", name: "Egg fried rice", blurb: "Quick fried rice with egg.", needs: { rice: 2, egg: 1, onion: 1, oil: 1 }, plates: 3, hunger: 64, fun: 6, action: "cook" },
  { id: "yam_egg", name: "Yam and egg sauce", blurb: "Weekend breakfast.", needs: { yam: 2, egg: 2, tomato: 1, pepper: 1, oil: 1 }, plates: 2, hunger: 72, fun: 8, action: "cook" },
  { id: "eba_stew", name: "Eba and stew", blurb: "Garri swallow with pepper stew and fish.", needs: { garri: 2, tomato: 2, pepper: 1, oil: 1, fish: 1 }, plates: 2, hunger: 74, fun: 9, action: "cook" },
  { id: "pepper_soup", name: "Fish pepper soup", blurb: "Hot, thin, comforting.", needs: { fish: 1, pepper: 2, onion: 1 }, plates: 2, hunger: 46, fun: 12, action: "cook" },
  { id: "noodles_egg", name: "Noodles and egg", blurb: "Ready in minutes.", needs: { noodles: 2, egg: 1, pepper: 1 }, plates: 2, hunger: 54, fun: 4, action: "cookQuick" },
  { id: "egg_bread", name: "Egg and bread", blurb: "The quickest thing there is.", needs: { egg: 2, bread: 2, tomato: 1 }, plates: 2, hunger: 50, fun: 4, action: "cookQuick" },
];
const byRecipe = new Map(DISH_RECIPES.map((r) => [r.id, r]));
export const recipeById = (id: string): Recipe | undefined => byRecipe.get(id);

/** A cooked dish stays good this long without a fridge. */
export const DISH_SHELF_LIFE = 14 * 60;

export interface PantryLot {
  id: string;
  qty: number;
  /** Minutes it has aged (a fridge slows this down). */
  age: number;
}
export interface Dish {
  id: string;
  qty: number;
  age: number;
}
export interface KitchenState {
  /** Does the home have a fridge? */
  fridge: boolean;
  lots: PantryLot[];
  dishes: Dish[];
  /** The recipe picked for the next cooking, whose ingredients were already taken. */
  cooking: string | null;
  /** The dish picked for the next meal, whose plate was already taken. */
  eating: { id: string; spoiled: boolean } | null;
}

export type KitchenResult = { ok: true; text?: string } | { ok: false; reason: string };
const fail = (reason: string): KitchenResult => ({ ok: false, reason });
const ok = (text?: string): KitchenResult => ({ ok: true, text });

/** A fresh kitchen with a few things in the cupboard, depending on how the person lives. */
export function createKitchen(tier: "lapo" | "middle" | "nepo" | undefined): KitchenState {
  const t = tier ?? "middle";
  const lots: PantryLot[] =
    t === "lapo"
      ? [{ id: "rice", qty: 3, age: 0 }, { id: "noodles", qty: 4, age: 0 }, { id: "oil", qty: 2, age: 0 }, { id: "pepper", qty: 2, age: 0 }, { id: "onion", qty: 2, age: 0 }]
      : t === "middle"
        ? [{ id: "rice", qty: 4, age: 0 }, { id: "beans", qty: 3, age: 0 }, { id: "tomato", qty: 3, age: 0 }, { id: "pepper", qty: 2, age: 0 }, { id: "onion", qty: 2, age: 0 }, { id: "oil", qty: 3, age: 0 }, { id: "egg", qty: 4, age: 0 }, { id: "noodles", qty: 2, age: 0 }]
        : [{ id: "rice", qty: 8, age: 0 }, { id: "beans", qty: 4, age: 0 }, { id: "yam", qty: 4, age: 0 }, { id: "tomato", qty: 6, age: 0 }, { id: "pepper", qty: 4, age: 0 }, { id: "onion", qty: 4, age: 0 }, { id: "oil", qty: 6, age: 0 }, { id: "egg", qty: 8, age: 0 }, { id: "chicken", qty: 4, age: 0 }, { id: "fish", qty: 3, age: 0 }, { id: "bread", qty: 4, age: 0 }];
  return { fridge: t !== "lapo", lots, dishes: [], cooking: null, eating: null };
}

/** Reads a saved kitchen from untrusted data; anything off falls back to the person's starting kitchen. */
export function parseKitchen(raw: unknown, tier: "lapo" | "middle" | "nepo" | undefined): KitchenState {
  const base = createKitchen(tier);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<KitchenState>;
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const lots = Array.isArray(r.lots)
    ? r.lots.filter((l) => l && typeof l.id === "string" && byIngredient.has(l.id)).slice(0, 60).map((l) => ({ id: l.id, qty: Math.floor(num(l.qty, 0, 999, 0)), age: num(l.age, 0, 1e9, 0) })).filter((l) => l.qty > 0)
    : base.lots;
  const dishes = Array.isArray(r.dishes)
    ? r.dishes.filter((d) => d && typeof d.id === "string" && byRecipe.has(d.id)).slice(0, 30).map((d) => ({ id: d.id, qty: Math.floor(num(d.qty, 0, 99, 0)), age: num(d.age, 0, 1e9, 0) })).filter((d) => d.qty > 0)
    : [];
  return {
    fridge: typeof r.fridge === "boolean" ? r.fridge : base.fridge,
    lots,
    dishes,
    cooking: typeof r.cooking === "string" && byRecipe.has(r.cooking) ? r.cooking : null,
    eating: r.eating && typeof r.eating.id === "string" && byRecipe.has(r.eating.id) ? { id: r.eating.id, spoiled: r.eating.spoiled === true } : null,
  };
}

/** How fast things age: 1 on the counter, slower in a fridge, a little slower in a fridge that has lost power. */
export function coldFactor(state: GameState): number {
  if (!state.kitchen.fridge) return 1;
  return wallPower(state) ? 0.25 : 0.6;
}

export const lotSpoiled = (lot: PantryLot, state: GameState): boolean => {
  const ing = byIngredient.get(lot.id);
  return !!ing && lot.age >= ing.shelfLife && (ing.fresh || lot.age >= ing.shelfLife);
};
export const dishSpoiled = (dish: Dish): boolean => dish.age >= DISH_SHELF_LIFE;

/** Ages everything by some minutes. Returns what went off, for the news. */
export function tickKitchen(state: GameState, minutes: number): string[] {
  const k = state.kitchen;
  const f = coldFactor(state);
  const gone: string[] = [];
  for (const lot of k.lots) {
    const ing = byIngredient.get(lot.id);
    if (!ing) continue;
    const before = lot.age;
    // Things that keep well in a cupboard (dry goods, onions, yam) are not helped by the fridge as much.
    lot.age += minutes * (ing.fresh ? f : 1);
    if (before < ing.shelfLife && lot.age >= ing.shelfLife) gone.push(`Your ${ing.name.toLowerCase()} has gone bad.`);
  }
  for (const d of k.dishes) {
    const before = d.age;
    d.age += minutes * f;
    if (before < DISH_SHELF_LIFE && d.age >= DISH_SHELF_LIFE) gone.push(`The ${recipeById(d.id)?.name.toLowerCase() ?? "food"} you cooked has gone bad.`);
  }
  return gone;
}

/** Fraction of its life left, 0 to 1. */
export const lotFresh = (lot: PantryLot): number => Math.max(0, 1 - lot.age / (byIngredient.get(lot.id)?.shelfLife ?? 1));
export const dishFresh = (dish: Dish): number => Math.max(0, 1 - dish.age / DISH_SHELF_LIFE);

const FRIDGE_CELLS = { lapo: 0, middle: 24, nepo: 36 } as const;
/** Servings of an ingredient that fresh lots hold in total. */
export function servings(state: GameState, id: string): number {
  return state.kitchen.lots.filter((l) => l.id === id && !lotSpoiled(l, state)).reduce((n, l) => n + l.qty, 0);
}

export function missingFor(state: GameState, r: Recipe): { id: string; have: number; need: number }[] {
  return Object.entries(r.needs).filter(([id, need]) => servings(state, id) < need).map(([id, need]) => ({ id, have: servings(state, id), need }));
}

/** Buys servings at the shop. The money goes to the ledger's sink; the food joins the kitchen as a fresh lot. */
export function buyIngredient(state: GameState, id: string, qty: number, priceScale = 1): KitchenResult {
  const ing = byIngredient.get(id);
  if (!ing) return fail("The shop doesn't have that.");
  const n = Math.floor(qty);
  if (n < 1 || n > 12) return fail("Pick between 1 and 12.");
  const price = Math.max(1, Math.round(ing.price * n * priceScale));
  const total = state.kitchen.lots.reduce((s, l) => s + l.qty, 0);
  if (total + n > 120) return fail("There's no room to keep all that.");
  const r = transfer(state.ledger, PLAYER, SINK, price, `${ing.name} x${n}`, state.minute);
  if (!r.ok) return fail(`That costs ₦${price.toLocaleString()}. You don't have enough.`);
  state.stats.totalSpent += price;
  const same = state.kitchen.lots.find((l) => l.id === id && l.age < 60 && l.qty < 12);
  if (same) same.qty += n;
  else state.kitchen.lots.push({ id, qty: n, age: 0 });
  return ok(`Bought ${n} ${ing.unit}${n === 1 ? "" : "s"} of ${ing.name.toLowerCase()} for ₦${price.toLocaleString()}.`);
}

/** Takes the ingredients for a recipe out of the kitchen (oldest first) and remembers the choice, ready for the stove. */
export function chooseRecipe(state: GameState, recipeId: string): KitchenResult {
  const r = byRecipe.get(recipeId);
  if (!r) return fail("Nobody knows that recipe.");
  const k = state.kitchen;
  if (k.cooking) return fail("You already have something ready to cook.");
  const miss = missingFor(state, r);
  if (miss.length) {
    const first = miss[0]!;
    return fail(`Not enough ${byIngredient.get(first.id)?.name.toLowerCase() ?? first.id} (${first.have} of ${first.need}).`);
  }
  for (const [id, need] of Object.entries(r.needs)) {
    let left = need;
    const lots = k.lots.filter((l) => l.id === id && !lotSpoiled(l, state)).sort((a, b) => b.age - a.age);
    for (const lot of lots) {
      const take = Math.min(lot.qty, left);
      lot.qty -= take;
      left -= take;
      if (!left) break;
    }
  }
  k.lots = k.lots.filter((l) => l.qty > 0);
  k.cooking = r.id;
  return ok(`Ready to cook ${r.name.toLowerCase()}. Go to the stove.`);
}

/** Puts the ingredients back (if you change your mind before cooking). */
export function cancelRecipe(state: GameState): KitchenResult {
  const k = state.kitchen;
  const r = k.cooking ? byRecipe.get(k.cooking) : null;
  if (!r) return fail("Nothing is waiting to be cooked.");
  for (const [id, need] of Object.entries(r.needs)) k.lots.push({ id, qty: need, age: 0 });
  k.cooking = null;
  return ok("You put the ingredients back.");
}

/** Called when the cooking action ends: the plates are ready. */
export function finishCooking(state: GameState): string | null {
  const k = state.kitchen;
  const r = k.cooking ? byRecipe.get(k.cooking) : null;
  if (!r) return null;
  k.cooking = null;
  const same = k.dishes.find((d) => d.id === r.id && d.age < 30);
  if (same) same.qty += r.plates;
  else k.dishes.push({ id: r.id, qty: r.plates, age: 0 });
  return `${r.name} is ready: ${r.plates} plates.`;
}

/** Takes one plate out, ready to eat at the table. */
export function chooseDish(state: GameState, recipeId: string): KitchenResult {
  const k = state.kitchen;
  const dish = k.dishes.filter((d) => d.id === recipeId).sort((a, b) => b.age - a.age)[0];
  if (!dish) return fail("There's none of that left.");
  if (k.eating) return fail("You already have a plate ready.");
  if (state.needs.hunger >= 92) return fail("You're not hungry.");
  dish.qty -= 1;
  k.eating = { id: dish.id, spoiled: dishSpoiled(dish) };
  k.dishes = k.dishes.filter((d) => d.qty > 0);
  return ok("Your plate is ready. Sit down to eat.");
}

export function discardDish(state: GameState, recipeId: string): KitchenResult {
  const k = state.kitchen;
  const dish = k.dishes.find((d) => d.id === recipeId && dishSpoiled(d)) ?? k.dishes.find((d) => d.id === recipeId);
  if (!dish) return fail("There's none of that.");
  k.dishes = k.dishes.filter((d) => d !== dish);
  return ok("Thrown away.");
}

export function discardLot(state: GameState, id: string): KitchenResult {
  const k = state.kitchen;
  const before = k.lots.length;
  k.lots = k.lots.filter((l) => !(l.id === id && lotSpoiled(l, state)));
  return k.lots.length < before ? ok("Spoiled food thrown away.") : fail("Nothing has gone bad.");
}

export const fridgeSpace = (tier: "lapo" | "middle" | "nepo" | undefined) => FRIDGE_CELLS[tier ?? "middle"];

/** When a meal is finished: the hunger and mood it gives (a bad plate makes you ill instead). */
export function finishEating(state: GameState): { text: string; spoiled: boolean } | null {
  const k = state.kitchen;
  const e = k.eating;
  if (!e) return null;
  k.eating = null;
  const r = byRecipe.get(e.id);
  if (!r) return null;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const n = state.needs;
  if (e.spoiled) {
    n.hunger = clamp(n.hunger + 25);
    n.hygiene = clamp(n.hygiene - 15);
    n.energy = clamp(n.energy - 20);
    n.bladder = clamp(n.bladder - 30);
    n.fun = clamp(n.fun - 10);
    return { text: `The ${r.name.toLowerCase()} had gone bad. Your stomach turns.`, spoiled: true };
  }
  n.hunger = clamp(n.hunger + r.hunger - 65);
  n.fun = clamp(n.fun + r.fun - 5);
  return { text: `That ${r.name.toLowerCase()} was good.`, spoiled: false };
}
