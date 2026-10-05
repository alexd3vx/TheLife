// Offline-first save stored on this device. The shape is versioned so older
// saves can be migrated when the game grows.
export interface GameSave {
  version: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
}

const SAVE_KEY = "thelife.save.v1";

export function loadSave(): GameSave | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GameSave>;
    if (parsed.version !== 1 || typeof parsed.id !== "string") return null;
    return parsed as GameSave;
  } catch {
    return null;
  }
}

function writeSave(save: GameSave): GameSave {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be full or blocked (private mode); the game still runs, just unsaved.
  }
  return save;
}

export function createSave(): GameSave {
  const now = new Date().toISOString();
  return writeSave({ version: 1, id: crypto.randomUUID(), createdAt: now, updatedAt: now });
}

export function touchSave(save: GameSave): GameSave {
  return writeSave({ ...save, updatedAt: new Date().toISOString() });
}

export function deleteSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
