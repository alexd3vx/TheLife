import { CLEARANCE_DAYS, PLAYER, POLICE_SERVICES, balance, clearanceDaysLeft, deskOpen } from "@thelife/game-core";
import { police } from "../phone/remote";
import { ChargeButton, naira, type PanelProps } from "./panel";

/** The police station's sheet: the records desk (clearance certificate), reports, advice, and the reports you have already made. */
export default function PolicePanel({ state, run, note }: PanelProps) {
  const cash = balance(state.ledger, PLAYER);
  const desk = deskOpen(state);
  const left = clearanceDaysLeft(state);
  const reports = state.records?.reports ?? [];

  return (
    <>
      <div className="place-money place-money-2">
        <span><small>Cash</small><b>{naira(cash)}</b></span>
        <span className={desk.open ? "" : "is-owe"}><small>Records desk</small><b>{desk.open ? "Open" : desk.text}</b></span>
      </div>
      {left > 0 && <p className="place-note">Your police clearance is valid for {left} more day{left === 1 ? "" : "s"} (of {CLEARANCE_DAYS}). It is in your bag.</p>}
      <div className="place-services">
        {POLICE_SERVICES.map((s) => {
          const blocked = (s.desk && !desk.open) || s.price > cash || (s.id === "clearance" && left > 30);
          return (
            <button key={s.id} className="place-service" disabled={blocked} onClick={() => run(() => police(state, s.id))}>
              <span><b>{s.name}</b><small>{s.blurb}</small></span>
              <strong>{s.price ? naira(s.price) : "Free"}</strong>
            </button>
          );
        })}
      </div>
      {reports.length > 0 && (
        <div className="place-note">
          Your reports: {reports.slice(-3).map((r) => `${r.no} (${r.text.toLowerCase()})`).join(" · ")}
        </div>
      )}
      <ChargeButton state={state} run={run} />
      {note && <p className={`place-result${note.ok ? "" : " is-bad"}`} role="status">{note.text}</p>}
    </>
  );
}
