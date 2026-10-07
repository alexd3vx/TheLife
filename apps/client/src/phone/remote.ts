import * as core from "@thelife/game-core";
import type { GameState, PhoneResult } from "@thelife/game-core";
import type { RpcArg } from "@thelife/shared";

// The phone's actions, online. Each one runs on the player's own copy straight away (so the phone feels instant) and, when the
// game is online, is also sent to the server, which runs it on the real life and sends back the truth. Offline (the old house
// page and tests) there is no transport and these behave exactly like the game-core functions.

type Send = (fn: string, args: RpcArg[]) => number;
let transport: Send | null = null;
let lastId = 0;
let lastAt = 0;

export function setTransport(send: Send | null): void {
  transport = send;
  lastId = 0;
  lastAt = 0;
}

/**
 * The id of the newest action sent; a server snapshot is only applied once it has handled at least this one. After a few seconds
 * we stop waiting (the message may have been lost), so a snapshot can never be ignored forever.
 */
export const lastSentId = (): number => (Date.now() - lastAt < 3000 ? lastId : 0);
/** Out in the city: says whether there is a socket here (a place's name), or null. At home it always says yes. */
let chargeChecker: (() => string | null) | null = null;
export function setChargeChecker(fn: (() => string | null) | null): void {
  chargeChecker = fn;
}

export const isOnline = (): boolean => transport !== null;

/** Sends an action to the server (does nothing offline). */
export function rpc(fn: string, args: RpcArg[] = []): void {
  if (transport) {
    lastId = transport(fn, args);
    lastAt = Date.now();
  }
}

function remote<A extends [GameState, ...unknown[]], R>(name: string, fn: (...a: A) => R, wire: (a: A) => RpcArg[] = (a) => a.slice(1) as RpcArg[]) {
  return (...a: A): R => {
    const out = fn(...a);
    const failed = typeof out === "object" && out !== null && (out as unknown as PhoneResult).ok === false;
    if (!failed) rpc(name, wire(a));
    return out;
  };
}

export const openApp = remote("openApp", core.openApp as (s: GameState, a: string) => PhoneResult);
export const call = remote("call", core.call);
const corePlug = core.plug as (s: GameState, a: "wall" | "bank" | null) => PhoneResult;
export const plug = remote("plug", (s: GameState, source: "wall" | "bank" | null): PhoneResult => {
  if (source === "wall" && chargeChecker && !chargeChecker()) return { ok: false, reason: "There is no socket here. Charge at home, or at a shop, bank, hotel, hospital or station." };
  return corePlug(s, source);
});
export const setBankCharging = remote("setBankCharging", core.setBankCharging);
export const payRent = remote("payRent", core.payRent as (s: GameState, a?: number) => PhoneResult, (a) => (a[1] === undefined ? [] : [a[1]]));
export const payBill = remote("payBill", core.payBill);
export const sendMoney = remote("sendMoney", core.sendMoney);
export const deposit = remote("deposit", core.deposit);
export const withdraw = remote("withdraw", core.withdraw);
export const borrow = remote("borrow", core.borrow);
export const repay = remote("repay", core.repay);
export const setAutoPay = remote("setAutoPay", core.setAutoPay);
export const topUp = remote("topUp", core.topUp);
export const placeOrder = remote("placeOrder", core.placeOrder as (s: GameState, a: string, b?: number) => PhoneResult, (a) => [a[1] as string]); // the price scale is the server's own
export const applyForJob = remote("applyForJob", core.applyForJob);
export const quitJob = remote("quitJob", core.quitJob);
export const replyToThread = remote("replyToThread", core.replyToThread);
export const markThreadRead = remote("markThreadRead", core.markThreadRead);
export const dismissNotification = remote("dismissNotification", core.dismissNotification);
export const clearNotifications = remote("clearNotifications", core.clearNotifications);
export const markNotificationsRead = remote("markNotificationsRead", core.markNotificationsRead);
export const setWifi = remote("setWifi", core.setWifi);
export const setMobileData = remote("setMobileData", core.setMobileData);
export const buyHomePlan = remote("buyHomePlan", core.buyHomePlan);
export const startDownload = remote("startDownload", core.startDownload as (s: GameState, a: string) => PhoneResult);
export const cancelDownload = remote("cancelDownload", core.cancelDownload as (s: GameState, a: string) => PhoneResult);
export const uninstallApp = remote("uninstallApp", core.uninstallApp as (s: GameState, a: string) => PhoneResult);
export const addNote = remote("addNote", core.addNote);
export const deleteNote = remote("deleteNote", core.deleteNote);
export const recordScore = remote("recordScore", core.recordScore as (s: GameState, a: string, b: number) => PhoneResult);
export const buyShares = remote("buyShares", core.buyShares);
export const sellShares = remote("sellShares", core.sellShares);
export const joinAjo = remote("joinAjo", core.joinAjo);
export const payAjo = remote("payAjo", core.payAjo);
export const orderEats = remote("orderEats", core.orderEats);
export const takeLesson = remote("takeLesson", core.takeLesson);
export const diaryCheckIn = remote("diaryCheckIn", core.diaryCheckIn);
export const addTodo = remote("addTodo", core.addTodo);
export const toggleTodo = remote("toggleTodo", core.toggleTodo);
export const deleteTodo = remote("deleteTodo", core.deleteTodo);
export const drinkWater = remote("drinkWater", core.drinkWater);
export const finishFocus = remote("finishFocus", core.finishFocus);
export const doWorkout = remote("doWorkout", core.doWorkout);
export const doGig = remote("doGig", core.doGig);
export const useApp = remote("useApp", core.useApp as (s: GameState, a: string, b: number) => void, (a) => [a[1] as string]);
export const streamData = remote("streamData", core.streamData);
export const bookTicket = remote("bookTicket", core.bookTicket);

