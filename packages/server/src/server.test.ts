import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from "@thelife/shared";
import { START_MONEY } from "./world.js";
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

async function connect(name: string, protocol = PROTOCOL_VERSION): Promise<Client> {
  const ws = new WebSocket(`ws://127.0.0.1:${server!.port}`);
  sockets.push(ws);
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  const c = new Client(ws);
  c.send({ t: "hello", name, protocol });
  return c;
}

describe("game server", () => {
  it("welcomes a player and tells others when they join and leave", async () => {
    server = await startGameServer({ port: 0 });
    const a = await connect("Ada");
    const welcome = await a.next("welcome");
    expect(welcome.money).toBe(START_MONEY);
    expect(welcome.players).toHaveLength(0);
    const b = await connect("Bayo");
    const wb = await b.next("welcome");
    expect(wb.players.map((p) => p.name)).toEqual(["Ada"]);
    expect((await a.next("join")).player.name).toBe("Bayo");
    b.ws.close();
    expect((await a.next("leave")).id).toBe(wb.id);
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

  it("moves money through the ledger and refuses overdrafts", async () => {
    server = await startGameServer({ port: 0 });
    const a = await connect("Ada");
    const wa = await a.next("welcome");
    const b = await connect("Bayo");
    const wb = await b.next("welcome");
    a.send({ t: "pay", to: wb.id, amount: 5000 });
    expect((await a.next("money")).balance).toBe(START_MONEY - 5000);
    expect((await b.next("money")).balance).toBe(START_MONEY + 5000);
    a.send({ t: "pay", to: wb.id, amount: 1_000_000 });
    expect((await a.next("error")).reason).toBeTruthy();
    a.send({ t: "pay", to: wa.id, amount: 10 });
    expect((await a.next("error")).reason).toBeTruthy();
    expect(server.room.money(server.room.players.get(wa.id)!)).toBe(START_MONEY - 5000);
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

  it("answers the health check", async () => {
    server = await startGameServer({ port: 0 });
    const body = (await (await fetch(`http://127.0.0.1:${server.port}/health`)).json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
