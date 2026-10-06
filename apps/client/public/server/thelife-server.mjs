// packages/server/src/index.ts
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

// packages/shared/src/nav.ts
function createNavGrid(bounds, cell) {
  const width = Math.ceil((bounds.maxX - bounds.minX) / cell);
  const height = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
  return { minX: bounds.minX, minZ: bounds.minZ, cell, width, height, blocked: new Uint8Array(width * height) };
}
function toCell(grid, x, z) {
  return [Math.floor((x - grid.minX) / grid.cell), Math.floor((z - grid.minZ) / grid.cell)];
}
function inside(grid, cx, cz) {
  return cx >= 0 && cz >= 0 && cx < grid.width && cz < grid.height;
}
function blockRectCentres(grid, rect3, inflate = 0) {
  const [x0, z0] = toCell(grid, rect3.minX - inflate, rect3.minZ - inflate);
  const [x1, z1] = toCell(grid, rect3.maxX + inflate, rect3.maxZ + inflate);
  for (let cz = Math.max(0, z0); cz <= Math.min(grid.height - 1, z1); cz++) {
    for (let cx = Math.max(0, x0); cx <= Math.min(grid.width - 1, x1); cx++) {
      const x = grid.minX + (cx + 0.5) * grid.cell;
      const z = grid.minZ + (cz + 0.5) * grid.cell;
      if (x > rect3.minX - inflate && x < rect3.maxX + inflate && z > rect3.minZ - inflate && z < rect3.maxZ + inflate) grid.blocked[cz * grid.width + cx] = 1;
    }
  }
}
function isFree(grid, x, z) {
  const [cx, cz] = toCell(grid, x, z);
  return inside(grid, cx, cz) && grid.blocked[cz * grid.width + cx] === 0;
}

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
var WALL_THICKNESS = 0.2;
var DOOR_WIDTH = 1.2;
var rect = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });
var HOLLOW_LANDMARKS = /* @__PURE__ */ new Set(["police", "hospital", "school", "church", "mosque", "fire", "bank", "hotel"]);
function hasInterior(lot) {
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
  const inside2 = m.at(frontDoorU, 1.4);
  return {
    lotId: lot.id,
    floors,
    storey: lot.storey,
    rooms,
    walls,
    stairs,
    furniture,
    inside: shop ? m.at(W * 0.35, 1.4) : inside2,
    garage: garageW ? m.box(mainW, W, 0, D) : null
  };
}
function climbStep(climbs) {
  return climbs === 0 ? { x: 0, z: -1 } : climbs === 1 ? { x: 1, z: 0 } : climbs === 2 ? { x: 0, z: 1 } : { x: -1, z: 0 };
}
function planBlockers(plan, floor = 0) {
  const out = [];
  const t = WALL_THICKNESS / 2;
  for (const w of plan.walls) {
    if (w.floor !== floor) continue;
    const alongX = w.a.z === w.b.z;
    const length = alongX ? w.b.x - w.a.x : w.b.z - w.a.z;
    const open = w.openings.filter((o) => o.kind !== "window").sort((p, q) => p.t0 - q.t0);
    let at = 0;
    const segment = (s0, s1) => {
      if (s1 - s0 < 0.02) return;
      out.push(alongX ? rect(w.a.x + s0, w.a.x + s1, w.a.z - t, w.a.z + t) : rect(w.a.x - t, w.a.x + t, w.a.z + s0, w.a.z + s1));
    };
    for (const o of open) {
      segment(at, o.t0);
      at = o.t1;
    }
    segment(at, length);
  }
  for (const item2 of plan.furniture) if (item2.floor === floor) out.push(item2.rect);
  const rail = (s, closeTop, closeBottom) => {
    const r = s.rect;
    const step = climbStep(s.climbs);
    const gap = 0.15;
    const th = 0.1;
    if (step.x === 0) {
      out.push(rect(r.minX - gap - th, r.minX - gap, r.minZ, r.maxZ), rect(r.maxX + gap, r.maxX + gap + th, r.minZ, r.maxZ));
      const top = step.z > 0 ? r.maxZ : r.minZ;
      const bottom = step.z > 0 ? r.minZ : r.maxZ;
      const end = (z, dir) => rect(r.minX - gap, r.maxX + gap, dir > 0 ? z + gap : z - gap - th, dir > 0 ? z + gap + th : z - gap);
      if (closeTop) out.push(end(top, step.z));
      if (closeBottom) out.push(end(bottom, -step.z));
    } else {
      out.push(rect(r.minX, r.maxX, r.minZ - gap - th, r.minZ - gap), rect(r.minX, r.maxX, r.maxZ + gap, r.maxZ + gap + th));
      const top = step.x > 0 ? r.maxX : r.minX;
      const bottom = step.x > 0 ? r.minX : r.maxX;
      const end = (x, dir) => rect(dir > 0 ? x + gap : x - gap - th, dir > 0 ? x + gap + th : x - gap, r.minZ - gap, r.maxZ + gap);
      if (closeTop) out.push(end(top, step.x));
      if (closeBottom) out.push(end(bottom, -step.x));
    }
  };
  for (const s of plan.stairs) {
    if (s.floor === floor) rail(s, true, false);
    if (s.floor === floor - 1) rail(s, false, true);
  }
  return out;
}

