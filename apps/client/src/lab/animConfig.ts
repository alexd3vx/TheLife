import * as THREE from "three";
import { serverHttpBase } from "../net/useServerStats";

/**
 * Which clip each game move uses, as published from the animation editor (#/anim): a small map from a move ("Life_Cook_Loop") to a clip
 * and a few settings, plus the clips people imported. The game reads it from the server when it starts; the editor can also try a
 * draft on this device before publishing.
 */
export interface SlotSetting {
  /** A library clip ("XB_walk", "KK_Work_A") or an imported one ("custom:stir"). */
  clip: string;
  speed?: number;
  loop?: boolean;
  /** Freeze on this moment (seconds) instead of playing. */
  hold?: number | null;
  /** Only this part of the clip (seconds). */
  trim?: [number, number] | null;
}

const DRAFT_KEY = "thelife.anim.draft";

class AnimConfig {
  slots: Record<string, SlotSetting> = {};
  custom = new Map<string, THREE.AnimationClip>();
  /** Goes up whenever something changed, so cached clips made from the old settings are remade. */
  version = 0;
  private loading: Promise<void> | null = null;

  /** Fetches the published map and the clips it uses (once). Never throws: with no answer the game uses its built-in moves. */
  load(): Promise<void> {
    this.loading ??= (async () => {
      try {
        const ctl = new AbortController();
        const timer = window.setTimeout(() => ctl.abort(), 3500);
        const res = await fetch(`${serverHttpBase()}/anim/map`, { signal: ctl.signal, cache: "no-store" });
        window.clearTimeout(timer);
        if (!res.ok) return;
        const body = (await res.json()) as { slots?: Record<string, SlotSetting>; clips?: string[] };
        this.slots = body.slots ?? {};
        const wanted = new Set<string>();
        for (const s of Object.values(this.slots)) if (s.clip.startsWith("custom:")) wanted.add(s.clip.slice(7));
        await Promise.all([...wanted].map((n) => this.fetchClip(n)));
        this.version++;
      } catch {
        /* offline or the server is old: built-in moves */
      }
    })();
    return this.loading;
  }

  async fetchClip(name: string): Promise<THREE.AnimationClip | null> {
    try {
      const res = await fetch(`${serverHttpBase()}/anim/clip/${encodeURIComponent(name)}`, { cache: "no-store" });
      if (!res.ok) return null;
      const clip = THREE.AnimationClip.parse(await res.json());
      this.custom.set(name, clip);
      return clip;
    } catch {
      return null;
    }
  }

  /** The editor's unpublished choices, kept on this device and used by the game here (admins and test builds only). */
  readDraft(): Record<string, SlotSetting> | null {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? (JSON.parse(raw) as Record<string, SlotSetting>) : null;
    } catch {
      return null;
    }
  }
  setSlots(slots: Record<string, SlotSetting>, draft = false): void {
    this.slots = slots;
    this.version++;
    if (draft) {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(slots));
      } catch {
        /* storage blocked */
      }
    }
  }
  addCustom(name: string, clip: THREE.AnimationClip): void {
    this.custom.set(name, clip);
    this.version++;
  }
}

export const animConfig = new AnimConfig();

/** A clip made from another by a slot's settings (trim, speed, hold). */
export function derive(base: THREE.AnimationClip, name: string, s: SlotSetting): THREE.AnimationClip {
  let tracks = base.tracks.map((t) => t.clone());
  let duration = base.duration;
  if (s.trim && s.trim[1] > s.trim[0]) {
    const [a, b] = s.trim;
    tracks = tracks.map((t) => {
      const times: number[] = [], values: number[] = [];
      const n = t.getValueSize();
      t.times.forEach((time, i) => {
        if (time < a - 1e-4 || time > b + 1e-4) return;
        times.push(time - a);
        for (let k = 0; k < n; k++) values.push(t.values[i * n + k]!);
      });
      if (times.length === 0) {
        // nothing keyed inside the window: hold the value at its start
        times.push(0);
        const v = t.createInterpolant().evaluate(a);
        for (let k = 0; k < n; k++) values.push(v[k]!);
      }
      return new (t.constructor as new (n: string, ti: number[], v: number[]) => THREE.KeyframeTrack)(t.name, times, values);
    });
    duration = Math.min(b, duration) - a;
  }
  if (s.hold !== undefined && s.hold !== null) {
    const at = Math.min(s.hold, duration);
    tracks = tracks.map((t) => {
      const v = Array.from(t.createInterpolant().evaluate(at) as ArrayLike<number>);
      return new (t.constructor as new (n: string, ti: number[], v: number[]) => THREE.KeyframeTrack)(t.name, [0, 1], [...v, ...v]);
    });
    return new THREE.AnimationClip(name, 1, tracks);
  }
  if (s.speed && s.speed !== 1) {
    const k = 1 / s.speed;
    for (const t of tracks) for (let i = 0; i < t.times.length; i++) t.times[i] = t.times[i]! * k;
    duration *= k;
  }
  return new THREE.AnimationClip(name, Math.max(0.05, duration), tracks);
}
