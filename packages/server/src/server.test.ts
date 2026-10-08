import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from "@thelife/shared";
import { BACKGROUNDS, MINT, SAVINGS, applyForAccount, balance, collectCard, counterOpen, transfer } from "@thelife/game-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startGameServer, type GameServer } from "./index.js";

let server: GameServer | null = null;
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  await server?.close();
  server = null;
});

class Client {
  readonly inbox: ServerMessage[] = [];
  constructor(readonly ws: WebSocket) {
    ws.on("message", (d) => this.inbox.push(JSON.parse(d.toString()) as ServerMessage));
  }
  send(m: ClientMessage | Record<string, unknown>) {
    this.ws.send(JSON.stringify(m));
  }
  async next<T extends ServerMessage["t"]>(t: T, ms = 1500): Promise<Extract<ServerMessage, { t: T }>> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const i = this.inbox.findIndex((m) => m.t === t);
      if (i >= 0) return this.inbox.splice(i, 1)[0] as Extract<ServerMessage, { t: T }>;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`no ${t} message; got ${JSON.stringify(this.inbox)}`);
  }
}

let keyNo = 0;
const newKey = () => `test-key-${String(++keyNo).padStart(12, "0")}`;
const BG = BACKGROUNDS.find((b) => b.tier === "middle")!;
const CHOICE = { backgroundId: BG.id, sex: "male" as const, firstName: "Ada", surname: "Obi", hometown: BG.hometowns[0]!, startingMoney: BG.money[0], traits: [] as string[] };

async function connect(name: string, protocol = PROTOCOL_VERSION, key = newKey()): Promise<Client> {
  const ws = new WebSocket(`ws://127.0.0.1:${server!.port}`);
  sockets.push(ws);
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  const c = new Client(ws);
  c.send({ t: "hello", name, protocol, key });
  return c;
}

describe("place presence", () => {
  it("shows people inside a place only to each other, with a place chat", async () => {
    server = await startGameServer({ port: 0 });
    const a = await connect("Ada");
    const wa = await a.next("welcome");
    const b = await connect("Bayo");
    const wb = await b.next("welcome");
    const c = await connect("Chidi");
    await c.next("welcome");
    await a.next("join");
    await a.next("join");
    // Ada walks into the bank: the street sees her go, and she is told who is in there (just her)
    a.send({ t: "inside", place: "bank-1" });
    expect((await b.next("leave")).id).toBe(wa.id);
    expect((await a.next("here")).players.map((p) => p.name)).toEqual(["Ada"]);
    // Bayo follows: both inside are told, Chidi (on the street) hears nothing of it
    b.send({ t: "inside", place: "bank-1" });
    const roster = await a.next("here");
    expect(roster.players.map((p) => p.name).sort()).toEqual(["Ada", "Bayo"]);
    await b.next("here");
    // where they stand reaches the other one
    a.send({ t: "pmove", x: 1.5, z: -2, yaw: 0.5, clip: "Walk_Loop" });
    await new Promise((r) => setTimeout(r, 250));
    const st = await b.next("pstate");
    expect(st.place).toBe("bank-1");
    expect(st.players.find((p) => p.id === wa.id)).toMatchObject({ x: 1.5, z: -2, clip: "Walk_Loop" });
    // place chat reaches the people inside and not the street
    a.send({ t: "chat", text: "Good morning" });
    expect((await b.next("chat")).text).toBe("Good morning");
    await new Promise((r) => setTimeout(r, 150));
    expect(c.inbox.some((m) => m.t === "chat")).toBe(false);
    expect(c.inbox.some((m) => m.t === "pstate" || m.t === "here")).toBe(false);
    // Ada steps back out: the street sees her again and Bayo's roster shrinks
    a.send({ t: "inside", place: null });
    expect((await c.next("join")).player.id).toBe(wa.id);
    expect((await b.next("here")).players.map((p) => p.name)).toEqual(["Bayo"]);
    void wb;
  });
});

