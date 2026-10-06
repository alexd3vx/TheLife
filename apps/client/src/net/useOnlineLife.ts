import { useEffect, useState } from "react";
import { GameSession, type LifeSnapshot } from "../play/gameSession";
import { clearPending, getPending } from "../play/pendingLife";
import { setChargeChecker, setTransport } from "../phone/remote";
import type { NetStatus } from "./connection";
import { world } from "./world";

export type LifePhase = "connecting" | "creating" | "ready" | "offline";

export interface OnlineLife {
  /** True once, right after this player's character was made: time for the arrival film. */
  justArrived: boolean;
  phase: LifePhase;
  session: GameSession | null;
  detail: string;
}

/**
 * Connects to the game server and returns your life once the server has sent it. If the server has no life for this browser yet,
 * the character you made in the creator is sent to it (the server rebuilds the profile itself and only takes your choices).
 */
export function useOnlineLife(where: "home" | "world" = "world"): OnlineLife {
  const [state, setState] = useState<OnlineLife>({ justArrived: false, phase: "connecting", session: null, detail: "" });

  useEffect(() => {
    let session: GameSession | null = null;
    let replaceSent = false;
    let createdWithLook = false;
    let lastSnap: LifeSnapshot | null = null;
    let fallback: ReturnType<typeof setTimeout> | null = null;
    // The server could not (or did not) start the new life: carry on with the life it already has rather than waiting forever.
    const useExisting = () => {
      if (session || !lastSnap) return;
      clearPending();
      session = new GameSession(false, lastSnap);
      setTransport((fn, args) => world.rpc(fn, args));
      set({ phase: "ready", session, detail: "" });
    };
    const set = (patch: Partial<OnlineLife>) => setState((s) => ({ ...s, ...patch }));
    const offMessage = world.onMessage((m) => {
      if (m.t === "needsLife") {
        const pending = getPending();
        const p = pending?.profile;
        if (!p) {
          window.location.hash = "#/create";
          return;
        }
        world.send({ t: "create", profile: { backgroundId: p.backgroundId, sex: p.sex, firstName: p.firstName, surname: p.surname, hometown: p.hometown, startingMoney: p.startingMoney, traits: p.traits }, replace: pending?.replace === true, ...(pending?.look ? { look: pending.look } : {}) });
        createdWithLook = !!pending?.look;
        set({ phase: "creating", justArrived: true });
      } else if (m.t === "life") {
        const snap = m as unknown as LifeSnapshot;
        lastSnap = snap;
        if (fallback) clearTimeout(fallback);
        // "New game" on an account that already has a life: the character just made replaces it. The server answers with the new
        // life, and that is the one this page starts from.
        const waiting = getPending();
        if (!session && waiting?.replace && !replaceSent) {
          replaceSent = true;
          const p = waiting.profile;
          world.send({ t: "create", profile: { backgroundId: p.backgroundId, sex: p.sex, firstName: p.firstName, surname: p.surname, hometown: p.hometown, startingMoney: p.startingMoney, traits: p.traits }, replace: true, ...(waiting.look ? { look: waiting.look } : {}) });
          set({ phase: "creating", justArrived: true });
          fallback = setTimeout(useExisting, 10000);
          return;
        }
        clearPending();
        if (!session) {
          session = new GameSession(false, snap);
          setTransport((fn, args) => world.rpc(fn, args));
          set({ phase: "ready", session, detail: "" });
        } else session.applyLife(snap);
      } else if (m.t === "done" && !m.ok) {
        session?.notice(m.reason ?? "That didn't work.");
      } else if (m.t === "error" && !session) {
        if (replaceSent && lastSnap) useExisting();
        else if (createdWithLook && getPending()) {
          // An older server that doesn't understand the look: make the life without it (it falls back to the default look).
          createdWithLook = false;
          const p = getPending()!.profile;
          world.send({ t: "create", profile: { backgroundId: p.backgroundId, sex: p.sex, firstName: p.firstName, surname: p.surname, hometown: p.hometown, startingMoney: p.startingMoney, traits: p.traits } });
        } else set({ detail: m.reason });
      }
    });
    const offStatus = world.onStatus(() => {
      const st: NetStatus = world.status;
      if (st === "offline" && !session) set({ phase: "offline", detail: world.detail });
      else if (st === "connecting" && !session) set({ phase: "connecting", detail: world.detail });
      else if (session && st !== "online") session.notice(st === "offline" ? world.detail || "You lost the connection." : "Reconnecting…");
    });
    if (where === "home") setChargeChecker(() => "home");
    world.setPlace(where);
    world.connect();
    return () => {
      if (fallback) clearTimeout(fallback);
      offMessage();
      offStatus();
      setTransport(null);
      setChargeChecker(null);
      world.disconnect();
    };
  }, [where]);

  return state;
}
