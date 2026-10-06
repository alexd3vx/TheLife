import { ACTIONS, ECONOMY, skillPayMultiplier } from "./actions";
import { MINT, PLAYER, SINK, balance, createLedger, transfer } from "./ledger";
import { BASE_DECAY_PER_HOUR, clampNeed, createNeeds, performance } from "./needs";
import type { Profile } from "./profile";
import { createPhone, groceriesFor, jobPayBoost, notify, startLateFeeClock, tickPhone } from "./phone";
import { lagosMinuteNow } from "./lagosClock";
import { createKitchen, finishCooking, finishEating, recipeById, tickKitchen } from "./kitchen";
import { combineTraits, type TraitEffects } from "./traits";
import { DAY_MINUTES, NEED_IDS, type ActionDef, type GameState, type NeedId, type SimEvent, type SimEventKind } from "./types";

const FREE_MINUTES_PER_SECOND = 1; // game minutes per real second when nothing is being "skipped" (the fast test clock)
/** On the real clock, needs fall this many times faster than a plain real-time pace (still slow: hunger lasts about half a day). */
export const REAL_CLOCK_NEEDS_SPEED = 2;

export interface SimOptions {
  /** Follow the real Lagos clock: time passes one second per second, and needs fall slowly. */
  realClock?: boolean;
}

const WARNINGS: Record<NeedId, string> = {
  hunger: "You're getting hungry.",
  energy: "You're getting tired.",
  hygiene: "You could use a shower.",
  bladder: "You really need the toilet!",
  fun: "You're bored.",
};

function startingSkills(profile: Profile | null): Record<string, number> {
  const skills = profile ? { ...profile.skills } : {};
  for (const [id, xp] of Object.entries(combineTraits(profile?.traits).skills)) skills[id] = (skills[id] ?? 0) + xp;
  return skills;
}

export function createGameState(profile: Profile | null = null): GameState {
  const ledger = createLedger();
  transfer(ledger, MINT, PLAYER, profile?.startingMoney ?? ECONOMY.startingMoney, "Starting money", 0);
  return {
    version: 1,
    minute: 8 * 60, // Day 1, 08:00
    needs: createNeeds(),
    ledger,
    inventory: { portions: 3, meals: 0 },
    kitchen: createKitchen(profile?.tier),
    skills: startingSkills(profile),
    incomeCarry: 0,
    rentOwed: 0,
    lastRentDay: 0,
    profile,
    phone: createPhone(profile),
    lastAllowanceDay: 0,
    warned: {},
    stats: { daysSurvived: 0, totalEarned: 0, totalSpent: 0, timesPassedOut: 0 },
  };
}

export interface ActiveAction {
  def: ActionDef;
  /** Game minutes done so far. */
  done: number;
  forced: boolean;
}

export type StartResult = { ok: true } | { ok: false; reason: string };

export interface ClockInfo {
  day: number;
  hour: number;
  minute: number;
  /** Hours as a fraction, 0-24. */
  hourFloat: number;
  label: string;
}

export function clockOf(minute: number): ClockInfo {
  const day = Math.floor(minute / DAY_MINUTES) + 1;
  const inDay = minute % DAY_MINUTES;
  const hour = Math.floor(inDay / 60);
  const min = Math.floor(inDay % 60);
  return { day, hour, minute: min, hourFloat: inDay / 60, label: `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}` };
}

export interface StepResult {
  /** Game minutes that passed. */
  minutes: number;
  /** Set when an action ended during this step. */
  finished: ActiveAction | null;
}

export class Sim {
  state: GameState;
  active: ActiveAction | null = null;
  private events: SimEvent[] = [];
  /** Offline catch-up softens decay and removes accidents; see simulateAbsence. */
  offline = false;

  readonly realClock: boolean;
  private readonly needsSpeed: number;

  constructor(state?: GameState, options: SimOptions = {}) {
    this.state = state ?? createGameState();
    this.realClock = !!options.realClock;
    this.needsSpeed = this.realClock ? REAL_CLOCK_NEEDS_SPEED : 1;
    if (this.realClock) this.state.minute = lagosMinuteNow();
  }

