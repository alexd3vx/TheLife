import { useEffect, useRef, useState } from "react";
import { useSocial, type Line } from "../net/social";
import { useServerStats } from "../net/useServerStats";
import { world } from "../net/world";
import { Icon } from "./icons";

const time = (at: number) => new Date(at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
const initials = (n: string) => n.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();

export type PlayersView = { kind: "nearby" } | { kind: "people" } | { kind: "thread"; uid: string };

/** The real-player side of LifeChat: nearby talk, private conversations by player ID, and finding people. */
export default function PlayerChats({ view, go }: { view: PlayersView; go(v: PlayersView): void }) {
  const s = useSocial();
  const stats = useServerStats(15_000);
  const [draft, setDraft] = useState("");
  const [idText, setIdText] = useState("");
  const [copied, setCopied] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const open = view.kind === "nearby" ? "nearby" : view.kind === "thread" ? view.uid : null;
  useEffect(() => {
    s.setOpen(open);
    return () => s.setOpen(null);
  }, [open, s]);

  const lines: Line[] = view.kind === "nearby" ? s.nearby : view.kind === "thread" ? (s.threads.get(view.uid)?.lines ?? []) : [];
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length, view.kind]);

  const online = world.status === "online";
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (view.kind === "nearby") s.say(text);
    else if (view.kind === "thread") s.dm(view.uid, text);
    setDraft("");
  };

  if (view.kind === "people") {
    const here = [...s.people.values()];
    return (
      <div className="pa-page">
        <p className="pa-section">Your player ID</p>
        <div className="pa-group">
          <button className="pa-chat-row" onClick={() => void navigator.clipboard?.writeText(s.selfUid).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); })}>
            <span className="pa-avatar tone-1"><Icon name="chat" size={18} /></span>
            <span className="pa-row-main"><strong style={{ fontFamily: "ui-monospace, monospace", letterSpacing: ".08em" }}>{s.selfUid || "…"}</strong><small>{copied ? "Copied" : "Tap to copy. Give it to a friend so they can message you."}</small></span>
          </button>
        </div>
        <p className="pa-section">Add someone by ID</p>
        <form className="pa-group pa-find" onSubmit={(e) => { e.preventDefault(); if (idText.trim()) { s.find(idText); setIdText(""); } }}>
          <input value={idText} onChange={(e) => setIdText(e.target.value.replace(/[^a-fA-F0-9]/g, "").slice(0, 16))} placeholder="Their player ID" aria-label="Their player ID" />
          <button type="submit" disabled={!online || idText.length < 6}>Find</button>
        </form>
        {s.lastError && <p className="pa-empty">{s.lastError}</p>}
        <p className="pa-section">Out in Lagos now{stats ? ` · ${stats.online} online, ${stats.guests} guest${stats.guests === 1 ? "" : "s"}` : ""}</p>
        <div className="pa-group">
          {here.length === 0 && <p className="pa-empty">Nobody else is out in the city right now.</p>}
          {here.map((p) => (
            <button key={p.id} className="pa-chat-row" disabled={!p.uid} onClick={() => p.uid && go({ kind: "thread", uid: p.uid })}>
              <span className="pa-avatar tone-2">{initials(p.name)}</span>
              <span className="pa-row-main"><strong>{p.name}</strong><small>Tap to message</small></span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const title = view.kind === "nearby" ? "Nearby" : (s.threads.get(view.uid)?.name ?? "Player");
  const sub = view.kind === "nearby" ? "People within about 90 m of you in the city" : `ID ${view.uid}`;
  return (
    <div className="pa-thread">
      <div className="pa-thread-head">
        <span className="pa-avatar sm tone-2">{view.kind === "nearby" ? "•" : initials(title)}</span>
        <span className="pa-row-main"><strong>{title}</strong><small>{sub}</small></span>
      </div>
      <div className="pa-bubbles" ref={logRef}>
        {lines.length === 0 && <p className="pa-empty">{view.kind === "nearby" ? "Say something. Only people close to you in the city hear it." : "No messages yet. Say hello."}</p>}
        {lines.map((l) => (
          <div key={l.id} className={`pa-bubble ${l.mine ? "me" : "them"}`}>
            {!l.mine && view.kind === "nearby" && <b style={{ display: "block", fontSize: ".72em", opacity: 0.8 }}>{l.name}</b>}
            {l.text}
            <small>{time(l.at)}</small>
          </div>
        ))}
        {s.lastError && <p className="pa-empty">{s.lastError}</p>}
      </div>
      <form className="pa-compose pa-compose-live" onSubmit={send}>
        <input value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} placeholder={view.kind === "nearby" ? "Say something nearby…" : "Message…"} aria-label="Message" />
        <button type="submit" disabled={!online || !draft.trim()} aria-label="Send"><Icon name="send" size={18} /></button>
      </form>
    </div>
  );
}
