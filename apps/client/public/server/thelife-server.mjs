// packages/server/src/index.ts
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

// packages/shared/src/net.ts
var PROTOCOL_VERSION = 2;
var MAX_NAME = 20;
var MAX_CHAT = 200;
var MAX_ROOM_PLAYERS = 50;
var KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
var finite = (v, limit = 1e6) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;
function parseClientMessage(raw) {
  let value = raw;
  if (typeof raw === "string") {
    if (raw.length > 6e3) return null;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const m = value;
  switch (m.t) {
    case "hello": {
      const name = typeof m.name === "string" ? cleanName(m.name) : "";
      if (!name) return null;
      if (typeof m.key !== "string" || !KEY_PATTERN.test(m.key)) return null;
      return { t: "hello", name, protocol: finite(m.protocol, 1e3) ? m.protocol : 0, look: typeof m.look === "string" ? cleanLook(m.look) : void 0, key: m.key };
    }
    case "create": {
      const p = m.profile;
      if (!p || typeof p !== "object") return null;
      const text = (v, max) => typeof v === "string" ? v.slice(0, max) : "";
      const traits = Array.isArray(p.traits) ? p.traits.filter((t) => typeof t === "string" && t.length <= 30).slice(0, 12) : [];
      const firstName = cleanName(text(p.firstName, 40));
      if (!firstName || !finite(p.startingMoney, 1e9)) return null;
      return {
        t: "create",
        profile: { backgroundId: text(p.backgroundId, 40), sex: p.sex === "female" ? "female" : "male", firstName: firstName.slice(0, 14), surname: cleanName(text(p.surname, 40)).slice(0, 14), hometown: text(p.hometown, 40), startingMoney: Math.round(p.startingMoney), traits }
      };
    }
    case "do": {
      if (!finite(m.id, 1e9) || typeof m.fn !== "string" || !/^[A-Za-z]{1,30}$/.test(m.fn) || !Array.isArray(m.args) || m.args.length > 6) return null;
      const args = [];
      for (const a of m.args) {
        if (typeof a === "string") args.push(a.slice(0, 400));
        else if (typeof a === "number" && Number.isFinite(a)) args.push(a);
        else if (typeof a === "boolean" || a === null) args.push(a);
        else return null;
      }
      return { t: "do", id: Math.floor(m.id), fn: m.fn, args };
    }
    case "move":
      if (!finite(m.x) || !finite(m.y, 500) || !finite(m.z) || !finite(m.yaw, 100) || !finite(m.level, 20)) return null;
      return { t: "move", x: m.x, y: m.y, z: m.z, yaw: m.yaw, clip: typeof m.clip === "string" ? m.clip.slice(0, 40) : "Idle_Loop", level: Math.max(0, Math.round(m.level)) };
    case "chat": {
      if (typeof m.text !== "string") return null;
      const text = m.text.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_CHAT);
      return text ? { t: "chat", text } : null;
    }
    case "pay":
      if (typeof m.to !== "string" || m.to.length > 40 || !finite(m.amount, 1e9)) return null;
      return { t: "pay", to: m.to, amount: Math.floor(m.amount) };
    case "ping":
      return finite(m.ts, 1e15) ? { t: "ping", ts: m.ts } : null;
    case "rtc":
      if (typeof m.to !== "string" || m.to.length > 40) return null;
      if (JSON.stringify(m.data ?? null).length > 3e3) return null;
      return { t: "rtc", to: m.to, data: m.data ?? null };
    default:
      return null;
  }
}
var LOOK_KEYS = ["body", "skinTone", "hair", "hairColor", "beard", "brows", "eyeColor", "top", "bottom", "shoes", "hood", "pauldrons", "outfitVariant", "topColor", "bottomColor", "shoesColor", "topFabric", "bottomFabric"];
function cleanLook(raw) {
  if (raw.length > 1200) return void 0;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return void 0;
  }
  if (!value || typeof value !== "object") return void 0;
  const out = {};
  for (const key of LOOK_KEYS) {
    const v = value[key];
    if (typeof v === "boolean" || v === null) out[key] = v;
    else if (typeof v === "string" && /^[\w-]{1,30}$/.test(v)) out[key] = v;
  }
  return Object.keys(out).length ? JSON.stringify(out) : void 0;
}
function cleanName(name) {
  return name.replace(/[^\p{L}\p{N} _.'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}

// packages/server/src/index.ts
import { join } from "node:path";

// packages/server/src/lives.ts
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// packages/game-core/src/types.ts
var NEED_IDS = ["hunger", "energy", "hygiene", "bladder", "fun"];
var DAY_MINUTES = 24 * 60;

// packages/game-core/src/ledger.ts
var PLAYER = "player";
var MINT = "mint";
var SINK = "sink";
function createLedger() {
  return { accounts: { [PLAYER]: 0, [MINT]: 0, [SINK]: 0 }, entries: [], nextId: 1 };
}
function balance(ledger, account = PLAYER) {
  return ledger.accounts[account] ?? 0;
}
function transfer(ledger, from, to, amount, reason, minute) {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) return { ok: false, reason: "Amount must be a positive whole number." };
  if (from === to) return { ok: false, reason: "Can't transfer to the same account." };
  if (from !== MINT && balance(ledger, from) < amount) return { ok: false, reason: "Not enough money." };
  ledger.accounts[from] = balance(ledger, from) - amount;
  ledger.accounts[to] = balance(ledger, to) + amount;
  ledger.entries.push({ id: ledger.nextId++, minute, from, to, amount, reason });
  if (ledger.entries.length > 300) ledger.entries.splice(0, ledger.entries.length - 300);
  return { ok: true };
}

// packages/game-core/src/needs.ts
var BASE_DECAY_PER_HOUR = { hunger: 4.2, energy: 3.6, hygiene: 2.2, bladder: 6.5, fun: 3 };
var MOOD_WEIGHTS = { hunger: 0.25, energy: 0.3, hygiene: 0.15, bladder: 0.1, fun: 0.2 };
var clampNeed = (value) => Math.max(0, Math.min(100, value));
function createNeeds() {
  return { hunger: 80, energy: 85, hygiene: 85, bladder: 90, fun: 70 };
}
function mood(needs) {
  let total = 0;
  for (const id of NEED_IDS) total += needs[id] * MOOD_WEIGHTS[id];
  return Math.round(total);
}
function performance(needs) {
  const base = 0.5 + mood(needs) / 100 * 0.7;
  const penalty = (needs.energy < 15 ? 0.15 : 0) + (needs.hunger < 10 ? 0.1 : 0) + (needs.hygiene < 15 ? 0.05 : 0);
  return Math.max(0.35, base - penalty);
}
function moodLabel(needs) {
  const m = mood(needs);
  if (m >= 80) return "Great";
  if (m >= 62) return "Good";
  if (m >= 45) return "Okay";
  if (m >= 28) return "Low";
  return "Miserable";
}

// packages/game-core/src/actions.ts
var ACTIONS = {
  snack: {
    id: "snack",
    label: "Grabbing a snack",
    pose: "stand",
    clip: "Life_Eat_Standing_Loop",
    minutes: 10,
    minutesPerSecond: 1,
    needs: { hunger: 25, fun: 3 },
    cost: { portions: 1 },
    blockedIf: { need: "hunger", atLeast: 92, message: "You're not hungry." }
  },
  cook: {
    id: "cook",
    label: "Cooking",
    pose: "stand",
    clip: "Life_Cook_Loop",
    minutes: 30,
    minutesPerSecond: 2,
    needs: { fun: 4, energy: -2, hygiene: -1 },
    cost: { portions: 2 },
    gives: { meals: 1 }
  },
  eatMeal: {
    id: "eatMeal",
    label: "Having a meal",
    pose: "seat",
    clip: "Life_Eat_Loop",
    minutes: 25,
    minutesPerSecond: 2,
    needs: { hunger: 65, fun: 5 },
    cost: { meals: 1 },
    blockedIf: { need: "hunger", atLeast: 92, message: "You're not hungry." }
  },
  tv: {
    id: "tv",
    label: "Watching TV",
    pose: "seat",
    clip: "Sitting_Idle_Loop",
    minutes: 60,
    minutesPerSecond: 3,
    needs: { fun: 32, energy: -2 }
  },
  work: {
    id: "work",
    label: "Working at the computer",
    pose: "seat",
    clip: "Life_Type_Loop",
    minutes: 120,
    minutesPerSecond: 4,
    needs: { energy: -14, fun: -10, hygiene: -2 },
    incomePerHour: 1200,
    skill: { id: "computer", xpPerHour: 5 },
    needsAtLeast: { need: "energy", atLeast: 15, message: "You're too tired to work. Get some rest first." }
  },
  sleep: {
    id: "sleep",
    label: "Sleeping",
    pose: "lie",
    clip: "Life_Sleep_Loop",
    minutes: 420,
    minutesPerSecond: 15,
    needs: { energy: 100 },
    decay: { energy: 0, hunger: 0.4, bladder: 0.3, hygiene: 0.3, fun: 0.2 },
    until: { need: "energy", atLeast: 100 },
    blockedIf: { need: "energy", atLeast: 85, message: "You're not tired enough to sleep." }
  },
  passout: {
    id: "passout",
    label: "Passed out from exhaustion",
    pose: "lie",
    clip: "Life_Sleep_Loop",
    minutes: 300,
    minutesPerSecond: 30,
    needs: { energy: 55 },
    decay: { energy: 0, hunger: 0.6, bladder: 0.4, hygiene: 0.4, fun: 0.4 },
    until: { need: "energy", atLeast: 45 }
  },
  sit: {
    id: "sit",
    label: "Sitting",
    pose: "seat",
    clip: "Sitting_Idle_Loop",
    minutes: 30,
    minutesPerSecond: 3,
    needs: { energy: 6, fun: 2 }
  },
  toilet: {
    id: "toilet",
    label: "Using the toilet",
    pose: "seat",
    clip: "Sitting_Idle_Loop",
    minutes: 6,
    minutesPerSecond: 1,
    needs: { bladder: 100, hygiene: -2 },
    blockedIf: { need: "bladder", atLeast: 75, message: "You don't need the toilet yet." }
  },
  shower: {
    id: "shower",
    label: "Showering",
    pose: "stand",
    clip: "Life_Wash_Loop",
    minutes: 15,
    minutesPerSecond: 1.5,
    needs: { hygiene: 100, energy: 2, fun: 3 },
    blockedIf: { need: "hygiene", atLeast: 90, message: "You're already clean." }
  },
  brush: {
    id: "brush",
    label: "Brushing teeth",
    pose: "stand",
    clip: "Life_Brush_Loop",
    minutes: 3,
    minutesPerSecond: 1,
    needs: { hygiene: 8, fun: 1 }
  },
  radio: {
    id: "radio",
    label: "Dancing to the radio",
    pose: "stand",
    clip: "Dance_Loop",
    minutes: 30,
    minutesPerSecond: 2,
    needs: { fun: 16 }
  },
  read: {
    id: "read",
    label: "Reading",
    pose: "stand",
    clip: "Life_Read_Loop",
    minutes: 45,
    minutesPerSecond: 3,
    needs: { fun: 20, energy: -2 },
    skill: { id: "knowledge", xpPerHour: 6 }
  }
};
var ECONOMY = {
  startingMoney: 12e3,
  groceriesPrice: 1800,
  groceriesPortions: 6,
  rentPerWeek: 14e3,
  rentDay: 7,
  // charged on every 7th day at 08:00
  rentHour: 8,
  lateFee: 1e3
};
function skillLevel(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 8));
}
function skillPayMultiplier(xp) {
  return 1 + 0.08 * skillLevel(xp);
}