  get clock(): ClockInfo {
    return clockOf(this.state.minute);
  }

  get money(): number {
    return balance(this.state.ledger);
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private emit(kind: SimEventKind, text: string) {
    this.events.push({ kind, text, minute: this.state.minute });
  }

  // -------------------------------------------------------------- starting and stopping actions

  /**
   * The same chair or stove does different things depending on what you picked in the kitchen: a plate waiting at the table makes
   * "have a meal" into eating that plate, and a quick recipe at the stove uses the quick cooking action.
   */
  private resolve(actionId: string): string {
    const k = this.state.kitchen;
    if (actionId === "eatMeal" && k.eating) return "eatDish";
    if (actionId === "cook" && k.cooking) return recipeById(k.cooking)?.action ?? "cook";
    return actionId;
  }

  canStart(requested: string): StartResult {
    const actionId = this.resolve(requested);
    const def = ACTIONS[actionId];
    if (!def) return { ok: false, reason: "Unknown activity." };
    const { needs, inventory } = this.state;
    if (def.blockedIf && needs[def.blockedIf.need] >= def.blockedIf.atLeast) return { ok: false, reason: def.blockedIf.message };
    if (def.needsAtLeast && needs[def.needsAtLeast.need] < def.needsAtLeast.atLeast) return { ok: false, reason: def.needsAtLeast.message };
    if (def.id === "eatDish" && !this.state.kitchen.eating) return { ok: false, reason: "Choose what to eat from the fridge first." };
    const recipeCook = (def.id === "cook" || def.id === "cookQuick") && !!this.state.kitchen.cooking;
    if ((def.id === "cook" || def.id === "cookQuick") && !recipeCook && def.id === "cookQuick") return { ok: false, reason: "Pick a recipe first." };
    if (!recipeCook && def.cost?.portions && inventory.portions < def.cost.portions) {
      return { ok: false, reason: def.id === "snack" ? "The fridge is empty. Order groceries first." : `Not enough ingredients (need ${def.cost.portions}). Order groceries first.` };
    }
    if (def.cost?.meals && inventory.meals < def.cost.meals) return { ok: false, reason: "There's no cooked meal. Cook something first." };
    if (def.cost?.money && this.money < def.cost.money) return { ok: false, reason: "Not enough money." };
    return { ok: true };
  }

  start(requested: string, forced = false): StartResult {
    const actionId = this.resolve(requested);
    const check = forced ? ({ ok: true } as const) : this.canStart(actionId);
    if (!check.ok) return check;
    if (this.active) this.cancel();
    const def = ACTIONS[actionId]!;
    const recipeCook = (def.id === "cook" || def.id === "cookQuick") && !!this.state.kitchen.cooking;
    if (def.cost?.portions && !recipeCook) this.state.inventory.portions -= def.cost.portions;
    if (def.cost?.meals) this.state.inventory.meals -= def.cost.meals;
    this.active = { def, done: 0, forced };
    return { ok: true };
  }

  /** Stops the current action. Effects so far are kept; nothing is refunded and nothing is granted at the end. */
  cancel(): void {
    this.active = null;
  }

  // -------------------------------------------------------------- shop

  /** The player's trait effects (decay rates, pay, prices). */
  get traits(): TraitEffects {
    return combineTraits(this.state.profile?.traits);
  }

  get groceriesPrice(): number {
    return groceriesFor(this.state, ECONOMY.groceriesPrice, this.traits.groceries);
  }

  buyGroceries(): StartResult {
    const price = this.groceriesPrice;
    const result = transfer(this.state.ledger, PLAYER, SINK, price, "Groceries", this.state.minute);
    if (!result.ok) return { ok: false, reason: `Groceries cost ₦${price.toLocaleString()}. You don't have enough.` };
    this.state.inventory.portions += ECONOMY.groceriesPortions;
    this.state.stats.totalSpent += price;
    this.emit("info", `Ordered groceries: +${ECONOMY.groceriesPortions} portions (−₦${price.toLocaleString()}).`);
    return { ok: true };
  }

  // -------------------------------------------------------------- time

  /** Advance by real seconds of play. Returns the game minutes that passed and any action that finished. */
  step(realSeconds: number): StepResult {
    const act = this.active;
    // Real clock: the wall clock always runs at real speed. A long action still gets all its game minutes of effect, squeezed into
    // a few seconds, but the time of day does not jump.
    const rate = act ? act.def.minutesPerSecond : this.realClock ? 1 / 60 : FREE_MINUTES_PER_SECOND;
    let minutes = realSeconds * rate;
    let finished: ActiveAction | null = null;
    if (act) {
      const remaining = act.def.minutes - act.done;
      if (minutes >= remaining) minutes = remaining;
    }
    const clockRatio = this.realClock && act ? 1 / (60 * act.def.minutesPerSecond) : 1;
    if (minutes > 0) finished = this.advance(minutes, clockRatio);
    // Whatever happened, keep the clock on the true time of day in Lagos (a hidden tab or a slow frame can leave it behind).
    if (this.realClock) {
      const now = lagosMinuteNow();
      if (Math.abs(now - this.state.minute) > 1) this.state.minute = now;
    }
    return { minutes, finished };
  }

  /** Advance by game minutes (in small slices so rent, warnings and needs stay accurate). */
  advance(gameMinutes: number, clockRatio = 1): ActiveAction | null {
    let left = gameMinutes;
    let finished: ActiveAction | null = null;
    while (left > 1e-9) {
      const slice = Math.min(left, 10);
      left -= slice;
      this.applySlice(slice, slice * clockRatio);
      const done = this.checkFinished();
      if (done) {
        finished = done;
        break;
      }
    }
    return finished;
  }

  private checkFinished(): ActiveAction | null {
    const act = this.active;
    if (!act) return null;
    const reachedTime = act.done >= act.def.minutes - 1e-6;
    const until = act.def.until;
    const reachedGoal = until ? this.state.needs[until.need] >= until.atLeast - 1e-6 : false;
    if (!reachedTime && !reachedGoal) return null;
    if ((act.def.id === "cook" || act.def.id === "cookQuick") && this.state.kitchen.cooking) {
      const text = finishCooking(this.state);
      if (text) this.emit("good", text);
    } else if (act.def.gives?.meals) {
      this.state.inventory.meals += act.def.gives.meals;
      this.emit("good", "Your meal is ready.");
    }
    if (act.def.id === "eatDish") {
      const eaten = finishEating(this.state);
      if (eaten) this.emit(eaten.spoiled ? "bad" : "good", eaten.text);
    }
    this.active = null;
    return act;
  }

  private applySlice(minutes: number, clockMinutes: number) {
    const s = this.state;
    const act = this.active;
    const hours = minutes / 60;

    for (const id of NEED_IDS) {
      const decayScale = (act?.def.decay?.[id] ?? 1) * (this.offline ? 0.5 : 1) * this.traits.decay[id];
      let perHour = -BASE_DECAY_PER_HOUR[id] * decayScale * this.needsSpeed;
      if (act) perHour += ((act.def.needs[id] ?? 0) / act.def.minutes) * 60;
      if (id === "energy" && s.needs.hunger <= 0) perHour -= 3; // starving drains energy
      s.needs[id] = clampNeed(s.needs[id] + perHour * hours);
    }

    if (act) {
      act.done += minutes;
      if (act.def.incomePerHour) this.earn(act.def.incomePerHour * performance(s.needs) * skillPayMultiplier(s.skills.computer ?? 0) * this.traits.workPay * jobPayBoost(s.phone) * hours);
      if (act.def.skill) {
        const before = Math.floor(Math.sqrt((s.skills[act.def.skill.id] ?? 0) / 8));
        s.skills[act.def.skill.id] = (s.skills[act.def.skill.id] ?? 0) + act.def.skill.xpPerHour * hours;
        const after = Math.floor(Math.sqrt(s.skills[act.def.skill.id]! / 8));
        if (after > before) this.emit("good", `Your ${act.def.skill.id} skill reached level ${after}.`);
      }
    }

    const previousDay = Math.floor(s.minute / DAY_MINUTES);
    s.minute += clockMinutes;
    if (Math.floor(s.minute / DAY_MINUTES) > previousDay) s.stats.daysSurvived += 1;

    this.checkNeeds();
    this.checkRent();
    for (const text of tickKitchen(s, clockMinutes)) this.emit("warn", text);
    tickPhone(s, clockMinutes); // after rent, so rent is paid before the weekly bill
  }

  private earn(amount: number) {
    const s = this.state;
    s.incomeCarry += amount;
    const whole = Math.floor(s.incomeCarry);
    if (whole >= 1) {
      s.incomeCarry -= whole;
      transfer(s.ledger, MINT, PLAYER, whole, "Freelance pay", s.minute);
      s.stats.totalEarned += whole;
    }
  }

  private checkNeeds() {
    const s = this.state;
    for (const id of NEED_IDS) {
      if (s.needs[id] < 25 && !s.warned[id] && !(this.offline && id !== "hunger")) {
        s.warned[id] = true;
        this.emit("warn", WARNINGS[id]);
      } else if (s.needs[id] >= 40) {
        s.warned[id] = false;
      }
    }
    if (this.offline) return;

    if (s.needs.bladder <= 0 && this.active?.def.id !== "toilet") {
      s.needs.bladder = 60;
      s.needs.hygiene = clampNeed(s.needs.hygiene - 25);
      s.needs.fun = clampNeed(s.needs.fun - 10);
      this.emit("bad", "You didn't make it to the toilet in time. How embarrassing.");
    }
    if (s.needs.energy <= 0 && this.active?.def.id !== "passout" && this.active?.def.id !== "sleep") {
      s.stats.timesPassedOut += 1;
      this.emit("bad", "You collapsed from exhaustion.");
      this.start("passout", true);
    }
  }

  // -------------------------------------------------------------- rent

  private evictionWarned = false;

  private checkRent() {
    const s = this.state;
    const day = Math.floor(s.minute / DAY_MINUTES) + 1;
    const hourOfDay = (s.minute % DAY_MINUTES) / 60;
    const rent = s.profile ? s.profile.rentPerWeek : ECONOMY.rentPerWeek; // nepo: the family house, no rent
    const payday = day % ECONOMY.rentDay === 0 && hourOfDay >= ECONOMY.rentHour;
    const due = rent > 0 && payday && day > s.lastRentDay;

    // Family allowance arrives on the same weekly day.
    if (s.profile && s.profile.weeklyAllowance > 0 && payday && day > s.lastAllowanceDay) {
      s.lastAllowanceDay = day;
      transfer(s.ledger, MINT, PLAYER, s.profile.weeklyAllowance, `Allowance from ${s.profile.allowanceFrom || "family"}`, s.minute);
      this.emit("good", `${s.profile.allowanceFrom || "Family"} sent your allowance: ₦${s.profile.weeklyAllowance.toLocaleString()}.`);
    }
    if (due) {
      s.lastRentDay = day;
      s.rentOwed += rent;
      this.emit("warn", `Rent is due: ₦${rent.toLocaleString()}.`);
    }
    if (s.rentOwed > 0 && this.money > 0 && s.phone.autoPay) {
      const pay = Math.min(this.money, s.rentOwed);
      transfer(s.ledger, PLAYER, SINK, pay, "Rent", s.minute);
      s.rentOwed -= pay;
      s.stats.totalSpent += pay;
      if (s.rentOwed === 0) this.emit("info", `Rent paid (₦${pay.toLocaleString()}).`);
    }
    if (due && s.rentOwed > 0 && !s.phone.autoPay) {
      startLateFeeClock(s);
      notify(s, "pay", "Rent due", `Pay ₦${s.rentOwed.toLocaleString()} in LifePay before tomorrow to avoid a late fee.`);
    }
    if (due && s.rentOwed > 0 && s.phone.autoPay) {
      s.rentOwed += ECONOMY.lateFee;
      this.emit("bad", `You couldn't cover the rent. ₦${s.rentOwed.toLocaleString()} is owed, including a late fee.`);
    }
    if (rent > 0 && s.rentOwed >= rent * 2 && !this.evictionWarned) {
      this.evictionWarned = true;
      this.emit("bad", "Your landlord has sent an eviction warning.");
    }
    if (s.rentOwed === 0) this.evictionWarned = false;
  }
}
