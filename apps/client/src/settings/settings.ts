import { DEFAULT_KEYS, DEFAULT_TOUCH, type GameAction, type KeyMap, type TouchId, type TouchSpot } from "../controls/bindings";
import { useSyncExternalStore } from "react";

// Player settings: graphics, display, controls, online. Saved on this device; the game reads them live.

export type Preset = "recommended" | "low" | "medium" | "high" | "ultra" | "custom";
export type ShadowQuality = "off" | "low" | "medium" | "high";
export type TextureStyle = "cartoon" | "realistic";

export interface Settings {
  preset: Preset;
  // graphics
  /** Highest pixel ratio the game draws at (1 = one pixel per screen pixel). */
  resolution: number;
  /** Lower the resolution and shadow updates by themselves when the frame rate drops. */
  autoAdjust: boolean;
  /** 0 = as fast as the screen allows. */
  fpsCap: 0 | 30 | 45 | 60;
  shadows: ShadowQuality;
  /** How far from the player shadows reach, 0.5 to 1.5 times normal. */
  shadowDistance: number;
  antialias: boolean;
  bloom: boolean;
  bloomStrength: number;
  /** How many lights are active at once indoors. */
  lights: 1 | 2 | 4 | 8;
  /** How far the world is drawn, 0.5 to 1.2 times normal. */
  drawDistance: number;
  /** Share of the street crowd that is shown, 0 to 100. */
  crowd: number;
  textureStyle: TextureStyle;
  // display
  showFps: boolean;
  showStats: boolean;
  nameTags: boolean;
  /** How the home is shown: walking about inside it in 3D, or looking down on it (isometric). */
  homeView: "3d" | "iso";
  // controls
  cameraSpeed: number;
  /** Tap the ground to walk there (as well as the stick and keys). */
  tapToWalk: boolean;
  keys: KeyMap;
  /** Touch controls: shown on touch screens ("auto"), always, or never. */
  touchControls: "auto" | "on" | "off";
  touchOpacity: number;
  touch: Record<TouchId, TouchSpot>;
  haptics: boolean;
  invertLook: boolean;
  // online
  serverUrl: string;
}

export const PRESET_LABEL: Record<Preset, string> = { recommended: "Recommended", low: "Low", medium: "Medium", high: "High", ultra: "Ultra", custom: "Custom" };

type GraphicsKeys = "resolution" | "autoAdjust" | "fpsCap" | "shadows" | "shadowDistance" | "antialias" | "bloom" | "bloomStrength" | "lights" | "drawDistance" | "crowd";

const GRAPHICS: Record<Exclude<Preset, "recommended" | "custom">, Pick<Settings, GraphicsKeys>> = {
  low: { resolution: 1, autoAdjust: true, fpsCap: 30, shadows: "off", shadowDistance: 0.7, antialias: false, bloom: false, bloomStrength: 0.4, lights: 1, drawDistance: 0.6, crowd: 30 },
  medium: { resolution: 2, autoAdjust: true, fpsCap: 60, shadows: "low", shadowDistance: 1, antialias: false, bloom: false, bloomStrength: 0.5, lights: 2, drawDistance: 0.85, crowd: 60 },
  high: { resolution: 2.5, autoAdjust: true, fpsCap: 0, shadows: "medium", shadowDistance: 1, antialias: true, bloom: true, bloomStrength: 0.5, lights: 4, drawDistance: 1, crowd: 100 },
  ultra: { resolution: 3, autoAdjust: false, fpsCap: 0, shadows: "high", shadowDistance: 1.3, antialias: true, bloom: true, bloomStrength: 0.7, lights: 8, drawDistance: 1.2, crowd: 100 },
};

/** The best preset for this device: phones and weak computers get less, strong computers more. */
export function recommendedPreset(): Exclude<Preset, "recommended" | "custom"> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4;
  const phone = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  // (the picture is flat painted art, light to draw: a phone only needs the low preset if it is really weak, and it should look sharp)
  if (phone) return memory <= 2 || cores <= 4 ? "low" : "medium";
  if (cores >= 12 && memory >= 8) return "high";
  return cores >= 6 ? "medium" : "low";
}

const KEY = "thelife.settings.v1";

export function defaultSettings(): Settings {
  const base = GRAPHICS[recommendedPreset()];
  return { preset: "recommended", ...base, textureStyle: "realistic", showFps: true, showStats: false, nameTags: true, homeView: "3d", cameraSpeed: 1, tapToWalk: true, keys: structuredClone(DEFAULT_KEYS), touchControls: "auto", touchOpacity: 0.7, touch: structuredClone(DEFAULT_TOUCH), haptics: true, invertLook: false, serverUrl: "" };
}

function clamp(v: unknown, lo: number, hi: number, d: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
}

