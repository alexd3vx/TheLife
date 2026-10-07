import { GameIcon, type FaName } from "../ui/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FILMS, GIGS, GIG_GAP_MINUTES, HANG_WORDS, PLAYER, PODCASTS, RECIPES, STORIES, WATER_GOAL, WORKOUTS, addFun, balance, billPerWeek, clockOf, fuelPrices, glassesToday, nextGigIn, nextWorkoutIn, wordOfDay, type GameState,
} from "@thelife/game-core";
import { bookTicket, addTodo, deleteTodo, doGig, doWorkout, drinkWater, finishFocus, payBill, payRent, recordScore, streamData, toggleTodo } from "./remote";
import { Btn, Row, naira, type Act } from "./PhoneApps";
import { Icon } from "./icons";
import { useAppActive, useBackHandler } from "./active";

type P = { state: GameState; act: Act };
const dayOf = (s: GameState) => clockOf(s.minute).day;

// ------------------------------------------------------------------ tools

const UNITS: Record<string, { label: string; units: [string, number][] }> = {
  length: { label: "Distance", units: [["metres", 1], ["kilometres", 1000], ["miles", 1609.344], ["feet", 0.3048]] },
  mass: { label: "Weight", units: [["kilograms", 1], ["grams", 0.001], ["pounds", 0.45359237], ["tonnes", 1000]] },
  volume: { label: "Volume", units: [["litres", 1], ["millilitres", 0.001], ["gallons (US)", 3.78541], ["cups", 0.236588]] },
};
export function Convert() {
  const [kind, setKind] = useState("length");
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(1);
  const [v, setV] = useState("1");
  const [temp, setTemp] = useState("30");
  const u = UNITS[kind]!.units;
  const out = ((Number(v) || 0) * u[from]![1]) / u[to]![1];
  const c = Number(temp) || 0;
  return (
    <div className="pa-page">
      <div className="pa-chips">{Object.entries(UNITS).map(([k, x]) => <button key={k} className={`pa-chip${kind === k ? " is-accent" : ""}`} onClick={() => { setKind(k); setFrom(0); setTo(1); }}>{x.label}</button>)}</div>
      <input className="pa-text" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Value" />
      <div className="pa-split">
        <select className="pa-text" value={from} onChange={(e) => setFrom(Number(e.target.value))} aria-label="From">{u.map(([n], i) => <option key={n} value={i}>{n}</option>)}</select>
        <select className="pa-text" value={to} onChange={(e) => setTo(Number(e.target.value))} aria-label="To">{u.map(([n], i) => <option key={n} value={i}>{n}</option>)}</select>
      </div>
      <div className="pa-card-soft"><span>Result</span><strong>{Math.round(out * 10000) / 10000}</strong><small>{u[to]![0]}</small></div>
      <p className="pa-section">Temperature</p>
      <input className="pa-text" inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value.replace(/[^\d.-]/g, ""))} aria-label="Degrees Celsius" />
      <p className="pa-fine">{c}°C = {Math.round((c * 9) / 5 + 32)}°F</p>
    </div>
  );
}

export function Split() {
  const [bill, setBill] = useState("12000");
  const [people, setPeople] = useState(4);
  const [tip, setTip] = useState(10);
  const total = (Number(bill) || 0) * (1 + tip / 100);
  return (
    <div className="pa-page">
      <input className="pa-text" inputMode="numeric" value={bill} onChange={(e) => setBill(e.target.value.replace(/\D/g, ""))} aria-label="Bill total" />
      <div className="pa-split"><Btn kind="soft" onClick={() => setPeople((p) => Math.max(1, p - 1))}>− person</Btn><Btn kind="soft" onClick={() => setPeople((p) => Math.min(30, p + 1))}>+ person</Btn></div>
      <div className="pa-chips">{[0, 5, 10, 15].map((t) => <button key={t} className={`pa-chip${tip === t ? " is-accent" : ""}`} onClick={() => setTip(t)}>{t}% tip</button>)}</div>
      <div className="pa-card-soft"><span>Each of {people} pays</span><strong>{naira(Math.ceil(total / people))}</strong><small>Total with tip {naira(total)}</small></div>
    </div>
  );
}

