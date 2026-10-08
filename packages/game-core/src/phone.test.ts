import { describe, expect, it } from "vitest";

phoneConfig.scriptedPeople = true; // these tests cover the scripted chat itself
import {
  BEATS, phoneConfig, JOBS, MINT, PLAYER, SAVINGS, Sim, balance, bestCharger, borrow, createGameState, deposit, isPowerCut, ledgerTotal, newsFor, openApp,
  parseGameState, payBill, payRent, placeOrder, plug, powerCutOn, profileFrom, repay, replyToThread, applyForJob, sendMoney, setAutoPay, setBankCharging,
  topUp, withdraw, BACKGROUNDS, transfer, call, wallPower, markThreadRead, unreadChats, PHONE_MODELS, SHOP_ITEMS,
  type GameState, dismissNotification, clearNotifications,
} from "./index.js";

const background = (tier: string) => BACKGROUNDS.find((b) => b.tier === tier)!;
const sim = (tier: "lapo" | "middle" | "nepo") => new Sim(createGameState(profileFrom(background(tier), () => 0.5, "male")));
const run = (s: Sim, minutes: number) => {
  for (let left = minutes; left > 0; left -= 10) s.advance(Math.min(10, left));
};
/** A start time with mains power for the next six hours. */
const quietMinute = () => {
  for (let d = 1; d < 60; d++) {
    const m = (d - 1) * 1440 + 60;
    if (![...Array(7).keys()].some((h) => isPowerCut(m + h * 60))) return m;
  }
  throw new Error("no quiet day");
};
const rich = (s: Sim, amount = 1_000_000) => transfer(s.state.ledger, MINT, PLAYER, amount, "test", 0);

describe("phone models and chargers", () => {
  it("each background starts with the matching phone and a charger that fits it", () => {
    for (const tier of ["lapo", "middle", "nepo"] as const) {
      const s = sim(tier);
      expect(s.state.phone.model).toBe(background(tier).phone);
      expect(bestCharger(s.state.phone)).not.toBeNull();
    }
  });

  it("a charger that doesn't fit the port is refused, a fitting one is limited by what the phone can take", () => {
    const s = sim("lapo"); // micro port
    s.state.phone.chargers = ["charger_usbc"];
    expect(bestCharger(s.state.phone)).toBeNull();
    expect(plug(s.state, "wall").ok).toBe(false);
    s.state.phone.chargers = ["charger_multi"];
    expect(bestCharger(s.state.phone)!.rate).toBe(25); // Go can only take 25% an hour
    const max = sim("nepo");
    max.state.phone.chargers = ["charger_micro", "charger_lifelink"];
    expect(bestCharger(max.state.phone)!.id).toBe("charger_lifelink");
  });
});

describe("battery", () => {
  it("drains faster in use than on standby, and dies at zero", () => {
    const a = sim("middle");
    const b = sim("middle");
    a.state.phone.battery = b.state.phone.battery = 80;
    b.state.phone.inUse = true;
    run(a, 120);
    run(b, 120);
    expect(b.state.phone.battery).toBeLessThan(a.state.phone.battery);
    b.state.phone.battery = 0;
    expect(openApp(b.state, "chat").ok).toBe(false);
  });

  it("charges from the wall, faster with a faster charger, and unplugs when full", () => {
    const slow = sim("lapo");
    slow.state.phone.battery = 10;
    plug(slow.state, "wall");
    slow.state.minute = quietMinute();
    const fast = sim("nepo");
    fast.state.phone.battery = 10;
    fast.state.minute = slow.state.minute;
    plug(fast.state, "wall");
    run(slow, 30);
    run(fast, 30);
    expect(slow.state.phone.battery).toBeGreaterThan(10);
    expect(fast.state.phone.battery).toBeGreaterThan(slow.state.phone.battery);
    run(fast, 30); // 150% an hour: full an hour in
    expect(fast.state.phone.battery).toBeGreaterThan(97);
    expect(fast.state.phone.plugged).toBeNull();
    run(fast, 200);
    expect(fast.state.phone.battery).toBeLessThan(100); // standby drains it again
  });

  it("does not charge from the wall in a power cut but does from a power bank", () => {
    const s = sim("middle");
    const day = [...Array(40).keys()].map((d) => d + 1).find((d) => powerCutOn(d))!;
    const cut = powerCutOn(day)!;
    s.state.minute = cut.startMinute + 10;
    expect(wallPower(s.state)).toBe(false);
    s.state.phone.battery = 30;
    plug(s.state, "wall");
    run(s, 30);
    expect(s.state.phone.battery).toBeLessThan(30);
    expect(plug(s.state, "bank").ok).toBe(false); // none owned
    s.state.phone.powerBank = { owned: true, charge: 100 };
    plug(s.state, "bank");
    run(s, 30);
    expect(s.state.phone.battery).toBeGreaterThan(30);
    expect(s.state.phone.powerBank.charge).toBeLessThan(100);
  });

  it("a power bank fills from the wall when there is power", () => {
    const s = sim("middle");
    s.state.minute = 0;
    while (isPowerCut(s.state.minute)) s.state.minute += 60;
    s.state.phone.powerBank = { owned: true, charge: 0 };
    expect(setBankCharging(s.state, true).ok).toBe(true);
    run(s, 60);
    expect(s.state.phone.powerBank.charge).toBeGreaterThan(5);
  });

  it("power cuts are deterministic and some days have none", () => {
    const days = [...Array(30).keys()].map((d) => d + 1);
    expect(days.some((d) => powerCutOn(d))).toBe(true);
    expect(days.some((d) => !powerCutOn(d))).toBe(true);
    expect(JSON.stringify(powerCutOn(5))).toBe(JSON.stringify(powerCutOn(5)));
  });
});

