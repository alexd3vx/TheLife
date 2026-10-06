import { useMemo, useState } from "react";
import {
  DISH_RECIPES, DISH_SHELF_LIFE, INGREDIENTS, dishFresh, dishSpoiled, fridgeSpace, ingredientById, lotFresh, lotSpoiled, missingFor, recipeById, servings, balance,
  type PantryLot, type Dish, type Ingredient,
} from "@thelife/game-core";
import type { GameSession } from "../play/gameSession";
import { buyIngredient, cancelRecipe, chooseDish, chooseRecipe, discardDish, discardLot } from "../phone/remote";
import { GameIcon, type FaName } from "../ui/icons";
import "./kitchen.css";

type Tab = "fridge" | "cook" | "eat" | "shop";

const ICON: Record<Ingredient["icon"], FaName> = { apple: "apple", carrot: "carrot", pepper: "pepper", fish: "fish", egg: "egg", cookie: "cookie", seed: "seed", lemon: "lemon", drumstick: "meal", bowl: "meal" };

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
const timeLeft = (fresh: number, life: number) => {
  const mins = fresh * life;
  if (mins <= 0) return "Gone bad";
  if (mins < 90) return `${Math.round(mins)} min left`;
  if (mins < 2880) return `${Math.round(mins / 60)} h left`;
  return `${Math.round(mins / 1440)} days left`;
};

function Bar({ value }: { value: number }) {
  const colour = value > 0.5 ? "#4cc38a" : value > 0.2 ? "#e9b44c" : "#e5584f";
  return (
    <span className="kt-bar"><i style={{ width: `${Math.max(3, value * 100)}%`, background: colour }} /></span>
  );
}

/**
 * The kitchen: the fridge and cupboard (with how fresh everything is), recipes to cook from what you have, plates ready to eat, and
 * a shop to restock. Cooking and eating start at the stove and the table, so the character really does them.
 */
