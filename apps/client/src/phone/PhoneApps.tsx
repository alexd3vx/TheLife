import { useBackHandler } from "./active";
import { useEffect, useRef, useState } from "react";
import {
  BILL_PER_WEEK, CHARGERS, JOBS, POWER_BANK, SHOP_ITEMS, TOPUPS, SAVINGS, balance, beatById, bestCharger, billPerWeek, clockOf, contactsFor, deliveryFee, isPowerCut, itemPrice, loanLimit, modelOf, newsFor, powerCutOn, shopItemById, skillLevel, wallPower, type GameState, type PhoneResult, lagosDateLabel } from "@thelife/game-core";
import { isOnline, applyForJob, borrow, deposit, markThreadRead, payBill, payRent, placeOrder, plug, quitJob, repay, replyToThread, sendMoney, setAutoPay, setBankCharging, topUp, withdraw } from "./remote";
import type { GameSession } from "../play/gameSession";
import { Icon, type IconName } from "./icons";
import DistrictMap from "../map/DistrictMap";
import { getDistrict } from "../map/districtData";
import { PIN_STYLE } from "../map/pins";
import "../map/map.css";

export type Act = (fn: (s: GameState) => PhoneResult) => PhoneResult;

export const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;
export const MB = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(1)} GB` : `${Math.round(n)} MB`);
const hhmm = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:00`;

