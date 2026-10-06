import { useEffect, useRef, useState } from "react";
import type { NeedId, SimEvent } from "@thelife/game-core";
import PhoneUI from "../phone/PhoneUI";
import { GameIcon, type FaName } from "../ui/icons";
import { GameSession, type HudSnapshot } from "./gameSession";
import "./play.css";

const NEED_META: { id: NeedId; icon: FaName; label: string }[] = [
  { id: "hunger", icon: "hunger", label: "Hunger" },
  { id: "energy", icon: "energy", label: "Energy" },
  { id: "hygiene", icon: "hygiene", label: "Hygiene" },
  { id: "bladder", icon: "bladder", label: "Bladder" },
  { id: "fun", icon: "fun", label: "Fun" },
];
const naira = (n: number) => `₦${n.toLocaleString()}`;
const needColour = (v: number) => (v >= 60 ? "var(--ok)" : v >= 30 ? "var(--accent)" : "var(--danger)");
const isNight = (h: number) => h < 6 || h >= 19;

interface Toast {
  id: number;
  kind: SimEvent["kind"];
  text: string;
}

/**
 * The life on top of the world: the clock, money, needs and the phone. It runs the game rules (`GameSession`) at real time while
 * the player walks around, and shows what the character needs.
 */
export default function GameHud({ onHour, session: given, children }: { onHour?(hour: number, day: number): void; session?: GameSession; children?: React.ReactNode }) {
  const sessionRef = useRef<GameSession | null>(given ?? null);
  if (!sessionRef.current) sessionRef.current = new GameSession(false);
  const session = sessionRef.current;
  const [hud, setHud] = useState<HudSnapshot>(() => session.snapshot());
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneApp, setPhoneApp] = useState<string | null>(null);
  useEffect(() => {
    const open = (e: Event) => {
      setPhoneApp((e as CustomEvent<string>).detail ?? null);
      setPhoneOpen(true);
    };
    const toggle = () => setPhoneOpen((o) => !o);
    window.addEventListener("thelife-open-phone", open);
    window.addEventListener("thelife-toggle-phone", toggle);
    return () => {
      window.removeEventListener("thelife-open-phone", open);
      window.removeEventListener("thelife-toggle-phone", toggle);
    };
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("thelife-phone-state", { detail: phoneOpen }));
  }, [phoneOpen]);
  const [buzz, setBuzz] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [away, setAway] = useState<string[] | null>(session.awaySummary.length ? session.awaySummary : null);
  const onHourRef = useRef(onHour);
  onHourRef.current = onHour;
  const toastId = useRef(0);
  const lastNote = useRef<number | null>(null);

  const pushToasts = (events: Pick<SimEvent, "kind" | "text">[]) => {
    const fresh = events.map((e) => ({ id: ++toastId.current, kind: e.kind, text: e.text }));
    if (!fresh.length) return;
    setToasts((prev) => [...prev, ...fresh].slice(-4));
    for (const t of fresh) window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 5200);
  };

  // Run the rules in real time.
  useEffect(() => {
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      if (document.hidden) return;
      const events = session.step(dt);
      if (events.length) pushToasts(events);
      const snap = session.snapshot();
      setHud(snap);
      onHourRef.current?.(snap.hourFloat, snap.day);
    }, 250);
    const save = () => session.save();
    window.addEventListener("pagehide", save);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", save);
      session.save();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new phone notification buzzes the phone and shows as a toast while the phone is away.
  const latest = hud.phone.latest;
  useEffect(() => {
    if (!latest) return;
    if (lastNote.current === null) {
      lastNote.current = latest.id;
      return;
    }
    if (latest.id === lastNote.current) return;
    lastNote.current = latest.id;
    if (phoneOpen) return;
    setBuzz(true);
    pushToasts([{ kind: "info", text: `${latest.title}: ${latest.text}` }]);
    const t = window.setTimeout(() => setBuzz(false), 1600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest, phoneOpen]);

  return (
    <>
      <div className="hud-top">
        <div className="play-clock" aria-label="Time and money">
          <span><GameIcon name={isNight(hud.hourFloat) ? "moon" : "sun"} /></span>
          <strong>Day {hud.day}</strong>
          <span>{hud.time}</span>
          <span className="play-money">{naira(hud.money)}</span>
        </div>
        {hud.profile && (
          <span className={`play-who play-who-${hud.profile.tier}`} title={hud.profile.title}>
            {hud.profile.firstName} {hud.profile.surname}
          </span>
        )}
      </div>

      <div className="play-needs" role="group" aria-label="Needs">
        {NEED_META.map((need) => (
          <div key={need.id} className="play-need" title={`${need.label}: ${hud.needs[need.id]}`}>
            <span className="play-need-icon" aria-hidden="true">
              <GameIcon name={need.icon} />
            </span>
            <span className="play-need-bar">
              <span style={{ width: `${hud.needs[need.id]}%`, background: needColour(hud.needs[need.id]) }} />
            </span>
            <span className="visually-hidden">
              {need.label} {hud.needs[need.id]} of 100
            </span>
          </div>
        ))}
        <div className="play-mood">
          Mood <strong>{hud.moodLabel}</strong>
        </div>
      </div>

      <div className="play-toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`play-toast play-toast-${toast.kind}`}>
            {toast.text}
          </div>
        ))}
      </div>

      {!phoneOpen && (
        <button className={`play-phone${buzz ? " is-buzz" : ""}`} onClick={() => { setPhoneApp(null); setPhoneOpen(true); }} aria-label={`Phone, ${hud.phone.battery}% battery${hud.phone.unread ? `, ${hud.phone.unread} new` : ""}`}>
          <span className="play-phone-body">
            <GameIcon name="phone" size={22} />
            {hud.phone.unread > 0 && <span className="phone-dot">{hud.phone.unread}</span>}
          </span>
          <span className={`play-phone-battery${hud.phone.battery <= 20 && !hud.phone.charging ? " is-low" : ""}`}>
            <GameIcon name={hud.phone.dead ? "batteryEmpty" : hud.phone.charging ? "charging" : "batteryFull"} /> {hud.phone.dead ? 0 : hud.phone.battery}%
          </span>
        </button>
      )}
      {phoneOpen && <PhoneUI session={session} initialApp={phoneApp as never} onClose={() => setPhoneOpen(false)} />}

      {away && (
        <div className="play-modal" role="dialog" aria-label="While you were away">
          <div className="play-modal-card">
            <h2>While you were away</h2>
            <ul>
              {away.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <button className="btn btn-primary" onClick={() => setAway(null)}>
              Continue
            </button>
          </div>
        </div>
      )}
      {children}
    </>
  );
}
