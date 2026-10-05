import { useMemo, useState } from "react";
import { BACKGROUNDS, profileFrom, type Tier } from "@thelife/game-core";
import { GameSession, beginLife } from "../play/gameSession";
import PhoneUI from "./PhoneUI";

/**
 * Dev-only bench: the phone on its own, no 3D, so it loads instantly and can be tested quickly. (#/phonetest)
 * Add `?life=lapo|middle|nepo` (before the #) to start a real rolled life of that kind instead of a blank one.
 */
export default function PhoneTestPage() {
  const session = useMemo(() => {
    const life = new URLSearchParams(window.location.search).get("life") as Tier | null;
    if (life) {
      const def = BACKGROUNDS.find((b) => b.tier === life);
      if (def) beginLife(profileFrom(def, () => 0.5, "female"));
    }
    const s = new GameSession(!life);
    (window as unknown as { __phone: GameSession }).__phone = s;
    return s;
  }, []);
  const [open, setOpen] = useState(true);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#a9c9e8" }}>
      <button style={{ margin: 16 }} onClick={() => setOpen(true)}>
        Open the phone
      </button>
      {open && <PhoneUI session={session} onClose={() => setOpen(false)} />}
    </div>
  );
}
