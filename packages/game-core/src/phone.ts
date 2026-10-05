import { ECONOMY, skillLevel } from "./actions";
import { MINT, PLAYER, SINK, balance, transfer } from "./ledger";
import {
  AIRTIME_PER_CALL_MINUTE, APP_INFO, BEATS, DELIVERY_FEE, FREE_DELIVERY_OVER, JOBS, JOB_DECISION_MINUTES, PHONE_MODELS, POWER_BANK,
  chargerById, contactsFor, groceryPromo, isPowerCut, shopItemById, startingCharger,
  type AppId, type Beat, type PhoneModel, type ShopItem,
} from "./phoneData";
import type { PhoneTier, Profile } from "./profile";
import type { GameState } from "./types";
import { DAY_MINUTES } from "./types";

// The phone: battery and charging, chats, bank, shop and delivery, jobs. Pure rules over GameState (no browser APIs).
// The screen you see is built in the client from this state.

export const SAVINGS = "savings"; // ledger account for the player's savings
export const BILL_PER_WEEK = 1_500; // water and power, charged with the rent (the family covers it for nepos)

export interface ChatMessage {
  from: "me" | "them";
  text: string;
  minute: number;
}

export interface Thread {
  messages: ChatMessage[];
  unread: number;
  /** The beat whose reply options are showing. */
  pending: string | null;
}

export interface PhoneNotification {
  id: number;
  app: AppId;
  title: string;
  text: string;
  minute: number;
  read: boolean;
}

export interface Order {
  id: number;
  itemId: string;
  arrivesAt: number;
}

export interface PhoneState {
  model: PhoneTier;
  /** 0-100. */
  battery: number;
  /** What the phone is plugged into: the wall, the power bank, or nothing. */
  plugged: "wall" | "bank" | null;
  /** Is the power bank itself charging from the wall? */
  bankCharging: boolean;
  /** Is the player looking at the phone right now (drains faster). Not saved. */
  inUse: boolean;
  chargers: string[];
  powerBank: { owned: boolean; charge: number };
  airtime: number;
  dataMB: number;
  threads: Record<string, Thread>;
  beatsDone: string[];
  /** Messages that arrive later (a reply, a friend paying you back). */
  scheduled: { minute: number; contact: string; text: string; pay?: number; reason?: string }[];
  notifications: PhoneNotification[];
  nextId: number;
  orders: Order[];
  autoPay: boolean;
  billOwed: number;
  /** When a late fee falls due on unpaid rent (manual pay only). */
  lateFeeAt: number | null;
  lastWeekDay: number;
  job: string | null;
  application: { jobId: string; decideAt: number } | null;
  loan: { owed: number; sinceDay: number } | null;
  lowWarned: number;
}

export type PhoneResult = { ok: true; text?: string } | { ok: false; reason: string };
const fail = (reason: string): PhoneResult => ({ ok: false, reason });
const done = (text?: string): PhoneResult => ({ ok: true, text });

export function createPhone(profile: Profile | null): PhoneState {
  const tier: PhoneTier = profile?.phone ?? "basic";
  const model = PHONE_MODELS[tier];
  const rich = tier === "flagship" ? 2 : tier === "mid" ? 1 : 0;
  return {
    model: tier,
    battery: model.startBattery,
    plugged: null,
    bankCharging: false,
    inUse: false,
    chargers: [startingCharger(tier)],
    powerBank: { owned: false, charge: 0 },
    airtime: [300, 1_000, 5_000][rich]!,
    dataMB: [400, 1_500, 5_000][rich]!,
    threads: {},
    beatsDone: [],
    scheduled: [],
    notifications: [],
    nextId: 1,
    orders: [],
    autoPay: true,
    billOwed: 0,
    lateFeeAt: null,
    lastWeekDay: 0,
    job: null,
    application: null,
    loan: null,
    lowWarned: 0,
  };
}

