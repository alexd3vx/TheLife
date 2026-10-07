import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Visit counts for the game, with nothing personal in them: keys are hashed and only counts and short hashes are kept. */

interface Day {
  views: number;
  accounts: number;
  guests: number;
  /** Short hashes of the players seen that day, so a returning player counts once. */
  seen: string[];
}
interface Saved {
  days: Record<string, Day>;
  /** The highest number online in each hour ("2026-10-07T14"). */
  hours: Record<string, { peak: number; views: number }>;
  totalViews: number;
  everSeen: string[];
  peak: { online: number; at: number };
}

const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const hourOf = (t: number) => new Date(t).toISOString().slice(0, 13);
const hash = (key: string) => createHash("sha1").update(key).digest("hex").slice(0, 10);

export class Analytics {
  private data: Saved = { days: {}, hours: {}, totalViews: 0, everSeen: [], peak: { online: 0, at: 0 } };
  private dirty = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly online = new Map<string, { kind: "account" | "guest"; where: "home" | "world" }>();

  constructor(private readonly file: string | null) {
    if (file && existsSync(file)) {
      try {
        this.data = { ...this.data, ...(JSON.parse(readFileSync(file, "utf8")) as Saved) };
      } catch {
        /* a damaged file starts the counts again */
      }
    }
    if (file) this.timer = setInterval(() => this.save(), 60_000);
  }

  /** Someone opened the game and got in. */
  visit(id: string, key: string, kind: "account" | "guest", where: "home" | "world", now = Date.now()): void {
    const d = (this.data.days[dayOf(now)] ??= { views: 0, accounts: 0, guests: 0, seen: [] });
    const h = hash(key);
    d.views++;
    if (kind === "account") d.accounts++;
    else d.guests++;
    if (!d.seen.includes(h)) d.seen.push(h);
    if (!this.data.everSeen.includes(h)) this.data.everSeen.push(h);
    this.data.totalViews++;
    const hour = (this.data.hours[hourOf(now)] ??= { peak: 0, views: 0 });
    hour.views++;
    this.online.set(id, { kind, where });
    this.notePeak(now);
    this.dirty = true;
  }

  move(id: string, where: "home" | "world"): void {
    const o = this.online.get(id);
    if (o) o.where = where;
  }

  leave(id: string): void {
    this.online.delete(id);
  }

  private notePeak(now: number): void {
    const n = this.online.size;
    const hour = (this.data.hours[hourOf(now)] ??= { peak: 0, views: 0 });
    if (n > hour.peak) hour.peak = n;
    if (n > this.data.peak.online) this.data.peak = { online: n, at: now };
  }

  /** What the stats page shows. */
  report(now = Date.now()) {
    this.notePeak(now);
    let accounts = 0, guests = 0, inWorld = 0;
    for (const o of this.online.values()) {
      if (o.kind === "account") accounts++;
      else guests++;
      if (o.where === "world") inWorld++;
    }
    const today = this.data.days[dayOf(now)] ?? { views: 0, accounts: 0, guests: 0, seen: [] };
    const hourly = [];
    for (let i = 23; i >= 0; i--) {
      const t = now - i * 3_600_000;
      const h = this.data.hours[hourOf(t)];
      hourly.push({ hour: hourOf(t), views: h?.views ?? 0, peak: h?.peak ?? 0 });
    }
    const daily = [];
    for (let i = 13; i >= 0; i--) {
      const t = now - i * 86_400_000;
      const d = this.data.days[dayOf(t)];
      daily.push({ day: dayOf(t), views: d?.views ?? 0, players: d?.seen.length ?? 0, guests: d?.guests ?? 0, accounts: d?.accounts ?? 0 });
    }
    return {
      online: this.online.size,
      accounts,
      guests,
      inWorld,
      atHome: this.online.size - inWorld,
      viewsToday: today.views,
      playersToday: today.seen.length,
      viewsTotal: this.data.totalViews,
      playersTotal: this.data.everSeen.length,
      peakOnline: this.data.peak.online,
      peakAt: this.data.peak.at,
      hourly,
      daily,
      at: now,
    };
  }

  save(): void {
    if (!this.file || !this.dirty) return;
    this.dirty = false;
    // keep the file small: two weeks of days, two days of hours
    const keepDays = Object.keys(this.data.days).sort().slice(-60);
    this.data.days = Object.fromEntries(keepDays.map((k) => [k, this.data.days[k]!]));
    const keepHours = Object.keys(this.data.hours).sort().slice(-72);
    this.data.hours = Object.fromEntries(keepHours.map((k) => [k, this.data.hours[k]!]));
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(`${this.file}.tmp`, JSON.stringify(this.data));
      renameSync(`${this.file}.tmp`, this.file);
    } catch (e) {
      console.error("analytics save failed", e);
    }
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.save();
  }
}
