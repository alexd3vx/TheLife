import { MINT, PLAYER, SINK, balance, transfer } from "./ledger";
import { skillLevel } from "./actions";
import { isDead, modelOf, notify, wallPower, type PhoneResult } from "./phone";
import {
  COURSES, DIARY_MOODS, FOCUS_XP, GIGS, GIG_GAP_MINUTES, LESSON_GAP_MINUTES, LESSON_XP, STOCKS, WATER_GOAL, WORKOUTS, WORKOUT_GAP_MINUTES, mealById, seeded, stockPrice,
} from "./phoneContent";
import { MOBILE_SPEED, STORAGE_MB, homePlanById, storeAppById, tierAtLeast, type StoreAppId } from "./phoneStoreData";
import type { GameState } from "./types";
import { DAY_MINUTES } from "./types";

// LifeStore, the connection (Wi-Fi or mobile data), storage, and the small rules the downloaded apps need.
// Pure rules over GameState, like the rest of the phone.

const fail = (reason: string): PhoneResult => ({ ok: false, reason });
const done = (text?: string): PhoneResult => ({ ok: true, text });
const dayOf = (state: GameState) => Math.floor(state.minute / DAY_MINUTES) + 1;
const weekOf = (state: GameState) => Math.floor(state.minute / (DAY_MINUTES * 7));

// ---------------------------------------------------------------- connection

export interface Link {
  kind: "wifi" | "data" | "none";
  /** Download speed, MB per game minute. */
  speed: number;
  label: string;
}

/** Does the home internet plan work right now? It needs a paid plan and power for the router. */
export function homeWifiWorks(state: GameState): boolean {
  const p = state.phone;
  return !!p.homeNet && p.homeNet.until > state.minute && wallPower(state);
}

/** How the phone is connected right now: Wi-Fi if it can be, otherwise mobile data, otherwise nothing. */
export function connection(state: GameState): Link {
  const p = state.phone;
  if (p.wifiOn && homeWifiWorks(state)) {
    const plan = homePlanById(p.homeNet!.plan);
    return { kind: "wifi", speed: plan?.speed ?? 45, label: "Wi-Fi" };
  }
  if (p.mobileOn && p.dataMB > 0) return { kind: "data", speed: MOBILE_SPEED[p.model], label: p.model === "basic" ? "3G" : "4G" };
  return { kind: "none", speed: 0, label: p.mobileOn ? "No data" : "Offline" };
}

export function setWifi(state: GameState, on: boolean): PhoneResult {
  state.phone.wifiOn = on;
  return done(on ? "Wi-Fi on." : "Wi-Fi off.");
}

export function setMobileData(state: GameState, on: boolean): PhoneResult {
  state.phone.mobileOn = on;
  return done(on ? "Mobile data on." : "Mobile data off.");
}

export function buyHomePlan(state: GameState, planId: string): PhoneResult {
  const plan = homePlanById(planId);
  if (!plan) return fail("Unknown plan.");
  const p = state.phone;
  const price = plan.price;
  const r = transfer(state.ledger, PLAYER, SINK, price, plan.name, state.minute);
  if (!r.ok) return fail(`That costs ₦${price.toLocaleString()}. You don't have enough.`);
  state.stats.totalSpent += price;
  const from = p.homeNet && p.homeNet.until > state.minute ? p.homeNet.until : state.minute;
  p.homeNet = { plan: plan.id, until: from + plan.days * DAY_MINUTES };
  p.wifiOn = true;
  return done(`${plan.name} is active for ${plan.days} days.`);
}

// ---------------------------------------------------------------- storage

export function storageUsedMB(state: GameState): number {
  const p = state.phone;
  const apps = p.installed.reduce((sum, id) => sum + (storeAppById(id)?.sizeMB ?? 0), 0);
  const partial = p.downloads.reduce((sum, d) => sum + d.doneMB, 0);
  return Math.round(apps + partial);
}

export function storageTotalMB(state: GameState): number {
  return STORAGE_MB[state.phone.model];
}

// ---------------------------------------------------------------- downloading

