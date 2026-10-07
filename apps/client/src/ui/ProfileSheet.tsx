import { useEffect, useMemo, useState } from "react";
import { TRAITS, contactsFor, type NeedId } from "@thelife/game-core";
import { useAuth } from "../auth/AuthProvider";
import { resolveLook } from "../lab/character";
import CharacterStage from "./CharacterStage";
import type { GameSession, HudSnapshot } from "../play/gameSession";
import { GameIcon, type FaName } from "./icons";
import "./profile.css";

type Tab = "profile" | "needs" | "goals" | "skills" | "people";
const TABS: { id: Tab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "needs", label: "Needs" },
  { id: "goals", label: "Goals" },
  { id: "skills", label: "Skills" },
  { id: "people", label: "People" },
];
const NEEDS: { id: NeedId; label: string; icon: FaName; tip: string }[] = [
  { id: "hunger", label: "Hunger", icon: "hunger", tip: "Eat at the table, or cook." },
  { id: "energy", label: "Energy", icon: "energy", tip: "Sleep in your bed." },
  { id: "hygiene", label: "Hygiene", icon: "hygiene", tip: "Take a shower." },
  { id: "bladder", label: "Bladder", icon: "bladder", tip: "Use the toilet." },
  { id: "fun", label: "Fun", icon: "fun", tip: "Watch TV or dance to the radio." },
];
const naira = (n: number) => `₦${n.toLocaleString()}`;

