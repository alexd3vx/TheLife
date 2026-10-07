import { ACTIONS } from "./actions";
import {
  applyForJob, borrow, call, clearNotifications, deposit, dismissNotification, markNotificationsRead, markThreadRead, openApp, payBill, payRent, placeOrder, plug, quitJob, repay,
  replyToThread, sendMoney, setAutoPay, setBankCharging, topUp, withdraw, type AnyAppId, type PhoneResult,
} from "./phone";
import {
  addNote, addTodo, bookTicket, buyHomePlan, buyShares, cancelDownload, deleteNote, deleteTodo, diaryCheckIn, doGig, doWorkout, drinkWater, finishFocus, joinAjo, orderEats, payAjo, recordScore,
  sellShares, setMobileData, setWifi, startDownload, streamData, takeLesson, toggleTodo, uninstallApp, useApp,
} from "./phoneStore";
import { homeBuy, homeLock, homeMove, homeSell } from "./home";
import { payRide } from "./travel";
import { hospitalFirstAid, hospitalService } from "./hospital";
import { shopSnack } from "./shop";
import { policeService } from "./police";
import { worshipService } from "./worship";
import { schoolService } from "./school";
import { bankBorrow, bankDeposit, bankRepay, bankWithdraw } from "./bank";
import { buyIngredient, cancelRecipe, chooseDish, chooseRecipe, discardDish, discardLot } from "./kitchen";
import { BACKGROUNDS, profileFrom, type Profile } from "./profile";
import type { Sim } from "./sim";
import { sanitizeTraits } from "./traits";
import type { StoreAppId } from "./phoneStoreData";

// The rules for an online life. The server runs a player's life and only ever does what is on this list, with every argument
// checked here. The client runs the very same functions first so the game feels instant, then the server's answer wins.

export type RpcArg = string | number | boolean | null;
export type RpcResult = { ok: true; text?: string } | { ok: false; reason: string };

const no = (reason: string): RpcResult => ({ ok: false, reason });
const yes: RpcResult = { ok: true };

const str = (v: RpcArg | undefined, max = 60): string | null => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const int = (v: RpcArg | undefined, lo: number, hi: number): number | null => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const bool = (v: RpcArg | undefined): boolean | null => (typeof v === "boolean" ? v : null);

type Handler = (sim: Sim, a: RpcArg[]) => RpcResult | void;

const MONEY = 100_000_000;
const bad = "That didn't look right.";

