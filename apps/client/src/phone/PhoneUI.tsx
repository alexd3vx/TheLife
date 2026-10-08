import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  appInfo, bestCharger, clockOf, connection, contactsFor, hasApp, isDead, isPowerCut, modelOf, powerCutOn, storeAppById, unreadCount, wallPower, balance, type AnyAppId, type GameState, type PhoneNotification, type PhoneResult, type PhoneTier, type StoreAppId, lagosDateLabel } from "@thelife/game-core";
import { isOnline, rpc, call, clearNotifications, dismissNotification, markNotificationsRead, openApp, plug, useApp } from "./remote";
import type { GameSession } from "../play/gameSession";
import { Battery, Chat, Jobs, Maps, News, Pay, Shop, naira, type Act } from "./PhoneApps";
import { ExtraApp } from "./PhoneExtras";
import { LifeStore, Ring, Settings } from "./PhoneSystem";
import { Icon } from "./icons";
import { nameOf, styleOf, type ClientApp } from "./appStyle";
import { useSocial } from "../net/social";
import { AppActive, AppBack } from "./active";
import { isLocked, lockNote } from "../features";
import "./phone.css";

/** Each model has its own look (CSS class). */
const LOOK = { basic: "go", mid: "plus", flagship: "max" } as const;
const APP_NAME = nameOf;
/** The dock holds four apps on every model; the grid holds the rest, then anything you download. */
const DOCK: ClientApp[] = ["chat", "pay", "shop", "news"];
const GRID: ClientApp[] = ["store", "jobs", "maps", "settings", "battery"];
const PAGE_SIZE: Record<PhoneTier, number> = { basic: 20, mid: 16, flagship: 16 };

/** If an app throws while drawing, show what happened and a restart button instead of a blank screen. */
class AppBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null; attempt: number }> {
  state = { error: null as Error | null, attempt: 0 };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(`[phone] ${this.props.name} stopped:`, error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="phone-crash" role="alert">
          <Icon name="power" size={40} />
          <strong>{this.props.name} stopped</strong>
          <span>{this.state.error.message.slice(0, 160)}</span>
          <button className="pa-btn is-solid" onClick={() => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))}>
            Restart app
          </button>
        </div>
      );
    }
    return <div key={this.state.attempt} className="phone-boundary">{this.props.children}</div>;
  }
}

interface Props {
  session: GameSession;
  onClose(): void;
  initialApp?: ClientApp | null;
}

