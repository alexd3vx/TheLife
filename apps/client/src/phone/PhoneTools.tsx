import { GameIcon, type FaName } from "../ui/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AJO_AMOUNT, AJO_MEMBERS, COURSES, DIARY_MOODS, EATS_MENU, HEALTH_TIPS, LANGS, LESSON_XP, PHRASES, PRAYER_TIMES, STATIONS, STOCKS, VERSES,
  addNote, balance, buyShares, buyTicket, clockOf, connection, deleteNote, diaryCheckIn, diaryDone, eventsFor, feedPosts, filmsFor, joinAjo, moodLabel,
  nextLessonIn, orderEats, payAjo, portfolioValue, powerCutOn, ratesFor, sellShares, skillLevel, sparkProfiles, stockPrice, streamData, takeLesson, weatherFor,
  type GameState, type Lang,
} from "@thelife/game-core";
import { Btn, MB, Row, naira, type Act } from "./PhoneApps";
import { Icon } from "./icons";

type P = { state: GameState; act: Act };
const dayOf = (s: GameState) => clockOf(s.minute).day;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ------------------------------------------------------------------ tools

export function Notes({ state, act }: P) {
  const [text, setText] = useState("");
  return (
    <div className="pa-page">
      <textarea className="pa-textarea" rows={4} maxLength={400} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a note…" aria-label="New note" />
      <Btn onClick={() => act((s) => { const r = addNote(s, text); if (r.ok) setText(""); return r; })}>Save note</Btn>
      <div className="pa-group">
        {state.phone.notes.length === 0 && <p className="pa-empty">No notes yet.</p>}
        {state.phone.notes.map((n, i) => (
          <div key={i} className="pa-row">
            <span className="pa-row-main"><small>{n}</small></span>
            <button className="pa-icon-btn" aria-label="Delete note" onClick={() => act((s) => deleteNote(s, i))}><Icon name="trash" size={18} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Calendar({ state }: P) {
  const day = dayOf(state);
  const rentIn = Math.max(0, state.lastRentDay + 7 - day);
  const days = Array.from({ length: 7 }, (_, i) => day + i);
  return (
    <div className="pa-page">
      <div className="pa-card-soft">
        <span>{WEEKDAYS[(day - 1) % 7]} · Day {day}</span>
        <strong>{clockOf(state.minute).label}</strong>
        <small>{state.profile && state.profile.rentPerWeek > 0 ? `Rent of ${naira(state.profile.rentPerWeek)} due in ${rentIn} day${rentIn === 1 ? "" : "s"}.` : "You live in the family house: no rent."}</small>
      </div>
      <p className="pa-section">This week</p>
      <div className="pa-group">
        {days.map((d) => {
          const cut = powerCutOn(d);
          const ev = eventsFor(d).filter((e) => e.inDays === 0);
          return (
            <Row key={d} icon="calendar" tone={d === day ? "#e2453c" : "#8a94a6"} title={`${WEEKDAYS[(d - 1) % 7]} · Day ${d}`} sub={[cut?.announced ? "Power cut planned" : "", ...ev.map((e) => e.title)].filter(Boolean).join(" · ") || "Nothing planned"} />
          );
        })}
      </div>
    </div>
  );
}

const SKY_ICON: Record<string, FaName> = { sunny: "sunny", cloudy: "cloudy", rain: "rain", storm: "storm" };
export function Weather({ state }: P) {
  const day = dayOf(state);
  const today = weatherFor(day);
  return (
    <div className="pa-page">
      <div className="pa-card-soft">
        <span>Today</span>
        <strong><GameIcon name={SKY_ICON[today.sky]!} size={26} /> {today.highC}°C</strong>
        <small>{today.label} · low {today.lowC}° · {today.rainChance}% chance of rain</small>
      </div>
      <div className="pa-group">
        {[1, 2, 3, 4, 5].map((i) => {
          const w = weatherFor(day + i);
          return <Row key={i} icon="cloud" title={`${WEEKDAYS[(day + i - 1) % 7]} · ${w.highC}° / ${w.lowC}°`} sub={`${w.label} · ${w.rainChance}% rain`} />;
        })}
      </div>
    </div>
  );
}

export function Torch() {
  const [on, setOn] = useState(true);
  return (
    <div className="pa-page" style={on ? { background: "#fffbe6", color: "#4b3d00" } : undefined}>
      <div className="pa-big" aria-live="polite">{on ? "Torch is on" : "Torch is off"}</div>
      <p className="pa-fine center">The screen glows bright so you can see during a power cut. It uses battery.</p>
      <Btn onClick={() => setOn((v) => !v)}>{on ? "Turn off" : "Turn on"}</Btn>
    </div>
  );
}

export function Calculator() {
  const [shown, setShown] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [fresh, setFresh] = useState(true);
  const apply = (a: number, b: number, o: string) => (o === "+" ? a + b : o === "−" ? a - b : o === "×" ? a * b : o === "÷" ? (b === 0 ? NaN : a / b) : b);
  const fmt = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 1e8) / 1e8) : "Error");
  const press = (k: string) => {
    if (/\d/.test(k) || k === ".") {
      if (k === "." && shown.includes(".") && !fresh) return;
      setShown(fresh ? (k === "." ? "0." : k) : shown.length > 12 ? shown : shown === "0" && k !== "." ? k : shown + k);
      setFresh(false);
    } else if (k === "C") {
      setShown("0"); setAcc(null); setOp(null); setFresh(true);
    } else if (k === "±") setShown(fmt(-Number(shown)));
    else if (k === "%") setShown(fmt(Number(shown) / 100));
    else {
      const cur = Number(shown);
      const next = acc !== null && op && !fresh ? apply(acc, cur, op) : cur;
      setShown(fmt(next));
      setAcc(k === "=" ? null : next);
      setOp(k === "=" ? null : k);
      setFresh(true);
    }
  };
  const keys = ["C", "±", "%", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "0", ".", "="];
  return (
    <div className="pa-page">
      <div className="pa-big" style={{ textAlign: "right", fontSize: "2.6rem" }}>{shown}</div>
      <div className="pa-calc">
        {keys.map((k) => (
          <button key={k} className={"÷×−+=".includes(k) ? "is-op" : ""} style={k === "0" ? { gridColumn: "span 2" } : undefined} onClick={() => press(k)}>{k}</button>
        ))}
      </div>
    </div>
  );
}

const fmtMs = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(Math.floor(ms / 100) % 10)}`;
export function Clock({ state }: P) {
  const [watch, setWatch] = useState({ running: false, start: 0, base: 0 });
  const [now, setNow] = useState(performance.now());
  const [timer, setTimer] = useState<{ end: number } | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = watch.base + (watch.running ? now - watch.start : 0);
  const left = timer ? Math.max(0, timer.end - now) : 0;
  const c = clockOf(state.minute);
  return (
    <div className="pa-page">
      <div className="pa-card-soft"><span>Game time</span><strong>{c.label}</strong><small>Day {c.day}</small></div>
      <p className="pa-section">Stopwatch</p>
      <div className="pa-big">{fmtMs(elapsed)}</div>
      <div className="pa-split">
        <Btn onClick={() => setWatch((w) => (w.running ? { running: false, start: 0, base: w.base + performance.now() - w.start } : { ...w, running: true, start: performance.now() }))}>{watch.running ? "Stop" : "Start"}</Btn>
        <Btn kind="soft" onClick={() => setWatch({ running: false, start: 0, base: 0 })}>Reset</Btn>
      </div>
      <p className="pa-section">Timer</p>
      <div className="pa-big">{timer && left > 0 ? fmtMs(left) : timer ? "Time's up!" : "0:00.0"}</div>
      <div className="pa-chips">
        {[1, 5, 10, 25].map((m) => <button key={m} className="pa-chip" onClick={() => setTimer({ end: performance.now() + m * 60000 })}>{m} min</button>)}
        {timer && <button className="pa-chip" onClick={() => setTimer(null)}>Clear</button>}
      </div>
    </div>
  );
}

export function Translate() {
  const [from, setFrom] = useState<Lang>("English");
  const [to, setTo] = useState<Lang>("Yoruba");
  const [q, setQ] = useState("");
  const rows = PHRASES.filter((p) => !q || p[from].toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="pa-page">
      <div className="pa-split">
        <select className="pa-text" value={from} onChange={(e) => setFrom(e.target.value as Lang)} aria-label="From">{LANGS.map((l) => <option key={l}>{l}</option>)}</select>
        <select className="pa-text" value={to} onChange={(e) => setTo(e.target.value as Lang)} aria-label="To">{LANGS.map((l) => <option key={l}>{l}</option>)}</select>
      </div>
      <label className="pa-search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${from}`} aria-label="Search phrases" /></label>
      <div className="pa-group">
        {rows.map((p, i) => <Row key={i} title={p[to]} sub={p[from]} />)}
        {rows.length === 0 && <p className="pa-empty">No phrase found.</p>}
      </div>
    </div>
  );
}