// packages/game-core/src/district.ts
var DISTRICT_HALF = 216;
var ROAD_CENTRES = [-180, -108, -36, 36, 108, 180];
var ROAD_WIDTH = 8;
var SIDEWALK = 2;
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
var rect2 = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });
var overlaps = (a, b, pad = 0) => a.minX < b.maxX + pad && a.maxX > b.minX - pad && a.minZ < b.maxZ + pad && a.maxZ > b.minZ - pad;
function generateDistrict(seed = 1) {
  const rand = rng(seed);
  const pick = (items) => items[Math.floor(rand() * items.length)];
  const between = (lo2, hi2) => lo2 + rand() * (hi2 - lo2);
  const H = DISTRICT_HALF;
  const bounds = rect2(-H, H, -H, H);
  const half = ROAD_WIDTH / 2;
  const roads = [];
  const sidewalks = [];
  for (const c of ROAD_CENTRES) {
    roads.push(rect2(c - half, c + half, -H, H), rect2(-H, H, c - half, c + half));
    for (const side of [-1, 1]) {
      const edge = c + side * half;
      const a = side < 0 ? edge - SIDEWALK : edge;
      let from = -H;
      for (const other of [...ROAD_CENTRES, H + ROAD_WIDTH]) {
        const to = Math.min(other - half, H);
        if (to > from + 0.01) sidewalks.push(rect2(a, a + SIDEWALK, from, to), rect2(from, to, a, a + SIDEWALK));
        from = other + half;
      }
    }
  }
  const edges = [-H, ...ROAD_CENTRES, H];
  const blocks = [];
  const lots = [];
  const trees = [];
  const lamps = [];
  const paving = [];
  const fields = [];
  let lotNo = 0;
  const planeSpots = [];
  const lo = (c) => c + half + SIDEWALK;
  const hi = (c) => c - half - SIDEWALK;
  for (let i = 0; i < edges.length - 1; i++) {
    for (let j = 0; j < edges.length - 1; j++) {
      const outerX = i === 0 || i === edges.length - 2;
      const outerZ = j === 0 || j === edges.length - 2;
      const x0 = i === 0 ? -H : lo(edges[i]);
      const x1 = i === edges.length - 2 ? H : hi(edges[i + 1]);
      const z0 = j === 0 ? -H : lo(edges[j]);
      const z1 = j === edges.length - 2 ? H : hi(edges[j + 1]);
      if (x1 - x0 < 10 || z1 - z0 < 10) continue;
      const area = rect2(x0, x1, z0, z1);
      const centre = i === 3 && j === 3;
      const southEdge = j === edges.length - 2;
      let kind;
      if (outerX || outerZ) kind = southEdge && !outerX ? "apron" : "farm";
      else if (centre) kind = "market";
      else if (j === edges.length - 3) kind = "commercial";
      else kind = rand() < 0.14 ? "park" : "residential";
      blocks.push({ kind, area, i, j });
      if (kind === "farm") {
        const strip = 14;
        for (let z = z0 + 4; z + strip < z1 - 2; z += strip + 4) {
          for (let x = x0 + 4; x + 22 < x1 - 2; x += 26) fields.push(rect2(x, x + 22, z, z + strip));
        }
        for (let n = 0; n < 6; n++) trees.push({ x: between(x0 + 3, x1 - 3), z: between(z0 + 3, z1 - 3), scale: between(0.9, 1.4), variant: pick([0, 1, 2]) });
      } else if (kind === "apron") {
        paving.push(rect2(x0 + 2, x1 - 2, z0 + 9, z0 + 17));
        const main = i === 3;
        const w = main ? Math.min(54, x1 - x0 - 8) : 26;
        const cx = (x0 + x1) / 2;
        const fp = rect2(cx - w / 2, cx + w / 2, z0 + 2, z0 + 9);
        lots.push({ id: `L${lotNo++}`, kind: main ? "terminal" : "hangar", plot: rect2(cx - w / 2 - 2, cx + w / 2 + 2, z0, z0 + 10), footprint: fp, floors: main ? 2 : 1, storey: main ? 4.2 : 7, roof: "flat", facing: 0, colour: main ? 6 : 2, garage: false, fence: false, landmark: main ? "airport" : void 0 });
        for (const px of main ? [cx - 16, cx + 6, cx + 22] : [cx - 8, cx + 10]) planeSpots.push({ x: px, z: z0 + 13 });
      } else if (kind === "park") {
        for (let n = 0; n < 18; n++) trees.push({ x: between(x0 + 3, x1 - 3), z: between(z0 + 3, z1 - 3), scale: between(0.8, 1.5), variant: pick([0, 1, 2]) });
      } else if (kind === "market") {
        paving.push(rect2(x0, x1, z0, z1));
        for (let z = z0 + 6; z + 3 < z1 - 4; z += 9) {
          for (let x = x0 + 6; x + 3 < x1 - 4; x += 8) {
            if (rand() < 0.15) continue;
            const fp = rect2(x, x + 3.6, z, z + 3);
            lots.push({ id: `L${lotNo++}`, kind: "stall", plot: fp, footprint: fp, floors: 1, storey: 2.6, roof: "flat", facing: rand() < 0.5 ? 0 : 2, colour: Math.floor(rand() * 8), garage: false, fence: false });
          }
        }
      } else {
        const depth = kind === "commercial" ? 18 : 22;
        for (const side of [0, 1]) {
          let x = x0;
          while (x < x1 - 10) {
            const width = Math.min(x1 - x, kind === "commercial" ? between(10, 15) : between(13, 20));
            if (width < 9) break;
            const plot = side === 0 ? rect2(x, x + width, z0, z0 + depth) : rect2(x, x + width, z1 - depth, z1);
            const facing = side === 0 ? 0 : 2;
            const setback = kind === "commercial" ? 0.8 : between(3, 5);
            const fpDepth = depth - setback - (kind === "commercial" ? 1 : between(2, 4));
            const side_ = kind === "commercial" ? 0.4 : between(1.8, 2.8);
            const fp = side === 0 ? rect2(plot.minX + side_, plot.maxX - side_, plot.minZ + setback, plot.minZ + setback + fpDepth) : rect2(plot.minX + side_, plot.maxX - side_, plot.maxZ - setback - fpDepth, plot.maxZ - setback);
            const roll = rand();
            const floors = kind === "commercial" ? 1 + Math.floor(rand() * 2) : roll < 0.5 ? 1 : roll < 0.85 ? 2 : 3;
            lots.push({
              id: `L${lotNo++}`,
              kind: kind === "commercial" ? "shop" : floors === 3 ? "flats" : "house",
              plot,
              footprint: fp,
              floors,
              storey: kind === "commercial" ? 3.6 : 3,
              roof: kind === "commercial" || floors === 3 ? "flat" : rand() < 0.6 ? "gable" : "flat",
              facing,
              colour: Math.floor(rand() * 8),
              garage: kind === "residential" && floors < 3 && rand() < 0.55 && width > 14,
              fence: kind === "residential" && rand() < 0.7
            });
            if (kind === "residential" && rand() < 0.5) {
              trees.push({ x: between(plot.minX + 1, plot.maxX - 1), z: side === 0 ? plot.minZ + 1.6 : plot.maxZ - 1.6, scale: between(0.7, 1.2), variant: pick([0, 1, 2]) });
            }
            x += width + 1.5;
          }
        }
        if (kind === "commercial") paving.push(rect2(x0 + 2, x1 - 2, z0 + depth + 1, z1 - depth - 1));
        else for (let n = 0; n < 6; n++) trees.push({ x: between(x0 + 3, x1 - 3), z: between(z0 + depth + 1, z1 - depth - 1), scale: between(0.8, 1.3), variant: pick([0, 1, 2]) });
      }
    }
  }
  const landmarks = [];
  const entranceOf = (lot) => {
    if (hasInterior(lot)) {
      const inside2 = generatePlan(lot).inside;
      const out = lot.facing === 0 ? { x: 0, z: -1 } : lot.facing === 2 ? { x: 0, z: 1 } : lot.facing === 1 ? { x: 1, z: 0 } : { x: -1, z: 0 };
      return { x: inside2.x + out.x * 2.9, z: inside2.z + out.z * 2.9 };
    }
    const f = lot.footprint;
    const mx = (f.minX + f.maxX) / 2;
    const mz = (f.minZ + f.maxZ) / 2;
    return lot.facing === 0 ? { x: mx, z: f.minZ - 1.5 } : lot.facing === 2 ? { x: mx, z: f.maxZ + 1.5 } : lot.facing === 1 ? { x: f.maxX + 1.5, z: mz } : { x: f.minX - 1.5, z: mz };
  };
  const claim = (kind, name, bi, bj, floors) => {
    const candidates = blocks.filter((b) => b.kind === "residential" || b.kind === "commercial").sort((p, q) => Math.hypot(p.i - bi, p.j - bj) - Math.hypot(q.i - bi, q.j - bj));
    for (const b of candidates) {
      const inBlock = lots.filter((l) => !l.landmark && (l.kind === "house" || l.kind === "flats" || l.kind === "shop") && l.plot.minX >= b.area.minX - 0.01 && l.plot.maxX <= b.area.maxX + 0.01 && l.plot.minZ >= b.area.minZ - 0.01 && l.plot.maxZ <= b.area.maxZ + 0.01);
      if (!inBlock.length) continue;
      const lot = inBlock.sort((p, q) => q.plot.maxX - q.plot.minX - (p.plot.maxX - p.plot.minX))[0];
      lot.landmark = kind;
      lot.floors = floors;
      lot.fence = kind === "school" || kind === "fire" || kind === "police" || kind === "hospital";
      lot.garage = false;
      lot.roof = kind === "church" ? "gable" : "flat";
      lot.storey = 3.4;
      const f = lot.footprint;
      lot.footprint = lot.facing === 0 ? rect2(lot.plot.minX + 1.2, lot.plot.maxX - 1.2, f.minZ, f.maxZ) : rect2(lot.plot.minX + 1.2, lot.plot.maxX - 1.2, f.minZ, f.maxZ);
      landmarks.push({ id: `P${landmarks.length}`, kind, name, x: (lot.footprint.minX + lot.footprint.maxX) / 2, z: (lot.footprint.minZ + lot.footprint.maxZ) / 2, entrance: entranceOf(lot), lotId: lot.id });
      return;
    }
  };
  claim("police", "Central Police Station", 2, 1, 2);
  claim("hospital", "General Hospital", 4, 2, 3);
  claim("school", "Unity Primary School", 1, 2, 2);
  claim("church", "Grace Chapel", 3, 1, 1);
  claim("mosque", "Central Mosque", 5, 1, 1);
  claim("fire", "Fire Station", 2, 5, 2);
  claim("bank", "City Bank", 4, 5, 2);
  claim("fuel", "Palm Fuel Station", 1, 5, 1);
  claim("hotel", "Palm Court Hotel", 3, 5, 3);
  const airportLot = lots.find((l) => l.landmark === "airport");
  if (airportLot) landmarks.push({ id: `P${landmarks.length}`, kind: "airport", name: "Alexion International Airport", x: (airportLot.footprint.minX + airportLot.footprint.maxX) / 2, z: (airportLot.footprint.minZ + airportLot.footprint.maxZ) / 2, entrance: entranceOf(airportLot), lotId: airportLot.id });
  landmarks.push({ id: `P${landmarks.length}`, kind: "market", name: "Central Market", x: 0, z: 0, entrance: { x: -34, z: 0 }, lotId: null });
  const southZ = Math.max(...blocks.filter((b) => b.kind === "apron").map((b) => b.area.maxZ));
  const runway = rect2(-H + 4, H - 4, southZ - 11, southZ - 1);
  const nearJunction = (t) => ROAD_CENTRES.some((c) => Math.abs(t - c) < half + 6);
  for (const c of ROAD_CENTRES) {
    for (let t = -H + 10; t < H - 10; t += 12) {
      if (nearJunction(t)) continue;
      const side = Math.floor((t + H) / 12) % 2 === 0 ? -1 : 1;
      const off = c + side * (half + SIDEWALK - 0.7);
      if (!blocks.some((b) => b.kind === "apron" && overlaps(b.area, rect2(off - 1, off + 1, t - 1, t + 1)))) {
        trees.push({ x: off, z: t, scale: between(0.8, 1.2), variant: pick([0, 1, 2]) });
        trees.push({ x: t, z: off, scale: between(0.8, 1.2), variant: pick([0, 1, 2]) });
      }
    }
    for (let t = -H + 16; t < H - 12; t += 24) {
      if (nearJunction(t)) continue;
      lamps.push({ x: c + half + 0.8, z: t, facing: 3 }, { x: t, z: c + half + 0.8, facing: 0 });
    }
  }
  const props = planeSpots.map((p, k) => ({ kind: "plane", x: p.x, z: p.z, yaw: 0, variant: k % 3 }));
  const wires = [];
  const outerLimit = H - 8;
  const propBox = (x, z, r) => rect2(x - r, x + r, z - r, z + r);
  const onLot = (x, z, r) => lots.some((l) => overlaps(l.plot, propBox(x, z, r)));
  for (const c of ROAD_CENTRES) {
    const ts = [];
    for (let t = -H + 20; t < outerLimit; t += 36) if (!nearJunction(t)) ts.push(t);
    ts.forEach((t, i) => {
      props.push({ kind: "pole", x: c - half - 0.8, z: t, yaw: 0, variant: 0 }, { kind: "pole", x: t, z: c - half - 0.8, yaw: 90, variant: 0 });
      if (i > 0) wires.push([c - half - 0.8, ts[i - 1], c - half - 0.8, t], [ts[i - 1], c - half - 0.8, t, c - half - 0.8]);
    });
    for (let t = -H + 30; t < outerLimit; t += 96) {
      if (nearJunction(t)) continue;
      props.push({ kind: "hydrant", x: c + half + 0.7, z: t, yaw: 0, variant: 0 }, { kind: "hydrant", x: t, z: c + half + 0.7, yaw: 0, variant: 0 });
    }
    for (let t = -H + 40; t < outerLimit; t += 48) {
      if (nearJunction(t)) continue;
      props.push({ kind: "bin", x: c - half - 1.4, z: t, yaw: 0, variant: 0 }, { kind: "bin", x: t, z: c - half - 1.4, yaw: 0, variant: 0 });
    }
    for (let t = -H + 14; t < outerLimit; t += 7.5) {
      if (nearJunction(t) || nearJunction(t + 4.5) || nearJunction(t - 4.5)) continue;
      for (const side of [-1, 1]) {
        if (rand() > 0.2) continue;
        const off = c + side * (half - 1.25);
        props.push({ kind: "car", x: off, z: t, yaw: 0, variant: Math.floor(rand() * 6) });
      }
      for (const side of [-1, 1]) {
        if (rand() > 0.2) continue;
        const off = c + side * (half - 1.25);
        props.push({ kind: "car", x: t, z: off, yaw: 90, variant: Math.floor(rand() * 6) });
      }
    }
  }
  for (const cx of ROAD_CENTRES) {
    for (const cz of ROAD_CENTRES) {
      for (const [sx, sz] of [[1, 1], [-1, -1]]) if (rand() < 0.6) props.push({ kind: "sign", x: cx + sx * (half + 1.1), z: cz + sz * (half + 1.1), yaw: 0, variant: 0 });
    }
  }
  for (let k = 0; k + 1 < ROAD_CENTRES.length; k++) {
    const mid = (ROAD_CENTRES[k] + ROAD_CENTRES[k + 1]) / 2;
    for (const c of ROAD_CENTRES) if (rand() < 0.3) props.push({ kind: "busStop", x: c + half + 1.4, z: mid, yaw: 0, variant: 0 });
  }
  for (const b of blocks) {
    if (b.kind !== "park" && b.kind !== "market") continue;
    const n = b.kind === "park" ? 3 : 4;
    for (let i = 0; i < n; i++) props.push({ kind: "bench", x: between(b.area.minX + 4, b.area.maxX - 4), z: between(b.area.minZ + 4, b.area.maxZ - 4), yaw: rand() < 0.5 ? 0 : 90, variant: 0 });
  }
  const placed = [];
  for (const p of props) {
    if (Math.abs(p.x) > H - 1 || Math.abs(p.z) > H - 1) continue;
    if (p.kind !== "car" && p.kind !== "bench" && onLot(p.x, p.z, 0.6)) continue;
    if (p.kind === "bench" && lots.some((l) => overlaps(l.footprint, propBox(p.x, p.z, 1.5)))) continue;
    const clash = placed.some((q) => {
      if (p.kind === "car" && q.kind === "car") return p.yaw === q.yaw ? p.yaw === 0 ? Math.abs(q.x - p.x) < 2.4 && Math.abs(q.z - p.z) < 4.8 : Math.abs(q.x - p.x) < 4.8 && Math.abs(q.z - p.z) < 2.4 : Math.abs(q.x - p.x) < 4.6 && Math.abs(q.z - p.z) < 4.6;
      if (p.kind === "car" || q.kind === "car") return false;
      return Math.abs(q.x - p.x) < 1 && Math.abs(q.z - p.z) < 1;
    });
    if (clash) continue;
    placed.push(p);
  }
  const keep = trees.filter((tr) => {
    const box = rect2(tr.x - 0.5, tr.x + 0.5, tr.z - 0.5, tr.z + 0.5);
    if (roads.some((r) => overlaps(r, box))) return false;
    return !lots.some((l) => overlaps(l.footprint, box, 1));
  });
  return { seed, bounds, roads, sidewalks, blocks, lots, trees: keep, lamps, landmarks, runway, props: placed, wires, paving, fields, spawn: { x: ROAD_CENTRES[2] + 0.5, z: ROAD_CENTRES[2] + 12, yaw: 0 } };
}
function walkBlockers(d) {
  const out = [];
  for (const l of d.lots) {
    if (hasInterior(l)) out.push(...planBlockers(generatePlan(l)));
    else out.push(l.footprint);
  }
  for (const t of d.trees) out.push(rect2(t.x - 0.35, t.x + 0.35, t.z - 0.35, t.z + 0.35));
  for (const l of d.lamps) out.push(rect2(l.x - 0.15, l.x + 0.15, l.z - 0.15, l.z + 0.15));
  for (const p of d.props) {
    const r = { pole: [0.15, 0.15], hydrant: [0.2, 0.2], bin: [0.3, 0.3], sign: [0.1, 0.1], bench: [0.9, 0.3], busStop: [1.5, 0.8], car: [0.95, 2.2], plane: [4.8, 5.2] }[p.kind];
    const [hx, hz] = p.yaw === 90 ? [r[1], r[0]] : [r[0], r[1]];
    out.push(rect2(p.x - hx, p.x + hx, p.z - hz, p.z + hz));
  }
  return out;
}

