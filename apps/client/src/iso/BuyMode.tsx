import { useEffect, useMemo, useState } from "react";
import { FURNITURE, PLAYER, balance, type FurnitureCategory } from "@thelife/game-core";
import type { GameSession } from "../play/gameSession";
import { GameIcon, type FaName } from "../ui/icons";
import EditPad from "./EditPad";
import "./buymode.css";

const CATEGORIES: { id: FurnitureCategory; label: string; icon: FaName }[] = [
  { id: "seating", label: "Seating", icon: "home" },
  { id: "tables", label: "Tables", icon: "meal" },
  { id: "bedroom", label: "Sleep", icon: "moon" },
  { id: "storage", label: "Storage", icon: "bag" },
  { id: "kitchen", label: "Kitchen", icon: "hunger" },
  { id: "appliances", label: "Appliances", icon: "energy" },
  { id: "electronics", label: "Electronics", icon: "phone" },
  { id: "bathroom", label: "Bathroom", icon: "hygiene" },
  { id: "lighting", label: "Lights", icon: "sun" },
  { id: "decor", label: "Decor", icon: "star" },
];
const naira = (n: number) => `₦${n.toLocaleString()}`;
const sprite = (id: string) => `${import.meta.env.BASE_URL}sprites/props/${id}_0.webp`;

export interface BuySelection {
  id: string;
  furniture: string;
  name: string;
  bought: boolean;
  price: number;
}

/**
 * Buy mode: the catalogue slides up from the bottom, you tap a piece to buy it and it lands in the room already picked up; then drag it,
 * tap the floor, or nudge it with the arrows. Turn, sell and done are always one tap away.
 */
export default function BuyMode({ session, sel, onBuy, onTurn, onSell, onNudge, onDone }: { session: GameSession; sel: BuySelection | null; onBuy(furniture: string): void; onTurn(): void; onSell(): void; onNudge(sx: number, sy: number): void; onDone(): void }) {
  const [cat, setCat] = useState<FurnitureCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [browse, setBrowse] = useState(true);
  const [hidden, setHidden] = useState(false);
  const money = balance(session.sim.state.ledger, PLAYER);
  // picking something up puts the catalogue away; letting go brings it back
  useEffect(() => {
    setBrowse(!sel);
    if (!sel) setHidden(false);
  }, [sel?.id]);
  const cats = useMemo(() => CATEGORIES.filter((c) => FURNITURE.some((f) => f.category === c.id)), []);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FURNITURE.filter((f) => (cat === "all" || f.category === cat) && (!q || f.name.toLowerCase().includes(q))).sort((a, b) => a.price - b.price);
  }, [cat, query]);
  const refund = sel ? Math.floor(sel.price * (sel.bought ? 0.6 : 0.25)) : 0;
  const showSheet = browse && !hidden;
  return (
    <>
      <div className="buy-top">
        <span className="buy-chip"><GameIcon name="cart" size={15} /> Buy mode</span>
        <span className="buy-money">{naira(money)}</span>
        <button className="buy-x" onClick={onDone} aria-label="Leave buy mode"><GameIcon name="close" size={16} /></button>
      </div>

      {sel && !browse && (
        <>
          <EditPad active onMove={onNudge} onTurn={onTurn} />
          <div className="buy-selected" role="group" aria-label="The piece you picked up">
            <img src={sprite(sel.furniture)} alt="" />
            <div className="buy-selected-text">
              <b>{sel.name}</b>
              <small>Drag it, tap the floor, or use the arrows</small>
            </div>
            <div className="buy-selected-actions">
              <button onClick={onTurn}>Turn</button>
              <button className="is-sell" onClick={onSell}>Sell {naira(refund)}</button>
              <button onClick={() => setBrowse(true)}>Catalogue</button>
              <button className="is-done" onClick={onDone}>Done</button>
            </div>
          </div>
        </>
      )}

      {!sel && !browse ? null : null}
      {browse && hidden && (
        <button className="buy-show" onClick={() => setHidden(false)}>Show catalogue</button>
      )}
      {showSheet && (
        <section className="buy-sheet" aria-label="Furniture catalogue">
          <div className="buy-grab" />
          <header>
            <h3>Catalogue</h3>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search the catalogue" />
            <button onClick={() => (sel ? setBrowse(false) : setHidden(true))}>{sel ? "Back" : "Hide"}</button>
          </header>
          <nav className="buy-cats" aria-label="Categories">
            <button className={cat === "all" ? "is-on" : ""} onClick={() => setCat("all")}>All</button>
            {cats.map((c) => (
              <button key={c.id} className={cat === c.id ? "is-on" : ""} onClick={() => setCat(c.id)}>
                <GameIcon name={c.icon} size={16} /> {c.label}
              </button>
            ))}
          </nav>
          <ul className="buy-grid">
            {items.length === 0 && <li className="buy-empty">Nothing like that in the shop.</li>}
            {items.map((f) => {
              const poor = money < f.price;
              return (
                <li key={f.id}>
                  <button className={poor ? "is-poor" : ""} disabled={poor} onClick={() => onBuy(f.id)} aria-label={`Buy ${f.name} for ${naira(f.price)}`}>
                    {f.action && <em>{f.action}</em>}
                    <img src={sprite(f.id)} alt="" loading="lazy" />
                    <b>{f.name}</b>
                    <span>{naira(f.price)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
