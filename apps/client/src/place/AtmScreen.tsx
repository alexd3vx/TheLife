import { useEffect, useRef, useState } from "react";
import { ATM_FEE, ATM_NOTE, ATM_PER_DAY, ATM_PER_TIME, BANKS, PLAYER, SAVINGS, accountOf, atmFee, balance, bankById, statement, type GameState } from "@thelife/game-core";
import { formatPhone, normalisePhone } from "@thelife/shared";
import { atmAirtime, atmChangePin, atmDeposit, atmLogin, atmWithdraw } from "../phone/remote";
import { social } from "../net/social";
import { naira } from "./panel";

// A cash machine that looks and works like one: the card goes in, the PIN is typed on the keypad, the menu is on side keys, the cash
// comes out of a tray and a receipt is offered. The machine belongs to a bank (its colours); using another bank's costs a small fee.

type Step = "idle" | "language" | "pin" | "menu" | "withdraw" | "deposit" | "balance" | "statement" | "transfer" | "airtime" | "pinchange" | "result" | "receipt" | "bye";
type Lang = "en" | "pcm";

const T: Record<Lang, Record<string, string>> = {
  en: { welcome: "Welcome", insert: "Insert your card", pin: "Enter your PIN", choose: "Choose a service", withdraw: "Withdraw cash", deposit: "Pay in cash", balance: "Balance", statement: "Mini statement", transfer: "Transfer", airtime: "Buy airtime", changepin: "Change PIN", exit: "Exit", other: "Other amount", back: "Back", receipt: "Do you want a receipt?", yes: "Yes", no: "No", take: "Take your cash", wait: "Please wait…", bye: "Thank you. Take your card." },
  pcm: { welcome: "Welcome o", insert: "Put your card inside", pin: "Type your PIN", choose: "Wetin you wan do?", withdraw: "Collect cash", deposit: "Pay cash in", balance: "See balance", statement: "Small statement", transfer: "Send money", airtime: "Buy airtime", changepin: "Change PIN", exit: "Comot", other: "Another amount", back: "Go back", receipt: "You want receipt?", yes: "Yes", no: "No", take: "Collect your cash", wait: "Wait small…", bye: "Thank you. Collect your card." },
};

export interface AtmProps {
  state: GameState;
  /** Which bank owns this machine. */
  machineBank: string;
  onClose(): void;
  /** Called after money moved, so the sheet behind redraws. */
  refresh(): void;
}