export default function KitchenPanel({ session, initialTab, onClose, runUse }: { session: GameSession; initialTab: Tab; onClose(): void; runUse(action: string): boolean }) {
  const state = session.sim.state;
  const k = state.kitchen;
  const tier = state.profile?.tier;
  const [tab, setTab] = useState<Tab>(initialTab);
  const [msg, setMsg] = useState<string | null>(null);
  const [, bump] = useState(0);
  const refresh = () => bump((n) => n + 1);
  const say = (r: { ok: boolean; reason?: string; text?: string }) => {
    setMsg(r.ok ? (r.text ?? null) : (r.reason ?? "That didn't work."));
    refresh();
    return r.ok;
  };
  const money = balance(state.ledger);
  const used = useMemo(() => k.lots.reduce((n, l) => n + l.qty, 0) + k.dishes.reduce((n, d) => n + d.qty, 0), [k.lots, k.dishes, state.minute]);

  const startCooking = (id: string) => {
    const r = recipeById(id)!;
    if (!say(chooseRecipe(state, id))) return;
    const act = r.action;
    if (!runUse(act === "cookQuick" ? "cook" : act)) {
      setMsg("There's nowhere to cook here.");
      cancelRecipe(state);
      return;
    }
    onClose();
  };
  const eat = (id: string) => {
    if (!say(chooseDish(state, id))) return;
    if (!runUse("eatMeal")) {
      setMsg("There's nowhere to sit and eat.");
      return;
    }
    onClose();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "fridge", label: k.fridge ? "Fridge" : "Cupboard" },
    { id: "cook", label: "Cook" },
    { id: "eat", label: `Eat${k.dishes.length ? ` (${k.dishes.reduce((n, d) => n + d.qty, 0)})` : ""}` },
    { id: "shop", label: "Shop" },
  ];

  return (
    <div className="kt" role="dialog" aria-label="Kitchen" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="kt-card">
        <header className="kt-head">
          <div>
            <h2>Kitchen</h2>
            <small>{k.fridge ? "A fridge keeps fresh food good for longer." : "No fridge: fresh food goes bad quickly."} {used} items stored.</small>
          </div>
          <button className="kt-x" onClick={onClose} aria-label="Close"><GameIcon name="close" /></button>
        </header>
        <nav className="kt-tabs" role="tablist">
          {tabs.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setMsg(null); }}>{t.label}</button>)}
        </nav>
        {msg && <p className="kt-msg" role="status">{msg}</p>}

        {tab === "fridge" && (
          <div className="kt-list">
            {k.lots.length === 0 && k.dishes.length === 0 && <p className="kt-empty">Empty. Buy something in the Shop tab.</p>}
            {k.dishes.map((d) => <DishRow key={`d-${d.id}-${d.age}`} d={d} onDiscard={() => say(discardDish(state, d.id))} />)}
            {[...k.lots].sort((a, b) => lotFresh(a) - lotFresh(b)).map((l, i) => <LotRow key={`${l.id}-${i}`} l={l} spoiled={lotSpoiled(l, state)} onDiscard={() => say(discardLot(state, l.id))} />)}
            <p className="kt-fine">Space for about {fridgeSpace(tier) || "a few"} things in the {k.fridge ? "fridge" : "cupboard"}.</p>
          </div>
        )}

        {tab === "cook" && (
          <div className="kt-list">
            {k.cooking && (
              <div className="kt-ready">
                <strong>{recipeById(k.cooking)?.name}</strong> is ready to cook.
                <div className="kt-actions">
                  <button className="btn btn-primary" onClick={() => { if (runUse("cook")) onClose(); else setMsg("There's nowhere to cook here."); }}>Go to the stove</button>
                  <button className="btn btn-ghost" onClick={() => say(cancelRecipe(state))}>Put it back</button>
                </div>
              </div>
            )}
            {DISH_RECIPES.map((r) => {
              const miss = missingFor(state, r);
              return (
                <div key={r.id} className={`kt-row${miss.length ? " is-short" : ""}`}>
                  <div className="kt-main">
                    <strong>{r.name}</strong>
                    <small>{r.blurb}</small>
                    <span className="kt-need">
                      {Object.entries(r.needs).map(([id, n]) => {
                        const have = servings(state, id);
                        return <em key={id} className={have >= n ? "ok" : "no"}>{ingredientById(id)?.name} {have}/{n}</em>;
                      })}
                    </span>
                  </div>
                  <button className="btn btn-primary" disabled={miss.length > 0 || !!k.cooking} onClick={() => startCooking(r.id)}>Cook</button>
                </div>
              );
            })}
          </div>
        )}

        {tab === "eat" && (
          <div className="kt-list">
            {k.dishes.length === 0 && <p className="kt-empty">Nothing cooked. Cook something first.</p>}
            {k.dishes.map((d) => {
              const r = recipeById(d.id)!;
              const bad = dishSpoiled(d);
              return (
                <div key={`${d.id}-${d.age}`} className={`kt-row${bad ? " is-bad" : ""}`}>
                  <div className="kt-main">
                    <strong>{r.name} <b>×{d.qty}</b></strong>
                    <small>{bad ? "Gone bad. Don't eat it." : `Fills about ${r.hunger}% hunger`}</small>
                    <Bar value={dishFresh(d)} />
                  </div>
                  <button className="btn btn-primary" onClick={() => eat(d.id)}>{bad ? "Eat anyway" : "Eat"}</button>
                </div>
              );
            })}
            {state.inventory.meals > 0 && <p className="kt-fine">You also have {state.inventory.meals} ready-made meal{state.inventory.meals === 1 ? "" : "s"} from deliveries. Use them from your bag.</p>}
          </div>
        )}

        {tab === "shop" && (
          <div className="kt-list">
            <p className="kt-fine">Corner shop prices. You have {naira(money)}.</p>
            {INGREDIENTS.map((i) => (
              <div key={i.id} className="kt-row">
                <span className="kt-ico"><GameIcon name={ICON[i.icon]} size={20} /></span>
                <div className="kt-main">
                  <strong>{i.name}</strong>
                  <small>{naira(i.price * session.sim.traits.groceries)} per {i.unit} · {i.fresh ? "keeps best in a fridge" : "keeps well"}</small>
                </div>
                <div className="kt-buy">
                  <button disabled={money < i.price} onClick={() => say(buyIngredient(state, i.id, 1, session.sim.traits.groceries))}>+1</button>
                  <button disabled={money < i.price * 4} onClick={() => say(buyIngredient(state, i.id, 4, session.sim.traits.groceries))}>+4</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LotRow({ l, spoiled, onDiscard }: { l: PantryLot; spoiled: boolean; onDiscard(): void }) {
  const ing = ingredientById(l.id)!;
  const fresh = lotFresh(l);
  return (
    <div className={`kt-row${spoiled ? " is-bad" : ""}`}>
      <span className="kt-ico"><GameIcon name={ICON[ing.icon]} size={20} /></span>
      <div className="kt-main">
        <strong>{ing.name} <b>×{l.qty}</b></strong>
        <small>{timeLeft(fresh, ing.shelfLife)}</small>
        <Bar value={fresh} />
      </div>
      {spoiled && <button className="btn btn-ghost" onClick={onDiscard}>Throw away</button>}
    </div>
  );
}

function DishRow({ d, onDiscard }: { d: Dish; onDiscard(): void }) {
  const r = recipeById(d.id)!;
  const fresh = dishFresh(d);
  return (
    <div className={`kt-row${dishSpoiled(d) ? " is-bad" : ""}`}>
      <span className="kt-ico"><GameIcon name="meal" size={20} /></span>
      <div className="kt-main">
        <strong>{r.name} <b>×{d.qty}</b></strong>
        <small>Cooked · {timeLeft(fresh, DISH_SHELF_LIFE)}</small>
        <Bar value={fresh} />
      </div>
      {dishSpoiled(d) && <button className="btn btn-ghost" onClick={onDiscard}>Throw away</button>}
    </div>
  );
}
