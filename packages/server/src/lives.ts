import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseGameState, type GameState } from "@thelife/game-core";

export interface LifeRecord {
  state: GameState;
  /** Wall-clock time of the last save, used to work out "while you were away". */
  savedAt: number;
}

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/**
 * Where lives are kept between visits: one JSON file (atomic writes, so a crash never leaves half a file). Keys are hashed, so the
 * file never contains the secret that unlocks a life. Pass `null` for an in-memory store (tests).
 */
export class LifeStore {
  private readonly lives = new Map<string, LifeRecord>();
  private dirty = false;

  constructor(private readonly file: string | null) {
    if (file && existsSync(file)) {
      try {
        const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, { state: unknown; savedAt: unknown }>;
        for (const [id, rec] of Object.entries(raw)) {
          const state = parseGameState(rec.state);
          if (state && typeof rec.savedAt === "number") this.lives.set(id, { state, savedAt: rec.savedAt });
        }
      } catch (e) {
        console.error("Could not read the saved lives:", e);
      }
    }
  }

  get size(): number {
    return this.lives.size;
  }

  get(key: string): LifeRecord | undefined {
    return this.lives.get(hashKey(key));
  }

  set(key: string, record: LifeRecord): void {
    this.lives.set(hashKey(key), record);
    this.dirty = true;
  }

  /** Writes to disk if anything changed. */
  flush(): void {
    if (!this.file || !this.dirty) return;
    this.dirty = false;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const out: Record<string, LifeRecord> = Object.fromEntries(this.lives);
      writeFileSync(`${this.file}.tmp`, JSON.stringify(out));
      renameSync(`${this.file}.tmp`, this.file);
    } catch (e) {
      this.dirty = true;
      console.error("Could not save the lives:", e);
    }
  }
}
