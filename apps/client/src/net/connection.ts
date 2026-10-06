import { DEFAULT_LOOK } from "../lab/looks";
import { getSettings, updateSettings } from "../settings/settings";
import { playerKey } from "./identity";
import { getToken } from "./tokenBridge";
import { isAdmin } from "../ui/admin";
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from "@thelife/shared";

export type NetStatus = "offline" | "connecting" | "online";

export interface ConnectionEvents {
  onStatus(status: NetStatus, detail?: string): void;
  onMessage(message: ServerMessage): void;
}

const SERVER_KEY = "thelife.server";
/** The game server everyone plays on (used when nothing else is set). */
export const PUBLIC_SERVER = "wss://46-105-53-216.sslip.io";

/**
 * Where the game server lives. Players always use the built-in address (set at build time with VITE_SERVER_URL, or the public one), so
 * nobody can end up stuck on a wrong address. Only an admin (or a dev build) can point the game at another server, in Settings.
 */
export function defaultServerUrl(): string {
  if (import.meta.env.DEV || isAdmin()) {
    const chosen = getSettings().serverUrl;
    if (chosen) return chosen;
    try {
      const saved = localStorage.getItem(SERVER_KEY);
      if (saved) return saved;
    } catch {
      /* storage can be blocked */
    }
  }
  const built = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (built) return built;
  if (!import.meta.env.DEV) return PUBLIC_SERVER;
  const host = location.hostname || "localhost";
  return `${location.protocol === "https:" ? "wss" : "ws"}://${host}:8787`;
}

export function rememberServerUrl(url: string): void {
  updateSettings({ serverUrl: url });
  try {
    localStorage.setItem(SERVER_KEY, url);
  } catch {
    /* storage can be blocked */
  }
}

/** A WebSocket to the game server that says hello, tells the page what happens, and quietly retries if the line drops. */
export class Connection {
  private ws: WebSocket | null = null;
  private tries = 0;
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly url: string, private readonly name: string, private readonly events: ConnectionEvents, private readonly where: () => "home" | "world" = () => "world") {
    this.open();
  }

  private open() {
    this.events.onStatus("connecting");
    void this.connectNow();
  }

  private async connectNow() {
    this.trace = "asking for your login…";
    const token = await getToken(); // a fresh one each time, so reconnecting after a long while still works
    if (this.closed) return;
    this.trace = `login ${token ? "found" : "MISSING"}, opening the line…`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.events.onStatus("offline", "That server address doesn't look right.");
      return;
    }
    this.ws = ws;
    // A line that neither opens nor fails would leave the game "connecting" forever: give up on it and try again.
    const stall = setTimeout(() => ws.readyState === WebSocket.CONNECTING && ws.close(), 20000);
    ws.addEventListener("close", () => clearTimeout(stall));
    ws.onopen = () => {
      this.tries = 0;
      this.trace = `login ${token ? "found" : "MISSING"}, line open, waiting for the server…`;
      ws.send(JSON.stringify({ t: "hello", name: this.name, protocol: PROTOCOL_VERSION, look: JSON.stringify(DEFAULT_LOOK), key: playerKey(), where: this.where(), ...(token ? { token } : {}) } satisfies ClientMessage));
    };
    ws.onmessage = (e) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(e.data)) as ServerMessage;
      } catch {
        return;
      }
      if (message.t === "welcome") this.events.onStatus("online");
      if (message.t === "error") {
        this.lastReason = message.reason;
        this.fatal = /out of date|full/.test(message.reason);
      }
      this.events.onMessage(message);
    };
    ws.onclose = (e) => {
      this.trace = `login ${token ? "found" : "MISSING"}, line closed (code ${e.code}${this.lastReason ? `, "${this.lastReason}"` : ""})`;
      if (this.closed) return;
      if (e.code === 4004) this.fatal = true;
      if (this.fatal) {
        this.events.onStatus("offline", e.code === 4004 ? "Your life is open on another screen. Close that one, then reload." : "The server turned you away.");
        return;
      }
      this.tries++;
      // A login problem won't fix itself by knocking again: say so after a couple of tries instead of looping quietly.
      if (this.lastReason && /log in|login/i.test(this.lastReason) && this.tries >= 2) {
        this.events.onStatus("offline", `${this.lastReason} (Sign out from the menu and sign in again.)`);
        return;
      }
      this.events.onStatus("connecting", this.lastReason ? `${this.lastReason} Retrying (${this.tries})…` : `Reconnecting (${this.tries})…`);
      this.timer = setTimeout(() => this.open(), Math.min(8000, 700 * 2 ** Math.min(this.tries, 5)));
    };
    ws.onerror = () => ws.close();
  }

  /** What the connection is doing, in words, for the screen that shows when it can't finish. */
  trace = "";
  private fatal = false;
  private lastReason = "";

  get online(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.timer);
    this.ws?.close();
    this.events.onStatus("offline");
  }
}
