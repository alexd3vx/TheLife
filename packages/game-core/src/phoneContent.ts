// What the phone's apps show, as deterministic data: the same game day always gives the same weather, prices and feed,
// so it can be tested and (later) agreed between players. Brands and people are invented.

/** A number in [0, 1) that depends only on the inputs. */
export function seeded(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) {
    h ^= Math.floor(p) + 0x9e3779b9;
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}

const pick = <T,>(list: readonly T[], r: number): T => list[Math.min(list.length - 1, Math.floor(r * list.length))]!;

// ---------------------------------------------------------------- weather

export type Sky = "sunny" | "cloudy" | "rain" | "storm";
export interface Weather {
  day: number;
  sky: Sky;
  label: string;
  highC: number;
  lowC: number;
  rainChance: number;
}

const SKY_LABEL: Record<Sky, string> = { sunny: "Hot and sunny", cloudy: "Cloudy and humid", rain: "Rain on and off", storm: "Thunderstorms" };

export function weatherFor(day: number): Weather {
  const r = seeded(day, 11);
  const sky: Sky = r < 0.45 ? "sunny" : r < 0.75 ? "cloudy" : r < 0.93 ? "rain" : "storm";
  const high = 29 + Math.round(seeded(day, 12) * 6) - (sky === "rain" || sky === "storm" ? 3 : 0);
  return { day, sky, label: SKY_LABEL[sky], highC: high, lowC: high - 6 - Math.round(seeded(day, 13) * 2), rainChance: sky === "storm" ? 90 : sky === "rain" ? 70 : sky === "cloudy" ? 30 : 5 };
}

// ---------------------------------------------------------------- money rates and shares

export interface Rate {
  code: string;
  name: string;
  /** Naira per unit. */
  naira: number;
}

export function ratesFor(day: number): Rate[] {
  const wobble = (base: number, seed: number) => Math.round(base * (1 + 0.04 * Math.sin(day * 0.23 + seed) + 0.015 * Math.sin(day * 0.9 + seed * 2)));
  return [
    { code: "USD", name: "US dollar", naira: wobble(1_550, 1) },
    { code: "GBP", name: "British pound", naira: wobble(1_980, 2) },
    { code: "EUR", name: "Euro", naira: wobble(1_680, 3) },
  ];
}

export interface Stock {
  symbol: string;
  name: string;
  base: number;
  wave: number;
  phase: number;
}

export const STOCKS: Stock[] = [
  { symbol: "LAGB", name: "Lagoon Bank", base: 42, wave: 0.11, phase: 0.4 },
  { symbol: "NAIJ", name: "NaijaTel", base: 210, wave: 0.07, phase: 1.7 },
  { symbol: "SUNP", name: "SunPower Energy", base: 95, wave: 0.16, phase: 2.9 },
  { symbol: "MEGA", name: "Mega Mart Group", base: 64, wave: 0.09, phase: 4.1 },
  { symbol: "CEMT", name: "Delta Cement", base: 310, wave: 0.06, phase: 5.2 },
  { symbol: "TECH", name: "Alexion Tech", base: 28, wave: 0.22, phase: 0.9 },
];

export function stockPrice(symbol: string, day: number): number {
  const s = STOCKS.find((x) => x.symbol === symbol);
  if (!s) return 0;
  const trend = 1 + 0.0009 * day;
  const move = 1 + s.wave * Math.sin(day * 0.31 + s.phase) + (s.wave / 2) * Math.sin(day * 1.13 + s.phase * 2);
  return Math.max(1, Math.round(s.base * trend * move * 100) / 100);
}

// ---------------------------------------------------------------- feeds (LifeGram, Chirp, Spark)

export interface FeedPost {
  id: string;
  author: string;
  handle: string;
  text: string;
  /** A colour seed so each photo post has its own gradient. */
  hue: number;
  likes: number;
}

