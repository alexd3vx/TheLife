import { useSyncExternalStore } from "react";
import type { PlayerView, ServerMessage } from "@thelife/shared";
import { world } from "./world";

export interface Line {
  id: number;
  /** Who said it: a player ID for private messages, the connection id for nearby chat. */
  from: string;
  name: string;
  text: string;
  at: number;
  mine: boolean;
}
export interface Thread {
  uid: string;
  name: string;
  lines: Line[];
  unread: number;
}

/**
 * Everything social the server says, kept while the game is open: your private conversations (the server keeps them for you, so they
 * wait while you are away), who is out in the city, and what was said nearby. LifeChat on the phone shows it. Every player has an ID;
 * give yours to a friend and they can find you.
 */
class Social {
  selfId = "";
  selfUid = "";
  threads = new Map<string, Thread>();
  people = new Map<string, PlayerView>();
  nearby: Line[] = [];
  nearbyUnread = 0;
  /** The conversation on screen, so what arrives in it is not counted as unread. */
  open: string | "nearby" | null = null;
  lastError = "";
  /** A conversation the next time LifeChat opens (set when you tap Message on a player). */
  pendingThread: string | null = null;
  version = 0;
  private started = false;
  private n = 0;
  private readonly listeners = new Set<() => void>();

  start(): void {
    if (this.started) return;
    this.started = true;
    world.onMessage((m) => this.on(m));
    if (world.lastWelcome) this.on(world.lastWelcome);
  }

  get unread(): number {
    let t = this.nearbyUnread;
    for (const th of this.threads.values()) t += th.unread;
    return t;
  }

  private thread(uid: string, name?: string): Thread {
    let t = this.threads.get(uid);
    if (!t) {
      t = { uid, name: name ?? this.peopleName(uid) ?? "Player", lines: [], unread: 0 };
      this.threads.set(uid, t);
    } else if (name) t.name = name;
    return t;
  }

  peopleName(uid: string): string | undefined {
    for (const p of this.people.values()) if (p.uid === uid) return p.name;
    return this.threads.get(uid)?.name;
  }

  private on(m: ServerMessage): void {
    switch (m.t) {
      case "welcome":
        this.selfId = m.id;
        this.selfUid = m.uid ?? "";
        this.people = new Map(m.players.map((p) => [p.id, p]));
        for (const p of m.players) if (p.uid && this.threads.has(p.uid)) this.threads.get(p.uid)!.name = p.name;
        break;
      case "inbox":
        for (const t of m.threads) {
          const th = this.thread(t.uid, t.name);
          th.lines = t.msgs.map((x) => ({ id: this.n++, from: x.from, name: x.from === this.selfUid ? "You" : t.name, text: x.text, at: x.at, mine: x.from === this.selfUid }));
          // what came while you were away counts as unread
          th.unread = t.msgs.filter((x) => x.from !== this.selfUid).length > 0 && th.lines.at(-1)?.mine === false ? 1 : 0;
        }
        break;
      case "person":
        this.thread(m.uid, m.name);
        this.lastError = "";
        break;
      case "join":
        this.people.set(m.player.id, m.player);
        if (m.player.uid && this.threads.has(m.player.uid)) this.threads.get(m.player.uid)!.name = m.player.name;
        break;
      case "leave":
        this.people.delete(m.id);
        break;
      case "chat": {
        const mine = m.from === this.selfId;
        if (m.to) {
          const peer = mine ? m.to : (m.fromUid ?? "");
          if (!peer) return;
          const th = this.thread(peer, mine ? undefined : m.name);
          th.lines.push({ id: this.n++, from: mine ? this.selfUid : peer, name: mine ? "You" : m.name, text: m.text, at: m.at, mine });
          if (th.lines.length > 100) th.lines.shift();
          if (!mine && this.open !== peer) th.unread++;
        } else {
          this.nearby.push({ id: this.n++, from: m.from, name: m.name, text: m.text, at: m.at, mine });
          if (this.nearby.length > 200) this.nearby.shift();
          if (!mine && this.open !== "nearby") this.nearbyUnread++;
        }
        break;
      }
      case "error":
        if (/player with that ID|own ID|typing too fast|Nobody is near/.test(m.reason)) this.lastError = m.reason;
        else return;
        break;
      default:
        return;
    }
    this.changed();
  }

  private changed(): void {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  /** Says which conversation is on screen (and marks it read). */
  setOpen(which: string | "nearby" | null): void {
    this.open = which;
    if (which === "nearby") this.nearbyUnread = 0;
    else if (which) {
      const t = this.threads.get(which);
      if (t) t.unread = 0;
    }
    this.changed();
  }

  /** Starts (or finds) a conversation with a player on screen; the chat app opens it. */
  startWith(uid: string, name: string): void {
    this.thread(uid, name);
    this.pendingThread = uid;
    this.changed();
  }

  say(text: string): void {
    world.send({ t: "chat", text });
  }
  dm(uid: string, text: string): void {
    this.lastError = "";
    world.send({ t: "dm", to: uid, text });
  }
  find(uid: string): void {
    this.lastError = "";
    world.send({ t: "find", uid: uid.trim().toLowerCase() });
  }
}

export const social = new Social();

/** Re-renders when anything social changes. */
export function useSocial(): Social {
  social.start();
  useSyncExternalStore(social.subscribe, () => social.version);
  return social;
}
