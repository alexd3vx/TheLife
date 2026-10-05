import { describe, expect, it } from "vitest";
import {
  AJO_AMOUNT, BACKGROUNDS, MINT, PLAYER, SINK, STORE_APPS, Sim, addNote, balance, buyHomePlan, buyShares, cancelDownload, connection, createGameState, diaryCheckIn,
  hasApp, isPowerCut, joinAjo, ledgerTotal, nextLessonIn, openApp, orderEats, parseGameState, payAjo, portfolioValue, profileFrom, recordScore, sellShares,
  setMobileData, setWifi, startDownload, stockPrice, storageUsedMB, takeLesson, transfer, uninstallApp, weatherFor, quizRound, ratesFor, feedPosts, seeded,
  STORAGE_MB, MOBILE_SPEED, streamData, buyTicket,
} from "./index.js";

const background = (tier: string) => BACKGROUNDS.find((b) => b.tier === tier)!;
const sim = (tier: "lapo" | "middle" | "nepo" = "middle") => new Sim(createGameState(profileFrom(background(tier), () => 0.5, "male")));
const rich = (s: Sim) => transfer(s.state.ledger, MINT, PLAYER, 5_000_000, "test", 0);
const run = (s: Sim, minutes: number) => {
  for (let left = minutes; left > 0; left -= 5) s.advance(Math.min(5, left));
};
const quietMinute = () => {
  for (let d = 1; d < 60; d++) {
    const m = (d - 1) * 1440 + 60;
    if (![...Array(9).keys()].some((h) => isPowerCut(m + h * 60))) return m;
  }
  throw new Error("no quiet day");
};

describe("the store catalogue", () => {
  it("has thirty apps with unique ids and sane sizes", () => {
    expect(STORE_APPS).toHaveLength(30);
    expect(new Set(STORE_APPS.map((a) => a.id)).size).toBe(30);
    for (const a of STORE_APPS) expect(a.sizeMB).toBeGreaterThan(0);
    for (const tier of ["basic", "mid", "flagship"] as const) {
      expect(STORE_APPS.filter((a) => a.minTier === "basic").every((a) => a.sizeMB < STORAGE_MB[tier])).toBe(true);
    }
  });
});

