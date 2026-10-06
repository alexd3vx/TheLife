import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from "@thelife/shared";
import { BACKGROUNDS } from "@thelife/game-core";
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
    expect(server.room.money([...server.room.players.values()][0]!)).toBe(startA - 5000);
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