/** Reads a phone from untrusted JSON; anything off falls back to a fresh phone. */
export function parsePhone(raw: unknown, profile: Profile | null): PhoneState {
  const fresh = createPhone(profile);
  if (!raw || typeof raw !== "object") return fresh;
  const r = raw as Partial<PhoneState>;
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const str = (v: unknown, max = 400) => (typeof v === "string" ? v.slice(0, max) : "");
  const tier: PhoneTier = r.model === "mid" || r.model === "flagship" || r.model === "basic" ? r.model : fresh.model;
  const threads: Record<string, Thread> = {};
  if (r.threads && typeof r.threads === "object") {
    for (const [id, t] of Object.entries(r.threads).slice(0, 12)) {
      const th = t as Partial<Thread>;
      threads[id.slice(0, 20)] = {
        messages: Array.isArray(th.messages)
          ? th.messages.slice(-60).map((m) => ({ from: m?.from === "me" ? "me" : "them", text: str(m?.text), minute: num(m?.minute, 0, 1e9, 0) }))
          : [],
        unread: Math.floor(num(th.unread, 0, 999, 0)),
        pending: typeof th.pending === "string" && BEATS.some((b) => b.id === th.pending) ? th.pending : null,
      };
    }
  }
  const strings = (v: unknown, max = 100) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max).map((x) => x.slice(0, 60)) : []);
  const loan = r.loan && typeof r.loan === "object" ? { owed: Math.floor(num(r.loan.owed, 0, 1e9, 0)), sinceDay: Math.floor(num(r.loan.sinceDay, 0, 1e6, 0)) } : null;
  return {
    model: tier,
    battery: num(r.battery, 0, 100, fresh.battery),
    plugged: r.plugged === "wall" || r.plugged === "bank" ? r.plugged : null,
    bankCharging: r.bankCharging === true,
    inUse: false,
    chargers: strings(r.chargers, 10).filter((id) => chargerById(id)).length ? strings(r.chargers, 10).filter((id) => chargerById(id)) : fresh.chargers,
    powerBank: { owned: r.powerBank?.owned === true, charge: num(r.powerBank?.charge, 0, POWER_BANK.capacity, 0) },
    airtime: Math.floor(num(r.airtime, 0, 1e9, fresh.airtime)),
    dataMB: Math.floor(num(r.dataMB, 0, 1e9, fresh.dataMB)),
    threads,
    beatsDone: strings(r.beatsDone, 100),
    scheduled: Array.isArray(r.scheduled)
      ? r.scheduled.slice(0, 20).map((s) => ({ minute: num(s?.minute, 0, 1e9, 0), contact: str(s?.contact, 20), text: str(s?.text), pay: s?.pay ? Math.floor(num(s.pay, 0, 1e6, 0)) : undefined, reason: s?.reason ? str(s.reason, 60) : undefined }))
      : [],
    notifications: Array.isArray(r.notifications)
      ? r.notifications.slice(-30).map((n, i) => ({ id: Math.floor(num(n?.id, 0, 1e9, i)), app: (n?.app && n.app in APP_INFO ? n.app : "chat") as AppId, title: str(n?.title, 60), text: str(n?.text), minute: num(n?.minute, 0, 1e9, 0), read: n?.read === true }))
      : [],
    nextId: Math.floor(num(r.nextId, 1, 1e9, 1)),
    orders: Array.isArray(r.orders) ? r.orders.slice(0, 10).filter((o) => o && shopItemById(String(o.itemId))).map((o) => ({ id: Math.floor(num(o.id, 0, 1e9, 0)), itemId: String(o.itemId), arrivesAt: num(o.arrivesAt, 0, 1e9, 0) })) : [],
    autoPay: r.autoPay !== false,
    billOwed: Math.floor(num(r.billOwed, 0, 1e8, 0)),
    lateFeeAt: typeof r.lateFeeAt === "number" ? r.lateFeeAt : null,
    lastWeekDay: Math.floor(num(r.lastWeekDay, 0, 1e6, 0)),
    job: typeof r.job === "string" && JOBS.some((j) => j.id === r.job) ? r.job : null,
    application: r.application && JOBS.some((j) => j.id === r.application?.jobId) ? { jobId: r.application.jobId, decideAt: num(r.application.decideAt, 0, 1e9, 0) } : null,
    loan,
    lowWarned: 0,
  };
}

// ---------------------------------------------------------------- selectors

export function modelOf(phone: PhoneState): PhoneModel {
  return PHONE_MODELS[phone.model];
}

export function hasApp(phone: PhoneState, app: AppId): boolean {
  return modelOf(phone).apps.includes(app);
}

export function isDead(phone: PhoneState): boolean {
  return phone.battery <= 0;
}

