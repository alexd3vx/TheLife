import type { Look } from "../lab/looks";

const KEY = "thelife.creator.looks.v1";
export const MAX_SAVED = 8;

export interface SavedLook {
  id: string;
  /** When it was saved (ms). */
  t: number;
  /** A small picture of the person, a data URL. */
  img: string | null;
  look: Look;
}

type Store = Pick<Storage, "getItem" | "setItem">;
const store = (): Store | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export function loadSavedLooks(s: Store | null = store()): SavedLook[] {
  try {
    const raw = s?.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as SavedLook[];
    return Array.isArray(list) ? list.filter((e) => e && typeof e.id === "string" && e.look && typeof e.look === "object").slice(0, MAX_SAVED) : [];
  } catch {
    return [];
  }
}

function write(list: SavedLook[], s: Store | null): boolean {
  try {
    if (!s) return false;
    s.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Newest first. When the shelf is full the oldest look is dropped. */
export function addSavedLook(look: Look, img: string | null, s: Store | null = store(), now = Date.now()): SavedLook[] {
  const entry: SavedLook = { id: `${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, t: now, img, look };
  const list = [entry, ...loadSavedLooks(s)].slice(0, MAX_SAVED);
  write(list, s);
  return list;
}

export function removeSavedLook(id: string, s: Store | null = store()): SavedLook[] {
  const list = loadSavedLooks(s).filter((e) => e.id !== id);
  write(list, s);
  return list;
}
