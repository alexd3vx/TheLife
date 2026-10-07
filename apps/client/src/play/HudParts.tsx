import { useState } from "react";
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
        <GameIcon name={moodFace(hud.moodLabel)} size={15} /> <span className="hud-mood-label">{hud.moodLabel}</span>
      </span>
      <i className="hud-sep" />
      <span className="hud-money">{naira(hud.money)}</span>
      <button className="hud-plus" aria-label="Open your bank" onClick={() => window.dispatchEvent(new CustomEvent("thelife-open-phone", { detail: "bank" }))}>
        +
      </button>
    </div>
  );
}

/** Under the time pill: the five needs as small rings. Calm when fine, they colour and pulse when something needs doing. */
export function NeedsRow({ hud }: { hud: HudSnapshot }) {
  return (
    <div className="hud-needs-row" role="group" aria-label="Your needs">
      {NEEDS.map((n) => {
        const v = hud.needs[n.id];
        return (
          <span key={n.id} className={`hud-ring is-${level(v)}`} style={{ ["--p" as string]: `${v}%` }} title={`${n.label}: ${v}`}>
            <GameIcon name={n.icon} size={13} />
            <span className="visually-hidden">{n.label} {v} of 100</span>
          </span>
        );
      })}
    </div>
  );
}

/** Left side: small chips for what is on your plate (food in the house, rent, allowance, skills). */
export function Chips({ hud }: { hud: HudSnapshot }) {
  const soon = hud.rentPerWeek > 0 && (hud.rentOwed > 0 || hud.rentInDays <= 1);
  const hungry = hud.needs.hunger < 35 && hud.portions + hud.meals === 0;
  if (!soon && !hungry) return null;
  return (
    <div className="hud-chips">
      {soon && (
        <span className={hud.rentOwed > 0 ? "is-bad" : ""}>
          <GameIcon name="home" size={14} /> {hud.rentOwed > 0 ? `Owe ${naira(hud.rentOwed)} rent` : `Rent ${naira(hud.rentPerWeek)} due ${hud.rentInDays <= 0 ? "today" : "tomorrow"}`}
        </span>
      )}
      {hungry && <span className="is-bad"><GameIcon name="hunger" size={14} /> No food at home</span>}
    </div>
  );
}

/** A small round menu in the top corner that holds the rarely used buttons, so the view stays clear. */
export function MoreMenu({ items }: { items: { label: string; icon: FaName; run(): void; pressed?: boolean; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="hud-more">
      <button className="hud-round" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <GameIcon name={open ? "close" : "settings"} size={17} />
      </button>
      {open && (
        <div className="hud-more-list" role="menu">
          {items.map((it) => (
            <button key={it.label} role="menuitem" className={`${it.pressed ? "is-on" : ""}${it.danger ? " is-danger" : ""}`} onClick={() => { setOpen(false); it.run(); }}>
              <GameIcon name={it.icon} size={16} /> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bottom centre: Home, Buy (furniture), Map and Phone. */
export function BottomNav({ active, unread = 0, onBuy, onMap, onBag }: { active: "home" | "map"; unread?: number; onBuy?: () => void; onMap?: () => void; onBag?: () => void }) {
  return (
    <nav className="hud-nav" aria-label="Where to">
      <a className={active === "home" ? "is-on" : ""} href="#/play"><GameIcon name="home" size={20} /><span>Home</span></a>
      <button onClick={onBuy} disabled={!onBuy}><GameIcon name="cart" size={20} /><span>Buy</span></button>
      {onBag && <button onClick={onBag}><GameIcon name="bag" size={20} /><span>Bag</span></button>}
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

/** Top left: your own face; tap it for your profile. */
export function ProfileButton({ hud }: { hud: HudSnapshot }) {
  const p = hud.profile;
  const initials = p ? `${p.firstName[0] ?? ""}${p.surname[0] ?? ""}`.toUpperCase() : "?";
  return (
    <button className={`hud-avatar tier-${p?.tier ?? "middle"}`} onClick={() => window.dispatchEvent(new CustomEvent("thelife-open-profile"))} aria-label="Your profile">
      {initials}
    </button>
  );
}
