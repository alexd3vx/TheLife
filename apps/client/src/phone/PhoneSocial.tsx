import { useEffect, useMemo, useRef, useState } from "react";
import { useSocial, type SocialLine } from "../net/social";
import { useServerStats } from "../net/useServerStats";
import { world } from "../net/world";
import { AppActive } from "./active";
import { useContext } from "react";

type Tab = "nearby" | "messages" | "people";

const time = (at: number) => new Date(at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
const initials = (n: string) => n.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();

/** The phone's Social app: talk to people near you in the city, message anyone online, and see who is around. */
export default function Social() {
  const s = useSocial();
  const active = useContext(AppActive);
  const stats = useServerStats(10_000);
  const [tab, setTab] = useState<Tab>("nearby");
  const [talkTo, setTalkTo] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    s.setViewing(active);
    return () => s.setViewing(false);
  }, [active, s]);

  const nearby = s.lines.filter((l) => !l.to);
  const threads = useMemo(() => {
    const by = new Map<string, SocialLine[]>();
    for (const l of s.lines) {
      if (!l.to) continue;
      const other = l.mine ? l.to : l.from;
      by.set(other, [...(by.get(other) ?? []), l]);
    }
    return [...by.entries()].sort((a, b) => b[1][b[1].length - 1]!.at - a[1][a[1].length - 1]!.at);
  }, [s.lines, s.version]);
  const shown = tab === "nearby" ? nearby : talkTo ? (threads.find(([id]) => id === talkTo)?.[1] ?? []) : [];
  useEffect(() => {
    logRef.current?.scrollTo({ top: 1e6 });
  }, [shown.length, tab, talkTo]);

  const online = world.status === "online";
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    s.say(text, tab === "messages" ? (talkTo ?? undefined) : undefined);
    setDraft("");
  };
  const open = (id: string) => {
    setTalkTo(id);
    setTab("messages");
  };
  const nameOf = (id: string) => s.people.get(id)?.name ?? s.known.get(id) ?? "Someone";

  return (
    <div className="soc">
      <div className="soc-top">
        <span className={`soc-dot${online ? " is-on" : ""}`} />
        <b>{online ? `${stats?.online ?? s.people.size + 1} online` : "Not connected"}</b>
        {stats && stats.guests > 0 && <small>{stats.guests} guest{stats.guests === 1 ? "" : "s"}</small>}
      </div>
      <nav className="soc-tabs">
        {(["nearby", "messages", "people"] as const).map((t) => (
          <button key={t} className={tab === t ? "is-on" : ""} onClick={() => { setTab(t); if (t !== "messages") setTalkTo(null); }}>
            {t === "nearby" ? "Nearby" : t === "messages" ? "Messages" : `People ${s.people.size ? `(${s.people.size})` : ""}`}
          </button>
        ))}
      </nav>

      {tab === "people" && (
        <ul className="soc-people">
          {s.people.size === 0 && <li className="soc-empty">Nobody else is out in Lagos right now. Share the link and bring a friend.</li>}
          {[...s.people.values()].map((p) => (
            <li key={p.id}>
              <span className="soc-pic">{initials(p.name)}</span>
              <div><b>{p.name}</b><small>Out in Lagos</small></div>
              <button onClick={() => open(p.id)}>Message</button>
            </li>
          ))}
        </ul>
      )}

      {tab === "messages" && !talkTo && (
        <ul className="soc-people">
          {threads.length === 0 && <li className="soc-empty">No private messages yet. Open People and tap Message.</li>}
          {threads.map(([id, lines]) => (
            <li key={id}>
              <span className="soc-pic">{initials(nameOf(id))}</span>
              <div><b>{nameOf(id)}</b><small>{lines[lines.length - 1]!.mine ? "You: " : ""}{lines[lines.length - 1]!.text.slice(0, 40)}</small></div>
              <button onClick={() => setTalkTo(id)}>Open</button>
            </li>
          ))}
        </ul>
      )}

      {(tab === "nearby" || (tab === "messages" && talkTo)) && (
        <>
          {tab === "messages" && talkTo && (
            <div className="soc-who"><button onClick={() => setTalkTo(null)}>←</button> <b>{nameOf(talkTo)}</b></div>
          )}
          <div className="soc-log" ref={logRef} aria-live="polite">
            {shown.length === 0 && <p className="soc-empty">{tab === "nearby" ? "People within about 90 metres of you hear what you say here. You have to be out in the city." : "Say hello."}</p>}
            {shown.map((l) => (
              <div key={l.id} className={`soc-line${l.mine ? " is-mine" : ""}`}>
                {!l.mine && <small>{l.name}</small>}
                <p>{l.text}</p>
                <i>{time(l.at)}</i>
              </div>
            ))}
          </div>
          <form className="soc-form" onSubmit={send}>
            <input value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} placeholder={tab === "nearby" ? "Say something to people nearby…" : "Message…"} aria-label="Message" />
            <button type="submit" disabled={!online || !draft.trim()}>Send</button>
          </form>
        </>
      )}
    </div>
  );
}
