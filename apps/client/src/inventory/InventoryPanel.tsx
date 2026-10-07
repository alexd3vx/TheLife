import { useMemo, useState } from "react";
import { BAGS, bagItems, bagSpecFor, packBag, type BagItem } from "@thelife/game-core";
import type { GameSession } from "../play/gameSession";
import { GameIcon, type FaName } from "../ui/icons";
import "./inventory.css";

const ICON: Record<BagItem["icon"], FaName> = { phone: "phone", cash: "money", key: "key", id: "idcard", charger: "plug", bank: "charging", food: "apple", meal: "meal" };
const TINT: Record<BagItem["icon"], string> = { phone: "#3d6cf0", cash: "#1f8fd6", key: "#6a7fd8", id: "#7a5cf0", charger: "#2fa7e8", bank: "#2fa7e8", food: "#46a0e0", meal: "#e0563f" };

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

  const pct = Math.round((used / Math.max(1, total)) * 100);
  return (
    <div className="inv" role="dialog" aria-label="Bag" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="inv-card" style={{ ["--cols" as string]: spec.cols, ["--rows" as string]: spec.rows }}>
        <div className="inv-grab" />
        <header className="inv-head">
          <span className="inv-ring" style={{ ["--p" as string]: `${pct}%` }}><GameIcon name="bag" size={20} /></span>
          <div>
            <h2>{BAGS[tier].name}</h2>
            <small>{used} of {total} spaces used{pct >= 100 ? " · full" : ""}</small>
          </div>
          <button className="inv-close" onClick={onClose} aria-label="Close the bag"><GameIcon name="close" size={15} /></button>
        </header>
        <div className="inv-grid" aria-label="What you carry">
          {Array.from({ length: total }, (_, i) => <span key={i} className="inv-cell" />)}
          {placed.map(({ item: it, x, y }) => (
            <button key={it.id} className={`inv-item${picked === it.id ? " is-picked" : ""}`} style={{ ["--x" as string]: x, ["--y" as string]: y, ["--w" as string]: it.w, ["--h" as string]: it.h, ["--tint" as string]: TINT[it.icon] }} onClick={() => setPicked(picked === it.id ? null : it.id)} aria-label={`${it.name}${it.qty ? `, ${it.qty}` : ""}`}>
              <GameIcon name={ICON[it.icon]} size={it.w * it.h > 1 ? 24 : 20} />
              {it.w * it.h > 1 && <span className="inv-name">{it.name}</span>}
              {it.qty ? <b className="inv-qty">{it.qty}</b> : null}
            </button>
          ))}
        </div>
        {leftOver.length > 0 && (
          <p className="inv-warn">Your bag is full. {leftOver.map((l) => l.name).join(", ")} stay at home.</p>
        )}
        <div className={`inv-info${item ? " has-item" : ""}`}>
          {item ? (
            <>
              <span className="inv-info-icon" style={{ ["--tint" as string]: TINT[item.icon] }}><GameIcon name={ICON[item.icon]} size={22} /></span>
              <div>
                <strong>{item.name}{item.qty ? ` ×${item.qty}` : ""}</strong>
                <span>{item.note}</span>
                <small>Takes {item.w}×{item.h} space{item.w * item.h > 1 ? "s" : ""}</small>
              </div>
              {actLabel && <button className="inv-act" onClick={act}>{actLabel}</button>}
            </>
          ) : (
            <span className="inv-hint">Tap something to see it. A bigger bag carries more.</span>
          )}
        </div>
      </div>
    </div>
  );
}
