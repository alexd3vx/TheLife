import { useMemo, useState } from "react";
import { dobOf, idNumberOf, MINT, PLAYER, SAVINGS, applyForAccount, collectCard, counterOpen, createGameState, transfer, type GameState } from "@thelife/game-core";
import { BACKGROUNDS, profileFrom } from "@thelife/game-core";
import BankPanel from "./BankPanel";
import HospitalPanel from "./HospitalPanel";
import ShopPanel from "./ShopPanel";
import { makeIll, survivalOf } from "@thelife/game-core";
import type { Outcome } from "./panel";
import "./place.css";

/** Dev-only bench: the bank's sheet and cash machine on their own. `#/banktest?stage=form|waiting|ready|account|atm` (before the #). */
export default function BankTestPage() {
  const stage = new URLSearchParams(window.location.search).get("stage") ?? "form";
  const panel = new URLSearchParams(window.location.search).get("panel");
  const state = useMemo<GameState>(() => {
    const s = createGameState();
    s.profile = profileFrom(BACKGROUNDS.find((b) => b.tier === "middle")!, () => 0.5, "female");
    transfer(s.ledger, MINT, PLAYER, 80_000, "test", 0);
    for (let d = 10; d < 17 && !counterOpen(s).open; d++) s.minute = d * 1440 + 10 * 60;
    if (stage !== "form") {
      applyForAccount(s, "naijafirst", dobOf(s.profile), "National ID (NIN)", idNumberOf(s.profile, "National ID (NIN)"), "12 Awolowo Road, Ikoyi");
      if (stage !== "waiting") s.minute += 125;
    }
    if (stage === "account" || stage === "atm") {
      collectCard(s, "2580");
      transfer(s.ledger, MINT, SAVINGS, 120_000, "test", s.minute);
    }
    if (panel) {
      makeIll(s, "malaria");
      survivalOf(s).thirst = 20;
      survivalOf(s).health = 55;
      survivalOf(s).injury = { id: "sprain", since: s.minute, until: s.minute + 1000 };
    }
    (window as unknown as { __bank: GameState }).__bank = s;
    return s;
  }, [stage, panel]);
  const [, bump] = useState(0);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Outcome) => {
    const r = fn();
    setNote({ ok: r.ok, text: r.ok ? (r.text ?? "Done.") : (r.reason ?? "No.") });
    bump((n) => n + 1);
  };
  return (
    <div className="place has-sheet" style={{ position: "fixed", inset: 0, background: "#dfe9fb" }}>
      <div className="place-sheet" style={{ position: "relative", maxHeight: "100%", overflow: "auto", padding: 12 }}>
        {panel === "hospital" ? <HospitalPanel state={state} run={run} note={note} scale={1} focus="care" /> : panel === "market" ? <ShopPanel kind="market" state={state} run={run} note={note} scale={1} focus="gear" /> : panel === "fuel" ? <ShopPanel kind="fuel" state={state} run={run} note={note} scale={1} focus="gear" /> : <BankPanel state={state} run={run} note={note} scale={1} focus={stage === "atm" ? "atm" : undefined} placeId="bank-1" refresh={() => bump((n) => n + 1)} />}
      </div>
    </div>
  );
}
