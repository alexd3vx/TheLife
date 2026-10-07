import { useEffect } from "react";

/** Arrow buttons (and the keyboard's arrow keys) that nudge the picked-up piece of furniture one step at a time. */
export default function EditPad({ active, onMove, onTurn }: { active: boolean; onMove(sx: number, sy: number): void; onTurn(): void }) {
  useEffect(() => {
    if (!active) return;
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const d: Record<string, [number, number]> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      const m = d[e.code];
      if (m) {
        e.preventDefault();
        onMove(m[0], m[1]);
      } else if (e.code === "KeyR") onTurn();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [active, onMove, onTurn]);
  if (!active) return null;
  return (
    <div className="edit-pad" role="group" aria-label="Move the furniture">
      <button className="up" onClick={() => onMove(0, 1)} aria-label="Move away">▲</button>
      <button className="left" onClick={() => onMove(-1, 0)} aria-label="Move left">◀</button>
      <button className="turn" onClick={onTurn} aria-label="Turn">⟳</button>
      <button className="right" onClick={() => onMove(1, 0)} aria-label="Move right">▶</button>
      <button className="down" onClick={() => onMove(0, -1)} aria-label="Move closer">▼</button>
    </div>
  );
}