const PEOPLE = ["Tunde", "Amaka", "Chidi", "Bisi", "Musa", "Ngozi", "Seyi", "Fatima", "Emeka", "Zainab", "Kemi", "Obinna", "Halima", "Dayo", "Ife", "Uche"];
const SURN = ["A.", "O.", "B.", "I.", "E.", "M."];
const CAPTIONS = [
  "Sunday rice, no stories.", "Traffic today was a whole movie.", "NEPA took light again. Candle dinner, anyone?", "New braids. Be nice.", "Market day haul, God is good.",
  "The sunset from my roof though.", "Fuel queue gist: bring a book.", "Back on my feet. Thank you all.", "Jollof wars: I choose peace (and my mum's recipe).", "Weekend plans: sleep.",
  "Look who passed the interview!", "Rain stopped me from going anywhere. Fine by me.", "My little shop, open for business.", "Evening football with the guys.", "Studying till the light goes. Again.",
];
const CHIRPS = [
  "If your phone is at 3% in a power cut, you know peace is not real.", "Buying data is a monthly personality test.", "Hot take: puff-puff is a complete meal.", "Who else is waiting for the rain to stop before leaving home?",
  "Okada man just gave me a TED talk about the economy. Free of charge.", "Savings update: still saving. Pray for me.", "Proud of everyone who woke up and tried again today.", "Jobs: if you can fix phones, the whole street needs you.",
  "Rent day is sneaky. It comes so fast.", "Nobody tells you how heavy a bag of rice is until you carry it home.", "The generator and I have an understanding: I pay, it works. Mostly.", "Tomatoes dropped in price. Small victories matter.",
];

export function feedPosts(kind: "gram" | "chirp", day: number, page: number, count = 8): FeedPost[] {
  const out: FeedPost[] = [];
  for (let i = 0; i < count; i++) {
    const n = page * count + i;
    const r = (k: number) => seeded(day, n, k, kind === "gram" ? 1 : 2);
    const name = pick(PEOPLE, r(1));
    out.push({
      id: `${kind}_${day}_${n}`,
      author: `${name} ${pick(SURN, r(2))}`,
      handle: `@${name.toLowerCase()}${Math.floor(r(3) * 90 + 10)}`,
      text: pick(kind === "gram" ? CAPTIONS : CHIRPS, r(4)),
      hue: Math.floor(r(5) * 360),
      likes: Math.floor(r(6) * 400),
    });
  }
  return out;
}

export interface Profile2 {
  id: string;
  name: string;
  age: number;
  job: string;
  bio: string;
  hue: number;
}

const JOBS2 = ["nurse", "engineer", "teacher", "chef", "designer", "mechanic", "student", "trader", "photographer", "driver", "accountant", "DJ"];
const BIOS = ["Love music, hate traffic.", "Looking for someone who can cook (I can't).", "Football, films and fried plantain.", "Here for good vibes and good food.", "Serious about my hustle, soft about my dog.", "Rainy days and long chats.", "Don't ask me to pick a restaurant."];

export function sparkProfiles(day: number, count = 6): Profile2[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `sp_${day}_${i}`,
    name: pick(PEOPLE, seeded(day, i, 21)),
    age: 21 + Math.floor(seeded(day, i, 22) * 14),
    job: pick(JOBS2, seeded(day, i, 23)),
    bio: pick(BIOS, seeded(day, i, 24)),
    hue: Math.floor(seeded(day, i, 25) * 360),
  }));
}

// ---------------------------------------------------------------- Translate

export const LANGS = ["English", "Pidgin", "Yoruba", "Igbo", "Hausa"] as const;
export type Lang = (typeof LANGS)[number];

/** English, Pidgin, Yoruba, Igbo, Hausa. */
export const PHRASES: Record<Lang, string>[] = [
  { English: "Hello", Pidgin: "How far", Yoruba: "Bawo ni", Igbo: "Nnọọ", Hausa: "Sannu" },
  { English: "Good morning", Pidgin: "Good morning o", Yoruba: "Ẹ kaaro", Igbo: "Ụtụtụ ọma", Hausa: "Ina kwana" },
  { English: "Thank you", Pidgin: "Thank you o", Yoruba: "Ẹ ṣé", Igbo: "Daalụ", Hausa: "Na gode" },
  { English: "How much is this?", Pidgin: "How much be this one?", Yoruba: "Èló ni èyí?", Igbo: "Ego ole ka nke a bụ?", Hausa: "Nawa ne wannan?" },
  { English: "I am hungry", Pidgin: "Hunger dey catch me", Yoruba: "Ebi ń pa mí", Igbo: "Agụụ na-agụ m", Hausa: "Ina jin yunwa" },
  { English: "Water", Pidgin: "Water", Yoruba: "Omi", Igbo: "Mmiri", Hausa: "Ruwa" },
  { English: "Please", Pidgin: "Abeg", Yoruba: "Jọ̀ọ́", Igbo: "Biko", Hausa: "Don Allah" },
  { English: "Come here", Pidgin: "Come here", Yoruba: "Wá síbí", Igbo: "Bịa ebe a", Hausa: "Zo nan" },
  { English: "Goodbye", Pidgin: "See you later", Yoruba: "Ó dàbọ̀", Igbo: "Ka ọ dị", Hausa: "Sai an jima" },
  { English: "Welcome", Pidgin: "You are welcome", Yoruba: "Ẹ kú àbọ̀", Igbo: "Nnọọ", Hausa: "Barka da zuwa" },
  { English: "Yes", Pidgin: "Yes", Yoruba: "Bẹ́ẹ̀ni", Igbo: "Ee", Hausa: "Eh" },
  { English: "No", Pidgin: "No", Yoruba: "Rárá", Igbo: "Mba", Hausa: "A'a" },
  { English: "I don't understand", Pidgin: "I no understand", Yoruba: "Èmi kò gbọ́", Igbo: "Aghọtaghị m", Hausa: "Ban gane ba" },
  { English: "Where is the toilet?", Pidgin: "Where the toilet dey?", Yoruba: "Níbo ni ilé ìgbọ̀nsẹ̀?", Igbo: "Ebee ka ụlọ mposi dị?", Hausa: "Ina bayan gida?" },
];

