import { useState } from "react";
import { INGREDIENTS, MINIMART_STOCK, PLAYER, SNACKS, balance, shopOpen, type Ingredient, type ShopPlace } from "@thelife/game-core";
import { buyIngredient, shopSnack } from "../phone/remote";
import { GameIcon, type FaName } from "../ui/icons";
import { ChargeButton, naira, type PanelProps } from "./panel";

const ICON: Record<Ingredient["icon"], FaName> = { apple: "apple", carrot: "carrot", pepper: "pepper", fish: "fish", egg: "egg", cookie: "cookie", seed: "seed", lemon: "lemon", drumstick: "meal", bowl: "meal" };
type Tab = "eat" | "groceries";

/** The shop's service sheet: things to eat right now, and groceries for the kitchen (the whole market, a few basics at a fuel station's mini-mart). */
export default function ShopPanel({ kind, state, run, note, scale }: PanelProps & { kind: ShopPlace }) {
  const [tab, setTab] = useState<Tab>("eat");
  const cash = balance(state.ledger, PLAYER);
  const hours = shopOpen(state, kind);
  const stock = kind === "market" ? INGREDIENTS : INGREDIENTS.filter((i) => MINIMART_STOCK.includes(i.id));
  const price = (n: number) => Math.max(1, Math.round(n * scale));

  return (
    <>
      <div className="place-money place-money-2">
        <span><small>Cash</small><b>{naira(cash)}</b></span>
        <span className={hours.open ? "" : "is-owe"}><small>{hours.open ? "Open" : "Closed"}</small><b>{hours.open ? "Come in" : hours.text}</b></span>
      </div>
      <nav className="place-tabs">
        <button className={tab === "eat" ? "is-on" : ""} onClick={() => setTab("eat")}>Eat now</button>
        <button className={tab === "groceries" ? "is-on" : ""} onClick={() => setTab("groceries")}>{kind === "market" ? "Groceries" : "Basics"}</button>
      </nav>

      {!hours.open && <p className="place-note is-bad">The stalls are shut ({hours.text}). Come back later.</p>}

      {tab === "eat" && (
        <div className="place-services">
          {SNACKS.map((s) => {
            const gives = Object.entries(s.effect).map(([n, v]) => `${n[0]!.toUpperCase()}${n.slice(1)} +${v}`);
            return (
              <button key={s.id} className="place-service" disabled={!hours.open || price(s.price) > cash} onClick={() => run(() => shopSnack(state, kind, s.id))}>
                <span><b>{s.name}</b><small>{s.blurb}</small><em>{gives.join(" · ")}</em></span>
                <strong>{naira(price(s.price))}</strong>
              </button>
            );
          })}
        </div>
      )}

      {tab === "groceries" && (
        <div className="place-services">
          <p className="place-note">These go to your fridge and cupboard at home. Fresh food spoils faster without a fridge.</p>
          {stock.map((i) => (
            <div key={i.id} className="place-service is-row">
              <span className="place-ico"><GameIcon name={ICON[i.icon]} size={20} /></span>
              <span><b>{i.name}</b><small>{naira(price(i.price))} per {i.unit} · {i.fresh ? "keeps best in a fridge" : "keeps well"}</small></span>
              <span className="place-qty">
                <button disabled={!hours.open || price(i.price) > cash} onClick={() => run(() => buyIngredient(state, i.id, 1, scale))}>+1</button>
                <button disabled={!hours.open || price(i.price) * 4 > cash} onClick={() => run(() => buyIngredient(state, i.id, 4, scale))}>+4</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <ChargeButton state={state} run={run} />
      {note && <p className={`place-result${note.ok ? "" : " is-bad"}`} role="status">{note.text}</p>}
    </>
  );
}
