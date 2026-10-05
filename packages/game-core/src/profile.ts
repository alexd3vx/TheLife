import { sanitizeTraits } from "./traits";

// Who you are and where you start. A random background (lapo = poor, middle, nepo = rich) decides your money, rent,
// weekly allowance, phone and a few traits, so every new life begins differently. Pure data and one pure function
// (given a random source), so it is unit-tested and will run on the server later.

export type Tier = "lapo" | "middle" | "nepo";
export type PhoneTier = "basic" | "mid" | "flagship";
export type Sex = "male" | "female";
export type Region = "yoruba" | "igbo" | "hausa" | "south";

export interface Profile {
  firstName: string;
  surname: string;
  sex: Sex;
  tier: Tier;
  backgroundId: string;
  title: string;
  story: string;
  hometown: string;
  /** Naira in hand on day one. */
  startingMoney: number;
  /** Weekly rent; 0 when you live in the family house. */
  rentPerWeek: number;
  /** Weekly money from family (nepo), paid on rent day. */
  weeklyAllowance: number;
  allowanceFrom: string;
  /** The phone you start with (the phone feature builds on this). */
  phone: PhoneTier;
  /** Trait ids the player chose (see traits.ts). */
  traits: string[];
  /** Flavour from the background itself ("Hustler", "Knows the neighbours"): description only. */
  flavour: string[];
  /** Starting skill experience by skill id. */
  skills: Record<string, number>;
}

export interface BackgroundDef {
  id: string;
  tier: Tier;
  /** Relative chance of being rolled. */
  weight: number;
  title: string;
  story: string;
  region: Region;
  hometowns: string[];
  money: [number, number];
  rent: number;
  allowance: number;
  allowanceFrom?: string;
  phone: PhoneTier;
  traits: string[];
  skills?: Record<string, number>;
}

export const BACKGROUNDS: BackgroundDef[] = [
  // ---- lapo: little money, rent to find, a cracked basic phone
  { id: "mushin_tailor", tier: "lapo", weight: 12, title: "Tailor's child from Mushin", region: "yoruba", hometowns: ["Mushin", "Oshodi", "Ajegunle"],
    story: "Mama sews for a living and the machine never rests. You learned early that nobody hands you anything. Rent is yours to find.",
    money: [6_000, 14_000], rent: 14_000, allowance: 0, phone: "basic", traits: ["Hustler", "Knows the neighbours"], skills: { computer: 2 } },
  { id: "okada_family", tier: "lapo", weight: 10, title: "Okada rider's child", region: "hausa", hometowns: ["Kano", "Kaduna", "Zaria"],
    story: "Your father rides from before sunrise until the fuel runs out. There is food, but never extra. You are the first one to try something different.",
    money: [5_000, 11_000], rent: 14_000, allowance: 0, phone: "basic", traits: ["Early riser", "Thrifty"] },
  { id: "market_trader", tier: "lapo", weight: 10, title: "Yam seller's child", region: "igbo", hometowns: ["Onitsha", "Nnewi", "Aba"],
    story: "You grew up counting change at the stall. You can bargain with anyone and spot a bad note from across the road, but savings are thin.",
    money: [7_000, 15_000], rent: 14_000, allowance: 0, phone: "basic", traits: ["Sharp with money", "Loud"], skills: { knowledge: 1 } },
  { id: "scholarship_student", tier: "lapo", weight: 8, title: "Scholarship graduate", region: "south", hometowns: ["Benin City", "Warri", "Asaba"],
    story: "You got through school on a scholarship and a lot of late nights. The degree is real; the bank balance is not.",
    money: [4_000, 9_000], rent: 14_000, allowance: 0, phone: "basic", traits: ["Bookish", "Tired"], skills: { knowledge: 4, computer: 3 } },
  // ---- middle: steady, comfortable enough
  { id: "teacher_child", tier: "middle", weight: 14, title: "Teacher's child from Ibadan", region: "yoruba", hometowns: ["Ibadan", "Abeokuta", "Ogbomoso"],
    story: "A quiet house full of books and marking. You were never rich and never hungry. Your parents sent you off with a small cushion and high hopes.",
    money: [45_000, 80_000], rent: 14_000, allowance: 0, phone: "mid", traits: ["Disciplined", "Well read"], skills: { knowledge: 3 } },
  { id: "civil_servant", tier: "middle", weight: 12, title: "Civil servant's child", region: "hausa", hometowns: ["Abuja", "Kaduna", "Jos"],
    story: "Salary on the 25th, when it comes. You learned patience and how to stretch a month. Your family helped with the first rent.",
    money: [55_000, 95_000], rent: 14_000, allowance: 0, phone: "mid", traits: ["Patient", "Connected"] },
  { id: "nurse_child", tier: "middle", weight: 10, title: "Nurse's child", region: "igbo", hometowns: ["Enugu", "Port Harcourt", "Owerri"],
    story: "Your mother worked nights so you could study by day. She slipped you something before you left and told you to eat properly.",
    money: [40_000, 75_000], rent: 14_000, allowance: 0, phone: "mid", traits: ["Caring", "Light sleeper"] },
  { id: "shop_owner", tier: "middle", weight: 8, title: "Shop owner's child", region: "south", hometowns: ["Benin City", "Port Harcourt", "Warri"],
    story: "Your family's provision store paid for school and kept the lights on. You know stock, customers and how to smile at both.",
    money: [60_000, 110_000], rent: 14_000, allowance: 0, phone: "mid", traits: ["Good with people", "Hustler"] },
  // ---- nepo: money, a family house, an allowance, the best phone
  { id: "oil_exec", tier: "nepo", weight: 4, title: "Oil executive's child", region: "south", hometowns: ["Lekki", "Port Harcourt", "Victoria Island"],
    story: "Foreign schools, a driver and a flat nobody asked you to pay for. The only thing you were never taught is what things cost.",
    money: [450_000, 900_000], rent: 0, allowance: 60_000, allowanceFrom: "Daddy", phone: "flagship", traits: ["Spoilt", "Well connected"] },
  { id: "senator_child", tier: "nepo", weight: 3, title: "Senator's child", region: "hausa", hometowns: ["Abuja", "Kano", "Maitama"],
    story: "Doors open before you knock. Everyone is polite to your face, and you are never sure which of them mean it.",
    money: [350_000, 700_000], rent: 0, allowance: 50_000, allowanceFrom: "Daddy", phone: "flagship", traits: ["Entitled", "Watched"] },
  { id: "estate_heir", tier: "nepo", weight: 3, title: "Real-estate heir", region: "yoruba", hometowns: ["Ikoyi", "Lekki", "Banana Island"],
    story: "Your family owns half the street you live on. Rent was never a word at your table. Earning your own is the new experience.",
    money: [500_000, 1_000_000], rent: 0, allowance: 70_000, allowanceFrom: "Mummy", phone: "flagship", traits: ["Generous", "Out of touch"] },
];

