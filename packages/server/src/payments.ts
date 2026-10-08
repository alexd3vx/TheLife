import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface PendingPayment {
  from: string;
  amount: number;
  at: number;
}

/**
 * Money sent to a player who is not online: the sender has already paid, and it waits here (kept in a small file, apart from the lives)
 * until the receiver next plays, when it is added to their life. Pass `null` for a memory-only store (tests).
 */
export class Payments {
  private data: Record<string, PendingPayment[]> = {};
  private dirty = false;

  constructor(private readonly file: string | null) {
    if (file && existsSync(file)) {
      try {
        const parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, PendingPayment[]>;
        if (parsed && typeof parsed === "object") this.data = parsed;
      } catch {
        /* a damaged file starts empty */
      }
    }
  }

  queue(uid: string, p: PendingPayment): void {
    (this.data[uid] ??= []).push(p);
    this.dirty = true;
    this.flush();
  }

  /** Everything waiting for this player; it is removed once taken. */
  take(uid: string): PendingPayment[] {
    const list = this.data[uid] ?? [];
    if (list.length) {
      delete this.data[uid];
      this.dirty = true;
      this.flush();
    }
    return list;
  }

  flush(): void {
    if (!this.file || !this.dirty) return;
    this.dirty = false;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(`${this.file}.tmp`, JSON.stringify(this.data));
      renameSync(`${this.file}.tmp`, this.file);
    } catch (e) {
      this.dirty = true;
      console.error("payments save failed", e);
    }
  }
}
