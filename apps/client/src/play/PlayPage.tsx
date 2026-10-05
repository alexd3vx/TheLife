import { useCallback, useEffect, useRef, useState } from "react";
import type { NeedId, SimEvent } from "@thelife/game-core";
import { loadManifest } from "../lab/manifest";
import type { Status } from "./controller";
import type { HudSnapshot } from "./gameSession";
import { startPlay, type PlayRuntime } from "./runtime";
import "./play.css";

interface Toast {
  id: number;
  kind: SimEvent["kind"];
  text: string;
}

const NEED_META: { id: NeedId; icon: string; label: string }[] = [
  { id: "hunger", icon: "🍽️", label: "Hunger" },
  { id: "energy", icon: "⚡", label: "Energy" },
  { id: "hygiene", icon: "🚿", label: "Hygiene" },
  { id: "bladder", icon: "🚽", label: "Bladder" },
  { id: "fun", icon: "🎵", label: "Fun" },
];

const naira = (n: number) => `₦${n.toLocaleString()}`;

function needColour(value: number): string {
  if (value >= 60) return "var(--ok)";
  if (value >= 30) return "var(--accent)";
  return "var(--danger)";
}

function isNight(hour: number): boolean {
  return hour < 6 || hour >= 19;
}

export default function PlayPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<PlayRuntime | null>(null);
  const toastId = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ label: null, hint: null });
  const [hover, setHover] = useState<string | null>(null);
  const [stats, setStats] = useState("");
  const [follow, setFollow] = useState(true);
  const [introVisible, setIntroVisible] = useState(true);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [away, setAway] = useState<string[] | null>(null);

  const pushToasts = useCallback((events: SimEvent[]) => {
    const fresh = events.map((e) => ({ id: ++toastId.current, kind: e.kind, text: e.text }));
    setToasts((prev) => [...prev, ...fresh].slice(-4));
    for (const toast of fresh) window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toast.id)), 5200);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    loadManifest()
      .then((manifest) =>
        startPlay(container, manifest, { onStatus: setStatus, onHover: setHover, onStats: setStats, onHud: setHud, onEvents: pushToasts, onAway: setAway }),
      )
      .then((runtime) => {
        if (disposed) {
          runtime?.dispose();
          return;
        }
        if (!runtime) {
          setError("Your browser can't run WebGL, which the game needs.");
        } else {
          runtimeRef.current = runtime;
          if (import.meta.env.DEV) (window as unknown as { __play: PlayRuntime["debug"] }).__play = runtime.debug;
        }
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    const hide = window.setTimeout(() => setIntroVisible(false), 9000);
    return () => {
      disposed = true;
      window.clearTimeout(hide);
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, [pushToasts]);

  useEffect(() => runtimeRef.current?.setFollow(follow), [follow]);

  const banner = status.label ?? hover;
  const canAffordGroceries = hud ? hud.money >= hud.groceriesPrice : false;

  return (
    <div className="play">
      <div className="play-stage" ref={containerRef} />

      <div className="play-top">
        <a className="play-chip" href="#/" aria-label="Back">
          ←<span className="play-chip-label"> Back</span>
        </a>
        <a className="play-chip" href="#/lab" aria-label="Customise your character">
          🎨<span className="play-chip-label"> Customise</span>
        </a>
        {hud && (
          <div className="play-clock" aria-label="Time and money">
            <span>{isNight(hud.hourFloat) ? "🌙" : "☀️"}</span>
            <strong>Day {hud.day}</strong>
            <span>{hud.time}</span>
            <span className="play-money">{naira(hud.money)}</span>
          </div>
        )}
        <span className="play-fps">{stats}</span>
      </div>

      {hud && (
        <div className="play-needs" role="group" aria-label="Needs">
          {NEED_META.map((need) => (
            <div key={need.id} className="play-need" title={`${need.label}: ${hud.needs[need.id]}`}>
              <span className="play-need-icon" aria-hidden="true">
                {need.icon}
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
      )}

      {hud && (
        <div className="play-info">
          <span>🛒 {hud.portions} {hud.portions === 1 ? "portion" : "portions"}</span>
          <span>🍲 {hud.meals} {hud.meals === 1 ? "meal" : "meals"}</span>
          <span className={hud.rentOwed > 0 ? "play-bad" : ""}>
            🏠 {hud.rentOwed > 0 ? `Owe ${naira(hud.rentOwed)}` : `Rent ${naira(hud.rentPerWeek)} in ${hud.rentInDays} day${hud.rentInDays === 1 ? "" : "s"}`}
          </span>
          {hud.skills.map((skill) => (
            <span key={skill.id}>
              🎓 {skill.id} {skill.level}
            </span>
          ))}
        </div>
      )}

      {(banner || hud?.action) && (
        <div className="play-banner" role="status">
          <strong>{status.label ?? hud?.action?.label ?? banner}</strong>
          {status.label && status.hint && <span>{status.hint}</span>}
          {hud?.action && status.label && (
            <span className="play-progress">
              <span style={{ width: `${Math.round(hud.action.progress * 100)}%` }} />
            </span>
          )}
        </div>
      )}

      <div className="play-toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`play-toast play-toast-${toast.kind}`}>
            {toast.text}
          </div>
        ))}
      </div>

      {introVisible && !loading && !error && !away && (
        <div className="play-intro">
          <strong>Tap the floor</strong> to walk · <strong>tap furniture</strong> to use it · keep your needs up and pay the rent
        </div>
      )}

      <div className="play-controls">
        <button aria-pressed={follow} onClick={() => setFollow((v) => !v)}>
          Follow
        </button>
        <button onClick={() => runtimeRef.current?.resetView()}>Reset view</button>
        <button className={canAffordGroceries ? "" : "is-dim"} onClick={() => runtimeRef.current?.buyGroceries()}>
          Order groceries {hud ? naira(hud.groceriesPrice) : ""}
        </button>
        <button
          className="is-dim"
          onClick={() => {
            if (window.confirm("Start a brand new game? Your current progress will be erased.")) runtimeRef.current?.newGame();
          }}
        >
          New game
        </button>
      </div>

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

      {loading && <div className="play-loading">Building the house…</div>}
      {error && <div className="play-error">{error}</div>}
    </div>
  );
}