// packages/game-core/src/phoneContent.ts
function seeded(...parts) {
  let h = 2166136261;
  for (const p of parts) {
    h ^= Math.floor(p) + 2654435769;
    h = Math.imul(h ^ h >>> 15, 2246822507);
    h = Math.imul(h ^ h >>> 13, 3266489909);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}
var STOCKS = [
  { symbol: "LAGB", name: "Lagoon Bank", base: 42, wave: 0.11, phase: 0.4 },
  { symbol: "NAIJ", name: "NaijaTel", base: 210, wave: 0.07, phase: 1.7 },
  { symbol: "SUNP", name: "SunPower Energy", base: 95, wave: 0.16, phase: 2.9 },
  { symbol: "MEGA", name: "Mega Mart Group", base: 64, wave: 0.09, phase: 4.1 },
  { symbol: "CEMT", name: "Delta Cement", base: 310, wave: 0.06, phase: 5.2 },
  { symbol: "TECH", name: "Alexion Tech", base: 28, wave: 0.22, phase: 0.9 }
];
function stockPrice(symbol, day) {
  const s = STOCKS.find((x) => x.symbol === symbol);
  if (!s) return 0;
  const trend = 1 + 9e-4 * day;
  const move = 1 + s.wave * Math.sin(day * 0.31 + s.phase) + s.wave / 2 * Math.sin(day * 1.13 + s.phase * 2);
  return Math.max(1, Math.round(s.base * trend * move * 100) / 100);
}
var FILMS = [
  { id: "f1", title: "Lagos Midnight", genre: "Thriller", mins: 112, price: 3500 },
  { id: "f2", title: "The Last Danfo", genre: "Comedy", mins: 98, price: 3e3 },
  { id: "f3", title: "Harmattan Heart", genre: "Romance", mins: 105, price: 3500 },
  { id: "f4", title: "Naija Heroes", genre: "Action", mins: 120, price: 4e3 },
  { id: "f5", title: "Mama's Kitchen", genre: "Family", mins: 92, price: 2500 }
];
function filmsFor(day) {
  return FILMS.filter((_, i) => seeded(day, i, 41) > 0.25).slice(0, 4);
}
var EVENT_POOL = [
  { title: "Open-air Afrobeats night", place: "City stadium", price: 5e3 },
  { title: "Weekend food market", place: "Central market", price: 0 },
  { title: "Tech meetup: build something", place: "Community hub", price: 0 },
  { title: "Church thanksgiving service", place: "Grace Chapel", price: 0 },
  { title: "Comedy night", place: "Hotel ballroom", price: 4e3 },
  { title: "Football: derby day", place: "City stadium", price: 2500 },
  { title: "Art and craft fair", place: "Park lawn", price: 500 },
  { title: "Job fair", place: "Convention centre", price: 0 }
];
function eventsFor(day) {
  return EVENT_POOL.filter((_, i) => seeded(day, i, 51) > 0.45).slice(0, 4).map((e, i) => ({ ...e, id: `ev_${day}_${i}`, inDays: Math.floor(seeded(day, i, 52) * 6) }));
}
var COURSES = [
  { id: "basic_computer", title: "Computer basics", skill: "computer", lessons: ["Files and folders", "Typing and documents", "Spreadsheets for beginners"] },
  { id: "web_dev", title: "Build your first website", skill: "computer", lessons: ["HTML", "CSS", "A little JavaScript", "Publish it"] },
  { id: "money_skills", title: "Money skills", skill: "knowledge", lessons: ["Budgeting", "Saving habits", "Avoiding bad loans"] },
  { id: "english", title: "Professional English", skill: "knowledge", lessons: ["Emails", "Interviews", "Presentations"] },
  { id: "business", title: "Start a small business", skill: "knowledge", lessons: ["Find a need", "Price and profit", "Customers", "Keep records"] }
];
var LESSON_XP = 40;
var LESSON_GAP_MINUTES = 45;
var EATS_MENU = [
  { id: "eats_jollof", name: "Jollof rice and chicken", blurb: "Party jollof, fried plantain", price: 3200, meals: 1, minutes: 35 },
  { id: "eats_suya", name: "Suya platter", blurb: "Spicy beef, onions, yaji", price: 2500, meals: 1, minutes: 30 },
  { id: "eats_amala", name: "Amala and ewedu", blurb: "With gbegiri and assorted meat", price: 2800, meals: 1, minutes: 40 },
  { id: "eats_pounded", name: "Pounded yam and egusi", blurb: "Big bowl, enough for two meals", price: 4800, meals: 2, minutes: 45 },
  { id: "eats_pepper", name: "Pepper soup", blurb: "Catfish, hot and light", price: 3500, meals: 1, minutes: 35 },
  { id: "eats_family", name: "Family tray", blurb: "Rice, stew, chicken, salad for four", price: 9500, meals: 4, minutes: 50 }
];
function mealById(id) {
  return EATS_MENU.find((m) => m.id === id);
}
var DIARY_MOODS = [
  { id: 1, label: "Rough" },
  { id: 2, label: "Low" },
  { id: 3, label: "Okay" },
  { id: 4, label: "Good" },
  { id: 5, label: "Great" }
];
var WORDS = ["MANGO", "RICES", "STEAM", "CHAIR", "LIGHT", "PLANT", "MONEY", "DANCE", "HAPPY", "BREAD", "SMILE", "RIVER", "TRAIN", "PHONE", "HOUSE", "FLOUR", "SUGAR", "BEANS", "FRUIT", "TOWEL", "STORE", "MARKET"].filter((w) => w.length === 5 && w !== "RICES");
var GIGS = [
  { id: "g1", title: "Transcribe a short audio", blurb: "Type what you hear. 30 minutes of work.", pay: 1200, energy: 8 },
  { id: "g2", title: "Deliver a parcel nearby", blurb: "Quick errand across the street.", pay: 1500, energy: 12 },
  { id: "g3", title: "Tutor a student", blurb: "One hour of maths help.", pay: 2500, energy: 14 },
  { id: "g4", title: "Help a stall set up", blurb: "Carry boxes for the market lady.", pay: 2e3, energy: 18 },
  { id: "g5", title: "Design a flyer", blurb: "A quick poster for a church event.", pay: 3e3, energy: 12 }
];
var GIG_GAP_MINUTES = 90;
var WORKOUTS = [
  { id: "w1", name: "Brisk walk", blurb: "20 minutes around the compound", energy: 4, fun: 6, hunger: 3, hygiene: 2 },
  { id: "w2", name: "Skipping", blurb: "A 10-minute rope session", energy: 8, fun: 8, hunger: 5, hygiene: 6 },
  { id: "w3", name: "Home circuit", blurb: "Push-ups, squats and planks", energy: 12, fun: 10, hunger: 7, hygiene: 10 }
];
var WORKOUT_GAP_MINUTES = 120;
var WATER_GOAL = 8;
var FOCUS_XP = 12;

// packages/game-core/src/phoneData.ts
var PHONE_MODELS = {
  basic: {
    tier: "basic",
    name: "LifePhone Go",
    tagline: "Simple. Tough. Lasts.",
    price: 45e3,
    ports: ["micro"],
    maxCharge: 25,
    screenHours: 9,
    standbyHours: 72,
    apps: ["chat", "pay", "shop", "news", "settings", "store"],
    banking: false,
    screen: "LCD 60Hz",
    slowness: 1.5,
    startBattery: 70
  },
  mid: {
    tier: "mid",
    name: "LifePhone Plus",
    tagline: "Everything you need.",
    price: 15e4,
    ports: ["usbc"],
    maxCharge: 60,
    screenHours: 7,
    standbyHours: 48,
    apps: ["chat", "pay", "shop", "news", "jobs", "maps", "settings", "store"],
    banking: true,
    screen: "AMOLED 90Hz",
    slowness: 1,
    startBattery: 85
  },
  flagship: {
    tier: "flagship",
    name: "LifePhone Max",
    tagline: "The one everyone notices.",
    price: 48e4,
    ports: ["lifelink", "usbc"],
    maxCharge: 150,
    screenHours: 6,
    standbyHours: 36,
    apps: ["chat", "pay", "shop", "news", "jobs", "maps", "settings", "store"],
    banking: true,
    screen: "AMOLED 120Hz",
    slowness: 0.7,
    startBattery: 100
  }
};
var APP_INFO = {
  chat: { name: "LifeChat", blurb: "Messages and calls", dataMB: 3 },
  pay: { name: "LifePay", blurb: "Bank and wallet", dataMB: 0 },
  // works over USSD, no data needed
  shop: { name: "LifeShop", blurb: "Shopping and delivery", dataMB: 8 },
  jobs: { name: "LifeJobs", blurb: "Gigs and jobs", dataMB: 6 },
  news: { name: "LifeNews", blurb: "Headlines and alerts", dataMB: 12 },
  maps: { name: "LifeMaps", blurb: "Around you", dataMB: 20 },
  settings: { name: "Settings", blurb: "Wi-Fi, data, storage", dataMB: 0 },
  store: { name: "LifeStore", blurb: "Download apps", dataMB: 2 }
};
var CHARGERS = [
  { id: "charger_micro", name: "Basic charger (micro)", ports: ["micro"], rate: 25, price: 2500 },
  { id: "charger_usbc", name: "USB-C charger", ports: ["usbc"], rate: 55, price: 6e3 },
  { id: "charger_multi", name: "Multi-tip charger", ports: ["micro", "usbc"], rate: 40, price: 7500 },
  { id: "charger_lifelink", name: "LifeLink fast charger", ports: ["lifelink", "usbc"], rate: 150, price: 22e3 }
];
var POWER_BANK = { id: "powerbank", name: "Power bank 10,000mAh", price: 12e3, capacity: 120, outRate: 50, inRate: 20 };
function chargerById(id) {
  return CHARGERS.find((c) => c.id === id);
}
function startingCharger(tier) {
  return tier === "basic" ? "charger_micro" : tier === "mid" ? "charger_usbc" : "charger_lifelink";
}
var SHOP_ITEMS = [
  { id: "groc_small", name: "Groceries", blurb: "6 portions of food", kind: "grocery", price: 1800, deliveryMinutes: 30, amount: 6 },
  { id: "groc_big", name: "Family pack", blurb: "14 portions of food", kind: "grocery", price: 3900, deliveryMinutes: 45, amount: 14 },
  ...CHARGERS.map((c) => ({ id: c.id, name: c.name, blurb: `Fits ${c.ports.join(" / ")} \xB7 ${c.rate}% per hour`, kind: "charger", price: c.price, deliveryMinutes: 60 })),
  { id: POWER_BANK.id, name: POWER_BANK.name, blurb: "Charge anywhere, even in a power cut", kind: "powerbank", price: POWER_BANK.price, deliveryMinutes: 90 },
  { id: "phone_basic", name: "LifePhone Go", blurb: "Micro-USB \xB7 LCD \xB7 battery for days", kind: "phone", price: PHONE_MODELS.basic.price, deliveryMinutes: 240, tier: "basic" },
  { id: "phone_mid", name: "LifePhone Plus", blurb: "USB-C \xB7 AMOLED 90Hz \xB7 jobs and maps", kind: "phone", price: PHONE_MODELS.mid.price, deliveryMinutes: 240, tier: "mid" },
  { id: "phone_flagship", name: "LifePhone Max", blurb: "LifeLink fast charge \xB7 AMOLED 120Hz", kind: "phone", price: PHONE_MODELS.flagship.price, deliveryMinutes: 240, tier: "flagship" }
];
var TOPUPS = [
  { id: "airtime_500", name: "\u20A6500 airtime", blurb: "About 25 minutes of calls", kind: "airtime", price: 500, deliveryMinutes: 0, amount: 500 },
  { id: "airtime_1000", name: "\u20A61,000 airtime", blurb: "About 50 minutes of calls", kind: "airtime", price: 1e3, deliveryMinutes: 0, amount: 1e3 },
  { id: "data_1gb", name: "1 GB data", blurb: "Around 100 app visits", kind: "data", price: 1e3, deliveryMinutes: 0, amount: 1024 },
  { id: "data_3gb", name: "3 GB data", blurb: "Better value", kind: "data", price: 2500, deliveryMinutes: 0, amount: 3072 }
];
var AIRTIME_PER_CALL_MINUTE = 20;
var DELIVERY_FEE = 500;
var FREE_DELIVERY_OVER = 1e4;
function shopItemById(id) {
  const found = SHOP_ITEMS.find((i) => i.id === id) ?? TOPUPS.find((i) => i.id === id);
  if (found) return found;
  const meal = mealById(id);
  return meal ? { id: meal.id, name: meal.name, blurb: meal.blurb, kind: "meal", price: meal.price, deliveryMinutes: meal.minutes, amount: meal.meals } : void 0;
}
function contactsFor(profile) {
  const family = profile?.tier === "nepo" ? profile.allowanceFrom || "Daddy" : "Mum";
  const list = [
    { id: "family", name: family, role: "Family", receivesMoney: true, callable: true, talks: true },
    { id: "kola", name: "Kola", role: "Friend", receivesMoney: true, callable: true, talks: true }
  ];
  if (profile?.tier !== "nepo") list.push({ id: "landlord", name: "Landlord", role: "Your landlord", receivesMoney: false, callable: true, talks: true });
  list.push({ id: "lifepay", name: "LifePay", role: "Bank alerts", receivesMoney: false, callable: false, talks: false });
  list.push({ id: "lifejobs", name: "LifeJobs", role: "Job alerts", receivesMoney: false, callable: false, talks: false });
  return list;
}
var BEATS = [
  {
    id: "family_welcome",
    contact: "family",
    day: 1,
    hour: 9,
    tiers: ["lapo", "middle"],
    text: "Good morning {name}! Have you settled in? Eat something o, don't just work.",
    options: [{ label: "Yes Mum, I'm fine", reply: "Good. Call me tonight, okay?", fun: 3 }, { label: "Can you send some money?", reply: "Ah. Things are tight here too. Manage small small, I believe in you." }]
  },
  {
    id: "family_welcome_nepo",
    contact: "family",
    day: 1,
    hour: 9,
    tiers: ["nepo"],
    text: "Morning {name}. The allowance comes on Sunday. Please don't spend it all in one place.",
    options: [{ label: "Thank you!", reply: "Behave yourself.", fun: 3 }, { label: "Can it be more?", reply: "We will see how you do this month." }]
  },
  {
    id: "landlord_welcome",
    contact: "landlord",
    day: 1,
    hour: 12,
    tiers: ["lapo", "middle"],
    text: "Welcome. Rent is {rent} every 7th day at 8am. You can pay from LifePay. Late payment has a fee.",
    options: [{ label: "Understood, thank you", reply: "Good. Keep the compound clean." }]
  },
  {
    id: "kola_hello",
    contact: "kola",
    day: 1,
    hour: 15,
    text: "Guy! You don land? Make we link up soon. How the new place?",
    options: [{ label: "Come over, I'll cook", reply: "I dey come! Make you cook well well o.", fun: 4 }, { label: "Busy today, later", reply: "No wahala, I go find you." }]
  },
  { id: "jobs_hello", contact: "lifejobs", day: 2, hour: 11, text: "Welcome to LifeJobs. New gigs near you are in the app." },
  {
    id: "kola_borrow",
    contact: "kola",
    day: 2,
    hour: 19,
    text: "Abeg {name}, can you lend me \u20A62,000? I'll send \u20A62,200 back by Friday. Promise.",
    options: [{ label: "Send \u20A62,000", reply: "God bless you! I will pay you back.", send: 2e3, repay: { days: 3, amount: 2200 } }, { label: "Sorry, I'm broke", reply: "Ah no wahala, I understand." }]
  },
  {
    id: "family_eat",
    contact: "family",
    day: 3,
    hour: 10,
    text: "Did you eat today? Don't skip meals, your health is your wealth.",
    options: [{ label: "Yes, I did!", reply: "Good child.", fun: 3 }, { label: "Not yet, going to now", reply: "Go and eat! I'm waiting here." }]
  },
  {
    id: "kola_weekend",
    contact: "kola",
    day: 5,
    hour: 20,
    text: "There's a small show this weekend. You go join? It will be fun.",
    options: [{ label: "Maybe next time", reply: "Alright. Rest well." }, { label: "Count me in", reply: "Great! I'll text you the details.", fun: 6 }]
  },
  {
    id: "family_checkin",
    contact: "family",
    day: 8,
    hour: 18,
    text: "How is the week going, {name}? Remember to save a little every week.",
    options: [{ label: "I'm trying, Mum", reply: "That's all I ask.", fun: 2 }, { label: "Money is hard", reply: "It always is at first. Keep going." }]
  }
];
var JOBS = [
  { id: "data_entry", title: "Remote data entry", employer: "Tolu & Sons Ltd", blurb: "Type up records from home.", retainer: 6e3, payBoost: 1.1, requires: { skill: "computer", level: 0 } },
  { id: "chat_support", title: "Chat support agent", employer: "Zest Telecom", blurb: "Answer customers on a headset.", retainer: 11e3, payBoost: 1, requires: { skill: "knowledge", level: 2 } },
  { id: "virtual_assistant", title: "Virtual assistant", employer: "BrightPath Agency", blurb: "Inbox, calendar and spreadsheets.", retainer: 9e3, payBoost: 1.2, requires: { skill: "computer", level: 2 } },
  { id: "junior_dev", title: "Junior web developer", employer: "Kubo Labs", blurb: "Build and fix pages for clients.", retainer: 22e3, payBoost: 1.45, requires: { skill: "computer", level: 4 } }
];
var JOB_DECISION_MINUTES = 12 * 60;
function hash(n) {
  let x = n + 2654435769 | 0;
  x = Math.imul(x ^ x >>> 16, 2246822507);
  x = Math.imul(x ^ x >>> 13, 3266489909);
  return ((x ^ x >>> 16) >>> 0) / 4294967296;
}
function powerCutOn(day) {
  if (hash(day * 7 + 1) > 0.45) return null;
  const startHour = 9 + Math.floor(hash(day * 7 + 2) * 12);
  const hours = 2 + Math.floor(hash(day * 7 + 3) * 4);
  const base = (day - 1) * 24 * 60;
  return { startMinute: base + startHour * 60, endMinute: base + (startHour + hours) * 60, announced: hash(day * 7 + 4) < 0.6 };
}
function isPowerCut(minute) {
  const day = Math.floor(minute / 1440) + 1;
  for (const d of [day - 1, day]) {
    const cut = d >= 1 ? powerCutOn(d) : null;
    if (cut && minute >= cut.startMinute && minute < cut.endMinute) return true;
  }
  return false;
}
function groceryPromo(day) {
  return hash(day * 11 + 5) < 0.2;
}

// packages/game-core/src/phoneStoreData.ts
var TIER_ORDER = ["basic", "mid", "flagship"];
var tierAtLeast = (have, need) => TIER_ORDER.indexOf(have) >= TIER_ORDER.indexOf(need);
var app = (id, name, blurb, category, sizeMB, price, minTier, dataMB, funPerMin, icon, from, to) => ({ id, name, blurb, category, sizeMB, price, minTier, dataMB, funPerMin, icon, from, to });
var STORE_APPS = [
  // tools
  app("notes", "LifeNotes", "Write things down", "tools", 4, 0, "basic", 0, 0, "note", "#ffd75e", "#e8a417"),
  app("calendar", "LifeCal", "Dates, rent day and events", "tools", 6, 0, "basic", 0, 0, "calendar", "#ff8a80", "#e2453c"),
  app("weather", "LifeWeather", "Rain or shine, 5 days ahead", "tools", 9, 0, "basic", 1, 0, "cloud", "#74c0fc", "#2f80d0"),
  app("torch", "Torch", "Light for a power cut", "tools", 2, 0, "basic", 0, 0, "torch", "#fff3a0", "#f0b429"),
  app("calc", "Calculator", "Sums, quickly", "tools", 3, 0, "basic", 0, 0, "calc", "#8a94a6", "#4a5568"),
  app("clock", "LifeClock", "World time, timer, stopwatch", "tools", 5, 0, "basic", 0, 0, "clock", "#9aa6ff", "#4c5bd4"),
  app("translate", "Translate", "Yoruba, Igbo, Hausa and Pidgin", "tools", 18, 0, "basic", 0, 0, "translate", "#63e6be", "#12a37a"),
  app("currency", "Naira Rates", "Dollar, pound and euro today", "tools", 7, 0, "basic", 1, 0, "swap", "#69db7c", "#2f9e44"),
  app("netcheck", "NetCheck", "Your connection and data use", "tools", 6, 0, "basic", 1, 0, "signal", "#4dabf7", "#1864ab"),
  // social
  app("gram", "LifeGram", "Photos from friends and strangers", "social", 180, 0, "basic", 4, 0.35, "photo", "#f783ac", "#c2255c"),
  app("chirp", "Chirp", "Short posts, loud opinions", "social", 70, 0, "basic", 3, 0.3, "bird", "#66d9e8", "#0c8599"),
  app("match", "Spark", "Meet someone new", "social", 85, 0, "mid", 4, 0.3, "heart", "#ff8787", "#e03131"),
  // media
  app("tube", "LifeTube", "Videos that eat your data", "media", 260, 0, "basic", 25, 0.5, "play", "#ff6b6b", "#c92a2a"),
  app("tunes", "LifeTunes", "Afrobeats and everything else", "media", 140, 0, "basic", 6, 0.4, "music", "#da77f2", "#9c36b5"),
  app("radio", "NaijaFM", "Live radio, light on data", "media", 24, 0, "basic", 4, 0.25, "radio", "#ffa94d", "#e8590c"),
  app("cinema", "Cinema+", "What is showing, and tickets", "media", 90, 0, "basic", 3, 0.2, "film", "#b197fc", "#6741d9"),
  app("events", "EventsNG", "Concerts, markets, church and more", "media", 38, 0, "basic", 3, 0.15, "ticket", "#ffc078", "#d9480f"),
  // life
  app("eats", "LifeEats", "Hot food delivered", "life", 60, 0, "basic", 4, 0, "food", "#ff922b", "#d9480f"),
  app("invest", "LifeInvest", "Buy and sell shares", "life", 48, 0, "mid", 2, 0, "chart", "#38d9a9", "#087f5b"),
  app("ajo", "Ajo", "Save with a group, get paid in turn", "life", 22, 0, "basic", 1, 0, "people", "#8ce99a", "#2b8a3e"),
  app("learn", "LifeLearn", "Short courses that build skills", "life", 220, 2e3, "basic", 6, 0, "book", "#74c0fc", "#1c7ed6"),
  app("health", "LifeHealth", "Everyday health advice", "life", 30, 0, "basic", 1, 0, "cross", "#ff8787", "#c92a2a"),
  app("faith", "Faith", "Daily verse and prayer times", "life", 20, 0, "basic", 0, 0.1, "faith", "#e5dbff", "#7048e8"),
  app("sleep", "SleepLog", "How rested are you", "life", 10, 1500, "basic", 0, 0, "moon", "#5c7cfa", "#364fc7"),
  app("diary", "Diary", "One line a day, how you feel", "life", 6, 0, "basic", 0, 0.1, "pen", "#ffe066", "#f08c00"),
  // games
  app("snake", "Snake", "The classic", "games", 38, 0, "basic", 0, 0, "game", "#a9e34b", "#5c940d"),
  app("g2048", "2048", "Slide and merge", "games", 25, 0, "basic", 0, 0, "grid", "#ffd43b", "#e67700"),
  app("xo", "Tic Tac", "Beat the phone", "games", 6, 0, "basic", 0, 0, "xo", "#ff8787", "#e03131"),
  app("memory", "Match Pairs", "Remember where they are", "games", 18, 500, "basic", 0, 0, "cards", "#faa2c1", "#d6336c"),
  app("trivia", "Naija Quiz", "How well do you know home", "games", 30, 800, "basic", 1, 0, "quiz", "#66d9e8", "#1098ad"),
  // more tools
  app("convert", "UnitConvert", "Distance, weight, temperature", "tools", 5, 0, "basic", 0, 0, "ruler", "#91a7ff", "#3b5bdb"),
  app("split", "Split It", "Share a bill fairly", "tools", 4, 0, "basic", 0, 0, "split", "#63e6be", "#0ca678"),
  app("todo", "Reminders", "A to-do list that nags", "tools", 5, 0, "basic", 0, 0, "todo", "#ffa8a8", "#fa5252"),
  app("budget", "Budget", "Where your money went", "tools", 12, 0, "basic", 0, 0, "wallet", "#8ce99a", "#2f9e44"),
  app("dice", "Dice", "Roll one to six dice", "tools", 3, 0, "basic", 0, 0, "dice", "#ced4da", "#495057"),
  app("focus", "Focus", "Five minutes of no distractions", "tools", 5, 0, "basic", 0, 0, "target", "#ff8787", "#c92a2a"),
  app("water", "Hydrate", "Drink eight glasses a day", "tools", 4, 0, "basic", 0, 0, "drop", "#74c0fc", "#1971c2"),
  // more media
  app("books", "LifeReads", "Short stories to read offline", "media", 60, 0, "basic", 0, 0.2, "bookopen", "#ffc078", "#e67700"),
  app("podcasts", "Podcasts", "Talk shows on demand", "media", 90, 0, "basic", 8, 0.3, "mic", "#d0bfff", "#7048e8"),
  app("nolly", "NollyPlay", "Rent a film, watch anywhere", "media", 150, 0, "mid", 3, 0, "play", "#ffa94d", "#d9480f"),
  // more life
  app("recipes", "Naija Kitchen", "Recipes and cooking tips", "life", 35, 0, "basic", 0, 0.1, "pot", "#ffd43b", "#e8590c"),
  app("fit", "FitLife", "Short workouts at home", "life", 28, 0, "basic", 0, 0, "dumbbell", "#69db7c", "#2b8a3e"),
  app("bills", "LifeBills", "Pay rent, power and water", "life", 20, 0, "basic", 1, 0, "receipt", "#74c0fc", "#1864ab"),
  app("fuel", "FuelWatch", "Petrol, diesel and gas prices", "life", 8, 0, "basic", 1, 0, "fuel", "#ffa8a8", "#c92a2a"),
  app("gigs", "QuickGigs", "Small jobs for quick cash", "life", 40, 0, "basic", 2, 0, "briefcase", "#4dabf7", "#1971c2"),
  // more games
  app("hangman", "Hangman", "Guess the word", "games", 8, 0, "basic", 0, 0, "hang", "#e599f7", "#ae3ec9"),
  app("connect4", "Four in a Row", "Beat the phone", "games", 14, 0, "basic", 0, 0, "dots", "#ffd43b", "#f08c00"),
  app("wordguess", "Word Guess", "A new five-letter word each day", "games", 20, 0, "basic", 0, 0, "word", "#8ce99a", "#2f9e44"),
  app("minesweeper", "Minesweeper", "Don't step on one", "games", 16, 0, "mid", 0, 0, "mine", "#ced4da", "#495057"),
  app("reaction", "Tap Speed", "How fast are your thumbs", "games", 6, 0, "basic", 0, 0, "bolt", "#ffe066", "#e67700")
];
var STORE_IDS = new Set(STORE_APPS.map((a) => a.id));
function storeAppById(id) {
  return STORE_APPS.find((a) => a.id === id);
}
var STORAGE_MB = { basic: 1200, mid: 6e3, flagship: 24e3 };
var MOBILE_SPEED = { basic: 6, mid: 24, flagship: 60 };
var HOME_PLANS = [
  { id: "wifi_basic", name: "Home Wi-Fi Basic", blurb: "Fine for most things \xB7 30 days", price: 8e3, days: 30, speed: 45 },
  { id: "wifi_fast", name: "Home Wi-Fi Fast", blurb: "Fibre speed \xB7 30 days", price: 18e3, days: 30, speed: 160 }
];
function homePlanById(id) {
  return HOME_PLANS.find((p) => p.id === id);
}

// packages/game-core/src/phoneStore.ts
var fail = (reason) => ({ ok: false, reason });
var done = (text) => ({ ok: true, text });
var dayOf = (state) => Math.floor(state.minute / DAY_MINUTES) + 1;
var weekOf = (state) => Math.floor(state.minute / (DAY_MINUTES * 7));
function homeWifiWorks(state) {
  const p = state.phone;
  return !!p.homeNet && p.homeNet.until > state.minute && wallPower(state);
}
function connection(state) {
  const p = state.phone;
  if (p.wifiOn && homeWifiWorks(state)) {
    const plan = homePlanById(p.homeNet.plan);
    return { kind: "wifi", speed: plan?.speed ?? 45, label: "Wi-Fi" };
  }
  if (p.mobileOn && p.dataMB > 0) return { kind: "data", speed: MOBILE_SPEED[p.model], label: p.model === "basic" ? "3G" : "4G" };
  return { kind: "none", speed: 0, label: p.mobileOn ? "No data" : "Offline" };
}
function setWifi(state, on) {
  state.phone.wifiOn = on;
  return done(on ? "Wi-Fi on." : "Wi-Fi off.");
}
function setMobileData(state, on) {
  state.phone.mobileOn = on;
  return done(on ? "Mobile data on." : "Mobile data off.");
}
function buyHomePlan(state, planId) {
  const plan = homePlanById(planId);
  if (!plan) return fail("Unknown plan.");
  const p = state.phone;
  const price = plan.price;
  const r = transfer(state.ledger, PLAYER, SINK, price, plan.name, state.minute);
  if (!r.ok) return fail(`That costs \u20A6${price.toLocaleString()}. You don't have enough.`);
  state.stats.totalSpent += price;
  const from = p.homeNet && p.homeNet.until > state.minute ? p.homeNet.until : state.minute;
  p.homeNet = { plan: plan.id, until: from + plan.days * DAY_MINUTES };
  p.wifiOn = true;
  return done(`${plan.name} is active for ${plan.days} days.`);
}
function storageTotalMB(state) {
  return STORAGE_MB[state.phone.model];
}
function startDownload(state, id) {
  const p = state.phone;
  const app2 = storeAppById(id);
  if (!app2) return fail("That app isn't in the store.");
  if (isDead(p)) return fail("The battery is empty.");
  if (p.installed.includes(id)) return fail(`${app2.name} is already installed.`);
  if (p.downloads.some((d) => d.appId === id)) return fail(`${app2.name} is already downloading.`);
  if (!tierAtLeast(p.model, app2.minTier)) return fail(`${app2.name} needs a better phone than the ${modelOf(p).name}.`);
  if (p.downloads.length >= 4) return fail("Too many downloads at once. Wait for one to finish.");
  const queued = p.downloads.reduce((sum, d) => sum + (storeAppById(d.appId)?.sizeMB ?? 0), 0);
  const installed = p.installed.reduce((sum, a) => sum + (storeAppById(a)?.sizeMB ?? 0), 0);
  if (installed + queued + app2.sizeMB > storageTotalMB(state)) {
    return fail(`Not enough space. ${app2.name} needs ${app2.sizeMB} MB. Delete an app in Settings \u2192 Storage.`);
  }
  if (connection(state).kind === "none") return fail("No connection. Turn on Wi-Fi, or buy data in LifePay.");
  if (app2.price > 0) {
    const r = transfer(state.ledger, PLAYER, SINK, app2.price, `LifeStore: ${app2.name}`, state.minute);
    if (!r.ok) return fail(`${app2.name} costs \u20A6${app2.price.toLocaleString()}. You don't have enough.`);
    state.stats.totalSpent += app2.price;
  }
  p.downloads.push({ appId: id, doneMB: 0, paused: false });
  return done(`Downloading ${app2.name}\u2026`);
}
function cancelDownload(state, id) {
  const p = state.phone;
  const before = p.downloads.length;
  p.downloads = p.downloads.filter((d) => d.appId !== id);
  return p.downloads.length < before ? done("Download cancelled.") : fail("That isn't downloading.");
}
function uninstallApp(state, id) {
  const p = state.phone;
  if (!p.installed.includes(id)) return fail("That app isn't installed.");
  p.installed = p.installed.filter((a) => a !== id);
  return done(`${storeAppById(id)?.name ?? "App"} removed.`);
}
function tickDownloads(state, minutes) {
  const p = state.phone;
  if (!p.downloads.length || isDead(p)) return;
  let left = minutes;
  while (left > 1e-9 && p.downloads.length) {
    const d = p.downloads[0];
    const app2 = storeAppById(d.appId);
    if (!app2) {
      p.downloads.shift();
      continue;
    }
    const link = connection(state);
    if (link.kind === "none") {
      if (!d.paused) {
        d.paused = true;
        notify(state, "store", "Download paused", `${app2.name} is waiting for a connection.`);
      }
      return;
    }
    d.paused = false;
    const wanted = Math.min(app2.sizeMB - d.doneMB, link.speed * left);
    const got = link.kind === "data" ? Math.min(wanted, p.dataMB) : wanted;
    if (link.kind === "data") p.dataMB -= got;
    d.doneMB += got;
    left -= link.speed > 0 ? got / link.speed : left;
    if (d.doneMB >= app2.sizeMB - 1e-6) {
      p.downloads.shift();
      p.installed.push(app2.id);
      notify(state, "store", "App installed", `${app2.name} is ready to open.`);
    } else if (got < wanted - 1e-9) {
      continue;
    }
  }
}
function addFun(state, amount) {
  state.needs.fun = Math.max(0, Math.min(100, state.needs.fun + amount));
}
function useApp(state, id, minutes) {
  const app2 = storeAppById(id);
  if (app2 && app2.funPerMin > 0) addFun(state, app2.funPerMin * minutes);
}
function addNote(state, text) {
  const t = text.trim().slice(0, 400);
  if (!t) return fail("Write something first.");
  if (state.phone.notes.length >= 40) return fail("Too many notes. Delete one.");
  state.phone.notes.unshift(t);
  return done("Saved.");
}
function deleteNote(state, index) {
  if (index < 0 || index >= state.phone.notes.length) return fail("No such note.");
  state.phone.notes.splice(index, 1);
  return done("Deleted.");
}
function recordScore(state, game, score) {
  const s = Math.max(0, Math.floor(score));
  const best = state.phone.scores[game] ?? 0;
  addFun(state, Math.min(8, 1 + s / 40));
  if (s > best) {
    state.phone.scores[game] = s;
    return done(`New best: ${s}!`);
  }
  return done();
}
var TRADE_FEE = 0.01;
function buyShares(state, symbol, qty) {
  if (!STOCKS.some((s) => s.symbol === symbol)) return fail("Unknown share.");
  const n = Math.floor(qty);
  if (!(n > 0) || n > 1e4) return fail("Enter a number of shares.");
  const cost = Math.round(stockPrice(symbol, dayOf(state)) * n * (1 + TRADE_FEE));
  const r = transfer(state.ledger, PLAYER, SINK, cost, `Shares: ${symbol}`, state.minute);
  if (!r.ok) return fail(`That costs \u20A6${cost.toLocaleString()}. You don't have enough.`);
  state.phone.holdings[symbol] = (state.phone.holdings[symbol] ?? 0) + n;
  return done(`Bought ${n} ${symbol} for \u20A6${cost.toLocaleString()}.`);
}
function sellShares(state, symbol, qty) {
  const have = state.phone.holdings[symbol] ?? 0;
  const n = Math.floor(qty);
  if (!(n > 0) || n > have) return fail("You don't own that many.");
  const proceeds = Math.round(stockPrice(symbol, dayOf(state)) * n * (1 - TRADE_FEE));
  transfer(state.ledger, MINT, PLAYER, proceeds, `Shares sold: ${symbol}`, state.minute);
  state.phone.holdings[symbol] = have - n;
  if (state.phone.holdings[symbol] === 0) delete state.phone.holdings[symbol];
  return done(`Sold ${n} ${symbol} for \u20A6${proceeds.toLocaleString()}.`);
}
var AJO_AMOUNT = 2e3;
var AJO_MEMBERS = 6;
function joinAjo(state) {
  const p = state.phone;
  if (p.ajo && !(p.ajo.contributed >= AJO_MEMBERS)) return fail("You're already in a group.");
  const payoutAt = 1 + Math.floor(seeded(state.minute, 77) * AJO_MEMBERS);
  p.ajo = { contributed: 0, payoutAt: Math.min(AJO_MEMBERS, payoutAt), lastWeek: -1, paidOut: false };
  return done(`You joined an ajo group of ${AJO_MEMBERS}. Everyone pays \u20A6${AJO_AMOUNT.toLocaleString()} a week, and each week one member collects \u20A6${(AJO_AMOUNT * AJO_MEMBERS).toLocaleString()}.`);
}
function payAjo(state) {
  const a = state.phone.ajo;
  if (!a || a.contributed >= AJO_MEMBERS) return fail("You're not in a group.");
  if (a.lastWeek === weekOf(state)) return fail("You've paid for this week. Come back next week.");
  const r = transfer(state.ledger, PLAYER, SINK, AJO_AMOUNT, "Ajo contribution", state.minute);
  if (!r.ok) return fail(`The contribution is \u20A6${AJO_AMOUNT.toLocaleString()}. You don't have enough.`);
  state.stats.totalSpent += AJO_AMOUNT;
  a.contributed += 1;
  a.lastWeek = weekOf(state);
  if (a.contributed === a.payoutAt && !a.paidOut) {
    const pot = AJO_AMOUNT * AJO_MEMBERS;
    transfer(state.ledger, MINT, PLAYER, pot, "Ajo payout", state.minute);
    state.stats.totalEarned += pot;
    a.paidOut = true;
    notify(state, "ajo", "Ajo payout", `It's your turn! \u20A6${pot.toLocaleString()} has been paid to you.`);
    return done(`It's your turn! \u20A6${pot.toLocaleString()} paid out.`);
  }
  if (a.contributed >= AJO_MEMBERS) return done("The group has finished. Well done!");
  return done(`Paid. ${a.contributed} of ${AJO_MEMBERS} weeks done.`);
}
function orderEats(state, mealId) {
  const meal = mealById(mealId);
  if (!meal) return fail("That isn't on the menu.");
  const p = state.phone;
  if (p.orders.length >= 6) return fail("Too many orders on the way.");
  const fee = meal.price >= 1e4 ? 0 : 500;
  const r = transfer(state.ledger, PLAYER, SINK, meal.price + fee, meal.name, state.minute);
  if (!r.ok) return fail(`That costs \u20A6${(meal.price + fee).toLocaleString()}${fee ? " with delivery" : ""}. You don't have enough.`);
  state.stats.totalSpent += meal.price + fee;
  p.orders.push({ id: p.nextId++, itemId: meal.id, arrivesAt: state.minute + meal.minutes });
  return done(`${meal.name} is on its way (about ${meal.minutes} min).`);
}
function nextLessonIn(state) {
  return Math.max(0, Math.ceil(state.phone.lastLessonAt + LESSON_GAP_MINUTES - state.minute));
}
function takeLesson(state, courseId) {
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
  return done(`${course.lessons[done_]} complete (+${LESSON_XP} xp)${level > before ? ` \xB7 ${course.skill} level ${level}!` : ""}${finished ? " Course finished!" : ""}`);
}
function diaryDone(state) {
  const d = state.phone.diary;
  return d.length > 0 && d[d.length - 1].day === dayOf(state);
}
function diaryCheckIn(state, mood2, text) {
  if (!DIARY_MOODS.some((m) => m.id === mood2)) return fail("Pick how you feel.");
  if (diaryDone(state)) return fail("You've already written today.");
  const d = state.phone.diary;
  d.push({ day: dayOf(state), mood: mood2, text: text.trim().slice(0, 160) });
  if (d.length > 60) d.shift();
  addFun(state, 3);
  return done("Saved. Writing it down helps.");
}
function streamData(state, mb) {
  const link = connection(state);
  if (link.kind === "none") return fail("You're offline. Turn on Wi-Fi or mobile data in Settings.");
  if (link.kind === "data") {
    if (state.phone.dataMB < mb) return fail("Not enough data left. Use Wi-Fi or buy a bundle in LifePay.");
    state.phone.dataMB -= mb;
  }
  return done();
}
function buyTicket(state, label, price, fun) {
  if (price > 0) {
    const r = transfer(state.ledger, PLAYER, SINK, price, label, state.minute);
    if (!r.ok) return fail(`That costs \u20A6${price.toLocaleString()}. You don't have enough.`);
    state.stats.totalSpent += price;
  }
  addFun(state, fun);
  return done(price > 0 ? `Ticket booked: ${label}.` : `You're going: ${label}.`);
}
function bookTicket(state, kind, title) {
  const day = dayOf(state);
  if (kind === "event") {
    const e = eventsFor(day).find((x) => x.title === title);
    return e ? buyTicket(state, e.title, e.price, 12) : fail("That event isn't on today.");
  }
  const f = filmsFor(day).find((x) => x.title === title);
  if (!f) return fail("That film isn't showing today.");
  if (kind === "film") return buyTicket(state, f.title, f.price, 25);
  const streamed = streamData(state, 60);
  if (!streamed.ok) return streamed;
  return buyTicket(state, f.title, Math.round(f.price / 5 / 100) * 100 + 300, 18);
}
function addTodo(state, text) {
  const t = text.trim().slice(0, 120);
  if (!t) return fail("Write something first.");
  if (state.phone.todos.length >= 40) return fail("Too many reminders.");
  state.phone.todos.unshift({ text: t, done: false });
  return done("Added.");
}
function toggleTodo(state, index) {
  const t = state.phone.todos[index];
  if (!t) return fail("No such reminder.");
  t.done = !t.done;
  return done();
}
function deleteTodo(state, index) {
  if (index < 0 || index >= state.phone.todos.length) return fail("No such reminder.");
  state.phone.todos.splice(index, 1);
  return done();
}
function drinkWater(state) {
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
function finishFocus(state) {
  state.skills.knowledge = (state.skills.knowledge ?? 0) + FOCUS_XP;
  return done(`Well done. +${FOCUS_XP} knowledge xp.`);
}
function nextWorkoutIn(state) {
  return Math.max(0, Math.ceil(state.phone.lastWorkoutAt + WORKOUT_GAP_MINUTES - state.minute));
}
function doWorkout(state, id) {
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
function nextGigIn(state) {
  return Math.max(0, Math.ceil(state.phone.lastGigAt + GIG_GAP_MINUTES - state.minute));
}
function doGig(state, id) {
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
  return done(`Done! \u20A6${g.pay.toLocaleString()} received.`);
}

// packages/game-core/src/phone.ts
var SAVINGS = "savings";
var BILL_PER_WEEK = 1500;
var isCoreApp = (app2) => Object.prototype.hasOwnProperty.call(APP_INFO, app2);
function appInfo(app2) {
  if (isCoreApp(app2)) return APP_INFO[app2];
  const s = storeAppById(app2);
  return s ? { name: s.name, blurb: s.blurb, dataMB: s.dataMB } : { name: app2, blurb: "", dataMB: 0 };
}
var fail2 = (reason) => ({ ok: false, reason });
var done2 = (text) => ({ ok: true, text });
function createPhone(profile) {
  const tier = profile?.phone ?? "basic";
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
    airtime: [300, 1e3, 5e3][rich],
    dataMB: [400, 1500, 5e3][rich],
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
    installed: [],
    downloads: [],
    wifiOn: true,
    mobileOn: true,
    homeNet: null,
    notes: [],
    scores: {},
    holdings: {},
    ajo: null,
    courses: {},
    lastLessonAt: -1e9,
    diary: [],
    todos: [],
    water: { day: 0, glasses: 0 },
    lastGigAt: -1e9,
    lastWorkoutAt: -1e9
  };
}
function parsePhone(raw, profile) {
  const fresh = createPhone(profile);
  if (!raw || typeof raw !== "object") return fresh;
  const r = raw;
  const num = (v, lo, hi, d) => typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
  const str2 = (v, max = 400) => typeof v === "string" ? v.slice(0, max) : "";
  const tier = r.model === "mid" || r.model === "flagship" || r.model === "basic" ? r.model : fresh.model;
  const threads = {};
  if (r.threads && typeof r.threads === "object") {
    for (const [id, t] of Object.entries(r.threads).slice(0, 12)) {
      const th = t;
      threads[id.slice(0, 20)] = {
        messages: Array.isArray(th.messages) ? th.messages.slice(-60).map((m) => ({ from: m?.from === "me" ? "me" : "them", text: str2(m?.text), minute: num(m?.minute, 0, 1e9, 0) })) : [],
        unread: Math.floor(num(th.unread, 0, 999, 0)),
        pending: typeof th.pending === "string" && BEATS.some((b) => b.id === th.pending) ? th.pending : null
      };
    }
  }
  const strings = (v, max = 100) => Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, max).map((x) => x.slice(0, 60)) : [];
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
    scheduled: Array.isArray(r.scheduled) ? r.scheduled.slice(0, 20).map((s) => ({ minute: num(s?.minute, 0, 1e9, 0), contact: str2(s?.contact, 20), text: str2(s?.text), pay: s?.pay ? Math.floor(num(s.pay, 0, 1e6, 0)) : void 0, reason: s?.reason ? str2(s.reason, 60) : void 0 })) : [],
    notifications: Array.isArray(r.notifications) ? r.notifications.slice(-30).map((n, i) => ({ id: Math.floor(num(n?.id, 0, 1e9, i)), app: n?.app && (isCoreApp(n.app) || STORE_IDS.has(n.app)) ? n.app : "chat", title: str2(n?.title, 60), text: str2(n?.text), minute: num(n?.minute, 0, 1e9, 0), read: n?.read === true })) : [],
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
    installed: strings(r.installed, 40).filter((id) => STORE_IDS.has(id)),
    downloads: Array.isArray(r.downloads) ? r.downloads.slice(0, 6).filter((d) => d && STORE_IDS.has(String(d.appId))).map((d) => ({ appId: d.appId, doneMB: num(d.doneMB, 0, 1e6, 0), paused: d.paused === true })) : [],
    wifiOn: r.wifiOn !== false,
    mobileOn: r.mobileOn !== false,
    homeNet: r.homeNet && typeof r.homeNet.plan === "string" && typeof r.homeNet.until === "number" ? { plan: r.homeNet.plan.slice(0, 20), until: r.homeNet.until } : null,
    notes: Array.isArray(r.notes) ? r.notes.filter((x) => typeof x === "string").slice(0, 40).map((x) => x.slice(0, 400)) : [],
    scores: r.scores && typeof r.scores === "object" ? Object.fromEntries(Object.entries(r.scores).filter(([k, v]) => STORE_IDS.has(k) && typeof v === "number" && Number.isFinite(v)).map(([k, v]) => [k, Math.max(0, Math.min(1e9, v))])) : {},
    holdings: r.holdings && typeof r.holdings === "object" ? Object.fromEntries(Object.entries(r.holdings).filter(([, v]) => typeof v === "number" && Number.isFinite(v) && v > 0).slice(0, 12).map(([k, v]) => [k.slice(0, 8), Math.min(1e6, Math.floor(v))])) : {},
    ajo: r.ajo && typeof r.ajo === "object" ? { contributed: Math.floor(num(r.ajo.contributed, 0, 6, 0)), payoutAt: Math.floor(num(r.ajo.payoutAt, 1, 6, 3)), lastWeek: Math.floor(num(r.ajo.lastWeek, -1, 1e6, -1)), paidOut: r.ajo.paidOut === true } : null,
    courses: r.courses && typeof r.courses === "object" ? Object.fromEntries(Object.entries(r.courses).filter(([, v]) => typeof v === "number").slice(0, 10).map(([k, v]) => [k.slice(0, 30), Math.max(0, Math.min(20, Math.floor(v)))])) : {},
    lastLessonAt: typeof r.lastLessonAt === "number" && Number.isFinite(r.lastLessonAt) ? r.lastLessonAt : -1e9,
    todos: Array.isArray(r.todos) ? r.todos.slice(0, 40).map((t) => ({ text: str2(t?.text, 120), done: t?.done === true })).filter((t) => t.text) : [],
    water: { day: Math.floor(num(r.water?.day, 0, 1e6, 0)), glasses: Math.floor(num(r.water?.glasses, 0, 99, 0)) },
    lastGigAt: typeof r.lastGigAt === "number" && Number.isFinite(r.lastGigAt) ? r.lastGigAt : -1e9,
    lastWorkoutAt: typeof r.lastWorkoutAt === "number" && Number.isFinite(r.lastWorkoutAt) ? r.lastWorkoutAt : -1e9,
    diary: Array.isArray(r.diary) ? r.diary.slice(-60).map((d) => ({ day: Math.floor(num(d?.day, 0, 1e6, 0)), mood: Math.floor(num(d?.mood, 1, 5, 3)), text: str2(d?.text, 160) })) : []
  };
}
function modelOf(phone) {
  return PHONE_MODELS[phone.model];
}
function hasApp(phone, app2) {
  if (isCoreApp(app2)) return modelOf(phone).apps.includes(app2);
  const s = storeAppById(app2);
  return !!s && phone.installed.includes(s.id) && tierAtLeast(phone.model, s.minTier);
}
function isDead(phone) {
  return phone.battery <= 0;
}
function bestCharger(phone) {
  const model = modelOf(phone);
  let best = null;
  for (const id of phone.chargers) {
    const c = chargerById(id);
    if (!c || !c.ports.some((p) => model.ports.includes(p))) continue;
    const rate = Math.min(c.rate, model.maxCharge);
    if (!best || rate > best.rate) best = { id: c.id, name: c.name, rate };
  }
  return best;
}
function wallPower(state) {
  return !isPowerCut(state.minute) && state.phone.billOwed < BILL_PER_WEEK * 2;
}
function billPerWeek(profile) {
  return profile?.tier === "nepo" ? 0 : BILL_PER_WEEK;
}
function groceriesFor(state, base, traitScale) {
  const day = Math.floor(state.minute / DAY_MINUTES) + 1;
  return Math.round(base * traitScale * (groceryPromo(day) ? 0.85 : 1) / 100) * 100;
}
function loanLimit(profile) {
  return profile?.tier === "nepo" ? 5e5 : profile?.tier === "middle" ? 1e5 : 2e4;
}
function notify(state, app2, title, text) {
  const p = state.phone;
  p.notifications.push({ id: p.nextId++, app: app2, title, text, minute: state.minute, read: false });
  if (p.notifications.length > 30) p.notifications.splice(0, p.notifications.length - 30);
}
function thread(state, contact) {
  return state.phone.threads[contact] ??= { messages: [], unread: 0, pending: null };
}
function deliver(state, contact, text, pending = null) {
  const t = thread(state, contact);
  t.messages.push({ from: "them", text, minute: state.minute });
  if (t.messages.length > 60) t.messages.splice(0, t.messages.length - 60);
  t.unread += 1;
  if (pending !== null) t.pending = pending;
  const who = contactsFor(state.profile).find((c) => c.id === contact)?.name ?? contact;
  notify(state, contact === "lifepay" ? "pay" : contact === "lifejobs" ? "jobs" : "chat", who, text);
}
function fill(text, state) {
  return text.replace("{name}", state.profile?.firstName ?? "you").replace("{rent}", `\u20A6${(state.profile?.rentPerWeek ?? ECONOMY.rentPerWeek).toLocaleString()}`);
}
function beatById(id) {
  return BEATS.find((b) => b.id === id);
}
function replyToThread(state, contact, optionIndex) {
  const t = state.phone.threads[contact];
  const beat = t?.pending ? beatById(t.pending) : void 0;
  const option = beat?.options?.[optionIndex];
  if (!t || !beat || !option) return fail2("Nothing to reply to.");
  if (option.send && balance(state.ledger) < option.send) return fail2(`You need \u20A6${option.send.toLocaleString()} for that.`);
  if (option.send) {
    transfer(state.ledger, PLAYER, SINK, option.send, `Sent to ${contactName(state, contact)}`, state.minute);
    state.stats.totalSpent += option.send;
  }
  t.messages.push({ from: "me", text: option.label, minute: state.minute });
  t.pending = null;
  state.phone.scheduled.push({ minute: state.minute + 2, contact, text: option.reply });
  if (option.repay) {
    state.phone.scheduled.push({ minute: state.minute + option.repay.days * DAY_MINUTES, contact, text: `Sending your \u20A6${option.repay.amount.toLocaleString()} back now. Thank you again!`, pay: option.repay.amount, reason: `${contactName(state, contact)} paid you back` });
  }
  if (option.fun) state.needs.fun = Math.min(100, state.needs.fun + option.fun);
  return done2();
}
function contactName(state, id) {
  return contactsFor(state.profile).find((c) => c.id === id)?.name ?? id;
}
function markThreadRead(state, contact) {
  const t = state.phone.threads[contact];
  if (t) t.unread = 0;
  for (const n of state.phone.notifications) if (n.app === "chat" && n.title === contactName(state, contact)) n.read = true;
}
function dismissNotification(state, id) {
  state.phone.notifications = state.phone.notifications.filter((n) => n.id !== id);
}
function clearNotifications(state) {
  state.phone.notifications = [];
}
function markNotificationsRead(state) {
  for (const n of state.phone.notifications) n.read = true;
}
function openApp(state, app2) {
  const p = state.phone;
  if (isDead(p)) return fail2("The battery is empty. Plug it in.");
  if (!hasApp(p, app2)) return fail2(`${appInfo(app2).name} isn't available on the ${modelOf(p).name}.`);
  const cost = appInfo(app2).dataMB;
  if (cost > 0) {
    const link = connection(state);
    if (link.kind === "none") return fail2(p.mobileOn && p.dataMB <= 0 ? "You're out of data. Buy a bundle in LifePay, or use Wi-Fi." : "You're offline. Turn on Wi-Fi or mobile data in Settings.");
    if (link.kind === "data") {
      if (p.dataMB < cost) return fail2("You're out of data. Buy a bundle in LifePay, or use Wi-Fi.");
      p.dataMB -= cost;
    }
  }
  return done2();
}
function call(state, contact, minutes) {
  const p = state.phone;
  const who = contactsFor(state.profile).find((c) => c.id === contact);
  if (!who?.callable) return fail2("That number can't be called.");
  if (isDead(p)) return fail2("The battery is empty.");
  const cost = Math.ceil(minutes) * AIRTIME_PER_CALL_MINUTE;
  if (p.airtime < cost) return fail2(`You need \u20A6${cost} airtime for that call.`);
  p.airtime -= cost;
  state.needs.fun = Math.min(100, state.needs.fun + Math.min(8, minutes * 2));
  return done2(`Called ${who.name} (\u2212\u20A6${cost} airtime).`);
}
function plug(state, source) {
  const p = state.phone;
  if (source === null) {
    p.plugged = null;
    return done2("Unplugged.");
  }
  if (source === "wall") {
    if (!bestCharger(p)) return fail2(`You have no charger that fits the ${modelOf(p).name}. Order one in LifeShop.`);
    p.plugged = "wall";
    return done2(wallPower(state) ? "Charging from the wall." : "Plugged in, but there's no power right now.");
  }
  if (!p.powerBank.owned) return fail2("You don't have a power bank.");
  if (!modelOf(p).ports.some((port2) => port2 === "micro" || port2 === "usbc")) return fail2("The power bank doesn't fit this phone.");
  if (p.powerBank.charge <= 0) return fail2("The power bank is empty.");
  p.plugged = "bank";
  return done2("Charging from the power bank.");
}
function setBankCharging(state, on) {
  if (!state.phone.powerBank.owned) return fail2("You don't have a power bank.");
  state.phone.bankCharging = on;
  return done2();
}
function payRent(state, amount) {
  if (state.rentOwed <= 0) return fail2("You don't owe any rent.");
  const pay = Math.min(amount ?? state.rentOwed, state.rentOwed, balance(state.ledger));
  if (pay <= 0) return fail2("Not enough money.");
  transfer(state.ledger, PLAYER, SINK, pay, "Rent", state.minute);
  state.rentOwed -= pay;
  state.stats.totalSpent += pay;
  if (state.rentOwed === 0) state.phone.lateFeeAt = null;
  return done2(`Paid \u20A6${pay.toLocaleString()} rent.`);
}
function payBill(state) {
  const p = state.phone;
  if (p.billOwed <= 0) return fail2("No bill to pay.");
  const pay = Math.min(p.billOwed, balance(state.ledger));
  if (pay <= 0) return fail2("Not enough money.");
  transfer(state.ledger, PLAYER, SINK, pay, "Water and power bill", state.minute);
  p.billOwed -= pay;
  state.stats.totalSpent += pay;
  return done2(`Paid \u20A6${pay.toLocaleString()} bill.${p.billOwed === 0 ? " The power stays on." : ""}`);
}
function sendMoney(state, contact, amount) {
  const who = contactsFor(state.profile).find((c) => c.id === contact);
  if (!who?.receivesMoney) return fail2("You can't send money to that contact.");
  const r = transfer(state.ledger, PLAYER, SINK, Math.floor(amount), `Sent to ${who.name}`, state.minute);
  if (!r.ok) return fail2(r.reason);
  state.stats.totalSpent += Math.floor(amount);
  return done2(`Sent \u20A6${Math.floor(amount).toLocaleString()} to ${who.name}.`);
}
function deposit(state, amount) {
  if (!modelOf(state.phone).banking) return fail2("Savings aren't available on this phone.");
  const r = transfer(state.ledger, PLAYER, SAVINGS, Math.floor(amount), "Moved to savings", state.minute);
  return r.ok ? done2(`Saved \u20A6${Math.floor(amount).toLocaleString()}.`) : fail2(r.reason);
}
function withdraw(state, amount) {
  if (!modelOf(state.phone).banking) return fail2("Savings aren't available on this phone.");
  const r = transfer(state.ledger, SAVINGS, PLAYER, Math.floor(amount), "Withdrawn from savings", state.minute);
  return r.ok ? done2(`Withdrew \u20A6${Math.floor(amount).toLocaleString()}.`) : fail2("There isn't that much in savings.");
}
function borrow(state, amount) {
  const p = state.phone;
  if (!modelOf(p).banking) return fail2("Loans aren't available on this phone.");
  if (p.loan) return fail2("Pay off your current loan first.");
  const sum = Math.floor(amount);
  if (sum <= 0 || sum > loanLimit(state.profile)) return fail2(`You can borrow up to \u20A6${loanLimit(state.profile).toLocaleString()}.`);
  transfer(state.ledger, MINT, PLAYER, sum, "Loan from LifePay", state.minute);
  p.loan = { owed: Math.round(sum * 1.1), sinceDay: Math.floor(state.minute / DAY_MINUTES) + 1 };
  return done2(`Loan of \u20A6${sum.toLocaleString()} paid out. You owe \u20A6${p.loan.owed.toLocaleString()} (10% fee).`);
}
function repay(state, amount) {
  const p = state.phone;
  if (!p.loan) return fail2("You have no loan.");
  const pay = Math.min(Math.floor(amount), p.loan.owed, balance(state.ledger));
  if (pay <= 0) return fail2("Not enough money.");
  transfer(state.ledger, PLAYER, SINK, pay, "Loan repayment", state.minute);
  p.loan.owed -= pay;
  if (p.loan.owed <= 0) p.loan = null;
  return done2(`Repaid \u20A6${pay.toLocaleString()}.${p.loan ? "" : " Loan cleared."}`);
}
function setAutoPay(state, on) {
  state.phone.autoPay = on;
}
function topUp(state, itemId) {
  const item2 = shopItemById(itemId);
  if (!item2 || item2.kind !== "airtime" && item2.kind !== "data") return fail2("Unknown bundle.");
  const r = transfer(state.ledger, PLAYER, SINK, item2.price, item2.name, state.minute);
  if (!r.ok) return fail2("Not enough money.");
  state.stats.totalSpent += item2.price;
  if (item2.kind === "airtime") state.phone.airtime += item2.amount ?? 0;
  else state.phone.dataMB += item2.amount ?? 0;
  return done2(`${item2.name} added.`);
}
function itemPrice(state, item2, traitScale = 1) {
  return item2.kind === "grocery" ? groceriesFor(state, item2.price, traitScale) : item2.price;
}
function deliveryFee(price) {
  return price >= FREE_DELIVERY_OVER ? 0 : DELIVERY_FEE;
}
function placeOrder(state, itemId, traitScale = 1) {
  const item2 = shopItemById(itemId);
  const p = state.phone;
  if (!item2 || item2.deliveryMinutes === 0) return fail2("That can't be ordered.");
  if (p.orders.length >= 6) return fail2("Too many orders on the way.");
  if (item2.kind === "phone" && item2.tier === p.model) return fail2("You already have that phone.");
  if (item2.kind === "powerbank" && p.powerBank.owned) return fail2("You already have a power bank.");
  if (item2.kind === "charger" && p.chargers.includes(item2.id)) return fail2("You already have that charger.");
  const price = itemPrice(state, item2, traitScale);
  const fee = deliveryFee(price);
  const r = transfer(state.ledger, PLAYER, SINK, price + fee, item2.name, state.minute);
  if (!r.ok) return fail2(`That costs \u20A6${(price + fee).toLocaleString()}${fee ? ` including \u20A6${fee} delivery` : ""}. You don't have enough.`);
  state.stats.totalSpent += price + fee;
  p.orders.push({ id: p.nextId++, itemId, arrivesAt: state.minute + item2.deliveryMinutes });
  return done2(`Ordered ${item2.name}. It arrives in about ${item2.deliveryMinutes >= 60 ? `${Math.round(item2.deliveryMinutes / 60)} h` : `${item2.deliveryMinutes} min`}.`);
}
function receive(state, order) {
  const item2 = shopItemById(order.itemId);
  if (!item2) return;
  const p = state.phone;
  if (item2.kind === "grocery") state.inventory.portions += item2.amount ?? 0;
  else if (item2.kind === "meal") state.inventory.meals += item2.amount ?? 1;
  else if (item2.kind === "charger") p.chargers.push(item2.id);
  else if (item2.kind === "powerbank") p.powerBank.owned = true;
  else if (item2.kind === "phone" && item2.tier) {
    p.model = item2.tier;
    p.battery = 100;
    p.plugged = null;
  }
  notify(state, "shop", "Delivery", `${item2.name} has arrived.`);
}
function applyForJob(state, jobId) {
  const p = state.phone;
  const job = JOBS.find((j) => j.id === jobId);
  if (!job) return fail2("Unknown job.");
  if (p.job) return fail2("Quit your current job first.");
  if (p.application) return fail2("You already have an application waiting.");
  p.application = { jobId, decideAt: state.minute + JOB_DECISION_MINUTES };
  return done2(`Applied to ${job.employer}. They usually reply within half a day.`);
}
function quitJob(state) {
  if (!state.phone.job) return fail2("You don't have a job.");
  state.phone.job = null;
  return done2("You quit.");
}
function jobPayBoost(phone) {
  return JOBS.find((j) => j.id === phone.job)?.payBoost ?? 1;
}
function tickPhone(state, minutes) {
  const p = state.phone;
  const model = modelOf(p);
  const hours = minutes / 60;
  const drain = 100 / (p.inUse ? model.screenHours : model.standbyHours) * hours;
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
  tickDownloads(state, minutes);
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
  const hour = state.minute % DAY_MINUTES / 60;
  const tier = state.profile?.tier;
  for (const beat of BEATS) {
    if (p.beatsDone.includes(beat.id)) continue;
    if (beat.tiers && (!tier || !beat.tiers.includes(tier))) continue;
    if (!contactsFor(state.profile).some((c) => c.id === beat.contact)) continue;
    if (day > beat.day || day === beat.day && hour >= beat.hour) {
      p.beatsDone.push(beat.id);
      deliver(state, beat.contact, fill(beat.text, state), beat.options ? beat.id : null);
    }
  }
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
  if (p.orders.length) {
    const arrived = p.orders.filter((o) => state.minute >= o.arrivesAt);
    if (arrived.length) {
      p.orders = p.orders.filter((o) => state.minute < o.arrivesAt);
      for (const o of arrived) receive(state, o);
    }
  }
  if (p.application && state.minute >= p.application.decideAt) {
    const job = JOBS.find((j) => j.id === p.application.jobId);
    p.application = null;
    if (job) {
      const level = skillLevel(state.skills[job.requires.skill] ?? 0);
      if (level >= job.requires.level) {
        p.job = job.id;
        deliver(state, "lifejobs", `Congratulations! ${job.employer} offered you the ${job.title} job. \u20A6${job.retainer.toLocaleString()} every week, plus better pay when you work.`);
      } else {
        deliver(state, "lifejobs", `${job.employer} chose someone else. They wanted ${job.requires.skill} level ${job.requires.level}. Yours is ${level}. Practise and try again.`);
      }
    }
  }
  if (p.lateFeeAt !== null) {
    if (state.rentOwed <= 0) p.lateFeeAt = null;
    else if (state.minute >= p.lateFeeAt) {
      p.lateFeeAt = null;
      state.rentOwed += ECONOMY.lateFee;
      notify(state, "pay", "Late fee", `Rent is overdue. A \u20A6${ECONOMY.lateFee.toLocaleString()} fee was added.`);
    }
  }
  if (day % ECONOMY.rentDay === 0 && hour >= ECONOMY.rentHour && day > p.lastWeekDay) {
    p.lastWeekDay = day;
    weekly(state, day);
  }
}
function weekly(state, day) {
  const p = state.phone;
  const bill = billPerWeek(state.profile);
  if (bill > 0) {
    p.billOwed += bill;
    if (p.autoPay && balance(state.ledger) > 0) payBill(state);
    if (p.billOwed > 0) notify(state, "pay", "Bill due", `Water and power: \u20A6${p.billOwed.toLocaleString()} unpaid. The power is cut if two weeks go unpaid.`);
  }
  const job = JOBS.find((j) => j.id === p.job);
  if (job) {
    transfer(state.ledger, MINT, PLAYER, job.retainer, `${job.employer}: weekly pay`, state.minute);
    state.stats.totalEarned += job.retainer;
    notify(state, "pay", job.employer, `\u20A6${job.retainer.toLocaleString()} weekly pay received.`);
  }
  const saved = balance(state.ledger, SAVINGS);
  const interest = Math.floor(saved * 0.01);
  if (interest > 0) {
    transfer(state.ledger, MINT, SAVINGS, interest, "Savings interest", state.minute);
    notify(state, "pay", "Savings", `\u20A6${interest.toLocaleString()} interest added.`);
  }
  if (p.loan) {
    if (day - p.loan.sinceDay >= 14) p.loan.owed += Math.round(p.loan.owed * 0.05);
    notify(state, "pay", "Loan", `You owe \u20A6${p.loan.owed.toLocaleString()}.${day - p.loan.sinceDay >= 14 ? " A 5% late charge was added." : ""}`);
  }
}
function startLateFeeClock(state) {
  if (state.phone.lateFeeAt === null) state.phone.lateFeeAt = state.minute + DAY_MINUTES;
}

