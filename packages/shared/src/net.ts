// The wire protocol between the game client and the game server. Plain JSON messages; every message from a client is
// validated here before the server looks at it (the server never trusts a client number or string).

export const PROTOCOL_VERSION = 1;
export const MAX_NAME = 20;
export const MAX_CHAT = 200;
export const MAX_ROOM_PLAYERS = 50;

export interface PlayerView {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  clip: string;
  level: number;
  /** How the character looks (a cleaned JSON string, see `cleanLook`). */
  look?: string;
}

export type ClientMessage =
  | { t: "hello"; name: string; protocol: number; look?: string }
  | { t: "move"; x: number; y: number; z: number; yaw: number; clip: string; level: number }
  | { t: "chat"; text: string }
  | { t: "pay"; to: string; amount: number }
  | { t: "ping"; ts: number }
  /** WebRTC signalling for voice, passed to another player untouched. */
  | { t: "rtc"; to: string; data: unknown };

export type ServerMessage =
  | { t: "welcome"; id: string; room: string; protocol: number; money: number; players: PlayerView[]; serverTime: number }
  | { t: "join"; player: PlayerView }
  | { t: "leave"; id: string }
  | { t: "state"; tick: number; serverTime: number; players: Pick<PlayerView, "id" | "x" | "y" | "z" | "yaw" | "clip" | "level">[] }
  | { t: "chat"; from: string; name: string; text: string; at: number }
  | { t: "money"; balance: number; note: string }
  | { t: "correct"; x: number; y: number; z: number; level: number }
  | { t: "pong"; ts: number; serverTime: number }
  | { t: "rtc"; from: string; data: unknown }
  | { t: "error"; reason: string };

const finite = (v: unknown, limit = 1e6): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;

/** Turns whatever came over the wire into a valid client message, or null. Strings are trimmed and length-limited. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > 4_000) return null;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const m = value as Record<string, unknown>;
  switch (m.t) {
    case "hello": {
      const name = typeof m.name === "string" ? cleanName(m.name) : "";
      if (!name) return null;
      return { t: "hello", name, protocol: finite(m.protocol, 1000) ? m.protocol : 0, look: typeof m.look === "string" ? cleanLook(m.look) : undefined };
    }
    case "move":
      if (!finite(m.x) || !finite(m.y, 500) || !finite(m.z) || !finite(m.yaw, 100) || !finite(m.level, 20)) return null;
      return { t: "move", x: m.x, y: m.y, z: m.z, yaw: m.yaw, clip: typeof m.clip === "string" ? m.clip.slice(0, 40) : "Idle_Loop", level: Math.max(0, Math.round(m.level)) };
    case "chat": {
      if (typeof m.text !== "string") return null;
      const text = m.text.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_CHAT);
      return text ? { t: "chat", text } : null;
    }
    case "pay":
      if (typeof m.to !== "string" || m.to.length > 40 || !finite(m.amount, 1e9)) return null;
      return { t: "pay", to: m.to, amount: Math.floor(m.amount) };
    case "ping":
      return finite(m.ts, 1e15) ? { t: "ping", ts: m.ts } : null;
    case "rtc":
      if (typeof m.to !== "string" || m.to.length > 40) return null;
      if (JSON.stringify(m.data ?? null).length > 3_000) return null;
      return { t: "rtc", to: m.to, data: m.data ?? null };
    default:
      return null;
  }
}

const LOOK_KEYS = ["body", "skinTone", "hair", "hairColor", "beard", "brows", "eyeColor", "top", "bottom", "shoes", "hood", "pauldrons", "outfitVariant", "topColor", "bottomColor", "shoesColor", "topFabric", "bottomFabric"];

/** A character's look from a client: only the known fields, only short ids, booleans or null. Anything else is dropped. */
export function cleanLook(raw: string): string | undefined {
  if (raw.length > 1_200) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const out: Record<string, string | boolean | null> = {};
  for (const key of LOOK_KEYS) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === "boolean" || v === null) out[key] = v;
    else if (typeof v === "string" && /^[\w-]{1,30}$/.test(v)) out[key] = v;
  }
  return Object.keys(out).length ? JSON.stringify(out) : undefined;
}

/** A display name: letters, digits, spaces and a few marks, 1 to 20 characters. */
export function cleanName(name: string): string {
  return name.replace(/[^\p{L}\p{N} _.'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}