export function startDownload(state: GameState, id: StoreAppId): PhoneResult {
  const p = state.phone;
  const app = storeAppById(id);
  if (!app) return fail("That app isn't in the store.");
  if (isDead(p)) return fail("The battery is empty.");
  if (p.installed.includes(id)) return fail(`${app.name} is already installed.`);
  if (p.downloads.some((d) => d.appId === id)) return fail(`${app.name} is already downloading.`);
  if (!tierAtLeast(p.model, app.minTier)) return fail(`${app.name} needs a better phone than the ${modelOf(p).name}.`);
  if (p.downloads.length >= 4) return fail("Too many downloads at once. Wait for one to finish.");
  const queued = p.downloads.reduce((sum, d) => sum + (storeAppById(d.appId)?.sizeMB ?? 0), 0);
  const installed = p.installed.reduce((sum, a) => sum + (storeAppById(a)?.sizeMB ?? 0), 0);
  if (installed + queued + app.sizeMB > storageTotalMB(state)) {
    return fail(`Not enough space. ${app.name} needs ${app.sizeMB} MB. Delete an app in Settings → Storage.`);
  }
  if (connection(state).kind === "none") return fail("No connection. Turn on Wi-Fi, or buy data in LifePay.");
  if (app.price > 0) {
    const r = transfer(state.ledger, PLAYER, SINK, app.price, `LifeStore: ${app.name}`, state.minute);
    if (!r.ok) return fail(`${app.name} costs ₦${app.price.toLocaleString()}. You don't have enough.`);
    state.stats.totalSpent += app.price;
  }
  p.downloads.push({ appId: id, doneMB: 0, paused: false });
  return done(`Downloading ${app.name}…`);
}

export function cancelDownload(state: GameState, id: StoreAppId): PhoneResult {
  const p = state.phone;
  const before = p.downloads.length;
  p.downloads = p.downloads.filter((d) => d.appId !== id);
  return p.downloads.length < before ? done("Download cancelled.") : fail("That isn't downloading.");
}

export function uninstallApp(state: GameState, id: StoreAppId): PhoneResult {
  const p = state.phone;
  if (!p.installed.includes(id)) return fail("That app isn't installed.");
  p.installed = p.installed.filter((a) => a !== id);
  return done(`${storeAppById(id)?.name ?? "App"} removed.`);
}

/** Moves the download queue along. Called from tickPhone: the first download gets the connection's speed. */
export function tickDownloads(state: GameState, minutes: number): void {
  const p = state.phone;
  if (!p.downloads.length || isDead(p)) return;
  let left = minutes;
  while (left > 1e-9 && p.downloads.length) {
    const d = p.downloads[0]!;
    const app = storeAppById(d.appId);
    if (!app) {
      p.downloads.shift();
      continue;
    }
    const link = connection(state);
    if (link.kind === "none") {
      if (!d.paused) {
        d.paused = true;
        notify(state, "store", "Download paused", `${app.name} is waiting for a connection.`);
      }
      return;
    }
    d.paused = false;
    const wanted = Math.min(app.sizeMB - d.doneMB, link.speed * left);
    const got = link.kind === "data" ? Math.min(wanted, p.dataMB) : wanted;
    if (link.kind === "data") p.dataMB -= got;
    d.doneMB += got;
    left -= link.speed > 0 ? got / link.speed : left;
    if (d.doneMB >= app.sizeMB - 1e-6) {
      p.downloads.shift();
      p.installed.push(app.id);
      notify(state, "store", "App installed", `${app.name} is ready to open.`);
    } else if (got < wanted - 1e-9) {
      continue; // ran out of data mid-download: loop so the next pass reports "paused"
    }
  }
}

// ---------------------------------------------------------------- small app rules

/** Fun from using an app, capped at 100. */
export function addFun(state: GameState, amount: number): void {
  state.needs.fun = Math.max(0, Math.min(100, state.needs.fun + amount));
}

/** Time spent in an app: social, media and some tools lift the mood a little. */
export function useApp(state: GameState, id: StoreAppId, minutes: number): void {
  const app = storeAppById(id);
  if (app && app.funPerMin > 0) addFun(state, app.funPerMin * minutes);
}

export function addNote(state: GameState, text: string): PhoneResult {
  const t = text.trim().slice(0, 400);
  if (!t) return fail("Write something first.");
  if (state.phone.notes.length >= 40) return fail("Too many notes. Delete one.");
  state.phone.notes.unshift(t);
  return done("Saved.");
}

