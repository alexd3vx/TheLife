import { describe, expect, it } from "vitest";
import { createGameState } from "./sim";
import { MINT, PLAYER, balance, ledgerTotal, transfer } from "./ledger";
import { ATM_FEE, ATM_PER_DAY, APPLICATION_MINUTES, BANKS, TRANSFER_FEE, applicationReady, applyForAccount, atmAirtime, atmChangePin, atmDeposit, atmLogin, atmWithdraw, bankBorrow, bankDeposit, bankRepay, bankTransferOut, bankWithdraw, checkPin, collectCard, counterOpen, parseBank, savingsBalance, statement, unblockCard } from "./bank";
import { parseGameState } from "./persist";
import { phoneSendCheck, sendMoney, weekly } from "./phone";

const weekdayMorning = () => {
  const s = createGameState();
  transfer(s.ledger, MINT, PLAYER, 500_000, "test", 0);
  for (let d = 10; d < 17; d++) {
    s.minute = d * 1440 + 10 * 60;
    if (counterOpen(s).open) break;
  }
  return s;
};
const FORM = ["1998-04-23", "National ID (NIN)", "12345678901", "12 Awolowo Road, Ikoyi"] as const;

/** A state with an open account (Eko Trust) and the PIN 2580. */
function withAccount() {
  const s = weekdayMorning();
  expect(applyForAccount(s, "ekotrust", ...FORM).ok).toBe(true);
  s.minute += APPLICATION_MINUTES;
  while (!counterOpen(s).open) s.minute += 30;
  const r = collectCard(s, "2580");
  expect(r.ok).toBe(true);
  return s;
}

describe("opening an account", () => {
  it("takes a form, makes you wait, then gives a card and lets you choose a PIN", () => {
    const s = weekdayMorning();
    expect(bankDeposit(s, 1_000).ok).toBe(false); // no account yet
    expect(applyForAccount(s, "ekotrust", "next week", "National ID (NIN)", "12345678901", "Ikoyi, Lagos").ok).toBe(false);
    expect(applyForAccount(s, "ekotrust", "2015-01-01", "National ID (NIN)", "12345678901", "12 Awolowo Road").ok).toBe(false); // too young
    expect(applyForAccount(s, "ekotrust", FORM[0], "A made-up ID", FORM[2], FORM[3]).ok).toBe(false);
    expect(applyForAccount(s, "ekotrust", FORM[0], FORM[1], "123", FORM[3]).ok).toBe(false);
    expect(applyForAccount(s, "nobank", ...FORM).ok).toBe(false);
    expect(applyForAccount(s, "ekotrust", ...FORM).ok).toBe(true);
    expect(applyForAccount(s, "unity", ...FORM).ok).toBe(false); // one at a time
    expect(applicationReady(s)).toBe(false);
    expect(collectCard(s, "2580").ok).toBe(false);
    s.minute += APPLICATION_MINUTES;
    expect(applicationReady(s)).toBe(true);
    while (!counterOpen(s).open) s.minute += 30;
    expect(collectCard(s, "1234").ok).toBe(false); // too easy
    expect(collectCard(s, "12").ok).toBe(false);
    expect(collectCard(s, "2580").ok).toBe(true);
    const a = s.bank!.account!;
    expect(a.number).toMatch(/^\d{10}$/);
    expect(a.cardNo).toMatch(new RegExp(`^${BANKS[0]!.bin}\\d{12}$`));
    expect(JSON.stringify(s.bank)).not.toContain("2580"); // the PIN is never kept as typed
    expect(s.bank!.application).toBeUndefined();
    expect(applyForAccount(s, "unity", ...FORM).ok).toBe(false); // already has one
  });

  it("is kept when the life is saved and loaded", () => {
    const s = withAccount();
    const back = parseGameState(JSON.parse(JSON.stringify(s)))!;
    expect(back.bank?.account?.number).toBe(s.bank!.account!.number);
    expect(checkPin(back, "2580")).toBeNull();
    expect(parseBank({ account: { bank: "nope", number: "1" } }).account).toBeUndefined();
  });
});

describe("the bank counter", () => {
  it("moves money in and out of the account without creating any", () => {
    const s = withAccount();
    const start = balance(s.ledger, PLAYER);
    expect(bankDeposit(s, 20_000).ok).toBe(true);
    expect(savingsBalance(s)).toBe(20_000);
    expect(balance(s.ledger, PLAYER)).toBe(start - 20_000);
    expect(bankWithdraw(s, 5_000).ok).toBe(true);
    expect(savingsBalance(s)).toBe(15_000);
    expect(ledgerTotal(s.ledger)).toBe(0);
    expect(bankDeposit(s, 50).ok).toBe(false);
    expect(bankWithdraw(s, 1_000_000).ok).toBe(false);
  });

  it("closes at night, and lends at the counter", () => {
    const s = withAccount();
    expect(bankBorrow(s, 100_000).ok).toBe(false); // this life's limit is ₦20,000
    expect(bankBorrow(s, 15_000).ok).toBe(true);
    expect(s.phone.loan?.owed).toBe(16_500);
    expect(bankBorrow(s, 1_000).ok).toBe(false);
    expect(bankRepay(s, 16_500).ok).toBe(true);
    expect(s.phone.loan).toBeNull();
    s.minute = Math.floor(s.minute / 1440) * 1440 + 22 * 60;
    expect(bankDeposit(s, 1_000).ok).toBe(false);
  });
});

