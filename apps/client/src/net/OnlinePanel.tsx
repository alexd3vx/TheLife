import { GameIcon } from "../ui/icons";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { PlayerView, ServerMessage } from "@thelife/shared";
import type { MapRuntime } from "../map/runtime";
import type { NetStatus } from "./connection";
import { world } from "./world";
import "./online.css";

interface ChatLine {
  id: number;
  name: string;
  text: string;
  mine: boolean;
  system?: boolean;
}

/** The "Go online" controls on the map page: connect, see who is here, chat, pay. The world itself is drawn by the map runtime. */
export default function OnlinePanel({ runtime }: { runtime: RefObject<MapRuntime | null> }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<NetStatus>(world.status);
  const [detail, setDetail] = useState(world.detail);
  const [players, setPlayers] = useState<PlayerView[]>([]);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [paying, setPaying] = useState<string | null>(null);
  const [amount, setAmount] = useState("1000");
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

  // Follow the shared connection: its status, and what the server tells us about the world.
  useEffect(() => {
    const clear = () => {
      const rt = runtime.current;
      if (rt) for (const p of rt.online.remotes.list()) rt.online.remotes.remove(p.id);
      setPlayers([]);
    };
    const offStatus = world.onStatus(() => {
      setStatus(world.status);
      setDetail(world.detail);
      if (world.status !== "online") clear();
    });
    const offMessage = world.onMessage(onMessage);
    if (world.lastWelcome) onMessage(world.lastWelcome); // we may have mounted after the server said hello
    return () => {
      offStatus();
      offMessage();
      clear();
    };
  }, [onMessage, runtime]);

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
      world.send({ t: "move", ...pose });
    }, 100);
    return () => clearInterval(id);
  }, [status, runtime]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: 1e6 });
  }, [lines, open]);

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    world.send({ t: "chat", text });
    setDraft("");
  };

  const pay = (to: string) => {
    const value = Math.floor(Number(amount));
    if (value > 0) world.send({ t: "pay", to, amount: value });
    setPaying(null);
  };

  const online = status === "online";
  return (
    <>
      <button className={`net-chip is-${status}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Online play">
        <span className="net-dot" />
        {online ? `Online · ${players.length + 1}` : status === "connecting" ? "Connecting…" : "Offline"}
      </button>
      {open && (
        <div className="net-panel" role="dialog" aria-label="Online play">
          {!online && status !== "connecting" ? (
            <div className="net-form">
              <strong>Can't reach the world</strong>
              {detail && <p className="net-note">{detail}</p>}
              <button className="btn btn-primary" onClick={() => world.reconnect()}>Try again</button>
            </div>
          ) : (
            <>
              <div className="net-head">
                <strong>{online ? "In the world" : "Connecting…"}</strong>
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