describe("downloading apps", () => {
  it("downloads over mobile data, uses the data, then installs", () => {
    const s = sim("middle");
    s.state.minute = quietMinute();
    s.state.phone.homeNet = null;
    const dataBefore = s.state.phone.dataMB;
    expect(startDownload(s.state, "gram").ok).toBe(true); // 180 MB at 24 MB/min = 7.5 min
    expect(hasApp(s.state.phone, "gram")).toBe(false);
    run(s, 4);
    expect(hasApp(s.state.phone, "gram")).toBe(false);
    run(s, 6);
    expect(hasApp(s.state.phone, "gram")).toBe(true);
    expect(dataBefore - s.state.phone.dataMB).toBeGreaterThanOrEqual(180);
    expect(s.state.phone.notifications.some((n) => n.app === "store")).toBe(true);
  });

  it("over Wi-Fi it costs no data and is faster", () => {
    const s = sim("nepo");
    rich(s);
    s.state.minute = quietMinute();
    expect(buyHomePlan(s.state, "wifi_fast").ok).toBe(true);
    expect(connection(s.state).kind).toBe("wifi");
    const data = s.state.phone.dataMB;
    expect(startDownload(s.state, "tube").ok).toBe(true); // 260 MB at 160/min
    run(s, 5);
    expect(hasApp(s.state.phone, "tube")).toBe(true);
    expect(s.state.phone.dataMB).toBe(data);
  });

  it("a power cut takes the Wi-Fi away and the phone falls back to data", () => {
    const s = sim("middle");
    rich(s);
    let cutMinute = -1;
    for (let m = 0; m < 1440 * 40; m += 30) if (isPowerCut(m)) { cutMinute = m; break; }
    expect(cutMinute).toBeGreaterThanOrEqual(0);
    s.state.minute = cutMinute;
    buyHomePlan(s.state, "wifi_basic");
    expect(connection(s.state).kind).toBe("data");
  });

  it("pauses when the data runs out and carries on after a top-up", () => {
    const s = sim("lapo");
    s.state.minute = quietMinute();
    s.state.phone.dataMB = 30;
    expect(startDownload(s.state, "chirp").ok).toBe(true); // 70 MB
    run(s, 30);
    expect(hasApp(s.state.phone, "chirp")).toBe(false);
    expect(s.state.phone.downloads[0]!.paused).toBe(true);
    s.state.phone.dataMB = 500;
    run(s, 30);
    expect(hasApp(s.state.phone, "chirp")).toBe(true);
  });

  it("refuses when there is no space, no connection, no money, or a phone that is too weak", () => {
    const s = sim("lapo"); // Go: 1,200 MB
    s.state.phone.dataMB = 5_000;
    expect(startDownload(s.state, "match").ok).toBe(false); // needs a Plus
    transfer(s.state.ledger, PLAYER, SINK, balance(s.state.ledger), "spend", 0);
    const poor = startDownload(s.state, "learn"); // costs money
    expect(poor.ok).toBe(false);
    rich(s);
    s.state.phone.mobileOn = false;
    s.state.phone.homeNet = null;
    expect(startDownload(s.state, "snake").ok).toBe(false); // offline
    s.state.phone.mobileOn = true;
    // fill the phone with every other basic-phone app, then the big one does not fit
    s.state.phone.installed = STORE_APPS.filter((a) => a.minTier === "basic" && a.id !== "learn").map((a) => a.id);
    const full = startDownload(s.state, "learn");
    expect(full.ok).toBe(false);
    expect(!full.ok && full.reason).toMatch(/space/);
    s.state.phone.installed = [];
    expect(startDownload(s.state, "learn").ok).toBe(true);
    expect(startDownload(s.state, "tube").ok).toBe(true);
    expect(startDownload(s.state, "gram").ok).toBe(true);
    expect(startDownload(s.state, "tunes").ok).toBe(true);
    expect(startDownload(s.state, "radio").ok).toBe(false); // already four queued
  });

  it("paid apps take the money once, and the ledger stays balanced", () => {
    const s = sim("nepo");
    const before = balance(s.state.ledger);
    expect(startDownload(s.state, "memory").ok).toBe(true);
    expect(balance(s.state.ledger)).toBe(before - 500);
    expect(startDownload(s.state, "memory").ok).toBe(false);
    expect(ledgerTotal(s.state.ledger)).toBe(0);
  });

  it("uninstalling frees the space, and cancelling stops a download", () => {
    const s = sim("nepo");
    s.state.minute = quietMinute();
    startDownload(s.state, "calc");
    run(s, 5);
    expect(storageUsedMB(s.state)).toBe(3);
    expect(uninstallApp(s.state, "calc").ok).toBe(true);
    expect(storageUsedMB(s.state)).toBe(0);
    startDownload(s.state, "tube");
    expect(cancelDownload(s.state, "tube").ok).toBe(true);
    expect(s.state.phone.downloads).toHaveLength(0);
  });

  it("opening an app uses data only on mobile data, and fails when offline", () => {
    const s = sim("nepo");
    s.state.phone.installed = ["weather"];
    const data = s.state.phone.dataMB;
    expect(openApp(s.state, "weather").ok).toBe(true);
    expect(s.state.phone.dataMB).toBe(data - 1);
    setMobileData(s.state, false);
    expect(openApp(s.state, "weather").ok).toBe(false);
    expect(openApp(s.state, "torch").ok).toBe(false); // not installed
    s.state.phone.installed.push("torch");
    expect(openApp(s.state, "torch").ok).toBe(true); // offline tool
  });

  it("a Wi-Fi switch off falls back to data; a plan is extended, not replaced", () => {
    const s = sim("nepo");
    s.state.minute = quietMinute();
    buyHomePlan(s.state, "wifi_basic");
    const until = s.state.phone.homeNet!.until;
    buyHomePlan(s.state, "wifi_basic");
    expect(s.state.phone.homeNet!.until).toBe(until + 30 * 1440);
    setWifi(s.state, false);
    expect(connection(s.state).kind).toBe("data");
    expect(connection(s.state).speed).toBe(MOBILE_SPEED.flagship);
  });

  it("survives saving and loading, and old saves without the new fields still load", () => {
    const s = sim("middle");
    s.state.phone.installed = ["notes"];
    addNote(s.state, "buy rice");
    const loaded = parseGameState(JSON.parse(JSON.stringify(s.state)))!;
    expect(loaded.phone.installed).toEqual(["notes"]);
    expect(loaded.phone.notes).toEqual(["buy rice"]);
    const old = JSON.parse(JSON.stringify(s.state));
    for (const k of ["installed", "downloads", "wifiOn", "notes", "scores", "holdings", "ajo", "courses", "diary", "homeNet"]) delete old.phone[k];
    const fresh = parseGameState(old)!;
    expect(fresh.phone.installed).toEqual([]);
    expect(fresh.phone.wifiOn).toBe(true);
    // bad data is ignored
    old.phone.installed = ["notes", "../etc/passwd", 7];
    expect(parseGameState(old)!.phone.installed).toEqual(["notes"]);
  });
});