const NAMES: Record<Region, { male: string[]; female: string[]; surnames: string[] }> = {
  yoruba: { male: ["Tunde", "Femi", "Kunle", "Seyi", "Dayo", "Bayo", "Ayo", "Tobi"], female: ["Bisi", "Tola", "Funmi", "Yemi", "Kemi", "Ife", "Damilola", "Titi"], surnames: ["Adeyemi", "Balogun", "Ogunleye", "Adebayo", "Ajayi", "Oladipo", "Akinwale"] },
  igbo: { male: ["Chidi", "Emeka", "Ifeanyi", "Obinna", "Nnamdi", "Chukwudi", "Kelechi"], female: ["Ngozi", "Chiamaka", "Adaeze", "Ifeoma", "Amara", "Nneka", "Chioma"], surnames: ["Okafor", "Nwosu", "Eze", "Obi", "Okeke", "Nwachukwu", "Onyekachi"] },
  hausa: { male: ["Musa", "Ibrahim", "Sani", "Abubakar", "Umar", "Yusuf", "Bashir"], female: ["Aisha", "Hauwa", "Zainab", "Fatima", "Amina", "Maryam", "Hadiza"], surnames: ["Bello", "Danjuma", "Yusuf", "Abdullahi", "Garba", "Mohammed", "Lawal"] },
  south: { male: ["Osas", "Efe", "Ehi", "Tamuno", "Ovie", "Eyo", "Ikenna"], female: ["Osaze", "Efosa", "Ete", "Tonye", "Ebiere", "Imaobong", "Ibiere"], surnames: ["Idahosa", "Osagie", "Omoregie", "Ekpo", "Etim", "Ighodaro", "Brown"] },
};

export type Random = () => number;

const pick = <T>(items: readonly T[], random: Random): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;

export function randomName(region: Region, sex: Sex, random: Random): { firstName: string; surname: string } {
  const pool = NAMES[region];
  return { firstName: pick(sex === "male" ? pool.male : pool.female, random), surname: pick(pool.surnames, random) };
}

/** Draws one background by weight and fills in the specifics (money within its range, a hometown, a name). */
export function rollBackground(random: Random, sex: Sex): Profile {
  const total = BACKGROUNDS.reduce((sum, b) => sum + b.weight, 0);
  let roll = random() * total;
  const def = BACKGROUNDS.find((b) => (roll -= b.weight) < 0) ?? BACKGROUNDS[0]!;
  return profileFrom(def, random, sex);
}

export function profileFrom(def: BackgroundDef, random: Random, sex: Sex): Profile {
  const [lo, hi] = def.money;
  const money = Math.round((lo + random() * (hi - lo)) / 500) * 500; // whole, round naira
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
    skills: { ...(def.skills ?? {}) },
  };
}

export const TIER_LABEL: Record<Tier, string> = { lapo: "Lapo", middle: "Middle", nepo: "Nepo" };

/** Reads a profile from untrusted JSON (a save file); returns null if it is not usable. */
export function parseProfile(raw: unknown): Profile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Profile>;
  const text = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
  const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);
  if (r.tier !== "lapo" && r.tier !== "middle" && r.tier !== "nepo") return null;
  const skills: Record<string, number> = {};
  if (r.skills && typeof r.skills === "object") for (const [k, v] of Object.entries(r.skills)) skills[k.slice(0, 30)] = num(v, 10_000);
  return {
    firstName: text(r.firstName, 30) || "You",
    surname: text(r.surname, 30),
    sex: r.sex === "female" ? "female" : "male",
    tier: r.tier,
    backgroundId: text(r.backgroundId, 40),
    title: text(r.title),
    story: text(r.story, 600),
    hometown: text(r.hometown, 40),
    startingMoney: num(r.startingMoney, 100_000_000),
    rentPerWeek: num(r.rentPerWeek, 10_000_000),
    weeklyAllowance: num(r.weeklyAllowance, 10_000_000),
    allowanceFrom: text(r.allowanceFrom, 30),
    phone: r.phone === "flagship" || r.phone === "mid" ? r.phone : "basic",
    traits: sanitizeTraits(Array.isArray(r.traits) ? r.traits.filter((t): t is string => typeof t === "string") : []),
    flavour: Array.isArray(r.flavour) ? r.flavour.filter((t): t is string => typeof t === "string").slice(0, 6).map((t) => t.slice(0, 40)) : [],
    skills,
  };
}
