// The wire protocol between the game client and the game server. Plain JSON messages; every message from a client is
// validated here before the server looks at it (the server never trusts a client number or string).

/** The gestures a player can show to others nearby. */
export const EMOTES = ["wave", "cheer", "talk"] as const;
/** How far (metres) chat and gestures carry out in the city. */
export const HEARING_RANGE = 90;

export const PROTOCOL_VERSION = 2;
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
  /** The player's own ID: the same every time they play, and what people use to message or find them. */
  uid?: string;
}

export type Where = "home" | "world";

/** The most people shown together inside one place. */
export const MAX_PLACE_PLAYERS = 20;
/** A place's id as it travels on the wire (a landmark id). */
export const PLACE_ID = /^[A-Za-z0-9:_.-]{1,48}$/;

/** A player inside a place: where they stand in the room (the room's own coordinates), not in the city. */
export interface PlaceView {
  id: string;
  name: string;
  look?: string;
  uid?: string;
  x: number;
  z: number;
  yaw: number;
  clip: string;
}
export type RpcArg = string | number | boolean | null;

/** What a player chooses when making a character; everything else comes from the background on the server. */
export interface NewLife {
  backgroundId: string;
  sex: "male" | "female";
  firstName: string;
  surname: string;
  hometown: string;
  startingMoney: number;
  traits: string[];
}

export const KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export type ClientMessage =
  | { t: "hello"; name: string; protocol: number; look?: string; /** The player's private key: it is how the server finds their life again. */ key: string; /** A Supabase access token. When it checks out, the account (not the key) owns the life. */ token?: string; /** Where the player is at first: at home (not seen in the city) or out in the city. Default: the city. */ where?: Where }
  /** Moves the player between home and the city (others only see them while they are in the city). */
  | { t: "place"; where: Where }
  /** Changes how the character looks (wardrobe, hairdresser). */
  | { t: "look"; look: string }
  /** Starts a new life. The server rebuilds the whole profile from the background id, so only these choices are used. */
  | { t: "create"; profile: NewLife; /** How the character looks (a cleaned JSON string). */ look?: string; /** Throw the current life away and start this one instead ("New game"). */ replace?: boolean }
  /** Asks the server to run one game action (a whitelisted function) on this player's life. */
  | { t: "do"; id: number; fn: string; args: RpcArg[] }
  | { t: "move"; x: number; y: number; z: number; yaw: number; clip: string; level: number }
  /** Walks into a place (a bank, a market, a church...) or, with null, back out into the city. Inside, only the others in the same place see you. */
  | { t: "inside"; place: string | null }
  /** Where you stand inside the place you are in (the room's own coordinates). */
  | { t: "pmove"; x: number; z: number; yaw: number; clip: string }
  /** Arrives somewhere by a paid ride (taxi, keke, danfo): the server moves the player there if they just paid for a trip. */
  | { t: "arrive"; x: number; z: number }
  | { t: "chat"; text: string }
  /** A private message to one player by their ID (they get it when they next play if they are away). */
  | { t: "dm"; to: string; text: string }
  /** Looks a player up by ID or phone number (to start a chat with them). */
  | { t: "find"; uid?: string; phone?: string }
  /** A gesture the other players nearby can see (wave, cheer, talk). */
  | { t: "emote"; emote: string }
  | { t: "pay"; to: string; amount: number }
  /** Sends money to a player by their ID: at once when they are online, otherwise it waits for them. */
  | { t: "payto"; uid: string; amount: number }
  | { t: "ping"; ts: number }
  /** Voice call signalling (invite, accept, offer, answer...), passed to the other player; `to` is their player ID or session id. */
  | { t: "rtc"; to: string; data: unknown };

