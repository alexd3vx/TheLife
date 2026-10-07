import { useSyncExternalStore } from "react";
import type { PlayerView, ServerMessage } from "@thelife/shared";
import { world } from "./world";

export interface SocialLine {
  id: number;
  from: string;
  name: string;
  text: string;
  at: number;
  /** Set for a private message: who it went to. */
  to?: string;
  mine: boolean;
}

/**
 * Everything social that the server says, kept as long as the game is open: who is in the city, what was said nearby and the private
 * messages. The phone's Social app shows it; the street shows the same words in bubbles.
 */
class Social {
  lines: SocialLine[] = [];
  people = new Map<string, PlayerView>();
  /** Names of players we have talked to, even after they left. */
  known = new Map<string, string>();
  unread = 0;
  selfId = "";
  version = 0;
  private started = false;
  private n = 0;
  private readonly listeners = new Set<() => void>();
  /** Whether the Social app is on screen right now (then nothing counts as unread). */
  viewing = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    world.onMessage((m) => this.on(m));
    if (world.lastWelcome) this.on(world.lastWelcome);
  }

  private on(m: ServerMessage): void {
    switch (m.t) {
      case "welcome":
        this.selfId = m.id;
        this.people = new Map(m.players.map((p) => [p.id, p]));
        for (const p of m.players) this.known.set(p.id, p.name);
        break;
      case "join":
        this.people.set(m.player.id, m.player);
        this.known.set(m.player.id, m.player.name);
        break;
      case "leave":
        this.people.delete(m.id);
        break;
      case "chat": {
        const mine = m.from === this.selfId;
        this.lines.push({ id: this.n++, from: m.from, name: m.name, text: m.text, at: m.at, to: m.to, mine });
        if (this.lines.length > 300) this.lines.shift();
        if (!mine && !this.viewing) this.unread++;
        this.known.set(m.from, m.name);
        break;
      }
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

  markRead(): void {
    if (this.unread === 0) return;
    this.unread = 0;
    this.changed();
  }

  setViewing(on: boolean): void {
    this.viewing = on;
    if (on) this.markRead();
  }

  say(text: string, to?: string): void {
    world.send(to ? { t: "dm", to, text } : { t: "chat", text });
  }
}

export const social = new Social();

/** Re-renders when anything social changes. */
export function useSocial(): Social {
  social.start();
  useSyncExternalStore(social.subscribe, () => social.version);
  return social;
}