export function Rates({ state }: P) {
  const day = dayOf(state);
  const [amount, setAmount] = useState("100");
  const n = Number(amount) || 0;
  return (
    <div className="pa-page">
      <div className="pa-group">
        {ratesFor(day).map((r) => {
          const y = ratesFor(day - 1).find((x) => x.code === r.code)!.naira;
          return <Row key={r.code} icon="swap" tone="#2f9e44" title={`${r.code} · ${naira(r.naira)}`} sub={`${r.name} · ${r.naira >= y ? "Up" : "Down"} ${Math.abs(r.naira - y)} since yesterday`} />;
        })}
      </div>
      <p className="pa-section">Convert</p>
      <input className="pa-text" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Amount in foreign currency" />
      <div className="pa-group">
        {ratesFor(day).map((r) => <Row key={r.code} title={`${n.toLocaleString()} ${r.code}`} sub={`= ${naira(n * r.naira)}`} />)}
      </div>
    </div>
  );
}

export function NetCheck({ state }: P) {
  const link = connection(state);
  const [result, setResult] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const run = () => {
    setBusy(true);
    window.setTimeout(() => {
      setResult(link.kind === "none" ? 0 : Math.round(link.speed * 8 * (0.7 + Math.random() * 0.5)) / 10);
      setBusy(false);
    }, 1400);
  };
  return (
    <div className="pa-page">
      <div className="pa-card-soft">
        <span>Connection</span>
        <strong>{link.kind === "none" ? "Offline" : link.label}</strong>
        <small>{link.kind === "wifi" ? "Home Wi-Fi" : link.kind === "data" ? `Mobile data · ${MB(state.phone.dataMB)} left` : "No Wi-Fi and no mobile data."}</small>
      </div>
      <div className="pa-big">{busy ? "…" : result === null ? "–" : `${result} Mbps`}</div>
      <Btn onClick={run} disabled={busy}>{busy ? "Testing…" : "Run speed test"}</Btn>
      <p className="pa-fine center">Real download speeds in the game are about {link.speed} MB per game minute.</p>
    </div>
  );
}

