import { PLAYER, SINK, balance, transfer } from "./ledger";
import { PHONE_SEND_LIMIT, SAVINGS, loanLimit } from "./phone";
import { openStatus } from "./places";
import { clockOf } from "./sim";
import { DAY_MINUTES, type GameState } from "./types";

/**
 * The bank. You open an account at the counter (a form, an ID, a wait), collect a debit card and choose a PIN. The card and PIN open the
 * cash machine (withdraw, deposit, balance, mini statement, airtime, change PIN) and bank transfers to other players. The bank's savings
 * pay three times the interest of a phone-only saver, lend much more than LifePay, and send more in a day. The account's money is the
 * same "savings" money the phone sees, so a bank account is what makes it bigger and safer, not a second pile of cash.
 */
export interface BankBrand {
  id: string;
  name: string;
  color: string;
  /** The first digits of its card numbers. */
  bin: string;
}

/** Invented banks (no real brand is used). */
export const BANKS: BankBrand[] = [
  { id: "ekotrust", name: "Eko Trust Bank", color: "#1f5fa8", bin: "5061" },
  { id: "naijafirst", name: "Naija First Bank", color: "#1d8f4e", bin: "5399" },
  { id: "unity", name: "Unity Reserve", color: "#d9731c", bin: "4187" },
];
export const bankById = (id: string): BankBrand | undefined => BANKS.find((b) => b.id === id);

export const ID_TYPES = ["National ID (NIN)", "Driver's licence", "Voter's card", "International passport"] as const;

export const ATM_FEE = 65; // using another bank's machine
export const MIN_AMOUNT = 100;
export const ATM_NOTE = 500;
export const ATM_PER_TIME = 20_000;
export const ATM_PER_DAY = 100_000;
export const TRANSFER_FEE = 25;
export const TRANSFER_PER_DAY = 2_000_000;
/** How long an application takes (game minutes). */
export const APPLICATION_MINUTES = 120;
export const PIN_TRIES = 3;

export interface BankApplication {
  bank: string;
  at: number;
  readyAt: number;
  dob: string;
  idType: string;
  idNo: string;
  address: string;
}
export interface BankAccount {
  bank: string;
  number: string;
  name: string;
  opened: number;
  /** A scrambled form of the PIN (never the PIN itself). */
  pinHash: string;
  cardNo: string;
  expiry: string;
  failed: number;
  blockedUntil: number;
}
export interface BankRecord {
  application?: BankApplication;
  account?: BankAccount;
  /** What the machine and bank transfers have handled today (by game day). */
  day: number;
  atmToday: number;
  sentToday: number;
}

export type BankResult = { ok: true; text: string } | { ok: false; reason: string };

export const savingsBalance = (state: GameState): number => balance(state.ledger, SAVINGS);
export const accountOf = (state: GameState): BankAccount | undefined => state.bank?.account;
export const gameDay = (state: GameState): number => Math.floor(state.minute / DAY_MINUTES);

/** Is the counter open now? (Cash machines always are.) */
export function counterOpen(state: GameState): { open: boolean; text: string } {
  const clock = clockOf(state.minute);
  const weekday = (clock.day + 3) % 7; // day 1 is a Thursday
  return openStatus("bank", clock.hourFloat, weekday);
}

// ---------------------------------------------------------------- saving and reading

export function parseBank(raw: unknown): BankRecord {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<BankRecord>;
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const out: BankRecord = { day: Math.floor(num(r.day, 0, 1e6, 0)), atmToday: Math.floor(num(r.atmToday, 0, 1e9, 0)), sentToday: Math.floor(num(r.sentToday, 0, 1e10, 0)) };
  const a = r.application;
  if (a && typeof a === "object" && bankById(text(a.bank, 20))) {
    out.application = { bank: a.bank, at: num(a.at, 0, 1e9, 0), readyAt: num(a.readyAt, 0, 1e9, 0), dob: text(a.dob, 10), idType: text(a.idType, 40), idNo: text(a.idNo, 20), address: text(a.address, 100) };
  }
  const c = r.account;
  if (c && typeof c === "object" && bankById(text(c.bank, 20)) && /^\d{10}$/.test(text(c.number, 10)) && text(c.pinHash, 20)) {
    out.account = { bank: c.bank, number: c.number, name: text(c.name, 40), opened: num(c.opened, 0, 1e9, 0), pinHash: text(c.pinHash, 20), cardNo: text(c.cardNo, 19), expiry: text(c.expiry, 5), failed: Math.floor(num(c.failed, 0, 99, 0)), blockedUntil: num(c.blockedUntil, 0, 1e9, 0) };
  }
  return out;
}