describe("chat", () => {
  it("delivers scripted messages on their day, offers replies and answers them", () => {
    const s = sim("lapo");
    run(s, 24 * 60 * 2); // two days
    const t = s.state.phone.threads.family!;
    expect(t.messages.length).toBeGreaterThan(0);
    expect(t.pending).toBeTruthy();
    expect(unreadChats(s.state.phone)).toBeGreaterThan(0);
    expect(replyToThread(s.state, "family", 0).ok).toBe(true);
    expect(t.messages.at(-1)!.from).toBe("me");
    run(s, 10);
    expect(t.messages.at(-1)!.from).toBe("them");
    markThreadRead(s.state, "family");
    expect(t.unread).toBe(0);
  });

  it("every beat uses a real contact, and nepos get no landlord", () => {
    for (const b of BEATS) expect(["family", "kola", "landlord", "lifepay", "lifejobs"]).toContain(b.contact);
    const s = sim("nepo");
    run(s, 24 * 60 * 3);
    expect(s.state.phone.threads.landlord).toBeUndefined();
  });

  it("lending a friend money sends it, and they pay it back later with interest", () => {
    const s = sim("middle");
    run(s, 24 * 60 * 3); // friend asks on day 2 evening
    const before = s.money;
    expect(s.state.phone.threads.kola!.pending).toBe("kola_borrow");
    expect(replyToThread(s.state, "kola", 0).ok).toBe(true);
    expect(s.money).toBe(before - 2000);
    run(s, 24 * 60 * 4);
    expect(s.state.ledger.entries.some((e) => /paid you back/.test(e.reason) && e.amount === 2200)).toBe(true);
    expect(ledgerTotal(s.state.ledger)).toBe(0);
  });

  it("refuses a loan to a friend you can't afford", () => {
    const s = sim("lapo");
    run(s, 24 * 60 * 3);
    transfer(s.state.ledger, PLAYER, "sink", s.money, "spent", 0);
    expect(replyToThread(s.state, "kola", 0).ok).toBe(false);
  });

  it("calls cost airtime", () => {
    const s = sim("lapo");
    const before = s.state.phone.airtime;
    expect(call(s.state, "family", 3).ok).toBe(true);
    expect(s.state.phone.airtime).toBe(before - 60);
    s.state.phone.airtime = 0;
    expect(call(s.state, "family", 1).ok).toBe(false);
    expect(call(s.state, "lifepay", 1).ok).toBe(false);
  });
});