describe("what the apps do", () => {
  it("the weather, rates, quiz and feed are the same for the same day", () => {
    expect(weatherFor(5)).toEqual(weatherFor(5));
    expect(ratesFor(9)).toEqual(ratesFor(9));
    expect(quizRound(3)).toEqual(quizRound(3));
    expect(feedPosts("gram", 4, 0)).toEqual(feedPosts("gram", 4, 0));
    expect(feedPosts("gram", 4, 0)).not.toEqual(feedPosts("gram", 4, 1));
    expect(seeded(1, 2)).toBeGreaterThanOrEqual(0);
    expect(seeded(1, 2)).toBeLessThan(1);
  });

  it("shares: buying costs the price plus a fee, selling pays out, and the ledger stays balanced", () => {
    const s = sim("nepo");
    s.state.minute = 10 * 1440;
    const before = balance(s.state.ledger);
    expect(buyShares(s.state, "LAGB", 100).ok).toBe(true);
    const cost = before - balance(s.state.ledger);
    expect(cost).toBe(Math.round(stockPrice("LAGB", 11) * 100 * 1.01));
    expect(portfolioValue(s.state)).toBe(Math.round(stockPrice("LAGB", 11) * 100));
    expect(sellShares(s.state, "LAGB", 101).ok).toBe(false);
    expect(sellShares(s.state, "LAGB", 100).ok).toBe(true);
    expect(s.state.phone.holdings.LAGB).toBeUndefined();
    expect(ledgerTotal(s.state.ledger)).toBe(0);
    expect(buyShares(s.state, "NOPE", 1).ok).toBe(false);
  });

  it("ajo: pay once a week, collect your turn, finish the group", () => {
    const s = sim("nepo");
    rich(s);
    expect(payAjo(s.state).ok).toBe(false);
    expect(joinAjo(s.state).ok).toBe(true);
    const start = balance(s.state.ledger);
    let gotPot = false;
    for (let week = 0; week < 6; week++) {
      s.state.minute = week * 7 * 1440 + 100;
      const b = balance(s.state.ledger);
      expect(payAjo(s.state).ok).toBe(true);
      expect(payAjo(s.state).ok).toBe(false); // twice in one week
      if (balance(s.state.ledger) > b) gotPot = true;
    }
    expect(gotPot).toBe(true);
    expect(balance(s.state.ledger)).toBe(start - AJO_AMOUNT * 6 + AJO_AMOUNT * 6);
    expect(payAjo(s.state).ok).toBe(false);
  });

  it("eats: the meal arrives later as cooked food", () => {
    const s = sim("nepo");
    s.state.minute = quietMinute();
    const meals = s.state.inventory.meals;
    expect(orderEats(s.state, "eats_jollof").ok).toBe(true);
    expect(orderEats(s.state, "nope").ok).toBe(false);
    run(s, 60);
    expect(s.state.inventory.meals).toBe(meals + 1);
  });

  it("learn: lessons build skill, with a gap between them", () => {
    const s = sim("nepo");
    s.state.needs.energy = 100;
    expect(takeLesson(s.state, "web_dev").ok).toBe(true);
    expect(s.state.skills.computer).toBeGreaterThan(0);
    expect(takeLesson(s.state, "web_dev").ok).toBe(false);
    expect(nextLessonIn(s.state)).toBeGreaterThan(0);
    s.state.minute += 60;
    expect(takeLesson(s.state, "web_dev").ok).toBe(true);
  });

  it("diary: one entry a day; notes and scores are kept", () => {
    const s = sim("nepo");
    expect(diaryCheckIn(s.state, 4, "good day").ok).toBe(true);
    expect(diaryCheckIn(s.state, 3, "again").ok).toBe(false);
    expect(addNote(s.state, "  ").ok).toBe(false);
    s.state.needs.fun = 10;
    recordScore(s.state, "snake", 12);
    expect(s.state.needs.fun).toBeGreaterThan(10);
    expect(s.state.phone.scores.snake).toBe(12);
    recordScore(s.state, "snake", 5);
    expect(s.state.phone.scores.snake).toBe(12);
  });

  it("streaming uses data only on mobile data; tickets cost money and lift the mood", () => {
    const s = sim("nepo");
    const data = s.state.phone.dataMB;
    expect(streamData(s.state, 25).ok).toBe(true);
    expect(s.state.phone.dataMB).toBe(data - 25);
    s.state.phone.dataMB = 10;
    expect(streamData(s.state, 25).ok).toBe(false);
    s.state.minute = quietMinute();
    buyHomePlan(s.state, "wifi_basic");
    expect(streamData(s.state, 25).ok).toBe(true);
    expect(s.state.phone.dataMB).toBe(10);
    s.state.needs.fun = 20;
    const before = balance(s.state.ledger);
    expect(buyTicket(s.state, "Lagos Midnight", 3_500, 25).ok).toBe(true);
    expect(balance(s.state.ledger)).toBe(before - 3_500);
    expect(s.state.needs.fun).toBe(45);
    transfer(s.state.ledger, PLAYER, SINK, balance(s.state.ledger), "spend", 0);
    expect(buyTicket(s.state, "x", 3_500, 25).ok).toBe(false);
  });
});
