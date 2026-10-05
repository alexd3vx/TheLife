import type { PhoneTier, Profile } from "./profile";

// The phone's content as data: models, chargers, the shop, NPC chats, jobs, news. Rules live in phone.ts.
// Brand names are our own ("Life" family) so nothing here is a real company's product.

export type PortId = "micro" | "usbc" | "lifelink";
export type AppId = "chat" | "pay" | "shop" | "jobs" | "news" | "maps";

export interface PhoneModel {
  tier: PhoneTier;
  name: string;
  tagline: string;
  price: number;
  /** Charging ports it has. A charger only works if it fits one of them. */
  ports: PortId[];
  /** Fastest it can take charge, in battery % per game hour. */
  maxCharge: number;
  /** Hours of use per full battery, screen on / screen off. */
  screenHours: number;
  standbyHours: number;
  apps: AppId[];
  /** Savings and loans in LifePay. */
  banking: boolean;
  screen: string;
  /** How long app animations take (1 = smooth; the budget phone is slower). */
  slowness: number;
  startBattery: number;
}

export const PHONE_MODELS: Record<PhoneTier, PhoneModel> = {
  basic: {
    tier: "basic", name: "LifePhone Go", tagline: "Simple. Tough. Lasts.", price: 45_000,
    ports: ["micro"], maxCharge: 25, screenHours: 9, standbyHours: 72,
    apps: ["chat", "pay", "shop", "news"], banking: false, screen: "LCD 60Hz", slowness: 1.5, startBattery: 70,
  },
  mid: {
    tier: "mid", name: "LifePhone Plus", tagline: "Everything you need.", price: 150_000,
    ports: ["usbc"], maxCharge: 60, screenHours: 7, standbyHours: 48,
    apps: ["chat", "pay", "shop", "news", "jobs", "maps"], banking: true, screen: "AMOLED 90Hz", slowness: 1, startBattery: 85,
  },
  flagship: {
    tier: "flagship", name: "LifePhone Max", tagline: "The one everyone notices.", price: 480_000,
    ports: ["lifelink", "usbc"], maxCharge: 150, screenHours: 6, standbyHours: 36,
    apps: ["chat", "pay", "shop", "news", "jobs", "maps"], banking: true, screen: "AMOLED 120Hz", slowness: 0.7, startBattery: 100,
  },
};

export const APP_INFO: Record<AppId, { name: string; blurb: string; dataMB: number }> = {
  chat: { name: "LifeChat", blurb: "Messages and calls", dataMB: 3 },
  pay: { name: "LifePay", blurb: "Bank and wallet", dataMB: 0 }, // works over USSD, no data needed
  shop: { name: "LifeShop", blurb: "Shopping and delivery", dataMB: 8 },
  jobs: { name: "LifeJobs", blurb: "Gigs and jobs", dataMB: 6 },
  news: { name: "LifeNews", blurb: "Headlines and alerts", dataMB: 12 },
  maps: { name: "LifeMaps", blurb: "Around you", dataMB: 20 },
};

export interface ChargerDef {
  id: string;
  name: string;
  ports: PortId[];
  /** Battery % per game hour it can push. */
  rate: number;
  price: number;
}

export const CHARGERS: ChargerDef[] = [
  { id: "charger_micro", name: "Basic charger (micro)", ports: ["micro"], rate: 25, price: 2_500 },
  { id: "charger_usbc", name: "USB-C charger", ports: ["usbc"], rate: 55, price: 6_000 },
  { id: "charger_multi", name: "Multi-tip charger", ports: ["micro", "usbc"], rate: 40, price: 7_500 },
  { id: "charger_lifelink", name: "LifeLink fast charger", ports: ["lifelink", "usbc"], rate: 150, price: 22_000 },
];

export const POWER_BANK = { id: "powerbank", name: "Power bank 10,000mAh", price: 12_000, capacity: 120, outRate: 50, inRate: 20 } as const;

export function chargerById(id: string): ChargerDef | undefined {
  return CHARGERS.find((c) => c.id === id);
}

export function startingCharger(tier: PhoneTier): string {
  return tier === "basic" ? "charger_micro" : tier === "mid" ? "charger_usbc" : "charger_lifelink";
}

// ---------------------------------------------------------------- shop

export type ShopKind = "grocery" | "phone" | "charger" | "powerbank" | "airtime" | "data";