// ---------------------------------------------------------------- Naija Quiz

export interface Question {
  q: string;
  options: string[];
  answer: number;
}

export const QUESTIONS: Question[] = [
  { q: "Which of these is a popular Nigerian rice dish?", options: ["Paella", "Jollof", "Risotto", "Biryani"], answer: 1 },
  { q: "How many colours are on the Nigerian flag?", options: ["2", "3", "4", "5"], answer: 0 },
  { q: "Which is the largest city in Nigeria by population?", options: ["Abuja", "Kano", "Lagos", "Ibadan"], answer: 2 },
  { q: "Which snack is deep-fried dough, sweet and round?", options: ["Puff-puff", "Suya", "Akara", "Moi moi"], answer: 0 },
  { q: "Suya is mostly made from...", options: ["Spiced grilled meat", "Plantain", "Beans", "Yam"], answer: 0 },
  { q: "Which river is the longest inside Nigeria?", options: ["Niger", "Congo", "Nile", "Zambezi"], answer: 0 },
  { q: "Akara is made from...", options: ["Beans", "Rice", "Cassava", "Corn"], answer: 0 },
  { q: "What is the capital of Nigeria?", options: ["Lagos", "Abuja", "Kaduna", "Enugu"], answer: 1 },
  { q: "'Abeg' in Pidgin means...", options: ["Please", "Quickly", "Money", "Home"], answer: 0 },
  { q: "Which is a Yoruba greeting for the morning?", options: ["Ẹ kaaro", "Sannu", "Nnọọ", "Barka"], answer: 0 },
  { q: "Garri is made from...", options: ["Cassava", "Maize", "Rice", "Millet"], answer: 0 },
  { q: "Which season brings heavy rain to southern Nigeria?", options: ["Rainy season", "Harmattan", "Spring", "Winter"], answer: 0 },
  { q: "Harmattan is a dry wind from the...", options: ["Sahara", "Atlantic", "Alps", "Arctic"], answer: 0 },
  { q: "How many days are in a week?", options: ["5", "6", "7", "8"], answer: 2 },
  { q: "Which of these is a Nigerian music style?", options: ["Afrobeats", "Flamenco", "Polka", "K-pop"], answer: 0 },
  { q: "Moi moi is steamed...", options: ["Bean pudding", "Rice cake", "Bread", "Fish"], answer: 0 },
];

/** A shuffled round of questions, the same for everybody on a given day. */
export function quizRound(day: number, count = 5): Question[] {
  const order = QUESTIONS.map((_, i) => ({ i, k: seeded(day, i, 31) })).sort((a, b) => a.k - b.k);
  return order.slice(0, count).map((o) => QUESTIONS[o.i]!);
}

// ---------------------------------------------------------------- media, events, faith, health, learning, food

export const STATIONS = [
  { id: "fm1", name: "Lagoon FM 98.1", genre: "Afrobeats & talk", now: ["Morning drive: traffic and music", "Top 10 countdown", "Call-in: your rent stories", "Highlife classics"] },
  { id: "fm2", name: "Naija Gold 102.5", genre: "Highlife & juju", now: ["Golden oldies", "Request hour", "The evening gist", "Jùjú nights"] },
  { id: "fm3", name: "Sports 24", genre: "Football & news", now: ["League roundup", "Transfer talk", "Match commentary", "Fans phone-in"] },
  { id: "fm4", name: "Calm 90.9", genre: "Gospel & soft", now: ["Morning devotion", "Soft hits", "Reflections", "Night prayers"] },
  { id: "fm5", name: "Street Beats 95.3", genre: "Hip-hop & amapiano", now: ["Fresh drops", "Amapiano mix", "Freestyle Friday", "After-dark mix"] },
];

