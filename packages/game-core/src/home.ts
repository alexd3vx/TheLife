import { furnitureById } from "./catalog";
import { MINT, PLAYER, SINK, transfer } from "./ledger";
import type { GameState } from "./types";

// Home editing: moving furniture, selling it and buying more. The house's starting layout lives in the client; what the player
// changed is kept here (with the life, on the server) as a short list of changes on top of it. The server checks the money and the
// shape of every change; the client checks that the spot is free and inside the walls.

export interface HomeChanges {
  /** Starting furniture the player moved: id -> where it is now. */
  moved: Record<string, { x: number; z: number; rot: number }>;
  /** Starting furniture the player sold. */
  removed: string[];
  /** Furniture the player bought. */
  added: { id: string; furniture: string; x: number; z: number; rot: number }[];
  nextId: number;
  /** The front door is locked: nobody who visits can come in until the owner opens it. */
  locked?: boolean;
}

export const emptyHome = (): HomeChanges => ({ moved: {}, removed: [], added: [], nextId: 1 });

const MAX_ADDED = 60;
const MAX_MOVED = 200;
/** Selling gives back this share of the price: a bought item most of it, a starting one only a little (it is the landlord's). */
const REFUND_BOUGHT = 0.6;
const REFUND_STARTING = 0.25;

export type HomeResultLike = { ok: true; text: string } | { ok: false; reason: string };
type HomeResult = HomeResultLike;
const fail = (reason: string): HomeResult => ({ ok: false, reason });

const finite = (n: unknown, lim: number): n is number => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= lim;
const turn = (rot: number): number => ((Math.round(rot / 90) * 90) % 360 + 360) % 360;

/** Reads saved changes from untrusted JSON, dropping anything odd. */
export function parseHome(raw: unknown): HomeChanges {
  const out = emptyHome();
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Partial<HomeChanges>;
  if (r.moved && typeof r.moved === "object") {
    for (const [id, v] of Object.entries(r.moved).slice(0, MAX_MOVED)) {
      const m = v as { x?: unknown; z?: unknown; rot?: unknown };
      if (id.length <= 40 && finite(m?.x, 40) && finite(m?.z, 40)) out.moved[id] = { x: m.x, z: m.z, rot: turn(typeof m.rot === "number" ? m.rot : 0) };
    }
  }
  if (Array.isArray(r.removed)) out.removed = r.removed.filter((s): s is string => typeof s === "string" && s.length <= 40).slice(0, MAX_MOVED);
  if (Array.isArray(r.added)) {
    for (const a of r.added.slice(0, MAX_ADDED)) {
      if (a && typeof a.id === "string" && a.id.length <= 20 && typeof a.furniture === "string" && furnitureById(a.furniture) && finite(a.x, 40) && finite(a.z, 40)) {
        out.added.push({ id: a.id, furniture: a.furniture, x: a.x, z: a.z, rot: turn(typeof a.rot === "number" ? a.rot : 0) });
      }
    }
  }
  if (r.locked === true) out.locked = true;
  out.nextId = typeof r.nextId === "number" && Number.isInteger(r.nextId) && r.nextId > 0 ? r.nextId : out.added.length + 1;
  return out;
}

/** Moves or turns a piece of furniture (a starting one or one you bought). */
export function homeMove(state: GameState, id: string, x: number, z: number, rot: number): HomeResult {
  if (!id || id.length > 40 || !finite(x, 40) || !finite(z, 40) || !finite(rot, 720)) return fail("That didn't look right.");
  const h = (state.home ??= emptyHome());
  const bought = h.added.find((a) => a.id === id);
  if (bought) {
    bought.x = x;
    bought.z = z;
    bought.rot = turn(rot);
    return { ok: true, text: "Moved." };
  }
  if (h.removed.includes(id)) return fail("You sold that.");
  if (!(id in h.moved) && Object.keys(h.moved).length >= MAX_MOVED) return fail("That's a lot of rearranging for one house.");
  h.moved[id] = { x, z, rot: turn(rot) };
  return { ok: true, text: "Moved." };
}

/** Sells a piece of furniture back to the shop. `startingFurniture` is the furniture id of a starting piece (the client knows it). */
export function homeSell(state: GameState, id: string, startingFurniture?: string): HomeResult {
  if (!id || id.length > 40) return fail("That didn't look right.");
  const h = (state.home ??= emptyHome());
  const bought = h.added.findIndex((a) => a.id === id);
  let price = 0;
  let share = REFUND_STARTING;
  if (bought >= 0) {
    price = furnitureById(h.added[bought]!.furniture)?.price ?? 0;
    share = REFUND_BOUGHT;
    h.added.splice(bought, 1);
  } else {
    if (h.removed.includes(id)) return fail("You already sold that.");
    if (typeof startingFurniture !== "string" || !furnitureById(startingFurniture)) return fail("The shop doesn't buy that.");
    if (h.removed.length >= MAX_MOVED) return fail("There is nothing left to sell.");
    price = furnitureById(startingFurniture)!.price;
    h.removed.push(id);
    delete h.moved[id];
  }
  const back = Math.floor(price * share);
  if (back > 0) {
    // the shop pays the player (less than it charged, so buying and selling again always loses money)
    const r = transfer(state.ledger, MINT, PLAYER, back, "Sold furniture", state.minute);
    if (!r.ok) return { ok: true, text: "Sold." };
  }
  return { ok: true, text: back > 0 ? `Sold for ₦${back.toLocaleString()}.` : "Sold." };
}

/** Buys a new piece of furniture and puts it where you chose. */
export function homeBuy(state: GameState, furniture: string, x: number, z: number, rot: number): HomeResult {
  const def = furnitureById(furniture);
  if (!def) return fail("The shop doesn't have that.");
  if (!finite(x, 40) || !finite(z, 40) || !finite(rot, 720)) return fail("That didn't look right.");
  const h = (state.home ??= emptyHome());
  if (h.added.length >= MAX_ADDED) return fail("There's no room in the house for more.");
  const r = transfer(state.ledger, PLAYER, SINK, def.price, def.name, state.minute);
  if (!r.ok) return fail(`That costs ₦${def.price.toLocaleString()}. You don't have enough.`);
  state.stats.totalSpent += def.price;
  h.added.push({ id: `n${h.nextId++}`, furniture, x, z, rot: turn(rot) });
  return { ok: true, text: `Bought the ${def.name.toLowerCase()} for ₦${def.price.toLocaleString()}.` };
}

/** Locks or unlocks the front door. While it is locked, people who come to visit wait outside until you let them in. */
export function homeLock(state: GameState, locked: boolean): HomeResult {
  if (typeof locked !== "boolean") return fail("That didn't look right.");
  const h = (state.home ??= emptyHome());
  if (locked) h.locked = true;
  else delete h.locked;
  return { ok: true, text: locked ? "Door locked. Visitors will have to wait outside." : "Door unlocked." };
}

/** Can a visitor walk straight in? Only when the door is unlocked, or the owner has let them in. */
export function visitorMayEnter(owner: GameState, letIn: boolean): boolean {
  return !owner.home?.locked || letIn;
}
