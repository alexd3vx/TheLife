import { isAdmin } from "../ui/admin";
import { GameIcon, type FaName } from "../ui/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOnlineLife } from "../net/useOnlineLife";
import { world } from "../net/world";
import ArrivalFilm from "../arrival/ArrivalFilm";
import "../iso/iso.css";
import InventoryPanel from "../inventory/InventoryPanel";
import KitchenPanel from "../kitchen/KitchenPanel";
import { useWelcomeBack } from "../arrival/useWelcomeBack";
import type { NeedId, SimEvent } from "@thelife/game-core";
import { loadManifest } from "../lab/manifest";
import type { Status } from "./controller";
import type { HudSnapshot } from "./gameSession";
import PhoneUI from "../phone/PhoneUI";
import SettingsPanel from "../settings/SettingsPanel";
import HomeShop from "../iso/HomeShop";
import EditPad from "../iso/EditPad";
import "../iso/iso.css";
import { useSettings } from "../settings/settings";
import { startPlay, type PlayRuntime, type TapMenu } from "./runtime";
import "./play.css";
import { BottomNav, Chips, MoreMenu, NeedsRow, TopPill } from "./HudParts";

interface Toast {
  id: number;
  kind: SimEvent["kind"];
  text: string;
}

const NEED_META: { id: NeedId; icon: FaName; label: string }[] = [
  { id: "hunger", icon: "hunger", label: "Hunger" },
  { id: "energy", icon: "energy", label: "Energy" },
  { id: "hygiene", icon: "hygiene", label: "Hygiene" },
  { id: "bladder", icon: "bladder", label: "Bladder" },
  { id: "fun", icon: "fun", label: "Fun" },
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
  const [menu, setMenu] = useState<TapMenu | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const settings = useSettings();
  const life = useOnlineLife("home");
  const [filmDone, setFilmDone] = useState(false);
  const welcome = useWelcomeBack(life);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [buzz, setBuzz] = useState(false);
  const lastNote = useRef<number | null>(null);
  const recentNotes = useRef(new Map<string, number>());
  const [bagOpen, setBagOpen] = useState(false);
  const [kitchen, setKitchen] = useState<"fridge" | "cook" | "eat" | null>(null);
  const [phoneApp, setPhoneApp] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [sel, setSel] = useState<{ id: string; furniture: string; name: string; bought: boolean; price: number } | null>(null);

  const pushToasts = useCallback((events: SimEvent[]) => {
    const fresh = events.map((e) => ({ id: ++toastId.current, kind: e.kind, text: e.text }));
    setToasts((prev) => [...prev, ...fresh].slice(-4));
    for (const toast of fresh) window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toast.id)), 5200);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !life.session) return;
    let disposed = false;
    loadManifest()
      .then((manifest) =>
        startPlay(container, manifest, { onStatus: setStatus, onHover: setHover, onStats: setStats, onHud: setHud, onEvents: pushToasts, onAway: setAway, onMenu: setMenu, onKitchen: setKitchen, onEditSelect: setSel }, { session: life.session! }),
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
  }, [pushToasts, life.session]);

  useEffect(() => runtimeRef.current?.setFollow(follow), [follow]);
  useEffect(() => runtimeRef.current?.setPhoneOpen(phoneOpen), [phoneOpen]);
  // the bottom bar and the money "+" ask for the phone and the bag with these events
  useEffect(() => {
    const open = (e: Event) => {
      setPhoneApp((e as CustomEvent<string | null>).detail ?? null);
      setPhoneOpen(true);
    };
    const toggle = () => setPhoneOpen((o) => !o);
    const bag = () => setBagOpen((o) => !o);
    window.addEventListener("thelife-open-phone", open);
    window.addEventListener("thelife-toggle-phone", toggle);
    window.addEventListener("thelife-toggle-bag", bag);
    return () => {
      window.removeEventListener("thelife-open-phone", open);
      window.removeEventListener("thelife-toggle-phone", toggle);
      window.removeEventListener("thelife-toggle-bag", bag);
    };
  }, []);

  // A new phone notification buzzes the phone icon and shows as a toast while the phone is away.
  const latest = hud?.phone.latest ?? null;
  useEffect(() => {
    if (!latest) return;
    if (lastNote.current === null) {
      lastNote.current = latest.id;
      return;
    }
    // Only genuinely newer notifications count (your copy of the life runs ahead of the server's and can step back and forth).
    if (latest.id <= lastNote.current) return;
    lastNote.current = latest.id;
    const sig = `${latest.title}|${latest.text}`;
    const nowMs = Date.now();
    if ((recentNotes.current.get(sig) ?? 0) > nowMs - 90_000) return;
    recentNotes.current.set(sig, nowMs);
    if (phoneOpen) return;
    setBuzz(true);
    pushToasts([{ kind: "info", text: `${latest.title}: ${latest.text}`, minute: 0 }]);
    const t = window.setTimeout(() => setBuzz(false), 1600);
    return () => window.clearTimeout(t);
  }, [latest, phoneOpen, pushToasts]);

  const banner = status.label ?? hover;

  return (
    <div className="play hud-on">
      <div className="play-stage" ref={containerRef} />

      <div className="play-top">
        <a className="play-chip" href="#/" aria-label="Back">
          ←<span className="play-chip-label"> Back</span>
        </a>
        {isAdmin() && (
          <a className="play-chip" href="#/lab" aria-label="Asset lab (test)">
            <GameIcon name="palette" /><span className="play-chip-label"> Lab (test)</span>
          </a>
        )}
        {settings.showFps && <span className="play-fps">{stats}</span>}
      </div>

      {hud && !editing && (
        <>
          <TopPill hud={hud} />
          <Chips hud={hud} />
          <NeedsRow hud={hud} />
        </>
      )}

      {(banner || hud?.action) && (
        <div className={`play-banner${status.label ? " is-doing" : ""}`} role="status">
          {status.label && hud?.action && hud.action.seconds >= 10 && (
            <svg className="play-ring" viewBox="0 0 44 44" aria-hidden="true">
              <circle className="play-ring-track" cx="22" cy="22" r="18" />
              <circle className="play-ring-fill" cx="22" cy="22" r="18" pathLength="1" style={{ strokeDashoffset: 1 - hud.action.progress }} />
            </svg>
          )}
          <div className="play-banner-text">
            <strong>{status.label ?? hud?.action?.label ?? banner}</strong>
            {status.label && status.hint && <span>{status.hint}</span>}
            {status.label && hud?.action && hud.action.seconds >= 10 && <span className="play-lapse">⏩ time is passing quickly</span>}
          </div>
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
          <strong>Tap the floor</strong> to walk · <strong>tap furniture</strong> to use it · keep your needs up, order food and pay rent from your <strong>phone</strong>
        </div>
      )}

      {editing && (
        <>
          <div className="home-hint" style={{ top: "calc(max(12px, env(safe-area-inset-top)) + 182px)" }}>{sel ? "Tap the floor, or use the arrows." : "Tap a piece of furniture to pick it up."}</div>
          <EditPad active={!!sel && !shopOpen} onMove={(sx, sy) => runtimeRef.current?.edit.nudge(sx, sy)} onTurn={() => runtimeRef.current?.edit.rotate()} />
          <div className="home-bar">
            <button disabled={!sel} onClick={() => runtimeRef.current?.edit.rotate()}>Turn</button>
            <button className="danger" disabled={!sel} onClick={() => runtimeRef.current?.edit.sell()}>
              {sel ? `Sell ₦${Math.floor(sel.price * (sel.bought ? 0.6 : 0.25)).toLocaleString()}` : "Sell"}
            </button>
            <button onClick={() => setShopOpen(true)}>Shop</button>
            <button className="primary" onClick={() => { runtimeRef.current?.edit.stop(); setEditing(false); setShopOpen(false); }}>Done</button>
          </div>
        </>
      )}
      {editing && shopOpen && runtimeRef.current?.session && (
        <HomeShop
          session={runtimeRef.current.session}
          onClose={() => setShopOpen(false)}
          onBuy={(f) => void runtimeRef.current?.edit.buy(f).then((err) => (err ? runtimeRef.current?.session?.notice(err) : setShopOpen(false)))}
        />
      )}
      {!editing && !phoneOpen && !bagOpen && !kitchen && (
        <BottomNav active="home" unread={hud?.phone.unread ?? 0} onBag={() => setBagOpen(true)} onBuy={() => { runtimeRef.current?.edit.start(); setEditing(true); setShopOpen(true); }} />
      )}
      {!editing && !phoneOpen && !bagOpen && (
        <MoreMenu
          items={[
            { label: "Follow camera", icon: "walk", pressed: follow, run: () => setFollow((v) => !v) },
            { label: "Reset view", icon: "map", run: () => runtimeRef.current?.resetView() },
            { label: "Edit home", icon: "home", run: () => { runtimeRef.current?.edit.start(); setEditing(true); } },
            { label: "Settings", icon: "settings", run: () => setShowSettings(true) },
            { label: "New game", icon: "close", danger: true, run: () => { if (window.confirm("Start a brand new game? Your current progress will be erased.")) runtimeRef.current?.newGame(); } },
          ]}
        />
      )}
      {!editing && <div className="play-controls">
        <button aria-pressed={follow} onClick={() => setFollow((v) => !v)}>
          Follow
        </button>
        <button onClick={() => runtimeRef.current?.resetView()}>Reset view</button>
        <button onClick={() => setShowSettings(true)}>
          <GameIcon name="settings" /> Settings
        </button>
        <button
          className="is-dim"
          onClick={() => {
            if (window.confirm("Start a brand new game? Your current progress will be erased.")) runtimeRef.current?.newGame();
          }}
        >
          New game
        </button>
        <button onClick={() => { runtimeRef.current?.edit.start(); setEditing(true); }}>Edit home</button>
      </div>}

      {menu && (
        <div className="play-menu" role="menu" style={{ left: Math.max(8, Math.min(menu.x, (containerRef.current?.clientWidth ?? 600) - 220)), top: Math.max(8, Math.min(menu.y + 10, (containerRef.current?.clientHeight ?? 600) - 60 - menu.options.length * 46)) }}>
          {menu.title && <div className="play-menu-title">{menu.title}</div>}
          {menu.options.map((o, i) => (
            <button key={i} role="menuitem" onClick={() => { o.run(); setMenu(null); }}>
              <GameIcon name={o.icon} />
              {o.label}
            </button>
          ))}
        </div>
      )}

      {hud && !phoneOpen && !editing && (
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
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {hud && !phoneOpen && !bagOpen && !editing && (
        <button className="play-bag" onClick={() => setBagOpen(true)} aria-label="Open your bag">
          <GameIcon name="bag" size={22} />
        </button>
      )}
      {kitchen && runtimeRef.current?.session && (
        <KitchenPanel session={runtimeRef.current.session} initialTab={kitchen} onClose={() => setKitchen(null)} runUse={(a) => runtimeRef.current?.useAction(a) ?? false} />
      )}
      {bagOpen && runtimeRef.current?.session && (
        <InventoryPanel session={runtimeRef.current.session} onClose={() => setBagOpen(false)} onPhone={() => { setPhoneApp(null); setPhoneOpen(true); }} />
      )}
      {phoneOpen && runtimeRef.current?.session && (
        <PhoneUI session={runtimeRef.current.session} initialApp={phoneApp as never} onClose={() => setPhoneOpen(false)} />
      )}

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

      {welcome.node}
      {life.justArrived && life.session && !filmDone && (
        <ArrivalFilm tier={(life.session.sim.state.profile?.tier ?? "middle") as "lapo" | "middle" | "nepo"} onDone={() => setFilmDone(true)} />
      )}
      {(loading || !life.session) && !error && !(life.justArrived && !filmDone) && <div className="play-loading" role="status"><span className="iso-wait" aria-label="Loading" /></div>}
      {error && <div className="play-error">{error}</div>}
    </div>
  );
}