export function deleteNote(state: GameState, index: number): PhoneResult {
  if (index < 0 || index >= state.phone.notes.length) return fail("No such note.");
  state.phone.notes.splice(index, 1);
  return done("Deleted.");
}

/** Records a game score; a new best is worth a little fun. */
export function recordScore(state: GameState, game: StoreAppId, score: number): PhoneResult {
  const s = Math.max(0, Math.floor(score));
  const best = state.phone.scores[game] ?? 0;
  addFun(state, Math.min(8, 1 + s / 40));
  if (s > best) {
    state.phone.scores[game] = s;
    return done(`New best: ${s}!`);
  }
  return done();
}

// --- LifeInvest

export const TRADE_FEE = 0.01;

export function buyShares(state: GameState, symbol: string, qty: number): PhoneResult {
  if (!STOCKS.some((s) => s.symbol === symbol)) return fail("Unknown share.");
  const n = Math.floor(qty);
  if (!(n > 0) || n > 10_000) return fail("Enter a number of shares.");
  const cost = Math.round(stockPrice(symbol, dayOf(state)) * n * (1 + TRADE_FEE));
  const r = transfer(state.ledger, PLAYER, SINK, cost, `Shares: ${symbol}`, state.minute);
  if (!r.ok) return fail(`That costs ₦${cost.toLocaleString()}. You don't have enough.`);
  state.phone.holdings[symbol] = (state.phone.holdings[symbol] ?? 0) + n;
  return done(`Bought ${n} ${symbol} for ₦${cost.toLocaleString()}.`);
}

export function sellShares(state: GameState, symbol: string, qty: number): PhoneResult {
  const have = state.phone.holdings[symbol] ?? 0;
  const n = Math.floor(qty);
  if (!(n > 0) || n > have) return fail("You don't own that many.");
  const proceeds = Math.round(stockPrice(symbol, dayOf(state)) * n * (1 - TRADE_FEE));
  transfer(state.ledger, MINT, PLAYER, proceeds, `Shares sold: ${symbol}`, state.minute);
  state.phone.holdings[symbol] = have - n;
  if (state.phone.holdings[symbol] === 0) delete state.phone.holdings[symbol];
  return done(`Sold ${n} ${symbol} for ₦${proceeds.toLocaleString()}.`);
}

export function portfolioValue(state: GameState): number {
  const day = dayOf(state);
  return Math.round(Object.entries(state.phone.holdings).reduce((sum, [sym, n]) => sum + stockPrice(sym, day) * n, 0));
}

// --- Ajo (a thrift group of six)

export const AJO_AMOUNT = 2_000;
export const AJO_MEMBERS = 6;

export function joinAjo(state: GameState): PhoneResult {
  const p = state.phone;
  if (p.ajo && !(p.ajo.contributed >= AJO_MEMBERS)) return fail("You're already in a group.");
  const payoutAt = 1 + Math.floor(seeded(state.minute, 77) * AJO_MEMBERS);
  p.ajo = { contributed: 0, payoutAt: Math.min(AJO_MEMBERS, payoutAt), lastWeek: -1, paidOut: false };
  return done(`You joined an ajo group of ${AJO_MEMBERS}. Everyone pays ₦${AJO_AMOUNT.toLocaleString()} a week, and each week one member collects ₦${(AJO_AMOUNT * AJO_MEMBERS).toLocaleString()}.`);
}

export function payAjo(state: GameState): PhoneResult {
  const a = state.phone.ajo;
  if (!a || a.contributed >= AJO_MEMBERS) return fail("You're not in a group.");
  if (a.lastWeek === weekOf(state)) return fail("You've paid for this week. Come back next week.");
  const r = transfer(state.ledger, PLAYER, SINK, AJO_AMOUNT, "Ajo contribution", state.minute);
  if (!r.ok) return fail(`The contribution is ₦${AJO_AMOUNT.toLocaleString()}. You don't have enough.`);
  state.stats.totalSpent += AJO_AMOUNT;
  a.contributed += 1;
  a.lastWeek = weekOf(state);
  if (a.contributed === a.payoutAt && !a.paidOut) {
    const pot = AJO_AMOUNT * AJO_MEMBERS;
    transfer(state.ledger, MINT, PLAYER, pot, "Ajo payout", state.minute);
    state.stats.totalEarned += pot;
    a.paidOut = true;
    notify(state, "ajo", "Ajo payout", `It's your turn! ₦${pot.toLocaleString()} has been paid to you.`);
    return done(`It's your turn! ₦${pot.toLocaleString()} paid out.`);
  }
  if (a.contributed >= AJO_MEMBERS) return done("The group has finished. Well done!");
  return done(`Paid. ${a.contributed} of ${AJO_MEMBERS} weeks done.`);
}