// packages/game-core/src/traits.ts
var TRAITS = [
  { id: "hustler", label: "Hustler", kind: "strength", text: "Earns 10% more from work.", effect: { workPay: 1.1 } },
  { id: "thrifty", label: "Thrifty", kind: "strength", text: "Groceries cost 10% less.", effect: { groceries: 0.9 } },
  { id: "iron_stomach", label: "Iron stomach", kind: "strength", text: "Gets hungry 20% slower.", effect: { decay: { hunger: 0.8 } } },
  { id: "energetic", label: "Energetic", kind: "strength", text: "Gets tired 15% slower.", effect: { decay: { energy: 0.85 } } },
  { id: "tidy", label: "Tidy", kind: "strength", text: "Stays fresh 20% longer.", effect: { decay: { hygiene: 0.8 } } },
  { id: "good_company", label: "Good company", kind: "strength", text: "Gets bored 20% slower.", effect: { decay: { fun: 0.8 } } },
  { id: "bookworm", label: "Bookworm", kind: "strength", text: "Starts with a head start in knowledge.", effect: { skills: { knowledge: 72 } } },
  { id: "techie", label: "Techie", kind: "strength", text: "Starts with a head start in computers, so work pays more.", effect: { skills: { computer: 72 } } },
  { id: "strong_bladder", label: "Strong bladder", kind: "strength", text: "Needs the toilet 20% less often.", effect: { decay: { bladder: 0.8 } } },
  { id: "big_appetite", label: "Big appetite", kind: "weakness", text: "Gets hungry 25% faster.", effect: { decay: { hunger: 1.25 } } },
  { id: "light_sleeper", label: "Light sleeper", kind: "weakness", text: "Gets tired 20% faster.", effect: { decay: { energy: 1.2 } } },
  { id: "lazy", label: "Lazy streak", kind: "weakness", text: "Earns 10% less from work.", effect: { workPay: 0.9 } },
  { id: "spender", label: "Big spender", kind: "weakness", text: "Groceries cost 15% more.", effect: { groceries: 1.15 } },
  { id: "restless", label: "Restless", kind: "weakness", text: "Gets bored 25% faster.", effect: { decay: { fun: 1.25 } } },
  { id: "weak_bladder", label: "Weak bladder", kind: "weakness", text: "Needs the toilet 25% more often.", effect: { decay: { bladder: 1.25 } } }
];
var byId = new Map(TRAITS.map((t) => [t.id, t]));
function strengthSlots(weaknesses) {
  return weaknesses > 0 ? 3 : 2;
}
function sanitizeTraits(ids) {
  const seen = /* @__PURE__ */ new Set();
  const strengths = [];
  const weaknesses = [];
  for (const id of ids) {
    const t = byId.get(id);
    if (!t || seen.has(id)) continue;
    seen.add(id);
    if (t.kind === "weakness") weaknesses.push(id);
    else strengths.push(id);
  }
  const weak = weaknesses.slice(0, 1);
  return [...strengths.slice(0, strengthSlots(weak.length)), ...weak];
}
function combineTraits(ids) {
  const out = { decay: { hunger: 1, energy: 1, hygiene: 1, bladder: 1, fun: 1 }, workPay: 1, groceries: 1, skills: {} };
  for (const id of ids ?? []) {
    const e = byId.get(id)?.effect;
    if (!e) continue;
    for (const [need, mult] of Object.entries(e.decay ?? {})) out.decay[need] *= mult;
    out.workPay *= e.workPay ?? 1;
    out.groceries *= e.groceries ?? 1;
    for (const [skill, xp] of Object.entries(e.skills ?? {})) out.skills[skill] = (out.skills[skill] ?? 0) + xp;
  }
  return out;
}

// packages/game-core/src/sim.ts
var FREE_MINUTES_PER_SECOND = 1;
var WARNINGS = {
  hunger: "You're getting hungry.",
  energy: "You're getting tired.",
  hygiene: "You could use a shower.",
  bladder: "You really need the toilet!",
  fun: "You're bored."
};
function startingSkills(profile) {
  const skills = profile ? { ...profile.skills } : {};
  for (const [id, xp] of Object.entries(combineTraits(profile?.traits).skills)) skills[id] = (skills[id] ?? 0) + xp;
  return skills;
}
function createGameState(profile = null) {
  const ledger = createLedger();
  transfer(ledger, MINT, PLAYER, profile?.startingMoney ?? ECONOMY.startingMoney, "Starting money", 0);
  return {
    version: 1,
    minute: 8 * 60,
    // Day 1, 08:00
    needs: createNeeds(),
    ledger,
    inventory: { portions: 3, meals: 0 },
    skills: startingSkills(profile),
    incomeCarry: 0,
    rentOwed: 0,
    lastRentDay: 0,
    profile,
    phone: createPhone(profile),
    lastAllowanceDay: 0,
    warned: {},
    stats: { daysSurvived: 0, totalEarned: 0, totalSpent: 0, timesPassedOut: 0 }
  };
}
function clockOf(minute) {
  const day = Math.floor(minute / DAY_MINUTES) + 1;
  const inDay = minute % DAY_MINUTES;
  const hour = Math.floor(inDay / 60);
  const min = Math.floor(inDay % 60);
  return { day, hour, minute: min, hourFloat: inDay / 60, label: `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}` };
}
var Sim = class {
  state;
  active = null;
  events = [];
  /** Offline catch-up softens decay and removes accidents; see simulateAbsence. */
  offline = false;
  constructor(state) {
    this.state = state ?? createGameState();
  }
  get clock() {
    return clockOf(this.state.minute);
  }
  get money() {
    return balance(this.state.ledger);
  }
  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }
  emit(kind, text) {
    this.events.push({ kind, text, minute: this.state.minute });
  }
  // -------------------------------------------------------------- starting and stopping actions
  canStart(actionId) {
    const def = ACTIONS[actionId];
    if (!def) return { ok: false, reason: "Unknown activity." };
    const { needs, inventory } = this.state;
    if (def.blockedIf && needs[def.blockedIf.need] >= def.blockedIf.atLeast) return { ok: false, reason: def.blockedIf.message };
    if (def.needsAtLeast && needs[def.needsAtLeast.need] < def.needsAtLeast.atLeast) return { ok: false, reason: def.needsAtLeast.message };
    if (def.cost?.portions && inventory.portions < def.cost.portions) {
      return { ok: false, reason: def.id === "snack" ? "The fridge is empty. Order groceries first." : `Not enough ingredients (need ${def.cost.portions}). Order groceries first.` };
    }
    if (def.cost?.meals && inventory.meals < def.cost.meals) return { ok: false, reason: "There's no cooked meal. Cook something first." };
    if (def.cost?.money && this.money < def.cost.money) return { ok: false, reason: "Not enough money." };
    return { ok: true };
  }
  start(actionId, forced = false) {
    const check = forced ? { ok: true } : this.canStart(actionId);
    if (!check.ok) return check;
    if (this.active) this.cancel();
    const def = ACTIONS[actionId];
    if (def.cost?.portions) this.state.inventory.portions -= def.cost.portions;
    if (def.cost?.meals) this.state.inventory.meals -= def.cost.meals;
    this.active = { def, done: 0, forced };
    return { ok: true };
  }
  /** Stops the current action. Effects so far are kept; nothing is refunded and nothing is granted at the end. */
  cancel() {
    this.active = null;
  }
  // -------------------------------------------------------------- shop
  /** The player's trait effects (decay rates, pay, prices). */
  get traits() {
    return combineTraits(this.state.profile?.traits);
  }
  get groceriesPrice() {
    return groceriesFor(this.state, ECONOMY.groceriesPrice, this.traits.groceries);
  }
  buyGroceries() {
    const price = this.groceriesPrice;
    const result = transfer(this.state.ledger, PLAYER, SINK, price, "Groceries", this.state.minute);
    if (!result.ok) return { ok: false, reason: `Groceries cost \u20A6${price.toLocaleString()}. You don't have enough.` };
    this.state.inventory.portions += ECONOMY.groceriesPortions;
    this.state.stats.totalSpent += price;
    this.emit("info", `Ordered groceries: +${ECONOMY.groceriesPortions} portions (\u2212\u20A6${price.toLocaleString()}).`);
    return { ok: true };
  }
  // -------------------------------------------------------------- time
  /** Advance by real seconds of play. Returns the game minutes that passed and any action that finished. */
  step(realSeconds) {
    const rate = this.active ? this.active.def.minutesPerSecond : FREE_MINUTES_PER_SECOND;
    let minutes = realSeconds * rate;
    let finished = null;
    if (this.active) {
      const remaining = this.active.def.minutes - this.active.done;
      if (minutes >= remaining) minutes = remaining;
    }
    if (minutes > 0) finished = this.advance(minutes);
    return { minutes, finished };
  }
  /** Advance by game minutes (in small slices so rent, warnings and needs stay accurate). */
  advance(gameMinutes) {
    let left = gameMinutes;
    let finished = null;
    while (left > 1e-9) {
      const slice = Math.min(left, 10);
      left -= slice;
      this.applySlice(slice);
      const done3 = this.checkFinished();
      if (done3) {
        finished = done3;
        break;
      }
    }
    return finished;
  }
  checkFinished() {
    const act = this.active;
    if (!act) return null;
    const reachedTime = act.done >= act.def.minutes - 1e-6;
    const until = act.def.until;
    const reachedGoal = until ? this.state.needs[until.need] >= until.atLeast - 1e-6 : false;
    if (!reachedTime && !reachedGoal) return null;
    if (act.def.gives?.meals) {
      this.state.inventory.meals += act.def.gives.meals;
      this.emit("good", "Your meal is ready.");
    }
    this.active = null;
    return act;
  }
  applySlice(minutes) {
    const s = this.state;
    const act = this.active;
    const hours = minutes / 60;
    for (const id of NEED_IDS) {
      const decayScale = (act?.def.decay?.[id] ?? 1) * (this.offline ? 0.5 : 1) * this.traits.decay[id];
      let perHour = -BASE_DECAY_PER_HOUR[id] * decayScale;
      if (act) perHour += (act.def.needs[id] ?? 0) / act.def.minutes * 60;
      if (id === "energy" && s.needs.hunger <= 0) perHour -= 3;
      s.needs[id] = clampNeed(s.needs[id] + perHour * hours);
    }
    if (act) {
      act.done += minutes;
      if (act.def.incomePerHour) this.earn(act.def.incomePerHour * performance(s.needs) * skillPayMultiplier(s.skills.computer ?? 0) * this.traits.workPay * jobPayBoost(s.phone) * hours);
      if (act.def.skill) {
        const before = Math.floor(Math.sqrt((s.skills[act.def.skill.id] ?? 0) / 8));
        s.skills[act.def.skill.id] = (s.skills[act.def.skill.id] ?? 0) + act.def.skill.xpPerHour * hours;
        const after = Math.floor(Math.sqrt(s.skills[act.def.skill.id] / 8));
        if (after > before) this.emit("good", `Your ${act.def.skill.id} skill reached level ${after}.`);
      }
    }
    const previousDay = Math.floor(s.minute / DAY_MINUTES);
    s.minute += minutes;
    if (Math.floor(s.minute / DAY_MINUTES) > previousDay) s.stats.daysSurvived += 1;
    this.checkNeeds();
    this.checkRent();
    tickPhone(s, minutes);
  }
  earn(amount) {
    const s = this.state;
    s.incomeCarry += amount;
    const whole = Math.floor(s.incomeCarry);
    if (whole >= 1) {
      s.incomeCarry -= whole;
      transfer(s.ledger, MINT, PLAYER, whole, "Freelance pay", s.minute);
      s.stats.totalEarned += whole;
    }
  }
  checkNeeds() {
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
  evictionWarned = false;
  checkRent() {
    const s = this.state;
    const day = Math.floor(s.minute / DAY_MINUTES) + 1;
    const hourOfDay = s.minute % DAY_MINUTES / 60;
    const rent = s.profile ? s.profile.rentPerWeek : ECONOMY.rentPerWeek;
    const payday = day % ECONOMY.rentDay === 0 && hourOfDay >= ECONOMY.rentHour;
    const due = rent > 0 && payday && day > s.lastRentDay;
    if (s.profile && s.profile.weeklyAllowance > 0 && payday && day > s.lastAllowanceDay) {
      s.lastAllowanceDay = day;
      transfer(s.ledger, MINT, PLAYER, s.profile.weeklyAllowance, `Allowance from ${s.profile.allowanceFrom || "family"}`, s.minute);
      this.emit("good", `${s.profile.allowanceFrom || "Family"} sent your allowance: \u20A6${s.profile.weeklyAllowance.toLocaleString()}.`);
    }
    if (due) {
      s.lastRentDay = day;
      s.rentOwed += rent;
      this.emit("warn", `Rent is due: \u20A6${rent.toLocaleString()}.`);
    }
    if (s.rentOwed > 0 && this.money > 0 && s.phone.autoPay) {
      const pay = Math.min(this.money, s.rentOwed);
      transfer(s.ledger, PLAYER, SINK, pay, "Rent", s.minute);
      s.rentOwed -= pay;
      s.stats.totalSpent += pay;
      if (s.rentOwed === 0) this.emit("info", `Rent paid (\u20A6${pay.toLocaleString()}).`);
    }
    if (due && s.rentOwed > 0 && !s.phone.autoPay) {
      startLateFeeClock(s);
      notify(s, "pay", "Rent due", `Pay \u20A6${s.rentOwed.toLocaleString()} in LifePay before tomorrow to avoid a late fee.`);
    }
    if (due && s.rentOwed > 0 && s.phone.autoPay) {
      s.rentOwed += ECONOMY.lateFee;
      this.emit("bad", `You couldn't cover the rent. \u20A6${s.rentOwed.toLocaleString()} is owed, including a late fee.`);
    }
    if (rent > 0 && s.rentOwed >= rent * 2 && !this.evictionWarned) {
      this.evictionWarned = true;
      this.emit("bad", "Your landlord has sent an eviction warning.");
    }
    if (s.rentOwed === 0) this.evictionWarned = false;
  }
};

// packages/game-core/src/absence.ts
var MAX_AWAY_GAME_MINUTES = 12 * 60;
var FLOORS = { hunger: 25, energy: 25, hygiene: 30, bladder: 40, fun: 30 };
function simulateAbsence(state, realMinutesAway) {
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
  const lines = [];
  const hours = Math.round(minutes / 60 * 10) / 10;
  lines.push(`${hours} hour${hours === 1 ? "" : "s"} passed.`);
  const worse = NEED_IDS.filter((id) => before[id] - state.needs[id] >= 12);
  if (worse.length) lines.push(`You got ${worse.map((id) => ({ hunger: "hungrier", energy: "more tired", hygiene: "less fresh", bladder: "more desperate for the toilet", fun: "more bored" })[id]).join(", ")}.`);
  lines.push(`You feel ${moodLabel(state.needs).toLowerCase()}.`);
  for (const event of sim.drainEvents()) if (event.kind !== "info" || /rent/i.test(event.text)) lines.push(event.text);
  const spent = moneyBefore - sim.money;
  if (spent > 0) lines.push(`\u20A6${spent.toLocaleString()} went on bills.`);
  if (spent < 0) lines.push(`\u20A6${(-spent).toLocaleString()} came in.`);
  if (state.rentOwed > 0) lines.push(`You still owe \u20A6${state.rentOwed.toLocaleString()} in rent.`);
  void ECONOMY;
  return { gameMinutes: minutes, lines };
}

// packages/game-core/src/profile.ts
var BACKGROUNDS = [
  // ---- lapo: little money, rent to find, a cracked basic phone
  {
    id: "mushin_tailor",
    tier: "lapo",
    weight: 12,
    title: "Tailor's child from Mushin",
    region: "yoruba",
    hometowns: ["Mushin", "Oshodi", "Ajegunle"],
    story: "Mama sews for a living and the machine never rests. You learned early that nobody hands you anything. Rent is yours to find.",
    money: [6e3, 14e3],
    rent: 14e3,
    allowance: 0,
    phone: "basic",
    traits: ["Hustler", "Knows the neighbours"],
    skills: { computer: 2 }
  },
  {
    id: "okada_family",
    tier: "lapo",
    weight: 10,
    title: "Okada rider's child",
    region: "hausa",
    hometowns: ["Kano", "Kaduna", "Zaria"],
    story: "Your father rides from before sunrise until the fuel runs out. There is food, but never extra. You are the first one to try something different.",
    money: [5e3, 11e3],
    rent: 14e3,
    allowance: 0,
    phone: "basic",
    traits: ["Early riser", "Thrifty"]
  },
  {
    id: "market_trader",
    tier: "lapo",
    weight: 10,
    title: "Yam seller's child",
    region: "igbo",
    hometowns: ["Onitsha", "Nnewi", "Aba"],
    story: "You grew up counting change at the stall. You can bargain with anyone and spot a bad note from across the road, but savings are thin.",
    money: [7e3, 15e3],
    rent: 14e3,
    allowance: 0,
    phone: "basic",
    traits: ["Sharp with money", "Loud"],
    skills: { knowledge: 1 }
  },
  {
    id: "scholarship_student",
    tier: "lapo",
    weight: 8,
    title: "Scholarship graduate",
    region: "south",
    hometowns: ["Benin City", "Warri", "Asaba"],
    story: "You got through school on a scholarship and a lot of late nights. The degree is real; the bank balance is not.",
    money: [4e3, 9e3],
    rent: 14e3,
    allowance: 0,
    phone: "basic",
    traits: ["Bookish", "Tired"],
    skills: { knowledge: 4, computer: 3 }
  },
  // ---- middle: steady, comfortable enough
  {
    id: "teacher_child",
    tier: "middle",
    weight: 14,
    title: "Teacher's child from Ibadan",
    region: "yoruba",
    hometowns: ["Ibadan", "Abeokuta", "Ogbomoso"],
    story: "A quiet house full of books and marking. You were never rich and never hungry. Your parents sent you off with a small cushion and high hopes.",
    money: [45e3, 8e4],
    rent: 14e3,
    allowance: 0,
    phone: "mid",
    traits: ["Disciplined", "Well read"],
    skills: { knowledge: 3 }
  },
  {
    id: "civil_servant",
    tier: "middle",
    weight: 12,
    title: "Civil servant's child",
    region: "hausa",
    hometowns: ["Abuja", "Kaduna", "Jos"],
    story: "Salary on the 25th, when it comes. You learned patience and how to stretch a month. Your family helped with the first rent.",
    money: [55e3, 95e3],
    rent: 14e3,
    allowance: 0,
    phone: "mid",
    traits: ["Patient", "Connected"]
  },
  {
    id: "nurse_child",
    tier: "middle",
    weight: 10,
    title: "Nurse's child",
    region: "igbo",
    hometowns: ["Enugu", "Port Harcourt", "Owerri"],
    story: "Your mother worked nights so you could study by day. She slipped you something before you left and told you to eat properly.",
    money: [4e4, 75e3],
    rent: 14e3,
    allowance: 0,
    phone: "mid",
    traits: ["Caring", "Light sleeper"]
  },
  {
    id: "shop_owner",
    tier: "middle",
    weight: 8,
    title: "Shop owner's child",
    region: "south",
    hometowns: ["Benin City", "Port Harcourt", "Warri"],
    story: "Your family's provision store paid for school and kept the lights on. You know stock, customers and how to smile at both.",
    money: [6e4, 11e4],
    rent: 14e3,
    allowance: 0,
    phone: "mid",
    traits: ["Good with people", "Hustler"]
  },
  // ---- nepo: money, a family house, an allowance, the best phone
  {
    id: "oil_exec",
    tier: "nepo",
    weight: 4,
    title: "Oil executive's child",
    region: "south",
    hometowns: ["Lekki", "Port Harcourt", "Victoria Island"],
    story: "Foreign schools, a driver and a flat nobody asked you to pay for. The only thing you were never taught is what things cost.",
    money: [45e4, 9e5],
    rent: 0,
    allowance: 6e4,
    allowanceFrom: "Daddy",
    phone: "flagship",
    traits: ["Spoilt", "Well connected"]
  },
  {
    id: "senator_child",
    tier: "nepo",
    weight: 3,
    title: "Senator's child",
    region: "hausa",
    hometowns: ["Abuja", "Kano", "Maitama"],
    story: "Doors open before you knock. Everyone is polite to your face, and you are never sure which of them mean it.",
    money: [35e4, 7e5],
    rent: 0,
    allowance: 5e4,
    allowanceFrom: "Daddy",
    phone: "flagship",
    traits: ["Entitled", "Watched"]
  },
  {
    id: "estate_heir",
    tier: "nepo",
    weight: 3,
    title: "Real-estate heir",
    region: "yoruba",
    hometowns: ["Ikoyi", "Lekki", "Banana Island"],
    story: "Your family owns half the street you live on. Rent was never a word at your table. Earning your own is the new experience.",
    money: [5e5, 1e6],
    rent: 0,
    allowance: 7e4,
    allowanceFrom: "Mummy",
    phone: "flagship",
    traits: ["Generous", "Out of touch"]
  }
];
var NAMES = {
  yoruba: { male: ["Tunde", "Femi", "Kunle", "Seyi", "Dayo", "Bayo", "Ayo", "Tobi"], female: ["Bisi", "Tola", "Funmi", "Yemi", "Kemi", "Ife", "Damilola", "Titi"], surnames: ["Adeyemi", "Balogun", "Ogunleye", "Adebayo", "Ajayi", "Oladipo", "Akinwale"] },
  igbo: { male: ["Chidi", "Emeka", "Ifeanyi", "Obinna", "Nnamdi", "Chukwudi", "Kelechi"], female: ["Ngozi", "Chiamaka", "Adaeze", "Ifeoma", "Amara", "Nneka", "Chioma"], surnames: ["Okafor", "Nwosu", "Eze", "Obi", "Okeke", "Nwachukwu", "Onyekachi"] },
  hausa: { male: ["Musa", "Ibrahim", "Sani", "Abubakar", "Umar", "Yusuf", "Bashir"], female: ["Aisha", "Hauwa", "Zainab", "Fatima", "Amina", "Maryam", "Hadiza"], surnames: ["Bello", "Danjuma", "Yusuf", "Abdullahi", "Garba", "Mohammed", "Lawal"] },
  south: { male: ["Osas", "Efe", "Ehi", "Tamuno", "Ovie", "Eyo", "Ikenna"], female: ["Osaze", "Efosa", "Ete", "Tonye", "Ebiere", "Imaobong", "Ibiere"], surnames: ["Idahosa", "Osagie", "Omoregie", "Ekpo", "Etim", "Ighodaro", "Brown"] }
};
var pick = (items, random) => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
function randomName(region, sex, random) {
  const pool = NAMES[region];
  return { firstName: pick(sex === "male" ? pool.male : pool.female, random), surname: pick(pool.surnames, random) };
}
function profileFrom(def, random, sex) {
  const [lo, hi] = def.money;
  const money = Math.round((lo + random() * (hi - lo)) / 500) * 500;
  const name = randomName(def.region, sex, random);
  return {
    ...name,
    sex,
    tier: def.tier,
    backgroundId: def.id,
    title: def.title,
    story: def.story,
    hometown: pick(def.hometowns, random),
    startingMoney: money,
    rentPerWeek: def.rent,
    weeklyAllowance: def.allowance,
    allowanceFrom: def.allowanceFrom ?? "",
    phone: def.phone,
    traits: [],
    flavour: [...def.traits],
    skills: { ...def.skills ?? {} }
  };
}
function parseProfile(raw) {
  if (!raw || typeof raw !== "object") return null;
  const r = raw;
  const text = (v, max = 200) => typeof v === "string" ? v.slice(0, max) : "";
  const num = (v, max) => typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0;
  if (r.tier !== "lapo" && r.tier !== "middle" && r.tier !== "nepo") return null;
  const skills = {};
  if (r.skills && typeof r.skills === "object") for (const [k, v] of Object.entries(r.skills)) skills[k.slice(0, 30)] = num(v, 1e4);
  return {
    firstName: text(r.firstName, 30) || "You",
    surname: text(r.surname, 30),
    sex: r.sex === "female" ? "female" : "male",
    tier: r.tier,
    backgroundId: text(r.backgroundId, 40),
    title: text(r.title),
    story: text(r.story, 600),
    hometown: text(r.hometown, 40),
    startingMoney: num(r.startingMoney, 1e8),
    rentPerWeek: num(r.rentPerWeek, 1e7),
    weeklyAllowance: num(r.weeklyAllowance, 1e7),
    allowanceFrom: text(r.allowanceFrom, 30),
    phone: r.phone === "flagship" || r.phone === "mid" ? r.phone : "basic",
    traits: sanitizeTraits(Array.isArray(r.traits) ? r.traits.filter((t) => typeof t === "string") : []),
    flavour: Array.isArray(r.flavour) ? r.flavour.filter((t) => typeof t === "string").slice(0, 6).map((t) => t.slice(0, 40)) : [],
    skills
  };
}

// packages/game-core/src/persist.ts
function parseGameState(raw) {
  if (!raw || typeof raw !== "object") return null;
  const r = raw;
  if (r.version !== 1 || typeof r.minute !== "number" || !r.ledger || typeof r.ledger !== "object") return null;
  const accounts = r.ledger.accounts;
  if (!accounts || typeof accounts !== "object") return null;
  let total = 0;
  for (const value of Object.values(accounts)) {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    total += value;
  }
  if (total !== 0) return null;
  const fresh = createGameState();
  const needs = createNeeds();
  for (const id of NEED_IDS) {
    const value = r.needs?.[id];
    needs[id] = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fresh.needs[id];
  }
  const entries = Array.isArray(r.ledger.entries) ? r.ledger.entries.slice(-300) : [];
  const inventory = {
    portions: Math.max(0, Math.floor(r.inventory?.portions ?? 0)),
    meals: Math.max(0, Math.floor(r.inventory?.meals ?? 0))
  };
  const profile = parseProfile(r.profile);
  return {
    version: 1,
    minute: Math.max(0, r.minute),
    needs,
    ledger: { accounts: { ...accounts }, entries, nextId: r.ledger.nextId ?? entries.length + 1 },
    inventory,
    skills: typeof r.skills === "object" && r.skills ? { ...r.skills } : {},
    incomeCarry: typeof r.incomeCarry === "number" ? r.incomeCarry : 0,
    rentOwed: Math.max(0, r.rentOwed ?? 0),
    lastRentDay: Math.max(0, r.lastRentDay ?? 0),
    profile,
    phone: parsePhone(r.phone, profile),
    lastAllowanceDay: Math.max(0, r.lastAllowanceDay ?? 0),
    warned: {},
    stats: { ...fresh.stats, ...r.stats ?? {} }
  };
}

