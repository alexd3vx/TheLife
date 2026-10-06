import type { Profile } from "@thelife/game-core";

// The character just made in the creator, waiting to be sent to the server (which keeps the life; nothing about your game is saved
// on this device). It only lives in this tab's memory, long enough to survive a reload while the connection is made.
const KEY = "thelife.pending";
let memory: { profile: Profile; replace: boolean; look?: string } | null = null;

export function setPending(profile: Profile, replace = false, look?: string): void {
  memory = { profile, replace, look };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* the in-memory copy still works */
  }
}

export function getPending(): { profile: Profile; replace: boolean; look?: string } | null {
  if (memory) return memory;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return (memory = JSON.parse(raw) as { profile: Profile; replace: boolean; look?: string });
  } catch {
    /* ignore */
  }
  return null;
}

export function clearPending(): void {
  memory = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

const RESTART = "thelife.restart";
/** "New game" was pressed: the next character made replaces the current life. */
export function markRestart(): void {
  try {
    sessionStorage.setItem(RESTART, "1");
  } catch {
    /* ignore */
  }
}
export function takeRestart(): boolean {
  try {
    const v = sessionStorage.getItem(RESTART) === "1";
    sessionStorage.removeItem(RESTART);
    return v;
  } catch {
    return false;
  }
}
