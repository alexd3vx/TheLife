import { PLAYER, SINK, balance, transfer } from "./ledger";
import { openStatus } from "./places";
import { clockOf } from "./sim";
import type { GameState, PoliceRecords } from "./types";

/**
 * The police station: report a crime (free, any hour, you get a report number), ask for advice, and apply for a police clearance
 * certificate at the records desk (office hours, weekdays; it costs money and lasts six months). The paper is kept in the bag.
 */
export const CLEARANCE_PRICE = 5000;
export const CLEARANCE_DAYS = 180;
const MAX_REPORTS = 20;

export interface PoliceService {
  id: string;
  name: string;
  blurb: string;
  price: number;
  /** Needs the records desk (office hours). */
  desk?: boolean;
}

export const POLICE_SERVICES: PoliceService[] = [
  { id: "clearance", name: "Police clearance certificate", blurb: "The paper employers and embassies ask for. Valid six months.", price: CLEARANCE_PRICE, desk: true },
  { id: "report", name: "Report a crime", blurb: "Theft, a fight, a missing phone. You get a report number.", price: 0 },
  { id: "lostphone", name: "Report a lost or stolen phone", blurb: "An extract of the report you can show your network.", price: 0 },
  { id: "advice", name: "Ask for safety advice", blurb: "An officer tells you what to watch for in the city.", price: 0 },
];

const TIPS = [
  "Do not count money in public. Use the cash machine in daylight and put the cash away before you walk off.",
  "At night keep to the lit streets and the main roads. If a danfo driver says one price and the conductor another, step down and wait for the next.",
  "Never hand your phone to a stranger \"to make one quick call\". Many phones go that way.",
  "At the market, keep your bag in front of you. Pickpockets like the crowded lanes around the stalls.",
  "If someone stops you on the road and does not show an ID, do not follow them. Walk to the nearest station and ask for the duty officer.",
  "Save the emergency number 112 in your phone. It works on any network, even without airtime.",
];

export type PoliceResult = { ok: true; text: string } | { ok: false; reason: string };

export function parseRecords(raw: unknown): PoliceRecords {
  const r = (raw ?? {}) as Partial<PoliceRecords>;
  const reports = Array.isArray(r.reports) ? r.reports.filter((x) => x && typeof x.no === "string" && typeof x.minute === "number").slice(-MAX_REPORTS).map((x) => ({ no: x.no.slice(0, 30), text: String(x.text ?? "").slice(0, 120), minute: x.minute })) : [];
  return { ...(typeof r.clearance === "number" && Number.isFinite(r.clearance) ? { clearance: r.clearance } : {}), reports };
}

/** Is the records desk open now? */
export function deskOpen(state: GameState): { open: boolean; text: string } {
  const clock = clockOf(state.minute);
  return openStatus("government", clock.hourFloat, (clock.day + 3) % 7);
}

/** Days left on the clearance certificate (0 when none or run out). */
export function clearanceDaysLeft(state: GameState): number {
  const at = state.records?.clearance;
  if (at === undefined) return 0;
  return Math.max(0, Math.ceil(CLEARANCE_DAYS - (state.minute - at) / 1440));
}

export function policeService(state: GameState, id: string): PoliceResult {
  const s = POLICE_SERVICES.find((x) => x.id === id);
  if (!s) return { ok: false, reason: "The officer says they cannot help with that." };
  const records = (state.records ??= { reports: [] });
  if (s.id === "advice") return { ok: true, text: TIPS[Math.floor(state.minute / 60) % TIPS.length]! };
  if (s.id === "clearance") {
    const desk = deskOpen(state);
    if (!desk.open) return { ok: false, reason: `The records desk is closed (${desk.text}).` };
    if (clearanceDaysLeft(state) > 30) return { ok: false, reason: `You already have a clearance with ${clearanceDaysLeft(state)} days left.` };
    const r = transfer(state.ledger, PLAYER, SINK, s.price, "Police clearance", state.minute);
    if (!r.ok) return { ok: false, reason: `The certificate costs ₦${s.price.toLocaleString()}. You have ₦${balance(state.ledger, PLAYER).toLocaleString()}.` };
    state.stats.totalSpent += s.price;
    records.clearance = state.minute;
    return { ok: true, text: `Your police clearance is ready (₦${s.price.toLocaleString()}). It is valid for ${CLEARANCE_DAYS} days and is in your bag.` };
  }
  const no = `LPD/${clockOf(state.minute).day}/${String(records.reports.length + 1).padStart(3, "0")}`;
  records.reports.push({ no, text: s.id === "lostphone" ? "Lost or stolen phone" : "Crime report", minute: state.minute });
  if (records.reports.length > MAX_REPORTS) records.reports.splice(0, records.reports.length - MAX_REPORTS);
  return { ok: true, text: `The officer wrote it down. Your report number is ${no}.${s.id === "lostphone" ? " Show it to your network to block the line." : ""}` };
}