// ------------------------------------------------------------------ social and media

export function Feed({ kind, state }: P & { kind: "gram" | "chirp" }) {
  const day = dayOf(state);
  const [pages, setPages] = useState(1);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const posts = useMemo(() => Array.from({ length: pages }, (_, i) => feedPosts(kind, day, i)).flat(), [kind, day, pages]);
  return (
    <div className="pa-page">
      <div className="pa-feed">
        {posts.map((p) => (
          <article key={p.id} className="pa-post">
            <header>
              <span className="pa-avatar sm" style={{ background: `hsl(${p.hue} 65% 50%)` }}>{p.author[0]}</span>
              <span><strong>{p.author}</strong><small>{p.handle}</small></span>
            </header>
            {kind === "gram" && <div className="pa-hue" style={{ background: `linear-gradient(135deg, hsl(${p.hue} 70% 62%), hsl(${(p.hue + 60) % 360} 70% 38%))` }}><Icon name="photo" size={36} /></div>}
            <p>{p.text}</p>
            <button className={`pa-like${liked.has(p.id) ? " is-on" : ""}`} onClick={() => setLiked((l) => { const n = new Set(l); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} aria-pressed={liked.has(p.id)}>
              <Icon name="heart" size={16} /> {p.likes + (liked.has(p.id) ? 1 : 0)}
            </button>
          </article>
        ))}
      </div>
      <Btn kind="soft" onClick={() => setPages((n) => n + 1)}>Load more</Btn>
    </div>
  );
}

export function Spark({ state }: P) {
  const day = dayOf(state);
  const profiles = useMemo(() => sparkProfiles(day, 8), [day]);
  const [i, setI] = useState(0);
  const [matches, setMatches] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const cur = profiles[i];
  const choose = (like: boolean) => {
    if (!cur) return;
    if (like && (cur.age + cur.hue) % 3 !== 0) {
      setMatches((m) => [...m, `${cur.name}, ${cur.age} · ${cur.job}`]);
      setMsg(`It's a match with ${cur.name}!`);
    } else setMsg(like ? `${cur.name} hasn't answered yet.` : "");
    setI(i + 1);
  };
  return (
    <div className="pa-page">
      {cur ? (
        <div className="pa-post">
          <div className="pa-hue" style={{ height: 180, background: `linear-gradient(135deg, hsl(${cur.hue} 70% 62%), hsl(${(cur.hue + 60) % 360} 70% 38%))` }}><Icon name="people" size={44} /></div>
          <strong>{cur.name}, {cur.age}</strong>
          <small>{cur.job}</small>
          <p>{cur.bio}</p>
          <div className="pa-split"><Btn kind="soft" onClick={() => choose(false)}>Pass</Btn><Btn onClick={() => choose(true)}>Like</Btn></div>
        </div>
      ) : <p className="pa-empty">That's everyone for today. Come back tomorrow.</p>}
      {msg && <div className="pa-note" role="status">{msg}</div>}
      <p className="pa-section">Matches</p>
      <div className="pa-group">
        {matches.length === 0 && <p className="pa-empty">No matches yet.</p>}
        {matches.map((m, k) => <Row key={k} icon="heart" tone="#e03131" title={m} />)}
      </div>
    </div>
  );
}

const VIDEO_TITLES = ["Lagos street food tour", "How to fix a phone screen", "Funniest danfo moments", "Afrobeats dance class", "Budget meals for the week", "Why does the light go off?", "Interview tips that work", "Build a shelf from scratch"];
export function Tube({ state, act }: P) {
  const [playing, setPlaying] = useState<{ title: string; start: number } | null>(null);
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  const day = dayOf(state);
  const done = playing ? Math.min(1, (now - playing.start) / 20000) : 0;
  return (
    <div className="pa-page">
      {playing && (
        <div className="pa-post">
          <div className="pa-hue" style={{ height: 150, background: "#111" }}><Icon name="play" size={44} /></div>
          <strong>{playing.title}</strong>
          <div className="pa-bar"><i style={{ width: `${done * 100}%` }} /></div>
          <small>{done >= 1 ? "Finished" : "Playing…"}</small>
        </div>
      )}
      <div className="pa-group">
        {VIDEO_TITLES.slice(0, 6).map((t, i) => (
          <button key={t} className="pa-chat-row" onClick={() => act((s) => { const r = streamData(s, 15); if (r.ok) setPlaying({ title: t, start: performance.now() }); return r.ok ? { ok: true, text: "Streaming uses data (15 MB)." } : r; })}>
            <span className="pa-hue" style={{ width: 84, height: 52, borderRadius: 10, background: `linear-gradient(135deg, hsl(${(day * 40 + i * 55) % 360} 70% 55%), hsl(${(day * 40 + i * 55 + 70) % 360} 70% 35%))` }}><Icon name="play" size={18} /></span>
            <span className="pa-row-main"><strong>{t}</strong><small>{(5 + i * 3) % 12 + 2} min · {((i * 37 + day * 11) % 90) + 10}K views</small></span>
          </button>
        ))}
      </div>
    </div>
  );
}

const TRACKS = [
  ["Jollof Season", "Tolu B."], ["Late Night Danfo", "Kemi Ade"], ["Rainy Day Highlife", "The Old Guard"], ["Naira Dey Hustle", "Mc Chike"], ["Sunday Rice", "Amaka"], ["Power Don Go", "Voltage"],
] as const;
export function Tunes({ act }: P) {
  const [track, setTrack] = useState<number | null>(null);
  const [start, setStart] = useState(0);
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    if (track === null) return;
    const id = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(id);
  }, [track]);
  return (
    <div className="pa-page">
      {track !== null && (
        <div className="pa-card-soft">
          <span>Now playing</span>
          <strong>{TRACKS[track]![0]}</strong>
          <small>{TRACKS[track]![1]}</small>
          <div className="pa-bar"><i style={{ width: `${Math.min(100, ((now - start) / 30000) * 100)}%` }} /></div>
          <Btn kind="soft" onClick={() => setTrack(null)}>Stop</Btn>
        </div>
      )}
      <div className="pa-group">
        {TRACKS.map(([t, a], i) => (
          <Row key={t} icon="music" tone="#9c36b5" title={t} sub={a} right={<Btn kind="soft" onClick={() => act((s) => { const r = streamData(s, 3); if (r.ok) { setTrack(i); setStart(performance.now()); setNow(performance.now()); } return r; })}>Play</Btn>} />
        ))}
      </div>
      <p className="pa-fine center">Each song streams about 3 MB.</p>
    </div>
  );
}

export function Radio({ state, act }: P) {
  const [on, setOn] = useState<string | null>(null);
  const slot = Math.floor(((state.minute % 1440) / 1440) * 4);
  return (
    <div className="pa-page">
      <div className="pa-group">
        {STATIONS.map((s) => (
          <Row key={s.id} icon="radio" tone="#e8590c" title={s.name} sub={`${s.genre} · ${s.now[slot]}`} right={on === s.id ? <Btn kind="soft" onClick={() => setOn(null)}>Stop</Btn> : <Btn onClick={() => act((st) => { const r = streamData(st, 2); if (r.ok) setOn(s.id); return r; })}>Tune in</Btn>} />
        ))}
      </div>
      <p className="pa-fine center">Radio is light on data: about 2 MB to tune in.</p>
    </div>
  );
}

export function Cinema({ state, act }: P) {
  const films = filmsFor(dayOf(state));
  return (
    <div className="pa-page">
      <p className="pa-section">Showing today</p>
      <div className="pa-group">
        {films.map((f) => <Row key={f.id} icon="film" tone="#6741d9" title={f.title} sub={`${f.genre} · ${f.mins} min`} right={<Btn onClick={() => act((s) => buyTicket(s, f.title, f.price, 25))}>{naira(f.price)}</Btn>} />)}
      </div>
      <p className="pa-fine center">A night out lifts your mood.</p>
    </div>
  );
}

export function Events({ state, act }: P) {
  const events = eventsFor(dayOf(state));
  return (
    <div className="pa-page">
      <div className="pa-group">
        {events.length === 0 && <p className="pa-empty">Nothing on this week.</p>}
        {events.map((e) => <Row key={e.id} icon="ticket" tone="#d9480f" title={e.title} sub={`${e.place} · ${e.inDays === 0 ? "today" : `in ${e.inDays} day${e.inDays > 1 ? "s" : ""}`}`} right={<Btn onClick={() => act((s) => buyTicket(s, e.title, e.price, 12))}>{e.price ? naira(e.price) : "Join"}</Btn>} />)}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ life

export function Eats({ state, act }: P) {
  return (
    <div className="pa-page">
      <p className="pa-fine">Hot meals go straight to your kitchen. You have {state.inventory.meals} cooked meal{state.inventory.meals === 1 ? "" : "s"}. Delivery ₦500 (free over ₦10,000).</p>
      <div className="pa-group">
        {EATS_MENU.map((m) => <Row key={m.id} icon="food" tone="#d9480f" title={m.name} sub={`${m.blurb} · ${m.meals} meal${m.meals > 1 ? "s" : ""} · ~${m.minutes} min`} right={<Btn onClick={() => act((s) => orderEats(s, m.id))}>{naira(m.price)}</Btn>} />)}
      </div>
    </div>
  );
}

export function Invest({ state, act }: P) {
  const day = dayOf(state);
  return (
    <div className="pa-page">
      <div className="pa-card-soft"><span>Your shares are worth</span><strong>{naira(portfolioValue(state))}</strong><small>Cash {naira(balance(state.ledger))} · 1% fee on each trade. Prices move every day and can fall.</small></div>
      <div className="pa-group">
        {STOCKS.map((s) => {
          const price = stockPrice(s.symbol, day);
          const y = stockPrice(s.symbol, day - 1);
          const own = state.phone.holdings[s.symbol] ?? 0;
          return (
            <div key={s.symbol} className="pa-row">
              <span className="pa-row-main"><strong>{s.symbol} · {naira(price)}</strong><small>{s.name} · <b className={price >= y ? "pa-in" : "pa-out"}>{price >= y ? "Up" : "Down"} {Math.abs(((price - y) / y) * 100).toFixed(1)}%</b> · you own {own}</small></span>
              <Btn kind="soft" onClick={() => act((st) => buyShares(st, s.symbol, 1))}>Buy</Btn>
              <Btn kind="soft" disabled={own === 0} onClick={() => act((st) => sellShares(st, s.symbol, 1))}>Sell</Btn>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Ajo({ state, act }: P) {
  const a = state.phone.ajo;
  const active = a && a.contributed < AJO_MEMBERS;
  return (
    <div className="pa-page">
      <div className="pa-card-soft">
        <span>Ajo thrift group</span>
        <strong>{active ? `${a!.contributed} of ${AJO_MEMBERS} weeks` : "Not in a group"}</strong>
        <small>{AJO_MEMBERS} people each pay {naira(AJO_AMOUNT)} a week. Every week one member collects the pot of {naira(AJO_AMOUNT * AJO_MEMBERS)}. A steady way to save.</small>
        {active ? <Btn onClick={() => act((s) => payAjo(s))}>Pay {naira(AJO_AMOUNT)} for this week</Btn> : <Btn onClick={() => act((s) => joinAjo(s))}>Join a new group</Btn>}
      </div>
      {active && <p className="pa-fine">{a!.paidOut ? "You have already collected your pot. Keep paying until the group finishes." : "Your turn to collect comes at a week the group has drawn for you."}</p>}
    </div>
  );
}

export function Learn({ state, act }: P) {
  const wait = nextLessonIn(state);
  return (
    <div className="pa-page">
      <p className="pa-fine">Each lesson gives {LESSON_XP} skill points and uses a little energy. Rest {wait > 0 ? `${wait} min until the next one.` : "— you're ready for the next lesson."}</p>
      <div className="pa-group">
        {COURSES.map((c) => {
          const done = state.phone.courses[c.id] ?? 0;
          return (
            <div key={c.id} className="pa-row">
              <span className="pa-row-main">
                <strong>{c.title}</strong>
                <small>{done >= c.lessons.length ? "Finished" : `Next: ${c.lessons[done]}`} · {done}/{c.lessons.length} · {c.skill} level {skillLevel(state.skills[c.skill] ?? 0)}</small>
                <div className="pa-bar"><i style={{ width: `${(done / c.lessons.length) * 100}%` }} /></div>
              </span>
              <Btn disabled={done >= c.lessons.length} onClick={() => act((s) => takeLesson(s, c.id))}>Learn</Btn>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Health({ state }: P) {
  const n = state.needs;
  const worst = (Object.entries(n) as [keyof typeof n, number][]).sort((a, b) => a[1] - b[1])[0]!;
  const advice: Record<string, string> = { hunger: "You need to eat. Cook, or order in LifeEats.", energy: "You're tired. Sleep soon.", hygiene: "Have a shower: it lifts your mood too.", bladder: "Use the toilet.", fun: "Do something fun: call a friend, watch something, play a game." };
  return (
    <div className="pa-page">
      <div className="pa-card-soft"><span>How you are today</span><strong>{moodLabel(n)}</strong><small>{worst[1] < 40 ? advice[worst[0]] : "You're doing fine. Keep it up."}</small></div>
      <div className="pa-group">{HEALTH_TIPS.map((t) => <Row key={t.title} icon="cross" tone="#c92a2a" title={t.title} sub={t.text} />)}</div>
    </div>
  );
}

export function Faith({ state }: P) {
  const v = VERSES[(dayOf(state) - 1) % VERSES.length]!;
  return (
    <div className="pa-page">
      <div className="pa-card-soft"><span>Verse of the day</span><strong style={{ fontSize: "1.15rem", fontWeight: 600 }}>“{v.text}”</strong><small>{v.ref}</small></div>
      <p className="pa-section">Prayer times</p>
      <div className="pa-group">{PRAYER_TIMES.map((t) => <Row key={t.name} icon="faith" tone="#7048e8" title={t.name} sub={t.at} />)}</div>
    </div>
  );
}

export function Sleep({ state }: P) {
  const e = Math.round(state.needs.energy);
  return (
    <div className="pa-page">
      <div className="pa-card-soft">
        <span>Rested</span>
        <strong>{e}%</strong>
        <div className="pa-bar"><i style={{ width: `${e}%` }} /></div>
        <small>{e > 70 ? "Well rested." : e > 40 ? "Getting tired. Plan to sleep tonight." : "Exhausted. Everything is harder until you sleep."}</small>
      </div>
      <p className="pa-fine">Sleep in a bed for the best rest. Skipping sleep for several days will make you pass out.</p>
    </div>
  );
}

export function Diary({ state, act }: P) {
  const [moodPick, setMoodPick] = useState(3);
  const [text, setText] = useState("");
  const written = diaryDone(state);
  return (
    <div className="pa-page">
      {!written ? (
        <>
          <div className="pa-chips">
            {DIARY_MOODS.map((m) => <button key={m.id} className={`pa-chip${moodPick === m.id ? " is-accent" : ""}`} onClick={() => setMoodPick(m.id)}><GameIcon name={`m${m.id}` as FaName} /> {m.label}</button>)}
          </div>
          <textarea className="pa-textarea" rows={3} maxLength={160} value={text} onChange={(e) => setText(e.target.value)} placeholder="One line about today…" aria-label="Diary entry" />
          <Btn onClick={() => act((s) => diaryCheckIn(s, moodPick, text))}>Save today</Btn>
        </>
      ) : <div className="pa-note">You've written today. See you tomorrow.</div>}
      <div className="pa-group">
        {state.phone.diary.length === 0 && <p className="pa-empty">Your entries will show here.</p>}
        {[...state.phone.diary].reverse().map((d, i) => <Row key={i} title={`Day ${d.day} · ${DIARY_MOODS.find((m) => m.id === d.mood)?.label ?? ""}`} sub={d.text || "—"} />)}
      </div>
    </div>
  );
}
