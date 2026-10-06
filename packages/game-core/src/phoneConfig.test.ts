import { describe, expect, it } from "vitest";
import { Sim, createGameState, phoneConfig } from "./index.js";

describe("scripted people messages", () => {
  it("are off by default: nobody made-up texts the player", () => {
    expect(phoneConfig.scriptedPeople).toBe(false);
    const sim = new Sim(createGameState());
    for (let i = 0; i < 40; i++) sim.advance(1440); // forty days
    const fromPeople = Object.entries(sim.state.phone.threads).filter(([who]) => who !== "lifepay" && who !== "lifejobs" && who !== "system");
    expect(fromPeople.every(([, t]) => t.messages.length === 0)).toBe(true);
  });
});
