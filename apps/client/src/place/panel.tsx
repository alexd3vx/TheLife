import type { GameState } from "@thelife/game-core";
import { plug } from "../phone/remote";
import { GameIcon } from "../ui/icons";

export const naira = (n: number) => `₦${n.toLocaleString()}`;

export type Outcome = { ok: boolean; text?: string; reason?: string };

/** What the interior shell hands each place's service sheet. */
export interface PanelProps {
  state: GameState;
  /** Runs a rule, shows the result, makes the staff reply and refreshes the sheet. */
  run(fn: () => Outcome): void;
  note: { ok: boolean; text: string } | null;
  /** The buyer's price trait for groceries (1 = normal). */
  scale: number;
}

/** Every place with a socket lets you charge your phone. */
export function ChargeButton({ state, run }: Pick<PanelProps, "state" | "run">) {
  const full = state.phone.battery >= 100;
  return (
    <button className="place-charge" disabled={full} onClick={() => run(() => plug(state, "wall"))}>
      <GameIcon name="charging" size={15} /> {full ? "Phone is full" : `Charge your phone (${Math.round(state.phone.battery)}%)`}
    </button>
  );
}
