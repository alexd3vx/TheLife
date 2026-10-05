import type { PhoneTier } from "./profile";

// The LifeStore catalogue: apps you can download onto the phone. Brand names are our own. Rules live in phoneStore.ts and
// phone.ts; what each app shows is built in the client. Sizes are in MB and matter: a phone has limited space.

export type StoreCategory = "tools" | "social" | "media" | "life" | "games";

export const STORE_CATEGORIES: { id: StoreCategory; label: string }[] = [
  { id: "tools", label: "Tools" },
  { id: "social", label: "Social" },
  { id: "media", label: "Media" },
  { id: "life", label: "Life" },
  { id: "games", label: "Games" },
];

export type StoreAppId =
  | "notes" | "calendar" | "weather" | "torch" | "calc" | "clock" | "translate" | "currency" | "netcheck"
  | "gram" | "chirp" | "match" | "tube" | "tunes" | "radio" | "cinema" | "events"
  | "eats" | "invest" | "ajo" | "learn" | "health" | "faith" | "sleep" | "diary"
  | "snake" | "g2048" | "xo" | "memory" | "trivia"
  | "convert" | "split" | "todo" | "budget" | "dice" | "focus" | "water"
  | "books" | "podcasts" | "nolly"
  | "recipes" | "fit" | "bills" | "fuel" | "gigs"
  | "hangman" | "connect4" | "wordguess" | "minesweeper" | "reaction";

export interface StoreApp {
  id: StoreAppId;
  name: string;
  blurb: string;
  category: StoreCategory;
  /** Space it takes on the phone, and the data it needs to download. */
  sizeMB: number;
  /** Naira; 0 = free. */
  price: number;
  /** The cheapest phone that can run it. */
  minTier: PhoneTier;
  /** Data used each time the app is opened on mobile data (0 = works offline). */
  dataMB: number;
  /** Fun gained per minute of use (games give fun when you score instead). */
  funPerMin: number;
  /** Icon name in the client's icon set, and its colours. */
  icon: string;
  from: string;
  to: string;
}

const TIER_ORDER: PhoneTier[] = ["basic", "mid", "flagship"];
export const tierAtLeast = (have: PhoneTier, need: PhoneTier) => TIER_ORDER.indexOf(have) >= TIER_ORDER.indexOf(need);

const app = (
  id: StoreAppId, name: string, blurb: string, category: StoreCategory, sizeMB: number, price: number,
  minTier: PhoneTier, dataMB: number, funPerMin: number, icon: string, from: string, to: string,
): StoreApp => ({ id, name, blurb, category, sizeMB, price, minTier, dataMB, funPerMin, icon, from, to });

export const STORE_APPS: StoreApp[] = [
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
  app("learn", "LifeLearn", "Short courses that build skills", "life", 220, 2_000, "basic", 6, 0, "book", "#74c0fc", "#1c7ed6"),
  app("health", "LifeHealth", "Everyday health advice", "life", 30, 0, "basic", 1, 0, "cross", "#ff8787", "#c92a2a"),
  app("faith", "Faith", "Daily verse and prayer times", "life", 20, 0, "basic", 0, 0.1, "faith", "#e5dbff", "#7048e8"),
  app("sleep", "SleepLog", "How rested are you", "life", 10, 1_500, "basic", 0, 0, "moon", "#5c7cfa", "#364fc7"),
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
  app("reaction", "Tap Speed", "How fast are your thumbs", "games", 6, 0, "basic", 0, 0, "bolt", "#ffe066", "#e67700"),
];

/** Which phone models can run an app. */
export function compatibleTiers(app: StoreApp): PhoneTier[] {
  return TIER_ORDER.filter((t) => tierAtLeast(t, app.minTier));
}

export const STORE_IDS = new Set<string>(STORE_APPS.map((a) => a.id));

export function storeAppById(id: string): StoreApp | undefined {
  return STORE_APPS.find((a) => a.id === id);
}

/** Room for downloaded apps on each model (the system and the built-in apps already take the rest). */
export const STORAGE_MB: Record<PhoneTier, number> = { basic: 1_200, mid: 6_000, flagship: 24_000 };

/** How fast mobile data downloads, in MB per game minute. Cheaper phones have slower radios. */
export const MOBILE_SPEED: Record<PhoneTier, number> = { basic: 6, mid: 24, flagship: 60 };

export interface HomePlan {
  id: "wifi_basic" | "wifi_fast";
  name: string;
  blurb: string;
  price: number;
  days: number;
  /** MB per game minute over Wi-Fi. */
  speed: number;
}

export const HOME_PLANS: HomePlan[] = [
  { id: "wifi_basic", name: "Home Wi-Fi Basic", blurb: "Fine for most things · 30 days", price: 8_000, days: 30, speed: 45 },
  { id: "wifi_fast", name: "Home Wi-Fi Fast", blurb: "Fibre speed · 30 days", price: 18_000, days: 30, speed: 160 },
];

export function homePlanById(id: string): HomePlan | undefined {
  return HOME_PLANS.find((p) => p.id === id);
}