/** The best charger you own that fits the phone, with the speed it can really give. */
export function bestCharger(phone: PhoneState): { id: string; name: string; rate: number } | null {
  const model = modelOf(phone);
  let best: { id: string; name: string; rate: number } | null = null;
  for (const id of phone.chargers) {
    const c = chargerById(id);
    if (!c || !c.ports.some((p) => model.ports.includes(p))) continue;
    const rate = Math.min(c.rate, model.maxCharge);
    if (!best || rate > best.rate) best = { id: c.id, name: c.name, rate };
  }
  return best;
}

/** Is there power at the wall? A power cut, or an unpaid bill, takes it away. */
export function wallPower(state: GameState): boolean {
  return !isPowerCut(state.minute) && state.phone.billOwed < BILL_PER_WEEK * 2;
}

export function billPerWeek(profile: Profile | null): number {
  return profile?.tier === "nepo" ? 0 : BILL_PER_WEEK;
}

export function unreadCount(phone: PhoneState): number {
  return phone.notifications.filter((n) => !n.read).length;
}

export function unreadChats(phone: PhoneState): number {
  return Object.values(phone.threads).reduce((sum, t) => sum + t.unread, 0);
}

export function groceriesFor(state: GameState, base: number, traitScale: number): number {
  const day = Math.floor(state.minute / DAY_MINUTES) + 1;
  return Math.round((base * traitScale * (groceryPromo(day) ? 0.85 : 1)) / 100) * 100;
}

export function loanLimit(profile: Profile | null): number {
  return profile?.tier === "nepo" ? 500_000 : profile?.tier === "middle" ? 100_000 : 20_000;
}

// ---------------------------------------------------------------- notifications and chat

export function notify(state: GameState, app: AppId, title: string, text: string): void {
  const p = state.phone;
  p.notifications.push({ id: p.nextId++, app, title, text, minute: state.minute, read: false });
  if (p.notifications.length > 30) p.notifications.splice(0, p.notifications.length - 30);
}

function thread(state: GameState, contact: string): Thread {
  return (state.phone.threads[contact] ??= { messages: [], unread: 0, pending: null });
}

function deliver(state: GameState, contact: string, text: string, pending: string | null = null): void {
  const t = thread(state, contact);
  t.messages.push({ from: "them", text, minute: state.minute });
  if (t.messages.length > 60) t.messages.splice(0, t.messages.length - 60);
  t.unread += 1;
  if (pending !== null) t.pending = pending;
  const who = contactsFor(state.profile).find((c) => c.id === contact)?.name ?? contact;
  notify(state, contact === "lifepay" ? "pay" : contact === "lifejobs" ? "jobs" : "chat", who, text);
}

function fill(text: string, state: GameState): string {
  return text.replace("{name}", state.profile?.firstName ?? "you").replace("{rent}", `₦${(state.profile?.rentPerWeek ?? ECONOMY.rentPerWeek).toLocaleString()}`);
}

export function beatById(id: string): Beat | undefined {
  return BEATS.find((b) => b.id === id);
}

/** Sends one of the quick replies offered in a chat. */
export function replyToThread(state: GameState, contact: string, optionIndex: number): PhoneResult {
  const t = state.phone.threads[contact];
  const beat = t?.pending ? beatById(t.pending) : undefined;
  const option = beat?.options?.[optionIndex];
  if (!t || !beat || !option) return fail("Nothing to reply to.");
  if (option.send && balance(state.ledger) < option.send) return fail(`You need ₦${option.send.toLocaleString()} for that.`);
  if (option.send) {
    transfer(state.ledger, PLAYER, SINK, option.send, `Sent to ${contactName(state, contact)}`, state.minute);
    state.stats.totalSpent += option.send;
  }
  t.messages.push({ from: "me", text: option.label, minute: state.minute });
  t.pending = null;
  state.phone.scheduled.push({ minute: state.minute + 2, contact, text: option.reply });
  if (option.repay) {
    state.phone.scheduled.push({ minute: state.minute + option.repay.days * DAY_MINUTES, contact, text: `Sending your ₦${option.repay.amount.toLocaleString()} back now. Thank you again!`, pay: option.repay.amount, reason: `${contactName(state, contact)} paid you back` });
  }
  if (option.fun) state.needs.fun = Math.min(100, state.needs.fun + option.fun);
  return done();
}

function contactName(state: GameState, id: string): string {
  return contactsFor(state.profile).find((c) => c.id === id)?.name ?? id;
}

