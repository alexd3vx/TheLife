import { useCallback, useEffect, useRef, useState } from "react";
import { quizRound, recordScore, clockOf, type GameState, type StoreAppId } from "@thelife/game-core";
import { Btn, type Act } from "./PhoneApps";
import { useAppActive } from "./active";

type P = { state: GameState; act: Act };
const best = (s: GameState, id: StoreAppId) => s.phone.scores[id] ?? 0;

/** A small, cheap Snake on a canvas. Swipe or use the arrows. */
export function Snake({ state, act }: P) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [round, setRound] = useState(0);
  const dir = useRef<[number, number]>([1, 0]);
  const active = useRef(true);
  active.current = useAppActive();
  const turn = useCallback((dx: number, dy: number) => {
    if (dir.current[0] === -dx && dir.current[1] === -dy) return;
    dir.current = [dx, dy];
  }, []);
  useEffect(() => {
    const N = 16;
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext("2d")!;
    let snake: [number, number][] = [[5, 8], [4, 8], [3, 8]];
    dir.current = [1, 0];
    let food: [number, number] = [11, 8];
    let points = 0;
    const place = () => {
      do food = [Math.floor(Math.random() * N), Math.floor(Math.random() * N)];
      while (snake.some(([x, y]) => x === food[0] && y === food[1]));
    };
    const draw = () => {
      const c = canvas.width / N;
      g.fillStyle = "#14201a";
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.fillStyle = "#ff5d5d";
      g.fillRect(food[0] * c + 2, food[1] * c + 2, c - 4, c - 4);
      snake.forEach(([x, y], i) => {
        g.fillStyle = i === 0 ? "#b6ff6b" : "#6bd46b";
        g.fillRect(x * c + 1, y * c + 1, c - 2, c - 2);
      });
    };
    draw();
    const timer = window.setInterval(() => {
      if (!active.current) return; // paused while another app is in front
      const head: [number, number] = [snake[0]![0] + dir.current[0], snake[0]![1] + dir.current[1]];
      if (head[0] < 0 || head[1] < 0 || head[0] >= N || head[1] >= N || snake.some(([x, y]) => x === head[0] && y === head[1])) {
        window.clearInterval(timer);
        setOver(true);
        act((s) => recordScore(s, "snake", points));
        return;
      }
      snake.unshift(head);
      if (head[0] === food[0] && head[1] === food[1]) {
        points += 1;
        setScore(points);
        place();
      } else snake.pop();
      draw();
    }, 150);
    setScore(0);
    setOver(false);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);
  const touch = useRef<[number, number] | null>(null);
  return (
    <div className="pa-page">
      <div className="pa-split"><div className="pa-card-soft"><span>Score</span><strong>{score}</strong></div><div className="pa-card-soft"><span>Best</span><strong>{best(state, "snake")}</strong></div></div>
      <canvas
        ref={ref} width={288} height={288} className="pa-canvas" aria-label="Snake board"
        onPointerDown={(e) => (touch.current = [e.clientX, e.clientY])}
        onPointerUp={(e) => {
          const t = touch.current;
          touch.current = null;
          if (!t) return;
          const dx = e.clientX - t[0], dy = e.clientY - t[1];
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
          if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0);
          else turn(0, dy > 0 ? 1 : -1);
        }}
      />
      <div className="pa-dpad">
        <button className="up" onClick={() => turn(0, -1)} aria-label="Up">▲</button>
        <button className="left" onClick={() => turn(-1, 0)} aria-label="Left">◀</button>
        <button className="down" onClick={() => turn(0, 1)} aria-label="Down">▼</button>
        <button className="right" onClick={() => turn(1, 0)} aria-label="Right">▶</button>
      </div>
      {over && <Btn onClick={() => setRound((r) => r + 1)}>Play again</Btn>}
    </div>
  );
}

// ------------------------------------------------------------------ 2048