describe("LifePay", () => {
  it("manual pay holds the rent until you pay it, with a late fee a day after", () => {
    const s = sim("lapo");
    rich(s);
    setAutoPay(s.state, false);
    s.state.minute = 6 * 24 * 60 + 7 * 60;
    run(s, 120);
    expect(s.state.rentOwed).toBe(14_000);
    expect(payRent(s.state).ok).toBe(true);
    expect(s.state.rentOwed).toBe(0);
    // next week: ignore it
    s.state.minute = 13 * 24 * 60 + 7 * 60;
    run(s, 120);
    expect(s.state.rentOwed).toBe(14_000);
    run(s, 25 * 60);
    expect(s.state.rentOwed).toBe(14_000 + 1000);
    expect(ledgerTotal(s.state.ledger)).toBe(0);
  });

  it("an unpaid bill becomes a power cut after two weeks and paying restores it", () => {
    const s = sim("lapo");
    setAutoPay(s.state, false);
    transfer(s.state.ledger, PLAYER, "sink", s.money, "spent", 0);
    s.state.phone.billOwed = 3000;
    s.state.minute = 0;
    while (isPowerCut(s.state.minute)) s.state.minute += 60;
    expect(wallPower(s.state)).toBe(false);
    rich(s);
    expect(payBill(s.state).ok).toBe(true);
    expect(wallPower(s.state)).toBe(true);
  });

  it("nepos pay no bill", () => {
    const s = sim("nepo");
    run(s, 24 * 60 * 8);
    expect(s.state.phone.billOwed).toBe(0);
  });

  it("sends money to people but not to a bank alert or a landlord", () => {
    const s = sim("middle");
    const before = s.money;
    expect(sendMoney(s.state, "family", 1500).ok).toBe(true);
    expect(s.money).toBe(before - 1500 - 15); // LifePay takes 1% (at least ₦10)
    expect(sendMoney(s.state, "lifepay", 100).ok).toBe(false);
    expect(sendMoney(s.state, "landlord", 100).ok).toBe(false);
    expect(sendMoney(s.state, "family", 1e12).ok).toBe(false);
    expect(sendMoney(s.state, "family", -5).ok).toBe(false);
  });

  it("savings earn weekly interest and the books stay balanced", () => {
    const s = sim("middle");
    const money = s.money;
    expect(deposit(s.state, 20_000).ok).toBe(true);
    expect(s.money).toBe(money - 20_000);
    s.state.minute = 6 * 24 * 60 + 7 * 60;
    run(s, 120);
    expect(balance(s.state.ledger, SAVINGS)).toBe(20_100); // a phone-only saver gets 0.5% a week; a bank customer 1.5%
    expect(withdraw(s.state, 999_999).ok).toBe(false);
    expect(withdraw(s.state, 20_100).ok).toBe(true);
    expect(ledgerTotal(s.state.ledger)).toBe(0);
  });

  it("the Go has no savings or loans", () => {
    const s = sim("lapo");
    expect(deposit(s.state, 100).ok).toBe(false);
    expect(borrow(s.state, 1000).ok).toBe(false);
  });

  it("loans have a limit, a fee, one at a time, and can be repaid", () => {
    const s = sim("middle");
    expect(borrow(s.state, 999_999_999).ok).toBe(false);
    const before = s.money;
    expect(borrow(s.state, 50_000).ok).toBe(false); // LifePay lends at most ₦20,000; the bank lends more
    expect(borrow(s.state, 20_000).ok).toBe(true);
    expect(s.money).toBe(before + 20_000);
    expect(s.state.phone.loan!.owed).toBe(22_000);
    expect(borrow(s.state, 1000).ok).toBe(false);
    expect(repay(s.state, 22_000).ok).toBe(true);
    expect(s.state.phone.loan).toBeNull();
    expect(ledgerTotal(s.state.ledger)).toBe(0);
  });

  it("airtime and data bundles are bought from LifePay", () => {
    const s = sim("middle");
    const phone = s.state.phone;
    const [airtime, data] = [phone.airtime, phone.dataMB];
    expect(topUp(s.state, "airtime_1000").ok).toBe(true);
    expect(topUp(s.state, "data_1gb").ok).toBe(true);
    expect(phone.airtime).toBe(airtime + 1000);
    expect(phone.dataMB).toBe(data + 1024);
    expect(topUp(s.state, "groc_small").ok).toBe(false);
  });
});