// --- LifeEats

export function orderEats(state: GameState, mealId: string): PhoneResult {
  const meal = mealById(mealId);
  if (!meal) return fail("That isn't on the menu.");
  const p = state.phone;
  if (p.orders.length >= 6) return fail("Too many orders on the way.");
  const fee = meal.price >= 10_000 ? 0 : 500;
  const r = transfer(state.ledger, PLAYER, SINK, meal.price + fee, meal.name, state.minute);
  if (!r.ok) return fail(`That costs ₦${(meal.price + fee).toLocaleString()}${fee ? " with delivery" : ""}. You don't have enough.`);
  state.stats.totalSpent += meal.price + fee;
  p.orders.push({ id: p.nextId++, itemId: meal.id, arrivesAt: state.minute + meal.minutes });
  return done(`${meal.name} is on its way (about ${meal.minutes} min).`);
}

// --- LifeLearn

export function nextLessonIn(state: GameState): number {
  return Math.max(0, Math.ceil(state.phone.lastLessonAt + LESSON_GAP_MINUTES - state.minute));
}

export function takeLesson(state: GameState, courseId: string): PhoneResult {
  const course = COURSES.find((c) => c.id === courseId);
  if (!course) return fail("Unknown course.");
  const p = state.phone;
  const done_ = p.courses[courseId] ?? 0;
  if (done_ >= course.lessons.length) return fail("You finished this course.");
  const wait = nextLessonIn(state);
  if (wait > 0) return fail(`Rest your mind. The next lesson opens in ${wait} min.`);
  if (state.needs.energy < 20) return fail("You're too tired to focus.");
  p.courses[courseId] = done_ + 1;
  p.lastLessonAt = state.minute;
  const before = skillLevel(state.skills[course.skill] ?? 0);
  state.skills[course.skill] = (state.skills[course.skill] ?? 0) + LESSON_XP;
  state.needs.energy = Math.max(0, state.needs.energy - 4);
  const level = skillLevel(state.skills[course.skill] ?? 0);
  const finished = p.courses[courseId] === course.lessons.length;
  return done(`${course.lessons[done_]} complete (+${LESSON_XP} xp)${level > before ? ` · ${course.skill} level ${level}!` : ""}${finished ? " Course finished!" : ""}`);
}

// --- Diary

export function diaryDone(state: GameState): boolean {
  const d = state.phone.diary;
  return d.length > 0 && d[d.length - 1]!.day === dayOf(state);
}

export function diaryCheckIn(state: GameState, mood: number, text: string): PhoneResult {
  if (!DIARY_MOODS.some((m) => m.id === mood)) return fail("Pick how you feel.");
  if (diaryDone(state)) return fail("You've already written today.");
  const d = state.phone.diary;
  d.push({ day: dayOf(state), mood, text: text.trim().slice(0, 160) });
  if (d.length > 60) d.shift();
  addFun(state, 3);
  return done("Saved. Writing it down helps.");
}

// --- streaming and tickets

/** Streaming (video, music, radio) uses data on mobile data and nothing on Wi-Fi. */
export function streamData(state: GameState, mb: number): PhoneResult {
  const link = connection(state);
  if (link.kind === "none") return fail("You're offline. Turn on Wi-Fi or mobile data in Settings.");
  if (link.kind === "data") {
    if (state.phone.dataMB < mb) return fail("Not enough data left. Use Wi-Fi or buy a bundle in LifePay.");
    state.phone.dataMB -= mb;
  }
  return done();
}