/** The day's counters, started fresh when the day changes. */
function today(state: GameState): BankRecord {
  const b = (state.bank ??= { day: gameDay(state), atmToday: 0, sentToday: 0 });
  if (b.day !== gameDay(state)) {
    b.day = gameDay(state);
    b.atmToday = 0;
    b.sentToday = 0;
  }
  return b;
}

// ---------------------------------------------------------------- the PIN

/** A small scramble (not strong: the game's account is not a real one, but the PIN is never kept or shown as typed). */
function scramble(pin: string, salt: string): string {
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  for (const ch of `${salt}:${pin}:thelife`) {
    h1 = Math.imul(h1 ^ ch.charCodeAt(0), 16777619) >>> 0;
    h2 = Math.imul(h2 + ch.charCodeAt(0), 2246822519) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`.slice(0, 16);
}
const validPin = (pin: unknown): pin is string => typeof pin === "string" && /^\d{4}$/.test(pin);
const weakPin = (pin: string): boolean => /^(\d)\1{3}$/.test(pin) || pin === "1234" || pin === "4321";

/** Checks the card's PIN. Three wrong tries in a row block the card for a day. Returns the reason it can't be used, or null. */
export function checkPin(state: GameState, pin: unknown): string | null {
  const a = accountOf(state);
  if (!a) return "You don't have a bank account yet. Open one at the counter.";
  if (state.minute < a.blockedUntil) return "Your card is blocked after wrong PINs. Try again tomorrow, or ask at the counter.";
  if (!validPin(pin)) return "Enter your 4-digit PIN.";
  if (scramble(pin, a.number) === a.pinHash) {
    a.failed = 0;
    return null;
  }
  a.failed++;
  if (a.failed >= PIN_TRIES) {
    a.failed = 0;
    a.blockedUntil = state.minute + DAY_MINUTES;
    return "Wrong PIN. Your card is blocked for a day.";
  }
  return `Wrong PIN. ${PIN_TRIES - a.failed} ${PIN_TRIES - a.failed === 1 ? "try" : "tries"} left.`;
}

// ---------------------------------------------------------------- opening an account

/** A number from the player's own life (never the same twice), as digits. */
function digitsFrom(state: GameState, salt: string, count: number): string {
  let out = "";
  let n = 0;
  while (out.length < count) out += scramble(`${state.minute}:${state.ledger.nextId}:${state.profile?.firstName ?? ""}:${n++}`, salt).replace(/\D/g, "");
  return out.slice(0, count);
}

export function applyForAccount(state: GameState, bankId: string, dob: string, idType: string, idNo: string, address: string): BankResult {
  const c = counterOpen(state);
  if (!c.open) return { ok: false, reason: `The counter is closed (${c.text}).` };
  if (state.bank?.account) return { ok: false, reason: "You already have an account." };
  if (state.bank?.application) return { ok: false, reason: "Your application is already being processed." };
  if (!bankById(bankId)) return { ok: false, reason: "Choose a bank." };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m || +m[1]! < 1930 || +m[1]! > 2020 || +m[2]! < 1 || +m[2]! > 12 || +m[3]! < 1 || +m[3]! > 31) return { ok: false, reason: "Write your date of birth as year-month-day, for example 1998-04-23." };
  if (+m[1]! > 2007) return { ok: false, reason: "You must be 18 or older to open an account." };
  if (!(ID_TYPES as readonly string[]).includes(idType)) return { ok: false, reason: "Choose an ID type." };
  if (!/^[A-Za-z0-9]{8,16}$/.test(idNo)) return { ok: false, reason: "The ID number should be 8 to 16 letters and digits." };
  if (address.trim().length < 6 || address.length > 100) return { ok: false, reason: "Write your home address." };
  const b = today(state);
  b.application = { bank: bankId, at: state.minute, readyAt: state.minute + APPLICATION_MINUTES, dob, idType, idNo: idNo.toUpperCase(), address: address.trim() };
  return { ok: true, text: `Application sent to ${bankById(bankId)!.name}. It takes about ${APPLICATION_MINUTES / 60} hours. Come back to collect your card.` };
}

export const applicationReady = (state: GameState): boolean => !!state.bank?.application && state.minute >= state.bank.application.readyAt;

/** The application is approved: you collect the card and choose your PIN. */
export function collectCard(state: GameState, pin: string): BankResult {
  const app = state.bank?.application;
  if (!app) return { ok: false, reason: "You have no application." };
  if (state.minute < app.readyAt) return { ok: false, reason: "Your application is still being processed." };
  const c = counterOpen(state);
  if (!c.open) return { ok: false, reason: `The counter is closed (${c.text}).` };
  if (!validPin(pin)) return { ok: false, reason: "Choose a 4-digit PIN." };
  if (weakPin(pin)) return { ok: false, reason: "That PIN is too easy to guess. Choose another." };
  const bank = bankById(app.bank)!;
  const number = `${["0", "1", "2"][BANKS.indexOf(bank)]}${digitsFrom(state, "account", 9)}`;
  const year = (26 + Math.floor(gameDay(state) / 365) + 3) % 100;
  const profile = state.profile;
  const b = today(state);
  b.account = {
    bank: bank.id,
    number,
    name: `${profile?.firstName ?? "Player"} ${profile?.surname ?? ""}`.trim().toUpperCase().slice(0, 26),
    opened: state.minute,
    pinHash: scramble(pin, number),
    cardNo: `${bank.bin}${digitsFrom(state, "card", 12)}`,
    expiry: `${String((Math.floor(gameDay(state) / 30) % 12) + 1).padStart(2, "0")}/${String(year).padStart(2, "0")}`,
    failed: 0,
    blockedUntil: 0,
  };
  delete b.application;
  return { ok: true, text: `Your ${bank.name} account ${number} is open. Keep your PIN to yourself.` };
}

/** The bank unblocks a card at the counter. */
export function unblockCard(state: GameState): BankResult {
  const a = accountOf(state);
  if (!a) return { ok: false, reason: "You have no account." };
  const c = counterOpen(state);
  if (!c.open) return { ok: false, reason: `The counter is closed (${c.text}).` };
  a.blockedUntil = 0;
  a.failed = 0;
  return { ok: true, text: "Your card works again." };
}

// ---------------------------------------------------------------- the counter

function counterCheck(state: GameState, amount: number): string | null {
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < MIN_AMOUNT) return `The smallest amount is ₦${MIN_AMOUNT}.`;
  if (amount > 100_000_000) return "That is more than the bank handles at once.";
  if (!accountOf(state)) return "You need a bank account first. Open one at the counter.";
  const c = counterOpen(state);
  if (!c.open) return `The counter is closed (${c.text}). Use the cash machine, or come back.`;
  return null;
}

export function bankDeposit(state: GameState, amount: number): BankResult {
  const bad = counterCheck(state, amount);
  if (bad) return { ok: false, reason: bad };
  if (balance(state.ledger, PLAYER) < amount) return { ok: false, reason: "You don't have that much." };
  transfer(state.ledger, PLAYER, SAVINGS, amount, "Paid into your account", state.minute);
  return { ok: true, text: `Paid in ₦${amount.toLocaleString()}. Balance: ₦${savingsBalance(state).toLocaleString()}.` };
}

export function bankWithdraw(state: GameState, amount: number): BankResult {
  const bad = counterCheck(state, amount);
  if (bad) return { ok: false, reason: bad };
  if (savingsBalance(state) < amount) return { ok: false, reason: `Your balance is ₦${savingsBalance(state).toLocaleString()}.` };
  transfer(state.ledger, SAVINGS, PLAYER, amount, "Taken out of your account", state.minute);
  return { ok: true, text: `Took out ₦${amount.toLocaleString()}. Balance: ₦${savingsBalance(state).toLocaleString()}.` };
}

/** A loan at the counter (the same 10% fee and late charge as the phone's, but the bank lends a lot more). */
export function bankBorrow(state: GameState, amount: number): BankResult {
  const bad = counterCheck(state, amount);
  if (bad) return { ok: false, reason: bad };
  const p = state.phone;
  if (p.loan) return { ok: false, reason: "Pay off your current loan first." };
  if (amount > loanLimit(state.profile)) return { ok: false, reason: `The most they will lend you is ₦${loanLimit(state.profile).toLocaleString()}.` };
  transfer(state.ledger, "mint", PLAYER, amount, "Loan from the bank", state.minute);
  p.loan = { owed: Math.round(amount * 1.1), sinceDay: Math.floor(state.minute / 1440) + 1 };
  return { ok: true, text: `₦${amount.toLocaleString()} paid out. You owe ₦${p.loan.owed.toLocaleString()} (10% fee).` };
}

export function bankRepay(state: GameState, amount: number): BankResult {
  const bad = counterCheck(state, amount);
  if (bad) return { ok: false, reason: bad };
  const p = state.phone;
  if (!p.loan) return { ok: false, reason: "You have no loan." };
  const pay = Math.min(amount, p.loan.owed, balance(state.ledger, PLAYER));
  if (pay <= 0) return { ok: false, reason: "You don't have enough." };
  transfer(state.ledger, PLAYER, SINK, pay, "Loan repayment", state.minute);
  p.loan.owed -= pay;
  if (p.loan.owed <= 0) p.loan = null;
  return { ok: true, text: `Repaid ₦${pay.toLocaleString()}.${p.loan ? "" : " Loan cleared."}` };
}

// ---------------------------------------------------------------- the cash machine (card and PIN)

/** Puts the card in and types the PIN: says whether it is right (and counts a wrong try). */
export function atmLogin(state: GameState, pin: string): BankResult {
  const bad = checkPin(state, pin);
  return bad ? { ok: false, reason: bad } : { ok: true, text: "PIN accepted." };
}

/** What the machine charges: nothing at your own bank's machines, ₦65 at another's. */
export const atmFee = (state: GameState, machineBank: string): number => (accountOf(state)?.bank === machineBank ? 0 : ATM_FEE);

export function atmWithdraw(state: GameState, amount: number, pin: string, machineBank: string): BankResult {
  const bad = checkPin(state, pin);
  if (bad) return { ok: false, reason: bad };
  if (!Number.isInteger(amount) || amount < ATM_NOTE || amount % ATM_NOTE !== 0) return { ok: false, reason: `Choose an amount in ₦${ATM_NOTE} notes.` };
  if (amount > ATM_PER_TIME) return { ok: false, reason: `The machine gives up to ₦${ATM_PER_TIME.toLocaleString()} each time.` };
  const b = today(state);
  if (b.atmToday + amount > ATM_PER_DAY) return { ok: false, reason: `Your card's limit is ₦${ATM_PER_DAY.toLocaleString()} a day at machines (₦${Math.max(0, ATM_PER_DAY - b.atmToday).toLocaleString()} left).` };
  const fee = atmFee(state, machineBank);
  if (savingsBalance(state) < amount + fee) return { ok: false, reason: fee ? `You need ₦${(amount + fee).toLocaleString()} in your account (the machine takes ₦${fee}).` : "Not enough money in your account." };
  transfer(state.ledger, SAVINGS, PLAYER, amount, "Cash machine withdrawal", state.minute);
  if (fee) transfer(state.ledger, SAVINGS, SINK, fee, "Cash machine fee", state.minute);
  b.atmToday += amount;
  return { ok: true, text: `Take your cash: ₦${amount.toLocaleString()}.${fee ? ` Fee ₦${fee}.` : ""} Balance: ₦${savingsBalance(state).toLocaleString()}.` };
}

export function atmDeposit(state: GameState, amount: number, pin: string): BankResult {
  const bad = checkPin(state, pin);
  if (bad) return { ok: false, reason: bad };
  if (!Number.isInteger(amount) || amount < ATM_NOTE || amount % ATM_NOTE !== 0 || amount > 200_000) return { ok: false, reason: `Pay in ₦${ATM_NOTE} notes, up to ₦200,000.` };
  if (balance(state.ledger, PLAYER) < amount) return { ok: false, reason: "You don't have that much cash." };
  transfer(state.ledger, PLAYER, SAVINGS, amount, "Cash machine deposit", state.minute);
  return { ok: true, text: `Paid in ₦${amount.toLocaleString()}. Balance: ₦${savingsBalance(state).toLocaleString()}.` };
}

export function atmAirtime(state: GameState, amount: number, pin: string): BankResult {
  const bad = checkPin(state, pin);
  if (bad) return { ok: false, reason: bad };
  if (!Number.isInteger(amount) || amount < 100 || amount > 5_000) return { ok: false, reason: "Airtime is ₦100 to ₦5,000." };
  if (savingsBalance(state) < amount) return { ok: false, reason: "Not enough money in your account." };
  transfer(state.ledger, SAVINGS, SINK, amount, "Airtime from the cash machine", state.minute);
  state.phone.airtime += amount;
  return { ok: true, text: `₦${amount.toLocaleString()} airtime added to your phone.` };
}

export function atmChangePin(state: GameState, oldPin: string, newPin: string): BankResult {
  const bad = checkPin(state, oldPin);
  if (bad) return { ok: false, reason: bad };
  if (!validPin(newPin)) return { ok: false, reason: "Choose a 4-digit PIN." };
  if (weakPin(newPin)) return { ok: false, reason: "That PIN is too easy to guess." };
  const a = accountOf(state)!;
  a.pinHash = scramble(newPin, a.number);
  return { ok: true, text: "Your PIN has been changed." };
}

// ---------------------------------------------------------------- transfers to other people

/**
 * Takes a transfer to another player out of the account (their phone number or ID decides who gets it, on the server): the PIN, the
 * day's limit and the fee are checked here. The money leaves the account; the server then hands it to the other player.
 */
export function bankTransferOut(state: GameState, amount: number, pin: string, memo: string): BankResult {
  const bad = checkPin(state, pin);
  if (bad) return { ok: false, reason: bad };
  if (!Number.isInteger(amount) || amount < MIN_AMOUNT) return { ok: false, reason: `The smallest transfer is ₦${MIN_AMOUNT}.` };
  const b = today(state);
  if (b.sentToday + amount > TRANSFER_PER_DAY) return { ok: false, reason: `Bank transfers are limited to ₦${TRANSFER_PER_DAY.toLocaleString()} a day.` };
  if (savingsBalance(state) < amount + TRANSFER_FEE) return { ok: false, reason: `You need ₦${(amount + TRANSFER_FEE).toLocaleString()} in your account (₦${TRANSFER_FEE} transfer fee).` };
  transfer(state.ledger, SAVINGS, SINK, amount, memo, state.minute);
  transfer(state.ledger, SAVINGS, SINK, TRANSFER_FEE, "Transfer fee", state.minute);
  b.sentToday += amount;
  state.stats.totalSpent += amount + TRANSFER_FEE;
  return { ok: true, text: `Sent ₦${amount.toLocaleString()} (₦${TRANSFER_FEE} fee).` };
}

/** The account's recent movements, newest first, for the mini statement. */
export function statement(state: GameState, count = 10): { minute: number; text: string; amount: number }[] {
  return state.ledger.entries
    .filter((e) => e.from === SAVINGS || e.to === SAVINGS)
    .slice(-count)
    .reverse()
    .map((e) => ({ minute: e.minute, text: e.reason, amount: e.to === SAVINGS ? e.amount : -e.amount }));
}

export { PHONE_SEND_LIMIT };
