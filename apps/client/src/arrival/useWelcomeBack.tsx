import { useState, type ReactNode } from "react";
import type { OnlineLife } from "../net/useOnlineLife";
import WelcomeBack from "./WelcomeBack";
import { getPending } from "../play/pendingLife";

/** Once per visit (not each time you move between the street and your house). */
let welcomed = false;
export const markWelcomed = () => {
  welcomed = true;
};

/** The "welcome back" scene for a returning person, or null when it isn't needed (new character, already shown, not loaded yet). */
export function useWelcomeBack(life: OnlineLife, ready = true): { node: ReactNode; showing: boolean } {
  const [, force] = useState(0);
  // A character made a moment ago is about to be created: that person gets the arrival film, not "welcome back".
  if (welcomed || life.justArrived || getPending()) return { node: null, showing: false };
  // Before the connection answers there is no name or time yet: the scene still plays, and fills in once they arrive.
  const s = life.session;
  const hud = s?.snapshot();
  const profile = s?.sim.state.profile;
  const node = (
    <WelcomeBack
      name={profile?.firstName}
      tier={(profile?.tier ?? "middle") as "lapo" | "middle" | "nepo"}
      hour={hud?.hourFloat ?? new Date().getUTCHours() + 1}
      date={hud?.date}
      time={hud?.time}
      awayCount={s?.awaySummary.length ?? 0}
      ready={ready && !!s}
      onDone={() => {
        welcomed = true;
        force((n) => n + 1);
      }}
    />
  );
  return { node, showing: true };
}