/** A bottom tab bar, like a real app. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; icon: IconName }[]; value: T; onChange(v: T): void }) {
  return (
    <nav className="pa-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
          <Icon name={t.icon} size={22} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function Row({ icon, title, sub, right, tone }: { icon?: IconName; title: string; sub?: string; right?: React.ReactNode; tone?: string }) {
  return (
    <div className="pa-row">
      {icon && (
        <span className="pa-row-icon" style={tone ? { background: tone } : undefined}>
          <Icon name={icon} size={20} />
        </span>
      )}
      <span className="pa-row-main">
        <strong>{title}</strong>
        {sub && <small>{sub}</small>}
      </span>
      {right}
    </div>
  );
}

export function Btn({ children, onClick, disabled, kind = "solid" }: { children: React.ReactNode; onClick(): void; disabled?: boolean; kind?: "solid" | "soft" }) {
  return (
    <button className={`pa-btn is-${kind}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function Amount({ value, onChange, quick }: { value: string; onChange(v: string): void; quick: number[] }) {
  return (
    <div className="pa-amount">
      <label>
        <span>₦</span>
        <input inputMode="numeric" placeholder="0" value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 9))} aria-label="Amount in naira" />
      </label>
      <div className="pa-chips">
        {quick.map((q) => (
          <button key={q} className="pa-chip" onClick={() => onChange(String(q))}>
            {naira(q)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ LifeChat

export function Chat({ state, act, startCall, refresh }: { state: GameState; act: Act; startCall(id: string): void; refresh(): void }) {
  const [current, setCurrent] = useState<string | null>(null);
  useBackHandler(current ? () => setCurrent(null) : null);
  const contacts = contactsFor(state.profile);
  const endRef = useRef<HTMLDivElement>(null);
  const t = current ? state.phone.threads[current] : undefined;
  // Scroll the message list itself. scrollIntoView would also scroll every ancestor, including the (overflow: hidden) phone screen, and shift the whole app out of view.
  useEffect(() => {
    const list = endRef.current?.parentElement;
    if (list) list.scrollTop = list.scrollHeight;
  }, [t?.messages.length, current]);

  if (!current) {
    return (
      <div className="pa-page">
        <p className="pa-section">Messages</p>
        <div className="pa-group">
          {contacts.map((c) => {
            const th = state.phone.threads[c.id];
            const last = th?.messages.at(-1);
            return (
              <button
                key={c.id}
                className="pa-chat-row"
                onClick={() => {
                  markThreadRead(state, c.id);
                  setCurrent(c.id);
                  refresh();
                }}
              >
                <span className={`pa-avatar tone-${c.id.length % 5}`}>{c.name[0]}</span>
                <span className="pa-row-main">
                  <strong>{c.name}</strong>
                  <small>{last ? `${last.from === "me" ? "You: " : ""}${last.text}` : c.role}</small>
                </span>
                <span className="pa-chat-meta">
                  {last && <small>{clockOf(last.minute).label}</small>}
                  {th && th.unread > 0 && <span className="pa-badge">{th.unread}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const who = contacts.find((c) => c.id === current)!;
  const beat = t?.pending ? beatById(t.pending) : undefined;
  return (
    <div className="pa-thread">
      <div className="pa-thread-head">
        <span className={`pa-avatar sm tone-${who.id.length % 5}`}>{who.name[0]}</span>
        <span className="pa-row-main">
          <strong>{who.name}</strong>
          <small>{who.role}</small>
        </span>
        {who.callable && (
          <button className="pa-icon-btn" onClick={() => startCall(current)} aria-label={`Call ${who.name}`}>
            <Icon name="call" size={20} />
          </button>
        )}
      </div>
      <div className="pa-bubbles">
        {(t?.messages ?? []).length === 0 && <p className="pa-empty">No messages yet.</p>}
        {t?.messages.map((m, i) => (
          <div key={i} className={`pa-bubble ${m.from}`}>
            {m.text}
            <small>{clockOf(m.minute).label}</small>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="pa-compose">
        {beat?.options && (
          <div className="pa-chips">
            {beat.options.map((o, i) => (
              <button key={i} className="pa-chip is-accent" onClick={() => act((s) => replyToThread(s, current, i))}>
                {o.label}
              </button>
            ))}
          </div>
        )}
        <div className="pa-input">
          <span>{who.talks ? (beat ? "Choose a reply above" : "Nothing to reply to right now") : "You can't reply to this sender"}</span>
          <Icon name="send" size={18} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ LifePay

type PayTab = "home" | "send" | "save" | "activity";

export function Pay({ state, act }: { state: GameState; act: Act }) {
  const [tab, setTab] = useState<PayTab>("home");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("family");
  const phone = state.phone;
  const banking = modelOf(phone).banking;
  const money = balance(state.ledger);
  const saved = balance(state.ledger, SAVINGS);
  const n = Number(amount) || 0;
  const people = contactsFor(state.profile).filter((c) => c.receivesMoney);
  const go = (t: PayTab) => {
    setTab(t);
    setAmount("");
  };
  const tabs: { id: PayTab; label: string; icon: IconName }[] = [
    { id: "home", label: "Home", icon: "home" },
    { id: "send", label: "Send", icon: "send" },
    ...(banking ? [{ id: "save" as const, label: "Save", icon: "save" as const }] : []),
    { id: "activity", label: "Activity", icon: "history" },
  ];

  return (
    <div className="pa-with-tabs">
      <div className="pa-page">
        {tab === "home" && (
          <>
            <div className="pa-card-bank">
              <span>Available balance</span>
              <strong>{naira(money)}</strong>
              <div className="pa-card-foot">
                <span>{state.profile ? `${state.profile.firstName} ${state.profile.surname}`.toUpperCase() : "LIFEPAY"}</span>
                <span>{banking ? `Savings ${naira(saved)}` : "•••• 4821"}</span>
              </div>
            </div>
            <div className="pa-quick">
              {([["send", "Send", "send", "send"], ["save", "Save", "save", "save"], ["save", "Borrow", "loan", "save"], ["activity", "History", "history", "activity"]] as const)
                .filter(([, , , target]) => banking || (target !== "save"))
                .map(([target, label, icon], i) => (
                  <button key={i} onClick={() => go(target as PayTab)}>
                    <span>
                      <Icon name={icon as IconName} size={22} />
                    </span>
                    {label}
                  </button>
                ))}
            </div>
            <p className="pa-section">Due</p>
            <div className="pa-group">
              <Row
                icon="home"
                title="Rent"
                sub={state.rentOwed > 0 ? `${naira(state.rentOwed)} owed` : state.profile && state.profile.rentPerWeek === 0 ? "Family house, nothing to pay" : "All paid"}
                right={<Btn disabled={state.rentOwed <= 0} onClick={() => act((s) => payRent(s))}>Pay</Btn>}
                tone="#f2a43a"
              />
              <Row
                icon="bolt"
                title="Water and power"
                sub={billPerWeek(state.profile) === 0 ? "Covered by your family" : phone.billOwed > 0 ? `${naira(phone.billOwed)} owed` : `${naira(BILL_PER_WEEK)} a week`}
                right={<Btn disabled={phone.billOwed <= 0} onClick={() => act((s) => payBill(s))}>Pay</Btn>}
                tone="#4d8bff"
              />
            </div>
            <label className="pa-switch">
              <span>
                <strong>Automatic payments</strong>
                <small>{phone.autoPay ? "Rent and bills are paid as soon as they're due." : "You pay them yourself. Rent gets a late fee after a day."}</small>
              </span>
              <input type="checkbox" checked={phone.autoPay} onChange={(e) => setAutoPay(state, e.target.checked)} />
              <i aria-hidden="true" />
            </label>
            <p className="pa-section">Airtime and data · {naira(phone.airtime)} · {MB(phone.dataMB)}</p>
            <div className="pa-group">
              {TOPUPS.map((item) => (
                <Row key={item.id} icon="topup" title={item.name} sub={item.blurb} right={<Btn kind="soft" onClick={() => act((s) => topUp(s, item.id))}>{naira(item.price)}</Btn>} tone="#16a99a" />
              ))}
            </div>
          </>
        )}

        {tab === "send" && (
          <>
            <p className="pa-section">Send money to</p>
            <div className="pa-people">
              {people.map((c) => (
                <button key={c.id} aria-pressed={to === c.id} onClick={() => setTo(c.id)}>
                  <span className={`pa-avatar tone-${c.id.length % 5}`}>{c.name[0]}</span>
                  {c.name}
                </button>
              ))}
            </div>
            <Amount value={amount} onChange={setAmount} quick={[500, 1000, 5000]} />
            <Btn disabled={n <= 0} onClick={() => act((s) => sendMoney(s, to, n)).ok && setAmount("")}>
              Send {n > 0 ? naira(n) : "money"}
            </Btn>
          </>
        )}

        {tab === "save" && (
          <>
            <div className="pa-card-soft">
              <span>Savings</span>
              <strong>{naira(saved)}</strong>
              <small>Earns 1% every week.</small>
            </div>
            <Amount value={amount} onChange={setAmount} quick={[1000, 5000, 20000]} />
            <div className="pa-split">
              <Btn disabled={n <= 0} onClick={() => act((s) => deposit(s, n)).ok && setAmount("")}>Save</Btn>
              <Btn kind="soft" disabled={n <= 0} onClick={() => act((s) => withdraw(s, n)).ok && setAmount("")}>Withdraw</Btn>
            </div>
            <p className="pa-section">Loan</p>
            {phone.loan ? (
              <div className="pa-card-soft is-warn">
                <span>You owe</span>
                <strong>{naira(phone.loan.owed)}</strong>
                <small>After two weeks a 5% charge is added every week.</small>
                <Btn disabled={n <= 0} onClick={() => act((s) => repay(s, n)).ok && setAmount("")}>Repay {n > 0 ? naira(n) : ""}</Btn>
              </div>
            ) : (
              <div className="pa-card-soft">
                <span>Borrow up to</span>
                <strong>{naira(loanLimit(state.profile))}</strong>
                <small>You pay back 10% extra. Enter an amount above.</small>
                <Btn disabled={n <= 0} onClick={() => act((s) => borrow(s, n)).ok && setAmount("")}>Borrow {n > 0 ? naira(n) : ""}</Btn>
              </div>
            )}
          </>
        )}

        {tab === "activity" && (
          <>
            <p className="pa-section">Recent activity</p>
            <div className="pa-group">
              {[...state.ledger.entries].reverse().filter((e) => e.from === "player" || e.to === "player" || e.from === SAVINGS || e.to === SAVINGS).slice(0, 30).map((e) => {
                const internal = (e.from === "player" && e.to === SAVINGS) || (e.from === SAVINGS && e.to === "player");
                const incoming = e.to === "player" || (e.to === SAVINGS && e.from !== "player");
                const c = clockOf(e.minute);
                return (
                  <Row
                    key={e.id}
                    icon={internal ? "swap" : incoming ? "arrowIn" : "arrowOut"}
                    tone={internal ? "#7a8cff" : incoming ? "#1f9d5c" : "#d9534f"}
                    title={e.reason}
                    sub={`${lagosDateLabel(c.day)} · ${c.label}`}
                    right={<strong className={internal ? "" : incoming ? "pa-in" : "pa-out"}>{internal ? "" : incoming ? "+" : "−"}{naira(e.amount)}</strong>}
                  />
                );
              })}
              {state.ledger.entries.length === 0 && <p className="pa-empty">No transactions yet.</p>}
            </div>
          </>
        )}
      </div>
      <Tabs tabs={tabs} value={tab} onChange={go} />
    </div>
  );
}

// ------------------------------------------------------------------ LifeShop

export function Shop({ state, act, session }: { state: GameState; act: Act; session: GameSession }) {
  const [tab, setTab] = useState<"food" | "power" | "phones">("food");
  const phone = state.phone;
  const scale = session.sim.traits.groceries;
  const kinds = { food: ["grocery"], power: ["charger", "powerbank"], phones: ["phone"] }[tab];
  const items = SHOP_ITEMS.filter((i) => kinds.includes(i.kind));
  const time = (m: number) => (m >= 60 ? `${Math.round(m / 60)} h` : `${m} min`);
  const art: Record<string, IconName> = { grocery: "shop", charger: "plug", powerbank: "bolt", phone: "call" };
  return (
    <div className="pa-with-tabs">
      <div className="pa-page">
        {phone.orders.length > 0 && (
          <>
            <p className="pa-section">On the way</p>
            <div className="pa-group">
              {phone.orders.map((o) => (
                <Row key={o.id} icon="truck" tone="#ef5f5f" title={shopItemById(o.itemId)?.name ?? "Order"} sub={`Arrives in about ${time(Math.max(1, Math.round(o.arrivesAt - state.minute)))}`} />
              ))}
            </div>
          </>
        )}
        <p className="pa-section">{{ food: "Groceries", power: "Chargers and power", phones: "Phones" }[tab]}</p>
        <div className="pa-products">
          {items.map((item) => {
            const price = itemPrice(state, item, scale);
            const fee = deliveryFee(price);
            const have = (item.kind === "charger" && phone.chargers.includes(item.id)) || (item.kind === "powerbank" && phone.powerBank.owned) || (item.kind === "phone" && item.tier === phone.model);
            const fits = item.kind === "charger" ? CHARGERS.find((c) => c.id === item.id)?.ports.some((p) => modelOf(phone).ports.includes(p)) : true;
            return (
              <div key={item.id} className="pa-product">
                <span className={`pa-product-art kind-${item.kind}`}>
                  <Icon name={art[item.kind] ?? "shop"} size={34} />
                </span>
                <strong>{item.name}</strong>
                <small>{item.blurb}</small>
                <small className="pa-fine">
                  {time(item.deliveryMinutes)} · {fee ? `+${naira(fee)} delivery` : "free delivery"}
                  {item.kind === "charger" && !fits ? " · won't fit your phone" : ""}
                </small>
                <Btn disabled={have} onClick={() => act((s) => placeOrder(s, item.id, scale))}>
                  {have ? (item.kind === "phone" ? "Your phone" : "Owned") : naira(price)}
                </Btn>
              </div>
            );
          })}
        </div>
      </div>
      <Tabs<"food" | "power" | "phones">
        tabs={[{ id: "food", label: "Food", icon: "shop" }, { id: "power", label: "Power", icon: "plug" }, { id: "phones", label: "Phones", icon: "call" }]}
        value={tab}
        onChange={setTab}
      />
    </div>
  );
}

// ------------------------------------------------------------------ LifeJobs

export function Jobs({ state, act }: { state: GameState; act: Act }) {
  const phone = state.phone;
  const levels = { computer: skillLevel(state.skills.computer ?? 0), knowledge: skillLevel(state.skills.knowledge ?? 0) };
  const current = JOBS.find((j) => j.id === phone.job);
  return (
    <div className="pa-page">
      {current && (
        <div className="pa-card-soft is-good">
          <span>Your job</span>
          <strong>{current.title}</strong>
          <small>{current.employer} · {naira(current.retainer)} a week · work pays ×{current.payBoost}</small>
          <Btn kind="soft" onClick={() => act((s) => quitJob(s))}>Quit</Btn>
        </div>
      )}
      {phone.application && <p className="pa-note">Waiting to hear back from {JOBS.find((j) => j.id === phone.application!.jobId)?.employer}…</p>}
      <p className="pa-section">Open positions</p>
      <div className="pa-group">
        {JOBS.map((job) => {
          const have = levels[job.requires.skill];
          const ok = have >= job.requires.level;
          return (
            <div key={job.id} className="pa-job">
              <span className="pa-mono">{job.employer[0]}</span>
              <span className="pa-row-main">
                <strong>{job.title}</strong>
                <small>{job.employer} · {naira(job.retainer)} a week</small>
                <small className={ok ? "pa-in" : "pa-out"}>Needs {job.requires.skill} {job.requires.level}{ok ? " (met)" : ` (you have ${have})`}</small>
              </span>
              <Btn disabled={phone.job === job.id || !!phone.application} onClick={() => act((s) => applyForJob(s, job.id))}>
                {phone.job === job.id ? "Hired" : "Apply"}
              </Btn>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ LifeNews and LifeMaps

export function News({ state }: { state: GameState }) {
  const [open, setOpen] = useState<string | null>(null);
  const items = newsFor(clockOf(state.minute).day);
  const [hero, ...rest] = items;
  return (
    <div className="pa-page">
      {hero && (
        <button className="pa-hero" onClick={() => setOpen(open === hero.id ? null : hero.id)}>
          <span className="pa-tag">{hero.tag}</span>
          <strong>{hero.headline}</strong>
          {open === hero.id && <small>{hero.body}</small>}
        </button>
      )}
      <p className="pa-section">More stories</p>
      <div className="pa-group">
        {rest.map((n) => (
          <button key={n.id} className="pa-story" onClick={() => setOpen(open === n.id ? null : n.id)} aria-expanded={open === n.id}>
            <span className="pa-tag">{n.tag}</span>
            <strong>{n.headline}</strong>
            {open === n.id && <small>{n.body}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Maps({ state }: { state: GameState }) {
  const district = getDistrict();
  const [pick, setPick] = useState<string | null>(null);
  useBackHandler(pick ? () => setPick(null) : null);
  const home = { x: district.spawn.x, z: district.spawn.z };
  const dark = state.phone.model === "flagship";
  const walk = (lm: { entrance: { x: number; z: number } }) => Math.round(Math.hypot(lm.entrance.x - home.x, lm.entrance.z - home.z));
  const list = [...district.landmarks].sort((a, b) => walk(a) - walk(b));
  const chosen = district.landmarks.find((l) => l.id === pick) ?? null;
  return (
    <div className="pa-maps">
      <div className="pa-map">
        <DistrictMap district={district} home={home} player={home} selected={pick} onSelect={setPick} dark={dark} />
      </div>
      <div className="pa-sheet">
        <div className="pa-grabber" />
        {chosen ? (
          <div className="pa-card-soft">
            <span>{PIN_STYLE[chosen.kind].label}</span>
            <strong>{chosen.name}</strong>
            <small>{walk(chosen)} m from home · about {Math.max(1, Math.round(walk(chosen) / 90))} min on foot</small>
          </div>
        ) : (
          <>
            <p className="pa-section">Places around you</p>
            <div className="pa-group">
              {list.map((lm) => (
                <button key={lm.id} className="pa-place" onClick={() => setPick(lm.id)}>
                  <Row icon="maps" tone={PIN_STYLE[lm.kind].colour} title={lm.name} sub={PIN_STYLE[lm.kind].label} right={<small>{walk(lm)} m</small>} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Power (charging)

export function Battery({ state, act, onModel }: { state: GameState; act: Act; onModel(tier: "basic" | "mid" | "flagship"): void }) {
  const phone = state.phone;
  const model = modelOf(phone);
  const best = bestCharger(phone);
  const wall = wallPower(state);
  const cut = powerCutOn(clockOf(state.minute).day);
  const pct = Math.round(phone.battery);
  const r = 52;
  const C = 2 * Math.PI * r;
  return (
    <div className="pa-page">
      <div className="pa-gauge">
        <svg viewBox="0 0 128 128" aria-hidden="true">
          <circle cx="64" cy="64" r={r} className="pa-gauge-track" />
          <circle cx="64" cy="64" r={r} className={`pa-gauge-fill${pct <= 20 ? " is-low" : ""}`} strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} transform="rotate(-90 64 64)" />
        </svg>
        <div>
          <strong>{pct}%</strong>
          <small>{phone.plugged ? (phone.plugged === "wall" && !wall ? "Plugged in, no power" : "Charging") : "On battery"}</small>
        </div>
      </div>
      <p className="pa-fine center">{model.name} · {model.ports.join(" / ")} port · up to {model.maxCharge}% an hour · {model.screen}</p>
      <div className="pa-group">
        <Row icon="bolt" tone="#f2a43a" title="Mains power" sub={`${wall ? "On" : phone.billOwed >= BILL_PER_WEEK * 2 ? "Cut off: unpaid bill" : "Power cut right now"}${cut && !isPowerCut(state.minute) && state.minute < cut.endMinute && cut.announced ? ` · cut planned ${hhmm(cut.startMinute)}–${hhmm(cut.endMinute)}` : ""}`} />
        <Row
          icon="plug"
          tone="#4d8bff"
          title="Charger"
          sub={best ? `${best.name} · ${best.rate}% an hour` : "None that fit this phone. Order one in LifeShop."}
          right={
            phone.plugged === "wall" ? <Btn kind="soft" onClick={() => act((s) => plug(s, null))}>Unplug</Btn> : <Btn disabled={!best} onClick={() => act((s) => plug(s, "wall"))}>Plug in</Btn>
          }
        />
        {phone.powerBank.owned && (
          <>
            <Row
              icon="bolt"
              tone="#16a99a"
              title="Power bank"
              sub={`${Math.round(phone.powerBank.charge)} of ${POWER_BANK.capacity} units`}
              right={phone.plugged === "bank" ? <Btn kind="soft" onClick={() => act((s) => plug(s, null))}>Unplug</Btn> : <Btn onClick={() => act((s) => plug(s, "bank"))}>Use</Btn>}
            />
            <label className="pa-switch">
              <span>
                <strong>Charge the power bank</strong>
                <small>From the wall, while there is power.</small>
              </span>
              <input type="checkbox" checked={phone.bankCharging} onChange={(e) => act((s) => setBankCharging(s, e.target.checked))} />
              <i aria-hidden="true" />
            </label>
          </>
        )}
      </div>
      {!isOnline() && (
        <>
          <p className="pa-section">Playtest: try another phone</p>
          <div className="pa-seg">
            {(["basic", "mid", "flagship"] as const).map((t) => (
              <button key={t} aria-pressed={phone.model === t} onClick={() => onModel(t)}>
                {{ basic: "Go", mid: "Plus", flagship: "Max" }[t]}
              </button>
            ))}
          </div>
          <p className="pa-fine center">Swaps the phone you hold so you can see each one. In the real game you buy phones in LifeShop.</p>
        </>
      )}
    </div>
  );
}
