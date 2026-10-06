import { loadSavedLook } from "../lab/looks";
import { getSettings, updateSettings } from "../settings/settings";
import { playerKey } from "./identity";
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from "@thelife/shared";

export type NetStatus = "offline" | "connecting" | "online";

export interface ConnectionEvents {
  onStatus(status: NetStatus, detail?: string): void;
  onMessage(message: ServerMessage): void;
}

const SERVER_KEY = "thelife.server";
/** The game server everyone plays on (used when nothing else is set). */
export const PUBLIC_SERVER = "wss://46-105-53-216.sslip.io";

/** Where the game server lives: the build-time setting, what the player last typed, or this computer on the local port. */
export function defaultServerUrl(): string {
  const chosen = getSettings().serverUrl;
  if (chosen) return chosen;
  try {
    const saved = localStorage.getItem(SERVER_KEY);
    if (saved) return saved;
  } catch {
    /* storage can be blocked */
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

  constructor(private readonly url: string, private readonly name: string, private readonly events: ConnectionEvents) {
    this.open();
  }

  private open() {
    this.events.onStatus("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.events.onStatus("offline", "That server address doesn't look right.");
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.tries = 0;
      ws.send(JSON.stringify({ t: "hello", name: this.name, protocol: PROTOCOL_VERSION, look: JSON.stringify(loadSavedLook()), key: playerKey() } satisfies ClientMessage));
    };
    ws.onmessage = (e) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(e.data)) as ServerMessage;
      } catch {
        return;
      }
      if (message.t === "welcome") this.events.onStatus("online");
      if (message.t === "error") this.fatal = /out of date|full/.test(message.reason);
      this.events.onMessage(message);
    };
    ws.onclose = (e) => {
      if (this.closed) return;
      if (e.code === 4004) this.fatal = true;
      if (this.fatal) {
        this.events.onStatus("offline", e.code === 4004 ? "Your life is open on another screen. Close that one, then reload." : "The server turned you away.");
        return;
      }
      this.tries++;
      this.events.onStatus("connecting", `Reconnecting (${this.tries})…`);
      this.timer = setTimeout(() => this.open(), Math.min(8000, 700 * 2 ** Math.min(this.tries, 5)));
    };
    ws.onerror = () => ws.close();
  }

  private fatal = false;

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
