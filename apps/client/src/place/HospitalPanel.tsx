import { useState } from "react";
import { CRITICAL, HOSPITAL_SERVICES, NEED_IDS, PLAYER, balance, criticalNeed, type HospitalGroup, type NeedId } from "@thelife/game-core";
import { hospital, hospitalFirstAid } from "../phone/remote";
import { ChargeButton, naira, type PanelProps } from "./panel";

const GROUPS: { id: HospitalGroup; label: string }[] = [
  { id: "care", label: "Care" },
  { id: "ward", label: "Wards" },
  { id: "pharmacy", label: "Pharmacy" },
  { id: "canteen", label: "Canteen" },
];
const NEED_NAME: Record<NeedId, string> = { hunger: "Food", energy: "Energy", hygiene: "Clean", bladder: "Toilet", fun: "Fun" };

/** The hospital's service sheet: how you are doing, free first aid when you are about to collapse, and what each service gives you for the price. */
export default function HospitalPanel({ state, run, note }: PanelProps) {
  const [group, setGroup] = useState<HospitalGroup>("care");
  const cash = balance(state.ledger, PLAYER);
  const critical = criticalNeed(state);
  const list = HOSPITAL_SERVICES.filter((s) => s.group === group);

  return (
    <>
      <div className="place-money place-money-2">
        <span><small>Cash</small><b>{naira(cash)}</b></span>
        <span><small>Open</small><b>All day and night</b></span>
      </div>
      <div className="place-needs" aria-label="How you are doing">
        {NEED_IDS.map((n) => {
          const v = Math.round(state.needs[n]);
          return (
            <span key={n} className={v < CRITICAL ? "is-crit" : v < 35 ? "is-low" : ""}>
              <small>{NEED_NAME[n]}</small>
              <i><em style={{ width: `${v}%` }} /></i>
            </span>
          );
        })}
      </div>

      {critical && (
        <button className="place-aid" onClick={() => run(() => hospitalFirstAid(state))}>
          <b>You look unwell. Free first aid</b>
          <small>The nurses will see you first, with no payment.</small>
        </button>
      )}

      <nav className="place-tabs">
        {GROUPS.map((g) => <button key={g.id} className={group === g.id ? "is-on" : ""} onClick={() => setGroup(g.id)}>{g.label}</button>)}
      </nav>

      <div className="place-services">
        {list.map((s) => {
          const gives = (Object.entries(s.effect) as [NeedId, number][]).map(([n, v]) => `${NEED_NAME[n]} +${v}`);
          if (s.id === "checkup") gives.push("Your neediest +30");
          const poor = s.price > cash;
          return (
            <button key={s.id} className="place-service" disabled={poor} onClick={() => run(() => hospital(state, s.id))}>
              <span><b>{s.name}</b><small>{s.blurb}</small><em>{gives.join(" · ")}</em></span>
              <strong>{s.price ? naira(s.price) : "Free"}</strong>
            </button>
          );
        })}
      </div>

      <ChargeButton state={state} run={run} />
      {note && <p className={`place-result${note.ok ? "" : " is-bad"}`} role="status">{note.text}</p>}
    </>
  );
}