describe("LifeShop", () => {
  it("delivers after the delay, charges a fee on small orders and refuses when broke", () => {
    const s = sim("middle");
    s.state.minute = 0;
    const portions = s.state.inventory.portions;
    const before = s.money;
    expect(placeOrder(s.state, "groc_small").ok).toBe(true);
    expect(s.money).toBeLessThan(before - 1500);
    expect(s.state.inventory.portions).toBe(portions);
    run(s, 40);
    expect(s.state.inventory.portions).toBe(portions + 6);
    transfer(s.state.ledger, PLAYER, "sink", s.money, "spent", 0);
    expect(placeOrder(s.state, "groc_small").ok).toBe(false);
    expect(ledgerTotal(s.state.ledger)).toBe(0);
  });

  it("a new charger or power bank arrives and can be used", () => {
    const s = sim("middle");
    rich(s);
    expect(placeOrder(s.state, "powerbank").ok).toBe(true);
    expect(placeOrder(s.state, "charger_lifelink").ok).toBe(true);
    run(s, 120);
    expect(s.state.phone.powerBank.owned).toBe(true);
    expect(s.state.phone.chargers).toContain("charger_lifelink");
    expect(placeOrder(s.state, "powerbank").ok).toBe(false);
  });

  it("buying a new phone swaps the model and its apps", () => {
    const s = sim("lapo");
    rich(s);
    expect(placeOrder(s.state, "phone_basic").ok).toBe(false);
    expect(openApp(s.state, "jobs").ok).toBe(false); // Go has no LifeJobs
    expect(placeOrder(s.state, "phone_mid").ok).toBe(true);
    run(s, 300);
    expect(s.state.phone.model).toBe("mid");
    expect(openApp(s.state, "jobs").ok).toBe(true);
    expect(s.state.phone.battery).toBeGreaterThan(90);
  });

  it("opening apps uses data; LifePay works without any", () => {
    const s = sim("middle");
    s.state.phone.dataMB = 5;
    expect(openApp(s.state, "pay").ok).toBe(true);
    expect(openApp(s.state, "news").ok).toBe(false);
    expect(s.state.phone.dataMB).toBe(5);
  });

  it("every shop item has a model or an effect that exists", () => {
    for (const item of SHOP_ITEMS) {
      if (item.kind === "phone") expect(PHONE_MODELS[item.tier!]).toBeTruthy();
      expect(item.price).toBeGreaterThan(0);
    }
  });
});

describe("LifeJobs", () => {
  it("accepts when the skill is high enough and pays weekly; rejects otherwise", () => {
    const s = sim("middle");
    s.state.skills.computer = 0;
    expect(applyForJob(s.state, "junior_dev").ok).toBe(true);
    expect(applyForJob(s.state, "data_entry").ok).toBe(false); // one at a time
    run(s, 13 * 60);
    expect(s.state.phone.job).toBeNull();
    expect(s.state.phone.threads.lifejobs!.messages.at(-1)!.text).toMatch(/chose someone else/);
    expect(applyForJob(s.state, "data_entry").ok).toBe(true);
    run(s, 13 * 60);
    expect(s.state.phone.job).toBe("data_entry");
    const before = s.money;
    s.state.minute = 6 * 24 * 60 + 7 * 60;
    run(s, 120);
    expect(s.money).toBeGreaterThan(before + JOBS[0]!.retainer - 20_000);
    expect(ledgerTotal(s.state.ledger)).toBe(0);
  });
});

describe("news", () => {
  it("has the same headlines for the same day and announces power cuts", () => {
    expect(newsFor(3)).toEqual(newsFor(3));
    const day = [...Array(40).keys()].map((d) => d + 1).find((d) => powerCutOn(d)?.announced)!;
    expect(newsFor(day).some((n) => n.tag === "Power")).toBe(true);
  });
});

describe("notifications", () => {
  it("can be dismissed one at a time or all at once", () => {
    const s = sim("middle");
    run(s, 24 * 60 * 3);
    const n = s.state.phone.notifications.length;
    expect(n).toBeGreaterThan(2);
    dismissNotification(s.state, s.state.phone.notifications[0]!.id);
    expect(s.state.phone.notifications.length).toBe(n - 1);
    clearNotifications(s.state);
    expect(s.state.phone.notifications).toEqual([]);
  });
});

describe("saving", () => {
  it("the whole phone survives a save and load, and a bad phone falls back", () => {
    const s = sim("middle");
    run(s, 24 * 60 * 3);
    replyToThread(s.state, "family", 0);
    const copy = parseGameState(JSON.parse(JSON.stringify(s.state))) as GameState;
    expect(copy.phone.threads.family!.messages.length).toBe(s.state.phone.threads.family!.messages.length);
    expect(copy.phone.model).toBe("mid");
    const broken = JSON.parse(JSON.stringify(s.state));
    broken.phone = { battery: "lots", threads: 7, model: "nope", chargers: [1] };
    const fixed = parseGameState(broken)!;
    expect(fixed.phone.battery).toBeGreaterThanOrEqual(0);
    expect(fixed.phone.chargers.length).toBeGreaterThan(0);
    expect(parseGameState({ ...JSON.parse(JSON.stringify(s.state)), phone: undefined })!.phone.model).toBe("mid");
  });
});