// packages/game-core/src/catalog.ts
var item = (id, name, category, price, action, toggle) => ({
  id,
  name,
  category,
  price,
  ...action ? { action } : {},
  ...toggle ? { toggle } : {}
});
var FURNITURE = [
  // ---- Seating
  item("sofa_02", "Two-seat leather sofa", "seating", 185e3, "tv"),
  item("sofa_03", "Large lounge sofa", "seating", 34e4, "tv"),
  item("modern_arm_chair_01", "Modern armchair", "seating", 12e4, "tv"),
  item("mid_century_lounge_chair", "Lounge chair", "seating", 21e4, "tv"),
  item("Rockingchair_01", "Rocking chair", "seating", 9e4, "sit"),
  item("dining_chair_02", "Dining chair", "seating", 38e3, "sit"),
  item("painted_wooden_chair_01", "Wooden chair", "seating", 18e3, "sit"),
  item("painted_wooden_chair_02", "Tall wooden chair", "seating", 22e3, "sit"),
  item("WoodenChair_01", "Carved chair", "seating", 45e3, "sit"),
  item("plastic_monobloc_chair_01", "Plastic chair", "seating", 6500, "sit"),
  item("wooden_stool_01", "Wooden stool", "seating", 9500, "sit"),
  item("folding_wooden_stool", "Folding stool", "seating", 7e3, "sit"),
  item("painted_wooden_bench", "Wooden bench", "seating", 32e3, "sit"),
  item("Ottoman_01", "Ottoman", "seating", 4e4, "sit"),
  item("SchoolChair_01", "Office chair", "seating", 28e3, "sit"),
  // ---- Tables and desks
  item("painted_wooden_table", "Large dining table", "tables", 15e4),
  item("dining_table", "Dining table", "tables", 11e4),
  item("round_wooden_table_01", "Round table", "tables", 85e3),
  item("WoodenTable_01", "Long side table", "tables", 6e4),
  item("modern_coffee_table_01", "Modern coffee table", "tables", 55e3),
  item("modern_coffee_table_02", "Square coffee table", "tables", 7e4),
  item("coffee_table_round_01", "Round coffee table", "tables", 62e3),
  item("CoffeeTable_01", "Classic coffee table", "tables", 75e3),
  item("side_table_01", "Side table", "tables", 25e3),
  item("small_wooden_table_01", "Small table", "tables", 2e4),
  item("ClassicConsole_01", "Console table", "tables", 95e3),
  item("metal_office_desk", "Office desk", "tables", 8e4, "work"),
  item("SchoolDesk_01", "Study desk", "tables", 35e3, "work"),
  // ---- Bedroom
  item("p_bed", "Double bed with mattress", "bedroom", 21e4, "sleep"),
  item("GothicBed_01", "Carved wooden bed", "bedroom", 32e4, "sleep"),
  item("vintage_day_bed", "Day bed", "bedroom", 13e4, "sleep"),
  item("painted_wooden_nightstand", "Nightstand", "bedroom", 24e3),
  item("ClassicNightstand_01", "Classic nightstand", "bedroom", 38e3),
  item("GothicCommode_01", "Chest of drawers", "bedroom", 98e3),
  item("p_wardrobe", "Wardrobe", "bedroom", 135e3),
  // ---- Storage
  item("wooden_bookshelf_worn", "Bookshelf", "storage", 7e4, "read"),
  item("painted_wooden_shelves", "Shelves", "storage", 28e3),
  item("steel_frame_shelves_03", "Steel shelving", "storage", 65e3, "read"),
  item("wooden_display_shelves_01", "Display shelves", "storage", 52e3),
  item("modern_wooden_cabinet", "Modern cabinet", "storage", 16e4),
  item("drawer_cabinet", "Drawer cabinet", "storage", 85e3),
  item("painted_wooden_cabinet", "Painted cabinet", "storage", 58e3),
  item("vintage_cabinet_01", "Display cabinet", "storage", 19e4),
  item("chinese_cabinet", "Tall cabinet", "storage", 175e3),
  // ---- Electronics
  item("p_tv_flat", "Flat-screen TV", "electronics", 16e4, "tv"),
  item("television_02", "Television (CRT)", "electronics", 45e3, "tv"),
  item("Television_01", "Classic television", "electronics", 4e4, "tv"),
  item("boombox", "Boombox", "electronics", 3e4, "radio"),
  item("vintage_radio_transceiver", "Radio set", "electronics", 42e3, "radio"),
  item("portable_cassette_player", "Cassette player", "electronics", 12e3),
  item("classic_laptop", "Laptop", "electronics", 28e4, "work"),
  // ---- Kitchen and appliances
  item("p_fridge", "Refrigerator", "appliances", 29e4, "snack"),
  item("electric_stove", "Electric stove", "appliances", 12e4, "cook"),
  item("vintage_microwave", "Microwave", "appliances", 48e3),
  item("vintage_electric_kettle", "Electric kettle", "appliances", 9e3),
  item("p_washer", "Washing machine", "appliances", 26e4),
  item("ceiling_fan", "Ceiling fan", "appliances", 35e3),
  item("p_kitchen_base", "Kitchen base unit", "kitchen", 65e3),
  item("p_kitchen_sink", "Kitchen sink unit", "kitchen", 95e3),
  item("p_kitchen_wall", "Kitchen wall cabinet", "kitchen", 45e3),
  // ---- Bathroom
  item("p_toilet", "Toilet", "bathroom", 85e3, "toilet"),
  item("p_basin", "Washbasin", "bathroom", 52e3, "brush"),
  item("p_shower", "Shower cabin", "bathroom", 14e4, "shower"),
  // ---- Lighting
  item("desk_lamp_arm_01", "Desk lamp", "lighting", 15e3, void 0, "light"),
  item("vintage_oil_lamp", "Oil lamp", "lighting", 8e3, void 0, "light"),
  item("p_floor_lamp", "Floor lamp", "lighting", 22e3, void 0, "light"),
  // ---- Decor
  item("wall_clock", "Wall clock", "decor", 8e3),
  item("mantel_clock_01", "Mantel clock", "decor", 26e3),
  item("potted_plant_01", "Large potted plant", "decor", 3e4),
  item("potted_plant_02", "Potted plant", "decor", 18e3),
  item("potted_plant_04", "Small plant", "decor", 6e3),
  item("ornate_mirror_01", "Ornate mirror", "decor", 45e3),
  item("p_rug", "Patterned rug", "decor", 25e3),
  item("p_doormat", "Doormat", "decor", 3500)
];
var byId2 = new Map(FURNITURE.map((f) => [f.id, f]));

// packages/game-core/src/buildingPlan.ts
var DOOR_WIDTH = 1.2;
var rect = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });
var HOLLOW_LANDMARKS = /* @__PURE__ */ new Set(["police", "hospital", "school", "church", "mosque", "fire", "bank", "hotel"]);
function hasInterior(lot) {
  if (lot.poly) return false;
  if (lot.landmark) return HOLLOW_LANDMARKS.has(lot.landmark);
  return lot.kind === "house" || lot.kind === "flats" || lot.kind === "shop";
}
var THEMES = {
  police: {
    ground: { living: "lobby", kitchen: "office", bedroom: "cell", bath: "bath" },
    upper: { bedroom: "office", hall: "hall" },
    f0: { sofa: "bench", tv: "counter", table: null, counter: "desk", fridge: "shelf", bed: "bunk", shower: "basin" },
    fUp: { bed: "desk", wardrobe: "shelf" }
  },
  hospital: {
    ground: { living: "lobby", kitchen: "pharmacy", bedroom: "ward", bath: "bath" },
    upper: { bedroom: "ward", hall: "hall" },
    f0: { sofa: "bench", tv: "counter", table: null, counter: "counter", fridge: "shelf", bed: "bed", shower: "basin" },
    fUp: { bed: "bed", wardrobe: "drip" }
  },
  school: {
    ground: { living: "classroom", kitchen: "office", bedroom: "office", bath: "bath" },
    upper: { bedroom: "classroom", hall: "hall" },
    f0: { sofa: "board", tv: "desk", table: "desk", counter: "desk", fridge: "shelf", bed: "desk", shower: "basin" },
    fUp: { bed: "desk", wardrobe: "board" }
  },
  bank: {
    ground: { living: "lobby", kitchen: "office", bedroom: "vault", bath: "bath" },
    upper: { bedroom: "office", hall: "hall" },
    f0: { sofa: "bench", tv: "counter", table: "counter", counter: "desk", fridge: "shelf", bed: "safe", shower: "basin" },
    fUp: { bed: "desk", wardrobe: "shelf" }
  },
  hotel: {
    ground: { living: "lobby", kitchen: "dining", bedroom: "dining", bath: "bath" },
    upper: { bedroom: "guestroom", hall: "hall" },
    f0: { sofa: "sofa", tv: "counter", table: "table", counter: "counter", fridge: "fridge", bed: "table", shower: "basin" },
    fUp: { bed: "bed", wardrobe: "wardrobe" }
  },
  fire: {
    ground: { living: "engine", kitchen: "crew", bedroom: "crew", bath: "bath" },
    upper: { bedroom: "crew", hall: "hall" },
    f0: { sofa: "truck", tv: "shelf", table: null, counter: "counter", fridge: "fridge", bed: "bunk", shower: "basin" },
    fUp: { bed: "bunk", wardrobe: "shelf" }
  },
  church: {
    ground: { living: "nave", kitchen: "office", bedroom: "office", bath: "bath" },
    upper: {},
    f0: { sofa: "pew", tv: "altar", table: "pew", counter: "shelf", fridge: "shelf", bed: "desk", shower: "basin" },
    fUp: {}
  },
  mosque: {
    ground: { living: "prayer", kitchen: "office", bedroom: "office", bath: "bath" },
    upper: {},
    f0: { sofa: null, tv: "shelf", table: null, counter: "shelf", fridge: "shelf", bed: null, shower: "basin" },
    fUp: {}
  }
};
function mapper(f, facing) {
  const W = facing === 0 || facing === 2 ? f.maxX - f.minX : f.maxZ - f.minZ;
  const D = facing === 0 || facing === 2 ? f.maxZ - f.minZ : f.maxX - f.minX;
  const at = (u, v) => {
    switch (facing) {
      case 0:
        return { x: f.minX + u, z: f.minZ + v };
      case 2:
        return { x: f.minX + u, z: f.maxZ - v };
      case 1:
        return { x: f.maxX - v, z: f.minZ + u };
      default:
        return { x: f.minX + v, z: f.minZ + u };
    }
  };
  const box = (u0, u1, v0, v1) => {
    const p = at(u0, v0);
    const q = at(u1, v1);
    return rect(Math.min(p.x, q.x), Math.max(p.x, q.x), Math.min(p.z, q.z), Math.max(p.z, q.z));
  };
  return { W, D, at, box };
}
function generatePlan(lot) {
  const f = lot.footprint;
  const m = mapper(f, lot.facing);
  const { W, D } = m;
  const floors = lot.floors;
  const walls = [];
  const rooms = [];
  const stairs = [];
  const furniture = [];
  const shop = lot.kind === "shop";
  const garageW = lot.garage && W > 11 ? 3.6 : 0;
  const mainW = W - garageW;
  const vf = Math.max(4.8, Math.min(D * 0.52, D - 3.2));
  const wall = (floor, along, at, from, to, exterior, openings = []) => {
    const p = along === "u" ? m.at(from, at) : m.at(at, from);
    const q = along === "u" ? m.at(to, at) : m.at(at, to);
    const a = { x: Math.min(p.x, q.x), z: Math.min(p.z, q.z) };
    const b = { x: Math.max(p.x, q.x), z: Math.max(p.z, q.z) };
    const reversed = p.x > q.x || p.z > q.z;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const list = openings.map((o) => {
      const w = o.width ?? (o.kind === "door" ? DOOR_WIDTH : o.kind === "garage" ? 2.8 : 1.2);
      const local0 = o.centre - w / 2 - from;
      const t0 = reversed ? length - (local0 + w) : local0;
      return { kind: o.kind, t0: Math.max(0.1, t0), t1: Math.min(length - 0.1, t0 + w) };
    });
    walls.push({ floor, a, b, exterior, openings: list });
  };
  const room = (id, kind, floor, u0, u1, v0, v1) => {
    const r = { id: `${lot.id}:${id}`, kind, floor, rect: m.box(u0, u1, v0, v1) };
    rooms.push(r);
    return r;
  };
  const frontDoorU = Math.min(mainW * 0.3, mainW - 1);
  if (shop) {
    const vs = D * 0.7;
    room("shop", "shop", 0, 0, W, 0, vs);
    room("store", "store", 0, 0, W, vs, D);
    wall(0, "u", 0, 0, W, true, [{ kind: "door", centre: W * 0.35, width: 1.4 }, { kind: "window", centre: W * 0.72, width: Math.max(2, W * 0.28) }]);
    wall(0, "u", D, 0, W, true, [{ kind: "window", centre: W * 0.5 }]);
    wall(0, "u", vs, 0, W, false, [{ kind: "door", centre: W * 0.8 }]);
    for (const at of [0, W]) wall(0, "v", at, 0, D, true, [{ kind: "window", centre: vs * 0.5 }, { kind: "window", centre: vs + (D - vs) * 0.5 }]);
    for (let k = 0; k < 3; k++) furniture.push({ kind: "shelf", floor: 0, rect: m.box(2.4, W * 0.6, 2.2 + k * 1.6, 2.7 + k * 1.6), height: 1.6 });
    furniture.push({ kind: "counter", floor: 0, rect: m.box(W * 0.62, W * 0.62 + 2.4, 1.2, 1.9), height: 1 });
    for (let k = 0; k < 3; k++) furniture.push({ kind: "crate", floor: 0, rect: m.box(1 + k * 1.3, 1.9 + k * 1.3, vs + 0.5, vs + 1.4), height: 0.7 });
  } else {
    const living = room("living", "living", 0, 0, mainW, 0, vf);
    void living;
    const kW = mainW * 0.4;
    const bW = mainW * 0.72;
    room("kitchen", "kitchen", 0, 0, kW, vf, D);
    room("bedroom", "bedroom", 0, kW, bW, vf, D);
    room("bath", "bath", 0, bW, mainW, vf, D);
    if (garageW) room("garage", "garage", 0, mainW, W, 0, D);
    wall(0, "u", 0, 0, mainW, true, [{ kind: "door", centre: frontDoorU }, { kind: "window", centre: mainW * 0.72 }]);
    if (garageW) wall(0, "u", 0, mainW, W, true, [{ kind: "garage", centre: mainW + garageW / 2, width: 2.8 }]);
    wall(0, "u", D, 0, W, true, [{ kind: "window", centre: kW * 0.5, width: 1.1 }, { kind: "window", centre: (kW + bW) / 2 }, { kind: "window", centre: (bW + mainW) / 2, width: 0.7 }]);
    wall(0, "v", 0, 0, D, true, [{ kind: "window", centre: vf * 0.5 }, { kind: "window", centre: vf + (D - vf) * 0.5, width: 1 }]);
    wall(0, "v", W, 0, D, true, garageW ? [] : [{ kind: "window", centre: vf * 0.5 }]);
    wall(0, "u", vf, 0, mainW, false, [{ kind: "door", centre: kW * 0.5 }, { kind: "door", centre: (kW + bW) / 2 }, { kind: "door", centre: (bW + mainW) / 2, width: 1.1 }]);
    wall(0, "v", kW, vf, D, false);
    wall(0, "v", bW, vf, D, false);
    if (garageW) wall(0, "v", mainW, 0, D, false, [{ kind: "door", centre: Math.min(2.2, vf - 0.8) }]);
    furniture.push({ kind: "sofa", floor: 0, rect: m.box(mainW - 1.1, mainW - 0.3, 1.1, 3.1), height: 0.85 });
    furniture.push({ kind: "tv", floor: 0, rect: m.box(mainW - 2.6, mainW - 0.8, 0.3, 0.8), height: 1.1 });
    furniture.push({ kind: "table", floor: 0, rect: m.box(mainW - 2.6, mainW - 1.7, 1.5, 2.5), height: 0.45 });
    furniture.push({ kind: "counter", floor: 0, rect: m.box(0.3, kW - 0.3, D - 0.9, D - 0.3), height: 0.9 });
    furniture.push({ kind: "fridge", floor: 0, rect: m.box(0.3, 1, vf + 0.3, vf + 1), height: 1.8 });
    furniture.push({ kind: "bed", floor: 0, rect: m.box(kW + 0.4, Math.min(bW - 0.3, kW + 2), D - 2.3, D - 0.3), height: 0.55 });
    furniture.push({ kind: "toilet", floor: 0, rect: m.box(bW + 0.25, bW + 0.85, D - 0.8, D - 0.25), height: 0.7 });
    furniture.push({ kind: "shower", floor: 0, rect: m.box(mainW - 0.95, mainW - 0.25, D - 0.95, D - 0.25), height: 2 });
    if (garageW) furniture.push({ kind: "car", floor: 0, rect: m.box(mainW + 0.7, W - 0.7, 1.4, 5.8), height: 1.5 });
  }
  const toBack = lot.facing === 0 ? 2 : lot.facing === 2 ? 0 : lot.facing === 1 ? 3 : 1;
  const toRight = lot.facing === 0 || lot.facing === 2 ? 1 : 2;
  if (floors > 1) stairs.push({ rect: m.box(0.3, 1.5, vf - 4.2, vf - 1.2), floor: 0, climbs: toBack });
  const hallW = 1.8;
  for (let fl = 1; fl < floors; fl++) {
    const uw = W;
    const half = uw / 2;
    room(`stairs${fl}`, "hall", fl, 0, hallW, 0, vf);
    room(`bed${fl}a`, "bedroom", fl, hallW, half, 0, vf);
    room(`bed${fl}b`, "bedroom", fl, half, uw, 0, vf);
    room(`hall${fl}`, "hall", fl, 0, uw * 0.65, vf, D);
    room(`bath${fl}`, "bath", fl, uw * 0.65, uw, vf, D);
    wall(fl, "u", 0, 0, uw, true, [{ kind: "window", centre: (hallW + half) / 2 }, { kind: "window", centre: half * 1.5 }]);
    wall(fl, "u", D, 0, uw, true, [{ kind: "window", centre: uw * 0.3 }, { kind: "window", centre: uw * 0.82, width: 0.8 }]);
    for (const at of [0, uw]) wall(fl, "v", at, 0, D, true, [{ kind: "window", centre: vf * 0.5 }, { kind: "window", centre: vf + (D - vf) * 0.5, width: 1 }]);
    wall(fl, "u", vf, 0, uw, false, [
      { kind: "door", centre: 0.9 },
      { kind: "door", centre: (hallW + half) / 2 },
      { kind: "door", centre: (half + uw * 0.65) / 2 }
    ]);
    wall(fl, "v", hallW, 0, vf, false);
    wall(fl, "v", half, 0, vf, false);
    wall(fl, "v", uw * 0.65, vf, D, false, [{ kind: "door", centre: (vf + D) / 2, width: 1.1 }]);
    furniture.push({ kind: "bed", floor: fl, rect: m.box(hallW + 0.4, hallW + 2.4, 0.3, 2.3), height: 0.55 }, { kind: "bed", floor: fl, rect: m.box(half + 0.4, half + 2.4, 0.3, 2.3), height: 0.55 });
    furniture.push({ kind: "wardrobe", floor: fl, rect: m.box(half - 0.7, half - 0.15, 3, 4.4), height: 2 }, { kind: "wardrobe", floor: fl, rect: m.box(uw - 0.7, uw - 0.15, 3, 4.4), height: 2 });
    furniture.push({ kind: "toilet", floor: fl, rect: m.box(uw - 0.9, uw - 0.3, D - 0.9, D - 0.3), height: 0.7 });
    if (fl + 1 < floors) {
      const run = Math.min(3, uw * 0.65 - hallW - 1.7);
      stairs.push({ rect: m.box(hallW + 0.1, hallW + 0.1 + run, vf + 1.6, vf + 2.8), floor: fl, climbs: toRight });
    }
    if (shop) furniture.push({ kind: "desk", floor: fl, rect: m.box(uw - 3.2, uw - 1.6, vf + 2.2, vf + 3), height: 0.75 });
  }
  const theme = lot.landmark ? THEMES[lot.landmark] : void 0;
  if (theme) {
    for (const r of rooms) r.kind = (r.floor === 0 ? theme.ground : theme.upper)[r.kind] ?? r.kind;
    const mapped = [];
    for (const item2 of furniture) {
      const to = (item2.floor === 0 ? theme.f0 : theme.fUp)[item2.kind];
      if (to === null) continue;
      mapped.push(to ? { ...item2, kind: to } : item2);
    }
    furniture.length = 0;
    furniture.push(...mapped);
  }
  if (theme && !shop) {
    const seats = lot.landmark === "church" ? "pew" : lot.landmark === "mosque" ? "shelf" : "bench";
    const segs = [[mainW * 0.2 + 0.95, mainW * 0.56 - 0.95], [mainW * 0.56 + 0.95, mainW * 0.86 - 0.95]];
    for (const [a, c] of segs) if (c - a > 1.4) furniture.push({ kind: seats, floor: 0, rect: m.box(a, c, vf - 0.7, vf - 0.2), height: seats === "shelf" ? 1.8 : 0.9 });
    if (lot.landmark === "fire") furniture.push({ kind: "truck", floor: 0, rect: m.box(mainW - 3.2, mainW - 0.5, 0.4, 3.2), height: 2 });
    if (lot.landmark === "school") furniture.push({ kind: "desk", floor: 0, rect: m.box(mainW * 0.64, mainW * 0.64 + 1.1, 1.2, 1.8), height: 0.75 }, { kind: "desk", floor: 0, rect: m.box(mainW * 0.64, mainW * 0.64 + 1.1, 2.4, 3), height: 0.75 });
    if (lot.landmark === "church") furniture.push({ kind: "pew", floor: 0, rect: m.box(mainW * 0.62, mainW * 0.62 + 2.2, 1.2, 1.7), height: 0.9 }, { kind: "pew", floor: 0, rect: m.box(mainW * 0.62, mainW * 0.62 + 2.2, 2.4, 2.9), height: 0.9 });
    if (lot.landmark === "police") furniture.push({ kind: "board", floor: 0, rect: m.box(mainW * 0.4, mainW * 0.4 + 1.8, 0.2, 0.3), height: 2 });
    if (lot.landmark === "hospital") furniture.push({ kind: "drip", floor: 0, rect: m.box(mainW * 0.4 + 1.7, mainW * 0.4 + 1.95, D - 1, D - 0.75), height: 1.8 });
  }
  const inside = m.at(frontDoorU, 1.4);
  return {
    lotId: lot.id,
    floors,
    storey: lot.storey,
    rooms,
    walls,
    stairs,
    furniture,
    inside: shop ? m.at(W * 0.35, 1.4) : inside,
    garage: garageW ? m.box(mainW, W, 0, D) : null
  };
}