type Grid = number[][];
const empty = (): Grid => Array.from({ length: 4 }, () => [0, 0, 0, 0]);
function spawn(g: Grid): Grid {
  const free: [number, number][] = [];
  g.forEach((row, r) => row.forEach((v, c) => v === 0 && free.push([r, c])));
  if (!free.length) return g;
  const [r, c] = free[Math.floor(Math.random() * free.length)]!;
  const n = g.map((row) => [...row]);
  n[r]![c] = Math.random() < 0.9 ? 2 : 4;
  return n;
}
function slideRow(row: number[]): { row: number[]; gained: number } {
  const vals = row.filter(Boolean);
  let gained = 0;
  for (let i = 0; i < vals.length - 1; i++) {
    if (vals[i] === vals[i + 1]) {
      vals[i]! *= 2;
      gained += vals[i]!;
      vals.splice(i + 1, 1);
    }
  }
  while (vals.length < 4) vals.push(0);
  return { row: vals, gained };
}
function move(g: Grid, dir: "left" | "right" | "up" | "down"): { grid: Grid; gained: number; moved: boolean } {
  const rot = (m: Grid): Grid => m[0]!.map((_, c) => m.map((row) => row[c]!).reverse());
  let turns = { left: 0, down: 1, right: 2, up: 3 }[dir];
  let m = g.map((r) => [...r]);
  for (let i = 0; i < turns; i++) m = rot(m);
  let gained = 0;
  m = m.map((row) => {
    const r = slideRow(row);
    gained += r.gained;
    return r.row;
  });
  for (; turns < 4 && turns > 0; turns++) m = rot(m);
  const moved = JSON.stringify(m) !== JSON.stringify(g);
  return { grid: m, gained, moved };
}
const TILE_COLORS: Record<number, string> = { 2: "#eee4da", 4: "#ede0c8", 8: "#f2b179", 16: "#f59563", 32: "#f67c5f", 64: "#f65e3b", 128: "#edcf72", 256: "#edcc61", 512: "#edc850", 1024: "#edc53f", 2048: "#edc22e" };

export function Game2048({ state, act }: P) {
  const [grid, setGrid] = useState<Grid>(() => spawn(spawn(empty())));
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const touch = useRef<[number, number] | null>(null);
  const play = (dir: "left" | "right" | "up" | "down") => {
    if (over) return;
    const r = move(grid, dir);
    if (!r.moved) return;
    const next = spawn(r.grid);
    const total = score + r.gained;
    setGrid(next);
    setScore(total);
    if (!(["left", "right", "up", "down"] as const).some((d) => move(next, d).moved)) {
      setOver(true);
      act((s) => recordScore(s, "g2048", total / 4));
    }
  };
  const reset = () => { setGrid(spawn(spawn(empty()))); setScore(0); setOver(false); };
  return (
    <div className="pa-page">
      <div className="pa-split"><div className="pa-card-soft"><span>Score</span><strong>{score}</strong></div><div className="pa-card-soft"><span>Best</span><strong>{Math.round(best(state, "g2048") * 4)}</strong></div></div>
      <div
        className="pa-board g2048" role="application" aria-label="2048 board"
        onPointerDown={(e) => (touch.current = [e.clientX, e.clientY])}
        onPointerUp={(e) => {
          const t = touch.current;
          touch.current = null;
          if (!t) return;
          const dx = e.clientX - t[0], dy = e.clientY - t[1];
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) return;
          play(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
        }}
      >
        {grid.flat().map((v, i) => (
          <div key={i} className="pa-cell" style={{ background: v ? TILE_COLORS[v] ?? "#3c3a32" : undefined, color: v > 4 ? "#fff" : undefined, fontSize: v > 999 ? ".95rem" : "1.2rem" }}>{v || ""}</div>
        ))}
      </div>
      <div className="pa-dpad">
        <button className="up" onClick={() => play("up")} aria-label="Up">▲</button>
        <button className="left" onClick={() => play("left")} aria-label="Left">◀</button>
        <button className="down" onClick={() => play("down")} aria-label="Down">▼</button>
        <button className="right" onClick={() => play("right")} aria-label="Right">▶</button>
      </div>
      {over && <div className="pa-note">No moves left.</div>}
      <Btn kind="soft" onClick={reset}>New game</Btn>
    </div>
  );
}

// ------------------------------------------------------------------ Tic Tac

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const winner = (b: string[]) => LINES.map(([a, c, d]) => (b[a!] && b[a!] === b[c!] && b[a!] === b[d!] ? b[a!] : null)).find(Boolean) ?? null;

function aiMove(b: string[]): number {
  const free = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  const tryWin = (who: string) => free.find((i) => { const t = [...b]; t[i] = who; return winner(t) === who; });
  const w = tryWin("O") ?? tryWin("X");
  if (w !== undefined) return w;
  if (!b[4]) return 4;
  const corners = [0, 2, 6, 8].filter((i) => !b[i]);
  if (corners.length && Math.random() < 0.8) return corners[Math.floor(Math.random() * corners.length)]!;
  return free[Math.floor(Math.random() * free.length)]!;
}

