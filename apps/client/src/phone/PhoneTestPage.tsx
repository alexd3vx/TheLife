import { useMemo, useState } from "react";
import { GameSession } from "../play/gameSession";
import PhoneUI from "./PhoneUI";

/** Dev-only bench: the phone on its own, no 3D, so it loads instantly and can be tested quickly. (#/phonetest) */
export default function PhoneTestPage() {
  const session = useMemo(() => {
    const s = new GameSession(true);
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