// packages/game-core/src/lagosData.ts
var LAGOS_W = 449;
var LAGOS_H = 645;
var LAGOS_CELL = 7;
var LAGOS_RLE = [
  "AEYFAVUAAFcAAQYAAA8BAVQAAFkAAQUAAA8BAVQAAFkAAQUAAA8BAVMAAFoAAQUAAA8BAVEAAFwAAQUAAA8BATQAAgMAARkAAF4A",
  "AQQAAA8BATEAAggAARUAAGAAAQQAAA8BATEAAggAARQAAGEAAQQAAA8BATEAAggAARQAAGEAAQQAAA8BATEAAggAARMAAGIAAQQA",
  "AA8BATEAAggAARMAAGIAAQUAAA4BATEAAggAARMAAGIAAQUAAA4BATIAAgYAARQAAGIAAQUAAA4BAUsAAGMAAQUAAA4BAUsAAGQA",
  "AQQAAA4BAUsAAGQAAQQAAA4BAUsAAGQAAQQAAA4BAUsAAGUAAQQAAA0BAUsAAGUAAQQAAA0BAUsAAGUAAQQAAA0BAUwAAGUAAQMA",
  "AA0BAUwAAGUAAQMAAA0BAUwAAGUAAQQAAAwBAU0AAGQAAQQAAAwBAU0AAGQAAQQAAAwBAU0AAGUAAQMAAAwBAU4AAGQAAQQAAAsB",
  "AU8AAGMAAQQAAAsBAU8AAGMAAQQAAAsBAUUAAAMAAQgAAGIAAQUAAAoBAUQAAAYAAQYAAGMAAQUAAAkBAUQAAAcAAQUAAGMAAQUA",
  "AAkBAUMAAAkAAQQAAGQAAQQAAAkBAUIAAAsAAQQAAGMAAQQAAAkBAUIAAAsAAQQAAGMAAQQAAAkBAUIAAAwAAQQAAGIAAQQAAAkB",
  "AUEAAA0AAQUAAGIAAQQAAAgBAUEAAA4AAQQAAGIAAQQAAAgBAT8AABAAAQUAAGEAAQQAAAgBAT8AABEAAQQAAGEAAQUAAAcBAT4A",
  "ABIAAQQAAGEAAQUAAAcBATwAABUAAQQAAGEAAQQAAAcBATwAABUAAQQAAGEAAQUAAAYBAToAABcAAQQAAGEAAQUAAAYBATgAABoA",
  "AQQAAGEAAQUAAAUBATYAABwAAQUAAGAAAQUAAAUBATQAAB8AAQQAAGEAAQQAAAUBATMAACAAAQUAAGAAAQUAAAQBASoAACoAAQQA",
  "AGAAAQUAAAQBASYAAC4AAQUAAGAAAQQAAAQBASQAADEAAQQAAGAAAQQAAAQBASMAADIAAQUAAF8AAQUAAAMBASIAADMAAQUAAGAA",
  "AQQAAAMBASIAADQAAQQAAGAAAQQAAAMBASEAADUAAQUAAGAAAQQAAAIBASAAADcAAQQAAGAAAQQAAAIBAR8AADgAAQUAAF8AAQQA",
  "AAIBAR4AADoAAQQAAGAAAQQAAAEBAR4AADoAAQUAAF8AAQQAAAEBAR0AADwAAQQAAGAAAQMAAAEBAR0AADwAAQUAAF8AAQQAAAAB",
  "ARwAAD4AAQQAAF8AAQQAAAABARwAAD4AAQUAAF8AAQQAAP8AARwAAD4AAQUAAF8AAQQAAP8AARwAAD8AAQUAAF4AAQQAAP8AARwA",
  "AD8AAQUAAF8AAQQAAP4AARwAAEAAAQQAAF8AAQQAAP4AARwAAEEAAQQAAF8AAQQAAP0AARwAAEEAAQQAAF8AAQQAAP0AARwAAEEA",
  "AQUAAF4AAQUAAPwAARwAAEIAAQQAAF4AAQcAAPoAARsAAEMAAQUAAF0AAQoAAPcAARoAAEUAAQQAAFwAAQ8AAPMAARgAAEcAAQUA",
  "AFkAAR8AAAIAAQYAAN0AARYAAEoAAQQAAEMAAUAAANoAARUAAEsAAQQAAD4AAUYAANkAARMAAE0AAQUAADcAAU4AANcAARAAAFEA",
  "AQQAADIAAVQAANYAAQ8AAFIAAQUAAC0AAVkAANUAAQ0AAFQAAQYAACgAASgAAggAAS0AANUAAQwAAFYAAQUAACMAASkAAgEAAQEA",
  "AgsAAS0AANQAAQwAAFYAAQYAAB0AASoAAgMAAQEAAgEAAQEAAg4AASoAANQAAQwAAFcAAQUAABoAAS4AAhMAASsAANMAAQwAAFcA",
  "AQYAABYAATIAAhQAASsAANEAAQwAAFcAAQcAABIAASAAAgYAARIAAhMAASoAANAAAQMAAAQAAQUAAFcAAQgAAA8AASEAAggAAQgA",
  "AgIAAQkAAhEAASoAANAAAQEAAAcAAQUAAFYAAQoAAAoAASMAAgkAAQYAAgQAAQoAAgIAAQEAAg4AASoAANcAAQUAAFYAAQ8AAAIA",
  "ASYAAgkAAQUAAgYAAQ4AAg0AASoAANcAAQQAAFYAAS4AAgQAAQUAAggAAQYAAgcAAQIAAgIAAQoAAgwAASoAANcAAQUAAFUAAS0A",
  "AgUAAQUAAggAAQcAAgsAAQkAAg0AASsAANYAAQUAAFQAAS4AAgQAAQUAAggAAQUAAg4AAQgAAg4AASsAANUAAQUAAFQAAS4AAgMA",
  "AQUAAggAAQYAAg8AAQcAAg8AASsAANUAAQUAAFMAAS0AAgUAAQQAAggAAQUAAhEAAQcAAg4AASsAANYAAQQAAFIAASMAAgIAAQEA",
  "AgEAAQcAAgUAAQUAAgcAAQQAAhIAAQgAAg0AAS0AANUAAQQAAFEAASEAAggAAQUAAgUAAQUAAgcAAQQAAhIAAQkAAg0AAS0AANQA",
  "AQUAAFAAASAAAgkAAQUAAgUAAQUAAgYAAQUAAhIAAQoAAgwAAS4AANMAAQUAAE8AASEAAgkAAQUAAgUAAQYAAgMAAQcAAhEAAQsA",
  "Ag0AAS0AANQAAQUAAE4AASEAAgoAAQQAAgQAAREAAhEAAQsAAg0AAS4AANMAAQUAAE0AASQAAgkAAQQAAgIAARIAAhAAAQwAAgwA",
  "ATAAANMAAQUAAEwAASMAAgoAARgAAhAAAQUAAgIAAQYAAgsAATAAANMAAQUAAEsAASQAAgoAARgAAg8AAQYAAgMAAQUAAgsAATEA",
  "ANMAAQUAAEoAASQAAgoAARkAAg0AAQYAAgUAAQUAAgoAATIAANIAAQYAAEgAAR4AAgIAAQYAAgkAARkAAgcAAQIAAgQAAQYAAgYA",
  "AQUAAgkAATQAANEAAQUAAEcAAR4AAgIAAQcAAggAAQoAAgEAAQIAAgMAAQwAAgQAAQUAAgEAAQcAAgcAAQUAAggAATUAANEAAQUA",
  "AEYAARQAAgMAAQgAAgIAAQEAAgIAAQMAAggAAQoAAggAAQsAAgEAAQ8AAgcAAQgAAgQAAR4AAgMAAQEAAgEAARMAANIAAQUAAEQA",
  "ARUAAgQAAQcAAgUAAQUAAgUAAQoAAgkAARwAAgUAAQoAAgEAAQMAAgQAARgAAgYAARQAANIAAQUAAEIAARUAAgUAAQYAAgYAAQYA",
  "AgIAAQsAAgoAARwAAgYAAQ0AAgUAARYAAgcAARUAANEAAQUAAEEAARYAAgUAAQYAAgUAAQEAAgEAARMAAgkAARwAAgUAAQ4AAgYA",
  "ARUAAgkAARMAANEAAQYAAD8AARgAAgUAAQYAAgcAAREAAgoAAR0AAgIAAQ8AAggAARMAAgsAARIAAAEAAQEAANAAAQUAAD0AARoA",
  "AgYAAQYAAggAAQ8AAgoAAQUAAgsAAQIAAgcAARMAAgoAARMAAg0AARIAANAAAQYAADsAARsAAgcAAQYAAggAAQ0AAgoAAQUAAhUA",
  "ARMAAgkAARMAAg8AARIAANAAAQUAADkAAR0AAggAAQUAAgcAARAAAggAAQQAAhYAARMAAgkAARMAAg8AARMAANAAAQUAADgAAR4A",
  "AgcAAQYAAgEAAQEAAgQAARAAAggAAQUAAhUAAQsAAgIAAQYAAggAARUAAg4AARUAAM4AAQUAADYAASAAAggAAQUAAgUAARIAAgUA",
  "AQcAAhYAAQkAAgYAAQQAAgYAARcAAgwAARYAAM8AAQUAADQAASEAAgkAAQYAAgEAAQEAAgEAARIAAgQAAQkAAhUAAQgAAggAAQUA",
  "AgMAAQoAAgIAAQ0AAgoAARkAAM0AAQUAADMAAREAAgQAAQ4AAggAAQcAAgIAARIAAgEAAQsAAhYAAQcAAgkAAQ4AAgIAAQEAAgQA",
  "ARAAAgYAARoAAM0AAQUAADAAAQ4AAgEAAQEAAgcAAQ4AAgkAAScAAhUAAQcAAgkAAQwAAgkAARAAAgMAAQEAAgEAARwAAMwAAQYA",
  "AC4AAQ4AAgoAAQ8AAgkAASUAAhUAAQcAAgsAAQsAAgkAATEAAM0AAQUAAC0AAQ4AAgIAAQEAAggAARAAAggAASQAAhMAAQkAAgwA",
  "AQoAAgoAATIAAM0AAQQAACsAAQ8AAgwAARAAAgcAASUAAhMAAQkAAgwAAQkAAgwAATIAAMwAAQUAACcAAQ4AAg4AAQgAAgEAAQoA",
  "AgQAARwAAgIAAQoAAhEAAQoAAgwAAQkAAgwAATIAAM0AAQUAACUAAQwAAgEAAQIAAg8AAQYAAgMAAQgAAgUAAREAAgIAAQgAAgYA",
  "AQcAAhEAAQkAAgwAAQoAAgwAATMAAMwAAQUAACQAAQwAAgIAAQEAAhAAAQYAAgQAAQcAAgQAARIAAgQAAQUAAgEAAQEAAgUAAQUA",
  "Ag0AAQEAAgMAAQsAAgwAAQoAAg0AATIAAM0AAQUAACEAAQsAAhUAAQYAAgQAAR4AAgEAAQEAAgQAAQMAAgcAAQUAAhAAAQwAAgsA",
  "AQoAAg8AATIAAMwAAQUAAB4AAQoAAgIAAQEAAhQAAQgAAgQAAR8AAgIAAQcAAgYAAQUAAhEAAQsAAgoAAQsAAg4AATMAAM0AAQUA",
  "ABIAAQMAAAUAAQsAAhkAAQYAAgcAARAAAgIAAQwAAgIAAQgAAgMAAQgAAhAAAQQAAgMAAQEAAgIAAQMAAgEAARIAAgsAATYAAM4A",
  "AQUAAA4AAQcAAAEAAQ8AAhcAAQYAAggAARAAAgUAARMAAgMAAQkAAg4AAQUAAgIAAQIAAgIAAQQAAgEAAREAAgkAAQEAAgEAATcA",
  "AM0AAQYAAAwAARgAAhcAAQUAAgkAAREAAgIAAScAAgYAAQEAAgEAAQUAAgIAAQIAAgIAAQMAAgMAAREAAgoAATcAAM4AAQUAAAsA",
  "ARcAAhgAAQYAAgkAARIAAgEAATgAAgIAAQMAAgUAAQ8AAgkAATkAAM4AAQUAAAkAARcAAhkAAQUAAgYAAQIAAgEAAVAAAgcAAREA",
  "AgYAAQUAAgIAATMAAM4AAQQAAAcAARgAAhgAAQgAAgUAAVMAAgcAARIAAgEAAQEAAgIAAQQAAgUAATIAAM4AAQUAAAUAARgAAhoA",
  "AQUAAgUAAVUAAgcAARkAAgcAATIAAM0AAQYAAAIAARsAAgEAAQEAAhYAAQYAAgQAASQAAgMAATQAAgEAARoAAgcAATMAAM0AASMA",
  "AhcAAQUAAgQAASUAAgIAAQEAAgEAAQcAAgEAAQEAAgEAASgAAgIAARoAAgcAATMAAM0AASMAAhcAAQYAAgMAARwAAgMAAQUAAgYA",
  "AQUAAgUAARAAAgIAARQAAgMAARkAAggAATQAAMwAASQAAhYAAQYAAgMAARsAAgQAAQUAAgcAAQMAAgYAAQ8AAgMAAQUAAgIAAQgA",
  "AgEAAQMAAgQAARoAAgcAATUAAMoAASYAAhUAAQcAAgEAARsAAgQAAQEAAgIAAQMAAgcAAQMAAgYAAQ8AAgMAAQUAAgMAAQYAAgsA",
  "AQgAAgIAAQ0AAggAATcAAMgAAREAAgEAAQEAAgIAARIAAgEAAQEAAhIAAQ0AAgIAARQAAgcAAQMAAgYAAQUAAgUAARcAAgUAAQQA",
  "AgsAAQIAAgEAAQQAAgQAAQsAAgkAATgAAMYAAQ8AAgEAAQEAAgUAARIAAgMAAQEAAhAAAQ0AAgIAARQAAgcAAQMAAgYAAQUAAgQA",
  "ARcAAgYAAQQAAg8AAQMAAgQAAQgAAgwAATgAAMYAAQ8AAgoAARIAAhEAAQ0AAgMAARMAAgMAAQIAAgIAAQMAAgYAAQUAAgQAARcA",
  "AgYAAQQAAg4AAQQAAgQAAQcAAg0AATkAAMMAAQ8AAgsAAQEAAgEAARIAAhAAAQwAAgUAARIAAgcAAQMAAgYAAQQAAgUAARcAAgYA",
  "AQYAAg0AAQMAAgUAAQUAAg0AATsAAMEAARAAAg4AAQgAAgIAAQgAAgIAAQEAAgwAAQYAAgsAARIAAgcAAQMAAgUAAQQAAgYAAQUA",
  "AgMAARAAAgEAAQIAAgEAARcAAgUAAQQAAgwAAT4AAL8AARAAAhAAAQYAAgQAAQ0AAgkAAQYAAgwAARIAAgEAAQIAAgIAAQYAAgIA",
  "AQUAAgYAAQUAAgQAAQcAAgQAAR8AAgUAAQQAAgkAAUIAAL0AARQAAg0AAQUAAgUAAQ4AAgEAAQEAAgEAAQEAAgEAAQkAAgoAARcA",
  "AgIAAQcAAgIAAQUAAgYAAQQAAgQAAQcAAgMAASAAAgUAAQQAAggAAQgAAgMAATkAALsAARUAAg0AAQUAAgUAARsAAgEAAQEAAgkA",
  "ARgAAgEAAQgAAgEAAQYAAgUAAQQAAgQAAQgAAgEAASEAAgYAAQQAAgQAAQEAAgEAAQgAAgUAATgAALoAARcAAgwAAQUAAgUAARsA",
  "AgsAAScAAgYAAQMAAgUAASoAAgYAAQcAAgEAAQkAAgYAATkAALkAARcAAgwAAQYAAgMAARsAAgwAAScAAgYAAQQAAgMAAR0AAgIA",
  "AQwAAgYAARAAAggAAToAALYAARkAAgwAAQYAAgMAAQUAAgEAARQAAgwAAScAAgUAASQAAgcAAQgAAgYAAQwAAgMAAQEAAggAAToA",
  "AJYAAQEAAB8AARoAAgsAAQUAAgQAAQUAAgMAAQEAAgIAARAAAgsAASgAAgQAASMAAgkAAQcAAgYAAQwAAgwAATsAAI0AAQkAAB4A",
  "ARsAAgsAAQYAAgMAAQQAAggAARAAAgkAASkAAgIAAQEAAgEAARUAAgUAARkAAgUAAQwAAg0AATwAAIYAAQ8AAB0AARwAAgsAAQcA",
  "AgEAAQUAAggAAREAAgcAASsAAgEAARMAAggAARoAAgUAAQsAAg4AAT0AAGwAAQUAAAMAASAAAB0AAR0AAgoAAQ4AAgMAAQEAAgIA",
  "ARMAAgEAAQEAAgIAAUAAAgoAASQAAgEAAQEAAhIAATwAAGUAAS8AABwAAR0AAgsAAQ0AAgMAASEAAgEAAToAAggAASUAAhQAAT0A",
  "AF4AATUAABwAAR0AAgwAAQ0AAgIAASEAAgQAARoAAgIAARQAAgIAAQEAAgEAAQMAAgMAAQEAAgIAAScAAhQAAT0AAFoAATkAABsA",
  "AR0AAgIAAQEAAgoAAS8AAgYAARgAAgMAARQAAgUAARIABQoAARMAAhQAAT0AAFgAATsAABoAASAAAgsAAS4AAggAAQ8AAgQAAQUA",
  "AgIAARIAAggAAQ4ABRIAAQ4AAhMAAT8AAFYAATwAABoAASAAAgoAAS0AAgsAAQ0AAgUAARsAAgQAAQ4ABRkAAQgAAhQAAT8AAFUA",
  "AT0AABoAASMAAgYAAQ4AAgEAAQEAAgIAARsAAgwAAQsAAgcAASsABR0AAQUAAhUAAT8AAFQAAT4AABkAASQAAgEAAQIAAgIAAQ8A",
  "AgUAAQoAAgIAAQ4AAg0AAQoAAgEAAQEAAgUAASgABSAAAQUAAhUAAT8AAFQAAT4AABkAATgAAgYAAQgAAgIAAQ8AAg0AAQoAAgIA",
  "AQEAAgUAASUABSIAAgEAAQQAAhUAAT8AAFQAAT4AABkAATgAAgMAAQEAAgMAAQcAAgMAAQ0AAg4AAQkAAggAASYABSEAAgIAAQQA",
  "AhUAAT8AAFMAAT8AABkAATcAAgYAAQEAAgEAAQUAAgYAAQ0AAg0AAQkAAggAAQYAAgIAAR4ABSEAAgIAAQQAAhQAAUEAAFIAAT8A",
  "ABgAATgAAgcAAQYAAgEAAQEAAgIAAREAAgoAAQoAAggAAQYAAgIAAR4ABSEAAgIAAQQAAhQAAUEAAFIAAT8AABgAATgAAgcAAQUA",
  "AgIAAQIAAgEAARAAAgsAAQoAAgIAAQEAAgMAAQEAAgEAAQcAAgEAAR4ABSEAAgIAAQQAAhQAAUEAAFIAAT8AABgAATEAAgEAAQUA",
  "AgEAAQEAAgMAAQYAAgMAARYAAgkAAQoAAgMAAQEAAgIAAQEAAgEAASYABSEAAQYAAhQAAUIAAFEAAT8AABcAATEAAgIAAQQAAgYA",
  "AQYAAgYAARQAAggAAQQAAgMAAQMAAggAASYABSEAAQUAAhUAAUIAAFIAAT4AABcAASkAAgIAAQUAAgMAAQUAAgQAASAAAgoAAQMA",
  "AgMAAQMAAgMAAQEAAgQAASYABSAAAQcAAhMAAUQAAFEAAT4AABYAASoAAgIAAQUAAgIAAQYAAgUAASEAAggAAQIAAgUAAQMAAgEA",
  "AQMAAgMAASYABSAAAQgAAhEAAUUAAFEAAT4AABYAATIAAgIAAQUAAgUAASEAAggAAQIAAgUAAQMAAgIAAQEAAgQAASYABR8AAQoA",
  "AgUAAQEAAgoAAUYAAFAAAT4AABUAATMAAgEAAQYAAgQAARQAAgEAAQwAAgkAAQMAAgMAAQQAAgEAAQIAAgQAASYABR4AAQwAAgEA",
  "AQMAAgsAAUcAAE8AAT4AABUAAQoAAgEAAQEAAgIAAREAAgEAARMAAgEAAQYAAgQAARAAAgYAAQsAAgkAAQMAAgMAAQgAAgMAAQUA",
  "AgUAAQIAAgMAARgABR0AAREAAgkAAUkAAE4AAT4AABUAAQkAAgIAAQEAAgQAAQ4AAgIAARsAAgMAARIAAgMAAQ0AAgcAAQQAAgQA",
  "AQYAAgQAAQUAAgcAAQEAAgIAARkABRsAARIAAggAAUsAAE0AAT4AABUAAQgAAgwAAQkAAgUAARAAAgEAAQgAAgMAARAAAgQAAQ4A",
  "AgIAAQEAAgQAAQMAAgQAAQYAAgUAAQUAAgoAARkABRoAAQ0AAgEAAQUAAgYAAU0AAE4AAT0AABQAAQkAAgwAAQgAAgcAAQ8AAgIA",
  "AQgAAgEAASMAAgcAAQMAAgUAAQUAAgUAAQUAAgoAARkABRoAAQQAAgEAAQcAAgQAAQEAAgEAAVUAAE0AAT0AABQAAQkAAg0AAQYA",
  "AgkAAQ8AAgEAAQsAAgEAAQEAAgQAAQEAAgEAARkAAgcAAQMAAgYAAQYAAgMAAQUAAgoAARkABRkAAQQAAgIAAQYAAgcAAVUAAEwA",
  "AT4AABQAAQkAAgwAAQEAAgEAAQUAAgkAAQEAAgEAARkAAggAARkAAgcAAQQAAgUAAQUAAgQAAQUAAgcAAQEAAgEAARoABRgAAgEA",
  "AQUAAgEAAQcAAgcAAVUAAEsAAT4AABMAAQkAAg8AAQYAAgoAARgAAgsAARcAAgcAAQMAAgYAAQUAAgQAAQYAAgIAAQIAAgIAARsA",
  "AgEABRcAAgIAAQQAAgMAAQUAAggAAVUAAEsAAT4AABMAAQgAAg8AAQYAAgoAARkAAgsAARcAAgYAAQQAAgcAAQQAAgQAASEAAgIA",
  "AQQAAgIABRUAAQEAAgEAAQIAAwIAAgQAAQQAAgkAAVYAAEoAAT4AABMAAQkAAg0AAQgAAgEAAQEAAgEAAQEAAgQAARoAAgoAAREA",
  "AgEAAQYAAgYAAQQAAgcAAQQAAgQAAR4AAgcAAQIAAgIABRQAAQUAAgYAAQUAAggAAVcAAEgAAT8AABMAAQkAAggAAQEAAgEAAQEA",
  "AgEAAQ0AAgIAARwAAgsAAQ4AAgUAAQUAAgUAAQQAAgcAAQUAAgMAAR0AAgcAAQkABQQAARAAAggAAQQAAggAAVgAAEcAAT8AABMA",
  "AQcAAgoAATAAAgEAAQEAAgcAAQ8AAgYAAQQAAgUAAQQAAgcAAQUAAgQAAQ8AAgMAAQIAAgEAAQYAAggAARwAAgoAAQIAAggAAVoA",
  "AEUAAUAAABMAAQcAAgUAAQEAAgMAATIAAgMAAQIAAgIAAQ8AAgcAAQQAAgUAAQQAAgcAAQUAAgQAAQsAAgsAAQYAAggAARsAAgoA",
  "AQMAAgQAAQEAAgIAAVsAAEQAAUAAABMAAQgAAgEAAQEAAgMAATQAAgIAARQAAgcAAQUAAgUAAQQAAgcAAQUAAgUAAQcAAg8AAQUA",
  "AggAARoAAggAAQYAAgIAAQEAAgIAARAAAgEAAQEAAgkAAUMAAEIAAUEAABMAAQsAAgEAAUoAAggAAQUAAgQAAQUAAgEAAQEAAgUA",
  "AQYAAgMAAQcAAhEAAQQAAggAARsAAggAAQYAAgMAARAAAgwAAQUAAhcAAQgAAgIAAR4AAEAAAUIAABMAARYAAgEAAUEAAgYAAQUA",
  "AgQAAQQAAgkAAQUAAgMAAQUAAhMAAQMAAgkAAQQAAgIAAQEAAhEAAQQAAggAARcAAikAAQQAAgcAAR4AAD8AAUIAABMAARMAAgEA",
  "AQEAAgMAAQ4AAgIAAS4AAggAAQUAAgQAAQUAAggAAQUAAgQAAQMAAhQAAQQAAgkAAQQAAh8AARUAAjYAAQEAAgcAARkAADwAAUIA",
  "ABIAARMAAggAAQYAAgkAAS0AAggAAQYAAgMAAQYAAgcAAQUAAgMAAQQAAhQAAQUAAggAAQQAAh4AARYAAkEAARcAADsAAUIAABIA",
  "ARMAAggAAQUAAgsAASgAAgIAAQIAAggAAQcAAgEAAQYAAggAAQcAAgEAAQQAAhIAAQEAAgEAAQUAAgcAAQUAAh4AARYAAkEAAQEA",
  "AgIAARYAADgAAUMAABIAARIAAggAAQYAAgsAAScAAg0AAQ0AAgkAAQcAAgEAAQQAAhQAAQcAAgUAAQcAAhsAARcAAkoAARIAADYA",
  "AUMAABIAAREAAgoAAQoAAgMAASkAAgUAAQIAAgIAAQIAAgMAAQsAAgsAAQwAAhEAAQEAAgEAAQkAAgMAAQgAAgEAAQEAAgIAAQIA",
  "AhQAARoAAkwAARIAADIAAUMAABIAAQgAAgEAAQEAAgMAAQQAAgsAARUAAgIAAR4AAgMAAQkAAgEAAQsAAgwAAQwAAgMAAQEAAgYA",
  "AQEAAgIAAQIAAgEAARgAAgMAAQMAAgQAAQQAAgkAAR0AAkwAARQAAC4AAUQAABIAAQgAAgQAAQgAAggAARUAAgIAAR8AAgEAARYA",
  "AgwAAQ0AAgIAAQIAAgIAAQEAAgEAAQEAAgMAAR0AAgIAAQwAAgQAASAAAhcAAQIAAjMAARkAACkAAUQAABIAAQkAAgQAAQcAAgcA",
  "ARYAAgMAATUAAgwAAREAAgMAAQMAAgEAAS4AAgEAAQsAAgEAAQEAAgEAARMAAhUAAQQAAgEAAQIAAjIAARwAACQAAUQAABIAAQkA",
  "AgUAAQUAAgcAARcAAgIAATYAAgwAAVEAAgUAAREAAhUAAQ0AAi8AASEAABwAAUUAABIAAQgAAgYAAQcAAgQAARgAAgMAATUAAgwA",
  "AU4AAgIAAQIAAgMAAQIAAgEAAQ4AAhUAAQ8AAgEAAQMAAisAASsAABAAAUYAABIAAQcAAggAAQcAAgMAARgAAgQAATQAAgsAARoA",
  "AgMAAQMAAgEAAS0AAgEAAQEAAgkAAQ0AAhUAARQAAisAAQgAAgIAAScAAAoAAUYAABIAAQgAAggAAQYAAgMAARgAAgQAARsAAgIA",
  "AQEAAgEAARUAAgsAARMAAg8AARIAAgIAAQEAAgYAAREAAgsAAQ0AAhQAARgAAgIAAQEAAiYAAQYAAgUAAQEAAgMAAXEAABIAAQcA",
  "AgkAASEAAgQAARoAAgYAARQAAgoAARMAAg8AARIAAgsAARAAAgwAAQsAAhUAARsAAiUAAQUAAhAAAWwAABIAAQcAAggAASIAAgQA",
  "ARoAAgcAARQAAggAARMAAhAAAREAAg0AAQ8AAg4AAQgAAhQAAQYAAgIAARYAAgIAAQIAAiAAAQQAAhEAAQQAAgIAAWYAABIAAQcA",
  "AggAAQ4AAgEAARMAAgQAARoAAgYAARUAAggAAQgAAgMAAQcAAhAAARIAAg0AAQcAAgIAAQYAAg4AAQcAAhUAAQUAAgMAARoAAiEA",
  "AQMAAh4AAV8AABIAAQcAAgcAAQoAAgEAAQQAAgIAARIAAgMAAQcAAgIAAQEAAgIAAQ0AAggAASQAAgEAAQEAAgMAAQYAAg4AARQA",
  "AgwAAQcAAgMAAQkAAgsAAQYAAhYAAQUAAgMAAR4AAhwAAQQAAiIAAVsAABIAAQcAAgcAAQkAAgIAAQMAAgQAARIAAgIAAQYAAgMA",
  "AQEAAgMAAQwAAgYAASUAAggAAQYAAgIAAQEAAgYAARcAAggAAQEAAgEAAQgAAgUAAQwAAggAAQUAAhYAAQYAAgIAAQsAAgEAAQMA",
  "AgIAAQ0AAgMAAQEAAgIAAQEAAhQAAQUAAiIAAQEAAgEAAQoAAgIAAU0AABIAAQcAAgcAAQgAAgEAAQEAAgIAAQEAAgUAARIAAgMA",
  "AQUAAgUAAQ8AAgUAASUAAgkAAQcAAgMAARoAAgYAAQEAAgEAAQsAAgUAAQ0AAgcAAQUAAhUAARMAAgoAAQoAAgIAAQMAAhYAAQUA",
  "AiQAAQgAAgQAAU0AABIAAQcAAgcAAQcAAgwAARAAAgMAAQcAAgQAAQ8AAgQAASYAAgkAAQkAAgEAARwAAgIAARAAAgQAAQ0AAggA",
  "AQQAAhQAARMAAgwAAQkAAgEAAQMAAhcAAQQAAiUAAQUAAgMAAQIAAgEAAQQAAgIAAUgAABIAAQcAAgcAAQcAAgsAAREAAgMAAQcA",
  "AgMAAQcAAgEAAQcAAgQAAQgAAgMAARwAAgkAARQAAgIAASAAAgUAAQ8AAgcAAQQAAhQAAQIAAgEAARAAAgwAAQEAAgEAAQ0AAhQA",
  "AQUAAiYAAQMAAggAAQEAAgYAAUYAABIAAQgAAgUAAQcAAgoAARMAAgQAAQYAAgEAAQkAAgEAARAAAgcAAQwAAgsAAQQAAgwAAQ8A",
  "AggAAQYAAgIAARMAAgcAAQ4AAggAAQYAAhEAAQIAAgIAAQ4AAhAAASUAAiUAAQQAAhIAAUMAABIAAQcAAgUAAQgAAggAAQEAAgEA",
  "ARMAAgMAARAAAgQAAQ4AAgcAAQoAAg4AAQMAAg4AAQwAAgEAAQEAAggAAQUAAgMAAREAAgQAAQEAAgIAAQYAAgMAAQcAAgcAAQcA",
  "Ag4AAQMAAgQAAQwAAhEAASUAAiQAAQUAAhIAAUMAABIAAQkAAgIAAQcAAg0AAREAAgMAAREAAgIAAREAAgYAAQoAAg0AAQQAAg8A",
  "AQoAAgsAAQYAAgEAAQwAAgIAAQQAAggAAQQAAgQAAQEAAgEAAQUAAggAAQcAAg0AAQMAAgIAAQEAAgIAAQsAAhMAAQIAAgIAAR8A",
  "AiQAAQQAAhMAAUMAABIAAREAAgEAAQEAAgwAARIAAgEAAREAAgIAARIAAgUAAQoAAg4AAQQAAg4AAQEAAgEAAQkAAgwAARIAAgIA",
  "AQQAAgIAAQEAAgQAAQUAAgcAAQQAAggAAQcAAgMAAQEAAggAARMAAhkAAR4AAiQAAQQAAhMAAUMAABEAARIAAgsAAQEAAgEAATsA",
  "AgIAAQsAAg4AAQUAAg8AAQkAAgwAARIAAgEAAQYAAgIAAQIAAgMAAQMAAgcAAQUAAgkAAQwAAgUAARQAAhoAAQEAAgIAARkAAiUA",
  "AQQAAhMAAUMAABEAARMAAgoAAUoAAg8AAQQAAhAAAQEAAgEAAQYAAgwAARAAAgQAARAAAggAAQMAAgkAAQ0AAgEAARcAAhUAAQEA",
  "AggAAQIAAgMAARAAAigAAQQAAhMAAUMAABEAARIAAgwAAUkAAg8AAQMAAhMAAQYAAgwAARAAAgQAAREAAggAAQIAAgkAASQAAiUA",
  "AQIAAgkAAQMAAigAAQUAAhMAAUMAABEAAREAAg8AAUgAAg4AAQMAAhIAAQEAAgEAAQUAAgsAARAAAgUAARAAAgkAAQMAAggAASIA",
  "AjIAAQEAAioAAQQAAhMAAUQAABEAARIAAgIAAQEAAgsAAUkAAgwAAQUAAhQAAQUAAgsAASQAAgoAAQIAAgcAASMAAl0AAQQAAhMA",
  "AUQAABEAARMAAg4AAUkAAgYAAQEAAgMAAQYAAgEAAQEAAhMAAQMAAgwAASUAAgkAAQQAAgYAASEAAl4AAQQAAhMAAUQAABEAARIA",
  "Ag8AAU4AAgUAAQcAAhMAAQQAAgsAASUAAgoAAQcAAgMAASIAAl0AAQQAAhIAAUUAABEAARQAAg0AATAAAgEAASAAAgEAAQgAAhQA",
  "AQMAAgsAASUAAgoAAQgAAgEAASIAAl4AAQQAAhMAAUQAABIAARIAAg8AARgAAgEAARYAAgIAASkAAhMAAQMAAgoAASoAAgYAARUA",
  "AgIAARQAAl4AAQUAAhIAAUQAABIAARIAAg8AARcAAgUAARAAAgUAASkAAhMAAQMAAgsAASoAAgYAARIAAgQAARQAAl0AAQUAAhQA",
  "AUMAABIAARMAAg4AARcAAgYAAQ8AAgQAASoAAgYAAQIAAgsAAQQAAgkAASwAAgUAAREAAgYAARMAAl0AAQUAAhMAAUQAABIAARYA",
  "AgoAARgAAgMAAQEAAgIAAQ8AAgQAASwAAgQAAQUAAggAAQQAAgYAASYAAgQAAQUAAgEAAQIAAgEAAQsAAgIAAQQAAgcAARQAAlwA",
  "AQUAAhMAAUQAABIAAQwAAgUAAQYAAgUAAQEAAgEAARkAAg4AAQgAAgEAAQEAAgEAAUMAAgUAAQYAAgQAAQEAAgEAARkAAggAAREA",
  "AgIAAQQAAgYAAQQAAgYAAQ0AAjAAAQIAAgEAAQEAAiYAAQUAAhIAAUUAABIAAQsAAgYAAQcAAgQAARwAAg4AAQcAAgIAAUMAAgQA",
  "AQcAAgcAARgAAgkAAREAAgEAAQYAAgUAAQQAAgUAAQEAAgQAAQoAAigAAQIAAgQAAQMAAgEAAQIAAgIAAQQAAgMAAQEAAgEAAQUA",
  "AgIAAQEAAhEAAQYAAhIAAUUAABIAAQsAAgYAAQgAAgMAAR4AAgQAAQEAAgYAAQcAAgUAAUEAAgIAAQoAAgUAAQEAAgEAARcAAggA",
  "ARkAAgUAAQQAAgIAAQEAAggAAQgAAiUAAQIAAgEAAQIAAgUAARsAAgUAAQEAAgkAAQUAAhIAAUYAABIAAQsAAgcAAQgAAgMAASEA",
  "AgIAAQEAAgQAAQcAAgEAAVEAAgcAAQIAAgIAAQIAAgQAAQ0AAgcAARoAAgQAAQQAAg0AAQgAAh8AAQEAAgIAAQgAAgEAASIAAgsA",
  "AQUAAhQAAUQAABIAAQwAAgYAAW4AAgYAARgAAhMAAQoAAgoAARgAAgQAAQQAAg0AAQIAAgEAAQcAAh8AARUAAgEAARgAAgkAAQUA",
  "AhMAAUUAABIAAQsAAgcAARoAAgMAAVIAAggAARUAAhQAAQkAAgoAARgAAgEAAQEAAgIAAQQAAgwAAQEAAgQAAQcAAh0AARIAAgYA",
  "AQMAAgUAARAAAgcAAQUAAhQAAUUAABMAAQoAAgQAAQEAAgUAARYAAgQAASQAAgIAAQEAAgEAASgAAgkAARcAAhQAAQgAAggAARsA",
  "AgIAAQUAAhMAAQcAAhkAARQAAgIAAQEAAg4AAQwAAgIAAQEAAgQAAQUAAhUAAUUAABMAAQ0AAgYAARYAAgUAASQAAgUAASYAAgsA",
  "ARYAAgIAAQEAAhEAAQYAAgoAARsAAgMAAQMAAhQAAQkAAhYAARQAAgEAAQEAAhMAAQwAAgEAAQIAAgEAAQUAAhUAAUUAABMAAQ0A",
  "AgEAAQEAAgUAARUAAgMAASQAAgYAASgAAgsAARYAAhIAAQcAAgsAARsAAgEAAQQAAhMAAQsAAhQAARQAAhcAAQEAAgQAAQ8AAhUA",
  "AUUAABMAAQ4AAgQAAQEAAgIAARUAAgMAAQUAAgEAAQcAAgIAARQAAgIAAS0AAgkAARgAAhAAAQgAAgoAARMAAgMAAQsAAhQAAQsA",
  "AgIAAQEAAg4AAQ0AAgQAAQMAAiAAAQ0AAhQAAUYAABMAARAAAgYAARQAAgEAAQEAAgIAAQQAAgMAAQQAAgYAAUAAAgYAARYAAgEA",
  "AQUAAg8AAQcAAgoAARMAAgQAAQsAAhQAAQ4AAgEAAQEAAgEAAQEAAgMAARQAAgUAAQMAAiAAAQsAAhUAAUYAABMAARAAAgYAARwA",
  "AgEAAQcAAgIAAQEAAgMAAUEAAgIAAQEAAgEAARQAAgMAAQUAAg8AAQYAAgoAARMAAgQAAQsAAhQAASkAAgYAAQMAAh0AAQEAAgEA",
  "AQwAAhUAAUYAABMAARAAAgkAAR4AAgQAAQEAAgIAAQEAAgEAAVgAAgQAAQcAAgwAAQUAAgwAARMAAgYAAQgAAhUAASoAAgUAAQcA",
  "AhUAAQMAAgEAAQ4AAhUAAUYAABQAARAAAgcAAR8AAgkAAVkAAgQAAQcAAgoAAQUAAg0AARIAAgMAAQEAAgMAAQcAAhUAASsAAgUA",
  "AQcAAhUAARIAAhUAAUYAABQAARIAAgIAAQEAAgUAARsAAgQAAQEAAgIAAQEAAgIAAVkAAgUAAQgAAgYAAQcAAg0AAREAAggAAQcA",
  "AhUAASwAAgQAAS8AAhQAAUYAABQAARMAAgkAARsAAgMAAQEAAgEAAQgAAgUAAU8AAgUAAQwAAgEAAQcAAgwAARMAAgcAAQgAAhQA",
  "AR0AAgQAAQYAAgIAAQMAAgQAATAAAhMAAUcAABUAARIAAgoAARoAAgIAAQkAAggAATsAAgMAAQoAAgMAAQcAAgMAARAAAg8AARMA",
  "AgEAAQEAAgIAAQoAAhIAAR8AAgMAAQMAAgYAAQMAAgMAATAAAhQAAUcAABYAARIAAgkAARoAAgMAAQgAAgkAATgAAggAAQYAAgYA",
  "AQUAAgYAAQsAAhEAASEAAgYAAQcAAgIAAREAAgUAAQsAAgQAAQUAAgMAAQUAAgIAATEAAhIAAUgAABYAARMAAggAARsAAgMAAQcA",
  "AgoAATYAAgkAAQcAAgUAAQUAAgQAAQwAAhAAAVMAAgMAAQ4AAgIAARYAAhIAAQgAAhEAAUoAABYAARQAAgQAAQEAAgEAAQkAAgEA",
  "ARoAAgwAATgAAgcAAQcAAgUAAQUAAgUAAQwAAg4AAVUAAgEAAQ4AAgMAAQYAAiMAAQEAAgEAAQUAAhIAAUkAABcAARQAAgIAAQsA",
  "AgQAARkAAgsAAQMAAgUAATAAAgcAAQcAAgYAAQQAAgQAAQ4AAgwAAWUAAgIAAQcAAiYAAQQAAhIAAUkAABcAASAAAgIAAQEAAgIA",
  "ARgAAg0AAQMAAgUAAS0AAggAAQgAAgYAAQUAAgQAAQ4AAgoAAWYAAgIAAQcAAiYAAQYAAg8AAUoAABgAAR8AAgYAARkAAgsAAQMA",
  "AgQAAS4AAgEAAQEAAgQAAQsAAgYAAQUAAgIAARAAAgMAATMAAgcAAToAAigAAQQAAhAAAUoAABgAAR8AAgYAAQcAAgEAAREAAgoA",
  "AQQAAgUAARcAAgIAAQEAAgIAARMAAgMAAQwAAgUAAUwAAgoAAQEAAgQAATUAAicAAQMAAhAAAUsAABgAASAAAgUAAQQAAgIAAQEA",
  "AgIAARMAAgQAAQcAAgUAAQ8AAgEAAQcAAgYAASMAAgQAAUcAAhUAATQAAiUAAQUAAg8AAUsAABkAAR8AAgUAAQQAAgYAARMAAgIA",
  "AQgAAgUAAQwAAgUAAQUAAggAASIAAgIAAQEAAgIAAQ0AAgEAATcAAhYAATYAAgMAAQEAAh4AAQUAAhAAAUsAABkAAR8AAgQAAQYA",
  "AgIAAQEAAgMAARwAAgMAARAAAgMAAQUAAgkAASEAAgYAAQkAAgEAAQEAAgUAAR8AAgEAARQAAhIAAQIAAgEAATcAAgIAAQEAAgIA",
  "AQEAAhwAAQUAAg4AAU0AABoAAScAAgcAAR0AAgEAAREAAgEAAQcAAgkAASEAAgcAAQcAAgYAAR0AAgYAARMAAhAAAToAAgMAAQIA",
  "AgQAAQMAAhgAAQUAAg4AAU0AABoAASkAAgUAAQcAAgEAAQEAAgEAAS0AAgkAASEAAgcAAQcAAgMAAQEAAgUAARkAAgUAAQEAAgIA",
  "ARIAAhAAASkAAgEAARAAAgIAAQUAAgEAAQUAAhcAAQUAAg8AAUwAABsAASgAAgUAAQYAAgUAAS4AAgcAASIAAgYAAQcAAgoAARgA",
  "AgIAAQEAAgUAAQQAAgQAAQoAAg8AASIAAgEAAQcAAgIAAQIAAgQAAQkAAgIAAQwAAhYAAQUAAg8AAUwAABsAASkAAgEAAQEAAgEA",
  "AQgAAgcAASoAAgIAAQEAAgUAASMAAgUAAQcAAgsAARcAAggAAQQAAgUAAQkAAgwAASQAAgQAAQQAAggAAQcAAgUAAQwAAhYAAQUA",
  "Ag8AAUwAABwAATAAAgwAAQkAAgIAAR8AAgUAASQAAgUAAQgAAgsAARcAAgUAAQEAAgIAAQMAAgYAAQEAAgEAAQYAAgsAASUAAgQA",
  "AQQAAgkAAQUAAgEAAQEAAggAAQgAAhYAAQUAAhAAAUsAAB0AAS8AAg4AAQcAAgQAAR0AAgMAAQ4AAgMAAQYAAgMAARoAAgwAAQsA",
  "AgEAAQsAAgEAAQYAAgIAAQEAAgcAAQYAAgkAAQsAAgEAAQkAAgIAARAAAgQAAQQAAgkAAQUAAgsAAQkAAgEAAQ0AAgIAAQoAAg4A",
  "AUwAAB0AAS8AAg8AAQcAAgMAAS4AAgMAAQUAAgYAARcAAg4AAQoAAgMAAREAAggAAQgAAgMAAQwAAgIAAQEAAgQAAQYAAgQAAQ4A",
  "AgUAAQUAAggAAQUAAg4AASQAAgkAAU0AAB4AAS8AAg0AAQgAAgQAAS0AAgMAAQUAAgcAARcAAgoAAQEAAgEAAQwAAgQAAQEAAgIA",
  "AQ0AAgEAAQEAAgUAARcAAgcAAQUAAgYAAQwAAgYAAQUAAggAAQUAAhEAASEAAgUAAQEAAgIAAU4AAB4AAS4AAg0AAQgAAgQAAQoA",
  "AgEAASMAAgMAAQUAAgcAARkAAgMAAQIAAgIAAQ4AAgkAAQ8AAgMAARgAAggAAQQAAgQAAQEAAgIAAQkAAggAAQUAAgkAAQQAAhEA",
  "ASEAAgEAAQEAAgUAAU8AAB8AATAAAgoAAQcAAgUAAQcAAgEAAQEAAgMAASIAAgMAAQUAAggAASwAAgsAAQ4AAgIAARQAAg0AAQUA",
  "AgQAAQsAAggAAQUAAgkAAQQAAhIAAQwAAgIAAWgAACAAAS8AAgEAAQEAAggAAQcAAgUAAQcAAgQAASIAAgUAAQMAAgoAASsAAg0A",
  "ASEAAg4AAQYAAgIAAQwAAgIAAQEAAgUAAQUAAgkAAQQAAhEAAQcAAgEAAQIAAgYAAWcAACEAATEAAgcAAQYAAgYAAQUAAgcAASEA",
  "AgUAAQQAAgwAASkAAgsAAR4AAgIAAQEAAg4AAQgAAgIAAQsAAggAAQUAAggAAQUAAhEAAQcAAgsAAQEAAgIAAQEAAgEAAQgAAgIA",
  "AVYAACIAATMAAgIAAQgAAgYAAQQAAggAASEAAgUAAQQAAg0AAScAAgwAARwAAhMAARQAAgkAAQUAAggAAQUAAhEAAQgAAhoAAVUA",
  "ACMAATIAAgEAAQcAAgcAAQUAAgkAAR8AAgcAAQQAAg4AASQAAg0AARsAAhMAARYAAggAAQUAAgkAAQQAAhIAAQUAAhwAAQEAAgEA",
  "AVMAACMAATsAAgYAAQUAAgoAAQUAAgMAAQEAAgEAARMAAgoAAQIAAg8AASIAAg4AARsAAg4AARsAAggAAQUAAgkAAQQAAhIAAQUA",
  "Ah4AAVMAACQAATkAAgYAAQUAAgsAAQUAAgUAAQEAAgIAAREAAgkAAQMAAg4AASAAAhAAAUQAAggAAQUAAgkAAQQAAhIAAQUAAh8A",
  "AVIAACUAATkAAgQAAQYAAgkAAQcAAgwAAQ4AAggAAQQAAg4AAR0AAgEAAQIAAgMAAQQAAgcAAUUAAggAAQUAAgkAAQQAAhIAAQUA",
  "Ah0AAQEAAgMAAVAAACYAATkAAgMAAQcAAgkAAQYAAg4AAQsAAgkAAQQAAg4AARgAAgQAAQEAAgIAAQEAAgMAAQUAAgIAAQEAAgIA",
  "ARAAAgIAASYAAgIAAQ0AAgcAAQUAAgkAAQQAAhIAAQUAAiIAAU8AACcAATYAAgMAAQgAAgkAAQYAAg4AAQwAAgkAAQQAAg4AARcA",
  "AgkAAQEAAgIAARkAAgYAASIAAgMAAQIAAgIAAQgAAggAAQUAAgkAAQQAAhIAAQUAAh8AAQEAAgIAAU8AACcAAUEAAgkAAQgAAgsA",
  "AQwAAgoAAQUAAgEAAQEAAgsAARcAAgwAARgAAgkAAR4AAgkAAQcAAgkAAQUAAgkAAQQAAhIAAQUAAiIAAU8AACgAAUAAAggAAQkA",
  "Ag0AAQwAAggAAQYAAgsAARgAAgwAARgAAggAAR8AAgsAAQQAAgoAAQUAAgkAAQQAAhIAAQUAAiAAAUMAAgQAAQoAACkAAT0AAgoA",
  "AQoAAgEAAQEAAgwAAQ4AAgIAAQwAAgYAAREAAgMAAQYAAgsAARgAAggAAR4AAg4AAQEAAgsAAQUAAggAAQUAAhIAAQUAAiAAAUEA",
  "AgcAAQkAACoAAT0AAggAAQwAAg0AARwAAgEAARMAAgYAAQgAAgkAARkAAgYAAR8AAg4AAQIAAgsAAQMAAgkAAQYAAhAAAQUAAiAA",
  "AQUAAgIAATsAAggAAQgAACsAAToAAgoAAQwAAg0AATAAAgcAAQcAAgkAAT4AAgwAAQUAAgkAAQQAAgkAAQYAAg8AAQYAAh8AAQYA",
  "AgIAAQEAAgEAAQEAAgIAATYAAgkAAQcAACwAATsAAgcAAQ4AAgkAAQEAAgIAATEAAgYAAQgAAgEAAQIAAgUAAT8AAgkAAQcAAgkA",
  "AQQAAgkAAQYAAhAAAQYAAh4AAQYAAggAATUAAgkAAQcAAC0AATsAAgYAAQUAAgIAAQcAAgEAAQIAAgEAAQEAAgcAATEAAgkAAQkA",
  "AgIAAUAAAgkAAQkAAgYAAQcAAggAAQYAAhAAAQUAAh8AAQUAAgQAAQEAAgQAATQAAgoAAQcAAC8AAToAAgYAAQMAAgQAAQ0AAgIA",
  "AQgAAgIAAQIAAgEAASoAAggAAUkAAggAARcAAggAAQYAAg4AAQEAAgEAAQQAAiEAAQMAAgkAAQEAAgIAATEAAg0AAQUAADAAAToA",
  "AgQAAQQAAgUAAQIAAgEAARIAAgcAASoAAgcAAQ4AAgMAARgAAgEAAR8AAgYAAQEAAgEAARcAAggAAQYAAg4AAQYAAiAAAQIAAg4A",
  "ATEAAgEAAQEAAgsAAQUAADEAATsAAgEAAQQAAgsAAQ8AAggAARsAAgEAAQEAAgIAAQwAAgUAAQEAAgIAAQkAAgcAAREAAgUAAQEA",
  "AgIAAR8AAgQAARoAAggAAQUAAg4AAQcAAh8AAQQAAg4AAQEAAgIAAS4AAg0AAQQAADIAAT4AAgwAAQ4AAggAARoAAgcAAQsAAgkA",
  "AQgAAgYAAREAAgoAASEAAgEAARoAAgkAAQQAAg4AAQYAAiAAAQMAAhIAAS0AAgIAAQEAAgoAAQUAADMAAT0AAgwAAQ4AAggAARoA",
  "AggAAQEAAgIAAQgAAggAAQgAAgQAARMAAgwAARIAAgEAAScAAgkAAQQAAg4AAQUAAiAAAQYAAhAAATAAAgsAAQQAADQAAT4AAgwA",
  "AQsAAgkAARkAAg0AAQgAAgIAAQEAAgIAAQEAAgEAAQcAAgYAARAAAgIAAQEAAgsAAREAAgUAAQ0AAgEAAQkAAgMAAQEAAgEAAQgA",
  "AgkAAQQAAg0AAQYAAiAAAQUAAhIAATAAAgsAAQMAADQAAT4AAgwAAQsAAgoAARgAAg8AAQoAAgIAAQgAAgYAARAAAg4AAQsAAgEA",
  "AQIAAgkAAQwAAgwAAQIAAgEAAQcAAgoAAQQAAg0AAQYAAiAAAQYAAhEAAS8AAgwAAQMAADUAAT4AAgsAAQoAAgsAARgAAhAAAQkA",
  "AgEAAQkAAgUAAREAAg4AAQoAAgQAAQEAAggAAQsAAhIAAQUAAgoAAQQAAg0AAQYAAh8AAQUAAhMAAQYAAgIAAScAAgsAAQQAADYA",
  "AT0AAg0AAQgAAgsAARkAAg8AARMAAgIAAQEAAgEAARIAAg0AAQwAAgEAAQEAAgMAAQEAAgYAAQcAAgEAAQIAAhIAAQEAAgEAAQQA",
  "AgoAAQQAAg0AAQYAAh8AAQQAAhQAAQQAAgIAAQEAAgMAAR4AAgIAAQEAAgIAAQMAAgoAAQQAADcAATwAAhAAAQUAAgsAARkAAg8A",
  "ARQAAgIAARUAAgoAAQ4AAgsAAQYAAgMAAQEAAhQAAQMAAgsAAQQAAg0AAQUAAiAAAQQAAhQAAQQAAgkAARoAAgIAAQIAAgIAAQMA",
  "AgoAAQQAADkAASkAAgIAAQ8AAgwAAQEAAgIAAQYAAgsAARoAAg4AATAAAgUAAQwAAgsAAQEAAgIAAQQAAhkAAQQAAgkAAQUAAgwA",
  "AQYAAh8AAQUAAhQAAQQAAgkAAQEAAgEAARcAAgIAAQEAAgQAAQMAAgoAAQQAADoAASUAAgcAAQ8AAgEAAQEAAgcAAQkAAgwAARoA",
  "Ag4AAQYAAgIAARoAAgMAAQEAAgEAAQsAAgIAAQsAAhAAAQMAAhsAAQIAAgkAAQYAAgsAAQYAAgwAAQMAAhEAAQUAAhQAAQUAAgwA",
  "ARUAAgYAAQUAAgsAAQIAADwAASMAAggAARIAAgUAAQgAAgsAAQEAAgEAAQgAAgMAAQ8AAg4AAQUAAgQAARkAAgUAARcAAhEAAQMA",
  "AhsAAQIAAgkAAQYAAgoAAQUAAg4AAQMAAhAAAQYAAhQAAQUAAg8AAREAAgcAAQUAAgsAAQIAAD0AASMAAgEAAQEAAgYAARIAAgUA",
  "AQcAAg0AAQcAAgMAARAAAg4AAQQAAgEAAQEAAgQAARgAAgYAARgAAg0AAQcAAgEAAQQAAhQAAQIAAgkAAQYAAgoAAQUAAg0AAQQA",
  "AhAAAQYAAhMAAQQAAhIAARAAAgcAAQUAAgsAAQIAAD4AASEAAgoAAQ8AAgcAAQQAAhAAAQUAAgQAAREAAg4AAQQAAgcAARgAAgYA",
  "ATAAAgIAAQMAAg4AAQMAAgoAAQQAAgsAAQQAAg8AAQIAAhEAAQUAAhIAAQUAAhUAAQ0AAggAAQUAAgsAAQIAAEAAASAAAggAARQA",
  "AgMAAQMAAgsAAQEAAgIAAQcAAgYAAREAAg0AAQQAAggAARkAAgUAATUAAg0AAQQAAgoAAQMAAgwAAQMAAg0AAQMAAhMAAQMAAhMA",
  "AQYAAhYAAQoAAgoAAQQAAgsAAQIAAEIAASAAAgUAARoAAgsAAQEAAgMAAQUAAgIAAQEAAgYAAREAAg0AAQMAAggAARwAAgMAATUA",
  "AgEAAQIAAgEAAQIAAgYAAQQAAgkAAQQAAgsAAQQAAg0AAQMAAhEAAQQAAhQAAQYAAhcAAQgAAgwAAQUAAgkAAQIAAEMAAR4AAgYA",
  "ARkAAhAAAQQAAgkAARMAAgsAAQUAAgcAAR0AAgEAATkAAgEAAQQAAgIAAQcAAggAAQUAAgkAAQMAAg4AAQMAAhIAAQMAAhQAAQcA",
  "AhYAAQkAAgsAAQYAAggAAQMAAEUAAR0AAgUAARkAAg8AAQUAAgsAARQAAgcAAQcAAgYAAWUAAggAAQUAAggAAQUAAg4AAQIAAhAA",
  "AQYAAhIAAQcAAgEAAQEAAhUAAQoAAgoAAQcAAgYAAQQAAEYAAR0AAgQAARkAAgEAAQEAAg0AAQQAAgwAARcAAgMAAQkAAgQAATMA",
  "AgEAAQEAAgEAAQIAAgQAAQMAAgMAAQIAAgIAASAAAgcAAQYAAgcAAQYAAg0AAQMAAhAAAQYAAhEAAQcAAhgAAQgAAgwAAQoAAgMA",
  "AQQAAEcAAToAAgwAAQYAAgwAAVYAAgMAAQEAAhYAAQMAAgQAAQIAAgIAARIAAgYAAQoAAgIAAQgAAgkAAQEAAgIAAQQAAhAAAQUA",
  "Ag8AAQEAAgEAAQcAAhkAAQgAAgEAAQEAAgoAAREAAEgAATsAAgYAAQEAAgIAAQYAAg0AAVMAAgIAAQEAAhkAAQQAAgkAAQIAAgEA",
  "AREAAgQAARMAAgoAAQYAAg8AAQYAAgwAAQ0AAhgAAQgAAgwAAREAAEgAAT0AAgMAAQgAAgEAAQEAAg0AAVQAAgQAAQEAAhYAAQQA",
  "Ag4AARAAAgMAARMAAgoAAQYAAg8AAQYAAgoAARAAAhYAAQkAAgwAAQkAAgIAAQYAAEgAAT8AAgEAAQcAAhEAARYAAgIAAQkAAgEA",
  "ATIAAgEAAQQAAgQAAQMAAg4AAQQAAg4AAQEAAgIAAQ4AAgEAARQAAgkAAQcAAg8AAQYAAgoAAQ8AAhMAAQIAAgEAAQoAAgwAAQYA",
  "AgIAAQEAAgMAAQUAAEkAAUUAAg8AAQEAAgIAARYAAgIAAQgAAgQAATwAAgIAAQEAAgoAAQUAAhIAASIAAgkAAQcAAg8AAQcAAggA",
  "AREAAhIAAQ0AAgwAAQYAAgcAAQQAAEoAAUQAAhIAARUAAgUAAQQAAgcAAToAAgIAAQIAAgkAAQcAAhMAARYAAgMAAQgAAgcAAQgA",
  "Ag4AAQkAAgUAARMAAgEAAQEAAhAAAQ0AAgwAAQQAAgkAAQQAAEsAAUQAAg0AAQEAAgEAAQwAAgIAAQoAAg8AAUIAAgIAAQoAAhIA",
  "AQEAAgEAARUAAgUAAQoAAgIAAQkAAg0AAQsAAgQAARgAAgwAAQ8AAgoAAQUAAgkAAQQAAE0AAUEAAg8AAQkAAgkAAQUAAhAAASwA",
  "AgcAAQUAAgEAARYAAhQAARMAAggAARQAAg0AARQAAgIAARMAAgkAAREAAggAAQQAAgsAAQQAAE4AAT8AAg4AAQwAAggAAQUAAhAA",
  "AR4AAgIAAQsAAg8AARgAAhEAARIAAgoAARQAAgsAARQAAgMAAQgAAgIAAQsAAgcAAQkAAgEAAQkAAgUAAQUAAgsAAQQAAFAAAT4A",
  "AgsAAQ8AAggAAQUAAhAAARsAAgUAAQ0AAgQAAQEAAggAARoAAgMAAQEAAgoAAQgAAgMAAQgAAgkAARQAAgwAAR0AAgQAAQwAAgUA",
  "AQgAAgMAAQkAAgIAAQcAAgsAAQQAAFIAAQIAAAYAATQAAgEAAQEAAgcAAREAAgkAAQUAAgEAAQEAAgcAAQIAAgEAAR0AAgIAAQEA",
  "AgUAAQwAAgYAAQEAAgUAAQUAAgUAARcAAgcAAQcAAgQAAQgAAggAARQAAg0AAQYAAgEAARUAAgYAAQ0AAgMAAQYAAgMAAQIAAgEA",
  "ARMAAgoAAQMAAFwAATMAAgUAARQAAgoAAQYAAgUAARQAAgEAAQEAAgQAAQgAAgkAAQsAAgcAAQEAAgcAAQEAAgEAAQEAAgYAARcA",
  "AgUAAQYAAgYAAQcAAggAARQAAgwAAQUAAgQAARUAAgUAAQ8AAgEAAQcAAgYAARIAAggAAQUAAF4AAT0AAgIAAQEAAgEAAQcAAgwA",
  "AQcAAgIAAQkAAgEAAQwAAgcAAQYAAgsAAQsAAgMAAQEAAhQAARgAAgIAAQcAAggAAQQAAggAARQAAgwAAQcAAgQAAQEAAgIAARAA",
  "AgcAAQIAAgMAAREAAgYAAQMAAgMAAQsAAggAAQYAAF8AAToAAgoAAQIAAg0AAREAAgMAAQcAAgEAAQEAAgsAAQUAAgoAAQsAAgEA",
  "AQIAAgUAAQEAAg8AAQkAAgEAARYAAgoAAQMAAggAARMAAg0AAQYAAgYAAQEAAgIAAQ8AAg0AARAAAg4AAQkAAgkAAQUAAGAAATgA",
  "AhsAAQ8AAgUAAQYAAg0AAQQAAgoAAREAAhMAAQQAAgIAAQIAAgIAARYAAgoAAQQAAgUAARQAAgwAAQcAAg0AAQ4AAgwAARAAAg4A",
  "AQgAAgkAAQUAAGAAATcAAg4AAQMAAgsAAQ0AAggAAQQAAg4AAREAAgIAAQEAAgUAAQkAAhAAAQQAAgYAARUAAgIAAQEAAggAAQUA",
  "AgEAARcAAgwAAQYAAg4AAQEAAgIAAQwAAg0AAQ4AAg8AAQcAAgcAAQcAAGEAATYAAg0AAQMAAgwAAQsAAgsAAQQAAg0AARAAAgEA",
  "AQEAAgcAAQsAAgMAAQEAAgoAAQQAAgYAAQUAAgYAAQ4AAgIAAQIAAgMAAQUAAgEAARcAAg0AAQMAAhQAAQsAAg4AAQ4AAg8AAQYA",
  "AgUAAQkAAGIAATgAAgkAAQMAAg0AAQoAAg0AAQMAAgsAAQEAAgEAARAAAgoAAQ8AAggAAQUAAgcAAQMAAggAAREAAgIAAR0AAg0A",
  "AQUAAhMAAQ0AAgEAAQUAAgQAAQEAAgIAARIAAgsAAQEAAgMAAQMAAgIAAQoAAGQAATcAAgcAAQQAAg0AAQoAAg4AAQMAAgsAARAA",
  "AgsAAREAAgYAAQQAAggAAQIAAgoAAS8AAg0AAQUAAhMAARMAAgUAAQgAAgIAAQ0AAgwAAQ8AAGYAATYAAgcAAQMAAg0AAQoAAg0A",
  "AQUAAgoAAQ8AAg8AARAAAgIAAQYAAgcAAQQAAggAAQEAAgEAAS0AAg4AAQQAAhQAAQcAAgEAAQsAAgIAAQEAAgEAAQcAAgUAAQ0A",
  "AgwAAQ4AAGcAASMAAgMAARAAAgYAAQQAAgsAAQwAAgwAAQUAAgsAAQ4AAg8AARAAAgEAAQcAAgcAAQQAAg8AASYAAg8AAQUAAhIA",
  "AQcAAgYAARIAAgcAAQ4AAg0AAQsAAGgAASIAAgMAARAAAgYAAQQAAgsAAQ0AAgwAAQQAAgsAAQ4AAhAAARcAAgYAAQUAAg4AAQEA",
  "AgUAASMAAg0AAQUAAhMAAQYAAgcAARAAAgcAARAAAgkAAQEAAgIAAQsAAGoAASEAAgEAARIAAgEAAQEAAgMAAQQAAggAAQUAAgMA",
  "AQoAAgsAAQQAAggAARAAAhEAAQgAAgMAAQMAAgEAAQcAAgYAAQUAAhYAASIAAgwAAQQAAhQAAQUAAgcAAQEAAgIAAQ4AAggAARAA",
  "AgwAAQoAAG0AASMAAgQAAQwAAgQAAQQAAgIAAQIAAgIAAQUAAggAAQgAAgoAAQYAAgQAARIAAhAAAQYAAgoAAQYAAgYAAQQAAhsA",
  "AR8AAggAAQEAAgEAAQUAAhIAAQYAAgwAAQ0AAgcAARAAAg8AAQgAAG4AASEAAgUAAQwAAgIAARAAAgoAAQgAAgoAAQUAAgIAARQA",
  "Ag8AAQYAAgwAAQUAAgYAAQQAAhwAAR8AAgYAAQoAAhAAAQYAAgwAAQ0AAgMAAQsAAgMAAQgAAg0AAQgAAG8AASMAAgEAAQ4AAgEA",
  "AQ8AAgsAAQEAAgEAAQoAAgUAAR0AAgEAAQEAAgwAAQYAAg0AAQMAAgYAAQUAAhwAAS8AAhAAAQYAAg4AARkAAgYAAQQAAg4AAQgA",
  "AHAAAUEAAg4AAQcAAgcAAQ4AAgYAAQoAAg0AAQYAAgwAAQQAAgYAAQUAAhwAATAAAgMAAQEAAgoAAQYAAgwAAQEAAgMAARgAAgIA",
  "AQEAAgUAAQIAAg8AAQcAAHIAAT0AAhEAAQcAAgIAAQIAAgMAAQ0AAgUAAQoAAg0AAQgAAgIAAQEAAggAAQMAAgcAAQQAAh4AATMA",
  "AgkAAQcAAhAAARkAAgEAAQEAAgUAAQIAAg4AAQgAAHQAATsAAhIAAQsAAgEAAQ0AAgYAAQ4AAgkAAQwAAgMAAQEAAgEAAQEAAgEA",
  "AQIAAgkAAQIAAh8AARIAAgUAAS0AAgwAAQEAAgIAAQYAAgIAARIAAhUAAQkAAHYAATgAAhIAAQEAAgIAARYAAgcAARMAAgQAAQ0A",
  "AgMAAQQAAgkAAQMAAh8AAQYAAgMAAQgAAgYAAQMAAgMAAQMAAgEAASIAAgwAAQkAAgUAAQ8AAhYAAQkAAHgAATUAAhYAARMAAgoA",
  "AQUAAgIAAQwAAgQAAQ0AAgEAAQcAAgcAAQQAAiAAAQUAAgMAAQYAAg4AAQIAAgMAAQoAAgEAARcAAgwAAQcAAgEAAQEAAgQAARAA",
  "AhUAAQkAAHkAATUAAhYAARAAAgsAAQUAAgYAAQoAAgIAARYAAgcAAQQAAiAAAQ0AAhUAAQgAAgMAARcAAgoAAQcAAgwAAQwAAgcA",
  "AQEAAg0AAQgAAHsAATUAAhcAAQwAAgsAAQYAAgcAASEAAgcAAQMAAiEAAQ0AAhYAAQUAAgYAARkAAgkAAQQAAhEAAQgAAgMAAQEA",
  "AgsAAQEAAgQAAQkAAH0AATcAAhIAAQ4AAgkAAQcAAgkAAR8AAgQAAQEAAgIAAQIAAiQAAQsAAhYAAQQAAg0AARQAAgEAAQMAAgIA",
  "AQYAAhAAAREAAgsAAQoAAH4AATUAAhcAAQoAAgkAAQkAAggAAR8AAgQAAQUAAiQAAQwAAhQAAQQAAg4AASAAAg8AARIAAgkAAQsA",
  "AIAAATcAAhIAAQsAAgYAAQEAAgEAAQsAAgYAAQEAAgIAAQ4AAgIAARYAAiUAAQsAAhQAAQQAAg0AASIAAg8AARIAAgEAAQMAAgMA",
  "AQwAAIIAATUAAhMAAQsAAgEAAQEAAgQAAQ0AAgkAAQEAAgEAAQoAAgYAARIAAiYAAQ0AAhIAAQUAAg4AAQkAAgEAARYAAg4AAQEA",
  "AgEAASQAAIMAATQAAhMAAQ4AAgMAAQUAAgMAAQUAAgsAAQoAAgEAAQEAAgQAARIAAiUAAQ4AAhIAAQUAAhMAAQMAAgIAAQEAAgMA",
  "ARIAAgEAAQEAAg8AASMAAIQAATQAAhEAARYAAgQAAQcAAggAAQ0AAgEAAQEAAgEAARMAAiUAARAAAhAAAQQAAhIAAQQAAggAARQA",
  "Ag4AASMAAIYAATQAAg8AAQUAAgUAAQwAAgYAAQcAAgcAASMAAiUAAREAAgQAAQEAAgEAAQEAAgQAAQEAAgEAAQUAAhEAAQUAAggA",
  "ARcAAgkAAQQAAgEAASAAAIgAATUAAgwAAQQAAgYAAQ0AAgIAAQEAAgMAAQgAAgIAAQEAAgIAARYAAgMAAQsAAiUAARgAAgEAAQEA",
  "AgEAAQcAAhEAAQQAAgoAAQEAAgEAARQAAgYAAQcAAgEAAR4AAgIAAIkAATQAAgEAAQEAAgoAAQIAAgkAAQsAAgIAAQEAAgYAAQkA",
  "AgEAARYAAgUAAQsAAiUAAQcAAgIAARgAAgIAAQEAAg0AAQUAAgwAARcAAgMAAQYAAgMAAR4AAgEAAIsAATMAAgIAAQIAAgUAAQMA",
  "AgsAAQoAAgoAARMAAgEAAQ0AAgEAAQ4AAiIAAQcAAggAARgAAg0AAQUAAgsAAQoAAgIAARkAAgMAARkAAgEAAIwAATIAAgEAAQQA",
  "AgMAAQQAAgsAAQkAAgMAAQEAAgoAAQoAAgIAAQIAAgQAAQwAAgMAAQEAAgIAAQwAAh8AAQcAAgkAAQEAAgEAARYAAgsAAQQAAg4A",
  "AQkAAgMAAQEAAgEAARcAAgMAAQoAAgMAAQkAAgMAAI4AAT0AAgsAAQkAAgEAAQEAAgwAAQkAAgEAAQIAAgUAAQ0AAgcAAQsAAh4A",
  "AQQAAg8AARYAAgoAAQQAAgwAAQcAAgQAAQEAAgUAARYAAgIAAQgAAgcAAQcAAgQAAJAAASMAAgYAARIAAgwAAQoAAg0AAQcAAgoA",
  "AQsAAgkAAQsAAh0AAQQAAg4AAQEAAgIAAQUAAgIAAREAAgIAAQEAAgIAAQQAAg0AAQUAAgwAASAAAgcAAQgAAgMAAJIAASEAAgYA",
  "ARIAAgwAAQsAAgwAAQcAAgoAAQsAAgkAAQEAAgEAAQoAAhwAAQMAAhMAAQEAAgEAAQEAAgYAARcAAgwAAQUAAg4AAR4AAgcAAQkA",
  "AgMAAJMAASAAAgYAARMAAgwAAQ0AAgQAAQEAAgMAAQEAAgEAAQUAAgsAAQwAAgEAAQEAAgoAAQkAAhoAAQQAAiAAARQAAgcAAQIA",
  "AgEAAQYAAg8AARwAAggAAQkAAgMAAJQAAR8AAgUAARUAAgsAARMAAgUAAQMAAgwAAQ4AAgEAAQEAAgoAAQkAAgEAAQEAAhQAAQYA",
  "AgEAAQEAAh8AAQIAAgEAAREAAgcAAQgAAg8AARwAAggAAQgAAgQAAJYAAR0AAgUAARcAAggAARIAAgIAAQEAAgQAAQMAAgwAAQ8A",
  "AgwAAQoAAhQAAQcAAh0AAQEAAgYAARAAAgYAAQkAAgoAAQEAAgMAAQUAAgYAAQEAAgIAAQ8AAgcAAQkAAgQAAJkAARsAAgMAARgA",
  "AgUAAQsAAgQAAQcAAgIAAQEAAgIAAQIAAg4AARAAAg0AAQkAAgMAAQEAAg4AAQcAAiUAARAAAgUAAQoAAg0AAQQAAgsAAREAAgQA",
  "AQkAAgUAAJoAARoAAgIAARkAAgIAAQEAAgMAAQUAAgEAAQIAAgcAAQ4AAg4AAQMAAgMAAQkAAg4AAQoAAhAAAQkAAiMAAQEAAgIA",
  "ARoAAg4AAQUAAg0AARAAAgIAAQoAAgUAAJsAATcAAgIAAQYAAgoAAQEAAgEAAQ0AAgsAAQQAAgUAAQ0AAgsAAQoAAg4AAQkAAiAA",
  "AQIAAgUAARkAAgwAAQcAAgwAAR4AAgQAAJwAAT8AAgwAAQwAAgsAAQQAAgUAAQ0AAgEAAQEAAgsAAQsAAgUAAQIAAgMAAQoAAicA",
  "ARkAAgsAAQgAAgwAAR0AAgUAAJ4AATwAAgwAAQEAAgEAAQsAAgsAAQUAAgMAAQ8AAg0AAR4AAiYAAQcAAgEAAQEAAgEAARAAAgoA",
  "AQcAAgsAAQEAAgIAAR8AAgIAAQEAAKEAAToAAg0AAQIAAgEAAQgAAgoAAQYAAgMAAQYAAgIAAQgAAgwAAR8AAiQAAQYAAgUAARQA",
  "AgIAAQoAAgwAAQcAAgcAARcAAKIAAToAAhAAAQYAAggAAQYAAgYAAQUAAgUAAQcAAgwAAQEAAgEAAR8AAiEAAQYAAgUAAR8AAg0A",
  "AQgAAgMAAQIAAgMAARUAAKQAATYAAhEAAQcAAgcAAQcAAgUAAQYAAgUAAQgAAg0AAQIAAgEAAR8AAgMAAQIAAhoAAQUAAgYAAR8A",
  "Ag0AAQYAAgkAARUAAKUAATcAAg8AAQcAAgYAAQcAAgYAAQUAAggAAQYAAhMAASAAAhkAAQEAAgEAAQQAAggAAR0AAgwAAQUAAgEA",
  "AQEAAgkAARYAAKcAATQAAhAAAQUAAgUAAQkAAgYAAQYAAgkAAQgAAhIAAQQAAgIAAQYAAwQAARAAAgQAAQEAAhMAAQUAAgcAAQgA",
  "AgQAARQAAgMAAQIAAgEAAQcAAgMAAQEAAgUAAQEAAgMAARYAAKkAATMAAg8AAQQAAgYAAQoAAgUAAQUAAg0AAQgAAhUAAQUAAwcA",
  "ARUAAhEAAQUAAggAAQUAAgcAARMAAgEAAQ0AAgkAAQEAAgEAARcAAKoAATMAAg4AAQMAAgIAAQEAAgQAAQoAAgYAAQQAAg4AAQcA",
  "AgIAAQEAAhIAAQQAAwsAARIAAhEAAQYAAgcAAQUAAggAASAAAgkAAQcAAgQAAQ4AAK4AATEAAgsAAQQAAggAAQkAAgUAAQUAAg4A",
  "AQgAAhMAAQUAAxAAARAAAgIAAQEAAgsAAQUAAggAAQQAAgoAAR8AAgkAAQkAAgMAAQ0AALEAATAAAgMAAQEAAgIAAQYAAgoAAQkA",
  "AgMAAQYAAg4AAQgAAhMAAQQAAxQAAREAAgEAAQIAAgUAAQEAAgEAAQQAAgEAAQEAAgYAAQQAAgsAAR8AAggAAQkAAgQAAQ0AALMA",
  "AS8AAgMAAQcAAgwAAQkAAgIAAQUAAgEAAQEAAg4AAQgAAhEAAQUAAxgAARAAAgIAAQEAAgIAAQYAAgcAAQQAAgEAAQEAAgYAAQEA",
  "AgEAASEAAgEAAQEAAgQAAQoAAgQAAQ4AALQAAS8AAgEAAQgAAgsAAQEAAgEAAQ8AAhMAAQcAAhAAAQMAAxsAARoAAgUAAQQAAgsA",
  "ASMAAgIAAQkAAgcAAQ4AALYAATYAAg0AARAAAhUAAQYAAgwAAQUAAyAAARYAAgMAAQUAAgsAAQUAAgYAAQgAAgIAARoAAgYAAQ4A",
  "ALcAATUAAg8AAQEAAgIAAQsAAhUAAQgAAgkAAQYAAyQAARMAAgEAAQUAAgkAAQcAAggAAQYAAgIAAQIAAgMAAQEAAgEAARMAAgcA",
  "AQ4AALgAATQAAhMAAQkAAhYAAQkAAggAAQUAAykAARQAAgkAAQcAAggAAQEAAgEAAQUAAgYAAQEAAgMAAREAAggAAQ4AALkAATQA",
  "AhEAAQoAAhUAAQEAAgIAAQgAAgYAAQYAAysAARIAAgQAAQIAAgEAAQcAAgwAAQYAAgoAAQEAAgEAAQwAAgEAAQEAAggAAQ4AALsA",
  "ATIAAhEAAQwAAhYAAQgAAgYAAQUAAy8AARAAAgIAAQoAAg4AAQUAAgwAAQwAAgoAAQ4AAL0AATEAAhAAAQ0AAhgAAQgAAgEAAQcA",
  "AzAAAQwAAgYAAQcAAg8AAQcAAgcAAQEAAgIAAQ0AAgkAAQ8AAL4AATEAAhAAAQ4AAgEAAQIAAhQAAQ8AAzEAAQoAAgYAAQgAAg8A",
  "AQgAAgYAAREAAggAAQ8AAL8AATQAAgwAAQ4AAgEAAQMAAhQAAQ0AAzQAAQkAAgUAAQkAAg4AAQkAAgIAARMAAgkAAQ8AAMAAATMA",
  "AgwAAQYAAgEAAQcAAgEAAQIAAhYAAQsAAzYAAQkAAgIAAQEAAgEAAQUAAhIAAR8AAggAAQ8AAMIAATIAAgsAAQUAAgUAAQEAAgEA",
  "AQUAAgIAAQEAAhQAAQkAAzgAAREAAhIAARYAAgEAAQgAAggAAQ8AAMQAATEAAgYAAQEAAgMAAQMAAgYAAQEAAgIAAQgAAhUAAQcA",
  "AzsAAQwAAhUAARYAAgEAAQcAAgkAAQ8AAMUAATQAAgUAAQIAAgoAAQwAAhIAAQcAAzwAAQkAAhcAAREAAggAAQYAAggAAQ8AAMcA",
  "AToAAgwAAQgAAhIAAQEAAgEAAQYAAz0AAQgAAhYAARIAAggAAQUAAgkAAQ8AAMgAATgAAg8AAQcAAhMAAQYAAz4AAQcAAhIAAQEA",
  "AgEAAQ8AAgEAAQIAAgoAAQUAAgkAAQ8AAMkAATcAAhAAAQcAAhMAAQYAAz4AAQYAAgEAAQEAAhAAAQ8AAg8AAQUAAgkAAQ8AAMsA",
  "ATQAAhIAAQgAAgIAAQEAAg8AAQUAAz8AAQYAAgwAAQIAAgEAAREAAhAAAQQAAggAAQ8AAgEAAMwAATMAAhEAAQEAAgIAAQgAAhEA",
  "AQUAAz8AAQUAAgIAAQEAAgcAAQEAAgEAARMAAhEAAQQAAggAAQ8AAgEAAM4AATEAAhQAAQkAAg8AAQcAAz4AAQYAAgIAAQEAAgUA",
  "ARgAAg8AAQUAAgcAAQ4AAgIAAM8AASEAAgMAAQ0AAhMAAQEAAgMAAQYAAhAAAQUAAz8AAQYAAgIAAQEAAgEAAQ0AAgMAAQEAAgQA",
  "AQcAAg4AAQQAAggAAQ8AAgEAANAAAR8AAgQAAQ4AAhUAAQgAAhEAAQMAAz8AAQkAAgEAAQ0AAgMAAQEAAgUAAQYAAg4AAQQAAgcA",
  "AQ8AAgIAANEAAR0AAgUAAQ8AAhQAAQgAAgEAAQEAAg4AAQUAA0AAARMAAgwAAQUAAg4AAQUAAgUAARAAAgIAANMAARsAAgUAARAA",
  "AgwAAQEAAgIAAQEAAgIAAQwAAgIAAQEAAgkAAQcAA0EAAQ0AAhEAAQYAAgwAAQYAAgUAAREAANQAARsAAgQAAREAAgoAAQEAAgYA",
  "ARAAAgcAAQoAAz8AAQwAAgEAAQEAAhAAAQYAAg0AAQQAAgYAAREAANUAARoAAgMAARMAAggAAQEAAgcAARAAAgYAAQwAAz4AAQwA",
  "AhIAAQYAAg4AAQMAAgUAARIAANcAATQAAhIAARsAAz4AAQoAAhMAAQYAAg0AAQMAAggAARAAANgAATQAAhMAARsAAzsAAQcAAgMA",
  "AQEAAhMAAQcAAgoAAQEAAgEAAQMAAgYAAQcAAgIAAQkAANkAATMAAhUAARoAAzoAAQcAAhgAAQYAAgwAAQMAAgEAAQEAAgMAAQgA",
  "AgMAAQgAANsAATEAAgMAAQIAAhEAAQ8AAgEAAQQAAgEAAQYAAzgAAQYAAhkAAQUAAg0AAQMAAgYAARIAAN0AATEAAgIAAQEAAgUA",
  "AQEAAgIAAQEAAgEAAQEAAgcAAQwAAggAAQcAAzcAAQYAAhgAAQYAAg0AAQQAAgEAAQEAAgQAAREAAN4AATAAAgIAAQEAAgQAAQEA",
  "AgQAAQEAAggAAQwAAgkAAQYAAzcAAQUAAhsAAQYAAgsAAQUAAgUAAQYAAgIAAQkAAN8AATQAAgEAAQEAAg4AAQwAAgsAAQUAAzYA",
  "AQYAAhoAAQYAAgoAAQYAAgQAAQYAAgIAAQEAAgEAAQgAAOEAATQAAg8AAQcAAgIAAQIAAgwAAQUAAzYAAQQAAhwAAQQAAgsAAQYA",
  "AgMAAQcAAgIAAQEAAgIAAQcAAOMAATMAAgMAAQIAAggAAQYAAgMAAQMAAg4AAQQAAzUAAQcAAhgAAQUAAggAAQEAAgEAAREAAgYA",
  "AQQAAgIAAOQAATMAAgIAAQIAAggAAQYAAgQAAQEAAg0AAQcAAzQAAQYAAhcAAQgAAgYAARQAAgcAAQMAAgIAAOYAATEAAgQAAQEA",
  "AgYAAQcAAhIAAQgAAzQAAQYAAgQAAQIAAg8AAQkAAgUAARUAAgEAAQEAAgYAAQEAAgMAAOcAAS8AAgEAAQEAAgsAAQYAAhMAAQgA",
  "AzMAAT4AAgwAAOgAAS4AAg0AAQUAAgEAAQEAAhMAAQEAAgEAAQUAAzQAAT4AAgsAAOoAAS0AAgoAAQcAAhoAAQMAAzUAAT0AAgoA",
  "AOsAAS4AAgQAAQEAAgMAAQYAAhsAAQQAAzUAASYAAgIAARMAAgsAAOwAAS4AAgUAAQcAAh0AAQMAAzYAASQAAggAAQ0AAgwAAO4A",
  "AS0AAgEAAQoAAh0AAQQAAzUAAQ0AAgwAAQoAAg0AAQgAAg0AAO8AATYAAh4AAQUAAzQAAQYAAhMAAQEAAgIAAQQAAhAAAQgAAg0A",
  "APEAATMAAh8AAQUAAzMAAQcAAhUAAQEAAgEAAQMAAhAAAQgAAg0AAPIAAR8AAgEAARIAAiAAAQUAAzIAAQgAAhcAAQEAAhIAAQcA",
  "Ag0AAPQAARsAAgQAARAAAiEAAQYAAzEAAQgAAhYAAQMAAhEAAQgAAgwAAPUAAS4AAiEAAQIAAgEAAQUAAy8AAQ0AAg8AAQYAAg8A",
  "AQcAAg4AAPYAASwAAiUAAQUAAy4AARYAAgYAAQgAAg0AAQgAAg4AAPgAASkAAicAAQUAAy0AASQAAg0AAQgAAg4AAPkAAScAAicA",
  "AQcAAysAAQkAAgEAARsAAg0AAQgAAg4AAPsAASUAAigAAQYAAyoAAQgAAgQAARoAAg0AAQgAAg4AAPwAASMAAikAAQYAAyoAAQgA",
  "AgYAAQIAAgIAARQAAg0AAQgAAg4AAP4AASEAAikAAQcAAygAAQkAAgwAAREAAg0AAQgAAg8AAP8AASAAAikAAQgAAycAAQoAAgwA",
  "AQIAAgQAAQoAAg0AAQcAAhAAAAABAR4AAi4AAQQAAyYAAQwAAgEAAQEAAhEAAQcAAgEAAQEAAgoAAQkAAhAAAAYAAQEAAPsAARwA",
  "Ai8AAQUAAyQAAQ8AAhAAAQcAAggAAQEAAgIAAQkAAhEAAAYAAQIAAPsAARsAAjAAAQUAAyIAARMAAg0AAQYAAgwAAQkAAhEAAAYA",
  "AQMAAPsAARsAAi8AAQUAAyIAAQgAAgEAAQwAAgIAAQEAAgMAAQEAAgIAAQgAAgsAAQsAAhAAAAYAAQUAAPoAARkAAi8AAQkAAx0A",
  "AQkAAgUAAQwAAgEAAQIAAgMAAQcAAgsAAQsAAhEAAAYAAQcAAPkAARcAAjAAAQoAAxsAAQkAAgcAAQ4AAgMAAQUAAgEAAQEAAgwA",
  "AQkAAhIAAAYAAQkAAPkAARUAAi8AAQsAAxsAAQgAAggAARYAAgIAAQEAAgkAAQEAAgEAAQoAAhEAAAYAAQoAAPkAARQAAjAAAQsA",
  "AxoAAQgAAgoAAQEAAgIAARAAAg4AAQoAAhIAAAYAAQsAAPkAARMAAjAAAQsAAxwAAQoAAgwAAQ0AAg4AAQoAAhIAAAYAAQwAAPkA",
  "ARMAAjAAAQoAAx0AAQoAAgwAAQwAAgwAAQwAAhIAAAYAAQ4AAPgAARIAAjUAAQcAAxwAAQkAAgwAAQwAAgwAAQwAAhIAAAYAAREA",
  "APYAAREAAgEAAQEAAjIAAQoAAxsAAQkAAgsAAQoAAg4AAQwAAhIAAAYAARIAAPYAAREAAjIAARAAAwIAAgoAAwwAARsAAg8AAQsA",
  "AhMAAAYAARQAAPUAAREAAjIAARAAAgwAAw4AARcAAhAAAQsAAhMAAAYAARYAAPQAAREAAjIAAQ8AAgwAAxAAARUAAhAAAQwAAhIA",
  "AAYAARgAAPQAARAAAjEAARAAAgwAAxAAARIAAhEAAQ0AAhIAAAYAARoAAPMAARAAAjAAARAAAgwAAxcAAQoAAhEAAREAAg8AAAYA",
  "ARwAAPIAARAAAi4AAREAAgsAAxoAAQkAAgwAAQEAAgMAARIAAgMAAQEAAgoAAAYAAR4AAPEAAQ8AAgQAAQEAAigAAQcAAgMAAQkA",
  "AgoAAxkAAQkAAgsAAQEAAgIAARoAAgIAAQEAAgYAAAYAASEAAO8AAQ8AAiwAAQYAAgQAAQoAAggAAxoAAQkAAgwAASAAAgUAAAYA",
  "ASMAAO8AARAAAigAAQUAAgkAAQgAAgUAAxsAAQkAAgsAASMAAgQAAAYAASUAAO4AAREAAiUAAQUAAgwAAQgAAxwAAQoAAgkAASgA",
  "AgIAAAYAASYAAO4AARAAAiQAAQYAAg0AAQcAAxwAAQcAAgEAAQIAAgcAASwAAAYAASkAAOwAAQ8AAiQAAQUAAg8AAQcAAxoAAQcA",
  "AgIAAQEAAgcAAS0AAAYAASsAAOsAAQ4AAiQAAQUAAg0AAQEAAgEAAQgAAxgAAQcAAgIAAQEAAgcAAS4AAAYAAS4AAOkAAQ8AAgIA",
  "AQEAAh4AAQUAAhAAAQkAAxcAAQgAAgIAAQEAAgUAAS8AAAYAATAAAOgAARAAAh0AAQcAAhAAARAAAw4AAQoAAgYAATEAAAYAATIA",
  "AOcAARAAAhkAAQEAAgIAAQYAAhAAARIAAwsAAQ0AAgMAATMAAAYAATQAAOYAARAAAhcAAQgAAg8AARcAAwcAAUUAAAYAATYAAOYA",
  "AQ4AAhcAAQcAAg8AAQcAAwQAASwAAgIAAQEAAgMAAScAAAYAATgAAOUAAQ4AAhUAAQgAAg8AAQUAAwgAASoAAgYAAScAAAYAAToA",
  "AOQAAQ8AAhIAAQgAAhAAAQQAAw0AASAAAgIAAQMAAgQAASoAAAYAAT0AAOIAARIAAg0AAQYAAgEAAQEAAhAAAQUAAxIAARUAAgEA",
  "AQIAAgsAASsAAAYAAT8AAOEAARIAAgwAAQUAAhIAAQUAAxQAARQAAgIAAQEAAgsAASsAAAYAAUEAAOAAARMAAgkAAQYAAhIAAQQA",
  "AxgAAQ0AAgIAAQIAAg4AASsAAAYAAUMAAN8AARMAAgcAAQcAAgEAAQEAAg8AAQQAAxsAAQgAAhUAASsAAAYAAUQAAN8AARIAAgIA",
  "AQEAAgIAAQoAAg8AAQQAAxwAAQcAAhYAASsAAAYAAUYAAN4AAREAAgMAAQwAAg8AAQMAAx0AAQgAAhMAAS0AAAYAAUoAANsAASAA",
  "AgwAAQQAAx0AAQcAAhUAAS0AAAYAAUwAANsAAR8AAgsAAQMAAx4AAQUAAhYAAS4AAAYAAU4AANsAAR0AAgcAAQEAAgIAAQMAAx4A",
  "AQcAAhQAARIAAAsAARIAAAYAAU8AANwAARwAAgYAAQUAAx8AAQQAAhYAAQoAAB8AAQcAAAYAAVIAANwAARkAAgIAAQEAAgMAAQQA",
  "Ax8AAQYAAhEAAQEAAgIAAQkAAC4AAVQAANsAARoAAgQAAQIAAyAAAQcAAhIAAQoAAC8AAVcAANkAAR4AAyAAAQUAAhUAAQkAADAA",
  "AVkAANgAARwAAyAAAQYAAhQAAQkAADEAAVoAANgAARsAAyAAAQYAAhIAAQoAADIAAVwAANcAARkAAyAAAQcAAhIAAQkAADMAAV4A",
  "ANYAARgAAyAAAQUAAhMAAQkAADQAAWEAANQAARgAAx4AAQUAAhMAAQkAADUAAWMAANMAARcAAx0AAQYAAhIAAQoAADUAAWUAANEA",
  "ARcAAx0AAQYAAhEAAQoAADYAAWcAANEAARYAAxsAAQUAAg8AAQEAAgIAAQkAADgAAWoAAM4AARcAAxkAAQUAAhIAAQkAADkAAWwA",
  "AM0AARcAAxcAAQcAAhAAAQkAADoAAW0AAM0AARgAAxQAAQcAAhAAAQgAADwAAW8AAMwAARgAAxMAAQYAAhAAAQgAAD0AAXIAAMoA",
  "ARgAAxEAAQUAAg8AAQoAAD4AAXUAAMgAARgAAw8AAQUAAg4AAQoAAEAAAXcAAMcAARgAAw4AAQQAAg8AAQgAAEIAAXkAAMYAARgA",
  "AwwAAQUAAg4AAQcAAEQAAXsAAMUAARgAAwgAAQcAAg4AAQcAAEUAAX0AAMQAARgAAwUAAQoAAgcAAQEAAgMAAQgAAEYAAX4AAMMA",
  "ASkAAgUAAQIAAgEAAQcAAEgAAYEAAMEAATUAAEoAAYQAAL8AATMAAEsAAYUAAL8AATAAAE0AAYYAAL8AAS0AAE8AAYoAALwAASsA",
  "AFAAAYwAALoAASkAAFIAAY0AALoAASgAAFIAAZAAALgAASYAACQAAQQAACsAAZIAALcAASQAACAAARAAACQAAZQAALUAASMAAB4A",
  "ARkAAB4AAZYAALUAASEAABsAASAAABoAAZkAALMAASAAABkAASkAABMAAZwAALAAASAAABcAAS8AAAEAAQIAAAwAAZ0AALAAAR8A",
  "ABUAAToAAAYAAZ4AALAAAR4AABMAATwAAAYAAaAAAK8AAR4AABEAAR8AAgIAAQQAAgIAAQIAAgYAAQ4AAAYAAaMAAK0AAR8AAA0A",
  "ASAAAhMAAQwAAAYAAaUAAKwAASAAAAoAASAAAhsAAQUAAAYAAacAAKoAARUAAAIAAQoAAAgAASAAAh0AAQEAAgEAAQIAAAYAAakA",
  "AKkAARQAAAQAAQkAAAcAASEAAhoAAQEAAgMAAQEAAgEAAAYAAawAAKcAAREAAAgAAQkAAAQAASIAAhwAAQEAAgMAAAYAAa8AAKQA",
  "ARAAAAsAASwAAiEAAAYAAbEAAKMAAQ4AAA4AASkAAiIAAAYAAbMAAKIAAQwAABAAASgAAiIAAAYAAbUAAKAAAQwAABIAASYAAiIA",
  "AAYAAbcAAJ8AAQoAABQAASgAAh8AAAYAAbgAAJ8AAQgAABYAASYAAiAAAAYAAboAAJ0AAQcAABgAASUAAiAAAAYAAb0AAJsAAQUA",
  "ABoAASUAAh8AAAYAAb8AAJoAAQMAABsAASQAAiAAAAYAAcEAALYAASQAAiAAAAYAAcIAALQAASYAAh8AAAYAAcUAALEAASkAAhwA",
  "AAYAAcgAAK4AASwAAhkAAAYAAcoAAKwAAS4AAhcAAAYAAcwAAKkAATAAAhYAAAYAAc4AAKcAATMAAhMAAAYAAdEAAKQAATQAAhIA",
  "AAYAAdIAAKMAATQAAhIAAAYAAdQAAKAAATYAAhEAAAYAAdYAAJ4AATcAAhAAAAYAAdgAAJwAATkAAg4AAAYAAdoAAJoAAT4AAgkA",
  "AAYAAd0AAJcAARkAAgEAASUAAggAAAYAAd8AAJQAARgAAgUAASUAAgYAAAYAAeEAAJIAARgAAgIAAQEAAgIAASYAAgUAAAYAAeMA",
  "AJEAARMAAgIAAQEAAgQAASkAAgMAAQEAAAYAAeQAAJAAAREAAgsAASsAAAYAAecAAI4AAQ8AAg0AASoAAAYAAeoAAIsAAQ4AAg8A",
  "ASkAAAYAAewAAIkAAQ0AAhEAASgAAAYAAe4AAIgAAQwAAhAAASkAAAYAAfAAAIYAAQwAAg4AASsAAAYAAfIAAIQAAQ0AAhEAAScA",
  "AAYAAfQAAIIAAQ0AAhEAAScAAAYAAfYAAIAAAQwAAhEAAQEAAgEAASYAAAYAAfYAAIAAAQwAAgMAAQEAAg8AASYAAAYAAfYAAIEA",
  "AQwAAhMAASUAAAYAAfYAAIEAAQwAAhMAASUAAAYAAfYAAIEAARAAAhAAASQAAAYAAfYAAIEAARAAAgEAAQEAAg4AASQAAAYAAfYA",
  "AIEAARAAAhEAASMAAAYAAfUAAIMAAQ4AAhIAAQgAAgEAARoAAAYAAfUAAIMAAQ8AAhEAAQgAAgEAARoAAAYAAfQAAIQAAREAAg4A",
  "AQEAAgEAAQYAAgUAARcAAAYAAfQAAIUAARAAAhEAAQUAAgcAARUAAAYAAfMAAIYAARAAAhEAAQUAAgcAARUAAAYAAfMAAIYAARAA",
  "AhAAAQYAAgcAARUAAAYAAfMAAIcAARAAAhEAAQQAAgEAAQEAAggAARIAAAYAAfIAAIgAAREAAhEAAQYAAggAAREAAAYAAUAAABAA",
  "AaIAAIgAAREAAhIAAQQAAgoAARAAAAYAATgAABoAAZ8AAIoAARAAAhIAAQQAAgEAAQEAAggAARAAAAYAAS8AACQAAZ4AAIsAARAA",
  "AhIAAQMAAgoAARAAAAYAASoAACsAAZwAAIsAARIAAhAAAQYAAgcAARAAAAYAAR0AADoAAZkAAI0AAREAAgIAAQEAAgwAAQgAAgYA",
  "ARAAAAYAARUAAEYAAZUAAI0AARIAAg4AAQgAAgUAAREAAAYAAQ0AAFAAAZIAAI4AAREAAhEAAQUAAgQAARMAAAYAAQUAAFoAAZAA",
  "AI8AARIAAg8AARwAAGcAAY4AAI8AARMAAg4AARwAAGkAAYwAAI8AARQAAg8AARoAAGwAAYgAAJAAARUAAg4AARoAAG4AAYUAAJIA",
  "ARUAAg4AAQsAAgMAAQsAAG8AAYMAAJMAARUAAgIAAQEAAgoAAQ0AAgIAAQsAAHEAAX8AAJUAARkAAgcAAQ0AAgQAAQsAAHQAAXoA",
  "AJcAARkAAgcAAQwAAgUAAQsAAHYAAXcAAJgAARoAAgUAAQ0AAgcAAQkAAHoAAXAAAJwAARkAAgQAAQ0AAgEAAQEAAgcAAQgAAHsA",
  "AW4AAJ0AARoAAgEAAQ8AAgkAAQgAAHwAAWoAAKEAASoAAgcAAQkAAH4AAWYAAKMAASsAAggAAQcAAIEAAWIAAKQAASIAAgMAAQYA",
  "AgcAAQgAAIQAAV4AAKYAAR0AAgIAAQIAAgIAAQEAAgEAAQYAAgkAAQUAAIYAAVwAAKYAAR0AAgkAAQUAAggAAQYAAIgAAVkAAKcA",
  "AR0AAgkAAQYAAgUAAQEAAgIAAQUAAIsAAVYAAKYAARwAAgsAAQYAAggAAQUAAI0AAVMAAKgAARsAAgsAAQcAAgcAAQUAAI8AAVEA",
  "AKkAARkAAgoAAQoAAgYAAQUAAJIAAU0AAKsAARgAAg0AAQgAAgUAAQUAAJMAAUwAAKsAARgAAg0AAQcAAgcAAQQAAJUAAUoAAKwA",
  "ARcAAg4AAQYAAgcAAQQAAJgAAUcAAK0AARcAAg8AAQUAAgYAAQQAAJsAAUMAALAAARUAAg8AAQUAAgcAAQMAAJ0AAUEAALEAARQA",
  "Ag8AAQYAAgYAAQMAAJ8AAT4AALMAARMAAhAAAQUAAgUAAQQAAKEAATwAALQAARMAAhAAAQUAAgUAAQMAAKMAATkAALYAARIAAhEA",
  "AQQAAgQAAQEAAgIAAQEAAKQAATgAALcAAREAAg8AAQcAAgYAAQEAAKgAATMAALgAAREAAgEAAQEAAg0AAQcAAgEAAQEAAgMAAQIA",
  "AKoAATEAALkAAREAAg8AAQYAAgQAAQEAAgEAAQEAAKsAATAAALkAARMAAg4AAQUAAgYAAQEAAK0AAS4AALkAARIAAg8AAQYAAgUA",
  "AQEAALAAASoAALsAARIAAg4AAQYAAgUAAQEAALMAAScAALsAARIAAg8AAQQAAgcAALQAASUAAL0AAREAAg8AAQQAAgcAALYAASMA",
  "AL0AAREAAg8AAQQAAgcAALkAAR8AAL4AARIAAg0AAQYAAgYAALsAAR0AAL4AARIAAg0AAQYAAgYAAL0AARsAAL8AARMAAgwAAQUA",
  "AgYAACMAAQ0AAJAAARcAAMAAARIAAg0AAQUAAgYAACIAAR8AAIEAARUAAMAAARMAAgsAAQgAAgQAAB8AATgAAGwAARQAAMEAARMA",
  "AgoAAQgAAgQAABwAAT4AAGwAARAAAMMAARMAAgsAAQUAAgUAABoAAUIAAG0AAQ0AAMQAARIAAgsAAQUAAgUAABgAAUgAAGsAAQoA",
  "AMYAARIAAgoAAQUAAgUAABYAAUwAAGoAAQkAAMcAAREAAgoAAQUAAgUAABMAAVAAAGsAAQYAAMkAAQ8AAgsAAQUAAgUAABIAAVMA",
  "AGwAAQIAAMoAAQ8AAgwAAQQAAgUAAA8AAVcAADgBAQ8AAgoAAQYAAgQAAA0AAVoAADcBARAAAgkAAQQAAgYAAAsAAVwAADgBAQ8A",
  "AggAAQUAAgYAAAkAAV8AADcBAQ8AAgkAAQMAAgcAAAYAAWIAADcBAQ8AAgEAAQEAAgYAAQQAAgcAAAYAAWIAADgBAQ4AAgcAAQUA",
  "AgcAAAYAAWIAADgBAQ8AAgYAAQYAAgYAAAYAAWIAADgBAREAAgQAAQYAAgYAAAYAAWIAADgBAREAAgIAAQEAAgEAAQYAAgYAAAYA",
  "AWIAADkBARAAAgIAAQkAAgUAAAYAAWEAADoBARsAAgUAAAYAAV8AADwBARwAAgIAAQIAAAYAAV0AAD8BAR8AAAYAAVsAAEEBAR8A",
  "AAYAAVgAAEQBAR8AAAYAAVYAAEcBAR4AAAYAAVMAAEoBARoAAgMAAQEAAAYAAVAAAE4BARkAAgQAAAYAAU4AAFABARkAAgQAAAYA",
  "AU0AAFEBARkAAgQAAAYAAUsAAFMBARkAAgQAAAYAAUgAAFcBARgAAgQAAAYAAUYAAFkBARgAAgQAAAYAAUQAAFsBARgAAgQAAAYA",
  "AUEAAF8BARcAAgQAAAYAAT8AAGEBARcAAgQAAAYAAT0AAGQBARYAAgQAAAYAATsAAGUBARcAAgQAAAYAATkAAGcBARcAAgQAAAYA",
  "ATcAAGkBARcAAgQAAAYAATUAAGsBARcAAgQAAAYAATQAAG0BARYAAgQAAAYAATMAAFUAAQUAAAcAAQUAAAcBARcAAgQAAAYAATEA",
  "AFMAASAAAPwAARcAAgQAAAYAATAAAFEAASUAAPkAARgAAgQAAEYF"
].join("");
var LAGOS_PLACES = [
  {
    "name": "Lagos Train Station Terminus",
    "kind": "station",
    "x": 55.5,
    "y": 11.7
  },
  {
    "name": "Balogun Market",
    "kind": "market",
    "x": 192.5,
    "y": 168.9
  },
  {
    "name": "Lagos Island General Hospital",
    "kind": "hospital",
    "x": 209.1,
    "y": 146.7
  },
  {
    "name": "Independence House",
    "kind": "government",
    "x": 301.2,
    "y": 395.1
  },
  {
    "name": "National Museum",
    "kind": "museum",
    "x": 357,
    "y": 431.6
  },
  {
    "name": "Marina Bus Station",
    "kind": "station",
    "x": 430,
    "y": 343.8
  },
  {
    "name": "Tafawa Balewa Square",
    "kind": "park",
    "x": 343.3,
    "y": 395.4
  },
  {
    "name": "Onikan Cricket Stadium",
    "kind": "stadium",
    "x": 353.7,
    "y": 460.9
  },
  {
    "name": "Lagos Central Mosque",
    "kind": "mosque",
    "x": 208,
    "y": 212
  },
  {
    "name": "Cathedral Church of Christ",
    "kind": "church",
    "x": 255,
    "y": 330
  },
  {
    "name": "Lagos Island Police Station",
    "kind": "police",
    "x": 150,
    "y": 270
  },
  {
    "name": "CMS Grammar School",
    "kind": "school",
    "x": 120,
    "y": 205
  },
  {
    "name": "Marina Commercial Bank",
    "kind": "bank",
    "x": 270,
    "y": 300
  },
  {
    "name": "Lagos Island Fire Station",
    "kind": "fire",
    "x": 330,
    "y": 260
  },
  {
    "name": "Marina Palm Hotel",
    "kind": "hotel",
    "x": 380,
    "y": 300
  },
  {
    "name": "Island Fuel Station",
    "kind": "fuel",
    "x": 90,
    "y": 250
  },
  {
    "name": "Port of Lagos",
    "kind": "port",
    "x": 170,
    "y": 530
  }
];