export interface ShopItem {
  id: string;
  name: string;
  blurb: string;
  kind: ShopKind;
  /** Base price; groceries are re-priced by traits and promos in the sim. */
  price: number;
  /** Game minutes until it arrives (0 = instant, for airtime and data). */
  deliveryMinutes: number;
  /** Portions, airtime ₦, data MB, or a phone tier id, depending on kind. */
  amount?: number;
  tier?: PhoneTier;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: "groc_small", name: "Groceries", blurb: "6 portions of food", kind: "grocery", price: 1_800, deliveryMinutes: 30, amount: 6 },
  { id: "groc_big", name: "Family pack", blurb: "14 portions of food", kind: "grocery", price: 3_900, deliveryMinutes: 45, amount: 14 },
  ...CHARGERS.map((c): ShopItem => ({ id: c.id, name: c.name, blurb: `Fits ${c.ports.join(" / ")} · ${c.rate}% per hour`, kind: "charger", price: c.price, deliveryMinutes: 60 })),
  { id: POWER_BANK.id, name: POWER_BANK.name, blurb: "Charge anywhere, even in a power cut", kind: "powerbank", price: POWER_BANK.price, deliveryMinutes: 90 },
  { id: "phone_basic", name: "LifePhone Go", blurb: "Micro-USB · LCD · battery for days", kind: "phone", price: PHONE_MODELS.basic.price, deliveryMinutes: 240, tier: "basic" },
  { id: "phone_mid", name: "LifePhone Plus", blurb: "USB-C · AMOLED 90Hz · jobs and maps", kind: "phone", price: PHONE_MODELS.mid.price, deliveryMinutes: 240, tier: "mid" },
  { id: "phone_flagship", name: "LifePhone Max", blurb: "LifeLink fast charge · AMOLED 120Hz", kind: "phone", price: PHONE_MODELS.flagship.price, deliveryMinutes: 240, tier: "flagship" },
];

export const TOPUPS: ShopItem[] = [
  { id: "airtime_500", name: "₦500 airtime", blurb: "About 25 minutes of calls", kind: "airtime", price: 500, deliveryMinutes: 0, amount: 500 },
  { id: "airtime_1000", name: "₦1,000 airtime", blurb: "About 50 minutes of calls", kind: "airtime", price: 1_000, deliveryMinutes: 0, amount: 1_000 },
  { id: "data_1gb", name: "1 GB data", blurb: "Around 100 app visits", kind: "data", price: 1_000, deliveryMinutes: 0, amount: 1_024 },
  { id: "data_3gb", name: "3 GB data", blurb: "Better value", kind: "data", price: 2_500, deliveryMinutes: 0, amount: 3_072 },
];

export const AIRTIME_PER_CALL_MINUTE = 20;
export const DELIVERY_FEE = 500;
export const FREE_DELIVERY_OVER = 10_000;

export function shopItemById(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id) ?? TOPUPS.find((i) => i.id === id);
}

// ---------------------------------------------------------------- people

export interface Contact {
  id: string;
  name: string;
  role: string;
  /** Can you send money to them from LifePay? */
  receivesMoney: boolean;
  /** Can you phone them? */
  callable: boolean;
  /** Can you reply to their messages? */
  talks: boolean;
}

export function contactsFor(profile: Profile | null): Contact[] {
  const family = profile?.tier === "nepo" ? (profile.allowanceFrom || "Daddy") : "Mum";
  const list: Contact[] = [
    { id: "family", name: family, role: "Family", receivesMoney: true, callable: true, talks: true },
    { id: "kola", name: "Kola", role: "Friend", receivesMoney: true, callable: true, talks: true },
  ];
  if (profile?.tier !== "nepo") list.push({ id: "landlord", name: "Landlord", role: "Your landlord", receivesMoney: false, callable: true, talks: true });
  list.push({ id: "lifepay", name: "LifePay", role: "Bank alerts", receivesMoney: false, callable: false, talks: false });
  list.push({ id: "lifejobs", name: "LifeJobs", role: "Job alerts", receivesMoney: false, callable: false, talks: false });
  return list;
}

export interface BeatOption {
  label: string;
  reply: string;
  fun?: number;
  /** Naira sent to the contact from your account. */
  send?: number;
  /** They pay you back later. */
  repay?: { days: number; amount: number };
}

export interface Beat {
  id: string;
  contact: string;
  day: number;
  hour: number;
  text: string;
  options?: BeatOption[];
  /** Only for these tiers (all if omitted). */
  tiers?: string[];
}

