import { useEffect, useState } from "react";
import { defaultServerUrl } from "./connection";

export interface ServerStats {
  online: number;
  accounts: number;
  guests: number;
  inWorld: number;
  atHome: number;
  viewsToday: number;
  playersToday: number;
  viewsTotal: number;
  playersTotal: number;
  peakOnline: number;
  peakAt: number;
  hourly: { hour: string; views: number; peak: number }[];
  daily: { day: string; views: number; players: number; guests: number; accounts: number }[];
  at: number;
}

/** The server's plain-http address (the same host as the game socket). */
export const statsUrl = (): string => defaultServerUrl().replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/$/, "") + "/stats";

/** How many are online (and the visit counts), refreshed every so often. Null until the first answer. */
export function useServerStats(everyMs = 20_000): ServerStats | null {
  const [stats, setStats] = useState<ServerStats | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(statsUrl(), { cache: "no-store" });
        if (r.ok && alive) setStats((await r.json()) as ServerStats);
      } catch {
        /* the server may be asleep; try again next time */
      }
    };
    void load();
    const t = window.setInterval(() => !document.hidden && void load(), everyMs);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [everyMs]);
  return stats;
}
