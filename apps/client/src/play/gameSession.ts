import {
  ACTIONS,
  ECONOMY,
  NEED_IDS,
  Sim,
  createGameState,
  mood,
  moodLabel,
  parseGameState,
  simulateAbsence,
  skillLevel,
  speedFactor,
  type GameState,
  type NeedId,
  type SimEvent,
} from "@thelife/game-core";
import type { GameBridge } from "./controller";

const SAVE_KEY = "thelife.game.v1";

export interface HudSnapshot {
  day: number;
  time: string;
  hourFloat: number;
  money: number;
  needs: Record<NeedId, number>;
  mood: number;
  moodLabel: string;
  portions: number;
  meals: number;
  rentOwed: number;
  rentPerWeek: number;
  /** Days until the next rent is due. */
  rentInDays: number;
  action: { label: string; progress: number } | null;
  skills: { id: string; level: number }[];
  groceriesPrice: number;
}

export interface SavedGame {
  state: GameState;
  savedAt: number;
}

function readSave(): SavedGame | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: unknown; savedAt?: unknown };
    const state = parseGameState(parsed.state);
    if (!state || typeof parsed.savedAt !== "number") return null;
    return { state, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function clearGameSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

/** Owns the simulation for the play screen: loads/saves it, steps it, and exposes it to the controller and HUD. */
export class GameSession implements GameBridge {
  readonly sim: Sim;
  /** Lines shown in the "While you were away" panel, if the player was gone a while. */
  readonly awaySummary: string[] = [];
  private readonly notices: SimEvent[] = [];
  private sinceSave = 0;

  constructor(fresh = false) {
    const saved = fresh ? null : readSave();
    if (saved) {
      const away = simulateAbsence(saved.state, (Date.now() - saved.savedAt) / 60000);
      this.awaySummary.push(...away.lines);
      this.sim = new Sim(saved.state);
    } else {
      this.sim = new Sim(createGameState());
    }
  }

  // ---- GameBridge
  start(actionId: string) {
    return this.sim.start(actionId);
  }
  cancel() {
    this.sim.cancel();
  }
  active() {
    const a = this.sim.active;
    return a ? { id: a.def.id, forced: a.forced } : null;
  }
  speedFactor() {
    return speedFactor(this.sim.state.needs);
  }
  needs() {
    return this.sim.state.needs;
  }
  notice(text: string) {
    this.notices.push({ kind: "warn", text, minute: this.sim.state.minute });
  }

  buyGroceries() {
    const result = this.sim.buyGroceries();
    if (!result.ok) this.notice(result.reason);
    return result;
  }

  /** Advance by real seconds; returns events (including notices from the controller) for the HUD. */
  step(seconds: number): SimEvent[] {
    this.sim.step(seconds);
    this.sinceSave += seconds;
    if (this.sinceSave > 4) this.save();
    const events = [...this.notices.splice(0), ...this.sim.drainEvents()];
    return events;
  }

  save(): void {
    this.sinceSave = 0;
    try {
      const payload: SavedGame = { state: this.sim.state, savedAt: Date.now() };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch {
      // Storage can be full or blocked; the game still runs, just unsaved.
    }
  }

  snapshot(): HudSnapshot {
    const { sim } = this;
    const s = sim.state;
    const clock = sim.clock;
    const act = sim.active;
    const needs = {} as Record<NeedId, number>;
    for (const id of NEED_IDS) needs[id] = Math.round(s.needs[id]);
    const daysToRent = (ECONOMY.rentDay - (clock.day % ECONOMY.rentDay)) % ECONOMY.rentDay;
    return {
      day: clock.day,
      time: clock.label,
      hourFloat: clock.hourFloat,
      money: sim.money,
      needs,
      mood: mood(s.needs),
      moodLabel: moodLabel(s.needs),
      portions: s.inventory.portions,
      meals: s.inventory.meals,
      rentOwed: s.rentOwed,
      rentPerWeek: ECONOMY.rentPerWeek,
      rentInDays: daysToRent === 0 && clock.hour < ECONOMY.rentHour ? 0 : daysToRent === 0 ? ECONOMY.rentDay : daysToRent,
      action: act ? { label: ACTIONS[act.def.id]?.label ?? act.def.label, progress: Math.min(1, act.done / act.def.minutes) } : null,
      skills: Object.entries(s.skills).map(([id, xp]) => ({ id, level: skillLevel(xp) })),
      groceriesPrice: ECONOMY.groceriesPrice,
    };
  }
}