export function markThreadRead(state: GameState, contact: string): void {
  const t = state.phone.threads[contact];
  if (t) t.unread = 0;
  for (const n of state.phone.notifications) if (n.app === "chat" && n.title === contactName(state, contact)) n.read = true;
}

export function markNotificationsRead(state: GameState): void {
  for (const n of state.phone.notifications) n.read = true;
}

// ---------------------------------------------------------------- using the phone

/** Opening an app uses a little data. LifePay works without data. */
export function openApp(state: GameState, app: AppId): PhoneResult {
  const p = state.phone;
  if (isDead(p)) return fail("The battery is empty. Plug it in.");
  if (!hasApp(p, app)) return fail(`${APP_INFO[app].name} isn't supported on the ${modelOf(p).name}.`);
  const cost = APP_INFO[app].dataMB;
  if (cost > 0 && p.dataMB < cost) return fail("You're out of data. Buy a bundle in LifePay.");
  p.dataMB -= cost;
  return done();
}

export function call(state: GameState, contact: string, minutes: number): PhoneResult {
  const p = state.phone;
  const who = contactsFor(state.profile).find((c) => c.id === contact);
  if (!who?.callable) return fail("That number can't be called.");
  if (isDead(p)) return fail("The battery is empty.");
  const cost = Math.ceil(minutes) * AIRTIME_PER_CALL_MINUTE;
  if (p.airtime < cost) return fail(`You need ₦${cost} airtime for that call.`);
  p.airtime -= cost;
  state.needs.fun = Math.min(100, state.needs.fun + Math.min(8, minutes * 2));
  return done(`Called ${who.name} (−₦${cost} airtime).`);
}

export function plug(state: GameState, source: "wall" | "bank" | null): PhoneResult {
  const p = state.phone;
  if (source === null) {
    p.plugged = null;
    return done("Unplugged.");
  }
  if (source === "wall") {
    if (!bestCharger(p)) return fail(`You have no charger that fits the ${modelOf(p).name}. Order one in LifeShop.`);
    p.plugged = "wall";
    return done(wallPower(state) ? "Charging from the wall." : "Plugged in, but there's no power right now.");
  }
  if (!p.powerBank.owned) return fail("You don't have a power bank.");
  if (!modelOf(p).ports.some((port) => port === "micro" || port === "usbc")) return fail("The power bank doesn't fit this phone.");
  if (p.powerBank.charge <= 0) return fail("The power bank is empty.");
  p.plugged = "bank";
  return done("Charging from the power bank.");
}

export function setBankCharging(state: GameState, on: boolean): PhoneResult {
  if (!state.phone.powerBank.owned) return fail("You don't have a power bank.");
  state.phone.bankCharging = on;
  return done();
}

// ---------------------------------------------------------------- LifePay

export function payRent(state: GameState, amount?: number): PhoneResult {
  if (state.rentOwed <= 0) return fail("You don't owe any rent.");
  const pay = Math.min(amount ?? state.rentOwed, state.rentOwed, balance(state.ledger));
  if (pay <= 0) return fail("Not enough money.");
  transfer(state.ledger, PLAYER, SINK, pay, "Rent", state.minute);
  state.rentOwed -= pay;
  state.stats.totalSpent += pay;
  if (state.rentOwed === 0) state.phone.lateFeeAt = null;
  return done(`Paid ₦${pay.toLocaleString()} rent.`);
}

export function payBill(state: GameState): PhoneResult {
  const p = state.phone;
  if (p.billOwed <= 0) return fail("No bill to pay.");
  const pay = Math.min(p.billOwed, balance(state.ledger));
  if (pay <= 0) return fail("Not enough money.");
  transfer(state.ledger, PLAYER, SINK, pay, "Water and power bill", state.minute);
  p.billOwed -= pay;
  state.stats.totalSpent += pay;
  return done(`Paid ₦${pay.toLocaleString()} bill.${p.billOwed === 0 ? " The power stays on." : ""}`);
}

export function sendMoney(state: GameState, contact: string, amount: number): PhoneResult {
  const who = contactsFor(state.profile).find((c) => c.id === contact);
  if (!who?.receivesMoney) return fail("You can't send money to that contact.");
  const r = transfer(state.ledger, PLAYER, SINK, Math.floor(amount), `Sent to ${who.name}`, state.minute);
  if (!r.ok) return fail(r.reason);
  state.stats.totalSpent += Math.floor(amount);
  return done(`Sent ₦${Math.floor(amount).toLocaleString()} to ${who.name}.`);
}