export default function AtmScreen({ state, machineBank, onClose, refresh }: AtmProps) {
  const brand = bankById(machineBank) ?? BANKS[0]!;
  const account = accountOf(state);
  const [step, setStep] = useState<Step>("idle");
  const [lang, setLang] = useState<Lang>("en");
  const [pin, setPin] = useState("");
  const [typed, setTyped] = useState("");
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [phone, setPhone] = useState("");
  const [cash, setCash] = useState(0);
  const [slip, setSlip] = useState<string[] | null>(null);
  const [newPin, setNewPin] = useState("");
  const [field, setField] = useState<"amount" | "phone">("amount");
  const last = useRef<{ kind: string; amount: number; detail?: string } | null>(null);
  const t = T[lang];
  const blockedNote = account && state.minute < account.blockedUntil;

  useEffect(() => () => refresh(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const digit = (d: string) => {
    if (step === "pin" || step === "pinchange") {
      const set = step === "pin" ? setPin : setNewPin;
      const cur = step === "pin" ? pin : newPin;
      if (cur.length < 4) set(cur + d);
    } else if (step === "transfer" && field === "phone") setPhone((p) => (p + d).slice(0, 13));
    else if (["withdraw", "deposit", "airtime", "transfer"].includes(step)) setTyped((v) => (v + d).replace(/^0+/, "").slice(0, 7));
  };
  const clear = () => {
    if (step === "pin") setPin("");
    else if (step === "pinchange") setNewPin("");
    else if (step === "transfer" && field === "phone") setPhone("");
    else setTyped("");
  };
  const cancel = () => {
    if (step === "idle" || step === "bye") return onClose();
    if (step === "pin" || step === "language") return setStep("bye");
    if (step === "menu") return setStep("bye");
    setTyped("");
    setPhone("");
    setNewPin("");
    setMessage(null);
    setStep("menu");
  };

  const show = (ok: boolean, text: string, done?: { kind: string; amount: number; detail?: string }) => {
    setMessage({ ok, text });
    last.current = ok ? (done ?? null) : null;
    refresh();
    setStep("result");
  };

  const enter = () => {
    if (step === "pin") {
      if (pin.length < 4) return;
      const r = atmLogin(state, pin);
      if (r.ok) {
        setSecret(pin);
        setPin("");
        setStep("menu");
      } else {
        setMessage({ ok: false, text: r.reason });
        setPin("");
        setStep("result");
        refresh();
      }
      return;
    }
    const amount = Number(typed || 0);
    if (step === "withdraw") return withdraw(amount);
    if (step === "deposit") {
      const r = atmDeposit(state, amount, secret);
      return show(r.ok, r.ok ? r.text : r.reason, { kind: "Cash deposit", amount });
    }
    if (step === "airtime") {
      const r = atmAirtime(state, amount, secret);
      return show(r.ok, r.ok ? r.text : r.reason, { kind: "Airtime", amount });
    }
    if (step === "transfer") {
      if (field === "phone") {
        if (normalisePhone(phone)) setField("amount");
        return;
      }
      const to = normalisePhone(phone);
      if (!to) return show(false, "That is not a valid phone number.");
      if (!amount) return;
      setMessage({ ok: true, text: t.wait! });
      setStep("result");
      void social.sendTo(to, amount, secret).then((r) => show(r.ok, r.ok ? `${r.text} ₦25 fee.` : r.text, { kind: "Transfer", amount, detail: formatPhone(to) }));
      return;
    }
    if (step === "pinchange") {
      if (newPin.length < 4) return;
      const r = atmChangePin(state, secret, newPin);
      if (r.ok) setSecret(newPin);
      setNewPin("");
      return show(r.ok, r.ok ? r.text : r.reason);
    }
  };

  const withdraw = (amount: number) => {
    const r = atmWithdraw(state, amount, secret, machineBank);
    if (r.ok) setCash(amount);
    show(r.ok, r.ok ? r.text : r.reason, { kind: "Withdrawal", amount });
  };

  const saved = balance(state.ledger, SAVINGS);
  const fee = atmFee(state, machineBank);
  const menu: { label: string; go: Step }[] = [
    { label: t.withdraw!, go: "withdraw" },
    { label: t.deposit!, go: "deposit" },
    { label: t.balance!, go: "balance" },
    { label: t.statement!, go: "statement" },
    { label: t.transfer!, go: "transfer" },
    { label: t.airtime!, go: "airtime" },
    { label: t.changepin!, go: "pinchange" },
    { label: t.exit!, go: "bye" },
  ];

  const printReceipt = () => {
    const l = last.current;
    setSlip([
      brand.name.toUpperCase(),
      "CASH MACHINE RECEIPT",
      `CARD  **** ${account?.cardNo.slice(-4) ?? "----"}`,
      l ? `${l.kind.toUpperCase()}  ${naira(l.amount)}` : "ENQUIRY",
      ...(l?.detail ? [`TO  ${l.detail}`] : []),
      ...(fee && l?.kind === "Withdrawal" ? [`FEE  ${naira(fee)}`] : []),
      `BALANCE  ${naira(balance(state.ledger, SAVINGS))}`,
      "THANK YOU",
    ]);
    setStep("menu");
  };

  let screen: JSX.Element;
  if (step === "idle") {
    screen = !account ? (
      <Screen title={t.welcome!} brand={brand}><p className="atm-big">You have no bank card.</p><p>Open an account at the counter first.</p></Screen>
    ) : (
      <Screen title={t.welcome!} brand={brand}>
        <p className="atm-big">{t.insert}</p>
        {blockedNote ? <p className="atm-bad">Your card is blocked. Ask at the counter, or try tomorrow.</p> : <button className="atm-go" onClick={() => setStep("language")}>Insert card</button>}
        {fee > 0 && <p className="atm-small">This is another bank's machine: {naira(ATM_FEE)} to withdraw.</p>}
      </Screen>
    );
  } else if (step === "language") {
    screen = (
      <Screen title="Language" brand={brand}>
        <div className="atm-keys wide">
          <button onClick={() => { setLang("en"); setStep("pin"); }}>English</button>
          <button onClick={() => { setLang("pcm"); setStep("pin"); }}>Pidgin</button>
        </div>
      </Screen>
    );
  } else if (step === "pin") {
    screen = <Screen title={t.pin!} brand={brand}><div className="atm-pin" aria-label="PIN">{[0, 1, 2, 3].map((i) => <i key={i} className={i < pin.length ? "on" : ""} />)}</div><p className="atm-small">Cover the keypad when you type.</p></Screen>;
  } else if (step === "menu") {
    screen = (
      <Screen title={t.choose!} brand={brand}>
        <div className="atm-menu">
          {menu.map((m) => <button key={m.go} onClick={() => { setTyped(""); setMessage(null); setField(m.go === "transfer" ? "phone" : "amount"); setStep(m.go); }}>{m.label}</button>)}
        </div>
        {slip && <Receipt lines={slip} onTear={() => setSlip(null)} />}
      </Screen>
    );
  } else if (step === "withdraw") {
    screen = (
      <Screen title={t.withdraw!} brand={brand}>
        <div className="atm-menu amounts">
          {[1000, 2000, 5000, 10000, 20000].map((n) => <button key={n} onClick={() => withdraw(n)}>{naira(n)}</button>)}
          <button onClick={() => setTyped("")}>{t.other}</button>
        </div>
        <p className="atm-amount">{typed ? naira(Number(typed)) : "—"}</p>
        <p className="atm-small">Notes of {naira(ATM_NOTE)}. Up to {naira(ATM_PER_TIME)} at a time and {naira(ATM_PER_DAY)} a day.{fee ? ` Fee ${naira(fee)}.` : ""} Type an amount and press Enter.</p>
      </Screen>
    );
  } else if (step === "deposit" || step === "airtime") {
    screen = <Screen title={step === "deposit" ? t.deposit! : t.airtime!} brand={brand}><p className="atm-amount">{typed ? naira(Number(typed)) : "—"}</p><p className="atm-small">{step === "deposit" ? `Cash you hold: ${naira(balance(state.ledger, PLAYER))}. Notes of ${naira(ATM_NOTE)}.` : "₦100 to ₦5,000, added to your phone."} Press Enter.</p></Screen>;
  } else if (step === "balance") {
    screen = <Screen title={t.balance!} brand={brand}><p className="atm-small">Available balance</p><p className="atm-amount big">{naira(saved)}</p><p className="atm-small">Account {account?.number}</p></Screen>;
  } else if (step === "statement") {
    const rows = statement(state, 6);
    screen = (
      <Screen title={t.statement!} brand={brand}>
        <ul className="atm-list">
          {rows.length === 0 && <li>No movements yet.</li>}
          {rows.map((r, i) => <li key={i}><span>{r.text}</span><b className={r.amount < 0 ? "neg" : "pos"}>{r.amount < 0 ? "−" : "+"}{naira(Math.abs(r.amount))}</b></li>)}
        </ul>
      </Screen>
    );
  } else if (step === "transfer") {
    screen = (
      <Screen title={t.transfer!} brand={brand}>
        <p className="atm-small">{field === "phone" ? "Their phone number, then Enter" : "How much? then Enter"}</p>
        <p className={`atm-amount${field === "phone" ? " active" : ""}`}>{phone ? formatPhone(phone) : "0990 …"}</p>
        {field === "amount" && <p className="atm-amount active">{typed ? naira(Number(typed)) : "—"}</p>}
        <p className="atm-small">₦25 fee. Up to ₦2,000,000 a day.</p>
      </Screen>
    );
  } else if (step === "pinchange") {
    screen = <Screen title={t.changepin!} brand={brand}><p className="atm-small">Type a new 4-digit PIN, then Enter</p><div className="atm-pin">{[0, 1, 2, 3].map((i) => <i key={i} className={i < newPin.length ? "on" : ""} />)}</div></Screen>;
  } else if (step === "result") {
    screen = (
      <Screen title={message?.ok ? "Done" : "Sorry"} brand={brand}>
        <p className={message?.ok ? "atm-big" : "atm-bad"}>{message?.text}</p>
        {message?.ok && last.current && <div className="atm-keys wide"><button onClick={() => { printReceipt(); }}>Print receipt</button><button onClick={() => { last.current = null; setStep(secret ? "menu" : "bye"); }}>{secret ? "Another service" : t.exit}</button></div>}
        {!message?.ok && <div className="atm-keys wide"><button onClick={() => setStep(secret ? "menu" : "idle")}>{t.back}</button></div>}
      </Screen>
    );
  } else {
    screen = <Screen title={t.bye!} brand={brand}><p className="atm-big">{t.bye}</p></Screen>;
  }

  useEffect(() => {
    if (step === "bye") {
      const id = window.setTimeout(onClose, 1500);
      return () => window.clearTimeout(id);
    }
  }, [step, onClose]);

  const menuKeys = step === "menu" ? menu : [];
  return (
    <div className="atm" role="dialog" aria-label="Cash machine" style={{ "--atm": brand.color } as React.CSSProperties}>
      <div className="atm-body">
        <div className="atm-top"><b>{brand.name}</b><button className="atm-x" onClick={onClose} aria-label="Step away">Step away</button></div>
        <div className="atm-bezel">
          <div className="atm-side left">{menuKeys.slice(0, 4).map((m) => <button key={m.go} aria-label={m.label} onClick={() => { setTyped(""); setField(m.go === "transfer" ? "phone" : "amount"); setStep(m.go); }} />)}</div>
          <div className="atm-screen">{screen}</div>
          <div className="atm-side right">{menuKeys.slice(4).map((m) => <button key={m.go} aria-label={m.label} onClick={() => { setTyped(""); setField("amount"); setStep(m.go); }} />)}</div>
        </div>
        <div className="atm-lower">
          <div className="atm-pad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} onClick={() => digit(d)}>{d}</button>)}
            <button className="red" onClick={cancel}>Cancel</button>
            <button onClick={() => digit("0")}>0</button>
            <button className="green" onClick={enter}>Enter</button>
            <button className="yellow wide" onClick={clear}>Clear</button>
          </div>
          <div className="atm-slots">
            <div className={`atm-slot card${step !== "idle" ? " in" : ""}`}><span>CARD</span></div>
            <div className="atm-slot print"><span>RECEIPT</span></div>
            <div className={`atm-tray${cash ? " has" : ""}`} onClick={() => setCash(0)}>
              <span>CASH</span>
              {cash > 0 && <div className="atm-notes" aria-label={`Cash ${naira(cash)}`}>{Array.from({ length: Math.min(8, Math.ceil(cash / 2500)) }, (_, i) => <i key={i} style={{ transform: `translateY(${i * -3}px) rotate(${i % 2 ? 2 : -2}deg)` }} />)}<em>Tap to take {naira(cash)}</em></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Screen({ title, brand, children }: { title: string; brand: { name: string; color: string }; children: React.ReactNode }) {
  return (
    <div className="atm-face">
      <header style={{ background: brand.color }}>{title}</header>
      <div className="atm-content">{children}</div>
    </div>
  );
}

function Receipt({ lines, onTear }: { lines: string[]; onTear(): void }) {
  return (
    <button className="atm-receipt" onClick={onTear} aria-label="Tear off the receipt">
      {lines.map((l, i) => <span key={i}>{l}</span>)}
      <em>tap to take</em>
    </button>
  );
}

export type { GameState };
