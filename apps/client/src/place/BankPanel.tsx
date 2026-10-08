import { useState } from "react";
import { BANKS, ID_TYPES, PLAYER, SAVINGS, APPLICATION_MINUTES, accountOf, applicationReady, balance, bankById, counterOpen, loanLimit, statement, TRANSFER_FEE, type BankBrand } from "@thelife/game-core";
import { normalisePhone } from "@thelife/shared";
import { bankApply, bankBorrow, bankCollect, bankDeposit, bankRepay, bankUnblock, bankWithdraw } from "../phone/remote";
import { social } from "../net/social";
import AtmScreen from "./AtmScreen";
import type { PanelProps } from "./panel";
import { naira } from "./panel";

type Window = "teller" | "atm";

/** The machines in a building belong to one bank, which the building's name decides. */
function machineBankFor(placeId: string | undefined): BankBrand {
  let h = 0;
  for (const ch of placeId ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BANKS[h % BANKS.length]!;
}

const mask = (n: string) => `${n.slice(0, 4)} •••• •••• ${n.slice(-4)}`;

/** The bank: open an account (a form, a wait, a card and a PIN), the teller's counter, and the cash machine. */
export default function BankPanel({ state, run, note, focus, placeId, refresh }: PanelProps) {
  const [win, setWin] = useState<Window>(focus === "atm" ? "atm" : "teller");
  const [amount, setAmount] = useState("5000");
  const [atmOpen, setAtmOpen] = useState(focus === "atm");
  const account = accountOf(state);
  const application = state.bank?.application;
  const cash = balance(state.ledger, PLAYER);
  const saved = balance(state.ledger, SAVINGS);
  const loan = state.phone.loan?.owed ?? 0;
  const counter = counterOpen(state);
  const value = Math.floor(Number(amount) || 0);
  const machine = machineBankFor(placeId);
  const chips = [1000, 5000, 10000, 50000];

  return (
    <>
      <div className="place-money">
        <span><small>Cash</small><b>{naira(cash)}</b></span>
        <span><small>Account</small><b>{account ? naira(saved) : "—"}</b></span>
        <span className={loan ? "is-owe" : ""}><small>Loan</small><b>{loan ? naira(loan) : "None"}</b></span>
      </div>
      {!focus && <nav className="place-tabs">
        <button className={win === "teller" ? "is-on" : ""} onClick={() => setWin("teller")}>Teller</button>
        <button className={win === "atm" ? "is-on" : ""} onClick={() => setWin("atm")}>Cash machine</button>
      </nav>}

      {win === "atm" ? (
        <div className="bank-atm-card">
          <div className="bank-atm-badge" style={{ background: machine.color }}>{machine.name}</div>
          <p>{account ? "Use your card and PIN. Any time of day." : "You need a card first. Open an account at the counter."}</p>
          <button className="bank-big" disabled={!account} onClick={() => setAtmOpen(true)}>Use the cash machine</button>
        </div>
      ) : !account ? (
        application ? (
          <Waiting state={state} run={run} note={note} />
        ) : (
          <OpenForm state={state} run={run} closed={!counter.open} counterText={counter.text} />
        )
      ) : (
        <>
          <BankCard state={state} />
          {state.minute < account.blockedUntil && (
            <p className="place-note is-bad">Your card is blocked after wrong PINs. <button className="bank-link" disabled={!counter.open} onClick={() => run(() => bankUnblock(state))}>Unblock it here</button></p>
          )}
          <label className="place-amount">
            <span>Amount</span>
            <i>₦</i>
            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 9))} aria-label="Amount in naira" />
          </label>
          <div className="place-chips">
            {chips.map((c) => <button key={c} onClick={() => setAmount(String(c))}>{naira(c)}</button>)}
            <button onClick={() => setAmount(String(Math.max(0, saved)))}>All of it</button>
          </div>
          {!counter.open && <p className="place-note is-bad">The counter is closed ({counter.text}). The cash machine works any time.</p>}
          <div className="place-actions">
            <button disabled={!counter.open || value < 100} onClick={() => run(() => bankDeposit(state, value))}>Pay in {value >= 100 ? naira(value) : ""}</button>
            <button disabled={!counter.open || value < 100} onClick={() => run(() => bankWithdraw(state, value))}>Take out {value >= 100 ? naira(value) : ""}</button>
            <button disabled={!counter.open || value < 100 || !!loan} onClick={() => run(() => bankBorrow(state, value))}>Borrow {value >= 100 ? naira(value) : ""}</button>
            <button disabled={!counter.open || value < 100 || !loan} onClick={() => run(() => bankRepay(state, value))}>Repay loan</button>
          </div>
          <p className="place-note">The bank lends up to {naira(loanLimit(state.profile))} at 10%, and pays 1.5% a week on what you keep here (a phone-only saver gets 0.5%).</p>
          <Transfer state={state} run={run} />
          <Statement state={state} />
        </>
      )}

      {note && <p className={`place-result${note.ok ? "" : " is-bad"}`} role="status">{note.text}</p>}
      {atmOpen && <AtmScreen state={state} machineBank={machine.id} onClose={() => { setAtmOpen(false); refresh?.(); }} refresh={() => refresh?.()} />}
    </>
  );
}