// packages/game-core/src/lagos.ts
var WATER = 0;
var STREET = 1;
var BLOCK = 2;
var PARK = 3;
var MARKET = 5;
var rect2 = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function decode() {
  const bytes = Uint8Array.from(atob(LAGOS_RLE), (c) => c.charCodeAt(0));
  const out = new Uint8Array(LAGOS_W * LAGOS_H);
  let at = 0;
  for (let i = 0; i + 2 < bytes.length; i += 3) {
    const run = bytes[i + 1] | bytes[i + 2] << 8;
    out.fill(bytes[i], at, at + run);
    at += run;
  }
  return out;
}
var LagosTerrain = class {
  cell = LAGOS_CELL;
  width = LAGOS_W;
  height = LAGOS_H;
  size = { x: LAGOS_W * LAGOS_CELL, z: LAGOS_H * LAGOS_CELL };
  cls;
  /** For street cells: distance in cells to the nearest non-street cell. */
  edt;
  /** For block cells: the direction (radians) pointing away from the nearest street, water or park edge. */
  blockDir;
  /** For block cells: distance in cells to that edge. */
  blockEdge;
  /** For street cells: the widest clearance within two cells (about half the corridor width): small = a street, large = open ground. */
  wide;
  constructor() {
    this.cls = decode();
    const { width: w, height: h, cls } = this;
    const edt = new Float32Array(w * h);
    const INF = 1e6;
    for (let i = 0; i < w * h; i++) edt[i] = cls[i] === STREET ? INF : 0;
    const D1 = 1, D2 = Math.SQRT2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (edt[i] === 0) continue;
        let v = edt[i];
        if (x > 0) v = Math.min(v, edt[i - 1] + D1);
        if (y > 0) {
          v = Math.min(v, edt[i - w] + D1);
          if (x > 0) v = Math.min(v, edt[i - w - 1] + D2);
          if (x < w - 1) v = Math.min(v, edt[i - w + 1] + D2);
        }
        edt[i] = v;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (edt[i] === 0) continue;
        let v = edt[i];
        if (x < w - 1) v = Math.min(v, edt[i + 1] + D1);
        if (y < h - 1) {
          v = Math.min(v, edt[i + w] + D1);
          if (x < w - 1) v = Math.min(v, edt[i + w + 1] + D2);
          if (x > 0) v = Math.min(v, edt[i + w - 1] + D2);
        }
        edt[i] = v;
      }
    }
    for (let i = 0; i < w * h; i++) if (edt[i] >= INF) edt[i] = 40;
    this.edt = edt;
    const wide = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (cls[i] !== STREET) continue;
        let m = 0;
        for (let dy = -2; dy <= 2; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            if (xx >= 0 && xx < w) m = Math.max(m, edt[yy * w + xx]);
          }
        }
        wide[i] = m;
      }
    }
    this.wide = wide;
    const srcX = new Int16Array(w * h).fill(-1), srcZ = new Int16Array(w * h).fill(-1);
    const dist = new Float32Array(w * h).fill(1e6);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (cls[i] !== BLOCK) {
          dist[i] = 0;
          srcX[i] = x;
          srcZ[i] = y;
        }
      }
    }
    const relax = (i, j) => {
      if (srcX[j] < 0) return;
      const d = Math.hypot(i % w - srcX[j], (i / w | 0) - srcZ[j]);
      if (d < dist[i]) {
        dist[i] = d;
        srcX[i] = srcX[j];
        srcZ[i] = srcZ[j];
      }
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (x > 0) relax(i, i - 1);
        if (y > 0) {
          relax(i, i - w);
          if (x > 0) relax(i, i - w - 1);
          if (x < w - 1) relax(i, i - w + 1);
        }
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (x < w - 1) relax(i, i + 1);
        if (y < h - 1) {
          relax(i, i + w);
          if (x < w - 1) relax(i, i + w + 1);
          if (x > 0) relax(i, i + w - 1);
        }
      }
    }
    const dir = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) if (cls[i] === BLOCK && srcX[i] >= 0) dir[i] = Math.atan2((i / w | 0) - srcZ[i], i % w - srcX[i]);
    this.blockDir = dir;
    this.blockEdge = dist;
  }
  /** Which way a building at this point should be turned: its sides parallel to the nearest street (radians, a quarter turn is equivalent). */
  blockAngleAt(x, z) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let sx = 0, sz = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = cx + dx, zz = cz + dz;
        if (xx < 0 || zz < 0 || xx >= this.width || zz >= this.height) continue;
        const i = zz * this.width + xx;
        if (this.cls[i] !== BLOCK) continue;
        const a = this.blockDir[i] * 4;
        sx += Math.cos(a);
        sz += Math.sin(a);
      }
    }
    return Math.atan2(sz, sx) / 4;
  }
  at(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= this.width || cz >= this.height) return WATER;
    return this.cls[cz * this.width + cx];
  }
  /** The ground class at a point, smoothed so the edges of blocks and streets are not stair-stepped. */
  classAt(x, z) {
    const u = x / this.cell - 0.5;
    const v = z / this.cell - 0.5;
    const x0 = Math.floor(u), z0 = Math.floor(v);
    const fx = u - x0, fz = v - z0;
    let best = 0, bestW = -1;
    const weight = [0, 0, 0, 0, 0, 0];
    const add = (c, wt) => {
      weight[c] = (weight[c] ?? 0) + wt;
    };
    add(this.at(x0, z0), (1 - fx) * (1 - fz));
    add(this.at(x0 + 1, z0), fx * (1 - fz));
    add(this.at(x0, z0 + 1), (1 - fx) * fz);
    add(this.at(x0 + 1, z0 + 1), fx * fz);
    for (let c = 0; c < 6; c++) {
      if (weight[c] > bestW) {
        bestW = weight[c];
        best = c;
      }
    }
    return best;
  }
  isWater(x, z) {
    return this.classAt(x, z) === WATER;
  }
  bilinear(arr, x, z) {
    const u = x / this.cell - 0.5;
    const v = z / this.cell - 0.5;
    const x0 = Math.floor(u), z0 = Math.floor(v);
    const fx = u - x0, fz = v - z0;
    const g = (cx, cz) => cx < 0 || cz < 0 || cx >= this.width || cz >= this.height ? 0 : arr[cz * this.width + cx];
    return g(x0, z0) * (1 - fx) * (1 - fz) + g(x0 + 1, z0) * fx * (1 - fz) + g(x0, z0 + 1) * (1 - fx) * fz + g(x0 + 1, z0 + 1) * fx * fz;
  }
  /** How far (metres) a street point is from the nearest block, water or park edge. */
  edgeDistance(x, z) {
    return Math.max(0, (this.bilinear(this.edt, x, z) - 0.5) * this.cell);
  }
  /** What a street point is: asphalt, a pavement strip along the edges, or open paved ground where the streets open out. */
  streetKind(x, z) {
    const wideHere = this.bilinear(this.wide, x, z);
    if (wideHere > 3.2) return "plaza";
    return this.edgeDistance(x, z) < 1.7 ? "sidewalk" : "asphalt";
  }
  /** Can a person stand here (ignoring buildings)? */
  walkable(x, z) {
    const c = this.classAt(x, z);
    return c !== WATER;
  }
};
var terrainSingleton = null;
function lagosTerrain() {
  return terrainSingleton ??= new LagosTerrain();
}
var PLACE_BUILDING = {
  police: { w: 20, d: 15, floors: 2, lotKind: "flats" },
  hospital: { w: 24, d: 17, floors: 3, lotKind: "flats" },
  school: { w: 22, d: 14, floors: 2, lotKind: "flats" },
  church: { w: 18, d: 24, floors: 1, lotKind: "house" },
  mosque: { w: 20, d: 20, floors: 1, lotKind: "house" },
  fire: { w: 22, d: 15, floors: 2, lotKind: "flats" },
  bank: { w: 18, d: 14, floors: 3, lotKind: "flats" },
  hotel: { w: 24, d: 16, floors: 4, lotKind: "flats" },
  station: { w: 26, d: 16, floors: 1, lotKind: "terminal" },
  museum: { w: 24, d: 18, floors: 2, lotKind: "terminal" },
  government: { w: 22, d: 16, floors: 3, lotKind: "terminal" }
};
var FACING_STEP = [[0, -1], [1, 0], [0, 1], [-1, 0]];
function indexLots(lots, bucket = 24) {
  const map = /* @__PURE__ */ new Map();
  const key = (ix, iz) => ix * 100003 + iz;
  for (const l of lots) {
    const f = l.footprint;
    for (let ix = Math.floor(f.minX / bucket); ix <= Math.floor(f.maxX / bucket); ix++) {
      for (let iz = Math.floor(f.minZ / bucket); iz <= Math.floor(f.maxZ / bucket); iz++) {
        const k = key(ix, iz);
        const list = map.get(k);
        if (list) list.push(l);
        else map.set(k, [l]);
      }
    }
  }
  return { near: (x, z) => map.get(key(Math.floor(x / bucket), Math.floor(z / bucket))) ?? [] };
}
var indexCache = /* @__PURE__ */ new WeakMap();
function lotIndexOf(d) {
  let i = indexCache.get(d);
  if (!i) indexCache.set(d, i = indexLots(d.lots));
  return i;
}
function nearPolygon(poly, x, z, pad = 0) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
    if (pad > 0) {
      const dx = xj - xi, dz = zj - zi;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - xi) * dx + (z - zi) * dz) / len2));
      if (Math.hypot(x - (xi + t * dx), z - (zi + t * dz)) <= pad) return true;
    }
  }
  return inside;
}
function walkableAt(d, x, z, pad = 0.3) {
  if (d.terrain && !d.terrain.walkable(x, z)) return false;
  if (x < d.bounds.minX || x > d.bounds.maxX || z < d.bounds.minZ || z > d.bounds.maxZ) return false;
  for (const l of lotIndexOf(d).near(x, z)) {
    const f = l.footprint;
    if (x > f.minX - pad && x < f.maxX + pad && z > f.minZ - pad && z < f.maxZ + pad) {
      if (l.poly) {
        if (nearPolygon(l.poly, x, z, pad)) return false;
        continue;
      }
      if (!hasInterior(l)) return false;
      continue;
    }
  }
  return true;
}
function generateLagos(seed = 7) {
  const t = lagosTerrain();
  const rand = rng(seed);
  const between = (a, b) => a + rand() * (b - a);
  const placePx = (name) => LAGOS_PLACES.find((p) => p.name === name);
  const toWorld = (p) => ({ x: p.x * t.cell, z: p.y * t.cell });
  const market = toWorld(placePx("Balogun Market"));
  const lots = [];
  let lotNo = 0;
  const OW = Math.ceil(t.size.x), OH = Math.ceil(t.size.z);
  const occ = new Uint8Array(OW * OH);
  const isBlock = (x, z) => t.classAt(x, z) === BLOCK;
  const inRect = (lx, lz, hw, hd) => Math.abs(lx) <= hw && Math.abs(lz) <= hd;
  const rectFree = (cx, cz, c, sn, hw, hd, margin) => {
    const R = Math.hypot(hw, hd) + margin;
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(OW - 1, Math.floor(cx + R));
    const z0 = Math.max(0, Math.floor(cz - R)), z1 = Math.min(OH - 1, Math.floor(cz + R));
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (!occ[z * OW + x]) continue;
        const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
        if (inRect(dx * c + dz * sn, -dx * sn + dz * c, hw + 0.8, hd + 0.8)) return false;
      }
    }
    const px = hw + 1.6, pz = hd + 1.6;
    for (const [lx, lz] of [[-px, -pz], [px, -pz], [-px, pz], [px, pz], [0, -pz], [0, pz], [-px, 0], [px, 0], [0, 0]]) {
      if (!isBlock(cx + lx * c - lz * sn, cz + lx * sn + lz * c)) return false;
    }
    return true;
  };
  const markRect = (cx, cz, c, sn, hw, hd) => {
    const R = Math.hypot(hw, hd);
    for (let z = Math.max(0, Math.floor(cz - R)); z <= Math.min(OH - 1, Math.floor(cz + R)); z++) {
      for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(OW - 1, Math.floor(cx + R)); x++) {
        const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
        if (inRect(dx * c + dz * sn, -dx * sn + dz * c, hw, hd)) occ[z * OW + x] = 1;
      }
    }
  };
  const PASSES = [
    { step: 7, w: [12, 22], d: [9, 16] },
    { step: 5, w: [8, 13], d: [7, 11] },
    { step: 3, w: [4, 7], d: [4, 7] }
  ];
  for (const pass of PASSES) {
    for (let gz = pass.step / 2; gz < t.size.z; gz += pass.step) {
      for (let gx = pass.step / 2; gx < t.size.x; gx += pass.step) {
        const x = gx + between(-pass.step * 0.45, pass.step * 0.45), z = gz + between(-pass.step * 0.45, pass.step * 0.45);
        if (!isBlock(x, z) || occ[Math.floor(z) * OW + Math.floor(x)]) continue;
        if (rand() < 0.04) continue;
        const theta = Math.round(t.blockAngleAt(x, z) / 0.131) * 0.131;
        const c = Math.cos(theta), sn = Math.sin(theta);
        const shape = rand();
        let w = between(pass.w[0], pass.w[1]), dpt = between(pass.d[0], pass.d[1]);
        if (shape > 0.9 && pass === PASSES[0]) {
          w = between(22, 32);
          dpt = between(6, 8);
        }
        const hw = w / 2, hd = dpt / 2;
        if (!rectFree(x, z, c, sn, hw, hd, 3)) continue;
        let wing = null;
        if (shape > 0.6 && shape <= 0.85 && w > 8) {
          const w2 = w * between(0.4, 0.55), d2 = dpt * between(0.7, 1);
          const side = rand() < 0.5 ? -1 : 1;
          const lx = side * (hw - w2 / 2), lz = hd + d2 / 2;
          wing = { cx: x + lx * c - lz * sn, cz: z + lx * sn + lz * c, hw: w2 / 2, hd: d2 / 2 };
          if (!rectFree(wing.cx, wing.cz, c, sn, wing.hw, wing.hd, 1)) wing = null;
          else if (rectFree(x, z, c, sn, hw, hd, 0) === false) wing = null;
        }
        markRect(x, z, c, sn, hw, hd);
        if (wing) markRect(wing.cx, wing.cz, c, sn, wing.hw, wing.hd);
        const local = wing ? (() => {
          const side = Math.sign((wing.cx - x) * c + (wing.cz - z) * sn) || 1;
          const w2 = wing.hw * 2, d2 = wing.hd * 2;
          const a = side * (hw - w2), b2 = side * hw;
          const lo = Math.min(a, b2), hi = Math.max(a, b2);
          return side > 0 ? [[-hw, -hd], [hw, -hd], [hw, hd + d2], [lo, hd + d2], [lo, hd], [-hw, hd]] : [[-hw, -hd], [hw, -hd], [hw, hd], [hi, hd], [hi, hd + d2], [-hw, hd + d2]];
        })() : [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
        const poly = local.map(([lx, lz]) => [x + lx * c - lz * sn, z + lx * sn + lz * c]);
        const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
        const fp = rect2(Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs));
        const away = t.blockAngleAt(x, z);
        const out = [Math.cos(away + Math.PI), Math.sin(away + Math.PI)];
        const facing = Math.abs(out[1]) >= Math.abs(out[0]) ? out[1] < 0 ? 0 : 2 : out[0] > 0 ? 1 : 3;
        const dc = Math.hypot(x - market.x, z - market.z);
        const floors = dc < 350 ? 3 + Math.floor(rand() * 5) : dc < 900 ? 2 + Math.floor(rand() * 4) : 1 + Math.floor(rand() * 3);
        const kind = floors >= 3 ? rand() < 0.45 ? "shop" : "flats" : rand() < 0.3 ? "shop" : "house";
        lots.push({ id: `L${lotNo++}`, kind, plot: rect2(fp.minX - 1, fp.maxX + 1, fp.minZ - 1, fp.maxZ + 1), footprint: fp, floors, storey: 3.2, roof: "flat", facing, colour: Math.floor(rand() * 8), garage: false, fence: false, poly, yaw: theta });
      }
    }
  }
  const stalls = [];
  for (let z = Math.floor(market.z - 120); z < market.z + 120; z += 5) {
    for (let x = Math.floor(market.x - 120); x < market.x + 120; x += 7) {
      const aisle = Math.floor((x - (market.x - 120)) / 7) % 4 === 3 || Math.floor((z - (market.z - 120)) / 5) % 5 === 4;
      if (aisle) continue;
      const fp = rect2(x + 0.5, x + 5.5, z + 0.5, z + 3.5);
      const pts = [[fp.minX, fp.minZ], [fp.maxX, fp.minZ], [fp.minX, fp.maxZ], [fp.maxX, fp.maxZ]];
      if (!pts.every(([px, pz]) => t.classAt(px, pz) === MARKET)) continue;
      stalls.push({ id: `S${stalls.length}`, kind: "stall", plot: fp, footprint: fp, floors: 1, storey: 3, roof: "flat", facing: 2, colour: Math.floor(rand() * 8), garage: false, fence: false });
    }
  }
  const landmarks = [];
  const claimLot = (name, kind, x, z) => {
    const spec = PLACE_BUILDING[kind];
    if (!spec) return null;
    let best = null, bestD = 1e9;
    for (const l of lots) {
      if (l.landmark) continue;
      const d = Math.hypot((l.footprint.minX + l.footprint.maxX) / 2 - x, (l.footprint.minZ + l.footprint.maxZ) / 2 - z);
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    if (!best || bestD > 90) return null;
    const cx = (best.footprint.minX + best.footprint.maxX) / 2, cz = (best.footprint.minZ + best.footprint.maxZ) / 2;
    for (const scale of [1, 0.85, 0.7, 0.55]) {
      const w = spec.w * scale, d = spec.d * scale;
      const alongX = best.facing === 0 || best.facing === 2;
      const hx = (alongX ? w : d) / 2, hz = (alongX ? d : w) / 2;
      const fp = rect2(cx - hx, cx + hx, cz - hz, cz + hz);
      const probes = [[fp.minX - 1.5, fp.minZ - 1.5], [fp.maxX + 1.5, fp.minZ - 1.5], [fp.minX - 1.5, fp.maxZ + 1.5], [fp.maxX + 1.5, fp.maxZ + 1.5]];
      if (!probes.every(([px, pz]) => t.classAt(px, pz) !== WATER && t.classAt(px, pz) !== STREET)) continue;
      for (let i = lots.length - 1; i >= 0; i--) {
        const o = lots[i];
        if (o === best) continue;
        const f = o.footprint;
        if (f.minX < fp.maxX + 1 && f.maxX > fp.minX - 1 && f.minZ < fp.maxZ + 1 && f.maxZ > fp.minZ - 1) lots.splice(i, 1);
      }
      delete best.poly;
      delete best.yaw;
      best.footprint = fp;
      best.plot = rect2(fp.minX - 1, fp.maxX + 1, fp.minZ - 1, fp.maxZ + 1);
      best.floors = spec.floors;
      best.kind = spec.lotKind;
      best.storey = 3.4;
      best.landmark = kind;
      best.roof = kind === "church" ? "gable" : "flat";
      return best;
    }
    return null;
  };
  const nearestStreet = (x, z) => {
    for (let r = 0; r < 120; r += 3) {
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos(a / 16 * Math.PI * 2) * r, pz = z + Math.sin(a / 16 * Math.PI * 2) * r;
        if (t.classAt(px, pz) === STREET && t.streetKind(px, pz) !== "plaza") return { x: px, z: pz };
      }
    }
    return { x, z };
  };
  const entranceOf = (lot) => {
    if (hasInterior(lot)) {
      const inside = generatePlan(lot).inside;
      const out = FACING_STEP[lot.facing];
      return { x: inside.x + out[0] * 2.9, z: inside.z + out[1] * 2.9 };
    }
    const f = lot.footprint;
    return nearestStreet((f.minX + f.maxX) / 2, (f.minZ + f.maxZ) / 2);
  };
  for (const place of LAGOS_PLACES) {
    const kind = place.kind;
    const w = toWorld(place);
    const lot = claimLot(place.name, kind, w.x, w.z);
    if (lot) {
      const f = lot.footprint;
      landmarks.push({ id: `P${landmarks.length}`, kind, name: place.name, x: (f.minX + f.maxX) / 2, z: (f.minZ + f.maxZ) / 2, entrance: entranceOf(lot), lotId: lot.id });
    } else {
      landmarks.push({ id: `P${landmarks.length}`, kind, name: place.name, x: w.x, z: w.z, entrance: nearestStreet(w.x, w.z), lotId: null });
    }
  }
  const portSheds = [];
  const port2 = { x0: 10 * t.cell, x1: 240 * t.cell, z0: 455 * t.cell, z1: 585 * t.cell };
  for (let z = port2.z0; z < port2.z1; z += 44) {
    for (let x = port2.x0; x < port2.x1; x += 52) {
      const fp = rect2(x, x + 30, z, z + 22);
      const pts = [[fp.minX - 4, fp.minZ - 4], [fp.maxX + 4, fp.minZ - 4], [fp.minX - 4, fp.maxZ + 4], [fp.maxX + 4, fp.maxZ + 4], [(fp.minX + fp.maxX) / 2, (fp.minZ + fp.maxZ) / 2]];
      if (!pts.every(([px, pz]) => t.classAt(px, pz) === STREET)) continue;
      if (rand() < 0.35) continue;
      portSheds.push({ id: `H${portSheds.length}`, kind: "hangar", plot: fp, footprint: fp, floors: 1, storey: 7, roof: "flat", facing: 0, colour: 2, garage: false, fence: false });
    }
  }
  const allLots = [...lots, ...stalls, ...portSheds];
  {
    const index = indexLots(allLots);
    for (const lm of landmarks) {
      const e = lm.entrance;
      const blocked = !t.walkable(e.x, e.z) || index.near(e.x, e.z).some((l) => l.poly ? nearPolygon(l.poly, e.x, e.z, 0.5) : !hasInterior(l) && e.x > l.footprint.minX - 0.5 && e.x < l.footprint.maxX + 0.5 && e.z > l.footprint.minZ - 0.5 && e.z < l.footprint.maxZ + 0.5);
      if (blocked) lm.entrance = nearestStreet(e.x, e.z);
    }
  }
  const trees = [];
  const lamps = [];
  const props = [];
  const occupied = indexLots(allLots);
  const clear = (x, z, pad = 1.2) => occupied.near(x, z).every((l) => !(x > l.footprint.minX - pad && x < l.footprint.maxX + pad && z > l.footprint.minZ - pad && z < l.footprint.maxZ + pad));
  for (let z = 4; z < t.size.z; z += 9) {
    for (let x = 4; x < t.size.x; x += 9) {
      const px = x + between(-3, 3), pz = z + between(-3, 3);
      const c = t.classAt(px, pz);
      if (c === PARK && rand() < 0.75 && clear(px, pz)) trees.push({ x: px, z: pz, scale: between(0.8, 1.4), variant: [0, 1, 2][Math.floor(rand() * 3)] });
      else if (c === STREET && rand() < 0.07 && t.streetKind(px, pz) === "sidewalk" && clear(px, pz)) trees.push({ x: px, z: pz, scale: between(0.8, 1.2), variant: [0, 1, 2][Math.floor(rand() * 3)] });
      else if (c === STREET && t.streetKind(px, pz) === "plaza" && rand() < 0.03 && clear(px, pz)) trees.push({ x: px, z: pz, scale: between(0.9, 1.3), variant: 1 });
    }
  }
  for (let z = 6; z < t.size.z; z += 26) {
    for (let x = 6; x < t.size.x; x += 26) {
      const px = x + between(-8, 8), pz = z + between(-8, 8);
      if (t.classAt(px, pz) !== STREET || t.streetKind(px, pz) !== "sidewalk" || !clear(px, pz) || rand() < 0.4) continue;
      let facing = 0;
      for (let f = 0; f < 4; f++) {
        const sx = px + FACING_STEP[f][0] * 3, sz = pz + FACING_STEP[f][1] * 3;
        if (t.classAt(sx, sz) === STREET && t.streetKind(sx, sz) === "asphalt") {
          facing = f;
          break;
        }
      }
      lamps.push({ x: px, z: pz, facing });
    }
  }
  for (let z = 10; z < t.size.z; z += 40) {
    for (let x = 10; x < t.size.x; x += 40) {
      const px = x + between(-15, 15), pz = z + between(-15, 15);
      if (t.classAt(px, pz) !== STREET || t.streetKind(px, pz) !== "asphalt" || rand() < 0.7) continue;
      const along = t.classAt(px + 8, pz) === STREET && t.classAt(px - 8, pz) === STREET ? 90 : 0;
      props.push({ kind: "car", x: px, z: pz, yaw: along, variant: Math.floor(rand() * 6) });
    }
  }
  const house = toWorld(placePx("Independence House"));
  const start = (() => {
    for (let r = 0; r < 160; r += 2) {
      for (let a = 0; a < 24; a++) {
        const px = house.x + Math.cos(a / 24 * Math.PI * 2) * r, pz = house.z + 10 + Math.sin(a / 24 * Math.PI * 2) * r;
        if (t.classAt(px, pz) === STREET && t.edgeDistance(px, pz) >= 5) return { x: px, z: pz };
      }
    }
    return nearestStreet(house.x, house.z + 10);
  })();
  return {
    seed,
    bounds: rect2(0, t.size.x, 0, t.size.z),
    roads: [],
    sidewalks: [],
    blocks: [],
    lots: allLots,
    trees,
    lamps,
    landmarks,
    runway: rect2(0, 0, 0, 0),
    props,
    wires: [],
    paving: [],
    fields: [],
    spawn: { x: start.x, z: start.z, yaw: 0 },
    terrain: t
  };
}

