import { ECONOMY } from "./actions";
import { Sim } from "./sim";
import { moodLabel } from "./needs";
import { NEED_IDS, type GameState } from "./types";

const MAX_AWAY_GAME_MINUTES = 12 * 60;
/** While away, needs never fall below these, and nothing dramatic happens (no accidents, no collapsing). */
const FLOORS = { hunger: 25, energy: 25, hygiene: 30, bladder: 40, fun: 30 } as const;

export interface AbsenceSummary {
  gameMinutes: number;
  lines: string[];
}

/**
 * "What happened while I was away?" One real minute away is one game minute, up to 12 hours. Needs fall at half
 * speed and stop at a floor; rent still falls due and is paid if there's money.
 */
export function simulateAbsence(state: GameState, realMinutesAway: number): AbsenceSummary {
  const minutes = Math.min(MAX_AWAY_GAME_MINUTES, Math.max(0, Math.floor(realMinutesAway)));
  if (minutes < 5) return { gameMinutes: 0, lines: [] };

  const sim = new Sim(state);
  sim.offline = true;
  const before = { ...state.needs };
  const moneyBefore = sim.money;
  for (let i = 0; i < minutes; i += 10) {
    sim.advance(Math.min(10, minutes - i));
    for (const id of NEED_IDS) if (state.needs[id] < FLOORS[id]) state.needs[id] = FLOORS[id];
  }

  const lines: string[] = [];
  const hours = Math.round((minutes / 60) * 10) / 10;
  lines.push(`${hours} hour${hours === 1 ? "" : "s"} passed.`);
  const worse = NEED_IDS.filter((id) => before[id] - state.needs[id] >= 12);
  if (worse.length) lines.push(`You got ${worse.map((id) => ({ hunger: "hungrier", energy: "more tired", hygiene: "less fresh", bladder: "more desperate for the toilet", fun: "more bored" })[id]).join(", ")}.`);
  lines.push(`You feel ${moodLabel(state.needs).toLowerCase()}.`);
  for (const event of sim.drainEvents()) if (event.kind !== "info" || /rent/i.test(event.text)) lines.push(event.text);
  const spent = moneyBefore - sim.money;
  if (spent > 0) lines.push(`₦${spent.toLocaleString()} went on bills.`);
  if (state.rentOwed > 0) lines.push(`You still owe ₦${state.rentOwed.toLocaleString()} in rent.`);
  void ECONOMY;
  return { gameMinutes: minutes, lines };
}