function BankCard({ state }: { state: PanelProps["state"] }) {
  const a = accountOf(state)!;
  const b = bankById(a.bank)!;
  return (
    <div className="bank-card" style={{ background: `linear-gradient(135deg, ${b.color}, #0b1a33)` }}>
      <div className="bank-card-top"><b>{b.name}</b><span>DEBIT</span></div>
      <div className="bank-card-chip" />
      <div className="bank-card-no">{mask(a.cardNo)}</div>
      <div className="bank-card-bottom"><span>{a.name}</span><span>{a.expiry}</span></div>
      <small className="bank-card-acct">Account {a.number}</small>
    </div>
  );
}

function OpenForm({ state, run, closed, counterText }: { state: PanelProps["state"]; run: PanelProps["run"]; closed: boolean; counterText: string }) {
  const [bank, setBank] = useState<string>(BANKS[0]!.id);
  const [dob, setDob] = useState("");
  const [idType, setIdType] = useState<string>(ID_TYPES[0]!);
  const [idNo, setIdNo] = useState("");
  const [address, setAddress] = useState("");
  const p = state.profile;
  const full = `${p?.firstName ?? ""} ${p?.surname ?? ""}`.trim();
  return (
    <form className="bank-form" onSubmit={(e) => { e.preventDefault(); run(() => bankApply(state, bank, dob, idType, idNo.replace(/\s/g, ""), address)); }}>
      <h3>Open an account</h3>
      <p className="place-note">Fill in the form. The bank checks it, which takes about {APPLICATION_MINUTES / 60} hours, then you collect your debit card and choose your PIN.</p>
      <div className="bank-brands" role="radiogroup" aria-label="Choose a bank">
        {BANKS.map((b) => (
          <button type="button" role="radio" aria-checked={bank === b.id} key={b.id} className={bank === b.id ? "is-on" : ""} onClick={() => setBank(b.id)} style={{ "--b": b.color } as React.CSSProperties}>{b.name}</button>
        ))}
      </div>
      <label><span>Full name</span><input value={full} readOnly aria-label="Full name" /></label>
      <label><span>Date of birth</span><input type="date" value={dob} min="1930-01-01" max="2007-12-31" onChange={(e) => setDob(e.target.value)} required aria-label="Date of birth" /></label>
      <label><span>Phone number</span><input value={social.selfPhone ? social.selfPhone.replace(/(\d{4})(\d{3})(\d{4})/, "$1 $2 $3") : "—"} readOnly aria-label="Phone number" /></label>
      <label><span>ID type</span><select value={idType} onChange={(e) => setIdType(e.target.value)} aria-label="ID type">{ID_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
      <label><span>ID number</span><input value={idNo} maxLength={16} onChange={(e) => setIdNo(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} placeholder="8 to 16 letters and digits" required aria-label="ID number" /></label>
      <label><span>Home address</span><input value={address} maxLength={100} onChange={(e) => setAddress(e.target.value)} placeholder="House number, street, area" required aria-label="Home address" /></label>
      {closed && <p className="place-note is-bad">The counter is closed ({counterText}).</p>}
      <button type="submit" className="bank-big" disabled={closed || !dob || idNo.length < 8 || address.trim().length < 6}>Submit application</button>
    </form>
  );
}

function Waiting({ state, run, note }: { state: PanelProps["state"]; run: PanelProps["run"]; note: PanelProps["note"] }) {
  const app = state.bank!.application!;
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const ready = applicationReady(state);
  const left = Math.max(0, Math.ceil(app.readyAt - state.minute));
  const b = bankById(app.bank)!;
  return (
    <div className="bank-form">
      <h3>{ready ? "Your card is ready" : "Application with " + b.name}</h3>
      {!ready ? (
        <>
          <p className="place-note">The bank is checking your details. About {left >= 60 ? `${Math.ceil(left / 60)} hour${Math.ceil(left / 60) === 1 ? "" : "s"}` : `${left} minutes`} to go. Go and get on with your day; come back and collect your card.</p>
          <div className="bank-wait"><i style={{ width: `${Math.min(100, ((state.minute - app.at) / APPLICATION_MINUTES) * 100)}%`, background: b.color }} /></div>
        </>
      ) : (
        <>
          <p className="place-note">Choose a 4-digit PIN. Don't tell it to anybody, and don't pick 1234 or four of the same digit.</p>
          <label><span>New PIN</span><input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} aria-label="New PIN" /></label>
          <label><span>Again</span><input type="password" inputMode="numeric" maxLength={4} value={again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, ""))} aria-label="Type the PIN again" /></label>
          {pin.length === 4 && again.length === 4 && pin !== again && <p className="place-note is-bad">The two PINs don't match.</p>}
          <button className="bank-big" disabled={pin.length !== 4 || pin !== again} onClick={() => run(() => bankCollect(state, pin))}>Collect my card</button>
        </>
      )}
      {note && null}
    </div>
  );
}

