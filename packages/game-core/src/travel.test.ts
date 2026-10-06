import { describe, expect, it } from "vitest";
import { PLAYER, Sim, balance, createGameState, payRide, rideOptions, runRpc } from "./index.js";

describe("travel", () => {
  it("offers different ways to different backgrounds", () => {
    const ids = (t: "lapo" | "middle" | "nepo") => rideOptions(t, 1500).map((o) => o.id);
    expect(ids("lapo")).toEqual(["walk", "danfo", "keke"]);
    expect(ids("middle")).toEqual(["walk", "danfo", "keke", "taxi"]);
    expect(ids("nepo")).toEqual(["walk", "taxi", "driver"]);
  });
  it("charges the fare worked out from the distance, and never lets the caller choose it", () => {
    const state = createGameState({ tier: "middle", firstName: "T", surname: "Test" } as never);
    const before = balance(state.ledger, PLAYER);
    const fare = rideOptions("middle", 2000).find((o) => o.id === "taxi")!.fare;
    const r = payRide(state, "taxi", 2000);
    if (before >= fare) {
      expect(r.ok).toBe(true);
      expect(balance(state.ledger, PLAYER)).toBe(before - fare);
    }
    expect(payRide(state, "driver", 2000).ok).toBe(false); // not for this background
    expect(payRide(state, "taxi", -5).ok).toBe(false);
    expect(payRide(state, "walk", 100).ok).toBe(true);
  });
  it("is reachable through the checked remote calls", () => {
    const sim = new Sim(createGameState({ tier: "nepo", firstName: "T", surname: "Test" } as never));
    expect(runRpc(sim, "payRide", ["driver", 3000]).ok).toBe(true);
    expect(runRpc(sim, "payRide", ["driver"]).ok).toBe(false);
  });
});
