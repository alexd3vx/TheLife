import { PLAYER, WORSHIP_SERVICES, balance, houseOpen, serviceOn, type Faith } from "@thelife/game-core";
import { worship } from "../phone/remote";
import { naira, type PanelProps } from "./panel";

const BY_FOCUS: Record<string, string[]> = {
  altar: ["service", "counsel"],
  pew: ["pray"],
  offering: ["offering_500", "offering_2000", "offering_10000"],
  candles: ["candle"],
};

/** The sheet at the altar, the pews, the offering box and the candles. What is on offer depends on where you stand. */
export default function WorshipPanel({ faith, state, run, note, focus }: PanelProps & { faith: Faith }) {
  const cash = balance(state.ledger, PLAYER);
  const open = houseOpen(state, faith);
  const on = serviceOn(state, faith);
  const ids = BY_FOCUS[focus ?? "altar"] ?? BY_FOCUS.altar!;
  const imam = faith === "mosque";
  return (
    <>
      <div className="place-money place-money-2">
        <span><small>Cash</small><b>{naira(cash)}</b></span>
        <span className={on.on ? "" : ""}><small>Main service</small><b>{on.on ? "On now" : on.text}</b></span>
      </div>
      {!open.open && <p className="place-note is-bad">It is closed ({open.text}).</p>}
      <div className="place-services">
        {WORSHIP_SERVICES.filter((s) => ids.includes(s.id)).map((s) => {
          const name = s.id === "counsel" && imam ? "Talk with the imam" : s.id === "candle" && imam ? "Light a lamp" : s.name;
          const blocked = !open.open || s.price > cash || (s.id === "service" && !on.on);
          return (
            <button key={s.id} className="place-service" disabled={blocked} onClick={() => run(() => worship(state, faith, s.id))}>
              <span><b>{name}</b><small>{s.blurb}</small></span>
              <strong>{s.price ? naira(s.price) : "Free"}</strong>
            </button>
          );
        })}
      </div>
      {state.records?.giving ? <p className="place-note">You have given {naira(state.records.giving)} in all.</p> : null}
      {note && <p className={`place-result${note.ok ? "" : " is-bad"}`} role="status">{note.text}</p>}
    </>
  );
}