export function deposit(state: GameState, amount: number): PhoneResult {
  if (!modelOf(state.phone).banking) return fail("Savings aren't available on this phone.");
  const r = transfer(state.ledger, PLAYER, SAVINGS, Math.floor(amount), "Moved to savings", state.minute);
  return r.ok ? done(`Saved ₦${Math.floor(amount).toLocaleString()}.`) : fail(r.reason);
}

export function withdraw(state: GameState, amount: number): PhoneResult {
  if (!modelOf(state.phone).banking) return fail("Savings aren't available on this phone.");
  const r = transfer(state.ledger, SAVINGS, PLAYER, Math.floor(amount), "Withdrawn from savings", state.minute);
  return r.ok ? done(`Withdrew ₦${Math.floor(amount).toLocaleString()}.`) : fail("There isn't that much in savings.");
}

export function borrow(state: GameState, amount: number): PhoneResult {
  const p = state.phone;
  if (!modelOf(p).banking) return fail("Loans aren't available on this phone.");
  if (p.loan) return fail("Pay off your current loan first.");
  const sum = Math.floor(amount);
  if (sum <= 0 || sum > loanLimit(state.profile)) return fail(`You can borrow up to ₦${loanLimit(state.profile).toLocaleString()}.`);
  transfer(state.ledger, MINT, PLAYER, sum, "Loan from LifePay", state.minute);
  p.loan = { owed: Math.round(sum * 1.1), sinceDay: Math.floor(state.minute / DAY_MINUTES) + 1 };
  return done(`Loan of ₦${sum.toLocaleString()} paid out. You owe ₦${p.loan.owed.toLocaleString()} (10% fee).`);
}

export function repay(state: GameState, amount: number): PhoneResult {
  const p = state.phone;
  if (!p.loan) return fail("You have no loan.");
  const pay = Math.min(Math.floor(amount), p.loan.owed, balance(state.ledger));
  if (pay <= 0) return fail("Not enough money.");
  transfer(state.ledger, PLAYER, SINK, pay, "Loan repayment", state.minute);
  p.loan.owed -= pay;
  if (p.loan.owed <= 0) p.loan = null;
  return done(`Repaid ₦${pay.toLocaleString()}.${p.loan ? "" : " Loan cleared."}`);
}

export function setAutoPay(state: GameState, on: boolean): void {
  state.phone.autoPay = on;
}

export function topUp(state: GameState, itemId: string): PhoneResult {
  const item = shopItemById(itemId);
  if (!item || (item.kind !== "airtime" && item.kind !== "data")) return fail("Unknown bundle.");
  const r = transfer(state.ledger, PLAYER, SINK, item.price, item.name, state.minute);
  if (!r.ok) return fail("Not enough money.");
  state.stats.totalSpent += item.price;
  if (item.kind === "airtime") state.phone.airtime += item.amount ?? 0;
  else state.phone.dataMB += item.amount ?? 0;
  return done(`${item.name} added.`);
}

// ---------------------------------------------------------------- LifeShop

export function itemPrice(state: GameState, item: ShopItem, traitScale = 1): number {
  return item.kind === "grocery" ? groceriesFor(state, item.price, traitScale) : item.price;
}

export function deliveryFee(price: number): number {
  return price >= FREE_DELIVERY_OVER ? 0 : DELIVERY_FEE;
}

export function placeOrder(state: GameState, itemId: string, traitScale = 1): PhoneResult {
  const item = shopItemById(itemId);
  const p = state.phone;
  if (!item || item.deliveryMinutes === 0) return fail("That can't be ordered.");
  if (p.orders.length >= 6) return fail("Too many orders on the way.");
  if (item.kind === "phone" && item.tier === p.model) return fail("You already have that phone.");
  if (item.kind === "powerbank" && p.powerBank.owned) return fail("You already have a power bank.");
  if (item.kind === "charger" && p.chargers.includes(item.id)) return fail("You already have that charger.");
  const price = itemPrice(state, item, traitScale);
  const fee = deliveryFee(price);
  const r = transfer(state.ledger, PLAYER, SINK, price + fee, item.name, state.minute);
  if (!r.ok) return fail(`That costs ₦${(price + fee).toLocaleString()}${fee ? ` including ₦${fee} delivery` : ""}. You don't have enough.`);
  state.stats.totalSpent += price + fee;
  p.orders.push({ id: p.nextId++, itemId, arrivesAt: state.minute + item.deliveryMinutes });
  return done(`Ordered ${item.name}. It arrives in about ${item.deliveryMinutes >= 60 ? `${Math.round(item.deliveryMinutes / 60)} h` : `${item.deliveryMinutes} min`}.`);
}