export function Todo({ state, act }: P) {
  const [text, setText] = useState("");
  return (
    <div className="pa-page">
      <div className="pa-split" style={{ gridTemplateColumns: "1fr auto" }}>
        <input className="pa-text" value={text} maxLength={120} onChange={(e) => setText(e.target.value)} placeholder="Add a reminder" aria-label="New reminder" onKeyDown={(e) => e.key === "Enter" && act((s) => { const r = addTodo(s, text); if (r.ok) setText(""); return r; })} />
        <Btn onClick={() => act((s) => { const r = addTodo(s, text); if (r.ok) setText(""); return r; })}>Add</Btn>
      </div>
      <div className="pa-group">
        {state.phone.todos.length === 0 && <p className="pa-empty">Nothing to do. Enjoy it.</p>}
        {state.phone.todos.map((t, i) => (
          <div key={i} className="pa-row">
            <button className="pa-icon-btn" aria-label={t.done ? "Mark not done" : "Mark done"} onClick={() => act((s) => toggleTodo(s, i))}><Icon name={t.done ? "check" : "plus"} size={18} /></button>
            <span className="pa-row-main"><strong style={t.done ? { textDecoration: "line-through", opacity: 0.55 } : undefined}>{t.text}</strong></span>
            <button className="pa-icon-btn" aria-label="Delete" onClick={() => act((s) => deleteTodo(s, i))}><Icon name="trash" size={18} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Budget({ state }: P) {
  const now = state.minute;
  const week = state.ledger.entries.filter((e) => now - e.minute <= 7 * 1440 && (e.from === PLAYER || e.to === PLAYER));
  const spent = new Map<string, number>();
  let earned = 0;
  for (const e of week) {
    if (e.from === PLAYER) spent.set(e.reason, (spent.get(e.reason) ?? 0) + e.amount);
    else earned += e.amount;
  }
  const out = [...spent.entries()].sort((a, b) => b[1] - a[1]);
  const total = out.reduce((s, [, v]) => s + v, 0);
  return (
    <div className="pa-page">
      <div className="pa-card-soft"><span>Balance</span><strong>{naira(balance(state.ledger))}</strong><small>Last 7 days: in {naira(earned)}, out {naira(total)}</small></div>
      <p className="pa-section">Where it went</p>
      <div className="pa-group">
        {out.length === 0 && <p className="pa-empty">No spending this week.</p>}
        {out.slice(0, 12).map(([reason, v]) => (
          <div key={reason} className="pa-row"><span className="pa-row-main"><strong>{reason}</strong><div className="pa-bar"><i style={{ width: `${(v / total) * 100}%` }} /></div></span><span className="pa-out">{naira(v)}</span></div>
        ))}
      </div>
    </div>
  );
}

export function Dice() {
  const [count, setCount] = useState(2);
  const [dice, setDice] = useState<number[]>([]);
  const roll = () => setDice(Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6)));
  return (
    <div className="pa-page">
      <div className="pa-chips">{[1, 2, 3, 4].map((n) => <button key={n} className={`pa-chip${count === n ? " is-accent" : ""}`} onClick={() => setCount(n)}>{n} dice</button>)}</div>
      <div className="pa-big" style={{ fontSize: "3rem", letterSpacing: ".2em" }}>{dice.length ? dice.map((d, i) => <GameIcon key={i} name={`d${d}` as FaName} size={44} />) : <GameIcon name="dice" size={44} />}</div>
      {dice.length > 0 && <p className="pa-fine center">Total {dice.reduce((a, b) => a + b, 0)}</p>}
      <Btn onClick={roll}>Roll</Btn>
    </div>
  );
}

export function Focus({ act }: P) {
  const active = useAppActive();
  const [left, setLeft] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const rest = useRef(0);
  useEffect(() => {
    if (left === null || done) return;
    const id = window.setInterval(() => {
      if (!active) return; // leaving the app breaks your focus
      setLeft((l) => (l === null ? l : Math.max(0, l - 1)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [left === null, done, active]);
  useEffect(() => {
    if (left === 0 && !done) {
      setDone(true);
      act((s) => finishFocus(s));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);
  void rest;
  const mm = left === null ? "5:00" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <div className="pa-page">
      <div className="pa-big" style={{ fontSize: "3.4rem" }}>{done ? "Done!" : mm}</div>
      <p className="pa-fine center">{left === null ? "Keep this app open for five minutes. Leaving it ends the session." : done ? "Great focus. Your knowledge grew." : "Stay with it…"}</p>
      <Btn onClick={() => { setLeft(300); setDone(false); }} disabled={left !== null && !done}>{left === null || done ? "Start" : "Focusing…"}</Btn>
    </div>
  );
}

export function Water({ state, act }: P) {
  const g = glassesToday(state);
  return (
    <div className="pa-page">
      <div className="pa-card-soft"><span>Today</span><strong>{g} / {WATER_GOAL} glasses</strong><div className="pa-bar"><i style={{ width: `${Math.min(100, (g / WATER_GOAL) * 100)}%` }} /></div><small>Reaching eight glasses gives a small boost.</small></div>
      <Btn onClick={() => act((s) => drinkWater(s))}>I drank a glass</Btn>
    </div>
  );
}

// ------------------------------------------------------------------ media

export function Books({ state, act }: P) {
  const [open, setOpen] = useState<string | null>(null);
  useBackHandler(open ? () => setOpen(null) : null);
  const story = STORIES.find((s) => s.id === open);
  void state; void act;
  return (
    <div className="pa-page">
      {story ? (
        <>
          <h2 style={{ margin: 0 }}>{story.title}</h2>
          <p style={{ lineHeight: 1.6 }}>{story.text}</p>
        </>
      ) : (
        <div className="pa-group">{STORIES.map((s) => <button key={s.id} className="pa-chat-row" onClick={() => setOpen(s.id)}><Icon name="bookopen" size={22} /><span className="pa-row-main"><strong>{s.title}</strong><small>{s.minutes} min read · works offline</small></span></button>)}</div>
      )}
    </div>
  );
}

export function Podcasts({ act }: P) {
  const [on, setOn] = useState<string | null>(null);
  return (
    <div className="pa-page">
      <div className="pa-group">
        {PODCASTS.map((p) => (
          <Row key={p.id} icon="mic" tone="#7048e8" title={p.ep} sub={`${p.title} · ${p.host} · ${p.minutes} min`} right={on === p.id ? <Btn kind="soft" onClick={() => setOn(null)}>Stop</Btn> : <Btn onClick={() => act((s) => { const r = streamData(s, 10); if (r.ok) setOn(p.id); return r; })}>Play</Btn>} />
        ))}
      </div>
      <p className="pa-fine center">An episode streams about 10 MB.</p>
    </div>
  );
}

export function Nolly({ state, act }: P) {
  const day = dayOf(state);
  return (
    <div className="pa-page">
      <p className="pa-section">Rent a film</p>
      <div className="pa-group">
        {FILMS.map((f) => (
          <Row key={f.id} icon="play" tone="#d9480f" title={f.title} sub={`${f.genre} · ${f.mins} min · streams about 60 MB`} right={<Btn onClick={() => act((s) => bookTicket(s, "rent", f.title))}>{naira(Math.round(f.price / 5 / 100) * 100 + 300)}</Btn>} />
        ))}
      </div>
      <p className="pa-fine center">Rentals lift your mood like a night in.</p>
    </div>
  );
}

// ------------------------------------------------------------------ life

export function Recipes() {
  const [open, setOpen] = useState<string | null>(null);
  useBackHandler(open ? () => setOpen(null) : null);
  const r = RECIPES.find((x) => x.id === open);
  return (
    <div className="pa-page">
      {r ? (
        <>
          <h2 style={{ margin: 0 }}>{r.name}</h2>
          <small className="pa-fine">{r.time}</small>
          <ol style={{ paddingLeft: 20, lineHeight: 1.55 }}>{r.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </>
      ) : <div className="pa-group">{RECIPES.map((x) => <button key={x.id} className="pa-chat-row" onClick={() => setOpen(x.id)}><Icon name="pot" size={22} /><span className="pa-row-main"><strong>{x.name}</strong><small>{x.time} · {x.steps.length} steps</small></span></button>)}</div>}
    </div>
  );
}

export function Fit({ state, act }: P) {
  const wait = nextWorkoutIn(state);
  return (
    <div className="pa-page">
      <p className="pa-fine">{wait > 0 ? `Next workout in ${wait} min.` : "Ready when you are."} Workouts use energy and make you hungry, but lift your mood.</p>
      <div className="pa-group">{WORKOUTS.map((w) => <Row key={w.id} icon="dumbbell" tone="#2b8a3e" title={w.name} sub={`${w.blurb} · −${w.energy} energy · +${w.fun} fun`} right={<Btn onClick={() => act((s) => doWorkout(s, w.id))}>Start</Btn>} />)}</div>
    </div>
  );
}

export function Bills({ state, act }: P) {
  const p = state.phone;
  const weekly = billPerWeek(state.profile);
  return (
    <div className="pa-page">
      <div className="pa-card-soft is-warn" style={state.rentOwed > 0 ? undefined : { borderColor: "var(--line)" }}>
        <span>Rent owed</span><strong>{naira(state.rentOwed)}</strong>
        <small>{state.profile && state.profile.rentPerWeek > 0 ? `${naira(state.profile.rentPerWeek)} a week.` : "You live in the family house."}</small>
        <Btn disabled={state.rentOwed <= 0} onClick={() => act((s) => payRent(s))}>Pay rent</Btn>
      </div>
      <div className="pa-card-soft" style={p.billOwed > 0 ? { borderColor: "#d9534f" } : undefined}>
        <span>Power and water owed</span><strong>{naira(p.billOwed)}</strong>
        <small>{weekly > 0 ? `${naira(weekly)} a week. Two weeks unpaid and the power is cut off.` : "The family covers your bills."}</small>
        <Btn disabled={p.billOwed <= 0} onClick={() => act((s) => payBill(s))}>Pay bill</Btn>
      </div>
    </div>
  );
}

export function Fuel({ state }: P) {
  const day = dayOf(state);
  return (
    <div className="pa-page">
      <div className="pa-group">
        {fuelPrices(day).map((f) => {
          const y = fuelPrices(day - 1).find((x) => x.id === f.id)!.naira;
          return <Row key={f.id} icon="fuel" tone="#c92a2a" title={`${f.name}: ${naira(f.naira)}`} sub={f.naira >= y ? `Up ${naira(f.naira - y)} since yesterday` : `Down ${naira(y - f.naira)} since yesterday`} />;
        })}
      </div>
      <p className="pa-fine center">Prices move with the day. Fuel will matter when you can drive.</p>
    </div>
  );
}

export function Gigs({ state, act }: P) {
  const wait = nextGigIn(state);
  return (
    <div className="pa-page">
      <p className="pa-fine">{wait > 0 ? `You need a break: next gig in ${wait} min.` : "Pick a gig."} One gig every {GIG_GAP_MINUTES} minutes; each costs energy.</p>
      <div className="pa-group">{GIGS.map((g) => <Row key={g.id} icon="jobs" tone="#1971c2" title={g.title} sub={`${g.blurb} · −${g.energy} energy`} right={<Btn onClick={() => act((s) => doGig(s, g.id))}>{naira(g.pay)}</Btn>} />)}</div>
    </div>
  );
}

// ------------------------------------------------------------------ games

export function Hangman({ state, act }: P) {
  const pick = () => HANG_WORDS[Math.floor(Math.random() * HANG_WORDS.length)]!;
  const [word, setWord] = useState(pick);
  const [guessed, setGuessed] = useState<string[]>([]);
  const wrong = guessed.filter((l) => !word.includes(l)).length;
  const won = [...word].every((l) => guessed.includes(l));
  const lost = wrong >= 6;
  const guess = (l: string) => {
    if (won || lost || guessed.includes(l)) return;
    const next = [...guessed, l];
    setGuessed(next);
    if ([...word].every((c) => next.includes(c))) act((s) => recordScore(s, "hangman", (state.phone.scores.hangman ?? 0) + 1));
  };
  return (
    <div className="pa-page">
      <div className="pa-card-soft"><span>Wins</span><strong>{state.phone.scores.hangman ?? 0}</strong><small>Mistakes {wrong} / 6</small></div>
      <div className="pa-big" style={{ letterSpacing: ".3em" }}>{[...word].map((l) => (guessed.includes(l) || lost ? l : "_")).join(" ")}</div>
      <div className="pa-chips">{"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => <button key={l} className="pa-chip" style={{ minWidth: 34, padding: 0, opacity: guessed.includes(l) ? 0.3 : 1 }} onClick={() => guess(l)}>{l}</button>)}</div>
      {(won || lost) && <div className="pa-note" role="status">{won ? "You got it!" : `The word was ${word}.`}</div>}
      <Btn kind="soft" onClick={() => { setWord(pick()); setGuessed([]); }}>New word</Btn>
    </div>
  );
}

const ROWS = 6, COLS = 7;
type C4 = number[][];
const c4win = (b: C4, p: number): boolean => {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]] as const) {
    let k = 0;
    for (; k < 4; k++) { const rr = r + dr * k, cc = c + dc * k; if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || b[rr]![cc] !== p) break; }
    if (k === 4) return true;
  }
  return false;
};
const drop = (b: C4, c: number, p: number): C4 | null => {
  for (let r = ROWS - 1; r >= 0; r--) if (b[r]![c] === 0) { const n = b.map((x) => [...x]); n[r]![c] = p; return n; }
  return null;
};
function c4ai(b: C4): number {
  const cols = [...Array(COLS).keys()].filter((c) => b[0]![c] === 0);
  for (const p of [2, 1]) for (const c of cols) { const n = drop(b, c, p); if (n && c4win(n, p)) return c; }
  const pref = [3, 2, 4, 1, 5, 0, 6].filter((c) => cols.includes(c));
  return pref[Math.floor(Math.random() * Math.min(3, pref.length))] ?? cols[0]!;
}

export function Connect4({ state, act }: P) {
  const [b, setB] = useState<C4>(() => Array.from({ length: ROWS }, () => Array(COLS).fill(0)));
  const [result, setResult] = useState<string | null>(null);
  const play = (c: number) => {
    if (result) return;
    let n = drop(b, c, 1);
    if (!n) return;
    if (c4win(n, 1)) { setB(n); setResult("You win!"); act((s) => recordScore(s, "connect4", (s.phone.scores.connect4 ?? 0) + 1)); return; }
    const reply = c4ai(n);
    n = drop(n, reply, 2) ?? n;
    setB(n);
    if (c4win(n, 2)) setResult("The phone wins.");
    else if (n[0]!.every((x) => x !== 0)) setResult("Draw.");
  };
  return (
    <div className="pa-page">
      <div className="pa-card-soft"><span>Wins</span><strong>{state.phone.scores.connect4 ?? 0}</strong></div>
      <div className="pa-board" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, background: "#1c4fd8", padding: 6, borderRadius: 12, width: "min(100%, 320px)" }}>
        {b.flatMap((row, r) => row.map((v, c) => <button key={`${r}${c}`} aria-label={`Column ${c + 1}`} onClick={() => play(c)} style={{ all: "unset", cursor: "pointer", aspectRatio: "1", borderRadius: "50%", background: v === 1 ? "#ffd43b" : v === 2 ? "#ff6b6b" : "#e7eefc" }} />))}
      </div>
      {result && <div className="pa-note" role="status">{result}</div>}
      <Btn kind="soft" onClick={() => { setB(Array.from({ length: ROWS }, () => Array(COLS).fill(0))); setResult(null); }}>New game</Btn>
    </div>
  );
}

export function WordGuess({ state, act }: P) {
  const answer = useMemo(() => wordOfDay(dayOf(state)), [state]);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [cur, setCur] = useState("");
  const won = guesses.includes(answer);
  const over = won || guesses.length >= 6;
  const submit = () => {
    const g = cur.toUpperCase();
    if (g.length !== 5 || over) return;
    const next = [...guesses, g];
    setGuesses(next);
    setCur("");
    if (g === answer) act((s) => recordScore(s, "wordguess", (s.phone.scores.wordguess ?? 0) + 1));
  };
  const color = (g: string, i: number) => (g[i] === answer[i] ? "#5b9bff" : answer.includes(g[i]!) ? "#f0b429" : "#6b7280");
  return (
    <div className="pa-page">
      <div className="pa-card-soft"><span>Words solved</span><strong>{state.phone.scores.wordguess ?? 0}</strong><small>Same word for everyone today. Six tries.</small></div>
      <div style={{ display: "grid", gap: 4, justifyContent: "center" }}>
        {Array.from({ length: 6 }, (_, r) => {
          const g = guesses[r] ?? (r === guesses.length ? cur.toUpperCase() : "");
          return <div key={r} style={{ display: "flex", gap: 4 }}>{[0, 1, 2, 3, 4].map((i) => <span key={i} className="pa-cell" style={{ width: 42, aspectRatio: "1", background: guesses[r] ? color(guesses[r]!, i) : "var(--card)", color: guesses[r] ? "#fff" : "var(--text)", border: "1px solid var(--line)" }}>{g[i] ?? ""}</span>)}</div>;
        })}
      </div>
      {!over && (
        <div className="pa-split" style={{ gridTemplateColumns: "1fr auto" }}>
          <input className="pa-text" value={cur} maxLength={5} onChange={(e) => setCur(e.target.value.replace(/[^a-zA-Z]/g, ""))} placeholder="Five letters" aria-label="Your guess" onKeyDown={(e) => e.key === "Enter" && submit()} style={{ textTransform: "uppercase" }} />
          <Btn onClick={submit} disabled={cur.length !== 5}>Guess</Btn>
        </div>
      )}
      {over && <div className="pa-note" role="status">{won ? "Solved!" : `The word was ${answer}.`}</div>}
    </div>
  );
}

export function Minesweeper({ state, act }: P) {
  const N = 8, MINES = 9;
  const make = () => {
    const m = new Set<number>();
    while (m.size < MINES) m.add(Math.floor(Math.random() * N * N));
    return m;
  };
  const [mines, setMines] = useState(make);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [flag, setFlag] = useState<Set<number>>(new Set());
  const [flagMode, setFlagMode] = useState(false);
  const [dead, setDead] = useState(false);
  const count = (i: number) => {
    const r = Math.floor(i / N), c = i % N;
    let k = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if ((dr || dc) && rr >= 0 && rr < N && cc >= 0 && cc < N && mines.has(rr * N + cc)) k++;
    }
    return k;
  };
  const won = open.size === N * N - MINES;
  const tap = (i: number) => {
    if (dead || won || open.has(i)) return;
    if (flagMode) { const f = new Set(flag); f.has(i) ? f.delete(i) : f.add(i); setFlag(f); return; }
    if (flag.has(i)) return;
    if (mines.has(i)) { setDead(true); return; }
    const o = new Set(open);
    const stack = [i];
    while (stack.length) {
      const x = stack.pop()!;
      if (o.has(x)) continue;
      o.add(x);
      if (count(x) === 0) {
        const r = Math.floor(x / N), c = x % N;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < N && cc >= 0 && cc < N) stack.push(rr * N + cc); }
      }
    }
    setOpen(o);
    if (o.size === N * N - MINES) act((s) => recordScore(s, "minesweeper", (s.phone.scores.minesweeper ?? 0) + 1));
  };
  return (
    <div className="pa-page">
      <div className="pa-card-soft"><span>Boards cleared</span><strong>{state.phone.scores.minesweeper ?? 0}</strong></div>
      <div className="pa-board" style={{ gridTemplateColumns: `repeat(${N}, 1fr)`, width: "min(100%, 320px)" }}>
        {Array.from({ length: N * N }, (_, i) => {
          const isOpen = open.has(i);
          const show = dead && mines.has(i);
          return <button key={i} onClick={() => tap(i)} aria-label={`Cell ${i + 1}`} style={{ all: "unset", cursor: "pointer", aspectRatio: "1", display: "grid", placeItems: "center", borderRadius: 5, fontWeight: 800, fontSize: ".85rem", background: isOpen ? "var(--card)" : "var(--accent-soft)", border: "1px solid var(--line)" }}>{show ? <GameIcon name="bomb" size={16} /> : flag.has(i) ? <GameIcon name="flag" size={16} /> : isOpen ? (count(i) || "") : ""}</button>;
        })}
      </div>
      {(dead || won) && <div className="pa-note" role="status">{won ? "Board cleared!" : "Boom."}</div>}
      <div className="pa-split">
        <Btn kind={flagMode ? "solid" : "soft"} onClick={() => setFlagMode((f) => !f)}>{flagMode ? "Flagging" : "Digging"}</Btn>
        <Btn kind="soft" onClick={() => { setMines(make()); setOpen(new Set()); setFlag(new Set()); setDead(false); }}>New board</Btn>
      </div>
    </div>
  );
}

export function Reaction({ state, act }: P) {
  const [phase, setPhase] = useState<"idle" | "wait" | "go" | "early">("idle");
  const [ms, setMs] = useState<number | null>(null);
  const t0 = useRef(0);
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const start = () => {
    setPhase("wait");
    setMs(null);
    timer.current = window.setTimeout(() => { t0.current = performance.now(); setPhase("go"); }, 1200 + Math.random() * 2500);
  };
  const tap = () => {
    if (phase === "wait") { window.clearTimeout(timer.current); setPhase("early"); }
    else if (phase === "go") {
      const t = Math.round(performance.now() - t0.current);
      setMs(t);
      setPhase("idle");
      const score = Math.max(1, Math.round(1000 - t));
      act((s) => recordScore(s, "reaction", Math.max(s.phone.scores.reaction ?? 0, score)));
    }
  };
  const best = state.phone.scores.reaction ? 1000 - state.phone.scores.reaction : null;
  return (
    <div className="pa-page">
      <div className="pa-card-soft"><span>Best time</span><strong>{best !== null ? `${best} ms` : "–"}</strong></div>
      <button onClick={phase === "idle" || phase === "early" ? start : tap} className="pa-btn" style={{ minHeight: 180, fontSize: "1.2rem", background: phase === "go" ? "#5b9bff" : phase === "wait" ? "#d9534f" : "var(--accent)", color: "#fff" }}>
        {phase === "idle" ? (ms !== null ? `${ms} ms. Tap to try again` : "Tap to start") : phase === "wait" ? "Wait for green…" : phase === "go" ? "TAP NOW!" : "Too early! Tap to retry"}
      </button>
    </div>
  );
}

void addFun;
