import { useCallback, useEffect, useRef, useState } from "react";
import {
  APP_INFO, BILL_PER_WEEK, CHARGERS, JOBS, PLACES, POWER_BANK, SHOP_ITEMS, TOPUPS,
  SAVINGS, applyForJob, balance, beatById, bestCharger, billPerWeek, borrow, call, clockOf, contactsFor, deliveryFee, deposit, hasApp, isDead, isPowerCut,
  itemPrice, loanLimit, markNotificationsRead, markThreadRead, modelOf, newsFor, openApp, payBill, payRent, placeOrder, plug, powerCutOn, quitJob,
  repay, replyToThread, sendMoney, setAutoPay, setBankCharging, shopItemById, skillLevel, topUp, unreadCount, wallPower, withdraw,
  type AppId, type GameState, type PhoneResult, type PhoneNotification,
} from "@thelife/game-core";
import type { GameSession } from "../play/gameSession";
import "./phone.css";

type ClientApp = AppId | "battery";
const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;
const MB = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(1)} GB` : `${Math.round(n)} MB`);

const APP_STYLE: Record<ClientApp, { icon: string; colour: string }> = {
  chat: { icon: "💬", colour: "#2fbf71" },
  pay: { icon: "💳", colour: "#f2a43a" },
  shop: { icon: "🛍️", colour: "#ef5f5f" },
  jobs: { icon: "💼", colour: "#4d8bff" },
  news: { icon: "📰", colour: "#9b59b6" },
  maps: { icon: "🗺️", colour: "#16a99a" },
  battery: { icon: "🔋", colour: "#3d4a5c" },
};
const APP_NAME = (app: ClientApp) => (app === "battery" ? "Power" : APP_INFO[app].name);
/** Each model has its own look (CSS class). */
const LOOK = { basic: "go", mid: "plus", flagship: "max" } as const;
const ALL_APPS: ClientApp[] = ["chat", "pay", "shop", "jobs", "news", "maps", "battery"];

interface Props {
  session: GameSession;
  onClose(): void;
  /** Opens straight into an app (tapping a notification). */
  initialApp?: ClientApp | null;
}

export default function PhoneUI({ session, onClose, initialApp = null }: Props) {
  const [, setTick] = useState(0);
  const [app, setApp] = useState<ClientApp | null>(null);
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
    const timer = window.setInterval(refresh, 300);
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
  const act = useCallback(
    (fn: (s: GameState) => PhoneResult): PhoneResult => {
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
      if (next !== "battery") {
        if (!hasApp(session.sim.state.phone, next)) return say(`${APP_NAME(next)} needs a better phone than the ${modelOf(session.sim.state.phone).name}.`, true);
        const result = openApp(session.sim.state, next);
        if (!result.ok) return say(result.reason, true);
      }
      setShade(false);
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
  useEffect(() => {
    if (!calling) return;
    const timer = window.setInterval(() => setCalling((c) => (c ? { ...c, seconds: c.seconds + 1 } : c)), 1000);
    return () => window.clearInterval(timer);
  }, [calling === null]); // eslint-disable-line react-hooks/exhaustive-deps

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
    window.setTimeout(onClose, 220 * model.slowness);
  };

  const clock = clockOf(state.minute);
  const wall = wallPower(state);
  const unread = unreadCount(phone);
  const slow = { "--phone-speed": `${model.slowness}` } as React.CSSProperties;

  return (
    <div className={`phone-overlay${leaving ? " is-leaving" : ""}`} onPointerDown={(e) => e.target === e.currentTarget && close()} style={slow}>
      <div className={`phone phone-${LOOK[model.tier]}`} role="dialog" aria-label={model.name} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <div className="phone-screen">
          {dead ? (
            <DeadScreen model={model.name} plugged={phone.plugged} wall={wall} hasCharger={!!bestCharger(phone)} onPlug={() => act((s) => plug(s, "wall"))} onClose={close} />
          ) : (
            <>
              <StatusBar clock={clock.label} battery={phone.battery} plugged={phone.plugged} wall={wall} dataMB={phone.dataMB} tier={model.tier} unread={unread} onShade={() => setShade((v) => !v)} />
              {model.tier === "flagship" && <div className="phone-island" aria-hidden="true" />}
              <div className="phone-body">
                <Home apps={ALL_APPS} model={model.tier} state={state} onOpen={open} hidden={app !== null} />
                {app && (
                  <div className="phone-app" key={app} style={dragX === null ? undefined : { transform: `translateX(${dragX}px)`, transition: "none" }}>
                    <AppHeader title={APP_NAME(app)} colour={APP_STYLE[app].colour} onBack={home} />
                    <div className="phone-app-body">
                      {app === "chat" && <Chat state={state} act={act} startCall={startCall} refresh={refresh} />}
                      {app === "pay" && <Pay state={state} act={act} />}
                      {app === "shop" && <Shop state={state} act={act} session={session} />}
                      {app === "jobs" && <Jobs state={state} act={act} />}
                      {app === "news" && <News state={state} />}
                      {app === "maps" && <Maps state={state} />}
                      {app === "battery" && <Battery state={state} act={act} />}
                    </div>
                  </div>
                )}
                {shade && (
                  <Shade
                    notifications={phone.notifications}
                    onOpen={(n) => {
                      markNotificationsRead(state);
                      open(n.app);
                    }}
                    onClear={() => {
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
              </div>
            </>
          )}
          <button className="phone-homebar" onClick={app ? home : close} aria-label={app ? "Home" : "Put the phone away"} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function StatusBar(p: { clock: string; battery: number; plugged: string | null; wall: boolean; dataMB: number; tier: string; unread: number; onShade(): void }) {
  const low = p.battery <= 20 && !p.plugged;
  return (
    <div className="phone-status">
      <button className="phone-clock" onClick={p.onShade} aria-label="Notifications">
        {p.clock}
        {p.unread > 0 && <span className="phone-dot">{p.unread}</span>}
      </button>
      <span className="phone-status-right">
        <span title="Mobile data">{p.dataMB > 0 ? "4G" : "No data"}</span>
        <span className={`phone-battery${low ? " is-low" : ""}`} title={p.plugged ? (p.plugged === "wall" && !p.wall ? "Plugged in, no power" : "Charging") : "Battery"}>
          <span className="phone-battery-cell">
            <span style={{ width: `${Math.round(p.battery)}%` }} />
          </span>
          {Math.round(p.battery)}%{p.plugged ? (p.plugged === "wall" && !p.wall ? " ⚠" : " ⚡") : ""}
        </span>
      </span>
    </div>
  );
}

function DeadScreen(p: { model: string; plugged: string | null; wall: boolean; hasCharger: boolean; onPlug(): void; onClose(): void }) {
  return (
    <div className="phone-dead">
      <div className="phone-dead-icon">🪫</div>
      <strong>{p.plugged ? (p.wall ? "Charging…" : "No power") : "Battery empty"}</strong>
      <span>{p.plugged ? (p.wall ? "It will turn on soon." : "There is a power cut. Try a power bank.") : p.hasCharger ? "Plug it in to bring it back." : "You have no charger that fits this phone."}</span>
      {!p.plugged && p.hasCharger && (
        <button className="phone-btn" onClick={p.onPlug}>
          Plug into the wall
        </button>
      )}
      <button className="phone-btn is-ghost" onClick={p.onClose}>
        Put away
      </button>
    </div>
  );
}

function AppHeader({ title, colour, onBack }: { title: string; colour: string; onBack(): void }) {
  return (
    <div className="phone-appbar" style={{ background: colour }}>
      <button onClick={onBack} aria-label="Back">
        ‹
      </button>
      <strong>{title}</strong>
    </div>
  );
}

function Home({ apps, model, state, onOpen, hidden }: { apps: ClientApp[]; model: string; state: GameState; onOpen(a: ClientApp): void; hidden: boolean }) {
  const phone = state.phone;
  const clock = clockOf(state.minute);
  const day = clock.day;
  const cut = powerCutOn(day);
  const upcoming = cut && state.minute < cut.endMinute ? cut : null;
  return (
    <div className={`phone-home${hidden ? " is-behind" : ""}`}>
      <div className="phone-wall" />
      {model !== "basic" && (
        <div className="phone-widget">
          <strong>{clock.label}</strong>
          <span>Day {day}</span>
          {model === "flagship" && <span className="phone-widget-note">{isPowerCut(state.minute) ? "⚡ Power cut now" : upcoming?.announced ? `⚡ Power cut at ${String(Math.floor((upcoming.startMinute % 1440) / 60)).padStart(2, "0")}:00` : `🔋 ${Math.round(phone.battery)}%`}</span>}
        </div>
      )}
      <div className="phone-grid">
        {apps.map((id) => {
          const supported = id === "battery" || hasApp(phone, id as AppId);
          const badge = id === "chat" ? Object.values(phone.threads).reduce((s, t) => s + t.unread, 0) : 0;
          return (
            <button key={id} className={`phone-icon${supported ? "" : " is-locked"}`} onClick={() => onOpen(id)} tabIndex={hidden ? -1 : 0}>
              <span className="phone-icon-tile" style={{ background: APP_STYLE[id].colour }}>
                {APP_STYLE[id].icon}
                {badge > 0 && <span className="phone-dot">{badge}</span>}
              </span>
              <span className="phone-icon-name">{APP_NAME(id)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Shade({ notifications, onOpen, onClear }: { notifications: PhoneNotification[]; onOpen(n: PhoneNotification): void; onClear(): void }) {
  const list = [...notifications].reverse().slice(0, 12);
  return (
    <div className="phone-shade">
      <div className="phone-shade-head">
        <strong>Notifications</strong>
        <button onClick={onClear}>Clear</button>
      </div>
      {list.length === 0 && <p className="phone-muted">Nothing new.</p>}
      {list.map((n) => (
        <button key={n.id} className={`phone-note${n.read ? "" : " is-new"}`} onClick={() => onOpen(n)}>
          <span className="phone-note-icon" style={{ background: APP_STYLE[n.app].colour }}>
            {APP_STYLE[n.app].icon}
          </span>
          <span>
            <strong>{n.title}</strong>
            <span>{n.text}</span>
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
      <div className="phone-avatar">{name[0]}</div>
      <strong>{name}</strong>
      <span>{seconds < 2 ? "Calling…" : `0:0${Math.min(9, seconds - 2)} · connected`}</span>
      <button className="phone-hang" onClick={onEnd} aria-label="End call">
        ✆
      </button>
    </div>
  );
}

type Act = (fn: (s: GameState) => PhoneResult) => PhoneResult;

// ------------------------------------------------------------------ LifeChat

function Chat({ state, act, startCall, refresh }: { state: GameState; act: Act; startCall(id: string): void; refresh(): void }) {
  const [current, setCurrent] = useState<string | null>(null);
  const contacts = contactsFor(state.profile);
  const endRef = useRef<HTMLDivElement>(null);
  const t = current ? state.phone.threads[current] : undefined;
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [t?.messages.length, current]);

  if (!current) {
    return (
      <ul className="phone-list">
        {contacts.map((c) => {
          const th = state.phone.threads[c.id];
          const last = th?.messages.at(-1);
          return (
            <li key={c.id}>
              <button
                className="phone-row"
                onClick={() => {
                  markThreadRead(state, c.id);
                  setCurrent(c.id);
                  refresh();
                }}
              >
                <span className="phone-avatar">{c.name[0]}</span>
                <span className="phone-row-main">
                  <strong>{c.name}</strong>
                  <span className="phone-muted">{last ? last.text : c.role}</span>
                </span>
                {th && th.unread > 0 && <span className="phone-dot">{th.unread}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  const who = contacts.find((c) => c.id === current)!;
  const beat = t?.pending ? beatById(t.pending) : undefined;
  return (
    <div className="phone-chat">
      <div className="phone-chat-head">
        <button className="phone-link" onClick={() => setCurrent(null)}>
          ‹ All chats
        </button>
        <strong>{who.name}</strong>
        {who.callable ? (
          <button className="phone-link" onClick={() => startCall(current)} aria-label={`Call ${who.name}`}>
            📞 Call
          </button>
        ) : (
          <span />
        )}
      </div>
      <div className="phone-bubbles">
        {(t?.messages ?? []).length === 0 && <p className="phone-muted center">No messages yet.</p>}
        {t?.messages.map((m, i) => (
          <div key={i} className={`phone-bubble ${m.from}`}>
            {m.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {beat?.options && (
        <div className="phone-quick">
          {beat.options.map((o, i) => (
            <button key={i} className="phone-chip" onClick={() => act((s) => replyToThread(s, current, i))}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ LifePay

type PayTab = "home" | "send" | "save" | "loan" | "top" | "history";

function Amount({ value, onChange, quick }: { value: string; onChange(v: string): void; quick: number[] }) {
  return (
    <div className="phone-amount">
      <input inputMode="numeric" placeholder="Amount (₦)" value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 9))} />
      <div className="phone-quick">
        {quick.map((q) => (
          <button key={q} className="phone-chip" onClick={() => onChange(String(q))}>
            {naira(q)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Pay({ state, act }: { state: GameState; act: Act }) {
  const [tab, setTab] = useState<PayTab>("home");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("family");
  const phone = state.phone;
  const banking = modelOf(phone).banking;
  const money = balance(state.ledger);
  const saved = balance(state.ledger, SAVINGS);
  const n = Number(amount) || 0;
  const tabs: [PayTab, string][] = [["home", "Home"], ["send", "Send"], ...(banking ? ([["save", "Save"], ["loan", "Loan"]] as [PayTab, string][]) : []), ["top", "Top up"], ["history", "History"]];
  const people = contactsFor(state.profile).filter((c) => c.receivesMoney);

  return (
    <div className="phone-pay">
      <div className="phone-card">
        <span>Balance</span>
        <strong>{naira(money)}</strong>
        {banking && <small>Savings {naira(saved)}</small>}
      </div>
      <div className="phone-tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setAmount(""); }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "home" && (
        <div className="phone-stack">
          <div className="phone-due">
            <div>
              <strong>Rent</strong>
              <span className="phone-muted">{state.rentOwed > 0 ? `${naira(state.rentOwed)} owed` : state.profile && state.profile.rentPerWeek === 0 ? "Family house, none to pay" : "Nothing owed"}</span>
            </div>
            <button className="phone-btn" disabled={state.rentOwed <= 0} onClick={() => act((s) => payRent(s))}>
              Pay
            </button>
          </div>
          <div className="phone-due">
            <div>
              <strong>Water and power</strong>
              <span className="phone-muted">{billPerWeek(state.profile) === 0 ? "Covered by your family" : phone.billOwed > 0 ? `${naira(phone.billOwed)} owed` : `${naira(BILL_PER_WEEK)} a week`}</span>
            </div>
            <button className="phone-btn" disabled={phone.billOwed <= 0} onClick={() => act((s) => payBill(s))}>
              Pay
            </button>
          </div>
          <label className="phone-switch">
            <input type="checkbox" checked={phone.autoPay} onChange={(e) => setAutoPay(state, e.target.checked)} />
            <span>
              <strong>Pay rent and bills automatically</strong>
              <small>{phone.autoPay ? "Taken as soon as they are due." : "You pay from here. Rent gets a late fee after a day."}</small>
            </span>
          </label>
          <p className="phone-muted">Airtime {naira(phone.airtime)} · Data {MB(phone.dataMB)}</p>
        </div>
      )}

      {tab === "send" && (
        <div className="phone-stack">
          <div className="phone-quick">
            {people.map((c) => (
              <button key={c.id} className="phone-chip" aria-pressed={to === c.id} onClick={() => setTo(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
          <Amount value={amount} onChange={setAmount} quick={[500, 1000, 5000]} />
          <button className="phone-btn wide" disabled={n <= 0} onClick={() => act((s) => sendMoney(s, to, n)).ok && setAmount("")}>
            Send {n > 0 ? naira(n) : ""}
          </button>
        </div>
      )}

      {tab === "save" && (
        <div className="phone-stack">
          <p className="phone-muted">Savings earn 1% every week. Money you can't see is money you don't spend.</p>
          <Amount value={amount} onChange={setAmount} quick={[1000, 5000, 20000]} />
          <div className="phone-split">
            <button className="phone-btn" disabled={n <= 0} onClick={() => act((s) => deposit(s, n)).ok && setAmount("")}>
              Save
            </button>
            <button className="phone-btn is-ghost" disabled={n <= 0} onClick={() => act((s) => withdraw(s, n)).ok && setAmount("")}>
              Withdraw
            </button>
          </div>
        </div>
      )}

      {tab === "loan" && (
        <div className="phone-stack">
          {phone.loan ? (
            <>
              <p>
                You owe <strong>{naira(phone.loan.owed)}</strong>. Pay it down before it grows: after two weeks a 5% charge is added each week.
              </p>
              <Amount value={amount} onChange={setAmount} quick={[Math.min(phone.loan.owed, 5000), phone.loan.owed]} />
              <button className="phone-btn wide" disabled={n <= 0} onClick={() => act((s) => repay(s, n)).ok && setAmount("")}>
                Repay {n > 0 ? naira(n) : ""}
              </button>
            </>
          ) : (
            <>
              <p className="phone-muted">Borrow up to {naira(loanLimit(state.profile))}. You pay back 10% extra.</p>
              <Amount value={amount} onChange={setAmount} quick={[5000, 10000, loanLimit(state.profile)]} />
              <button className="phone-btn wide" disabled={n <= 0} onClick={() => act((s) => borrow(s, n)).ok && setAmount("")}>
                Borrow {n > 0 ? naira(n) : ""}
              </button>
            </>
          )}
        </div>
      )}

      {tab === "top" && (
        <ul className="phone-list">
          {TOPUPS.map((item) => (
            <li key={item.id} className="phone-due">
              <div>
                <strong>{item.name}</strong>
                <span className="phone-muted">{item.blurb}</span>
              </div>
              <button className="phone-btn" onClick={() => act((s) => topUp(s, item.id))}>
                {naira(item.price)}
              </button>
            </li>
          ))}
        </ul>
      )}

      {tab === "history" && (
        <ul className="phone-list">
          {[...state.ledger.entries].reverse().filter((e) => e.from === "player" || e.to === "player" || e.from === SAVINGS || e.to === SAVINGS).slice(0, 30).map((e) => {
            const incoming = e.to === "player" || (e.to === SAVINGS && e.from !== "player");
            const internal = (e.from === "player" && e.to === SAVINGS) || (e.from === SAVINGS && e.to === "player");
            return (
              <li key={e.id} className="phone-tx">
                <div>
                  <strong>{e.reason}</strong>
                  <span className="phone-muted">Day {clockOf(e.minute).day} · {clockOf(e.minute).label}</span>
                </div>
                <span className={internal ? "" : incoming ? "in" : "out"}>{internal ? "" : incoming ? "+" : "−"}{naira(e.amount)}</span>
              </li>
            );
          })}
          {state.ledger.entries.length === 0 && <p className="phone-muted">No transactions yet.</p>}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ LifeShop

function Shop({ state, act, session }: { state: GameState; act: Act; session: GameSession }) {
  const [tab, setTab] = useState<"food" | "power" | "phones">("food");
  const phone = state.phone;
  const scale = session.sim.traits.groceries;
  const kinds = { food: ["grocery"], power: ["charger", "powerbank"], phones: ["phone"] }[tab];
  const items = SHOP_ITEMS.filter((i) => kinds.includes(i.kind));
  const time = (m: number) => (m >= 60 ? `${Math.round(m / 60)} h` : `${m} min`);
  return (
    <div className="phone-shop">
      <div className="phone-tabs" role="tablist">
        {([["food", "Food"], ["power", "Power"], ["phones", "Phones"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {phone.orders.length > 0 && (
        <div className="phone-orders">
          {phone.orders.map((o) => (
            <div key={o.id}>🚚 {shopItemById(o.itemId)?.name} · arrives in {time(Math.max(1, Math.round(o.arrivesAt - state.minute)))}</div>
          ))}
        </div>
      )}
      <ul className="phone-list">
        {items.map((item) => {
          const price = itemPrice(state, item, scale);
          const fee = deliveryFee(price);
          const have =
            (item.kind === "charger" && phone.chargers.includes(item.id)) || (item.kind === "powerbank" && phone.powerBank.owned) || (item.kind === "phone" && item.tier === phone.model);
          const fits = item.kind === "charger" ? CHARGERS.find((c) => c.id === item.id)?.ports.some((p) => modelOf(phone).ports.includes(p)) : true;
          return (
            <li key={item.id} className="phone-due">
              <div>
                <strong>{item.name}</strong>
                <span className="phone-muted">{item.blurb}</span>
                <span className="phone-muted">
                  {time(item.deliveryMinutes)} delivery{fee ? ` · +${naira(fee)}` : " · free delivery"}
                  {item.kind === "charger" && !fits ? " · won't fit your phone" : ""}
                </span>
              </div>
              <button className="phone-btn" disabled={have} onClick={() => act((s) => placeOrder(s, item.id, scale))}>
                {have ? (item.kind === "phone" ? "Yours" : "Owned") : naira(price)}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ LifeJobs

function Jobs({ state, act }: { state: GameState; act: Act }) {
  const phone = state.phone;
  const levels = { computer: skillLevel(state.skills.computer ?? 0), knowledge: skillLevel(state.skills.knowledge ?? 0) };
  const current = JOBS.find((j) => j.id === phone.job);
  return (
    <div className="phone-stack">
      {current && (
        <div className="phone-card is-good">
          <span>Your job</span>
          <strong>{current.title}</strong>
          <small>
            {current.employer} · {naira(current.retainer)} a week · work pays ×{current.payBoost}
          </small>
          <button className="phone-btn is-ghost" onClick={() => act((s) => quitJob(s))}>
            Quit
          </button>
        </div>
      )}
      {phone.application && <p className="phone-muted">⏳ Waiting to hear back from {JOBS.find((j) => j.id === phone.application!.jobId)?.employer}…</p>}
      <ul className="phone-list">
        {JOBS.map((job) => {
          const have = levels[job.requires.skill];
          const ok = have >= job.requires.level;
          return (
            <li key={job.id} className="phone-due">
              <div>
                <strong>{job.title}</strong>
                <span className="phone-muted">{job.employer} · {job.blurb}</span>
                <span className="phone-muted">
                  {naira(job.retainer)} a week · needs {job.requires.skill} {job.requires.level} {ok ? "✓" : `(you have ${have})`}
                </span>
              </div>
              <button className="phone-btn" disabled={phone.job === job.id || !!phone.application} onClick={() => act((s) => applyForJob(s, job.id))}>
                {phone.job === job.id ? "Hired" : "Apply"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ LifeNews and LifeMaps

function News({ state }: { state: GameState }) {
  const [open, setOpen] = useState<string | null>(null);
  const items = newsFor(clockOf(state.minute).day);
  return (
    <ul className="phone-list">
      {items.map((n) => (
        <li key={n.id}>
          <button className="phone-news" onClick={() => setOpen(open === n.id ? null : n.id)} aria-expanded={open === n.id}>
            <span className="phone-tag">{n.tag}</span>
            <strong>{n.headline}</strong>
            {open === n.id && <span className="phone-muted">{n.body}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Maps({ state }: { state: GameState }) {
  const where = state.profile?.hometown ? `Near ${state.profile.hometown}` : "Your area";
  const dots = [[50, 52], [30, 30], [72, 34], [68, 74], [24, 70], [82, 56]];
  return (
    <div className="phone-stack">
      <svg className="phone-map" viewBox="0 0 100 100" role="img" aria-label="Map of your area">
        <rect width="100" height="100" fill="#dfe8d6" />
        <path d="M0 45 H100 M0 78 H100 M38 0 V100 M76 0 V100" stroke="#fff" strokeWidth="5" />
        <path d="M0 45 C30 40 60 55 100 48" stroke="#9fc7e6" strokeWidth="6" fill="none" />
        {PLACES.map((p, i) => (
          <g key={p.name}>
            <circle cx={dots[i]![0]} cy={dots[i]![1]} r={i === 0 ? 4.5 : 3} fill={i === 0 ? "#2f7bff" : "#e0594b"} stroke="#fff" strokeWidth="1.2" />
          </g>
        ))}
      </svg>
      <p className="phone-muted">{where}. The full city map comes later; for now this is what is close.</p>
      <ul className="phone-list">
        {PLACES.map((p) => (
          <li key={p.name} className="phone-due">
            <div>
              <strong>{p.name}</strong>
              <span className="phone-muted">{p.kind} · {p.note}</span>
            </div>
            <span className="phone-muted">{p.minutes === 0 ? "here" : `${p.minutes} min`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ Power (charging)

function Battery({ state, act }: { state: GameState; act: Act }) {
  const phone = state.phone;
  const model = modelOf(phone);
  const best = bestCharger(phone);
  const wall = wallPower(state);
  const cut = powerCutOn(clockOf(state.minute).day);
  const hh = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:00`;
  return (
    <div className="phone-stack">
      <div className="phone-card">
        <span>{model.name}</span>
        <strong>{Math.round(phone.battery)}%</strong>
        <small>
          Port: {model.ports.join(" / ")} · takes up to {model.maxCharge}% an hour · {model.screen}
        </small>
      </div>

      <div className="phone-due">
        <div>
          <strong>Mains power</strong>
          <span className="phone-muted">
            {wall ? "On" : phone.billOwed >= BILL_PER_WEEK * 2 ? "Cut off: unpaid bill" : "Power cut right now"}
            {cut && !isPowerCut(state.minute) && state.minute < cut.endMinute && cut.announced ? ` · cut planned ${hh(cut.startMinute)}–${hh(cut.endMinute)}` : ""}
          </span>
        </div>
        <span>{wall ? "💡" : "🌑"}</span>
      </div>

      <div className="phone-due">
        <div>
          <strong>Charger</strong>
          <span className="phone-muted">{best ? `${best.name} · ${best.rate}% an hour` : "None that fit this phone. Order one in LifeShop."}</span>
        </div>
        {phone.plugged === "wall" ? (
          <button className="phone-btn is-ghost" onClick={() => act((s) => plug(s, null))}>Unplug</button>
        ) : (
          <button className="phone-btn" disabled={!best} onClick={() => act((s) => plug(s, "wall"))}>Plug in</button>
        )}
      </div>

      {phone.powerBank.owned && (
        <>
          <div className="phone-due">
            <div>
              <strong>Power bank</strong>
              <span className="phone-muted">{Math.round(phone.powerBank.charge)} of {POWER_BANK.capacity} units</span>
            </div>
            {phone.plugged === "bank" ? (
              <button className="phone-btn is-ghost" onClick={() => act((s) => plug(s, null))}>Unplug</button>
            ) : (
              <button className="phone-btn" onClick={() => act((s) => plug(s, "bank"))}>Use</button>
            )}
          </div>
          <label className="phone-switch">
            <input type="checkbox" checked={phone.bankCharging} onChange={(e) => act((s) => setBankCharging(s, e.target.checked))} />
            <span>
              <strong>Charge the power bank from the wall</strong>
              <small>Only works while there is power.</small>
            </span>
          </label>
        </>
      )}
      <p className="phone-muted">
        Airtime {naira(phone.airtime)} · Data {MB(phone.dataMB)}
      </p>
    </div>
  );
}