describe("the cash machine", () => {
  it("needs the right PIN, and blocks the card after three wrong tries", () => {
    const s = withAccount();
    expect(atmLogin(s, "2580").ok).toBe(true);
    const wrong = atmLogin(s, "0000");
    expect(wrong.ok).toBe(false);
    expect(atmLogin(s, "1111").ok).toBe(false);
    const third = atmLogin(s, "2222");
    expect(third.ok === false && third.reason).toMatch(/blocked/);
    expect(atmLogin(s, "2580").ok).toBe(false); // even the right one, now
    s.minute += 1440;
    expect(atmLogin(s, "2580").ok).toBe(true);
    // the counter can unblock it sooner
    atmLogin(s, "0000"); atmLogin(s, "0001"); atmLogin(s, "0002");
    expect(atmLogin(s, "2580").ok).toBe(false);
    expect(unblockCard(s).ok).toBe(true);
    expect(atmLogin(s, "2580").ok).toBe(true);
    expect(atmLogin(createGameState(), "2580").ok).toBe(false); // no account at all
  });

  it("gives cash in notes, with a limit each time and each day, a fee at other banks only", () => {
    const s = withAccount();
    s.minute = Math.floor(s.minute / 1440) * 1440 + 23 * 60; // the counter is shut; the machine is not
    transfer(s.ledger, PLAYER, "savings", 300_000, "test", s.minute);
    const cash = balance(s.ledger, PLAYER);
    expect(atmWithdraw(s, 5_000, "2580", "ekotrust").ok).toBe(true); // own bank: free
    expect(balance(s.ledger, PLAYER)).toBe(cash + 5_000);
    expect(savingsBalance(s)).toBe(295_000);
    expect(atmWithdraw(s, 5_000, "2580", "unity").ok).toBe(true); // another bank's machine
    expect(savingsBalance(s)).toBe(295_000 - 5_000 - ATM_FEE);
    expect(atmWithdraw(s, 750, "2580", "ekotrust").ok).toBe(false); // not a whole note
    expect(atmWithdraw(s, 25_000, "2580", "ekotrust").ok).toBe(false); // more than one time
    for (let i = 0; i < 20; i++) atmWithdraw(s, 20_000, "2580", "ekotrust");
    const got = s.bank!.atmToday;
    expect(got).toBeLessThanOrEqual(ATM_PER_DAY);
    expect(atmWithdraw(s, 20_000, "2580", "ekotrust").ok).toBe(false);
    s.minute += 1440; // a new day
    expect(atmWithdraw(s, 20_000, "2580", "ekotrust").ok).toBe(true);
    expect(atmWithdraw(s, 5_000, "9999", "ekotrust").ok).toBe(false);
    expect(ledgerTotal(s.ledger)).toBe(0);
  });

  it("takes cash in, buys airtime, changes the PIN and keeps a statement", () => {
    const s = withAccount();
    expect(atmDeposit(s, 10_000, "2580").ok).toBe(true);
    expect(savingsBalance(s)).toBe(10_000);
    const airtime = s.phone.airtime;
    expect(atmAirtime(s, 1_000, "2580").ok).toBe(true);
    expect(s.phone.airtime).toBe(airtime + 1_000);
    expect(atmAirtime(s, 50, "2580").ok).toBe(false);
    expect(atmChangePin(s, "2580", "7391").ok).toBe(true);
    expect(atmLogin(s, "2580").ok).toBe(false);
    expect(atmLogin(s, "7391").ok).toBe(true);
    expect(atmChangePin(s, "7391", "0000").ok).toBe(false);
    const st = statement(s);
    expect(st[0]).toMatchObject({ text: "Airtime from the cash machine", amount: -1_000 });
    expect(st[1]).toMatchObject({ text: "Cash machine deposit", amount: 10_000 });
    expect(ledgerTotal(s.ledger)).toBe(0);
  });
});

describe("bank transfers, and what LifePay can and cannot do", () => {
  it("sends from the account with a PIN, a fee and a daily limit", () => {
    const s = withAccount();
    transfer(s.ledger, PLAYER, "savings", 400_000, "test", s.minute);
    expect(bankTransferOut(s, 100_000, "0000", "Sent").ok).toBe(false);
    expect(bankTransferOut(s, 100_000, "2580", "Sent to Bayo").ok).toBe(true);
    expect(savingsBalance(s)).toBe(300_000 - TRANSFER_FEE);
    expect(bankTransferOut(s, 500_000, "2580", "Sent").ok).toBe(false); // more than there is
    expect(bankTransferOut(s, 50, "2580", "Sent").ok).toBe(false);
    expect(ledgerTotal(s.ledger)).toBe(0);
  });

  it("limits and charges LifePay, and lends little", () => {
    const s = weekdayMorning();
    expect(phoneSendCheck(s, 40_000).ok).toBe(true);
    expect(phoneSendCheck(s, 60_000).ok).toBe(false);
    const r = sendMoney(s, "family", 10_000);
    expect(r.ok).toBe(true);
    expect(r.ok && r.text).toMatch(/₦100 fee/);
    expect(ledgerTotal(s.ledger)).toBe(0);
    expect(sendMoney(s, "family", 45_000).ok).toBe(false); // over the day's limit
  });

  it("pays three times the interest to a bank customer", () => {
    const phoneOnly = weekdayMorning();
    transfer(phoneOnly.ledger, PLAYER, "savings", 100_000, "test", 0);
    weekly(phoneOnly, 20);
    expect(savingsBalance(phoneOnly)).toBe(100_500);
    const customer = withAccount();
    transfer(customer.ledger, PLAYER, "savings", 100_000, "test", 0);
    weekly(customer, 20);
    expect(savingsBalance(customer)).toBe(101_500);
  });
});
