import type { ClientMessage, RpcArg, ServerMessage } from "@thelife/shared";
import { getPending } from "../play/pendingLife";
import { Connection, defaultServerUrl, type NetStatus } from "./connection";

type Listener = (m: ServerMessage) => void;

/**
 * The one connection to the game server, shared by the world, the phone and the online panel. Your life lives on the server;
 * this only carries messages. `connect()` is safe to call again and again.
 */
class World {
  status: NetStatus = "offline";
  detail = "";
  /** The newest welcome, so panels that open later still know who is here. */
  lastWelcome: Extract<ServerMessage, { t: "welcome" }> | null = null;
  /** At home, or out in the city. Others only see you in the city. */
  private where: "home" | "world" = "world";
  private conn: Connection | null = null;
  private seq = 0;
  private readonly listeners = new Set<Listener>();
  private readonly statusListeners = new Set<() => void>();

  connect(): void {
    if (this.conn) return;
    const p = getPending()?.profile;
    const name = p ? `${p.firstName} ${p.surname}`.trim() : "Player";
    this.conn = new Connection(defaultServerUrl(), name || "Player", {
      onStatus: (s, d) => {
        this.status = s;
        this.detail = d ?? "";
        this.statusListeners.forEach((l) => l());
      },
      onMessage: (m) => {
        if (m.t === "welcome") this.lastWelcome = m;
        this.listeners.forEach((l) => l(m));
      },
    }, () => this.where);
  }

  /** Say where you are now (the next connection will say it too). */
  setPlace(where: "home" | "world"): void {
    this.where = where;
    this.conn?.send({ t: "place", where });
  }

  disconnect(): void {
    this.conn?.close();
    this.conn = null;
    this.lastWelcome = null;
    this.seq = 0;
  }

  /** Lets the player try again after the line dropped for good. */
  reconnect(): void {
    this.disconnect();
    this.connect();
  }

  send(m: ClientMessage): void {
    this.conn?.send(m);
  }

  /** Sends a game action; returns its id (see `lastSentId`). */
  rpc(fn: string, args: RpcArg[]): number {
    const id = ++this.seq;
    this.conn?.send({ t: "do", id, fn, args });
    return id;
  }

  onMessage(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  onStatus(l: () => void): () => void {
    this.statusListeners.add(l);
    return () => this.statusListeners.delete(l);
  }
}

export const world = new World();