// packages/game-core/src/onlineRules.ts
var no = (reason) => ({ ok: false, reason });
var yes = { ok: true };
var str = (v, max = 60) => typeof v === "string" && v.length > 0 && v.length <= max ? v : null;
var int = (v, lo, hi) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null;
var bool = (v) => typeof v === "boolean" ? v : null;
var MONEY = 1e8;
var bad = "That didn't look right.";
var HANDLERS = {
  start: (sim, [id]) => {
    const a = str(id, 40);
    return a && ACTIONS[a] ? sim.start(a) : no("Unknown activity.");
  },
  cancel: (sim) => sim.cancel(),
  buyGroceries: (sim) => sim.buyGroceries(),
  setInUse: (sim, [on]) => {
    const v = bool(on);
    if (v !== null) sim.state.phone.inUse = v;
  },
  openApp: (sim, [app2]) => str(app2) ? openApp(sim.state, app2) : no(bad),
  call: (sim, [who, mins]) => str(who) && int(mins, 1, 120) ? call(sim.state, who, mins) : no(bad),
  plug: (sim, [src]) => src === null || src === "wall" || src === "bank" ? plug(sim.state, src) : no(bad),
  setBankCharging: (sim, [on]) => bool(on) !== null ? setBankCharging(sim.state, on) : no(bad),
  payRent: (sim, [amount]) => payRent(sim.state, amount === void 0 || amount === null ? void 0 : int(amount, 1, MONEY) ?? 0),
  payBill: (sim) => payBill(sim.state),
  sendMoney: (sim, [who, n]) => str(who) && int(n, 1, MONEY) ? sendMoney(sim.state, who, n) : no(bad),
  deposit: (sim, [n]) => int(n, 1, MONEY) ? deposit(sim.state, n) : no(bad),
  withdraw: (sim, [n]) => int(n, 1, MONEY) ? withdraw(sim.state, n) : no(bad),
  borrow: (sim, [n]) => int(n, 1, MONEY) ? borrow(sim.state, n) : no(bad),
  repay: (sim, [n]) => int(n, 1, MONEY) ? repay(sim.state, n) : no(bad),
  setAutoPay: (sim, [on]) => {
    if (bool(on) !== null) setAutoPay(sim.state, on);
  },
  topUp: (sim, [id]) => str(id) ? topUp(sim.state, id) : no(bad),
  // The price scale comes from the player's own traits on the server, never from the message.
  placeOrder: (sim, [id]) => str(id) ? placeOrder(sim.state, id, sim.traits.groceries) : no(bad),
  applyForJob: (sim, [id]) => str(id) ? applyForJob(sim.state, id) : no(bad),
  quitJob: (sim) => quitJob(sim.state),
  replyToThread: (sim, [who, i]) => str(who) && int(i, 0, 10) !== null ? replyToThread(sim.state, who, i) : no(bad),
  markThreadRead: (sim, [who]) => {
    if (str(who)) markThreadRead(sim.state, who);
  },
  dismissNotification: (sim, [id]) => {
    if (int(id, 0, 1e9) !== null) dismissNotification(sim.state, id);
  },
  clearNotifications: (sim) => clearNotifications(sim.state),
  markNotificationsRead: (sim) => markNotificationsRead(sim.state),
  setWifi: (sim, [on]) => bool(on) !== null ? setWifi(sim.state, on) : no(bad),
  setMobileData: (sim, [on]) => bool(on) !== null ? setMobileData(sim.state, on) : no(bad),
  buyHomePlan: (sim, [id]) => str(id) ? buyHomePlan(sim.state, id) : no(bad),
  startDownload: (sim, [id]) => str(id) ? startDownload(sim.state, id) : no(bad),
  cancelDownload: (sim, [id]) => str(id) ? cancelDownload(sim.state, id) : no(bad),
  uninstallApp: (sim, [id]) => str(id) ? uninstallApp(sim.state, id) : no(bad),
  addNote: (sim, [t]) => str(t, 400) ? addNote(sim.state, t) : no("Write something first."),
  deleteNote: (sim, [i]) => int(i, 0, 100) !== null ? deleteNote(sim.state, i) : no(bad),
  recordScore: (sim, [game, score]) => str(game) && int(score, 0, 1e6) !== null ? recordScore(sim.state, game, score) : no(bad),
  buyShares: (sim, [sym, q]) => str(sym, 10) && int(q, 1, 1e5) ? buyShares(sim.state, sym, q) : no(bad),
  sellShares: (sim, [sym, q]) => str(sym, 10) && int(q, 1, 1e5) ? sellShares(sim.state, sym, q) : no(bad),
  joinAjo: (sim) => joinAjo(sim.state),
  payAjo: (sim) => payAjo(sim.state),
  orderEats: (sim, [id]) => str(id) ? orderEats(sim.state, id) : no(bad),
  takeLesson: (sim, [id]) => str(id) ? takeLesson(sim.state, id) : no(bad),
  diaryCheckIn: (sim, [mood2, text]) => int(mood2, 1, 5) !== null ? diaryCheckIn(sim.state, mood2, typeof text === "string" ? text.slice(0, 400) : "") : no(bad),
  addTodo: (sim, [t]) => str(t, 200) ? addTodo(sim.state, t) : no("Write something first."),
  toggleTodo: (sim, [i]) => int(i, 0, 100) !== null ? toggleTodo(sim.state, i) : no(bad),
  deleteTodo: (sim, [i]) => int(i, 0, 100) !== null ? deleteTodo(sim.state, i) : no(bad),
  drinkWater: (sim) => drinkWater(sim.state),
  finishFocus: (sim) => finishFocus(sim.state),
  doWorkout: (sim, [id]) => str(id) ? doWorkout(sim.state, id) : no(bad),
  doGig: (sim, [id]) => str(id) ? doGig(sim.state, id) : no(bad),
  useApp: (sim, [id]) => {
    if (str(id)) useApp(sim.state, id, 1);
  },
  streamData: (sim, [mb]) => int(mb, 1, 200) ? streamData(sim.state, mb) : no(bad),
  bookTicket: (sim, [kind, title]) => kind === "film" || kind === "rent" || kind === "event" ? str(title, 80) ? bookTicket(sim.state, kind, title) : no(bad) : no(bad)
};
var RPC_NAMES = Object.keys(HANDLERS);
var COOLDOWN_SECONDS = { useApp: 8, recordScore: 4 };
var rpcCooldown = (fn) => COOLDOWN_SECONDS[fn] ?? 0;
function runRpc(sim, fn, args) {
  const handler = Object.hasOwn(HANDLERS, fn) ? HANDLERS[fn] : void 0;
  if (!handler) return no("Unknown action.");
  const out = handler(sim, args);
  if (!out) return yes;
  return out.ok ? { ok: true, text: "text" in out ? out.text : void 0 } : no("reason" in out && out.reason ? out.reason : bad);
}
function buildProfile(choice) {
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
    traits: sanitizeTraits(choice.traits)
  };
}