/** Written messages that arrive on set days. `{name}` and `{rent}` are filled in. */
export const BEATS: Beat[] = [
  { id: "family_welcome", contact: "family", day: 1, hour: 9, tiers: ["lapo", "middle"], text: "Good morning {name}! Have you settled in? Eat something o, don't just work.",
    options: [{ label: "Yes Mum, I'm fine", reply: "Good. Call me tonight, okay?", fun: 3 }, { label: "Can you send some money?", reply: "Ah. Things are tight here too. Manage small small, I believe in you." }] },
  { id: "family_welcome_nepo", contact: "family", day: 1, hour: 9, tiers: ["nepo"], text: "Morning {name}. The allowance comes on Sunday. Please don't spend it all in one place.",
    options: [{ label: "Thank you!", reply: "Behave yourself.", fun: 3 }, { label: "Can it be more?", reply: "We will see how you do this month." }] },
  { id: "landlord_welcome", contact: "landlord", day: 1, hour: 12, tiers: ["lapo", "middle"], text: "Welcome. Rent is {rent} every 7th day at 8am. You can pay from LifePay. Late payment has a fee.",
    options: [{ label: "Understood, thank you", reply: "Good. Keep the compound clean." }] },
  { id: "kola_hello", contact: "kola", day: 1, hour: 15, text: "Guy! You don land? Make we link up soon. How the new place?",
    options: [{ label: "Come over, I'll cook", reply: "I dey come! Make you cook well well o.", fun: 4 }, { label: "Busy today, later", reply: "No wahala, I go find you." }] },
  { id: "jobs_hello", contact: "lifejobs", day: 2, hour: 11, text: "Welcome to LifeJobs. New gigs near you are in the app." },
  { id: "kola_borrow", contact: "kola", day: 2, hour: 19, text: "Abeg {name}, can you lend me ₦2,000? I'll send ₦2,200 back by Friday. Promise.",
    options: [{ label: "Send ₦2,000", reply: "God bless you! I will pay you back.", send: 2_000, repay: { days: 3, amount: 2_200 } }, { label: "Sorry, I'm broke", reply: "Ah no wahala, I understand." }] },
  { id: "family_eat", contact: "family", day: 3, hour: 10, text: "Did you eat today? Don't skip meals, your health is your wealth.",
    options: [{ label: "Yes, I did!", reply: "Good child.", fun: 3 }, { label: "Not yet, going to now", reply: "Go and eat! I'm waiting here." }] },
  { id: "kola_weekend", contact: "kola", day: 5, hour: 20, text: "There's a small show this weekend. You go join? It will be fun.",
    options: [{ label: "Maybe next time", reply: "Alright. Rest well." }, { label: "Count me in", reply: "Great! I'll text you the details.", fun: 6 }] },
  { id: "family_checkin", contact: "family", day: 8, hour: 18, text: "How is the week going, {name}? Remember to save a little every week.",
    options: [{ label: "I'm trying, Mum", reply: "That's all I ask.", fun: 2 }, { label: "Money is hard", reply: "It always is at first. Keep going." }] },
];

// ---------------------------------------------------------------- jobs

export interface JobDef {
  id: string;
  title: string;
  employer: string;
  blurb: string;
  /** Paid every payday while you hold the job. */
  retainer: number;
  /** Multiplier on pay from working at the computer. */
  payBoost: number;
  requires: { skill: "computer" | "knowledge"; level: number };
}

export const JOBS: JobDef[] = [
  { id: "data_entry", title: "Remote data entry", employer: "Tolu & Sons Ltd", blurb: "Type up records from home.", retainer: 6_000, payBoost: 1.1, requires: { skill: "computer", level: 0 } },
  { id: "chat_support", title: "Chat support agent", employer: "Zest Telecom", blurb: "Answer customers on a headset.", retainer: 11_000, payBoost: 1.0, requires: { skill: "knowledge", level: 2 } },
  { id: "virtual_assistant", title: "Virtual assistant", employer: "BrightPath Agency", blurb: "Inbox, calendar and spreadsheets.", retainer: 9_000, payBoost: 1.2, requires: { skill: "computer", level: 2 } },
  { id: "junior_dev", title: "Junior web developer", employer: "Kubo Labs", blurb: "Build and fix pages for clients.", retainer: 22_000, payBoost: 1.45, requires: { skill: "computer", level: 4 } },
];

export const JOB_DECISION_MINUTES = 12 * 60;

// ---------------------------------------------------------------- news and power