function Transfer({ state, run }: { state: PanelProps["state"]; run: PanelProps["run"] }) {
  const [phone, setPhone] = useState("");
  const [sum, setSum] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const to = normalisePhone(phone);
  const n = Math.floor(Number(sum) || 0);
  return (
    <form className="bank-form transfer" onSubmit={(e) => {
      e.preventDefault();
      if (!to || n < 100) return;
      setBusy(true);
      void social.sendTo(to, n, pin).then((r) => { setBusy(false); setResult(r); if (r.ok) { setSum(""); setPin(""); } run(() => ({ ok: r.ok, text: r.text, reason: r.text })); });
    }}>
      <h3>Send money</h3>
      <label><span>Phone number</span><input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9+\s-]/g, "").slice(0, 16))} placeholder="0990 123 4567" inputMode="tel" aria-label="Their phone number" /></label>
      <label><span>Amount (₦)</span><input value={sum} onChange={(e) => setSum(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" aria-label="Amount to send" /></label>
      <label><span>Card PIN</span><input type="password" value={pin} maxLength={4} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" aria-label="Card PIN" /></label>
      <button type="submit" className="bank-big" disabled={busy || !to || n < 100 || pin.length !== 4}>{busy ? "Sending…" : `Send ${n >= 100 ? naira(n) : ""}`}</button>
      <p className="place-note">₦{TRANSFER_FEE} fee. They get it at once, or the next time they play. It goes to a player's phone number.</p>
      {result && <p className={`place-result${result.ok ? "" : " is-bad"}`}>{result.text}</p>}
    </form>
  );
}

function Statement({ state }: { state: PanelProps["state"] }) {
  const rows = statement(state, 8);
  if (!rows.length) return null;
  return (
    <div className="bank-statement">
      <h3>Recent</h3>
      <ul>
        {rows.map((r, i) => <li key={i}><span>{r.text}</span><b className={r.amount < 0 ? "neg" : "pos"}>{r.amount < 0 ? "−" : "+"}{naira(Math.abs(r.amount))}</b></li>)}
      </ul>
    </div>
  );
}