function parseKeys(raw: unknown, d: KeyMap): KeyMap {
  const out = structuredClone(d);
  if (!raw || typeof raw !== "object") return out;
  for (const id of Object.keys(d) as GameAction[]) {
    const v = (raw as Record<string, unknown>)[id];
    if (Array.isArray(v) && v.length > 0) out[id] = v.filter((k): k is string => typeof k === "string" && /^[A-Za-z0-9]{1,20}$/.test(k)).slice(0, 3);
    if (out[id].length === 0) out[id] = d[id];
  }
  return out;
}

function parseTouch(raw: unknown, d: Record<TouchId, TouchSpot>): Record<TouchId, TouchSpot> {
  const out = structuredClone(d);
  if (!raw || typeof raw !== "object") return out;
  for (const id of Object.keys(d) as TouchId[]) {
    const v = (raw as Record<string, Partial<TouchSpot>>)[id];
    if (!v || typeof v !== "object") continue;
    out[id] = { x: clamp(v.x, 0.04, 0.96, d[id].x), y: clamp(v.y, 0.06, 0.94, d[id].y), s: clamp(v.s, 0.6, 1.8, d[id].s), ...(v.hidden === true ? { hidden: true } : d[id].hidden && v.hidden !== false ? { hidden: true } : {}) };
  }
  return out;
}

function parse(raw: unknown): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<Settings>;
  const pick = <T extends string | number>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
  return {
    preset: pick(r.preset, ["recommended", "low", "medium", "high", "ultra", "custom"] as const, d.preset),
    resolution: clamp(r.resolution, 0.5, 3, d.resolution),
    autoAdjust: typeof r.autoAdjust === "boolean" ? r.autoAdjust : d.autoAdjust,
    fpsCap: pick(r.fpsCap, [0, 30, 45, 60] as const, d.fpsCap),
    shadows: pick(r.shadows, ["off", "low", "medium", "high"] as const, d.shadows),
    shadowDistance: clamp(r.shadowDistance, 0.5, 1.5, d.shadowDistance),
    antialias: typeof r.antialias === "boolean" ? r.antialias : d.antialias,
    bloom: typeof r.bloom === "boolean" ? r.bloom : d.bloom,
    bloomStrength: clamp(r.bloomStrength, 0, 1.5, d.bloomStrength),
    lights: pick(r.lights, [1, 2, 4, 8] as const, d.lights),
    drawDistance: clamp(r.drawDistance, 0.5, 1.2, d.drawDistance),
    crowd: clamp(r.crowd, 0, 100, d.crowd),
    textureStyle: pick(r.textureStyle, ["cartoon", "realistic"] as const, d.textureStyle),
    showFps: typeof r.showFps === "boolean" ? r.showFps : d.showFps,
    showStats: typeof r.showStats === "boolean" ? r.showStats : d.showStats,
    nameTags: typeof r.nameTags === "boolean" ? r.nameTags : d.nameTags,
    homeView: pick(r.homeView, ["3d", "iso"] as const, d.homeView),
    cameraSpeed: clamp(r.cameraSpeed, 0.4, 2, d.cameraSpeed),
    tapToWalk: typeof r.tapToWalk === "boolean" ? r.tapToWalk : d.tapToWalk,
    keys: parseKeys(r.keys, d.keys),
    touchControls: pick(r.touchControls, ["auto", "on", "off"] as const, d.touchControls),
    touchOpacity: clamp(r.touchOpacity, 0.25, 1, d.touchOpacity),
    touch: parseTouch(r.touch, d.touch),
    haptics: typeof r.haptics === "boolean" ? r.haptics : d.haptics,
    invertLook: typeof r.invertLook === "boolean" ? r.invertLook : d.invertLook,
    serverUrl: typeof r.serverUrl === "string" ? r.serverUrl.slice(0, 200) : d.serverUrl,
  };
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = parse(JSON.parse(raw));
      // "Recommended" follows the device: recompute it every time rather than keeping an old guess.
      return s.preset === "recommended" ? { ...s, ...GRAPHICS[recommendedPreset()] } : s;
    }
  } catch {
    // storage blocked: use defaults
  }
  return defaultSettings();
}

let current = load();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

function commit(next: Settings) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  for (const l of listeners) l();
}

/** Changes one or more settings. Touching any graphics option makes the preset "Custom". */
export function updateSettings(patch: Partial<Settings>): void {
  const touchesGraphics = Object.keys(patch).some((k) => k in GRAPHICS.low);
  commit({ ...current, ...patch, preset: patch.preset ?? (touchesGraphics ? "custom" : current.preset) });
}

export function applyPreset(preset: Preset): void {
  if (preset === "custom") return updateSettings({ preset: "custom" });
  const source = preset === "recommended" ? recommendedPreset() : preset;
  commit({ ...current, ...GRAPHICS[source], preset });
}

export function subscribeSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings, getSettings);
}

export function shadowMapSize(q: ShadowQuality): number {
  return q === "high" ? 2048 : q === "medium" ? 1024 : q === "low" ? 512 : 256;
}