/** Every action a player's life may be asked to run. Names match the game-core functions they call. */
const HANDLERS: Record<string, Handler> = {
  start: (sim, [id]) => {
    const a = str(id, 40);
    return a && ACTIONS[a] ? sim.start(a) : no("Unknown activity.");
  },
  cancel: (sim) => sim.cancel(),
  buyGroceries: (sim) => sim.buyGroceries(),
  buyIngredient: (sim, [id, q]) => (str(id, 30) && int(q, 1, 12) ? buyIngredient(sim.state, id as string, q as number, sim.traits.groceries) : no(bad)),
  homeMove: (sim, [id, x, z, rot]) => (str(id, 40) && typeof x === "number" && typeof z === "number" && typeof rot === "number" ? homeMove(sim.state, id as string, x, z, rot) : no(bad)),
  homeLock: (sim, [locked]) => (typeof locked === "boolean" ? homeLock(sim.state, locked) : no(bad)),
  homeSell: (sim, [id, furniture]) => (str(id, 40) ? homeSell(sim.state, id as string, typeof furniture === "string" ? furniture : undefined) : no(bad)),
  homeBuy: (sim, [furniture, x, z, rot]) => (str(furniture, 40) && typeof x === "number" && typeof z === "number" && typeof rot === "number" ? homeBuy(sim.state, furniture as string, x, z, rot) : no(bad)),
  payRide: (sim, [id, meters]) => (str(id, 12) && typeof meters === "number" ? payRide(sim.state, id as string, meters) : no(bad)),
  bankDeposit: (sim, [amount, atm]) => (typeof amount === "number" ? bankDeposit(sim.state, amount, atm === true) : no(bad)),
  bankBorrow: (sim, [amount]) => (typeof amount === "number" ? bankBorrow(sim.state, amount) : no(bad)),
  bankRepay: (sim, [amount]) => (typeof amount === "number" ? bankRepay(sim.state, amount) : no(bad)),
  bankWithdraw: (sim, [amount, atm]) => (typeof amount === "number" ? bankWithdraw(sim.state, amount, atm === true) : no(bad)),
  hospital: (sim, [id]) => (str(id, 20) ? hospitalService(sim.state, id as string) : no(bad)),
  hospitalFirstAid: (sim) => hospitalFirstAid(sim.state),
  worship: (sim, [faith, id]) => (str(faith, 10) && str(id, 20) ? worshipService(sim.state, faith as "church" | "mosque", id as string) : no(bad)),
  school: (sim, [id]) => (str(id, 20) ? schoolService(sim.state, id as string) : no(bad)),
  police: (sim, [id]) => (str(id, 20) ? policeService(sim.state, id as string) : no(bad)),
  shopSnack: (sim, [kind, id]) => (str(kind, 10) && str(id, 20) ? shopSnack(sim.state, kind as "market" | "fuel", id as string, sim.traits.groceries) : no(bad)),
  chooseRecipe: (sim, [id]) => (str(id, 30) ? chooseRecipe(sim.state, id as string) : no(bad)),
  cancelRecipe: (sim) => cancelRecipe(sim.state),
  chooseDish: (sim, [id]) => (str(id, 30) ? chooseDish(sim.state, id as string) : no(bad)),
  discardDish: (sim, [id]) => (str(id, 30) ? discardDish(sim.state, id as string) : no(bad)),
  discardLot: (sim, [id]) => (str(id, 30) ? discardLot(sim.state, id as string) : no(bad)),
  setInUse: (sim, [on]) => {
    const v = bool(on);
    if (v !== null) sim.state.phone.inUse = v;
  },
  openApp: (sim, [app]) => (str(app) ? openApp(sim.state, app as AnyAppId) : no(bad)),
  call: (sim, [who, mins]) => (str(who) && int(mins, 1, 120) ? call(sim.state, who as string, mins as number) : no(bad)),
  plug: (sim, [src]) => (src === null || src === "wall" || src === "bank" ? plug(sim.state, src) : no(bad)),
  setBankCharging: (sim, [on]) => (bool(on) !== null ? setBankCharging(sim.state, on as boolean) : no(bad)),
  payRent: (sim, [amount]) => payRent(sim.state, amount === undefined || amount === null ? undefined : (int(amount, 1, MONEY) ?? 0)),
  payBill: (sim) => payBill(sim.state),
  sendMoney: (sim, [who, n]) => (str(who) && int(n, 1, MONEY) ? sendMoney(sim.state, who as string, n as number) : no(bad)),
  deposit: (sim, [n]) => (int(n, 1, MONEY) ? deposit(sim.state, n as number) : no(bad)),
  withdraw: (sim, [n]) => (int(n, 1, MONEY) ? withdraw(sim.state, n as number) : no(bad)),
  borrow: (sim, [n]) => (int(n, 1, MONEY) ? borrow(sim.state, n as number) : no(bad)),
  repay: (sim, [n]) => (int(n, 1, MONEY) ? repay(sim.state, n as number) : no(bad)),
  setAutoPay: (sim, [on]) => {
    if (bool(on) !== null) setAutoPay(sim.state, on as boolean);
  },
  topUp: (sim, [id]) => (str(id) ? topUp(sim.state, id as string) : no(bad)),
  // The price scale comes from the player's own traits on the server, never from the message.
  placeOrder: (sim, [id]) => (str(id) ? placeOrder(sim.state, id as string, sim.traits.groceries) : no(bad)),
  applyForJob: (sim, [id]) => (str(id) ? applyForJob(sim.state, id as string) : no(bad)),
  quitJob: (sim) => quitJob(sim.state),
  replyToThread: (sim, [who, i]) => (str(who) && int(i, 0, 10) !== null ? replyToThread(sim.state, who as string, i as number) : no(bad)),
  markThreadRead: (sim, [who]) => {
    if (str(who)) markThreadRead(sim.state, who as string);
  },
  dismissNotification: (sim, [id]) => {
    if (int(id, 0, 1e9) !== null) dismissNotification(sim.state, id as number);
  },
  clearNotifications: (sim) => clearNotifications(sim.state),
  markNotificationsRead: (sim) => markNotificationsRead(sim.state),
  setWifi: (sim, [on]) => (bool(on) !== null ? setWifi(sim.state, on as boolean) : no(bad)),
  setMobileData: (sim, [on]) => (bool(on) !== null ? setMobileData(sim.state, on as boolean) : no(bad)),
  buyHomePlan: (sim, [id]) => (str(id) ? buyHomePlan(sim.state, id as string) : no(bad)),
  startDownload: (sim, [id]) => (str(id) ? startDownload(sim.state, id as StoreAppId) : no(bad)),
  cancelDownload: (sim, [id]) => (str(id) ? cancelDownload(sim.state, id as StoreAppId) : no(bad)),
  uninstallApp: (sim, [id]) => (str(id) ? uninstallApp(sim.state, id as StoreAppId) : no(bad)),
  addNote: (sim, [t]) => (str(t, 400) ? addNote(sim.state, t as string) : no("Write something first.")),
  deleteNote: (sim, [i]) => (int(i, 0, 100) !== null ? deleteNote(sim.state, i as number) : no(bad)),
  recordScore: (sim, [game, score]) => (str(game) && int(score, 0, 1_000_000) !== null ? recordScore(sim.state, game as StoreAppId, score as number) : no(bad)),
  buyShares: (sim, [sym, q]) => (str(sym, 10) && int(q, 1, 100_000) ? buyShares(sim.state, sym as string, q as number) : no(bad)),
  sellShares: (sim, [sym, q]) => (str(sym, 10) && int(q, 1, 100_000) ? sellShares(sim.state, sym as string, q as number) : no(bad)),
  joinAjo: (sim) => joinAjo(sim.state),
  payAjo: (sim) => payAjo(sim.state),
  orderEats: (sim, [id]) => (str(id) ? orderEats(sim.state, id as string) : no(bad)),
  takeLesson: (sim, [id]) => (str(id) ? takeLesson(sim.state, id as string) : no(bad)),
  diaryCheckIn: (sim, [mood, text]) => (int(mood, 1, 5) !== null ? diaryCheckIn(sim.state, mood as number, typeof text === "string" ? text.slice(0, 400) : "") : no(bad)),
  addTodo: (sim, [t]) => (str(t, 200) ? addTodo(sim.state, t as string) : no("Write something first.")),
  toggleTodo: (sim, [i]) => (int(i, 0, 100) !== null ? toggleTodo(sim.state, i as number) : no(bad)),
  deleteTodo: (sim, [i]) => (int(i, 0, 100) !== null ? deleteTodo(sim.state, i as number) : no(bad)),
  drinkWater: (sim) => drinkWater(sim.state),
  finishFocus: (sim) => finishFocus(sim.state),
  doWorkout: (sim, [id]) => (str(id) ? doWorkout(sim.state, id as string) : no(bad)),
  doGig: (sim, [id]) => (str(id) ? doGig(sim.state, id as string) : no(bad)),
  useApp: (sim, [id]) => {
    if (str(id)) useApp(sim.state, id as StoreAppId, 1);
  },
  streamData: (sim, [mb]) => (int(mb, 1, 200) ? streamData(sim.state, mb as number) : no(bad)),
  bookTicket: (sim, [kind, title]) => (kind === "film" || kind === "rent" || kind === "event" ? (str(title, 80) ? bookTicket(sim.state, kind, title as string) : no(bad)) : no(bad)),
};