export type ServerMessage =
  | { t: "welcome"; id: string; /** Your own player ID. */ uid?: string; /** Your phone number. */ phone?: string; room: string; protocol: number; money: number; players: PlayerView[]; serverTime: number }
  /** Every private conversation this player has, sent once after they arrive. */
  | { t: "inbox"; threads: { uid: string; name: string; phone?: string; msgs: { from: string; text: string; at: number }[] }[] }
  | { t: "person"; uid: string; name: string; phone?: string }
  | { t: "join"; player: PlayerView }
  | { t: "leave"; id: string }
  /** Everyone who is inside the place you are in, sent when you walk in and whenever somebody comes or goes. */
  | { t: "here"; place: string; players: PlaceView[] }
  /** Where everyone inside your place stands now. */
  | { t: "pstate"; place: string; players: Pick<PlaceView, "id" | "x" | "z" | "yaw" | "clip">[] }
  | { t: "state"; tick: number; serverTime: number; players: Pick<PlayerView, "id" | "x" | "y" | "z" | "yaw" | "clip" | "level">[] }
  | { t: "chat"; from: string; name: string; text: string; at: number; /** Set for a private message: the ID of the player it was sent to. */ to?: string; /** The ID of the sender, for private messages. */ fromUid?: string }
  | { t: "emote"; from: string; emote: string }
  | { t: "money"; balance: number; note: string }
  /** The authoritative state of your life. `ack` is the last `do` id the server has handled; `active` is the action in progress. */
  | { t: "life"; state: unknown; ack: number; active: { id: string; done: number; forced: boolean } | null; events: { kind: "info" | "good" | "warn" | "bad"; text: string; minute: number }[]; away?: string[] }
  /** The answer to one `do`. */
  | { t: "done"; id: number; ok: boolean; text?: string; reason?: string }
  /** Where you live: the front door in the city and where you stand when you step out. */
  | { t: "home"; lotId: string; door: { x: number; z: number }; spawn: { x: number; z: number }; yaw: number; tier: string }
  /** You have no life on this server yet: send `create`. */
  | { t: "needsLife" }
  | { t: "correct"; x: number; y: number; z: number; level: number }
  | { t: "pong"; ts: number; serverTime: number }
  | { t: "rtc"; from: string; /** Who is calling (their player ID and name), set on the first message of a call. */ fromUid?: string; name?: string; data: unknown }
  | { t: "error"; reason: string };

const finite = (v: unknown, limit = 1e6): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;

/** Turns whatever came over the wire into a valid client message, or null. Strings are trimmed and length-limited. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > 8_000) return null;
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
      if (typeof m.key !== "string" || !KEY_PATTERN.test(m.key)) return null;
      return { t: "hello", name, protocol: finite(m.protocol, 1000) ? m.protocol : 0, look: typeof m.look === "string" ? cleanLook(m.look) : undefined, key: m.key, where: m.where === "home" ? "home" : "world", token: typeof m.token === "string" && m.token.length <= 3000 && /^[\w.-]+$/.test(m.token) ? m.token : undefined };
    }
    case "place":
      return { t: "place", where: m.where === "home" ? "home" : "world" };
    case "look": {
      const look = typeof m.look === "string" ? cleanLook(m.look) : undefined;
      return look ? { t: "look", look } : null;
    }
    case "create": {
      const p = m.profile as Record<string, unknown> | null;
      if (!p || typeof p !== "object") return null;
      const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
      const traits = Array.isArray(p.traits) ? p.traits.filter((t): t is string => typeof t === "string" && t.length <= 30).slice(0, 12) : [];
      const firstName = cleanName(text(p.firstName, 40));
      if (!firstName || !finite(p.startingMoney, 1e9)) return null;
      return {
        t: "create",
        replace: m.replace === true,
        look: typeof m.look === "string" ? cleanLook(m.look) : undefined,
        profile: { backgroundId: text(p.backgroundId, 40), sex: p.sex === "female" ? "female" : "male", firstName: firstName.slice(0, 14), surname: cleanName(text(p.surname, 40)).slice(0, 14), hometown: text(p.hometown, 40), startingMoney: Math.round(p.startingMoney), traits },
      };
    }
    case "do": {
      if (!finite(m.id, 1e9) || typeof m.fn !== "string" || !/^[A-Za-z]{1,30}$/.test(m.fn) || !Array.isArray(m.args) || m.args.length > 6) return null;
      const args: RpcArg[] = [];
      for (const a of m.args) {
        if (typeof a === "string") args.push(a.slice(0, 400));
        else if (typeof a === "number" && Number.isFinite(a)) args.push(a);
        else if (typeof a === "boolean" || a === null) args.push(a);
        else return null;
      }
      return { t: "do", id: Math.floor(m.id), fn: m.fn, args };
    }
    case "move":
      if (!finite(m.x) || !finite(m.y, 500) || !finite(m.z) || !finite(m.yaw, 100) || !finite(m.level, 20)) return null;
      return { t: "move", x: m.x, y: m.y, z: m.z, yaw: m.yaw, clip: typeof m.clip === "string" ? m.clip.slice(0, 40) : "Idle_Loop", level: Math.max(0, Math.round(m.level)) };
    case "inside": {
      if (m.place === null) return { t: "inside", place: null };
      return typeof m.place === "string" && PLACE_ID.test(m.place) ? { t: "inside", place: m.place } : null;
    }
    case "pmove":
      if (!finite(m.x, 200) || !finite(m.z, 200) || !finite(m.yaw, 100)) return null;
      return { t: "pmove", x: m.x, z: m.z, yaw: m.yaw, clip: typeof m.clip === "string" ? m.clip.slice(0, 40) : "Idle_Loop" };
    case "arrive":
      if (!finite(m.x) || !finite(m.z)) return null;
      return { t: "arrive", x: m.x, z: m.z };
    case "chat": {
      if (typeof m.text !== "string") return null;
      const text = m.text.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_CHAT);
      return text ? { t: "chat", text } : null;
    }
    case "dm": {
      if (typeof m.to !== "string" || m.to.length > 40 || typeof m.text !== "string") return null;
      const text = m.text.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_CHAT);
      return text ? { t: "dm", to: m.to, text } : null;
    }
    case "find": {
      if (typeof m.phone === "string") {
        const phone = normalisePhone(m.phone);
        return phone ? { t: "find", phone } : null;
      }
      return typeof m.uid === "string" && /^[a-f0-9]{6,16}$/.test(m.uid.trim().toLowerCase()) ? { t: "find", uid: m.uid.trim().toLowerCase() } : null;
    }
    case "emote":
      return typeof m.emote === "string" && (EMOTES as readonly string[]).includes(m.emote) ? { t: "emote", emote: m.emote } : null;
    case "pay":
      if (typeof m.to !== "string" || m.to.length > 40 || !finite(m.amount, 1e9)) return null;
      return { t: "pay", to: m.to, amount: Math.floor(m.amount) };
    case "payto":
      if (typeof m.uid !== "string" || !/^[a-f0-9]{6,16}$/.test(m.uid) || !finite(m.amount, 1e9)) return null;
      return { t: "payto", uid: m.uid, amount: Math.floor(m.amount) };
    case "ping":
      return finite(m.ts, 1e15) ? { t: "ping", ts: m.ts } : null;
    case "rtc":
      if (typeof m.to !== "string" || m.to.length > 40) return null;
      if (JSON.stringify(m.data ?? null).length > 5_500) return null;
      return { t: "rtc", to: m.to, data: m.data ?? null };
    default:
      return null;
  }
}

const LOOK_KEYS = ["body", "skinTone", "hair", "hairColor", "beard", "brows", "eyeColor", "top", "bottom", "shoes", "hood", "pauldrons", "outfitVariant", "topColor", "bottomColor", "shoesColor", "topFabric", "bottomFabric", "accessory", "accessoryColor"];
const LOOK_NUMBERS = ["height", "build"];

/** A character's look from a client: only the known fields, only short ids, booleans or null. Anything else is dropped. */
export function cleanLook(raw: string): string | undefined {
  if (raw.length > 4_000) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const out: Record<string, string | boolean | number | null> = {};
  for (const key of LOOK_KEYS) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === "boolean" || v === null) out[key] = v;
    else if (typeof v === "string" && /^[\w-]{1,30}$/.test(v)) out[key] = v;
  }
  for (const key of LOOK_NUMBERS) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = Math.round(Math.max(0.8, Math.min(1.25, v)) * 100) / 100;
  }
  const shape = cleanShape((value as Record<string, unknown>).shape);
  const result: Record<string, unknown> = { ...out };
  if (shape) result.shape = shape;
  return Object.keys(result).length ? JSON.stringify(result) : undefined;
}

