import type { Profile } from "./profile";

/**
 * Who the character is on paper: a date of birth and the numbers on their ID documents. Nobody types these in when making a
 * character, so they are worked out from the character itself (the same every time, on any device and on the server) and shown wherever
 * a form asks for them (the bank's account form).
 */
export const ID_TYPES = ["National ID (NIN)", "Driver's licence", "Voter's card", "International passport"] as const;
export type IdType = (typeof ID_TYPES)[number];

function hash(text: string, salt: string): number {
  let h = 2166136261;
  for (const ch of `${salt}|${text}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

const seedOf = (p: Profile | null): string => (p ? `${p.firstName}|${p.surname}|${p.hometown}|${p.backgroundId}|${p.sex}` : "player");

/** `count` digits, from the character and a salt. */
function digits(p: Profile | null, salt: string, count: number): string {
  let out = "";
  for (let i = 0; out.length < count; i++) out += String(hash(seedOf(p), `${salt}${i}`)).padStart(10, "0");
  return out.slice(0, count);
}

/** An adult's birthday (22 to 35 years old), as year-month-day. */
export function dobOf(p: Profile | null): string {
  const year = 1990 + (hash(seedOf(p), "year") % 13); // 1990 to 2002
  const month = 1 + (hash(seedOf(p), "month") % 12);
  const day = 1 + (hash(seedOf(p), "day") % 28);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The number on one of the character's ID documents. */
export function idNumberOf(p: Profile | null, type: string): string {
  switch (type) {
    case "Driver's licence":
      return `LAG${digits(p, "licence", 9)}`;
    case "Voter's card":
      return `${digits(p, "voter", 4)}${["AB", "KD", "OY", "LA"][hash(seedOf(p), "voterL") % 4]}${digits(p, "voter2", 8)}`;
    case "International passport":
      return `A${digits(p, "passport", 8)}`;
    default:
      return digits(p, "nin", 11);
  }
}

/** "1234 5678 901" for the National ID number, as it is printed on the card. */
export const formatId = (type: string, id: string): string => (type === "National ID (NIN)" && id.length === 11 ? `${id.slice(0, 4)} ${id.slice(4, 8)} ${id.slice(8)}` : id);
