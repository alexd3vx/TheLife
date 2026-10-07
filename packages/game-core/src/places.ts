import type { LandmarkKind } from "./district";

// When the named places of Lagos are open, and how the city map groups them. Opening hours follow the Lagos clock.

export type PlaceGroup = "food" | "fun" | "night" | "work" | "care" | "civic";

interface Hours {
  /** Hour of day it opens and closes (24 = midnight). Open all day and night when both are 0 and 24. */
  open: number;
  close: number;
  /** Closed on Sundays and Saturdays? */
  weekdaysOnly?: boolean;
}

const ALWAYS: Hours = { open: 0, close: 24 };

const HOURS: Record<LandmarkKind, Hours> = {
  airport: ALWAYS,
  police: ALWAYS,
  hospital: ALWAYS,
  fire: ALWAYS,
  hotel: ALWAYS,
  school: { open: 7, close: 16, weekdaysOnly: true },
  church: { open: 5, close: 21 },
  mosque: { open: 4, close: 22 },
  bank: { open: 8, close: 16, weekdaysOnly: true },
  fuel: { open: 6, close: 22 },
  market: { open: 7, close: 19 },
  station: { open: 5, close: 22 },
  museum: { open: 9, close: 17 },
  government: { open: 8, close: 16, weekdaysOnly: true },
  stadium: { open: 9, close: 22 },
  park: { open: 6, close: 20 },
  port: { open: 6, close: 18 },
};

const GROUP: Record<LandmarkKind, PlaceGroup> = {
  market: "food",
  hotel: "night",
  museum: "fun",
  stadium: "fun",
  park: "fun",
  school: "work",
  bank: "work",
  hospital: "care",
  church: "care",
  mosque: "care",
  police: "civic",
  fire: "civic",
  government: "civic",
  station: "civic",
  airport: "civic",
  port: "civic",
  fuel: "food",
};

export const placeGroup = (kind: LandmarkKind): PlaceGroup => GROUP[kind];

export const GROUP_LABEL: Record<PlaceGroup, string> = { food: "Food & shops", fun: "Fun & culture", night: "Nightlife", work: "Work & skills", care: "Care & faith", civic: "Civic" };

const label = (h: number) => `${((Math.floor(h) + 11) % 12) + 1}${h % 24 >= 12 && h % 24 < 24 ? "PM" : "AM"}`;

export interface OpenStatus {
  open: boolean;
  /** "Open", or "opens 8AM". */
  text: string;
}

/** Is this kind of place open at this hour of this weekday (0 = Sunday)? */
export function openStatus(kind: LandmarkKind, hour: number, weekday: number): OpenStatus {
  const h = HOURS[kind];
  if (h.open === 0 && h.close === 24) return { open: true, text: "Open 24h" };
  const weekend = weekday === 0 || weekday === 6;
  if (h.weekdaysOnly && weekend) return { open: false, text: "closed today" };
  if (hour >= h.open && hour < h.close) return { open: true, text: `Open · till ${label(h.close)}` };
  return { open: false, text: hour < h.open ? `opens ${label(h.open)}` : `opens ${label(h.open)} tomorrow` };
}
