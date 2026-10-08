/**
 * Parts of the game that are not built yet. A locked part stays visible but cannot be opened: it says "coming soon" instead of
 * showing something half-made. To lock another one, add its id here; to open it, delete the line. A developer opens everything on their
 * own device with `localStorage.setItem("thelife.unlock", "1")` in the browser console.
 */
export const LOCKED_FEATURES: Record<string, { title: string; note: string }> = {
  gram: { title: "LifeGram", note: "LifeGram, the photo feed, is being built." },
  chirp: { title: "Chirp", note: "Chirp, the short-post feed, is being built." },
};

function unlocked(): boolean {
  try {
    return window.localStorage.getItem("thelife.unlock") === "1";
  } catch {
    return false;
  }
}

export function isLocked(id: string): boolean {
  return id in LOCKED_FEATURES && !unlocked();
}

export function lockNote(id: string): string {
  return LOCKED_FEATURES[id]?.note ?? "This is coming soon.";
}