/** The names a client may send. */
export const RPC_NAMES: readonly string[] = Object.keys(HANDLERS);

/** Per-function minimum seconds between calls, for the few that give a small reward for being called (so they can't be spammed). */
const COOLDOWN_SECONDS: Record<string, number> = { useApp: 8, recordScore: 4 };
export const rpcCooldown = (fn: string): number => COOLDOWN_SECONDS[fn] ?? 0;

/** Runs one action on a life. Unknown names and bad arguments are refused; a function that returns nothing counts as success. */
export function runRpc(sim: Sim, fn: string, args: RpcArg[]): RpcResult {
  const handler = Object.hasOwn(HANDLERS, fn) ? HANDLERS[fn] : undefined;
  if (!handler) return no("Unknown action.");
  const out = handler(sim, args) as PhoneResult | { ok: boolean; reason?: string } | void;
  if (!out) return yes;
  return out.ok ? { ok: true, text: "text" in out ? out.text : undefined } : no("reason" in out && out.reason ? out.reason : bad);
}

/** What a player picks when making a character (the server turns it into a full profile; nothing else from the client is used). */
export interface NewLifeChoices {
  backgroundId: string;
  sex: "male" | "female";
  firstName: string;
  surname: string;
  hometown: string;
  startingMoney: number;
  traits: string[];
}

/**
 * Builds a profile from a character choice. The background decides tier, rent, allowance, phone and story; the player only picks the
 * name, a hometown from the background's list, the sex, traits (limited by the trait rules), and money inside the background's range.
 */
export function buildProfile(choice: NewLifeChoices): Profile | null {
  const def = BACKGROUNDS.find((b) => b.id === choice.backgroundId);
  if (!def || !choice.firstName.trim()) return null;
  const base = profileFrom(def, () => 0.5, choice.sex);
  const [lo, hi] = def.money;
  return {
    ...base,
    firstName: choice.firstName.trim(),
    surname: choice.surname.trim(),
    hometown: def.hometowns.includes(choice.hometown) ? choice.hometown : base.hometown,
    startingMoney: Math.max(lo, Math.min(hi, Math.round(choice.startingMoney / 500) * 500)),
    traits: sanitizeTraits(choice.traits),
  };
}