export default function PhoneUI({ session, onClose, initialApp = null }: Props) {
  const [, setTick] = useState(0);
  /** Apps that are open (in the background or in front), oldest first. They stay alive so you come back to where you were. */
  const [running, setRunning] = useState<ClientApp[]>([]);
  const [current, setCurrent] = useState<ClientApp | null>(null);
  const [switcher, setSwitcher] = useState(false);
  const [locked, setLocked] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [drawer, setDrawer] = useState(false);
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
    // `phone` is replaced whenever the server sends a newer copy, so this reads it fresh and only runs once per opening.
    session.sim.state.phone.inUse = true;
    rpc("setInUse", [true]);
    const timer = window.setInterval(refresh, 500);
    return () => {
      session.sim.state.phone.inUse = false;
      rpc("setInUse", [false]);
      window.clearInterval(timer);
    };
  }, [session, refresh]);

  // Time spent in social, media and some other apps lifts the mood a little.
  useEffect(() => {
    if (!current || !storeAppById(current)) return;
    const id = window.setInterval(() => useApp(session.sim.state, current as StoreAppId, 1), 10_000);
    return () => window.clearInterval(id);
  }, [current, session]);

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
      if (isLocked(next)) return say(lockNote(next), false);
      const s = session.sim.state;
      const alreadyOpen = running.includes(next);
      if (next !== "battery" && !alreadyOpen) {
        if (!hasApp(s.phone, next as AnyAppId)) return say(`${APP_NAME(next)} needs a better phone than the ${modelOf(s.phone).name}.`, true);
        const result = openApp(s, next as AnyAppId);
        if (!result.ok) return say(result.reason, true);
      }
      setDrawer(false);
      setSwitcher(false);
      setLocked(false);
      setRunning((list) => [...list.filter((a) => a !== next), next]);
      setCurrent(next);
      refresh();
    },
    [refresh, running, say, session],
  );

  useEffect(() => {
    if (initialApp && !isDead(session.sim.state.phone)) open(initialApp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Minimise: the app stays open in the background. */
  const home = () => {
    setCurrent(null);
    setDrawer(false);
    setSwitcher(false);
  };
  // Each app can register what "back" does inside it; one back arrow serves the header, the Android key and the edge swipe.
  const backs = useRef(new Map<ClientApp, () => void>());
  const setters = useRef(new Map<ClientApp, (h: (() => void) | null) => void>());
  const setterFor = (app: ClientApp) => {
    let f = setters.current.get(app);
    if (!f) setters.current.set(app, (f = (h) => void (h ? backs.current.set(app, h) : backs.current.delete(app))));
    return f;
  };
  const goBack = () => {
    const h = current ? backs.current.get(current) : undefined;
    if (h) {
      h();
      refresh();
    } else home();
  };
  const closeApp = (app: ClientApp) => {
    setRunning((list) => list.filter((a) => a !== app));
    setCurrent((c) => (c === app ? null : c));
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

  const close = () => {
    setLeaving(true);
    window.setTimeout(onClose, 240 * model.slowness);
  };

  // ---- gestures: swipe in from the left edge = back; swipe down from the top = notifications.
  const gesture = useRef<{ kind: "edge" | "top"; x: number; y: number; id: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (current && !switcher && x < 28) gesture.current = { kind: "edge", x: e.clientX, y: e.clientY, id: e.pointerId };
    else if (!locked && !drawer && y < 56) gesture.current = { kind: "top", x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (g?.id === e.pointerId && g.kind === "edge") setDragX(Math.max(0, e.clientX - g.x));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (g?.id !== e.pointerId) return;
    gesture.current = null;
    setDragX(null);
    if (g.kind === "edge" && e.clientX - g.x > 90) goBack();
    if (g.kind === "top" && e.clientY - g.y > 50) setDrawer(true);
  };

  // The gesture bar (Plus, Max): tap = home, swipe up = home, swipe up and hold (or just hold) = recent apps.
  const bar = useRef<{ y: number; t: number; timer: number } | null>(null);
  const barDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const timer = window.setTimeout(() => {
      if (bar.current) {
        bar.current.t = -1; // the hold already fired
        setSwitcher(true);
      }
    }, 450);
    bar.current = { y: e.clientY, t: performance.now(), timer };
  };
  const barUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    const b = bar.current;
    bar.current = null;
    if (!b) return;
    window.clearTimeout(b.timer);
    if (b.t === -1) return;
    const swiped = b.y - e.clientY > 40;
    if (locked) setLocked(false);
    else if (switcher) home();
    else if (current) home();
    else if (!swiped) close();
  };
  const goHomeButton = () => {
    if (locked) setLocked(false);
    else if (switcher || current) home();
    else close();
  };

  const changeModel = (tier: PhoneTier) => {
    phone.model = tier;
    phone.plugged = null;
    setRunning((list) => list.filter((a) => a === "battery" || hasApp(phone, a as AnyAppId)));
    setCurrent((c) => (c && c !== "battery" && !hasApp(phone, c as AnyAppId) ? null : c));
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
          <button className="phone-btn-side is-power" onClick={close} aria-label="Put the phone away" />
          <span className="phone-btn-side is-vol" aria-hidden="true" />
          <div className="phone-screen" data-view={dead ? "dead" : locked ? "lock" : current ? "app" : "home"}>
            {dead ? (
              <DeadScreen plugged={phone.plugged} wall={wall} hasCharger={!!bestCharger(phone)} onPlug={() => act((s) => plug(s, "wall"))} onClose={close} />
            ) : (
              <>
                <StatusBar clock={clock.label} battery={phone.battery} plugged={phone.plugged} wall={wall} net={connection(state)} onTap={() => !locked && setDrawer((v) => !v)} />
                {model.tier === "flagship" && <div className="phone-island" aria-hidden="true" />}
                {model.tier === "mid" && <div className="phone-punch" aria-hidden="true" />}
                {model.tier === "basic" && <div className="phone-drop" aria-hidden="true" />}

                <Home state={state} tier={model.tier} onOpen={open} hidden={current !== null || locked} />

                {running.map((app) => (
                  <section
                    key={app}
                    className={`phone-app${app === current && !switcher ? "" : " is-min"}${switcher ? " is-switching" : ""}`}
                    aria-hidden={app !== current}
                    style={app === current && dragX !== null ? { transform: `translateX(${dragX}px)`, transition: "none" } : undefined}
                  >
                    <header className="phone-head" style={{ ["--app-from" as string]: styleOf(app).from, ["--app-to" as string]: styleOf(app).to }}>
                      <button className="phone-back" onClick={app === current ? goBack : home} aria-label="Back">
                        <Icon name="back" size={22} />
                      </button>
                      <h1>{APP_NAME(app)}</h1>
                    </header>
                    <div className="phone-app-body">
                      <AppBack.Provider value={setterFor(app)}>
                      <AppActive.Provider value={app === current && !switcher}>
                      <AppBoundary name={APP_NAME(app)}>
                      {app === "chat" && <Chat state={state} act={act} startCall={startCall} refresh={refresh} />}
                      {app === "pay" && <Pay state={state} act={act} />}
                      {app === "shop" && <Shop state={state} act={act} session={session} />}
                      {app === "jobs" && <Jobs state={state} act={act} />}
                      {app === "news" && <News state={state} />}
                      {app === "maps" && <Maps state={state} />}
                      {app === "battery" && <Battery state={state} act={act} onModel={changeModel} />}
                      {app === "settings" && <Settings state={state} act={act} />}
                      {app === "store" && <LifeStore state={state} act={act} onOpen={(id) => open(id)} />}
                      {storeAppById(app) && <ExtraApp id={app as StoreAppId} state={state} act={act} />}
                      </AppBoundary>
                      </AppActive.Provider>
                      </AppBack.Provider>
                    </div>
                  </section>
                ))}

                {switcher && <Switcher running={running} state={state} onOpen={open} onClose={closeApp} onCloseAll={() => { setRunning([]); setCurrent(null); }} onDismiss={home} />}
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
                {!locked && unread > 0 && !drawer && !current && !switcher && (
                  <button className="phone-pull" onClick={() => setDrawer(true)} aria-label={`${unread} notifications`}>
                    <Icon name="bell" size={16} /> {unread}
                  </button>
                )}
                {drawer && (
                  <Drawer
                    state={state}
                    onOpen={(n) => {
                      markNotificationsRead(state);
                      open(n.app);
                    }}
                    onDismiss={(id) => {
                      dismissNotification(state, id);
                      refresh();
                    }}
                    onClear={() => {
                      clearNotifications(state);
                      refresh();
                    }}
                    onClose={() => {
                      markNotificationsRead(state);
                      setDrawer(false);
                      refresh();
                    }}
                    onPlug={() => act((s) => plug(s, phone.plugged === "wall" ? null : "wall"))}
                    onOpenApp={open}
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
                <button onClick={() => (drawer ? setDrawer(false) : switcher ? setSwitcher(false) : current ? goBack() : close())} aria-label="Back">
                  <i className="nav-back" />
                </button>
                <button onClick={goHomeButton} aria-label="Home">
                  <i className="nav-home" />
                </button>
                <button onClick={() => !locked && setSwitcher((v) => !v)} aria-label="Recent apps">
                  <i className="nav-recent" />
                </button>
              </nav>
            ) : (
              <button className="phone-homebar" onPointerDown={barDown} onPointerUp={barUp} onPointerCancel={() => (bar.current = null)} aria-label="Home. Hold for recent apps" />
            )}
          </div>
        </div>
        {!isOnline() && <div className="phone-side">
          <small>Playtest</small>
          <div className="pa-seg">
            {(["basic", "mid", "flagship"] as const).map((t) => (
              <button key={t} aria-pressed={phone.model === t} onClick={() => changeModel(t)}>
                {{ basic: "Go", mid: "Plus", flagship: "Max" }[t]}
              </button>
            ))}
          </div>
          <small>Try the other phones</small>
        </div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function StatusBar(p: { clock: string; battery: number; plugged: string | null; wall: boolean; net: { kind: string; label: string }; onTap(): void }) {
  const low = p.battery <= 20 && !p.plugged;
  return (
    <div className="phone-status" onClick={p.onTap}>
      <span className="phone-time">{p.clock}</span>
      <span className="phone-status-right">
        <Icon name={p.net.kind === "wifi" ? "wifi" : "signal"} size={14} className="phone-sig" />
        <span className="phone-net">{p.net.kind === "wifi" ? "Wi-Fi" : p.net.label}</span>
        <span className={`phone-battery${low ? " is-low" : ""}`} title={p.plugged ? (p.plugged === "wall" && !p.wall ? "Plugged in, no power" : "Charging") : "Battery"}>
          <span className="phone-battery-cell">
            <span style={{ width: `${Math.round(p.battery)}%` }} />
          </span>
          {Math.round(p.battery)}
          {p.plugged ? (p.plugged === "wall" && !p.wall ? "!" : <Icon name="bolt" size={11} />) : ""}
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

function appBadge(n: PhoneNotification) {
  return (
    <span className="phone-note-icon" style={{ background: `linear-gradient(145deg, ${styleOf(n.app).from}, ${styleOf(n.app).to})` }}>
      <Icon name={styleOf(n.app).icon} size={16} />
    </span>
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
        <span>{lagosDateLabel(clock.day)}</span>
      </div>
      <div className="phone-lock-notes">
        {list.map((n) => (
          <button key={n.id} className="phone-note" onClick={() => onOpen(n)}>
            {appBadge(n)}
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
  const soc = useSocial();
  const phone = state.phone;
  const clock = clockOf(state.minute);
  const apps: ClientApp[] = [...GRID, ...phone.installed];
  const ghosts = phone.downloads.map((d) => ({ id: d.appId, progress: d.doneMB / (storeAppById(d.appId)?.sizeMB ?? 1), paused: d.paused }));
  const known = useRef<Set<string> | null>(null);
  if (known.current === null) known.current = new Set(apps);
  const fresh = apps.filter((a) => !known.current!.has(a));
  useEffect(() => {
    for (const a of apps) known.current!.add(a);
  });
  const size = PAGE_SIZE[tier];
  const pages = Math.max(1, Math.ceil((apps.length + ghosts.length) / size));
  const [pageRaw, setPage] = useState(0);
  const page = Math.min(pageRaw, pages - 1);
  const swipe = useRef<number | null>(null);
  const cut = powerCutOn(clock.day);
  const upcoming = cut && state.minute < cut.endMinute ? cut : null;
  const icon = (id: ClientApp, isNew = false) => {
    const supported = id === "battery" || hasApp(phone, id as AnyAppId);
    const badge = id === "chat" ? Object.values(phone.threads).reduce((s, t) => s + t.unread, 0) + soc.unread : 0;
    return (
      <button key={id} className={`phone-icon${supported ? "" : " is-locked"}${isNew ? " is-new" : ""}`} onClick={() => onOpen(id)} tabIndex={hidden ? -1 : 0}>
        <span className="phone-icon-tile" style={{ background: `linear-gradient(150deg, ${styleOf(id).from}, ${styleOf(id).to})` }}>
          <Icon name={styleOf(id).icon} size={tier === "basic" ? 30 : 28} />
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
            <span>{lagosDateLabel(clock.day)} · LifePhone Go</span>
          </>
        ) : (
          <div className="phone-widget">
            <strong>{clock.label}</strong>
            <span>{lagosDateLabel(clock.day)}</span>
            <div className="phone-widget-row">
              <span>
                <Icon name="bolt" size={14} /> {isPowerCut(state.minute) ? "Power cut now" : upcoming?.announced ? `Cut at ${String(Math.floor((upcoming.startMinute % 1440) / 60)).padStart(2, "0")}:00` : "Power on"}
              </span>
              <span>
                <Icon name="pay" size={14} /> {naira(balance(state.ledger))}
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="phone-pages" onPointerDown={(e) => (swipe.current = e.clientX)} onPointerUp={(e) => {
        const x0 = swipe.current;
        swipe.current = null;
        if (x0 === null) return;
        const dx = e.clientX - x0;
        if (Math.abs(dx) > 50) setPage((n) => Math.max(0, Math.min(pages - 1, n + (dx < 0 ? 1 : -1))));
      }}>
        <div className="phone-grid">
          {[...apps.map((id) => ({ id, ghost: null as null | { progress: number; paused: boolean } })), ...ghosts.map((g) => ({ id: g.id as ClientApp, ghost: g }))].slice(page * size, page * size + size).map((e) =>
            e.ghost ? (
              <div key={`g_${e.id}`} className="phone-icon is-ghost" aria-label={`Installing ${nameOf(e.id)}`}>
                <span className="phone-icon-tile" style={{ background: `linear-gradient(150deg, ${styleOf(e.id).from}, ${styleOf(e.id).to})` }}>
                  <Icon name={styleOf(e.id).icon} size={tier === "basic" ? 26 : 26} />
                  <Ring value={e.ghost.progress} paused={e.ghost.paused} size={tier === "basic" ? 44 : 50} />
                </span>
                <span className="phone-icon-name">{e.ghost.paused ? "Paused" : "Installing…"}</span>
              </div>
            ) : (
              icon(e.id, fresh.includes(e.id))
            ),
          )}
        </div>
      </div>
      {pages > 1 && (
        <div className="pa-dots" role="tablist" aria-label="Home screens">
          {Array.from({ length: pages }, (_, i) => <i key={i} className={i === page ? "is-on" : ""} onClick={() => setPage(i)} />)}
        </div>
      )}
      <div className="phone-dock">{DOCK.map((id) => icon(id))}</div>
    </div>
  );
}

/** Recent apps: a row of cards. Tap to come back to one, swipe a card up to close it. */
function Switcher({ running, state, onOpen, onClose, onCloseAll, onDismiss }: { running: ClientApp[]; state: GameState; onOpen(a: ClientApp): void; onClose(a: ClientApp): void; onCloseAll(): void; onDismiss(): void }) {
  const [drag, setDrag] = useState<{ app: ClientApp; dy: number } | null>(null);
  const start = useRef<{ app: ClientApp; y: number; id: number } | null>(null);
  const gist = (app: ClientApp): string => {
    if (app === "store" && state.phone.downloads.length) return `${state.phone.downloads.length} downloading`;
    const p = state.phone;
    if (app === "chat") return `${Object.values(p.threads).reduce((s, t) => s + t.unread, 0)} unread`;
    if (app === "pay") return naira(balance(state.ledger));
    if (app === "shop") return p.orders.length ? `${p.orders.length} on the way` : "Order food, chargers, phones";
    if (app === "jobs") return p.job ? "You have a job" : "Find a job";
    if (app === "news") return `${lagosDateLabel(clockOf(state.minute).day)} headlines`;
    if (app === "maps") return "Around you";
    if (app === "battery") return `${Math.round(p.battery)}% battery`;
    return appInfo(app).blurb;
  };
  const cards = [...running].reverse();
  return (
    <div className="phone-switcher" onClick={(e) => e.target === e.currentTarget && onDismiss()}>
      {cards.length === 0 && <p className="phone-switcher-empty">No recent apps</p>}
      <div className="phone-cards">
        {cards.map((app) => (
          <div
            key={app}
            className="phone-card-wrap"
            style={drag?.app === app ? { transform: `translateY(${drag.dy}px)`, opacity: 1 + drag.dy / 300, transition: "none" } : undefined}
            onPointerDown={(e) => {
              start.current = { app, y: e.clientY, id: e.pointerId };
              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => start.current?.id === e.pointerId && setDrag({ app, dy: Math.min(0, e.clientY - start.current.y) })}
            onPointerUp={(e) => {
              const s = start.current;
              start.current = null;
              setDrag(null);
              if (!s || s.id !== e.pointerId) return;
              const dy = e.clientY - s.y;
              if (dy < -90) onClose(app);
              else if (Math.abs(dy) < 8) onOpen(app);
            }}
          >
            <div className="phone-card-head">
              <span className="phone-note-icon" style={{ background: `linear-gradient(145deg, ${styleOf(app).from}, ${styleOf(app).to})` }}>
                <Icon name={styleOf(app).icon} size={16} />
              </span>
              <strong>{APP_NAME(app)}</strong>
              <button
                className="phone-card-x"
                aria-label={`Close ${APP_NAME(app)}`}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(app);
                }}
              >
                ×
              </button>
            </div>
            <div className="phone-card-body" style={{ background: `linear-gradient(160deg, ${styleOf(app).from}, ${styleOf(app).to})` }}>
              <Icon name={styleOf(app).icon} size={54} />
              <span>{gist(app)}</span>
            </div>
          </div>
        ))}
      </div>
      {cards.length > 0 && (
        <button className="phone-switcher-clear" onClick={onCloseAll}>
          Close all
        </button>
      )}
    </div>
  );
}

/** The notification drawer: quick tiles on top, notifications below. Swipe one sideways to dismiss it. */
function Drawer({ state, onOpen, onDismiss, onClear, onClose, onPlug, onOpenApp }: { state: GameState; onOpen(n: PhoneNotification): void; onDismiss(id: number): void; onClear(): void; onClose(): void; onPlug(): void; onOpenApp(a: ClientApp): void }) {
  const phone = state.phone;
  const clock = clockOf(state.minute);
  const list = [...phone.notifications].reverse();
  const wall = wallPower(state);
  const [drag, setDrag] = useState<{ id: number; dx: number } | null>(null);
  const start = useRef<{ id: number; x: number; pointer: number; moved: boolean } | null>(null);
  const closeSwipe = useRef<number | null>(null);
  return (
    <div
      className="phone-drawer"
      onPointerDown={(e) => (closeSwipe.current = e.clientY)}
      onPointerUp={(e) => {
        if (closeSwipe.current !== null && closeSwipe.current - e.clientY > 70) onClose();
        closeSwipe.current = null;
      }}
    >
      <div className="phone-drawer-head">
        <div>
          <strong>{clock.label}</strong>
          <span>{lagosDateLabel(clock.day)}</span>
        </div>
        <button onClick={onClose} aria-label="Close notifications">
          <Icon name="back" size={20} />
        </button>
      </div>
      <div className="phone-tiles">
        <button className={phone.plugged ? "is-on" : ""} onClick={onPlug}>
          <Icon name="plug" size={22} />
          <span>{phone.plugged ? (phone.plugged === "wall" && !wall ? "No power" : "Charging") : "Plug in"}</span>
        </button>
        <button onClick={() => onOpenApp("battery")}>
          <Icon name="power" size={22} />
          <span>{Math.round(phone.battery)}%</span>
        </button>
        <button onClick={() => onOpenApp("settings")}>
          <Icon name={connection(state).kind === "wifi" ? "wifi" : "signal"} size={22} />
          <span>{connection(state).kind === "wifi" ? "Wi-Fi" : phone.dataMB >= 1024 ? `${(phone.dataMB / 1024).toFixed(1)} GB` : `${Math.round(phone.dataMB)} MB`}</span>
        </button>
        <button onClick={() => onOpenApp("pay")}>
          <Icon name="call" size={22} />
          <span>{naira(phone.airtime)}</span>
        </button>
      </div>
      <div className="phone-drawer-title">
        <strong>Notifications</strong>
        {list.length > 0 && <button onClick={onClear}>Clear all</button>}
      </div>
      <div className="phone-drawer-list">
        {list.length === 0 && <p className="pa-empty">You're all caught up.</p>}
        {list.map((n) => (
          <div
            key={n.id}
            className={`phone-notice${n.read ? "" : " is-new"}`}
            style={drag?.id === n.id ? { transform: `translateX(${drag.dx}px)`, opacity: 1 - Math.abs(drag.dx) / 220, transition: "none" } : undefined}
            onPointerDown={(e) => {
              e.stopPropagation();
              start.current = { id: n.id, x: e.clientX, pointer: e.pointerId, moved: false };
            }}
            onPointerMove={(e) => {
              const s = start.current;
              if (s?.pointer !== e.pointerId) return;
              const dx = e.clientX - s.x;
              if (Math.abs(dx) > 6) s.moved = true;
              if (s.moved) setDrag({ id: n.id, dx });
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              const s = start.current;
              start.current = null;
              setDrag(null);
              if (!s || s.pointer !== e.pointerId) return;
              const dx = e.clientX - s.x;
              if (Math.abs(dx) > 90) onDismiss(n.id);
              else if (!s.moved) onOpen(n);
            }}
          >
            {appBadge(n)}
            <span className="phone-notice-main">
              <span className="phone-notice-meta">
                {appInfo(n.app).name} · {clockOf(n.minute).label}
              </span>
              <strong>{n.title}</strong>
              <small>{n.text}</small>
            </span>
          </div>
        ))}
      </div>
      <div className="phone-drawer-grab" aria-hidden="true" />
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
