import { useCallback, useEffect, useRef, useState } from "react";
import {
  APP_INFO, bestCharger, call, clockOf, contactsFor, hasApp, isDead, isPowerCut, markNotificationsRead, modelOf, openApp, plug, powerCutOn, unreadCount, wallPower,
  type AppId, type GameState, type PhoneNotification, type PhoneResult, type PhoneTier,
} from "@thelife/game-core";
import type { GameSession } from "../play/gameSession";
import { Battery, Chat, Jobs, Maps, News, Pay, Shop, naira, type Act } from "./PhoneApps";
import { Icon, type IconName } from "./icons";
import "./phone.css";

type ClientApp = AppId | "battery";

/** Each model has its own look (CSS class). */
const LOOK = { basic: "go", mid: "plus", flagship: "max" } as const;
const APP_STYLE: Record<ClientApp, { icon: IconName; from: string; to: string }> = {
  chat: { icon: "chat", from: "#3ddc84", to: "#12a35a" },
  pay: { icon: "pay", from: "#ffb347", to: "#e8761f" },
  shop: { icon: "shop", from: "#ff7a7a", to: "#d93a5b" },
  jobs: { icon: "jobs", from: "#6aa5ff", to: "#3558e0" },
  news: { icon: "news", from: "#b57cf0", to: "#7a3fc4" },
  maps: { icon: "maps", from: "#3fd0b8", to: "#0f8f9a" },
  battery: { icon: "power", from: "#6b7a90", to: "#38455a" },
};
const APP_NAME = (app: ClientApp) => (app === "battery" ? "Power" : APP_INFO[app].name);
/** What sits in the bottom dock and what fills the grid, per look. */
const DOCK: Record<PhoneTier, ClientApp[]> = { basic: ["chat", "pay", "shop"], mid: ["chat", "pay", "shop", "news"], flagship: ["chat", "pay", "shop", "news"] };
const GRID: Record<PhoneTier, ClientApp[]> = { basic: ["news", "jobs", "maps", "battery"], mid: ["jobs", "maps", "battery"], flagship: ["jobs", "maps", "battery"] };

interface Props {
  session: GameSession;
  onClose(): void;
  initialApp?: ClientApp | null;
}

