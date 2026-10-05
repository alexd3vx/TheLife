import { createServer, type IncomingMessage, type Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { PROTOCOL_VERSION, parseClientMessage, type ServerMessage } from "@thelife/shared";
import { Room, type Player } from "./world.js";

export interface GameServerOptions {
  port?: number;
  room?: string;
  /** Snapshots per second. */
  tickRate?: number;
  /** Origins allowed to connect (empty = any). */
  origins?: string[];
}

export interface GameServer {
  port: number;
  room: Room;
  close(): Promise<void>;
}

const send = (ws: WebSocket, message: ServerMessage) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
};

/** Starts the game server: an HTTP health check and a WebSocket endpoint for one shared world. */
export async function startGameServer(options: GameServerOptions = {}): Promise<GameServer> {
  const room = new Room(options.room ?? "lagos-test");
  const sockets = new Map<string, WebSocket>();
  const origins = options.origins ?? [];
  const http: Server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      res.end(JSON.stringify({ ok: true, room: room.name, players: room.size, protocol: PROTOCOL_VERSION }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  const wss = new WebSocketServer({
    server: http,
    maxPayload: 8_192,
    verifyClient: (info: { origin: string; req: IncomingMessage }) => origins.length === 0 || origins.includes(info.origin),
  });

  const broadcast = (message: ServerMessage, except?: string) => {
    const text = JSON.stringify(message);
    for (const [id, ws] of sockets) if (id !== except && ws.readyState === ws.OPEN) ws.send(text);
  };

  wss.on("connection", (ws) => {
    let me: Player | null = null;
    const helloTimer = setTimeout(() => ws.close(4001, "hello timeout"), 10_000);

    ws.on("message", (data) => {
      const now = Date.now();
      const message = parseClientMessage(data.toString());
      if (!message) return send(ws, { t: "error", reason: "That message was not understood." });
      if (!me) {
        if (message.t !== "hello") return;
        if (message.protocol !== PROTOCOL_VERSION) {
          send(ws, { t: "error", reason: "Your game is out of date. Reload the page to update." });
          return ws.close(4002, "protocol");
        }
        const joined = room.join(message.name, now);
        if (!joined.ok) {
          send(ws, { t: "error", reason: joined.reason });
          return ws.close(4003, "full");
        }
        clearTimeout(helloTimer);
        me = joined.player;
        sockets.set(me.id, ws);
        send(ws, { t: "welcome", id: me.id, room: room.name, protocol: PROTOCOL_VERSION, money: room.money(me), players: [...room.players.values()].filter((p) => p.id !== me!.id).map((p) => room.view(p)), serverTime: now });
        broadcast({ t: "join", player: room.view(me) }, me.id);
        return;
      }
      switch (message.t) {
        case "move": {
          if (!room.allow(me, "move", now)) return;
          const result = room.move(me, message, now);
          if (!result.ok) send(ws, { t: "correct", ...result.correct });
          return;
        }
        case "chat": {
          if (!room.allow(me, "chat", now)) return send(ws, { t: "error", reason: "You're typing too fast." });
          broadcast({ t: "chat", from: me.id, name: me.name, text: message.text, at: now });
          return;
        }
        case "pay": {
          if (!room.allow(me, "pay", now)) return send(ws, { t: "error", reason: "Slow down: too many payments." });
          const result = room.pay(me, message.to, message.amount);
          if (!result.ok) return send(ws, { t: "error", reason: result.reason });
          send(ws, { t: "money", balance: room.money(me), note: `You sent ₦${message.amount.toLocaleString()} to ${result.to.name}.` });
          const target = sockets.get(result.to.id);
          if (target) send(target, { t: "money", balance: room.money(result.to), note: `${me.name} sent you ₦${message.amount.toLocaleString()}.` });
          return;
        }
        case "ping":
          return send(ws, { t: "pong", ts: message.ts, serverTime: now });
        case "rtc": {
          if (!room.allow(me, "rtc", now)) return;
          const target = sockets.get(message.to);
          if (target) send(target, { t: "rtc", from: me.id, data: message.data });
          return;
        }
        default:
          return;
      }
    });

    ws.on("close", () => {
      clearTimeout(helloTimer);
      if (me) {
        room.leave(me.id);
        sockets.delete(me.id);
        broadcast({ t: "leave", id: me.id });
      }
    });
    ws.on("error", () => ws.close());
  });

  let tick = 0;
  const interval = setInterval(() => {
    if (room.size < 2) return; // nobody to tell
    tick++;
    broadcast({ t: "state", tick, serverTime: Date.now(), players: [...room.players.values()].map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, clip: p.clip, level: p.level })) });
  }, 1000 / (options.tickRate ?? 10));

  await new Promise<void>((resolve) => http.listen(options.port ?? 0, resolve));
  const address = http.address();
  const port = typeof address === "object" && address ? address.port : (options.port ?? 0);
  return {
    port,
    room,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(interval);
        for (const ws of sockets.values()) ws.terminate();
        wss.close(() => http.close(() => resolve()));
      }),
  };
}
