import { GameIcon } from "../ui/icons";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { PlayerView, ServerMessage } from "@thelife/shared";
import type { MapRuntime } from "../map/runtime";
import { Connection, defaultServerUrl, rememberServerUrl, type NetStatus } from "./connection";
import "./online.css";

interface ChatLine {
  id: number;
  name: string;
  text: string;
  mine: boolean;
  system?: boolean;
}

const NAME_KEY = "thelife.playerName";
const loadName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};

/** The "Go online" controls on the map page: connect, see who is here, chat, pay. The world itself is drawn by the map runtime. */
export default function OnlinePanel({ runtime }: { runtime: RefObject<MapRuntime | null> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(loadName);
  const [url, setUrl] = useState(defaultServerUrl);
  const [status, setStatus] = useState<NetStatus>("offline");
  const [detail, setDetail] = useState("");
  const [money, setMoney] = useState<number | null>(null);
  const [players, setPlayers] = useState<PlayerView[]>([]);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [paying, setPaying] = useState<string | null>(null);
  const [amount, setAmount] = useState("1000");
  const conn = useRef<Connection | null>(null);
  const selfId = useRef("");
  const lineNo = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);

  const say = useCallback((name: string, text: string, mine = false, system = false) => {
    setLines((l) => [...l.slice(-39), { id: lineNo.current++, name, text, mine, system }]);
  }, []);

  const onMessage = useCallback(
    (m: ServerMessage) => {
      const rt = runtime.current;
      switch (m.t) {
        case "welcome":
          selfId.current = m.id;
          setMoney(m.money);
          setPlayers(m.players);
          for (const p of m.players) rt?.online.remotes.add(p);
          say("", `You are in ${m.room}. ${m.players.length ? `${m.players.length} other player${m.players.length > 1 ? "s" : ""} here.` : "You are the first one here."}`, false, true);
          break;
        case "join":
          rt?.online.remotes.add(m.player);
          setPlayers((p) => [...p.filter((q) => q.id !== m.player.id), m.player]);
          say("", `${m.player.name} joined.`, false, true);
          break;
        case "leave": {
          rt?.online.remotes.remove(m.id);
          setPlayers((p) => {
            const gone = p.find((q) => q.id === m.id);
            if (gone) say("", `${gone.name} left.`, false, true);
            return p.filter((q) => q.id !== m.id);
          });
          break;
        }
        case "state":
          rt?.online.remotes.apply(m.players, selfId.current);
          break;
        case "chat":
          say(m.name, m.text, m.from === selfId.current);
          break;
        case "money":
          setMoney(m.balance);
          say("", m.note, false, true);
          break;
        case "correct":
          rt?.online.correct(m.x, m.z);
          break;
        case "error":
          say("", m.reason, false, true);
          break;
      }
    },
    [runtime, say],
  );

  const disconnect = useCallback(() => {
    conn.current?.close();
    conn.current = null;
    const rt = runtime.current;
    if (rt) for (const p of rt.online.remotes.list()) rt.online.remotes.remove(p.id);
    setPlayers([]);
    setMoney(null);
  }, [runtime]);

  const connect = () => {
    const clean = name.trim().slice(0, 20);
    if (!clean) return setDetail("Pick a name first.");
    try {
      localStorage.setItem(NAME_KEY, clean);
    } catch {
      /* ignore */
    }
    rememberServerUrl(url.trim());
    setDetail("");
    setLines([]);
    conn.current = new Connection(url.trim(), clean, {
      onStatus: (s, d) => {
        setStatus(s);
        setDetail(d ?? "");
      },
      onMessage,
    });
  };

  // Tell the server where we are about ten times a second, and once a second even when standing still.
  useEffect(() => {
    if (status !== "online") return;
    let last = "";
    let lastSent = 0;
    const id = setInterval(() => {
      const pose = runtime.current?.online.pose();
      if (!pose) return;
      const key = [pose.x, pose.y, pose.z, pose.yaw].map((v) => v.toFixed(2)).join();
      const now = performance.now();
      if (key === last && now - lastSent < 1000) return;
      last = key;
      lastSent = now;
      conn.current?.send({ t: "move", ...pose });
    }, 100);
    return () => clearInterval(id);
  }, [status, runtime]);

  useEffect(() => () => disconnect(), [disconnect]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: 1e6 });
  }, [lines, open]);

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    conn.current?.send({ t: "chat", text });
    setDraft("");
  };

  const pay = (to: string) => {
    const value = Math.floor(Number(amount));
    if (value > 0) conn.current?.send({ t: "pay", to, amount: value });
    setPaying(null);
  };

  const online = status === "online";
  return (
    <>
      <button className={`net-chip is-${status}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Online play">
        <span className="net-dot" />
        {online ? `Online · ${players.length + 1}` : status === "connecting" ? "Connecting…" : "Go online"}
        {online && money !== null && <b>₦{money.toLocaleString()}</b>}
      </button>
      {open && (
        <div className="net-panel" role="dialog" aria-label="Online play">
          {!online && status !== "connecting" ? (
            <form
              className="net-form"
              onSubmit={(e) => {
                e.preventDefault();
                connect();
              }}
            >
              <strong>Play with others</strong>
              <label>
                Your name
                <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tunde" autoFocus />
              </label>
              <label>
                Server
                <input value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} autoCapitalize="off" />
              </label>
              {detail && <p className="net-note">{detail}</p>}
              <button className="btn btn-primary" type="submit">Join the world</button>
            </form>
          ) : (
            <>
              <div className="net-head">
                <strong>{online ? "In the world" : "Connecting…"}</strong>
                <button className="is-ghost" onClick={disconnect}>Leave</button>
              </div>
              {detail && <p className="net-note">{detail}</p>}
              <ul className="net-players">
                {players.length === 0 && <li className="net-empty">Nobody else is here yet. Share the link.</li>}
                {players.map((p) => (
                  <li key={p.id}>
                    <span>{p.name}</span>
                    {paying === p.id ? (
                      <span className="net-pay">
                        ₦<input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} aria-label="Amount" />
                        <button onClick={() => pay(p.id)}>Send</button>
                        <button className="is-ghost" onClick={() => setPaying(null)} aria-label="Cancel"><GameIcon name="close" size={12} /></button>
                      </span>
                    ) : (
                      <button onClick={() => setPaying(p.id)}>Pay</button>
                    )}
                  </li>
                ))}
              </ul>
              <div className="net-log" ref={logRef} aria-live="polite">
                {lines.map((l) => (
                  <p key={l.id} className={l.system ? "is-system" : l.mine ? "is-mine" : ""}>
                    {!l.system && <b>{l.name}: </b>}
                    {l.text}
                  </p>
                ))}
              </div>
              <form className="net-chat" onSubmit={sendChat}>
                <input value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} placeholder="Say something…" aria-label="Chat message" />
                <button type="submit" disabled={!online}>Send</button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
