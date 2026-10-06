import { useState, type ReactNode } from "react";
import type { OnlineLife } from "../net/useOnlineLife";
import WelcomeBack from "./WelcomeBack";

/** Once per visit (not each time you move between the street and your house). */
let welcomed = false;
export const markWelcomed = () => {
  welcomed = true;
};

/** The "welcome back" scene for a returning person, or null when it isn't needed (new character, already shown, not loaded yet). */
export function useWelcomeBack(life: OnlineLife): { node: ReactNode; showing: boolean } {
  const [, force] = useState(0);
  if (welcomed || !life.session || life.justArrived) return { node: null, showing: false };
  const s = life.session;
  const hud = s.snapshot();
  const profile = s.sim.state.profile;
  const node = (
    <WelcomeBack
      name={profile?.firstName ?? "friend"}
      tier={(profile?.tier ?? "middle") as "lapo" | "middle" | "nepo"}
      hour={hud.hourFloat}
      date={hud.date}
      time={hud.time}
      awayCount={s.awaySummary.length}
      onDone={() => {
        welcomed = true;
        force((n) => n + 1);
      }}
    />
  );
  return { node, showing: true };
}