function receive(state: GameState, order: Order): void {
  const item = shopItemById(order.itemId);
  if (!item) return;
  const p = state.phone;
  if (item.kind === "grocery") state.inventory.portions += item.amount ?? 0;
  else if (item.kind === "charger") p.chargers.push(item.id);
  else if (item.kind === "powerbank") p.powerBank.owned = true;
  else if (item.kind === "phone" && item.tier) {
    p.model = item.tier;
    p.battery = 100;
    p.plugged = null;
  }
  notify(state, "shop", "Delivery", `${item.name} has arrived.`);
}

// ---------------------------------------------------------------- LifeJobs

export function applyForJob(state: GameState, jobId: string): PhoneResult {
  const p = state.phone;
  const job = JOBS.find((j) => j.id === jobId);
  if (!job) return fail("Unknown job.");
  if (p.job) return fail("Quit your current job first.");
  if (p.application) return fail("You already have an application waiting.");
  p.application = { jobId, decideAt: state.minute + JOB_DECISION_MINUTES };
  return done(`Applied to ${job.employer}. They usually reply within half a day.`);
}

export function quitJob(state: GameState): PhoneResult {
  if (!state.phone.job) return fail("You don't have a job.");
  state.phone.job = null;
  return done("You quit.");
}

export function jobPayBoost(phone: PhoneState): number {
  return JOBS.find((j) => j.id === phone.job)?.payBoost ?? 1;
}

// ---------------------------------------------------------------- time