const SHAPE_RANGES: Record<string, [number, number]> = { sex: [0, 1], age: [18, 70], muscle: [-1, 1], weight: [-1, 1], height: [-1, 1], proportions: [-1, 1], european: [0, 1], eastAsian: [0, 1], bust: [-1, 1] };

/** A body shape: the known numbers inside their ranges, and up to 100 face and body sliders (short ids, -1 to 1). */
function cleanShape(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, [lo, hi]] of Object.entries(SHAPE_RANGES)) {
    const v = src[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = Math.round(Math.max(lo, Math.min(hi, v)) * 100) / 100;
  }
  const detail: Record<string, number> = {};
  if (src.detail && typeof src.detail === "object") {
    for (const [id, v] of Object.entries(src.detail as Record<string, unknown>).slice(0, 100)) {
      if (/^[a-z][a-z0-9_]{0,23}$/.test(id) && typeof v === "number" && Number.isFinite(v)) detail[id] = Math.round(Math.max(-1, Math.min(1, v)) * 100) / 100;
    }
  }
  out.detail = detail;
  return out;
}

/** A display name: letters, digits, spaces and a few marks, 1 to 20 characters. */
export function cleanName(name: string): string {
  return name.replace(/[^\p{L}\p{N} _.'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}

// ---- phone numbers
/** In-game numbers are all "0990" to "0999" followed by seven digits: clearly not real Nigerian numbers, so nobody's real phone is ever dialled by accident. */
export const PHONE_PATTERN = /^099\d{8}$/;

/** What someone typed ("0990 123 4567", "+234 990 123 4567", "990-123-4567") as a plain in-game number, or null if it is not one. */
export function normalisePhone(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+234")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("234") && digits.length === 13) digits = `0${digits.slice(3)}`;
  else if (/^99\d{8}$/.test(digits)) digits = `0${digits}`;
  return PHONE_PATTERN.test(digits) ? digits : null;
}

/** "0990 123 4567" */
export function formatPhone(phone: string): string {
  return phone.length === 11 ? `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}` : phone;
}