/** A ticket for a film or an event: costs money, lifts the mood. */
export function buyTicket(state: GameState, label: string, price: number, fun: number): PhoneResult {
  if (price > 0) {
    const r = transfer(state.ledger, PLAYER, SINK, price, label, state.minute);
    if (!r.ok) return fail(`That costs ₦${price.toLocaleString()}. You don't have enough.`);
    state.stats.totalSpent += price;
  }
  addFun(state, fun);
  return done(price > 0 ? `Ticket booked: ${label}.` : `You're going: ${label}.`);
}

// --- Reminders, Hydrate, Focus

export function addTodo(state: GameState, text: string): PhoneResult {
  const t = text.trim().slice(0, 120);
  if (!t) return fail("Write something first.");
  if (state.phone.todos.length >= 40) return fail("Too many reminders.");
  state.phone.todos.unshift({ text: t, done: false });
  return done("Added.");
}

export function toggleTodo(state: GameState, index: number): PhoneResult {
  const t = state.phone.todos[index];
  if (!t) return fail("No such reminder.");
  t.done = !t.done;
  return done();
}

export function deleteTodo(state: GameState, index: number): PhoneResult {
  if (index < 0 || index >= state.phone.todos.length) return fail("No such reminder.");
  state.phone.todos.splice(index, 1);
  return done();
}

export function glassesToday(state: GameState): number {
  return state.phone.water.day === dayOf(state) ? state.phone.water.glasses : 0;
}

export function drinkWater(state: GameState): PhoneResult {
  const w = state.phone.water;
  const day = dayOf(state);
  if (w.day !== day) {
    w.day = day;
    w.glasses = 0;
  }
  if (w.glasses >= WATER_GOAL + 4) return fail("That's plenty of water for today.");
  w.glasses += 1;
  if (w.glasses === WATER_GOAL) {
    addFun(state, 4);
    state.needs.energy = Math.min(100, state.needs.energy + 3);
    return done("Eight glasses! You feel fresher.");
  }
  return done(`${w.glasses} of ${WATER_GOAL} glasses.`);
}

/** A finished five-minute focus session: a little knowledge. */
export function finishFocus(state: GameState): PhoneResult {
  state.skills.knowledge = (state.skills.knowledge ?? 0) + FOCUS_XP;
  return done(`Well done. +${FOCUS_XP} knowledge xp.`);
}

// --- FitLife and QuickGigs

export function nextWorkoutIn(state: GameState): number {
  return Math.max(0, Math.ceil(state.phone.lastWorkoutAt + WORKOUT_GAP_MINUTES - state.minute));
}

export function doWorkout(state: GameState, id: string): PhoneResult {
  const w = WORKOUTS.find((x) => x.id === id);
  if (!w) return fail("Unknown workout.");
  const wait = nextWorkoutIn(state);
  if (wait > 0) return fail(`Rest first. The next workout is ready in ${wait} min.`);
  if (state.needs.energy < w.energy + 10) return fail("You're too tired for that.");
  if (state.needs.hunger < 20) return fail("You're too hungry to exercise. Eat first.");
  const n = state.needs;
  n.energy -= w.energy;
  n.hunger = Math.max(0, n.hunger - w.hunger);
  n.hygiene = Math.max(0, n.hygiene - w.hygiene);
  addFun(state, w.fun);
  state.phone.lastWorkoutAt = state.minute;
  return done(`${w.name} done. You feel good.`);
}

export function nextGigIn(state: GameState): number {
  return Math.max(0, Math.ceil(state.phone.lastGigAt + GIG_GAP_MINUTES - state.minute));
}

export function doGig(state: GameState, id: string): PhoneResult {
  const g = GIGS.find((x) => x.id === id);
  if (!g) return fail("Unknown gig.");
  const wait = nextGigIn(state);
  if (wait > 0) return fail(`You need a break. The next gig opens in ${wait} min.`);
  if (state.needs.energy < g.energy + 15) return fail("You're too tired for this gig.");
  state.needs.energy -= g.energy;
  state.needs.fun = Math.max(0, state.needs.fun - 3);
  state.phone.lastGigAt = state.minute;
  transfer(state.ledger, MINT, PLAYER, g.pay, `Gig: ${g.title}`, state.minute);
  state.stats.totalEarned += g.pay;
  return done(`Done! ₦${g.pay.toLocaleString()} received.`);
}
