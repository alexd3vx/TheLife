import { useEffect, useState } from "react";
import { GameSession, savedProfile, type LifeSnapshot } from "../play/gameSession";
import { setTransport } from "../phone/remote";
import type { NetStatus } from "./connection";
import { world } from "./world";

export type LifePhase = "connecting" | "creating" | "ready" | "offline";

export interface OnlineLife {
  phase: LifePhase;
  session: GameSession | null;
  detail: string;
}

/**
 * Connects to the game server and returns your life once the server has sent it. If the server has no life for this browser yet,
 * the character you made in the creator is sent to it (the server rebuilds the profile itself and only takes your choices).
 */
export function useOnlineLife(where: "home" | "world" = "world"): OnlineLife {
  const [state, setState] = useState<OnlineLife>({ phase: "connecting", session: null, detail: "" });

  useEffect(() => {
    let session: GameSession | null = null;
    const set = (patch: Partial<OnlineLife>) => setState((s) => ({ ...s, ...patch }));
    const offMessage = world.onMessage((m) => {
      if (m.t === "needsLife") {
        const p = savedProfile();
        if (!p) {
          window.location.hash = "#/create";
          return;
        }
        world.send({ t: "create", profile: { backgroundId: p.backgroundId, sex: p.sex, firstName: p.firstName, surname: p.surname, hometown: p.hometown, startingMoney: p.startingMoney, traits: p.traits } });
        set({ phase: "creating" });
      } else if (m.t === "life") {
        const snap = m as unknown as LifeSnapshot;
        if (!session) {
          session = new GameSession(false, snap);
          setTransport((fn, args) => world.rpc(fn, args));
          set({ phase: "ready", session, detail: "" });
        } else session.applyLife(snap);
      } else if (m.t === "done" && !m.ok) {
        session?.notice(m.reason ?? "That didn't work.");
      } else if (m.t === "error" && !session) {
        set({ detail: m.reason });
      }
    });
    const offStatus = world.onStatus(() => {
      const st: NetStatus = world.status;
      if (st === "offline" && !session) set({ phase: "offline", detail: world.detail });
      else if (st === "connecting" && !session) set({ phase: "connecting", detail: world.detail });
      else if (session && st !== "online") session.notice(st === "offline" ? world.detail || "You lost the connection." : "Reconnecting…");
    });
    world.setPlace(where);
    world.connect();
    return () => {
      offMessage();
      offStatus();
      setTransport(null);
      world.disconnect();
    };
  }, [where]);

  return state;
}