function hash(n: number): number {
  let x = (n + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export interface PowerCut {
  startMinute: number;
  endMinute: number;
  announced: boolean;
}

/** The day's power cut, if any. Deterministic from the day number, so it is the same everywhere (and on a server). */
export function powerCutOn(day: number): PowerCut | null {
  if (hash(day * 7 + 1) > 0.45) return null;
  const startHour = 9 + Math.floor(hash(day * 7 + 2) * 12);
  const hours = 2 + Math.floor(hash(day * 7 + 3) * 4);
  const base = (day - 1) * 24 * 60;
  return { startMinute: base + startHour * 60, endMinute: base + (startHour + hours) * 60, announced: hash(day * 7 + 4) < 0.6 };
}

export function isPowerCut(minute: number): boolean {
  const day = Math.floor(minute / 1440) + 1;
  for (const d of [day - 1, day]) {
    const cut = d >= 1 ? powerCutOn(d) : null;
    if (cut && minute >= cut.startMinute && minute < cut.endMinute) return true;
  }
  return false;
}

/** 15% off groceries on some days. */
export function groceryPromo(day: number): boolean {
  return hash(day * 11 + 5) < 0.2;
}

export interface NewsItem {
  id: string;
  tag: string;
  headline: string;
  body: string;
}

const STORIES: Omit<NewsItem, "id">[] = [
  { tag: "City", headline: "Traffic on the expressway moves slowly after morning rain", body: "Drivers are advised to leave early. Okada riders are charging extra on the wet roads." },
  { tag: "Business", headline: "Local tech hubs report more young people learning to code", body: "Training centres say evening classes are full, and employers are hiring remote juniors." },
  { tag: "Market", headline: "Tomato prices ease as new harvest reaches the markets", body: "Traders say a basket now costs a little less than last week." },
  { tag: "Health", headline: "Clinics remind residents to wash hands and drink clean water", body: "Health workers say simple habits prevent most seasonal illness." },
  { tag: "Sports", headline: "Local league: the title race goes down to the final weekend", body: "Fans are already queuing for tickets at the stadium gate." },
  { tag: "Culture", headline: "Street food festival returns with over fifty cooks", body: "Expect suya, jollof, puff-puff and long queues." },
  { tag: "Tech", headline: "New budget phones bring bigger batteries to the market", body: "Reviewers say the cheaper models still last two days on a charge." },
  { tag: "Weather", headline: "Warm and humid all week, with a chance of evening thunderstorms", body: "Carry an umbrella and charge your phone before the storm." },
  { tag: "Money", headline: "Banks offer savings accounts with weekly interest", body: "Small savers can now earn a little every week, even with modest balances." },
  { tag: "Community", headline: "Residents club together to repair the street light", body: "Neighbours say the road feels safer at night already." },
];

export function newsFor(day: number): NewsItem[] {
  const out: NewsItem[] = [];
  const cut = powerCutOn(day);
  const clockLabel = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:00`;
  if (cut?.announced) out.push({ id: `cut_${day}`, tag: "Power", headline: `Power cut expected today, ${clockLabel(cut.startMinute)} to ${clockLabel(cut.endMinute)}`, body: "The power company says maintenance work is under way. Charge your devices before then, or keep a power bank handy." });
  if (groceryPromo(day)) out.push({ id: `promo_${day}`, tag: "Offer", headline: "Mega Mart: 15% off groceries today only", body: "Open LifeShop and order before midnight." });
  for (let i = 0; out.length < 4; i++) {
    const story = STORIES[Math.floor(hash(day * 13 + i) * STORIES.length)]!;
    if (!out.some((o) => o.headline === story.headline)) out.push({ id: `n_${day}_${i}`, ...story });
    if (i > 30) break;
  }
  return out;
}

export const PLACES: { name: string; kind: string; minutes: number; note: string }[] = [
  { name: "Home", kind: "You are here", minutes: 0, note: "Your flat." },
  { name: "Mama Ngozi's Kitchen", kind: "Food", minutes: 6, note: "Rice, stew and puff-puff. Open all day." },
  { name: "Mega Mart", kind: "Supermarket", minutes: 12, note: "Groceries and household items." },
  { name: "Phone Hub", kind: "Phones and chargers", minutes: 15, note: "New phones, chargers and power banks." },
  { name: "Community Library", kind: "Learning", minutes: 18, note: "Free books and quiet desks." },
  { name: "City Bank", kind: "Bank", minutes: 20, note: "LifePay branch." },
];