/** Advances the phone by game minutes: battery, charging, mail that arrives, deliveries, weekly money. */
export function tickPhone(state: GameState, minutes: number): void {
  const p = state.phone;
  const model = modelOf(p);
  const hours = minutes / 60;

  // Battery: drain from use or standby; charge from the wall or the power bank.
  const drain = (100 / (p.inUse ? model.screenHours : model.standbyHours)) * hours;
  let charge = 0;
  const power = wallPower(state);
  if (p.plugged === "wall" && power) charge = (bestCharger(p)?.rate ?? 0) * hours;
  if (p.plugged === "bank") {
    const want = Math.min(model.maxCharge, POWER_BANK.outRate) * hours;
    charge = Math.min(want, p.powerBank.charge);
    p.powerBank.charge -= charge;
    if (p.powerBank.charge <= 0) {
      p.plugged = null;
      notify(state, "chat", "Power bank", "The power bank is empty.");
    }
  }
  if (p.bankCharging && power) p.powerBank.charge = Math.min(POWER_BANK.capacity, p.powerBank.charge + POWER_BANK.inRate * hours);
  if (p.bankCharging && p.powerBank.charge >= POWER_BANK.capacity) p.bankCharging = false;
  const before = p.battery;
  p.battery = Math.max(0, Math.min(100, p.battery + charge - drain));
  if (p.plugged && p.battery >= 100 && before < 100) {
    notify(state, "chat", "Battery", "Fully charged. You can unplug.");
    p.plugged = null;
  }
  if (p.battery > 25) p.lowWarned = 0;
  else if (p.battery <= 20 && p.lowWarned < 1 && !p.plugged) {
    p.lowWarned = 1;
    notify(state, "chat", "Battery low", "20% left. Find a charger.");
  } else if (p.battery <= 5 && p.lowWarned < 2 && !p.plugged) {
    p.lowWarned = 2;
    notify(state, "chat", "Battery critical", "5% left. The phone is about to die.");
  }

  const day = Math.floor(state.minute / DAY_MINUTES) + 1;
  const hour = (state.minute % DAY_MINUTES) / 60;

  // Written messages that arrive on set days.
  const tier = state.profile?.tier;
  for (const beat of BEATS) {
    if (p.beatsDone.includes(beat.id)) continue;
    if (beat.tiers && (!tier || !beat.tiers.includes(tier))) continue;
    if (!contactsFor(state.profile).some((c) => c.id === beat.contact)) continue;
    if (day > beat.day || (day === beat.day && hour >= beat.hour)) {
      p.beatsDone.push(beat.id);
      deliver(state, beat.contact, fill(beat.text, state), beat.options ? beat.id : null);
    }
  }

  // Scheduled replies and paybacks.
  if (p.scheduled.length) {
    const due = p.scheduled.filter((s) => state.minute >= s.minute);
    if (due.length) {
      p.scheduled = p.scheduled.filter((s) => state.minute < s.minute);
      for (const s of due) {
        if (s.pay) {
          transfer(state.ledger, MINT, PLAYER, s.pay, s.reason ?? "Payment received", state.minute);
          state.stats.totalEarned += s.pay;
        }
        deliver(state, s.contact, s.text);
      }
    }
  }

  // Deliveries.
  if (p.orders.length) {
    const arrived = p.orders.filter((o) => state.minute >= o.arrivesAt);
    if (arrived.length) {
      p.orders = p.orders.filter((o) => state.minute < o.arrivesAt);
      for (const o of arrived) receive(state, o);
    }
  }

  // Job applications.
  if (p.application && state.minute >= p.application.decideAt) {
    const job = JOBS.find((j) => j.id === p.application!.jobId);
    p.application = null;
    if (job) {
      const level = skillLevel(state.skills[job.requires.skill] ?? 0);
      if (level >= job.requires.level) {
        p.job = job.id;
        deliver(state, "lifejobs", `Congratulations! ${job.employer} offered you the ${job.title} job. ₦${job.retainer.toLocaleString()} every week, plus better pay when you work.`);
      } else {
        deliver(state, "lifejobs", `${job.employer} chose someone else. They wanted ${job.requires.skill} level ${job.requires.level}. Yours is ${level}. Practise and try again.`);
      }
    }
  }

  // Unpaid rent without auto-pay: a late fee a day after it fell due.
  if (p.lateFeeAt !== null) {
    if (state.rentOwed <= 0) p.lateFeeAt = null;
    else if (state.minute >= p.lateFeeAt) {
      p.lateFeeAt = null;
      state.rentOwed += ECONOMY.lateFee;
      notify(state, "pay", "Late fee", `Rent is overdue. A ₦${ECONOMY.lateFee.toLocaleString()} fee was added.`);
    }
  }

  // Weekly: bill, salary, savings interest, loan reminder (same day as rent).
  if (day % ECONOMY.rentDay === 0 && hour >= ECONOMY.rentHour && day > p.lastWeekDay) {
    p.lastWeekDay = day;
    weekly(state, day);
  }
}

function weekly(state: GameState, day: number): void {
  const p = state.phone;
  const bill = billPerWeek(state.profile);
  if (bill > 0) {
    p.billOwed += bill;
    if (p.autoPay && balance(state.ledger) > 0) payBill(state);
    if (p.billOwed > 0) notify(state, "pay", "Bill due", `Water and power: ₦${p.billOwed.toLocaleString()} unpaid. The power is cut if two weeks go unpaid.`);
  }
  const job = JOBS.find((j) => j.id === p.job);
  if (job) {
    transfer(state.ledger, MINT, PLAYER, job.retainer, `${job.employer}: weekly pay`, state.minute);
    state.stats.totalEarned += job.retainer;
    notify(state, "pay", job.employer, `₦${job.retainer.toLocaleString()} weekly pay received.`);
  }
  const saved = balance(state.ledger, SAVINGS);
  const interest = Math.floor(saved * 0.01);
  if (interest > 0) {
    transfer(state.ledger, MINT, SAVINGS, interest, "Savings interest", state.minute);
    notify(state, "pay", "Savings", `₦${interest.toLocaleString()} interest added.`);
  }
  if (p.loan) {
    if (day - p.loan.sinceDay >= 14) p.loan.owed += Math.round(p.loan.owed * 0.05);
    notify(state, "pay", "Loan", `You owe ₦${p.loan.owed.toLocaleString()}.${day - p.loan.sinceDay >= 14 ? " A 5% late charge was added." : ""}`);
  }
}

/** Called when rent falls due without auto-pay, so the late fee clock starts. */
export function startLateFeeClock(state: GameState): void {
  if (state.phone.lateFeeAt === null) state.phone.lateFeeAt = state.minute + DAY_MINUTES;
}
