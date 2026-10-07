import type { NeedId } from "@thelife/game-core";
import { GameIcon, type FaName } from "../ui/icons";
import type { HudSnapshot } from "./gameSession";
import "./hud.css";

/** The pieces of the on-screen game UI, shared by the 3D house, the iso room and the street. */

const NEEDS: { id: NeedId; icon: FaName; label: string }[] = [
  { id: "hunger", icon: "hunger", label: "Hunger" },
  { id: "energy", icon: "energy", label: "Energy" },
  { id: "hygiene", icon: "hygiene", label: "Hygiene" },
  { id: "bladder", icon: "bladder", label: "Bladder" },
  { id: "fun", icon: "fun", label: "Fun" },
];
const naira = (n: number) => `₦${n.toLocaleString()}`;
const isNight = (h: number) => h < 6 || h >= 19;
const level = (v: number) => (v >= 60 ? "good" : v >= 30 ? "mid" : "low");
const moodFace = (label: string): FaName => (label === "Great" ? "m5" : label === "Good" ? "m4" : label === "Okay" ? "m3" : label === "Low" ? "m2" : "m1");
const moodTone = (label: string) => (label === "Great" || label === "Good" ? "good" : label === "Okay" ? "mid" : "low");

/** Top centre: the time, how the character feels, and the money (with a "+" that opens the phone's bank). */
export function TopPill({ hud }: { hud: HudSnapshot }) {
  return (
    <div className="hud-pill" aria-label="Time, mood and money">
      <span className="hud-time">
        <GameIcon name={isNight(hud.hourFloat) ? "moon" : "sun"} size={15} />
        <b>{hud.date}</b> {hud.time}
      </span>
      <i className="hud-sep" />
      <span className={`hud-mood is-${moodTone(hud.moodLabel)}`}>
        <GameIcon name={moodFace(hud.moodLabel)} size={15} /> {hud.moodLabel}
      </span>
      <i className="hud-sep" />
      <span className="hud-money">{naira(hud.money)}</span>
      <button className="hud-plus" aria-label="Open your bank" onClick={() => window.dispatchEvent(new CustomEvent("thelife-open-phone", { detail: "bank" }))}>
        +
      </button>
    </div>
  );
}

/** Bottom left: who you are and what you need right now. */
export function MeCard({ hud }: { hud: HudSnapshot }) {
  const p = hud.profile;
  const initials = p ? `${p.firstName[0] ?? ""}${p.surname[0] ?? ""}`.toUpperCase() : "?";
  return (
    <div className="hud-me" role="group" aria-label="You and your needs">
      <span className={`hud-avatar tier-${p?.tier ?? "middle"}`} title={p ? `${p.firstName} ${p.surname}` : undefined}>
        {initials}
      </span>
      <div className="hud-needs">
        {NEEDS.map((n) => (
          <span key={n.id} className={`hud-need is-${level(hud.needs[n.id])}`} title={`${n.label}: ${hud.needs[n.id]}`}>
            <GameIcon name={n.icon} size={13} />
            <i><b style={{ width: `${hud.needs[n.id]}%` }} /></i>
            <span className="visually-hidden">{n.label} {hud.needs[n.id]} of 100</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Left side: small chips for what is on your plate (food in the house, rent, allowance, skills). */
export function Chips({ hud }: { hud: HudSnapshot }) {
  return (
    <div className="hud-chips">
      <span><GameIcon name="cart" size={14} /> {hud.portions} {hud.portions === 1 ? "portion" : "portions"} · {hud.meals} {hud.meals === 1 ? "meal" : "meals"}</span>
      <span className={hud.rentOwed > 0 ? "is-bad" : ""}>
        <GameIcon name="home" size={14} /> {hud.rentPerWeek === 0 ? "Family house, no rent" : hud.rentOwed > 0 ? `Owe ${naira(hud.rentOwed)}` : `Rent ${naira(hud.rentPerWeek)} in ${hud.rentInDays} day${hud.rentInDays === 1 ? "" : "s"}`}
      </span>
      {hud.allowance > 0 && <span><GameIcon name="money" size={14} /> {naira(hud.allowance)} a week from {hud.profile?.allowanceFrom || "family"}</span>}
      {hud.skills.map((s) => (
        <span key={s.id}><GameIcon name="skill" size={14} /> {s.id} {s.level}</span>
      ))}
    </div>
  );
}

/** Bottom centre: Home, Buy (furniture), Map and Phone. */
export function BottomNav({ active, unread = 0, onBuy, onMap }: { active: "home" | "map"; unread?: number; onBuy?: () => void; onMap?: () => void }) {
  return (
    <nav className="hud-nav" aria-label="Where to">
      <a className={active === "home" ? "is-on" : ""} href="#/play"><GameIcon name="home" size={20} /><span>Home</span></a>
      <button onClick={onBuy} disabled={!onBuy}><GameIcon name="cart" size={20} /><span>Buy</span></button>
      {onMap ? (
        <button className={active === "map" ? "is-on" : ""} onClick={onMap}><GameIcon name="map" size={20} /><span>Map</span></button>
      ) : (
        <a className={active === "map" ? "is-on" : ""} href="#/map"><GameIcon name="map" size={20} /><span>Map</span></a>
      )}
      <button onClick={() => window.dispatchEvent(new CustomEvent("thelife-open-phone", { detail: null }))}>
        <GameIcon name="phone" size={20} />
        <span>Phone</span>
        {unread > 0 && <em>{unread}</em>}
      </button>
    </nav>
  );
}
