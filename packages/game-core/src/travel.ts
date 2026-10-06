import { PLAYER, SINK, transfer } from "./ledger";
import type { GameState } from "./types";

// Getting around Lagos: on foot, by danfo, keke or taxi, or in your own driver's car. Every way has a fare that grows with the
// distance, and what is on offer depends on who you are (a background with a driver doesn't pay him).

export type RideId = "walk" | "danfo" | "keke" | "taxi" | "driver";
export interface RideOption {
  id: RideId;
  label: string;
  /** Naira for this trip (0 on foot and with your own driver). */
  fare: number;
  /** About how long it takes, in minutes (shown to the player). */
  minutes: number;
  /** A short line for the travel scene. */
  line: string;
}

type Tier = "lapo" | "middle" | "nepo";
const km = (m: number) => Math.max(0.1, m / 1000);

/** The ways to cover `meters` for someone of this background. */
export function rideOptions(tier: Tier | undefined, meters: number): RideOption[] {
  const t: Tier = tier ?? "middle";
  const d = km(meters);
  const out: RideOption[] = [{ id: "walk", label: "Walk", fare: 0, minutes: Math.max(1, Math.round(meters / 85)), line: "On foot" }];
  if (t !== "nepo") {
    out.push({ id: "danfo", label: "Danfo", fare: Math.round((100 + 80 * d) / 10) * 10, minutes: Math.max(4, Math.round(5 + d * 6)), line: "Packed danfo, conductor shouting the stops" });
    out.push({ id: "keke", label: "Keke", fare: Math.round((200 + 170 * d) / 10) * 10, minutes: Math.max(3, Math.round(3 + d * 4)), line: "Keke through the back streets" });
  }
  if (t !== "lapo") out.push({ id: "taxi", label: "Taxi", fare: Math.round((900 + 520 * d) / 50) * 50, minutes: Math.max(3, Math.round(3 + d * 3)), line: "A cab through the traffic" });
  if (t === "nepo") out.push({ id: "driver", label: "Your driver", fare: 0, minutes: Math.max(3, Math.round(3 + d * 3)), line: "Your driver, the AC on" });
  return out;
}

export type RideResult = { ok: true; text: string; fare: number } | { ok: false; reason: string };

/** Pays for a trip. The fare is worked out here from the distance, never taken from the caller. */
export function payRide(state: GameState, ride: string, meters: number): RideResult {
  if (typeof meters !== "number" || !Number.isFinite(meters) || meters < 0 || meters > 20_000) return { ok: false, reason: "That didn't look right." };
  const option = rideOptions(state.profile?.tier as Tier | undefined, meters).find((o) => o.id === ride);
  if (!option) return { ok: false, reason: "That isn't an option for you." };
  if (option.fare > 0) {
    const r = transfer(state.ledger, PLAYER, SINK, option.fare, `${option.label} fare`, state.minute);
    if (!r.ok) return { ok: false, reason: `The ${option.label.toLowerCase()} costs ₦${option.fare.toLocaleString()}. You don't have enough.` };
    state.stats.totalSpent += option.fare;
  }
  return { ok: true, text: option.fare > 0 ? `${option.label}: ₦${option.fare.toLocaleString()}.` : `${option.label}.`, fare: option.fare };
}