describe("game server", () => {
  it("welcomes a player and tells others when they join and leave", async () => {
    server = await startGameServer({ port: 0 });
    const a = await connect("Ada");
    const welcome = await a.next("welcome");
    expect(welcome.money).toBe(0); // no life yet
    await a.next("needsLife");
    expect(welcome.players).toHaveLength(0);
    const b = await connect("Bayo");
    const wb = await b.next("welcome");
    expect(wb.players.map((p) => p.name)).toEqual(["Ada"]);
    expect((await a.next("join")).player.name).toBe("Bayo");
    b.ws.close();
    expect((await a.next("leave")).id).toBe(wb.id);
  });

  it("passes a cleaned look on to the other players", async () => {
    server = await startGameServer({ port: 0 });
    const a = await connect("Ada");
    await a.next("welcome");
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    sockets.push(ws);
    await new Promise((r) => ws.once("open", r));
    ws.send(JSON.stringify({ t: "hello", name: "Bayo", protocol: PROTOCOL_VERSION, key: newKey(), look: JSON.stringify({ body: "realfemale", junk: "x" }) }));
    expect(JSON.parse((await a.next("join")).player.look!)).toEqual({ body: "realfemale" });
  });

  it("rejects an out-of-date client", async () => {
    server = await startGameServer({ port: 0 });
    const a = await connect("Old", PROTOCOL_VERSION + 1);
    expect((await a.next("error")).reason).toMatch(/out of date/);
    expect(server.room.size).toBe(0);
  });

  it("snaps a teleporting player back and accepts a normal step", async () => {
    server = await startGameServer({ port: 0 });
    const a = await connect("Ada");
    const w = await a.next("welcome");
    const p = server.room.players.get(w.id)!;
    const { x, z } = p;
    a.send({ t: "move", x: x + 150, y: 0, z, yaw: 0, clip: "Walk_Loop", level: 0 });
    const fix = await a.next("correct");
    expect(Math.abs(fix.x - x)).toBeLessThan(1);
    expect(server.room.players.get(w.id)!.x).toBeCloseTo(x, 3);
  });

  it("only lets a player arrive far away after paying for a ride", async () => {
    server = await startGameServer({ port: 0 });
    const a = await connect("Ada");
    const w = await a.next("welcome");
    const p = server.room.players.get(w.id)!;
    const stop = server.room.district.landmarks[1]!.entrance;
    a.send({ t: "arrive", x: stop.x, z: stop.z });
    await a.next("correct"); // no ride paid: sent back
    expect(p.x).not.toBeCloseTo(stop.x, 1);
    p.rideUntil = Date.now() + 60_000;
    a.send({ t: "arrive", x: stop.x, z: stop.z });
    await new Promise((r) => setTimeout(r, 150));
    expect(p.x).toBeCloseTo(stop.x, 3);
    expect(p.z).toBeCloseTo(stop.z, 3);
    expect(p.rideUntil).toBe(0);
  });

  it("counts visitors and who is online at /stats", async () => {
    server = await startGameServer({ port: 0 });
    const a = await connect("Ada");
    await a.next("welcome");
    const report = (await (await fetch(`http://127.0.0.1:${server.port}/stats`)).json()) as { online: number; guests: number; viewsToday: number; playersToday: number; hourly: unknown[] };
    expect(report.online).toBe(1);
    expect(report.guests).toBe(1);
    expect(report.viewsToday).toBe(1);
    expect(report.playersToday).toBe(1);
    expect(report.hourly).toHaveLength(24);
  });

  it("lets players message each other by ID, even when one is away, and gesture to those nearby", async () => {
    server = await startGameServer({ port: 0 });
    const a = await connect("Ada");
    const wa = await a.next("welcome");
    const bKey = newKey();
    let b = await connect("Bayo", PROTOCOL_VERSION, bKey);
    const wb = await b.next("welcome");
    expect(wb.uid).toMatch(/^[a-f0-9]{10}$/);
    a.send({ t: "dm", to: wb.uid! , text: "hello Bayo" });
    const got = await b.next("chat");
    expect(got.text).toBe("hello Bayo");
    expect(got.to).toBe(wb.uid);
    expect(got.fromUid).toBe(wa.uid);
    a.send({ t: "dm", to: "0000000000", text: "anyone?" });
    expect((await a.next("error")).reason).toMatch(/no player with that ID/);
    // Bayo goes away; the message waits and arrives with the inbox when he comes back
    b.ws.close();
    await new Promise((r) => setTimeout(r, 100));
    a.send({ t: "dm", to: wb.uid!, text: "are you there?" });
    await new Promise((r) => setTimeout(r, 100));
    b = await connect("Bayo", PROTOCOL_VERSION, bKey);
    const mail = await b.next("inbox");
    expect(mail.threads[0]!.uid).toBe(wa.uid);
    expect(mail.threads[0]!.msgs.map((m) => m.text)).toEqual(["hello Bayo", "are you there?"]);
    a.send({ t: "find", uid: wb.uid! });
    expect((await a.next("person")).name).toBe("Bayo");
  });

  it("shows gestures and nearby chat to the people close by", async () => {
    server = await startGameServer({ port: 0 });
    const a = await connect("Ada");
    await a.next("welcome");
    const b = await connect("Bayo");
    await b.next("welcome");
    a.send({ t: "emote", emote: "wave" });
    expect((await b.next("emote")).emote).toBe("wave");
    a.send({ t: "emote", emote: "not-a-gesture" } as unknown as ClientMessage);
    a.send({ t: "chat", text: "anyone near?" });
    expect((await b.next("chat")).text).toBe("anyone near?");
  });

  it("limits chat to a few messages in a burst", async () => {
    server = await startGameServer({ port: 0 });
    const a = await connect("Ada");
    await a.next("welcome");
    for (let i = 0; i < 12; i++) a.send({ t: "chat", text: `hi ${i}` });
    await new Promise((r) => setTimeout(r, 300));
    const chats = a.inbox.filter((m) => m.t === "chat").length;
    const errors = a.inbox.filter((m) => m.t === "error").length;
    expect(chats).toBeLessThanOrEqual(5);
    expect(errors).toBeGreaterThan(0);
  });

  it("builds a life on the server from a character choice", async () => {
    server = await startGameServer({ port: 0 });
    const a = await connect("Ada");
    await a.next("welcome");
    await a.next("needsLife");
    a.send({ t: "create", profile: CHOICE });
    const life = await a.next("life");
    const state = life.state as { profile: { firstName: string; rentPerWeek: number; tier: string }; ledger: { accounts: Record<string, number> } };
    expect(state.profile.firstName).toBe("Ada");
    expect(state.profile.tier).toBe("middle");
    expect(state.profile.rentPerWeek).toBe(BG.rent); // from the background, not the client
    expect(state.ledger.accounts.player).toBe(BG.money[0]);
  });

  it("will not let a client invent a better background or more money", async () => {
    server = await startGameServer({ port: 0 });
    const a = await connect("Ada");
    await a.next("needsLife");
    const rich = BACKGROUNDS.find((b) => b.tier === "nepo")!;
    a.send({ t: "create", profile: { ...CHOICE, backgroundId: "does_not_exist" } });
    expect((await a.next("error")).reason).toMatch(/isn't valid/);
    a.send({ t: "create", profile: { ...CHOICE, startingMoney: 999_999_999, rentPerWeek: 0, tier: "nepo" } as never });
    const life = await a.next("life");
    const accounts = (life.state as { ledger: { accounts: Record<string, number> } }).ledger.accounts;
    expect(accounts.player).toBe(BG.money[1]); // clamped to the background's own range
    expect(rich.money[0]).toBeGreaterThan(0);
  });

  it("runs whitelisted actions on the server and refuses everything else", async () => {
    server = await startGameServer({ port: 0 });
    const a = await connect("Ada");
    await a.next("needsLife");
    a.send({ t: "create", profile: CHOICE });
    await a.next("life");
    a.send({ t: "do", id: 1, fn: "buyGroceries", args: [] });
    expect(await a.next("done")).toMatchObject({ id: 1, ok: true });
    const after = await a.next("life");
    expect(after.ack).toBe(1);
    expect((after.state as { inventory: { portions: number } }).inventory.portions).toBeGreaterThan(3);
    a.send({ t: "do", id: 2, fn: "transfer", args: [] });
    expect(await a.next("done")).toMatchObject({ id: 2, ok: false });
    a.send({ t: "do", id: 3, fn: "deposit", args: [-500] });
    expect((await a.next("done")).ok).toBe(false);
    a.send({ t: "do", id: 4, fn: "deposit", args: ["1000"] });
    expect((await a.next("done")).ok).toBe(false);
    a.send({ t: "do", id: 5, fn: "start", args: ["tv"] });
    expect((await a.next("done")).ok).toBe(true);
    let snap = await a.next("life");
    while (snap.ack < 5) snap = await a.next("life");
    expect(snap.active?.id).toBe("tv");
  });

  it("books tickets at the catalogue price, whatever the client says", async () => {
    server = await startGameServer({ port: 0 });
    const a = await connect("Ada");
    await a.next("needsLife");
    a.send({ t: "create", profile: CHOICE });
    const first = await a.next("life");
    const before = (first.state as { ledger: { accounts: Record<string, number> } }).ledger.accounts.player!;
    a.send({ t: "do", id: 1, fn: "bookTicket", args: ["event", "Not a real event"] });
    expect((await a.next("done")).ok).toBe(false);
    expect((await a.next("life")).ack).toBe(1);
    expect(server.room.money([...server.room.players.values()][0]!)).toBe(before);
  });

  it("keeps a life between visits and lets time pass while away", async () => {
    const dir = mkdtempSync(join(tmpdir(), "thelife-"));
    try {
      const key = newKey();
      server = await startGameServer({ port: 0, dataDir: dir });
      const a = await connect("Ada", PROTOCOL_VERSION, key);
      await a.next("needsLife");
      a.send({ t: "create", profile: CHOICE });
      const first = await a.next("life");
      const minute = (first.state as { minute: number }).minute;
      a.send({ t: "do", id: 1, fn: "buyGroceries", args: [] });
      await a.next("done");
      await server.close();
      server = null;
      server = await startGameServer({ port: 0, dataDir: dir });
      const again = await connect("Ada", PROTOCOL_VERSION, key);
      const life = await again.next("life");
      const state = life.state as { minute: number; inventory: { portions: number }; profile: { firstName: string } };
      expect(state.profile.firstName).toBe("Ada");
      expect(state.inventory.portions).toBeGreaterThan(3);
      expect(state.minute).toBeGreaterThanOrEqual(minute);
    } finally {
      await server?.close();
      server = null;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("moves money between two lives and refuses overdrafts", async () => {
    server = await startGameServer({ port: 0 });
    const a = await connect("Ada");
    await a.next("needsLife");
    a.send({ t: "create", profile: CHOICE });
    await a.next("life");
    const b = await connect("Bayo");
    const wb = await b.next("welcome");
    await b.next("needsLife");
    b.send({ t: "create", profile: { ...CHOICE, firstName: "Bayo", startingMoney: BG.money[1] } });
    await b.next("life");
    const startA = server.room.money([...server.room.players.values()][0]!);
    const startB = server.room.money([...server.room.players.values()][1]!);
    await a.next("money"); // "Your life begins."
    a.send({ t: "pay", to: wb.id, amount: 5000 });
    expect((await a.next("money", 3000)).note).toMatch(/You sent/);
    expect(server.room.money([...server.room.players.values()][0]!)).toBe(startA - 5000 - 50); // LifePay takes 1%
    expect(server.room.money([...server.room.players.values()][1]!)).toBe(startB + 5000);
    a.send({ t: "pay", to: wb.id, amount: 100_000_000 });
    expect((await a.next("error")).reason).toBeTruthy();
  });

  it("moves a life to the newest sign-in when the same key connects twice", async () => {
    server = await startGameServer({ port: 0 });
    const key = newKey();
    const a = await connect("Ada", PROTOCOL_VERSION, key);
    await a.next("needsLife");
    a.send({ t: "create", profile: CHOICE });
    await a.next("life");
    const b = await connect("Ada", PROTOCOL_VERSION, key);
    expect((await b.next("life")).state).toBeTruthy();
    await new Promise((r) => setTimeout(r, 100));
    expect(a.ws.readyState).not.toBe(WebSocket.OPEN);
  });

  it("broadcasts position snapshots between players", async () => {
    server = await startGameServer({ port: 0, tickRate: 30 });
    const a = await connect("Ada");
    const wa = await a.next("welcome");
    const b = await connect("Bayo");
    await b.next("welcome");
    const p = server.room.players.get(wa.id)!;
    a.send({ t: "move", x: p.x + 0.5, y: 0, z: p.z, yaw: 1, clip: "Walk_Loop", level: 0 });
    const s = await b.next("state");
    expect(s.players.some((q) => q.id === wa.id)).toBe(true);
  });

  it("lets an account own its life, and keeps guests out when accounts are required", async () => {
    const accounts: Record<string, string> = { "good.token.one": "11111111-1111-1111-1111-111111111111" };
    server = await startGameServer({ port: 0, verifyToken: async (t) => (accounts[t] ? { id: accounts[t]! } : null) });
    const guest = await connect("Guest");
    expect((await guest.next("error")).reason).toMatch(/log in/i);
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    sockets.push(ws);
    await new Promise((r) => ws.once("open", r));
    const a = new Client(ws);
    ws.send(JSON.stringify({ t: "hello", name: "Ada", protocol: PROTOCOL_VERSION, key: newKey(), token: "good.token.one" }));
    await a.next("welcome");
    await a.next("needsLife");
    a.send({ t: "create", profile: CHOICE });
    await a.next("life");
    // The same account from another device (a different guest key) gets the same life.
    const ws2 = new WebSocket(`ws://127.0.0.1:${server.port}`);
    sockets.push(ws2);
    await new Promise((r) => ws2.once("open", r));
    const b = new Client(ws2);
    ws2.send(JSON.stringify({ t: "hello", name: "Ada", protocol: PROTOCOL_VERSION, key: newKey(), token: "good.token.one" }));
    expect(((await b.next("life")).state as { profile: { firstName: string } }).profile.firstName).toBe("Ada");
    // A made-up token is no better than no token.
    const ws3 = new WebSocket(`ws://127.0.0.1:${server.port}`);
    sockets.push(ws3);
    await new Promise((r) => ws3.once("open", r));
    const c = new Client(ws3);
    ws3.send(JSON.stringify({ t: "hello", name: "Eve", protocol: PROTOCOL_VERSION, key: newKey(), token: "forged.token.abc" }));
    expect((await c.next("error")).reason).toMatch(/log in/i);
  });

  it("keeps players at home out of the city until they step out", async () => {
    server = await startGameServer({ port: 0 });
    const a = await connect("Ada");
    await a.next("welcome");
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    sockets.push(ws);
    await new Promise((r) => ws.once("open", r));
    const b = new Client(ws);
    ws.send(JSON.stringify({ t: "hello", name: "Bayo", protocol: PROTOCOL_VERSION, key: newKey(), where: "home" }));
    const wb = await b.next("welcome");
    expect(wb.players.map((p) => p.name)).toEqual(["Ada"]);
    await new Promise((r) => setTimeout(r, 150));
    expect(a.inbox.some((m) => m.t === "join")).toBe(false); // Bayo is at home: Ada sees nothing
    b.send({ t: "place", where: "world" });
    expect((await a.next("join")).player.name).toBe("Bayo");
    b.send({ t: "place", where: "home" });
    expect((await a.next("leave")).id).toBe(wb.id);
  });

  it("gives each player a home door for their background, and puts them there when they step outside", async () => {
    server = await startGameServer({ port: 0 });
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    sockets.push(ws);
    await new Promise((r) => ws.once("open", r));
    const a = new Client(ws);
    ws.send(JSON.stringify({ t: "hello", name: "Ada", protocol: PROTOCOL_VERSION, key: newKey(), where: "home" }));
    await a.next("needsLife");
    a.send({ t: "create", profile: CHOICE });
    const home = await a.next("home");
    expect(home.tier).toBe("middle");
    expect(home.spawn.x).toBeGreaterThan(0);
    a.send({ t: "place", where: "world" });
    const fix = await a.next("correct");
    expect(Math.hypot(fix.x - home.spawn.x, fix.z - home.spawn.z)).toBeLessThan(0.01);
  });

  it("answers the health check", async () => {
    server = await startGameServer({ port: 0 });
    const body = (await (await fetch(`http://127.0.0.1:${server.port}/health`)).json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});

async function lived(name: string, key = newKey(), dataDir?: string): Promise<{ c: Client; welcome: Extract<ServerMessage, { t: "welcome" }> }> {
  const c = await connect(name, PROTOCOL_VERSION, key);
  const welcome = await c.next("welcome");
  await c.next("needsLife");
  c.send({ t: "create", profile: { ...CHOICE, firstName: name } });
  await c.next("life");
  await new Promise((r) => setTimeout(r, 60));
  c.inbox.splice(0); // "Your life begins." and the like
  void dataDir;
  return { c, welcome };
}

describe("phone numbers, payments and calls", () => {
  it("gives every player a phone number that people can find them by", async () => {
    server = await startGameServer({ port: 0 });
    const a = await lived("Ada");
    const b = await lived("Bayo");
    expect(a.welcome.phone).toMatch(/^099\d{8}$/);
    expect(b.welcome.phone).toMatch(/^099\d{8}$/);
    expect(a.welcome.phone!).not.toBe(b.welcome.phone!);
    a.c.send({ t: "find", phone: b.welcome.phone! });
    const found = await a.c.next("person");
    expect(found).toMatchObject({ uid: b.welcome.uid!, name: "Bayo Obi", phone: b.welcome.phone! });
    a.c.send({ t: "find", phone: "09900000000" });
    expect((await a.c.next("error")).reason).toMatch(/phone number/);
    a.c.send({ t: "find", phone: a.welcome.phone! });
    expect((await a.c.next("error")).reason).toMatch(/your own/);
  });

  it("sends money by ID to somebody online, and keeps it for somebody who is away", async () => {
    const dir = mkdtempSync(join(tmpdir(), "thelife-pay-"));
    try {
      server = await startGameServer({ port: 0, dataDir: dir });
      const a = await lived("Ada");
      const bKey = newKey();
      const b = await lived("Bayo", bKey);
      const players = () => [...server!.room.players.values()];
      const moneyOf = (name: string) => server!.room.money(players().find((p) => p.name.startsWith(name))!);
      const startA = moneyOf("Ada");
      const startB = moneyOf("Bayo");
      a.c.send({ t: "payto", uid: b.welcome.uid!, amount: 4000 });
      expect((await a.c.next("money")).note).toMatch(/You sent ₦4,000 to Bayo Obi/);
      expect(moneyOf("Ada")).toBe(startA - 4000 - 40);
      expect(moneyOf("Bayo")).toBe(startB + 4000);
      expect((await b.c.next("chat")).text).toMatch(/₦4,000 sent/);
      // Bayo leaves; Ada pays him anyway
      b.c.ws.close();
      await new Promise((r) => setTimeout(r, 200));
      a.c.send({ t: "payto", uid: b.welcome.uid!, amount: 1500 });
      await a.c.next("money");
      await a.c.next("money").catch(() => undefined);
      expect(moneyOf("Ada")).toBe(startA - 5500 - 40 - 15);
      // he comes back and it is there
      const b2 = await connect("Bayo", PROTOCOL_VERSION, bKey);
      await b2.next("welcome");
      expect((await b2.next("money")).note).toMatch(/sent you ₦1,500 while you were away/);
      expect(moneyOf("Bayo")).toBe(startB + 5500);
      // and it is only paid once
      b2.ws.close();
      await new Promise((r) => setTimeout(r, 200));
      const b3 = await connect("Bayo", PROTOCOL_VERSION, bKey);
      await b3.next("welcome");
      expect(moneyOf("Bayo")).toBe(startB + 5500);
      a.c.send({ t: "payto", uid: a.welcome.uid!, amount: 10 });
      expect((await a.c.next("error")).reason).toMatch(/yourself/);
      a.c.send({ t: "payto", uid: b.welcome.uid!, amount: 900_000_000 });
      expect((await a.c.next("error")).reason).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rings, connects and ends a call, bills the caller's airtime and refuses a caller with none", async () => {
    server = await startGameServer({ port: 0 });
    const a = await lived("Ada");
    const b = await lived("Bayo");
    const airtime = (name: string) => [...server!.room.players.values()].find((p) => p.name.startsWith(name))!.life!.state.phone.airtime;
    const before = airtime("Ada");
    a.c.send({ t: "rtc", to: b.welcome.uid!, data: { k: "invite", call: "call000001" } });
    const ring = await b.c.next("rtc");
    expect(ring).toMatchObject({ fromUid: a.welcome.uid!, name: "Ada Obi", data: { k: "invite", call: "call000001" } });
    b.c.send({ t: "rtc", to: ring.from, data: { k: "accept", call: "call000001" } });
    expect((await a.c.next("rtc")).data).toMatchObject({ k: "accept" });
    expect(airtime("Ada")).toBe(before - 20); // the first minute
    // the voice setup passes between them
    a.c.send({ t: "rtc", to: b.welcome.id, data: { k: "offer", call: "call000001", sdp: { type: "offer", sdp: "v=0" } } });
    expect((await b.c.next("rtc")).data).toMatchObject({ k: "offer", sdp: { type: "offer" } });
    b.c.send({ t: "rtc", to: a.welcome.id, data: { k: "ice", call: "call000001", candidate: { candidate: "x" } } });
    expect((await a.c.next("rtc")).data).toMatchObject({ k: "ice", candidate: { candidate: "x" } });
    // a stranger cannot join in
    const c = await lived("Chidi");
    c.c.send({ t: "rtc", to: a.welcome.id, data: { k: "offer", call: "call000001", sdp: "x" } });
    await new Promise((r) => setTimeout(r, 100));
    expect(a.c.inbox.filter((m) => m.t === "rtc")).toHaveLength(0);
    // hanging up tells the other side
    a.c.send({ t: "rtc", to: b.welcome.id, data: { k: "end", call: "call000001" } });
    expect((await b.c.next("rtc")).data).toMatchObject({ k: "end" });
    // a busy line
    a.c.send({ t: "rtc", to: b.welcome.uid!, data: { k: "invite", call: "call000002" } });
    await b.c.next("rtc");
    c.c.send({ t: "rtc", to: b.welcome.uid!, data: { k: "invite", call: "call000003" } });
    expect((await c.c.next("rtc")).data).toMatchObject({ k: "end", why: expect.stringMatching(/busy/) });
    a.c.send({ t: "rtc", to: b.welcome.id, data: { k: "cancel", call: "call000002" } });
    await b.c.next("rtc");
    // no airtime, no call
    [...server.room.players.values()].find((p) => p.name.startsWith("Ada"))!.life!.state.phone.airtime = 5;
    a.c.send({ t: "rtc", to: b.welcome.uid!, data: { k: "invite", call: "call000004" } });
    expect((await a.c.next("rtc")).data).toMatchObject({ k: "end", why: expect.stringMatching(/airtime/) });
    // somebody who is not online cannot be rung
    const ghost = newKey();
    const g = await lived("Gina", ghost);
    g.c.ws.close();
    await new Promise((r) => setTimeout(r, 200));
    [...server.room.players.values()].find((p) => p.name.startsWith("Ada"))!.life!.state.phone.airtime = 500;
    a.c.send({ t: "rtc", to: g.welcome.uid!, data: { k: "invite", call: "call000005" } });
    expect((await a.c.next("rtc")).data).toMatchObject({ k: "end", why: expect.stringMatching(/reached/) });
  });
});

describe("bank transfers between players", () => {
  it("sends from the bank account with the card PIN, the bank's fee and no LifePay limit", async () => {
    server = await startGameServer({ port: 0 });
    const a = await lived("Ada");
    const b = await lived("Bayo");
    const players = () => [...server!.room.players.values()];
    const ada = players().find((p) => p.name.startsWith("Ada"))!;
    const bayo = players().find((p) => p.name.startsWith("Bayo"))!;
    // Ada has a bank account with 300,000 in it
    const st = ada.life!.state;
    const saved = st.minute;
    for (let d = 10; d < 17 && !counterOpen(st).open; d++) st.minute = d * 1440 + 10 * 60;
    expect(applyForAccount(st, "ekotrust", "1998-04-23", "National ID (NIN)", "12345678901", "12 Awolowo Road, Ikoyi").ok).toBe(true);
    st.minute += 240;
    while (!counterOpen(st).open) st.minute += 30;
    expect(collectCard(st, "2580").ok).toBe(true);
    st.minute = saved;
    transfer(st.ledger, MINT, SAVINGS, 300_000, "test", st.minute);
    const before = server.room.money(bayo);
    a.c.send({ t: "payto", uid: b.welcome.uid!, amount: 150_000, pin: "0000" });
    expect((await a.c.next("error")).reason).toMatch(/Wrong PIN/);
    a.c.send({ t: "payto", uid: b.welcome.uid!, amount: 150_000, pin: "2580" });
    expect((await a.c.next("money")).note).toMatch(/You sent ₦150,000/);
    expect(balance(st.ledger, SAVINGS)).toBe(300_000 - 150_000 - 25);
    expect(server.room.money(bayo)).toBe(before + 150_000);
    // LifePay could not have sent that much
    b.c.send({ t: "payto", uid: a.welcome.uid!, amount: 150_000 });
    expect((await b.c.next("error")).reason).toMatch(/LifePay sends up to/);
  });
});
