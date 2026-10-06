import { describe, expect, it } from "vitest";
import { BACKGROUNDS, PLAYER, Sim, balance, buildProfile, createGameState, ledgerTotal, runRpc, RPC_NAMES } from "./index";

const bg = BACKGROUNDS.find((b) => b.tier === "middle")!;
const choice = { backgroundId: bg.id, sex: "female" as const, firstName: "Ngozi", surname: "Eze", hometown: bg.hometowns[0]!, startingMoney: bg.money[0], traits: [] };
const life = () => new Sim(createGameState(buildProfile(choice)!));

describe("online rules", () => {
  it("builds a profile from the background, not from the client", () => {
    const p = buildProfile({ ...choice, startingMoney: 1e9, hometown: "Atlantis" })!;
    expect(p.startingMoney).toBe(bg.money[1]);
    expect(bg.hometowns).toContain(p.hometown);
    expect(p.rentPerWeek).toBe(bg.rent);
    expect(buildProfile({ ...choice, backgroundId: "nope" })).toBeNull();
    expect(buildProfile({ ...choice, firstName: "  " })).toBeNull();
  });

  it("refuses unknown functions and bad arguments", () => {
    const sim = life();
    expect(runRpc(sim, "transfer", [])).toMatchObject({ ok: false });
    expect(runRpc(sim, "constructor", [])).toMatchObject({ ok: false });
    expect(runRpc(sim, "__proto__", [])).toMatchObject({ ok: false });
    expect(runRpc(sim, "deposit", [-5])).toMatchObject({ ok: false });
    expect(runRpc(sim, "deposit", [1.5])).toMatchObject({ ok: false });
    expect(runRpc(sim, "call", ["mum", -50])).toMatchObject({ ok: false });
    expect(runRpc(sim, "start", ["fly"])).toMatchObject({ ok: false });
  });

  it("keeps the ledger balanced through every action", () => {
    const sim = life();
    const before = balance(sim.state.ledger, PLAYER);
    expect(runRpc(sim, "buyGroceries", []).ok).toBe(true);
    expect(balance(sim.state.ledger, PLAYER)).toBeLessThan(before);
    expect(ledgerTotal(sim.state.ledger)).toBe(0);
  });

  it("prices tickets from the catalogue", () => {
    const sim = life();
    expect(runRpc(sim, "bookTicket", ["film", "Not a film"]).ok).toBe(false);
    expect(runRpc(sim, "bookTicket", ["free", "x"]).ok).toBe(false);
  });

  it("lists the actions a client may send", () => {
    expect(RPC_NAMES).toContain("openApp");
    expect(RPC_NAMES).not.toContain("transfer");
  });
});
