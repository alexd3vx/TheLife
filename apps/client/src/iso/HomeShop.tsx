import { useMemo, useState } from "react";
import { FURNITURE, PLAYER, balance, type FurnitureCategory } from "@thelife/game-core";
import type { GameSession } from "../play/gameSession";

const CATEGORY_LABEL: Record<FurnitureCategory, string> = {
  seating: "Seating",
  tables: "Tables",
  bedroom: "Bedroom",
  storage: "Storage",
  electronics: "Electronics",
  appliances: "Appliances",
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  lighting: "Lighting",
  decor: "Decor",
};

/** The furniture shop for the home: everything the catalogue sells, with the price, and a way to buy it. */
export default function HomeShop({ session, onBuy, onClose }: { session: GameSession; onBuy(furniture: string): void; onClose(): void }) {
  const [cat, setCat] = useState<FurnitureCategory>("seating");
  const money = balance(session.sim.state.ledger, PLAYER);
  const cats = useMemo(() => (Object.keys(CATEGORY_LABEL) as FurnitureCategory[]).filter((c) => FURNITURE.some((f) => f.category === c)), []);
  const items = FURNITURE.filter((f) => f.category === cat).sort((a, b) => a.price - b.price);
  return (
    <div className="home-shop" role="dialog" aria-label="Furniture shop">
      <header>
        <h3>Furniture shop</h3>
        <span className="home-shop-money">₦{money.toLocaleString()}</span>
        <button className="home-shop-close" onClick={onClose} aria-label="Close the shop">×</button>
      </header>
      <nav>
        {cats.map((c) => (
          <button key={c} className={c === cat ? "is-on" : ""} onClick={() => setCat(c)}>{CATEGORY_LABEL[c]}</button>
        ))}
      </nav>
      <ul>
        {items.map((f) => (
          <li key={f.id}>
            <img src={`${import.meta.env.BASE_URL}sprites/props/${f.id}_0.webp`} alt="" loading="lazy" />
            <div>
              <b>{f.name}</b>
              <small>₦{f.price.toLocaleString()}</small>
            </div>
            <button disabled={money < f.price} onClick={() => onBuy(f.id)}>Buy</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
