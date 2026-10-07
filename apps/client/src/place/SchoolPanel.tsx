import { PLAYER, SCHOOL_SERVICES, balance, schoolOpen, schoolWait, skillLevel } from "@thelife/game-core";
import { school } from "../phone/remote";
import { naira, type PanelProps } from "./panel";

const BY_FOCUS: Record<string, string[]> = { class: ["evening"], library: ["library"], lab: ["lab"] };

/** The school's sheet: what you can study where you stand, what it costs, and how far your skills have come. */
export default function SchoolPanel({ state, run, note, focus }: PanelProps) {
  const cash = balance(state.ledger, PLAYER);
  const open = schoolOpen(state);
  const wait = schoolWait(state);
  const ids = BY_FOCUS[focus ?? "class"] ?? BY_FOCUS.class!;
  return (
    <>
      <div className="place-money place-money-2">
        <span><small>Cash</small><b>{naira(cash)}</b></span>
        <span className={open.open ? "" : "is-owe"}><small>School</small><b>{open.open ? "Open" : open.text}</b></span>
      </div>
      <div className="place-needs place-skills" aria-label="Your skills">
        <span><small>Knowledge level</small><b>{skillLevel(state.skills.knowledge ?? 0)}</b></span>
        <span><small>Computer level</small><b>{skillLevel(state.skills.computer ?? 0)}</b></span>
      </div>
      {wait > 0 && <p className="place-note">Rest your mind: you can study again in {wait} minute{wait === 1 ? "" : "s"}.</p>}
      <div className="place-services">
        {SCHOOL_SERVICES.filter((s) => ids.includes(s.id)).map((s) => (
          <button key={s.id} className="place-service" disabled={!open.open || wait > 0 || s.price > cash} onClick={() => run(() => school(state, s.id))}>
            <span><b>{s.name}</b><small>{s.blurb}</small><em>{s.skill === "knowledge" ? "Knowledge" : "Computer"} +{s.xp} xp</em></span>
            <strong>{s.price ? naira(s.price) : "Free"}</strong>
          </button>
        ))}
      </div>
      {note && <p className={`place-result${note.ok ? "" : " is-bad"}`} role="status">{note.text}</p>}
    </>
  );
}
