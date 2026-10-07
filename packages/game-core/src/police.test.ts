import { describe, expect, it } from "vitest";
import { createGameState } from "./sim";
import { MINT, PLAYER, balance, ledgerTotal, transfer } from "./ledger";
import { CLEARANCE_PRICE, clearanceDaysLeft, deskOpen, parseRecords, policeService } from "./police";
import { bagItems } from "./bag";

const weekday = () => {
  const s = createGameState();
  transfer(s.ledger, MINT, PLAYER, 20_000, "test", 0);
  for (let d = 10; d < 17; d++) {
    s.minute = d * 1440 + 10 * 60;
    if (deskOpen(s).open) break;
  }
  return s;
};

describe("the police station", () => {
  it("issues a clearance for money, keeps it in the bag, and refuses a second one", () => {
    const s = weekday();
    const start = balance(s.ledger, PLAYER);
    expect(policeService(s, "clearance").ok).toBe(true);
    expect(balance(s.ledger, PLAYER)).toBe(start - CLEARANCE_PRICE);
    expect(clearanceDaysLeft(s)).toBe(180);
    expect(bagItems(s).some((i) => i.id === "clearance")).toBe(true);
    expect(policeService(s, "clearance").ok).toBe(false);
    expect(ledgerTotal(s.ledger)).toBe(0);
    s.minute += 181 * 1440;
    expect(clearanceDaysLeft(s)).toBe(0);
  });
  it("closes the desk at night and when you are short, but reports are free any hour", () => {
    const s = weekday();
    s.minute = Math.floor(s.minute / 1440) * 1440 + 2 * 60;
    expect(policeService(s, "clearance").ok).toBe(false);
    const r = policeService(s, "report");
    expect(r.ok && r.text).toContain("LPD/");
    expect(s.records!.reports).toHaveLength(1);
    const poor = weekday();
    transfer(poor.ledger, PLAYER, MINT, balance(poor.ledger, PLAYER), "test", 0);
    expect(policeService(poor, "clearance").ok).toBe(false);
  });
  it("gives advice and cleans stored records", () => {
    expect(policeService(weekday(), "advice").ok).toBe(true);
    expect(policeService(weekday(), "nope").ok).toBe(false);
    const rec = parseRecords({ clearance: "x", reports: [{ no: 1 }, { no: "A", text: "t", minute: 5 }] });
    expect(rec.clearance).toBeUndefined();
    expect(rec.reports).toHaveLength(1);
  });
});