// ---- the kitchen
type KR = core.KitchenResult;
export const buyIngredient = remote("buyIngredient", core.buyIngredient as (s: GameState, id: string, q: number, scale?: number) => KR, (a) => [a[1] as string, a[2] as number]); // the price scale is the server's own
export const chooseRecipe = remote("chooseRecipe", core.chooseRecipe as (s: GameState, id: string) => KR);
export const cancelRecipe = remote("cancelRecipe", core.cancelRecipe as (s: GameState) => KR);
export const chooseDish = remote("chooseDish", core.chooseDish as (s: GameState, id: string) => KR);
export const discardDish = remote("discardDish", core.discardDish as (s: GameState, id: string) => KR);
export const discardLot = remote("discardLot", core.discardLot as (s: GameState, id: string) => KR);

// ---- the home
type HR = core.HomeResultLike;
export const homeMove = remote("homeMove", core.homeMove as (s: GameState, id: string, x: number, z: number, rot: number) => HR);
export const homeLock = remote("homeLock", core.homeLock as (s: GameState, locked: boolean) => HR);
export const homeSell = remote("homeSell", core.homeSell as (s: GameState, id: string, furniture?: string) => HR, (a) => [a[1] as string, (a[2] as string | undefined) ?? null]);
export const homeBuy = remote("homeBuy", core.homeBuy as (s: GameState, furniture: string, x: number, z: number, rot: number) => HR);

// ---- getting around
export const payRide = remote("payRide", core.payRide as (s: GameState, id: string, meters: number) => core.RideResult);

// ---- the bank branch (in person: works on any phone)
type BR = core.BankResult;
export const bankDeposit = remote("bankDeposit", core.bankDeposit as (s: GameState, amount: number, atm?: boolean) => BR, (a) => [a[1], a[2] === true]);
export const bankWithdraw = remote("bankWithdraw", core.bankWithdraw as (s: GameState, amount: number, atm?: boolean) => BR, (a) => [a[1], a[2] === true]);
export const bankBorrow = remote("bankBorrow", core.bankBorrow as (s: GameState, amount: number) => BR);
export const bankRepay = remote("bankRepay", core.bankRepay as (s: GameState, amount: number) => BR);

// ---- the hospital (in person)
type HoR = core.HospitalResult;
export const hospital = remote("hospital", core.hospitalService as (s: GameState, id: string) => HoR);
export const hospitalFirstAid = remote("hospitalFirstAid", core.hospitalFirstAid as (s: GameState) => HoR);

// ---- the shops (in person)
export const shopSnack = remote("shopSnack", core.shopSnack as (s: GameState, kind: core.ShopPlace, id: string, scale?: number) => core.ShopResult, (a) => [a[1], a[2]]); // the price scale is the server's own

// ---- the police station (in person)
export const police = remote("police", core.policeService as (s: GameState, id: string) => core.PoliceResult);

// ---- church and mosque (in person)
export const worship = remote("worship", core.worshipService as (s: GameState, faith: core.Faith, id: string) => core.WorshipResult, (a) => [a[1], a[2]]);

// ---- the school (in person)
export const school = remote("school", core.schoolService as (s: GameState, id: string) => core.SchoolResult);
