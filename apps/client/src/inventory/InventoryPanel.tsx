import { useMemo, useState } from "react";
import { BAGS, bagItems, bagSpecFor, packBag, type BagItem } from "@thelife/game-core";
import type { GameSession } from "../play/gameSession";
import { GameIcon, type FaName } from "../ui/icons";
import "./inventory.css";

const ICON: Record<BagItem["icon"], FaName> = { phone: "phone", cash: "money", key: "key", id: "idcard", charger: "plug", bank: "charging", food: "apple", meal: "meal" };
const TINT: Record<BagItem["icon"], string> = { phone: "#4c7dd9", cash: "#3f9e6b", key: "#c9a43a", id: "#8a6ad6", charger: "#d9743a", bank: "#d9743a", food: "#7aa83a", meal: "#d9593a" };

/**
 * The bag: a grid where every item takes the space of its size. What does not fit stays at home. Tap an item to see what it is and what
 * you can do with it.
 */
export default function InventoryPanel({ session, onClose, onPhone }: { session: GameSession; onClose(): void; onPhone(): void }) {
  const state = session.sim.state;
  const spec = bagSpecFor(state);
  const { placed, leftOver } = useMemo(() => packBag(bagItems(state), spec.cols, spec.rows), [state, spec.cols, spec.rows, state.inventory.portions, state.inventory.meals, state.phone.battery, state.phone.chargers.length, state.phone.powerBank.owned]);
  const [picked, setPicked] = useState<string | null>(null);
  const item = [...placed.map((p) => p.item), ...leftOver].find((i) => i.id === picked) ?? null;
  const used = placed.reduce((n, p) => n + p.item.w * p.item.h, 0);
  const total = spec.cols * spec.rows;
  const tier = state.profile?.tier ?? "middle";

  const act = () => {
    if (!item) return;
    if (item.icon === "phone") {
      onClose();
      onPhone();
    } else if (item.icon === "meal") {
      const r = session.start("eatMeal");
      if (!r.ok) session.notice(r.reason);
      onClose();
    }
  };
  const actLabel = item?.icon === "phone" ? "Take it out" : item?.icon === "meal" ? "Eat now" : null;

  return (
    <div className="inv" role="dialog" aria-label="Bag" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="inv-card" style={{ ["--cols" as string]: spec.cols, ["--rows" as string]: spec.rows }}>
        <header className="inv-head">
          <div>
            <h2>{BAGS[tier].name}</h2>
            <small>{used} of {total} spaces used</small>
          </div>
          <button className="inv-close" onClick={onClose} aria-label="Close the bag"><GameIcon name="close" /></button>
        </header>
        <div className="inv-grid" aria-label="What you carry">
          {Array.from({ length: total }, (_, i) => <span key={i} className="inv-cell" />)}
          {placed.map(({ item: it, x, y }) => (
            <button key={it.id} className={`inv-item${picked === it.id ? " is-picked" : ""}`} style={{ ["--x" as string]: x, ["--y" as string]: y, ["--w" as string]: it.w, ["--h" as string]: it.h, ["--tint" as string]: TINT[it.icon] }} onClick={() => setPicked(it.id)} aria-label={`${it.name}${it.qty ? `, ${it.qty}` : ""}`}>
              <GameIcon name={ICON[it.icon]} size={20} />
              {it.w * it.h > 1 && <span className="inv-name">{it.name}</span>}
              {it.qty ? <b className="inv-qty">{it.qty}</b> : null}
            </button>
          ))}
        </div>
        {leftOver.length > 0 && (
          <p className="inv-warn">Your bag is full. {leftOver.map((l) => l.name).join(", ")} stay at home.</p>
        )}
        <div className="inv-info">
          {item ? (
            <>
              <strong>{item.name}</strong>
              <span>{item.note}</span>
              <small>Takes {item.w}×{item.h} spaces</small>
              {actLabel && <button className="btn btn-primary" onClick={act}>{actLabel}</button>}
            </>
          ) : (
            <span>Tap something to see it. A bigger bag carries more.</span>
          )}
        </div>
      </div>
    </div>
  );
}
