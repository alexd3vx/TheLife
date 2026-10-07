import { useState } from "react";
import { ATM_FEE, PLAYER, SAVINGS, balance, counterOpen, loanLimit } from "@thelife/game-core";
import { bankBorrow, bankDeposit, bankRepay, bankWithdraw } from "../phone/remote";
import type { PanelProps } from "./panel";
import { naira } from "./panel";

type Window = "teller" | "atm";

/** The bank's service sheet: the teller (savings, loans) and the cash machine. It uses the same savings and loan as the phone's LifePay. */
export default function BankPanel({ state, run, note, focus }: PanelProps) {
  const [win, setWin] = useState<Window>(focus === "atm" ? "atm" : "teller");
  const [amount, setAmount] = useState("5000");
  const cash = balance(state.ledger, PLAYER);
  const saved = balance(state.ledger, SAVINGS);
  const loan = state.phone.loan?.owed ?? 0;
  const counter = counterOpen(state);
  const value = Math.floor(Number(amount) || 0);
  const atm = win === "atm";
  const closed = !atm && !counter.open;
  const chips = [1000, 5000, 10000, 50000];

  return (
    <>
      <div className="place-money">
        <span><small>Cash</small><b>{naira(cash)}</b></span>
        <span><small>Savings</small><b>{naira(saved)}</b></span>
        <span className={loan ? "is-owe" : ""}><small>Loan</small><b>{loan ? naira(loan) : "None"}</b></span>
      </div>
      {!focus && <nav className="place-tabs">
        <button className={win === "teller" ? "is-on" : ""} onClick={() => setWin("teller")}>Teller</button>
        <button className={win === "atm" ? "is-on" : ""} onClick={() => setWin("atm")}>Cash machine</button>
      </nav>}

      <label className="place-amount">
        <span>Amount</span>
        <i>₦</i>
        <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 9))} aria-label="Amount in naira" />
      </label>
      <div className="place-chips">
        {chips.map((c) => <button key={c} onClick={() => setAmount(String(c))}>{naira(c)}</button>)}
        <button onClick={() => setAmount(String(Math.max(0, atm ? saved : saved)))}>All savings</button>
      </div>

      {closed && <p className="place-note is-bad">The counter is closed ({counter.text}). The cash machine works any time{`, for ₦${ATM_FEE} each time`}.</p>}
      {atm && <p className="place-note">The machine charges {naira(ATM_FEE)} each time. It cannot lend.</p>}

      <div className="place-actions">
        <button disabled={closed || value < 100} onClick={() => run(() => bankDeposit(state, value, atm))}>Save {value >= 100 ? naira(value) : ""}</button>
        <button disabled={closed || value < 100} onClick={() => run(() => bankWithdraw(state, value, atm))}>Take out {value >= 100 ? naira(value) : ""}</button>
        {!atm && <button disabled={closed || value < 100 || !!loan} onClick={() => run(() => bankBorrow(state, value))}>Borrow {value >= 100 ? naira(value) : ""}</button>}
        {!atm && <button disabled={closed || value < 100 || !loan} onClick={() => run(() => bankRepay(state, value))}>Repay loan</button>}
      </div>
      {!atm && <p className="place-note">You can borrow up to {naira(loanLimit(state.profile))} at 10%. Savings earn interest every week, here and on your phone.</p>}

      {note && <p className={`place-result${note.ok ? "" : " is-bad"}`} role="status">{note.text}</p>}
    </>
  );
}