// packages/server/src/world.ts
var START_MONEY = 2e4;
var MAX_SPEED = 7;
var MAX_STEP_SLACK = 1.2;
var LIMITS = { chat: { rate: 1, burst: 4 }, pay: { rate: 1, burst: 3 }, move: { rate: 40, burst: 60 }, rtc: { rate: 20, burst: 40 } };
var Room = class {
  constructor(name, district = generateDistrict(1)) {
    this.name = name;
    this.district = district;
    this.nav = createNavGrid(district.bounds, 0.5);
    for (const r of walkBlockers(district)) blockRectCentres(this.nav, r, 0.25);
  }
  players = /* @__PURE__ */ new Map();
  ledger = createLedger();
  district;
  nav;
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
    if (!isFree(this.nav, player.x, player.z)) {
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
    const inside2 = to.x > b.minX && to.x < b.maxX && to.z > b.minZ && to.z < b.maxZ;
    const farTooFast = distance > MAX_SPEED * dt + MAX_STEP_SLACK;
    const blocked = to.level === 0 && to.y < 0.05 && !isFree(this.nav, to.x, to.z);
    const heightJump = Math.abs(to.y - player.y) > 4 * dt + 1.5;
    if (!inside2 || farTooFast || blocked || heightJump || to.level > 4) {
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