/** Who you are: a bottom sheet with your character, how you are doing, what to work on, what you are good at, and who you know. */
export default function ProfileSheet({ session, hud, onClose }: { session: GameSession; hud: HudSnapshot; onClose(): void }) {
  const [tab, setTab] = useState<Tab>("profile");
  const { user } = useAuth();
  const p = hud.profile;
  const state = session.sim.state;
  const look = useMemo(() => resolveLook(state.look), [state.look]);
  const traits = (p?.traits ?? []).map((id) => TRAITS.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t);
  const initials = p ? `${p.firstName[0] ?? ""}${p.surname[0] ?? ""}`.toUpperCase() : "?";
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const goals = useMemo(() => {
    const out: { text: string; progress: number; icon: FaName; urgent?: boolean }[] = [];
    if (hud.rentPerWeek > 0) out.push({ text: hud.rentOwed > 0 ? `Pay the ${naira(hud.rentOwed)} you owe in rent` : `Have ${naira(hud.rentPerWeek)} ready for rent in ${hud.rentInDays} day${hud.rentInDays === 1 ? "" : "s"}`, progress: Math.min(1, hud.money / Math.max(1, hud.rentOwed || hud.rentPerWeek)), icon: "home", urgent: hud.rentOwed > 0 });
    for (const n of NEEDS) if (hud.needs[n.id] < 45) out.push({ text: `${n.label} is low: ${n.tip.toLowerCase()}`, progress: hud.needs[n.id] / 100, icon: n.icon, urgent: hud.needs[n.id] < 25 });
    if (hud.portions + hud.meals === 0) out.push({ text: "Buy food: you have none at home", progress: 0, icon: "cart" });
    out.push({ text: "Feel great: keep every need above 60", progress: Math.min(1, hud.mood / 80), icon: "star" });
    const best = [...hud.skills].sort((a, b) => b.level - a.level)[0];
    out.push({ text: best ? `Raise ${best.id} to level ${best.level + 1}` : "Learn something: use a computer or read a book", progress: 0.2, icon: "skill" });
    return out.slice(0, 6);
  }, [hud]);

  const people = useMemo(() => contactsFor(state.profile), [state.profile]);
  const share = async () => {
    const url = window.location.origin;
    try {
      if (navigator.share) await navigator.share({ title: "TheLife", text: "Come and live in Lagos with me.", url });
      else await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the share sheet was closed */
    }
  };

  return (
    <div className="prof" role="dialog" aria-label="Your profile" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="prof-card">
        <div className="prof-grab" />
        <header className="prof-head">
          <span className={`prof-avatar tier-${p?.tier ?? "middle"}`}>{initials}</span>
          <div>
            <strong>{p ? `${p.firstName} ${p.surname}` : "You"}</strong>
            <small>Feeling {hud.moodLabel.toLowerCase()} · {p?.title ?? "Living in Lagos"}</small>
          </div>
          <button className="prof-close" onClick={onClose} aria-label="Close"><GameIcon name="close" size={15} /></button>
        </header>
        <nav className="prof-tabs" aria-label="Profile sections">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "is-on" : ""} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>

        <div className="prof-body">
          {tab === "profile" && (
            <>
              <div className="prof-stage">
                <CharacterStage look={look} walking={false} />
                <small>Drag to turn</small>
              </div>
              <dl className="prof-fields">
                <div><dt>Name</dt><dd>{p ? `${p.firstName} ${p.surname}` : "-"}</dd></div>
                <div><dt>From</dt><dd>{p?.hometown ?? "-"}</dd></div>
                <div><dt>Home</dt><dd>{hud.rentPerWeek === 0 ? "Family house, no rent" : `Rent ${naira(hud.rentPerWeek)} a week`}</dd></div>
                <div><dt>Account</dt><dd>{user?.email ? user.email : "Guest (log in to keep your life on any phone)"}</dd></div>
              </dl>
              {p && (
                <section className="prof-story">
                  <b>{p.title}</b>
                  <p>{p.story}</p>
                </section>
              )}
              {traits.length > 0 && (
                <section className="prof-traits">
                  {traits.map((t) => (
                    <span key={t.id} className={t.kind} title={t.text}><b>{t.label}</b> {t.text}</span>
                  ))}
                </section>
              )}
              <button className="prof-share" onClick={() => void share()}>{copied ? "Link copied" : "Invite a friend to TheLife"}</button>
            </>
          )}

          {tab === "needs" && (
            <ul className="prof-needs">
              {NEEDS.map((n) => {
                const v = hud.needs[n.id];
                return (
                  <li key={n.id} className={v < 30 ? "is-low" : v < 60 ? "is-mid" : ""}>
                    <GameIcon name={n.icon} size={18} />
                    <div>
                      <b>{n.label}</b>
                      <i><u style={{ width: `${v}%` }} /></i>
                      <small>{v < 60 ? n.tip : "You are fine here."}</small>
                    </div>
                    <span>{v}</span>
                  </li>
                );
              })}
            </ul>
          )}

          {tab === "goals" && (
            <ul className="prof-goals">
              {goals.map((g, i) => (
                <li key={i} className={g.urgent ? "is-urgent" : ""}>
                  <GameIcon name={g.icon} size={18} />
                  <div>
                    <b>{g.text}</b>
                    <i><u style={{ width: `${Math.round(g.progress * 100)}%` }} /></i>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {tab === "skills" && (
            <ul className="prof-skills">
              {hud.skills.length === 0 && <li className="prof-empty">No skills yet. Work, study and practise to grow them.</li>}
              {hud.skills.map((s) => (
                <li key={s.id}>
                  <span className="prof-level">{s.level}</span>
                  <div><b>{s.id[0]!.toUpperCase() + s.id.slice(1)}</b><i><u style={{ width: `${Math.min(100, s.level * 10)}%` }} /></i></div>
                </li>
              ))}
            </ul>
          )}

          {tab === "people" && (
            <ul className="prof-people">
              {people.map((c) => (
                <li key={c.id}>
                  <span className="prof-pic">{c.name.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase()}</span>
                  <div><b>{c.name}</b><small>{c.role}</small></div>
                  <button onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("thelife-open-phone", { detail: c.callable ? "calls" : null })); }}>{c.callable ? "Call" : "Phone"}</button>
                </li>
              ))}
              {people.length === 0 && <li className="prof-empty">Nobody in your phone yet.</li>}
              <li className="prof-empty">Other players: tap one in the street to wave, message or pay them.</li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
