import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The animation editor's published work: which clip each game move uses (a small map) and the clips people imported (stored as the
 * browser's own clip JSON). Everyone's game reads them on start; only an admin account can change them.
 */
export interface SlotSetting {
  clip: string;
  speed?: number;
  loop?: boolean;
  hold?: number | null;
  trim?: [number, number] | null;
}
export type AnimMap = Record<string, SlotSetting>;

const NAME = /^[A-Za-z0-9_-]{1,48}$/;
export const validName = (n: string) => NAME.test(n);

export function cleanMap(input: unknown): AnimMap | null {
  if (!input || typeof input !== "object") return null;
  const out: AnimMap = {};
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > 120) return null;
  for (const [slot, raw] of entries) {
    if (!NAME.test(slot) || !raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.clip !== "string" || r.clip.length > 80) return null;
    const s: SlotSetting = { clip: r.clip };
    if (typeof r.speed === "number" && Number.isFinite(r.speed)) s.speed = Math.min(4, Math.max(0.1, r.speed));
    if (typeof r.loop === "boolean") s.loop = r.loop;
    if (typeof r.hold === "number" && Number.isFinite(r.hold) && r.hold >= 0) s.hold = Math.min(600, r.hold);
    if (Array.isArray(r.trim) && r.trim.length === 2 && r.trim.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0)) s.trim = [r.trim[0] as number, r.trim[1] as number];
    out[slot] = s;
  }
  return out;
}

export class AnimStore {
  private map: AnimMap = {};
  private clips = new Map<string, string>();

  constructor(private readonly dir: string | null) {
    if (!dir) return;
    try {
      mkdirSync(join(dir, "clips"), { recursive: true });
      const mapFile = join(dir, "map.json");
      if (existsSync(mapFile)) this.map = cleanMap(JSON.parse(readFileSync(mapFile, "utf8"))) ?? {};
      for (const f of readdirSync(join(dir, "clips"))) if (f.endsWith(".json")) this.clips.set(f.slice(0, -5), readFileSync(join(dir, "clips", f), "utf8"));
    } catch (e) {
      console.error("animation store failed to load", e);
    }
  }

  getMap(): AnimMap {
    return this.map;
  }
  putMap(map: AnimMap): void {
    this.map = map;
    this.write("map.json", JSON.stringify(map));
  }
  names(): string[] {
    return [...this.clips.keys()];
  }
  getClip(name: string): string | undefined {
    return this.clips.get(name);
  }
  putClip(name: string, json: string): boolean {
    if (!NAME.test(name) || json.length > 1_500_000) return false;
    try {
      const parsed = JSON.parse(json) as { tracks?: unknown };
      if (!Array.isArray(parsed.tracks) || parsed.tracks.length > 300) return false;
    } catch {
      return false;
    }
    if (!this.clips.has(name) && this.clips.size >= 200) return false;
    this.clips.set(name, json);
    this.write(`clips/${name}.json`, json);
    return true;
  }
  deleteClip(name: string): void {
    this.clips.delete(name);
  }

  private write(rel: string, text: string): void {
    if (!this.dir) return;
    try {
      const file = join(this.dir, rel);
      writeFileSync(`${file}.tmp`, text);
      renameSync(`${file}.tmp`, file);
    } catch (e) {
      console.error("animation store save failed", e);
    }
  }
}