export default function PhoneUI({ session, onClose, initialApp = null }: Props) {
  const [, setTick] = useState(0);
  const [app, setApp] = useState<ClientApp | null>(null);
  const [locked, setLocked] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [shade, setShade] = useState(false);
  const [flash, setFlash] = useState<{ text: string; bad: boolean; id: number } | null>(null);
  const [dragX, setDragX] = useState<number | null>(null);
  const [calling, setCalling] = useState<{ name: string; seconds: number } | null>(null);
  const flashId = useRef(0);
  const state = session.sim.state;
  const phone = state.phone;
  const model = modelOf(phone);
  const dead = isDead(phone);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    phone.inUse = true;
    const timer = window.setInterval(refresh, 500);
    return () => {
      phone.inUse = false;
      window.clearInterval(timer);
    };
  }, [phone, refresh]);

  const say = useCallback((text: string, bad = false) => {
    const id = ++flashId.current;
    setFlash({ text, bad, id });
    window.setTimeout(() => setFlash((f) => (f?.id === id ? null : f)), 2600);
  }, []);

  /** Runs a phone action, shows what happened and updates the screen. */
  const act: Act = useCallback(
    (fn: (s: GameState) => PhoneResult) => {
      const result = fn(session.sim.state);
      if (result.ok) {
        if (result.text) say(result.text);
      } else say(result.reason, true);
      refresh();
      return result;
    },
    [refresh, say, session],
  );

  const open = useCallback(
    (next: ClientApp) => {
      const s = session.sim.state;
      if (next !== "battery") {
        if (!hasApp(s.phone, next)) return say(`${APP_NAME(next)} needs a better phone than the ${modelOf(s.phone).name}.`, true);
        const result = openApp(s, next);
        if (!result.ok) return say(result.reason, true);
      }
      setShade(false);
      setLocked(false);
      setApp(next);
      refresh();
    },
    [refresh, say, session],
  );

  useEffect(() => {
    if (initialApp && !isDead(session.sim.state.phone)) open(initialApp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const home = () => {
    setApp(null);
    setShade(false);
  };

  // A call is a short moving screen; the airtime is taken when it connects.
  const noCall = calling === null;
  useEffect(() => {
    if (noCall) return;
    const timer = window.setInterval(() => setCalling((c) => (c ? { ...c, seconds: c.seconds + 1 } : c)), 1000);
    return () => window.clearInterval(timer);
  }, [noCall]);

  const startCall = (id: string) => {
    const who = contactsFor(state.profile).find((c) => c.id === id);
    const result = act((s) => call(s, id, 3));
    if (result.ok && who) setCalling({ name: who.name, seconds: 0 });
  };

  // Swipe in from the left edge to go back, like a real phone.
  const edge = useRef<{ startX: number; id: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (app && e.clientX - rect.left < 28) edge.current = { startX: e.clientX, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (edge.current?.id === e.pointerId) setDragX(Math.max(0, e.clientX - edge.current.startX));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (edge.current?.id !== e.pointerId) return;
    const dx = e.clientX - edge.current.startX;
    edge.current = null;
    setDragX(null);
    if (dx > 90) setApp(null);
  };

  const close = () => {
    setLeaving(true);
    window.setTimeout(onClose, 240 * model.slowness);
  };

  const changeModel = (tier: PhoneTier) => {
    phone.model = tier;
    phone.plugged = null;
    setApp(null);
    say(`Now holding the ${modelOf(phone).name}.`);
    refresh();
  };

  const clock = clockOf(state.minute);
  const wall = wallPower(state);
  const unread = unreadCount(phone);
  const style = { "--phone-speed": `${model.slowness}` } as React.CSSProperties;

  return (
    <div className={`phone-overlay${leaving ? " is-leaving" : ""}`} onPointerDown={(e) => e.target === e.currentTarget && close()} style={style}>
      <div className="phone-stage">
        <div className={`phone phone-${LOOK[model.tier]}`} role="dialog" aria-label={model.name} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <span className="phone-btn-side is-power" aria-hidden="true" />
          <span className="phone-btn-side is-vol" aria-hidden="true" />
          <div className="phone-screen" data-view={dead ? "dead" : locked ? "lock" : app ? "app" : "home"}>
            {dead ? (
              <DeadScreen plugged={phone.plugged} wall={wall} hasCharger={!!bestCharger(phone)} onPlug={() => act((s) => plug(s, "wall"))} onClose={close} />
            ) : (
              <>
                <StatusBar clock={clock.label} battery={phone.battery} plugged={phone.plugged} wall={wall} dataMB={phone.dataMB} />
                {model.tier === "flagship" && <div className="phone-island" aria-hidden="true" />}
                {model.tier === "mid" && <div className="phone-punch" aria-hidden="true" />}
                {model.tier === "basic" && <div className="phone-drop" aria-hidden="true" />}

                <Home state={state} tier={model.tier} onOpen={open} hidden={app !== null || locked} />

                {app && (
                  <div className="phone-app" key={app} style={dragX === null ? undefined : { transform: `translateX(${dragX}px)`, transition: "none" }}>
                    <header className="phone-head" style={{ ["--app-from" as string]: APP_STYLE[app].from, ["--app-to" as string]: APP_STYLE[app].to }}>
                      <button className="phone-back" onClick={home} aria-label="Back to home">
                        <Icon name="back" size={22} />
                      </button>
                      <h1>{APP_NAME(app)}</h1>
                    </header>
                    <div className="phone-app-body">
                      {app === "chat" && <Chat state={state} act={act} startCall={startCall} refresh={refresh} />}
                      {app === "pay" && <Pay state={state} act={act} />}
                      {app === "shop" && <Shop state={state} act={act} session={session} />}
                      {app === "jobs" && <Jobs state={state} act={act} />}
                      {app === "news" && <News state={state} />}
                      {app === "maps" && <Maps state={state} />}
                      {app === "battery" && <Battery state={state} act={act} onModel={changeModel} />}
                    </div>
                  </div>
                )}

                {locked && (
                  <LockScreen
                    state={state}
                    onUnlock={() => setLocked(false)}
                    onOpen={(n) => {
                      markNotificationsRead(state);
                      open(n.app);
                    }}
                  />
                )}
                {!locked && unread > 0 && !shade && !app && (
                  <button className="phone-pull" onClick={() => setShade(true)} aria-label={`${unread} notifications`}>
                    <Icon name="bell" size={16} /> {unread}
                  </button>
                )}
                {shade && (
                  <Shade
                    notifications={phone.notifications}
                    onOpen={(n) => {
                      markNotificationsRead(state);
                      open(n.app);
                    }}
                    onClose={() => {
                      markNotificationsRead(state);
                      setShade(false);
                      refresh();
                    }}
                  />
                )}
                {calling && <CallScreen name={calling.name} seconds={calling.seconds} onEnd={() => setCalling(null)} />}
                {flash && (
                  <div className={`phone-flash${flash.bad ? " is-bad" : ""}`} role="status" key={flash.id}>
                    {flash.text}
                  </div>
                )}
              </>
            )}
            {model.tier === "basic" ? (
              <nav className="phone-nav-3" aria-label="Phone buttons">
                <button onClick={() => (app ? home() : setShade((v) => !v))} aria-label="Back">
                  <i className="nav-back" />
                </button>
                <button onClick={() => (locked ? setLocked(false) : home())} aria-label="Home">
                  <i className="nav-home" />
                </button>
                <button onClick={close} aria-label="Put the phone away">
                  <i className="nav-recent" />
                </button>
              </nav>
            ) : (
              <button className="phone-homebar" onClick={() => (locked ? setLocked(false) : app ? home() : close())} aria-label={app ? "Home" : "Unlock or put the phone away"} />
            )}
          </div>
        </div>
        <div className="phone-side">
          <small>Playtest</small>
          <div className="pa-seg">
            {(["basic", "mid", "flagship"] as const).map((t) => (
              <button key={t} aria-pressed={phone.model === t} onClick={() => changeModel(t)}>
                {{ basic: "Go", mid: "Plus", flagship: "Max" }[t]}
              </button>
            ))}
          </div>
          <small>Try the other phones</small>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function StatusBar(p: { clock: string; battery: number; plugged: string | null; wall: boolean; dataMB: number }) {
  const low = p.battery <= 20 && !p.plugged;
  return (
    <div className="phone-status">
      <span className="phone-time">{p.clock}</span>
      <span className="phone-status-right">
        <Icon name="signal" size={14} />
        <span>{p.dataMB > 0 ? "4G" : "No data"}</span>
        <span className={`phone-battery${low ? " is-low" : ""}`} title={p.plugged ? (p.plugged === "wall" && !p.wall ? "Plugged in, no power" : "Charging") : "Battery"}>
          <span className="phone-battery-cell">
            <span style={{ width: `${Math.round(p.battery)}%` }} />
          </span>
          {Math.round(p.battery)}
          {p.plugged ? (p.plugged === "wall" && !p.wall ? "!" : "⚡") : ""}
        </span>
      </span>
    </div>
  );
}

function DeadScreen(p: { plugged: string | null; wall: boolean; hasCharger: boolean; onPlug(): void; onClose(): void }) {
  return (
    <div className="phone-dead">
      <Icon name="power" size={56} />
      <strong>{p.plugged ? (p.wall ? "Charging…" : "No power") : "Battery empty"}</strong>
      <span>{p.plugged ? (p.wall ? "It will turn on soon." : "There is a power cut. Try a power bank.") : p.hasCharger ? "Plug it in to bring it back." : "You have no charger that fits this phone."}</span>
      {!p.plugged && p.hasCharger && (
        <button className="pa-btn is-solid" onClick={p.onPlug}>
          Plug into the wall
        </button>
      )}
      <button className="pa-btn is-soft" onClick={p.onClose}>
        Put away
      </button>
    </div>
  );
}

function LockScreen({ state, onUnlock, onOpen }: { state: GameState; onUnlock(): void; onOpen(n: PhoneNotification): void }) {
  const clock = clockOf(state.minute);
  const list = [...state.phone.notifications].reverse().filter((n) => !n.read).slice(0, 3);
  const start = useRef<number | null>(null);
  return (
    <div
      className="phone-lock"
      onPointerDown={(e) => (start.current = e.clientY)}
      onPointerUp={(e) => {
        if (start.current !== null && start.current - e.clientY > 50) onUnlock();
        start.current = null;
      }}
    >
      <div className="phone-wall" />
      <div className="phone-lock-time">
        <strong>{clock.label}</strong>
        <span>Day {clock.day}</span>
      </div>
      <div className="phone-lock-notes">
        {list.map((n) => (
          <button key={n.id} className="phone-note" onClick={() => onOpen(n)}>
            <span className="phone-note-icon" style={{ background: `linear-gradient(145deg, ${APP_STYLE[n.app].from}, ${APP_STYLE[n.app].to})` }}>
              <Icon name={APP_STYLE[n.app].icon} size={16} />
            </span>
            <span>
              <strong>{n.title}</strong>
              <small>{n.text}</small>
            </span>
          </button>
        ))}
      </div>
      <button className="phone-unlock" onClick={onUnlock}>
        <Icon name="lock" size={16} /> Swipe up or tap to unlock
      </button>
    </div>
  );
}

function Home({ state, tier, onOpen, hidden }: { state: GameState; tier: PhoneTier; onOpen(a: ClientApp): void; hidden: boolean }) {
  const phone = state.phone;
  const clock = clockOf(state.minute);
  const cut = powerCutOn(clock.day);
  const upcoming = cut && state.minute < cut.endMinute ? cut : null;
  const icon = (id: ClientApp) => {
    const supported = id === "battery" || hasApp(phone, id as AppId);
    const badge = id === "chat" ? Object.values(phone.threads).reduce((s, t) => s + t.unread, 0) : 0;
    return (
      <button key={id} className={`phone-icon${supported ? "" : " is-locked"}`} onClick={() => onOpen(id)} tabIndex={hidden ? -1 : 0}>
        <span className="phone-icon-tile" style={{ background: `linear-gradient(150deg, ${APP_STYLE[id].from}, ${APP_STYLE[id].to})` }}>
          <Icon name={APP_STYLE[id].icon} size={tier === "basic" ? 30 : 28} />
          {!supported && (
            <span className="phone-lockpin">
              <Icon name="lock" size={11} />
            </span>
          )}
          {badge > 0 && <span className="pa-badge phone-icon-badge">{badge}</span>}
        </span>
        <span className="phone-icon-name">{APP_NAME(id)}</span>
      </button>
    );
  };
  return (
    <div className={`phone-home${hidden ? " is-behind" : ""}`}>
      <div className="phone-wall" />
      <div className="phone-glance">
        {tier === "basic" ? (
          <>
            <strong>{clock.label}</strong>
            <span>Day {clock.day} · LifePhone Go</span>
          </>
        ) : (
          <div className="phone-widget">
            <strong>{clock.label}</strong>
            <span>Day {clock.day}</span>
            <div className="phone-widget-row">
              <span>
                <Icon name="bolt" size={14} /> {isPowerCut(state.minute) ? "Power cut now" : upcoming?.announced ? `Cut at ${String(Math.floor((upcoming.startMinute % 1440) / 60)).padStart(2, "0")}:00` : "Power on"}
              </span>
              <span>
                <Icon name="pay" size={14} /> {naira(state.ledger.accounts.player ?? 0)}
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="phone-grid">{GRID[tier].map(icon)}</div>
      <div className="phone-dock">{DOCK[tier].map(icon)}</div>
    </div>
  );
}

function Shade({ notifications, onOpen, onClose }: { notifications: PhoneNotification[]; onOpen(n: PhoneNotification): void; onClose(): void }) {
  const list = [...notifications].reverse().slice(0, 12);
  return (
    <div className="phone-shade">
      <div className="phone-shade-head">
        <strong>Notifications</strong>
        <button onClick={onClose}>Done</button>
      </div>
      {list.length === 0 && <p className="pa-empty">Nothing new.</p>}
      {list.map((n) => (
        <button key={n.id} className={`phone-note${n.read ? "" : " is-new"}`} onClick={() => onOpen(n)}>
          <span className="phone-note-icon" style={{ background: `linear-gradient(145deg, ${APP_STYLE[n.app].from}, ${APP_STYLE[n.app].to})` }}>
            <Icon name={APP_STYLE[n.app].icon} size={16} />
          </span>
          <span>
            <strong>{n.title}</strong>
            <small>{n.text}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

function CallScreen({ name, seconds, onEnd }: { name: string; seconds: number; onEnd(): void }) {
  useEffect(() => {
    if (seconds >= 6) onEnd();
  }, [seconds, onEnd]);
  return (
    <div className="phone-call">
      <div className="pa-avatar xl tone-1">{name[0]}</div>
      <strong>{name}</strong>
      <span>{seconds < 2 ? "Calling…" : `0:0${Math.min(9, seconds - 2)}`}</span>
      <button className="phone-hang" onClick={onEnd} aria-label="End call">
        <Icon name="call" size={26} />
      </button>
    </div>
  );
}