// packages/server/src/lives.ts
var hashKey = (key) => createHash("sha256").update(key).digest("hex");
var LifeStore = class {
  constructor(file) {
    this.file = file;
    if (file && existsSync(file)) {
      try {
        const raw = JSON.parse(readFileSync(file, "utf8"));
        for (const [id, rec] of Object.entries(raw)) {
          const state = parseGameState(rec.state);
          if (state && typeof rec.savedAt === "number") this.lives.set(id, { state, savedAt: rec.savedAt });
        }
      } catch (e) {
        console.error("Could not read the saved lives:", e);
      }
    }
  }
  file;
  lives = /* @__PURE__ */ new Map();
  dirty = false;
  get size() {
    return this.lives.size;
  }
  get(key) {
    return this.lives.get(hashKey(key));
  }
  set(key, record) {
    this.lives.set(hashKey(key), record);
    this.dirty = true;
  }
  /** Writes to disk if anything changed. */
  flush() {
    if (!this.file || !this.dirty) return;
    this.dirty = false;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const out = Object.fromEntries(this.lives);
      writeFileSync(`${this.file}.tmp`, JSON.stringify(out));
      renameSync(`${this.file}.tmp`, this.file);
    } catch (e) {
      this.dirty = true;
      console.error("Could not save the lives:", e);
    }
  }
};

// packages/server/src/world.ts
var MAX_SPEED = 7;
var MAX_STEP_SLACK = 1.2;
var LIMITS = { chat: { rate: 1, burst: 4 }, pay: { rate: 1, burst: 3 }, move: { rate: 40, burst: 60 }, rtc: { rate: 20, burst: 40 }, rpc: { rate: 10, burst: 30 } };
var Room = class {
  constructor(name, district = generateLagos(), store = new LifeStore(null)) {
    this.name = name;
    this.store = store;
    this.district = district;
  }
  name;
  store;
  players = /* @__PURE__ */ new Map();
  district;
  nextId = 1;
  get size() {
    return this.players.size;
  }
  join(rawName, now, look, key) {
    if (this.players.size >= MAX_ROOM_PLAYERS) return { ok: false, reason: "This world is full. Try again in a moment." };
    const id = `p${this.nextId++}`;
    const spawn = this.district.spawn;
    const slot = this.players.size;
    const player = {
      id,
      name: this.uniqueName(rawName),
      x: spawn.x + (slot % 5 - 2) * 0.9,
      y: 0,
      z: spawn.z - Math.floor(slot / 5) * 0.9,
      yaw: spawn.yaw,
      clip: "Idle_Loop",
      level: 0,
      look,
      key,
      life: null,
      ack: 0,
      events: [],
      away: null,
      lastStepAt: now,
      lastRpcAt: {},
      lastMoveAt: now,
      buckets: { chat: { tokens: LIMITS.chat.burst, at: now }, pay: { tokens: LIMITS.pay.burst, at: now }, move: { tokens: LIMITS.move.burst, at: now }, rtc: { tokens: LIMITS.rtc.burst, at: now }, rpc: { tokens: LIMITS.rpc.burst, at: now } }
    };
    if (!walkableAt(this.district, player.x, player.z)) {
      player.x = spawn.x;
      player.z = spawn.z;
    }
    this.players.set(id, player);
    this.loadLife(player, now);
    return { ok: true, player };
  }
  leave(id, now = Date.now()) {
    const p = this.players.get(id);
    if (p) this.saveLife(p, now);
    this.players.delete(id);
    this.store.flush();
  }
  // ---------------------------------------------------------------- lives
  /** Picks the player's saved life up where it was left, letting the time they were away pass. */
  loadLife(player, now) {
    const saved = this.store.get(player.key);
    if (!saved) return;
    const state = structuredClone(saved.state);
    const away = simulateAbsence(state, (now - saved.savedAt) / 6e4);
    player.away = away.lines.length ? away.lines : null;
    player.life = new Sim(state);
    player.lastStepAt = now;
    this.rename(player, `${state.profile?.firstName ?? player.name} ${state.profile?.surname ?? ""}`.trim());
  }
  /** Starts a new life from a character choice. The profile is rebuilt from the background, so nothing is taken on trust. */
  createLife(player, choice, now) {
    if (player.life) return { ok: false, reason: "You already have a life." };
    const profile = buildProfile(choice);
    if (!profile) return { ok: false, reason: "That character isn't valid." };
    player.life = new Sim(createGameState(profile));
    player.lastStepAt = now;
    player.away = null;
    this.rename(player, `${profile.firstName} ${profile.surname}`.trim());
    this.saveLife(player, now);
    return { ok: true };
  }
  rename(player, name) {
    const clean = name.slice(0, 20) || player.name;
    const taken = new Set([...this.players.values()].filter((p) => p !== player).map((p) => p.name.toLowerCase()));
    player.name = taken.has(clean.toLowerCase()) ? `${clean.slice(0, 16)} ${player.id.slice(1)}` : clean;
  }
  saveLife(player, now) {
    if (player.life) this.store.set(player.key, { state: structuredClone(player.life.state), savedAt: now });
  }
  /** Lets every online life run for the real time that has passed. */
  stepLives(now) {
    for (const p of this.players.values()) {
      if (!p.life) continue;
      const dt = Math.max(0, Math.min(5, (now - p.lastStepAt) / 1e3));
      p.lastStepAt = now;
      p.life.step(dt);
      p.events.push(...p.life.drainEvents());
    }
  }
  /** Runs one whitelisted action on a player's life. */
  act(player, id, fn, args, now) {
    player.ack = id;
    if (!player.life) return { ok: false, reason: "Make your character first." };
    const wait = rpcCooldown(fn);
    if (wait > 0) {
      if (now - (player.lastRpcAt[fn] ?? 0) < wait * 1e3) return { ok: true };
      player.lastRpcAt[fn] = now;
    }
    const result = runRpc(player.life, fn, args);
    player.events.push(...player.life.drainEvents());
    return result;
  }
  /** The state sent to a player's own page: their life, with only the latest few ledger lines. */
  snapshot(player) {
    const life = player.life;
    if (!life) return null;
    const s = life.state;
    const act = life.active;
    return {
      state: { ...s, ledger: { ...s.ledger, entries: s.ledger.entries.slice(-40) } },
      active: act ? { id: act.def.id, done: act.done, forced: act.forced } : null
    };
  }
  uniqueName(name) {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; n < 100; n++) {
      const candidate = `${name.slice(0, 16)} ${n}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${name.slice(0, 12)} ${this.nextId}`;
  }
  /** Takes one token from a rate-limit bucket; false means "too fast, ignore this message". */
  allow(player, kind, now) {
    const b = player.buckets[kind];
    const limit = LIMITS[kind];
    b.tokens = Math.min(limit.burst, b.tokens + (now - b.at) / 1e3 * limit.rate);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }
  /**
   * A client says where it is. Accept it if it is a believable step from the last accepted position and (on the ground
   * floor) not inside a wall, tree or building; otherwise tell the client where it really is.
   */
  move(player, to, now) {
    const dt = Math.max(0.03, Math.min(2, (now - player.lastMoveAt) / 1e3));
    const distance = Math.hypot(to.x - player.x, to.z - player.z);
    const b = this.district.bounds;
    const inside = to.x > b.minX && to.x < b.maxX && to.z > b.minZ && to.z < b.maxZ;
    const farTooFast = distance > MAX_SPEED * dt + MAX_STEP_SLACK;
    const blocked = to.level === 0 && to.y < 0.05 && !walkableAt(this.district, to.x, to.z, 0.1);
    const heightJump = Math.abs(to.y - player.y) > 4 * dt + 1.5;
    if (!inside || farTooFast || blocked || heightJump || to.level > 4) {
      return { ok: false, correct: { x: player.x, y: player.y, z: player.z, level: player.level } };
    }
    player.x = to.x;
    player.y = to.y;
    player.z = to.z;
    player.yaw = to.yaw;
    player.clip = to.clip;
    player.level = to.level;
    player.lastMoveAt = now;
    return { ok: true };
  }
  /** Moves money from one player's life to another's, both ledgers staying balanced. Nobody can go below zero. */
  pay(from, toId, amount, now) {
    const to = this.players.get(toId);
    if (!to) return { ok: false, reason: "That player isn't here any more." };
    if (to.id === from.id) return { ok: false, reason: "You can't pay yourself." };
    if (!from.life || !to.life) return { ok: false, reason: "That player hasn't made their character yet." };
    if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: "Enter a whole amount above zero." };
    if (amount > 1e6) return { ok: false, reason: "That is more than one payment can carry." };
    const out = transfer(from.life.state.ledger, PLAYER, SINK, amount, `Sent to ${to.name}`, from.life.state.minute);
    if (!out.ok) return { ok: false, reason: "You don't have enough money." };
    from.life.state.stats.totalSpent += amount;
    transfer(to.life.state.ledger, MINT, PLAYER, amount, `From ${from.name}`, to.life.state.minute);
    to.life.state.stats.totalEarned += amount;
    this.saveLife(from, now);
    this.saveLife(to, now);
    return { ok: true, to };
  }
  money(player) {
    return player.life?.money ?? 0;
  }
  view(p) {
    return { id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, yaw: p.yaw, clip: p.clip, level: p.level, look: p.look };
  }
};

// packages/server/src/index.ts
var send = (ws, message) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
};
async function startGameServer(options = {}) {
  const store = new LifeStore(options.dataDir ? join(options.dataDir, "lives.json") : null);
  const room = new Room(options.room ?? "lagos-test", void 0, store);
  const sockets = /* @__PURE__ */ new Map();
  const origins2 = options.origins ?? [];
  const http = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      res.end(JSON.stringify({ ok: true, room: room.name, players: room.size, protocol: PROTOCOL_VERSION }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  const wss = new WebSocketServer({
    server: http,
    maxPayload: 8192,
    perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 3 } },
    verifyClient: (info) => origins2.length === 0 || origins2.includes(info.origin)
  });
  const broadcast = (message, except) => {
    const text = JSON.stringify(message);
    for (const [id, ws] of sockets) if (id !== except && ws.readyState === ws.OPEN) ws.send(text);
  };
  const sendLife = (p) => {
    const ws = sockets.get(p.id);
    const snap = room.snapshot(p);
    if (!ws || !snap) return;
    const away = p.away ?? void 0;
    p.away = null;
    send(ws, { t: "life", state: snap.state, ack: p.ack, active: snap.active, events: p.events.splice(0), away });
  };
  wss.on("connection", (ws) => {
    let me = null;
    const helloTimer = setTimeout(() => ws.close(4001, "hello timeout"), 1e4);
    ws.on("message", (data) => {
      const now = Date.now();
      const message = parseClientMessage(data.toString());
      if (!message) return send(ws, { t: "error", reason: "That message was not understood." });
      if (!me) {
        if (message.t !== "hello") return;
        if (message.protocol !== PROTOCOL_VERSION) {
          send(ws, { t: "error", reason: "Your game is out of date. Reload the page to update." });
          return ws.close(4002, "protocol");
        }
        for (const other of room.players.values()) {
          if (other.key !== message.key) continue;
          room.saveLife(other, now);
          other.life = null;
          sockets.get(other.id)?.close(4004, "signed in elsewhere");
        }
        const joined = room.join(message.name, now, message.look, message.key);
        if (!joined.ok) {
          send(ws, { t: "error", reason: joined.reason });
          return ws.close(4003, "full");
        }
        clearTimeout(helloTimer);
        me = joined.player;
        sockets.set(me.id, ws);
        send(ws, { t: "welcome", id: me.id, room: room.name, protocol: PROTOCOL_VERSION, money: room.money(me), players: [...room.players.values()].filter((p) => p.id !== me.id).map((p) => room.view(p)), serverTime: now });
        broadcast({ t: "join", player: room.view(me) }, me.id);
        if (me.life) sendLife(me);
        else send(ws, { t: "needsLife" });
        return;
      }
      switch (message.t) {
        case "create": {
          const made = room.createLife(me, message.profile, now);
          if (!made.ok) return send(ws, { t: "error", reason: made.reason });
          broadcast({ t: "join", player: room.view(me) }, me.id);
          send(ws, { t: "money", balance: room.money(me), note: "Your life begins." });
          sendLife(me);
          return;
        }
        case "do": {
          if (!room.allow(me, "rpc", now)) {
            me.ack = message.id;
            send(ws, { t: "done", id: message.id, ok: false, reason: "Slow down a little." });
            return sendLife(me);
          }
          const result = room.act(me, message.id, message.fn, message.args, now);
          send(ws, result.ok ? { t: "done", id: message.id, ok: true, text: result.text } : { t: "done", id: message.id, ok: false, reason: result.reason });
          sendLife(me);
          return;
        }
        case "move": {
          if (!room.allow(me, "move", now)) return;
          const result = room.move(me, message, now);
          if (!result.ok) send(ws, { t: "correct", ...result.correct });
          return;
        }
        case "chat": {
          if (!room.allow(me, "chat", now)) return send(ws, { t: "error", reason: "You're typing too fast." });
          broadcast({ t: "chat", from: me.id, name: me.name, text: message.text, at: now });
          return;
        }
        case "pay": {
          if (!room.allow(me, "pay", now)) return send(ws, { t: "error", reason: "Slow down: too many payments." });
          const result = room.pay(me, message.to, message.amount, now);
          if (!result.ok) return send(ws, { t: "error", reason: result.reason });
          send(ws, { t: "money", balance: room.money(me), note: `You sent \u20A6${message.amount.toLocaleString()} to ${result.to.name}.` });
          sendLife(me);
          const target = sockets.get(result.to.id);
          if (target) {
            send(target, { t: "money", balance: room.money(result.to), note: `${me.name} sent you \u20A6${message.amount.toLocaleString()}.` });
            sendLife(result.to);
          }
          return;
        }
        case "ping":
          return send(ws, { t: "pong", ts: message.ts, serverTime: now });
        case "rtc": {
          if (!room.allow(me, "rtc", now)) return;
          const target = sockets.get(message.to);
          if (target) send(target, { t: "rtc", from: me.id, data: message.data });
          return;
        }
        default:
          return;
      }
    });
    ws.on("close", () => {
      clearTimeout(helloTimer);
      if (me) {
        room.leave(me.id);
        if (sockets.get(me.id) === ws) sockets.delete(me.id);
        broadcast({ t: "leave", id: me.id });
      }
    });
    ws.on("error", () => ws.close());
  });
  let lifeTicks = 0;
  const lifeInterval = setInterval(() => {
    const now = Date.now();
    room.stepLives(now);
    for (const p of room.players.values()) sendLife(p);
    if (++lifeTicks % 15 === 0) {
      for (const p of room.players.values()) room.saveLife(p, now);
      store.flush();
    }
  }, 1e3);
  let tick = 0;
  const interval = setInterval(() => {
    if (room.size < 2) return;
    tick++;
    broadcast({ t: "state", tick, serverTime: Date.now(), players: [...room.players.values()].map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, clip: p.clip, level: p.level })) });
  }, 1e3 / (options.tickRate ?? 10));
  await new Promise((resolve) => http.listen(options.port ?? 0, resolve));
  const address = http.address();
  const port2 = typeof address === "object" && address ? address.port : options.port ?? 0;
  return {
    port: port2,
    room,
    close: () => new Promise((resolve) => {
      clearInterval(interval);
      clearInterval(lifeInterval);
      const now = Date.now();
      for (const p of room.players.values()) room.saveLife(p, now);
      store.flush();
      for (const ws of sockets.values()) ws.terminate();
      wss.close(() => http.close(() => resolve()));
    })
  };
}

// packages/server/src/main.ts
var port = Number(process.env.PORT ?? 8787);
var origins = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
var server = await startGameServer({ port, room: process.env.ROOM ?? "lagos-test", origins, dataDir: process.env.DATA_DIR ?? "./data" });
console.log(`TheLife game server on port ${server.port} (room ${server.room.name}${origins.length ? `, origins ${origins.join(", ")}` : ", any origin"})`);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => void server.close().then(() => process.exit(0)));