export const FILMS = [
  { id: "f1", title: "Lagos Midnight", genre: "Thriller", mins: 112, price: 3_500 },
  { id: "f2", title: "The Last Danfo", genre: "Comedy", mins: 98, price: 3_000 },
  { id: "f3", title: "Harmattan Heart", genre: "Romance", mins: 105, price: 3_500 },
  { id: "f4", title: "Naija Heroes", genre: "Action", mins: 120, price: 4_000 },
  { id: "f5", title: "Mama's Kitchen", genre: "Family", mins: 92, price: 2_500 },
];

export function filmsFor(day: number) {
  return FILMS.filter((_, i) => seeded(day, i, 41) > 0.25).slice(0, 4);
}

export const EVENT_POOL = [
  { title: "Open-air Afrobeats night", place: "City stadium", price: 5_000 },
  { title: "Weekend food market", place: "Central market", price: 0 },
  { title: "Tech meetup: build something", place: "Community hub", price: 0 },
  { title: "Church thanksgiving service", place: "Grace Chapel", price: 0 },
  { title: "Comedy night", place: "Hotel ballroom", price: 4_000 },
  { title: "Football: derby day", place: "City stadium", price: 2_500 },
  { title: "Art and craft fair", place: "Park lawn", price: 500 },
  { title: "Job fair", place: "Convention centre", price: 0 },
];

export function eventsFor(day: number) {
  return EVENT_POOL.filter((_, i) => seeded(day, i, 51) > 0.45).slice(0, 4).map((e, i) => ({ ...e, id: `ev_${day}_${i}`, inDays: Math.floor(seeded(day, i, 52) * 6) }));
}

export const VERSES = [
  { text: "This is the day that the Lord has made; let us rejoice and be glad in it.", ref: "Psalm 118:24" },
  { text: "Trust in the Lord with all your heart and lean not on your own understanding.", ref: "Proverbs 3:5" },
  { text: "Be still, and know that I am God.", ref: "Psalm 46:10" },
  { text: "Peace I leave with you; my peace I give you.", ref: "John 14:27" },
  { text: "And He is the One who gives strength to the weary.", ref: "Isaiah 40:29" },
  { text: "Wait for the Lord; be strong, and let your heart take courage.", ref: "Psalm 27:14" },
  { text: "Whoever is generous to the poor lends to the Lord.", ref: "Proverbs 19:17" },
  { text: "The Lord is my shepherd; I shall not want.", ref: "Psalm 23:1" },
];

export const PRAYER_TIMES = [
  { name: "Fajr", at: "05:20" },
  { name: "Dhuhr", at: "13:10" },
  { name: "Asr", at: "16:30" },
  { name: "Maghrib", at: "19:05" },
  { name: "Isha", at: "20:20" },
];

export const HEALTH_TIPS = [
  { title: "Drink enough water", text: "Aim for about 2 litres a day. If your urine is dark, drink more." },
  { title: "Wash your hands", text: "Soap and water for 20 seconds before eating and after the toilet prevents most stomach bugs." },
  { title: "Sleep matters", text: "Seven to eight hours keeps your mood and energy steady. Skipping sleep makes everything harder." },
  { title: "Malaria care", text: "Sleep under a net, clear standing water, and see a clinic quickly if you get fever and chills." },
  { title: "Eat real meals", text: "Skipping meals drops your energy. Rice, beans, vegetables and a little protein go a long way." },
  { title: "Move a little", text: "A 20-minute walk a day lifts your mood and helps you sleep." },
  { title: "Safe cooking", text: "Keep raw and cooked food apart and reheat leftovers until they steam." },
  { title: "Stress is real", text: "Talk to someone, step outside, or write it down. You don't have to carry it alone." },
];

export interface Course {
  id: string;
  title: string;
  skill: string;
  lessons: string[];
}

