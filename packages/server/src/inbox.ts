import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { RemoteInbox } from "./supabaseInbox.js";

/** A player's ID: stable for the same account or device key, short enough to share, and not the key itself. */
export const uidOf = (key: string): string => createHash("sha1").update(`thelife:${key}`).digest("hex").slice(0, 10);

export interface Msg {
  from: string;
  text: string;
  at: number;
}
interface Saved {
  users: Record<string, { name: string; seen: number; phone?: string }>;
  /** uid -> (peer uid -> messages) */
  threads: Record<string, Record<string, Msg[]>>;
}

const KEEP = 80;

/**
 * Private messages and the directory of players, kept on the server so a message waits for someone who is away, and a player can be
 * found by their ID. Nothing here is public: you only ever see your own conversations and the name of a player whose ID you know.
 */
export class Inbox {
  private data: Saved = { users: {}, threads: {} };
  /** phone number -> player ID */
  private readonly phones = new Map<string, string>();
  private dirty = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Resolves when the database copy (if there is one) has been read. */
  readonly ready: Promise<void>;

  constructor(private readonly file: string | null, private readonly remote?: RemoteInbox) {
    this.ready = remote ? this.loadRemote(remote) : Promise.resolve();
    if (file && existsSync(file)) {
      try {
        const parsed = JSON.parse(readFileSync(file, "utf8")) as Saved;
        if (parsed && typeof parsed === "object") this.data = { users: parsed.users ?? {}, threads: parsed.threads ?? {} };
      } catch {
        /* a damaged file starts the inbox again */
      }
    }
    this.indexPhones();
    if (file && !remote) this.timer = setInterval(() => this.save(), 30_000);
  }

  private indexPhones(): void {
    this.phones.clear();
    for (const [uid, u] of Object.entries(this.data.users)) if (u.phone) this.phones.set(u.phone, uid);
  }

  /**
   * The phone number of a player: the same one every time. It starts from a number worked out from their ID (so a number rarely moves if
   * the directory is lost) and moves on to the next free one if somebody already has it.
   */
  phoneOf(uid: string): string | null {
    const u = this.data.users[uid];
    if (!u) return null;
    if (u.phone) return u.phone;
    const h = createHash("sha1").update(`thelife:phone:${uid}`).digest();
    let n = (h.readUInt32BE(0) % 100_000_000);
    for (let i = 0; i < 100_000_000; i++, n = (n + 1) % 100_000_000) {
      const phone = `099${String(n).padStart(8, "0")}`;
      if (this.phones.has(phone)) continue;
      u.phone = phone;
      this.phones.set(phone, uid);
      this.dirty = true;
      return phone;
    }
    return null;
  }

  uidOfPhone(phone: string): string | null {
    return this.phones.get(phone) ?? null;
  }

  private async loadRemote(remote: RemoteInbox): Promise<void> {
    const { users, messages } = await remote.load();
    for (const u of users) {
      this.data.users[u.uid] ??= { name: u.name, seen: u.seen, phone: u.phone };
      if (u.phone && !this.data.users[u.uid]!.phone) this.data.users[u.uid]!.phone = u.phone;
    }
    this.indexPhones();
    // the database is the truth: rebuild the conversations from its messages
    this.data.threads = {};
    for (const m of messages) {
      for (const [owner, peer] of [[m.from, m.to], [m.to, m.from]] as const) {
        const t = ((this.data.threads[owner] ??= {})[peer] ??= []);
        t.push({ from: m.from, text: m.text, at: m.at });
        if (t.length > KEEP) t.splice(0, t.length - KEEP);
      }
    }
  }

  touch(uid: string, name: string, now: number): void {
    const u = this.data.users[uid];
    if (!u || u.name !== name || now - u.seen > 3_600_000 || !u.phone) {
      this.data.users[uid] = { name, seen: now, phone: u?.phone };
      const phone = this.phoneOf(uid);
      this.dirty = true;
      this.remote?.saveUser(uid, name, now, phone ?? undefined);
    }
  }

  nameOf(uid: string): string | null {
    return this.data.users[uid]?.name ?? null;
  }

  /** Stores a message in both people's conversations. */
  send(from: string, to: string, text: string, at: number): void {
    for (const [owner, peer] of [[from, to], [to, from]] as const) {
      const t = ((this.data.threads[owner] ??= {})[peer] ??= []);
      t.push({ from, text, at });
      if (t.length > KEEP) t.splice(0, t.length - KEEP);
    }
    this.dirty = true;
    this.remote?.saveMessage({ from, to, text, at });
  }

  /** Makes sure a conversation exists (an empty one), so a player you looked up stays in your list. */
  open(owner: string, peer: string): void {
    const t = (this.data.threads[owner] ??= {});
    if (!t[peer]) {
      t[peer] = [];
      this.dirty = true;
    }
  }

  inbox(uid: string): { uid: string; name: string; phone?: string; msgs: Msg[] }[] {
    return Object.entries(this.data.threads[uid] ?? {})
      .map(([peer, msgs]) => ({ uid: peer, name: this.nameOf(peer) ?? "Player", phone: this.data.users[peer]?.phone, msgs }))
      .sort((a, b) => (b.msgs.at(-1)?.at ?? 0) - (a.msgs.at(-1)?.at ?? 0));
  }

  save(): void {
    if (!this.file || !this.dirty || this.remote) return;
    this.dirty = false;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(`${this.file}.tmp`, JSON.stringify(this.data));
      renameSync(`${this.file}.tmp`, this.file);
    } catch (e) {
      console.error("inbox save failed", e);
    }
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.save();
  }
}
