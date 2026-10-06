// packages/server/src/index.ts
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

// packages/shared/src/net.ts
var PROTOCOL_VERSION = 1;
var MAX_NAME = 20;
var MAX_CHAT = 200;
var MAX_ROOM_PLAYERS = 50;
var finite = (v, limit = 1e6) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;
function parseClientMessage(raw) {
  let value = raw;
  if (typeof raw === "string") {
    if (raw.length > 4e3) return null;
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
      return { t: "hello", name, protocol: finite(m.protocol, 1e3) ? m.protocol : 0, look: typeof m.look === "string" ? cleanLook(m.look) : void 0 };
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

// packages/game-core/src/types.ts
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

// packages/game-core/src/phoneContent.ts
var WORDS = ["MANGO", "RICES", "STEAM", "CHAIR", "LIGHT", "PLANT", "MONEY", "DANCE", "HAPPY", "BREAD", "SMILE", "RIVER", "TRAIN", "PHONE", "HOUSE", "FLOUR", "SUGAR", "BEANS", "FRUIT", "TOWEL", "STORE", "MARKET"].filter((w) => w.length === 5 && w !== "RICES");

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
var CHARGERS = [
  { id: "charger_micro", name: "Basic charger (micro)", ports: ["micro"], rate: 25, price: 2500 },
  { id: "charger_usbc", name: "USB-C charger", ports: ["usbc"], rate: 55, price: 6e3 },
  { id: "charger_multi", name: "Multi-tip charger", ports: ["micro", "usbc"], rate: 40, price: 7500 },
  { id: "charger_lifelink", name: "LifeLink fast charger", ports: ["lifelink", "usbc"], rate: 150, price: 22e3 }
];
var POWER_BANK = { id: "powerbank", name: "Power bank 10,000mAh", price: 12e3, capacity: 120, outRate: 50, inRate: 20 };
var SHOP_ITEMS = [
  { id: "groc_small", name: "Groceries", blurb: "6 portions of food", kind: "grocery", price: 1800, deliveryMinutes: 30, amount: 6 },
  { id: "groc_big", name: "Family pack", blurb: "14 portions of food", kind: "grocery", price: 3900, deliveryMinutes: 45, amount: 14 },
  ...CHARGERS.map((c) => ({ id: c.id, name: c.name, blurb: `Fits ${c.ports.join(" / ")} \xB7 ${c.rate}% per hour`, kind: "charger", price: c.price, deliveryMinutes: 60 })),
  { id: POWER_BANK.id, name: POWER_BANK.name, blurb: "Charge anywhere, even in a power cut", kind: "powerbank", price: POWER_BANK.price, deliveryMinutes: 90 },
  { id: "phone_basic", name: "LifePhone Go", blurb: "Micro-USB \xB7 LCD \xB7 battery for days", kind: "phone", price: PHONE_MODELS.basic.price, deliveryMinutes: 240, tier: "basic" },
  { id: "phone_mid", name: "LifePhone Plus", blurb: "USB-C \xB7 AMOLED 90Hz \xB7 jobs and maps", kind: "phone", price: PHONE_MODELS.mid.price, deliveryMinutes: 240, tier: "mid" },
  { id: "phone_flagship", name: "LifePhone Max", blurb: "LifeLink fast charge \xB7 AMOLED 120Hz", kind: "phone", price: PHONE_MODELS.flagship.price, deliveryMinutes: 240, tier: "flagship" }
];
var JOB_DECISION_MINUTES = 12 * 60;

// packages/game-core/src/phoneStoreData.ts
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

// packages/game-core/src/absence.ts
var MAX_AWAY_GAME_MINUTES = 12 * 60;

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
  const start = nearestStreet(toWorld(placePx("Independence House")).x, toWorld(placePx("Independence House")).z + 10);
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

// packages/server/src/world.ts
var START_MONEY = 2e4;
var MAX_SPEED = 7;
var MAX_STEP_SLACK = 1.2;
var LIMITS = { chat: { rate: 1, burst: 4 }, pay: { rate: 1, burst: 3 }, move: { rate: 40, burst: 60 }, rtc: { rate: 20, burst: 40 } };
var Room = class {
  constructor(name, district = generateLagos()) {
    this.name = name;
    this.district = district;
  }
  name;
  players = /* @__PURE__ */ new Map();
  ledger = createLedger();
  district;
  nextId = 1;
  minute = 0;
  get size() {
    return this.players.size;
  }
  join(rawName, now, look) {
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
      account: `acct:${id}`,
      lastMoveAt: now,
      buckets: { chat: { tokens: LIMITS.chat.burst, at: now }, pay: { tokens: LIMITS.pay.burst, at: now }, move: { tokens: LIMITS.move.burst, at: now }, rtc: { tokens: LIMITS.rtc.burst, at: now } }
    };
    if (!walkableAt(this.district, player.x, player.z)) {
      player.x = spawn.x;
      player.z = spawn.z;
    }
    transfer(this.ledger, MINT, player.account, START_MONEY, "Starting money", this.minute);
    this.players.set(id, player);
    return { ok: true, player };
  }
  leave(id) {
    this.players.delete(id);
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
  /** Moves money between two players. The ledger always balances; nobody can go below zero. */
  pay(from, toId, amount) {
    const to = this.players.get(toId);
    if (!to) return { ok: false, reason: "That player isn't here any more." };
    if (to.id === from.id) return { ok: false, reason: "You can't pay yourself." };
    if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: "Enter a whole amount above zero." };
    if (amount > 1e6) return { ok: false, reason: "That is more than one payment can carry." };
    const r = transfer(this.ledger, from.account, to.account, amount, `${from.name} to ${to.name}`, this.minute);
    return r.ok ? { ok: true, to } : { ok: false, reason: "You don't have enough money." };
  }
  money(player) {
    return balance(this.ledger, player.account);
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
  const room = new Room(options.room ?? "lagos-test");
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
    verifyClient: (info) => origins2.length === 0 || origins2.includes(info.origin)
  });
  const broadcast = (message, except) => {
    const text = JSON.stringify(message);
    for (const [id, ws] of sockets) if (id !== except && ws.readyState === ws.OPEN) ws.send(text);
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
        const joined = room.join(message.name, now, message.look);
        if (!joined.ok) {
          send(ws, { t: "error", reason: joined.reason });
          return ws.close(4003, "full");
        }
        clearTimeout(helloTimer);
        me = joined.player;
        sockets.set(me.id, ws);
        send(ws, { t: "welcome", id: me.id, room: room.name, protocol: PROTOCOL_VERSION, money: room.money(me), players: [...room.players.values()].filter((p) => p.id !== me.id).map((p) => room.view(p)), serverTime: now });
        broadcast({ t: "join", player: room.view(me) }, me.id);
        return;
      }
      switch (message.t) {
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
          const result = room.pay(me, message.to, message.amount);
          if (!result.ok) return send(ws, { t: "error", reason: result.reason });
          send(ws, { t: "money", balance: room.money(me), note: `You sent \u20A6${message.amount.toLocaleString()} to ${result.to.name}.` });
          const target = sockets.get(result.to.id);
          if (target) send(target, { t: "money", balance: room.money(result.to), note: `${me.name} sent you \u20A6${message.amount.toLocaleString()}.` });
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
        sockets.delete(me.id);
        broadcast({ t: "leave", id: me.id });
      }
    });
    ws.on("error", () => ws.close());
  });
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
      for (const ws of sockets.values()) ws.terminate();
      wss.close(() => http.close(() => resolve()));
    })
  };
}

// packages/server/src/main.ts
var port = Number(process.env.PORT ?? 8787);
var origins = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
var server = await startGameServer({ port, room: process.env.ROOM ?? "lagos-test", origins });
console.log(`TheLife game server on port ${server.port} (room ${server.room.name}${origins.length ? `, origins ${origins.join(", ")}` : ", any origin"})`);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => void server.close().then(() => process.exit(0)));