export const COURSES: Course[] = [
  { id: "basic_computer", title: "Computer basics", skill: "computer", lessons: ["Files and folders", "Typing and documents", "Spreadsheets for beginners"] },
  { id: "web_dev", title: "Build your first website", skill: "computer", lessons: ["HTML", "CSS", "A little JavaScript", "Publish it"] },
  { id: "money_skills", title: "Money skills", skill: "knowledge", lessons: ["Budgeting", "Saving habits", "Avoiding bad loans"] },
  { id: "english", title: "Professional English", skill: "knowledge", lessons: ["Emails", "Interviews", "Presentations"] },
  { id: "business", title: "Start a small business", skill: "knowledge", lessons: ["Find a need", "Price and profit", "Customers", "Keep records"] },
];

export const LESSON_XP = 40;
export const LESSON_GAP_MINUTES = 45;

export interface Meal {
  id: string;
  name: string;
  blurb: string;
  price: number;
  /** Cooked meals added to the kitchen. */
  meals: number;
  minutes: number;
}

export const EATS_MENU: Meal[] = [
  { id: "eats_jollof", name: "Jollof rice and chicken", blurb: "Party jollof, fried plantain", price: 3_200, meals: 1, minutes: 35 },
  { id: "eats_suya", name: "Suya platter", blurb: "Spicy beef, onions, yaji", price: 2_500, meals: 1, minutes: 30 },
  { id: "eats_amala", name: "Amala and ewedu", blurb: "With gbegiri and assorted meat", price: 2_800, meals: 1, minutes: 40 },
  { id: "eats_pounded", name: "Pounded yam and egusi", blurb: "Big bowl, enough for two meals", price: 4_800, meals: 2, minutes: 45 },
  { id: "eats_pepper", name: "Pepper soup", blurb: "Catfish, hot and light", price: 3_500, meals: 1, minutes: 35 },
  { id: "eats_family", name: "Family tray", blurb: "Rice, stew, chicken, salad for four", price: 9_500, meals: 4, minutes: 50 },
];

export function mealById(id: string): Meal | undefined {
  return EATS_MENU.find((m) => m.id === id);
}

export const DIARY_MOODS = [
  { id: 1, label: "Rough", face: "😞" },
  { id: 2, label: "Low", face: "😕" },
  { id: 3, label: "Okay", face: "😐" },
  { id: 4, label: "Good", face: "🙂" },
  { id: 5, label: "Great", face: "😄" },
];

// ---------------------------------------------------------------- more apps

export function fuelPrices(day: number) {
  const w = (base: number, seed: number) => Math.round(base * (1 + 0.05 * Math.sin(day * 0.21 + seed) + 0.02 * Math.sin(day * 0.77 + seed)));
  return [
    { id: "petrol", name: "Petrol (per litre)", naira: w(900, 1) },
    { id: "diesel", name: "Diesel (per litre)", naira: w(1_200, 2) },
    { id: "gas", name: "Cooking gas (per kg)", naira: w(1_400, 3) },
  ];
}

export const STORIES = [
  { id: "s1", title: "The Last Bus to Ibadan", minutes: 4, text: "Tunde ran the last hundred metres with his bag bumping against his back. The conductor was already shouting the final call. He jumped on as the door rattled shut, found a seat by the window and let out a long breath. The road to Ibadan stretched out in the dusk, orange and dusty and full of promise. He had a job interview in the morning, one shirt that was still clean, and a mother who had prayed for him at the gate. That was enough." },
  { id: "s2", title: "Mama Ngozi's Pot", minutes: 3, text: "Every Sunday the smell of Mama Ngozi's stew climbed the stairs and knocked on every door in the compound. Nobody was ever invited, and nobody ever went hungry. 'A big pot,' she liked to say, 'is just a small pot with more friends.' When the light went off, they ate by candle and nobody complained. When it came back, they cheered like they had won a match." },
  { id: "s3", title: "Power Cut", minutes: 3, text: "At 7:42 the whole street went dark. For a moment there was silence, then a chorus of groans, then somebody's generator coughing into life. Chioma lit a candle and found her old radio. The static cleared into a highlife song her father used to hum. She turned it up a little. Outside, children were already playing in the dark, shrieking happily, and the night did not feel so long at all." },
  { id: "s4", title: "First Salary", minutes: 4, text: "When the alert finally came, Bisi read the message three times to make sure the zeros were real. She did not spend it on anything for an hour. She just sat on the edge of the bed, holding the phone. Then she called her mother, who cried, and then her brother, who asked for a loan. She laughed so hard she had to put the phone down. It was the best Friday of the year." },
];

