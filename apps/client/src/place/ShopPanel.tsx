import { useState } from "react";
import { GENERATOR_TANK, INGREDIENTS, MINIMART_STOCK, PLAYER, SNACKS, SURVIVAL_PRICES, balance, survivalOf, shopOpen, type Ingredient, type ShopPlace } from "@thelife/game-core";
import { buyIngredient, shopSnack, survivalBuy, survivalFuel } from "../phone/remote";
import { GameIcon, type FaName } from "../ui/icons";
import { naira, type PanelProps } from "./panel";

const ICON: Record<Ingredient["icon"], FaName> = { apple: "apple", carrot: "carrot", pepper: "pepper", fish: "fish", egg: "egg", cookie: "cookie", seed: "seed", lemon: "lemon", drumstick: "meal", bowl: "meal" };
type Tab = "eat" | "groceries" | "gear";

/** The shop's service sheet: things to eat right now, and groceries for the kitchen (the whole market, a few basics at a fuel station's mini-mart). */
export default function ShopPanel({ kind, state, run, note, scale, focus }: PanelProps & { kind: ShopPlace }) {
  const [tab, setTab] = useState<Tab>(focus === "groceries" ? "groceries" : focus === "gear" ? "gear" : "eat");
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
      {!focus && <nav className="place-tabs">
        <button className={tab === "eat" ? "is-on" : ""} onClick={() => setTab("eat")}>Eat now</button>
        <button className={tab === "groceries" ? "is-on" : ""} onClick={() => setTab("groceries")}>{kind === "market" ? "Groceries" : "Basics"}</button>
        <button className={tab === "gear" ? "is-on" : ""} onClick={() => setTab("gear")}>{kind === "market" ? "Rain & first aid" : "Generator"}</button>
      </nav>}

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

      {tab === "gear" && (
        <div className="place-services">
          {kind === "market" ? (
            <>
              <p className="place-note">Rain soaks you and a soaked person catches cold. A cut left dirty gets infected.</p>
              <Gear name="Umbrella" blurb="Keeps the rain off you when you are out." price={SURVIVAL_PRICES.umbrella} owned={survivalOf(state).umbrella} cash={cash} open={hours.open} onBuy={() => run(() => survivalBuy(state, "umbrella"))} />
              <Gear name="First aid kit" blurb={`Dresses a cut or a sprain. You have ${survivalOf(state).firstAid}.`} price={SURVIVAL_PRICES.firstAid} cash={cash} open={hours.open} onBuy={() => run(() => survivalBuy(state, "firstAid"))} />
            </>
          ) : (
            <>
              <p className="place-note">When NEPA cuts the power, a generator keeps the lights and fan on. It burns about a litre of fuel an hour while the power is out.</p>
              <Gear name="Generator" blurb="A small petrol generator for your home." price={SURVIVAL_PRICES.generator} owned={survivalOf(state).generator.owned} cash={cash} open={hours.open} onBuy={() => run(() => survivalBuy(state, "generator"))} />
              {survivalOf(state).generator.owned && (
                <div className="place-service is-row">
                  <span><b>Fuel</b><small>{survivalOf(state).generator.fuel.toFixed(0)} of {GENERATOR_TANK} litres in the tank · {naira(SURVIVAL_PRICES.fuelPerLitre)} a litre</small></span>
                  <span className="place-qty">
                    <button disabled={!hours.open || SURVIVAL_PRICES.fuelPerLitre * 5 > cash} onClick={() => run(() => survivalFuel(state, 5))}>+5 L</button>
                    <button disabled={!hours.open || SURVIVAL_PRICES.fuelPerLitre * 20 > cash} onClick={() => run(() => survivalFuel(state, 20))}>Fill up</button>
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {note && <p className={`place-result${note.ok ? "" : " is-bad"}`} role="status">{note.text}</p>}
    </>
  );
}

function Gear({ name, blurb, price, owned, cash, open, onBuy }: { name: string; blurb: string; price: number; owned?: boolean; cash: number; open: boolean; onBuy(): void }) {
  return (
    <button className="place-service" disabled={!open || !!owned || price > cash} onClick={onBuy}>
      <span><b>{name}</b><small>{blurb}</small></span>
      <strong>{owned ? "Owned" : naira(price)}</strong>
    </button>
  );
}