export function TicTac({ state, act }: P) {
  const [b, setB] = useState<string[]>(Array(9).fill(""));
  const [result, setResult] = useState<string | null>(null);
  const [wins, setWins] = useState(0);
  const click = (i: number) => {
    if (b[i] || result) return;
    const n = [...b];
    n[i] = "X";
    let w = winner(n);
    if (!w && n.some((v) => !v)) {
      n[aiMove(n)] = "O";
      w = winner(n);
    }
    setB(n);
    if (w === "X") { setResult("You win!"); setWins((x) => x + 1); act((s) => recordScore(s, "xo", best(s, "xo") + 1)); }
    else if (w === "O") setResult("The phone wins.");
    else if (n.every(Boolean)) setResult("Draw.");
  };
  return (
    <div className="pa-page">
      <div className="pa-card-soft"><span>Wins</span><strong>{best(state, "xo") + 0}</strong><small>This session: {wins}</small></div>
      <div className="pa-board pa-xo">{b.map((v, i) => <button key={i} onClick={() => click(i)} aria-label={`Square ${i + 1}`}>{v}</button>)}</div>
      {result && <div className="pa-note" role="status">{result}</div>}
      <Btn kind="soft" onClick={() => { setB(Array(9).fill("")); setResult(null); }}>New game</Btn>
    </div>
  );
}

// ------------------------------------------------------------------ Match Pairs

const FACES = ["🍚", "🍗", "🥭", "🍌", "🌶️", "🍍", "🥥", "🍉"];
const deal = () => [...FACES, ...FACES].map((f, i) => ({ f, k: Math.random() + i * 1e-9 })).sort((a, b) => a.k - b.k).map((x) => x.f);

export function MatchPairs({ state, act }: P) {
  const [cards, setCards] = useState<string[]>(deal);
  const [up, setUp] = useState<number[]>([]);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const lock = useRef(false);
  const flip = (i: number) => {
    if (lock.current || up.includes(i) || done.has(i)) return;
    const next = [...up, i];
    setUp(next);
    if (next.length === 2) {
      setMoves((m) => m + 1);
      lock.current = true;
      window.setTimeout(() => {
        if (cards[next[0]!] === cards[next[1]!]) {
          const d = new Set(done);
          next.forEach((n) => d.add(n));
          setDone(d);
          if (d.size === cards.length) act((s) => recordScore(s, "memory", Math.max(1, 60 - (moves + 1) * 2)));
        }
        setUp([]);
        lock.current = false;
      }, 650);
    }
  };
  const won = done.size === cards.length;
  return (
    <div className="pa-page">
      <div className="pa-split"><div className="pa-card-soft"><span>Moves</span><strong>{moves}</strong></div><div className="pa-card-soft"><span>Best score</span><strong>{best(state, "memory")}</strong></div></div>
      <div className="pa-board pa-memory">
        {cards.map((f, i) => {
          const shown = up.includes(i) || done.has(i);
          return <button key={i} className={done.has(i) ? "is-done" : shown ? "is-up" : ""} onClick={() => flip(i)} aria-label={shown ? f : "Hidden card"}>{shown ? f : "?"}</button>;
        })}
      </div>
      {won && <div className="pa-note" role="status">All pairs found in {moves} moves!</div>}
      <Btn kind="soft" onClick={() => { setCards(deal()); setUp([]); setDone(new Set()); setMoves(0); }}>New game</Btn>
    </div>
  );
}

// ------------------------------------------------------------------ Naija Quiz

export function Trivia({ state, act }: P) {
  const day = clockOf(state.minute).day;
  const [round, setRound] = useState(0);
  const qs = quizRound(day + round * 7, 5);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const q = qs[i];
  const pick = (n: number) => {
    if (picked !== null || !q) return;
    setPicked(n);
    if (n === q.answer) setScore((s) => s + 1);
    window.setTimeout(() => {
      if (i === qs.length - 1) act((s) => recordScore(s, "trivia", (score + (n === q.answer ? 1 : 0)) * 20));
      setI((x) => x + 1);
      setPicked(null);
    }, 900);
  };
  return (
    <div className="pa-page">
      {q ? (
        <>
          <p className="pa-fine">Question {i + 1} of {qs.length} · Score {score}</p>
          <div className="pa-card-soft"><strong style={{ fontSize: "1.05rem" }}>{q.q}</strong></div>
          <div className="pa-opts">
            {q.options.map((o, n) => <button key={o} className={picked === null ? "" : n === q.answer ? "is-right" : n === picked ? "is-wrong" : ""} onClick={() => pick(n)}>{o}</button>)}
          </div>
        </>
      ) : (
        <>
          <div className="pa-card-soft"><span>You scored</span><strong>{score} / {qs.length}</strong><small>Best: {Math.round(best(state, "trivia") / 20)} / 5</small></div>
          <Btn onClick={() => { setRound((r) => r + 1); setI(0); setScore(0); }}>Play again</Btn>
        </>
      )}
    </div>
  );
}