export const PODCASTS = [
  { id: "p1", title: "Hustle Radio", host: "Kemi & Tobi", ep: "How I saved my first ₦100,000", minutes: 22 },
  { id: "p2", title: "Gist Everyday", host: "Uche", ep: "Is okada coming back?", minutes: 18 },
  { id: "p3", title: "Small Biz Naija", host: "Aisha", ep: "Pricing without fear", minutes: 25 },
  { id: "p4", title: "Code & Chill", host: "Femi", ep: "Your first remote job", minutes: 30 },
  { id: "p5", title: "Naija Football Talk", host: "Big Dayo", ep: "The derby, dissected", minutes: 35 },
];

export const RECIPES = [
  { id: "r1", name: "Party jollof rice", time: "1 h 15", steps: ["Blend tomatoes, pepper and onion; fry until the oil floats.", "Add stock, thyme, curry and the washed parboiled rice.", "Cover tightly and cook on low heat; do not stir.", "Let it catch a little at the bottom for the smoky taste."] },
  { id: "r2", name: "Egusi soup", time: "50 min", steps: ["Fry onions and ground egusi in palm oil until it clumps.", "Add stock, pepper, meat and fish.", "Simmer, then add spinach or bitter leaf for the last five minutes."] },
  { id: "r3", name: "Moi moi", time: "1 h", steps: ["Peel and blend beans with pepper and onion.", "Mix with oil, stock cube and spices.", "Pour into leaves or foil and steam for 45 minutes."] },
  { id: "r4", name: "Puff-puff", time: "40 min", steps: ["Mix flour, sugar, yeast and warm water into a loose batter.", "Let it rise for 30 minutes.", "Drop spoonfuls into hot oil and fry until golden."] },
  { id: "r5", name: "Beans porridge", time: "1 h 10", steps: ["Boil beans until soft.", "Add palm oil, pepper, crayfish and onions.", "Add chopped plantain or yam and simmer until it thickens."] },
];

export const WORDS = ["MANGO", "RICES", "STEAM", "CHAIR", "LIGHT", "PLANT", "MONEY", "DANCE", "HAPPY", "BREAD", "SMILE", "RIVER", "TRAIN", "PHONE", "HOUSE", "FLOUR", "SUGAR", "BEANS", "FRUIT", "TOWEL", "STORE", "MARKET"].filter((w) => w.length === 5 && w !== "RICES");
export const HANG_WORDS = ["JOLLOF", "LAGOS", "MARKET", "DANFO", "GENERATOR", "PLANTAIN", "ABUJA", "HARMATTAN", "OKADA", "CASSAVA", "SUYA", "NAIRA", "COMPOUND", "BALCONY", "SCHOOL"];

export function wordOfDay(day: number): string {
  return WORDS[Math.floor(seeded(day, 61) * WORDS.length)]!;
}

export interface Gig {
  id: string;
  title: string;
  blurb: string;
  pay: number;
  energy: number;
}

export const GIGS: Gig[] = [
  { id: "g1", title: "Transcribe a short audio", blurb: "Type what you hear. 30 minutes of work.", pay: 1_200, energy: 8 },
  { id: "g2", title: "Deliver a parcel nearby", blurb: "Quick errand across the street.", pay: 1_500, energy: 12 },
  { id: "g3", title: "Tutor a student", blurb: "One hour of maths help.", pay: 2_500, energy: 14 },
  { id: "g4", title: "Help a stall set up", blurb: "Carry boxes for the market lady.", pay: 2_000, energy: 18 },
  { id: "g5", title: "Design a flyer", blurb: "A quick poster for a church event.", pay: 3_000, energy: 12 },
];

export const GIG_GAP_MINUTES = 90;

export interface Workout {
  id: string;
  name: string;
  blurb: string;
  energy: number;
  fun: number;
  hunger: number;
  hygiene: number;
}

export const WORKOUTS: Workout[] = [
  { id: "w1", name: "Brisk walk", blurb: "20 minutes around the compound", energy: 4, fun: 6, hunger: 3, hygiene: 2 },
  { id: "w2", name: "Skipping", blurb: "A 10-minute rope session", energy: 8, fun: 8, hunger: 5, hygiene: 6 },
  { id: "w3", name: "Home circuit", blurb: "Push-ups, squats and planks", energy: 12, fun: 10, hunger: 7, hygiene: 10 },
];
export const WORKOUT_GAP_MINUTES = 120;
export const WATER_GOAL = 8;
export const FOCUS_XP = 12;
