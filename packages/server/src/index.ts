import { createServer, type IncomingMessage, type Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { HEARING_RANGE, MAX_PLACE_PLAYERS, PROTOCOL_VERSION, parseClientMessage, type ServerMessage } from "@thelife/shared";
import { join } from "node:path";
import { LifeStore } from "./lives.js";
import { Room, placeView, type Player } from "./world.js";
import { Analytics } from "./analytics.js";
import { Inbox, uidOf } from "./inbox.js";
import { Payments } from "./payments.js";
import { supabaseInbox } from "./supabaseInbox.js";
import { AnimStore, cleanMap, validName } from "./animstore.js";

export interface GameServerOptions {
  port?: number;
  room?: string;
  /** Snapshots per second. */
  tickRate?: number;
  /** Origins allowed to connect (empty = any). */
  origins?: string[];
  /** Where lives are saved between visits. Leave out to keep them in memory only (tests). */
  dataDir?: string;
  /**
   * Accounts: checks a Supabase access token and says whose it is. When set, a player with a good token owns their life through the
   * account, and (unless `allowGuests`) nobody without one gets in.
   */
  verifyToken?: (token: string) => Promise<{ id: string; email?: string } | null>;
  allowGuests?: boolean;
  /** Keep private messages and player IDs in a Supabase database (needs the service key) instead of a file. */
  inboxDb?: { url?: string; serviceKey?: string };
  /** Says whether a Supabase token belongs to an admin. Without it (and without accounts at all, as in tests) the animation editor is open. */
  isAdminToken?: (token: string) => Promise<boolean>;
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
  const store = new LifeStore(options.dataDir ? join(options.dataDir, "lives.json") : null);
  const analytics = new Analytics(options.dataDir ? join(options.dataDir, "analytics.json") : null);
  const inbox = new Inbox(options.dataDir ? join(options.dataDir, "inbox.json") : null, supabaseInbox(options.inboxDb?.url, options.inboxDb?.serviceKey));
  await inbox.ready;
  const payments = new Payments(options.dataDir ? join(options.dataDir, "payments.json") : null);
  const room = new Room(options.room ?? "lagos-test", undefined, store);
  const sockets = new Map<string, WebSocket>();
  const origins = options.origins ?? [];
  const anim = new AnimStore(options.dataDir ? join(options.dataDir, "anim") : null);
  const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, PUT, OPTIONS", "access-control-allow-headers": "authorization, content-type" };
  const readBody = (req: IncomingMessage, max: number) =>
    new Promise<string | null>((resolve) => {
      let size = 0;
      const parts: Buffer[] = [];
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > max) {
          resolve(null);
          req.destroy();
        } else parts.push(c);
      });
      req.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
      req.on("error", () => resolve(null));
    });
  const mayEdit = async (req: IncomingMessage): Promise<boolean> => {
    if (!options.verifyToken) return true; // no accounts: a local or test server
    const token = (req.headers.authorization ?? "").replace(/^Bearer /i, "");
    if (!token || !options.isAdminToken) return false;
    return (await options.verifyToken(token).catch(() => null)) !== null && (await options.isAdminToken(token));
  };
  const http: Server = createServer((req, res) => {
    const url = (req.url ?? "").split("?")[0]!;
    if (url.startsWith("/anim/")) {
      void (async () => {
        if (req.method === "OPTIONS") {
          res.writeHead(204, cors);
          return res.end();
        }
        const json = (code: number, body: string) => {
          res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store", ...cors });
          res.end(body);
        };
        if (req.method === "GET" && url === "/anim/map") return json(200, JSON.stringify({ slots: anim.getMap(), clips: anim.names() }));
        const m = /^\/anim\/clip\/([^/]+)$/.exec(url);
        if (m && validName(m[1]!)) {
          if (req.method === "GET") {
            const c = anim.getClip(m[1]!);
            return c ? json(200, c) : json(404, "{}");
          }
          if (req.method === "PUT") {
            if (!(await mayEdit(req))) return json(403, '{"error":"Only the owner can publish animations."}');
            const body = await readBody(req, 1_600_000);
            return body !== null && anim.putClip(m[1]!, body) ? json(200, '{"ok":true}') : json(400, '{"error":"That clip was not accepted."}');
          }
        }
        if (req.method === "PUT" && url === "/anim/map") {
          if (!(await mayEdit(req))) return json(403, '{"error":"Only the owner can publish animations."}');
          const body = await readBody(req, 100_000);
          let parsed: unknown = null;
          try {
            parsed = body ? (JSON.parse(body) as { slots?: unknown }).slots : null;
          } catch {
            /* bad json */
          }
          const clean = cleanMap(parsed);
          if (!clean) return json(400, '{"error":"That animation map was not accepted."}');
          anim.putMap(clean);
          return json(200, '{"ok":true}');
        }
        json(404, "{}");
      })();
      return;
    }

    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      res.end(JSON.stringify({ ok: true, room: room.name, players: room.size, protocol: PROTOCOL_VERSION }));
      return;
    }
    if (req.url === "/stats") {
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" });
      res.end(JSON.stringify(analytics.report()));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  const wss = new WebSocketServer({
    server: http,
    maxPayload: 8_192,
    perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 3 } },
    verifyClient: (info: { origin: string; req: IncomingMessage }) => origins.length === 0 || origins.includes(info.origin),
  });

  const broadcast = (message: ServerMessage, except?: string) => {
    const text = JSON.stringify(message);
    for (const [id, ws] of sockets) if (id !== except && ws.readyState === ws.OPEN) ws.send(text);
  };

  /** Tells everyone inside a place who is in there now. */
  const sendRoster = (place: string) => {
    const members = room.inPlace(place).slice(0, MAX_PLACE_PLAYERS);
    const text = JSON.stringify({ t: "here", place, players: members.map(placeView) } satisfies ServerMessage);
    for (const m of members) {
      const target = sockets.get(m.id);
      if (target && target.readyState === target.OPEN) target.send(text);
    }
  };

  /** Takes a player out of the place they are in. Back out in the city others see them again; going home they stay hidden. */
  const leavePlace = (p: Player, backToCity: boolean) => {
    const place = p.inside;
    if (!place) return;
    p.inside = null;
    sendRoster(place);
    if (backToCity && p.where === "world") broadcast({ t: "join", player: room.view(p) }, p.id);
  };

  /** Tells a player where they live (and, if they are in the city, puts them at their door). */
  const sendHome = (p: Player, moveThere: boolean) => {
    const ws = sockets.get(p.id);
    if (!ws || !p.home) return;
    send(ws, { t: "home", lotId: p.home.lotId, door: p.home.door, spawn: p.home.spawn, yaw: p.home.yaw, tier: p.life?.state.profile?.tier ?? "middle" });
    if (moveThere) {
      room.stepOutside(p);
      send(ws, { t: "correct", x: p.x, y: 0, z: p.z, level: 0 });
    }
  };

  /** Sends a player their life as the server has it (and, once, what happened while they were away). */
  // ---- voice calls: the server only introduces the two phones (WebRTC carries the voice between them) and bills the caller's airtime
  interface Call {
    id: string;
    caller: Player;
    callee: Player;
    active: boolean;
    timer: ReturnType<typeof setInterval> | null;
  }
  const calls = new Map<string, Call>();
  const callOf = (p: Player): Call | undefined => [...calls.values()].find((c) => c.caller.id === p.id || c.callee.id === p.id);
  const relay = (to: Player, from: Player, data: unknown, intro = false) => {
    const target = sockets.get(to.id);
    if (target) send(target, { t: "rtc", from: from.id, ...(intro ? { fromUid: uidOf(from.key), name: from.name } : {}), data });
  };
  const endCall = (c: Call, why: string, by?: Player) => {
    if (!calls.delete(c.id)) return;
    if (c.timer) clearInterval(c.timer);
    for (const p of [c.caller, c.callee]) if (p.id !== by?.id) relay(p, by ?? c.caller, { k: "end", call: c.id, why });
  };
  const handleCall = (me: Player, ws: WebSocket, toRaw: string, data: unknown, now: number) => {
    const d = (data && typeof data === "object" ? data : {}) as { k?: unknown; call?: unknown };
    const kind = typeof d.k === "string" ? d.k : "";
    const callId = typeof d.call === "string" && /^[A-Za-z0-9]{6,32}$/.test(d.call) ? d.call : "";
    if (!callId) return;
    if (kind === "invite") {
      const rejected = (why: string) => send(ws, { t: "rtc", from: "server", data: { k: "end", call: callId, why } });
      const blocker = room.callBlocker(me);
      if (blocker) return rejected(blocker);
      if (callOf(me)) return rejected("You are already on a call.");
      const callee = [...room.players.values()].find((p) => p.id === toRaw || uidOf(p.key) === toRaw);
      if (!callee || !callee.life || !sockets.has(callee.id)) return rejected("They can't be reached right now. Try again later.");
      if (callee.id === me.id) return rejected("You can't call yourself.");
      if (callOf(callee)) return rejected("Their line is busy.");
      calls.set(callId, { id: callId, caller: me, callee, active: false, timer: null });
      // an unanswered call stops ringing after 40 seconds
      setTimeout(() => {
        const c = calls.get(callId);
        if (c && !c.active) endCall(c, "No answer.");
      }, 40_000).unref?.();
      relay(callee, me, { k: "invite", call: callId }, true);
      return;
    }
    const c = calls.get(callId);
    if (!c || (c.caller.id !== me.id && c.callee.id !== me.id)) return;
    const other = c.caller.id === me.id ? c.callee : c.caller;
    switch (kind) {
      case "accept": {
        if (me.id !== c.callee.id || c.active) return;
        if (!room.chargeCallMinute(c.caller, now)) return endCall(c, "They ran out of airtime.");
        c.active = true;
        // the caller pays by the minute (every minute started), from their airtime
        c.timer = setInterval(() => {
          if (!room.chargeCallMinute(c.caller, Date.now())) endCall(c, c.caller.id === me.id ? "You ran out of airtime." : "They ran out of airtime.");
          else {
            const caller = sockets.get(c.caller.id);
            if (caller) sendLife(c.caller);
          }
        }, 60_000);
        c.timer.unref?.();
        sendLife(c.caller);
        relay(other, me, { k: "accept", call: callId });
        return;
      }
      case "decline":
      case "cancel":
      case "end":
        return endCall(c, kind === "decline" ? "They declined." : kind === "cancel" ? "Missed call." : "The call ended.", me);
      case "offer":
      case "answer":
      case "ice": {
        const payload = (data as Record<string, unknown>).sdp ?? (data as Record<string, unknown>).candidate;
        if (payload === undefined) return;
        relay(other, me, { k: kind, call: callId, ...(kind === "ice" ? { candidate: payload } : { sdp: payload }) });
        return;
      }
      default:
        return;
    }
  };

  const sendLife = (p: Player) => {
    const ws = sockets.get(p.id);
    const snap = room.snapshot(p);
    if (!ws || !snap) return;
    const away = p.away ?? undefined;
    p.away = null;
    send(ws, { t: "life", state: snap.state, ack: p.ack, active: snap.active, events: p.events.splice(0), away });
  };

  wss.on("connection", (ws) => {
    let me: Player | null = null;
    const helloTimer = setTimeout(() => ws.close(4001, "hello timeout"), 10_000);

    // Messages are handled one after another (a hello may wait for the account check).
    let chain: Promise<void> = Promise.resolve();
    ws.on("message", (data) => {
      const text = data.toString();
      chain = chain.then(() => handle(text)).catch((e) => console.error("message handler failed", e));
    });
    const handle = async (text: string) => {
      const now = Date.now();
      const message = parseClientMessage(text);
      if (!message) return send(ws, { t: "error", reason: "That message was not understood." });
      if (!me) {
        if (message.t !== "hello") return;
        if (message.protocol !== PROTOCOL_VERSION) {
          send(ws, { t: "error", reason: "Your game is out of date. Reload the page to update." });
          return ws.close(4002, "protocol");
        }
        let key = message.key;
        let account: { id: string; email?: string } | null = null;
        if (options.verifyToken) {
          account = message.token ? await options.verifyToken(message.token).catch(() => null) : null;
          if (account) key = `acct-${account.id}`;
          else if (!options.allowGuests) {
            send(ws, { t: "error", reason: message.token ? "Your login has expired. Log in again." : "Please log in to play." });
            return ws.close(4005, "login");
          }
        }
        // One life, one place: signing in again somewhere else moves the player there.
        for (const other of room.players.values()) {
          if (other.key !== key) continue;
          room.saveLife(other, now); // hand the newest state to the new session, then retire the old one
          other.life = null;
          sockets.get(other.id)?.close(4004, "signed in elsewhere");
        }
        const joined = room.join(message.name, now, message.look, key, message.where ?? "world");
        if (!joined.ok) {
          send(ws, { t: "error", reason: joined.reason });
          return ws.close(4003, "full");
        }
        clearTimeout(helloTimer);
        me = joined.player;
        sockets.set(me.id, ws);
        analytics.visit(me.id, key, account ? "account" : "guest", me.where === "world" ? "world" : "home");
        inbox.touch(uidOf(me.key), me.name, now);
        // money that was sent to this player while they were away
        const waiting = me.life ? payments.take(uidOf(me.key)) : [];
        for (const p of waiting) room.credit(me, p.amount, `From ${p.from}`, now);
        send(ws, { t: "welcome", id: me.id, uid: uidOf(me.key), phone: inbox.phoneOf(uidOf(me.key)) ?? undefined, room: room.name, protocol: PROTOCOL_VERSION, money: room.money(me), players: room.inWorld().filter((p) => p.id !== me!.id).map((p) => room.view(p)), serverTime: now });
        if (me.where === "world") broadcast({ t: "join", player: room.view(me) }, me.id);
        const mail = inbox.inbox(uidOf(me.key));
        if (mail.length) send(ws, { t: "inbox", threads: mail });
        if (me.life) {
          sendLife(me);
          sendHome(me, me.where === "world");
          if (waiting.length) {
            const total = waiting.reduce((a, p) => a + p.amount, 0);
            send(ws, { t: "money", balance: room.money(me), note: waiting.length === 1 ? `${waiting[0]!.from} sent you ₦${total.toLocaleString()} while you were away.` : `You received ₦${total.toLocaleString()} from ${waiting.length} people while you were away.` });
          }
        } else send(ws, { t: "needsLife" });
        return;
      }
      switch (message.t) {
        case "create": {
          const made = room.createLife(me, message.profile, now, message.replace === true, message.look);
          if (!made.ok) return send(ws, { t: "error", reason: made.reason });
          if (me.where === "world") broadcast({ t: "join", player: room.view(me) }, me.id); // their name changed
          inbox.touch(uidOf(me.key), me.name, now); // people find them by the character's name
          send(ws, { t: "money", balance: room.money(me), note: "Your life begins." });
          sendLife(me);
          sendHome(me, me.where === "world");
          return;
        }
        case "look": {
          if (!room.allow(me, "rpc", now)) return;
          room.setLook(me, message.look);
          sendLife(me);
          if (me.where === "world") broadcast({ t: "join", player: room.view(me) }, me.id); // others see the new look
          return;
        }
        case "inside": {
          if (me.where !== "world" || !room.allow(me, "move", now)) return;
          if (message.place === null) return leavePlace(me, true);
          if (me.inside === message.place) return;
          if (me.inside) leavePlace(me, false);
          if (room.inPlace(message.place).length >= MAX_PLACE_PLAYERS) return send(ws, { t: "error", reason: "That place is packed. Try again in a moment." });
          me.inside = message.place;
          me.px = 0;
          me.pz = 0;
          me.pyaw = 0;
          me.pclip = "Idle_Loop";
          broadcast({ t: "leave", id: me.id }, me.id); // out in the city they see you go in
          sendRoster(message.place);
          return;
        }
        case "pmove": {
          if (!me.inside || !room.allow(me, "move", now)) return;
          me.px = message.x;
          me.pz = message.z;
          me.pyaw = message.yaw;
          me.pclip = message.clip;
          return;
        }
        case "place": {
          if (me.where === message.where) return;
          if (message.where === "home") leavePlace(me, false);
          me.where = message.where;
          analytics.move(me.id, me.where === "world" ? "world" : "home");
          if (me.where === "world") {
            sendHome(me, true); // you step out of your own front door

            broadcast({ t: "join", player: room.view(me) }, me.id);
            for (const other of room.inWorld()) if (other.id !== me.id) send(ws, { t: "join", player: room.view(other) });
          } else broadcast({ t: "leave", id: me.id }, me.id);
          return;
        }
        case "do": {
          if (!room.allow(me, "rpc", now)) {
            me.ack = message.id;
            send(ws, { t: "done", id: message.id, ok: false, reason: "Slow down a little." });
            return sendLife(me);
          }
          const result = room.act(me, message.id, message.fn, message.args, now);
          send(ws, result.ok ? { t: "done", id: message.id, ok: true, text: result.text } : { t: "done", id: message.id, ok: false, reason: result.reason });
          sendLife(me);
          return;
        }
        case "move": {
          if (me.where !== "world" || !room.allow(me, "move", now)) return;
          const result = room.move(me, message, now);
          if (!result.ok) send(ws, { t: "correct", ...result.correct });
          return;
        }
        case "arrive": {
          if (me.where !== "world") return;
          const result = room.arrive(me, message, now);
          if (!result.ok) send(ws, { t: "correct", ...result.correct });
          return;
        }
        case "chat": {
          if (!room.allow(me, "chat", now)) return send(ws, { t: "error", reason: "You're typing too fast." });
          // inside a place, whoever is in there with you hears you, wherever they stand in the room
          if (me.inside) {
            const line: ServerMessage = { t: "chat", from: me.id, name: me.name, text: message.text, at: now };
            for (const other of room.inPlace(me.inside)) {
              const target = sockets.get(other.id);
              if (target) send(target, line);
            }
            return;
          }
          // out in the city, chat carries only so far; at home nobody hears you (use a private message)
          if (me.where !== "world") return send(ws, { t: "error", reason: "Nobody is near enough to hear you. Step outside, or send a private message." });
          const line: ServerMessage = { t: "chat", from: me.id, name: me.name, text: message.text, at: now };
          send(ws, line);
          for (const other of room.inWorld()) {
            if (other.id === me.id || Math.hypot(other.x - me.x, other.z - me.z) > HEARING_RANGE) continue;
            const target = sockets.get(other.id);
            if (target) send(target, line);
          }
          return;
        }
        case "dm": {
          if (!room.allow(me, "chat", now)) return send(ws, { t: "error", reason: "You're typing too fast." });
          const mine = uidOf(me.key);
          const known = inbox.nameOf(message.to);
          if (message.to === mine) return send(ws, { t: "error", reason: "That is your own ID." });
          if (known === null) return send(ws, { t: "error", reason: "There is no player with that ID." });
          inbox.send(mine, message.to, message.text, now);
          const line: ServerMessage = { t: "chat", from: me.id, fromUid: mine, name: me.name, text: message.text, at: now, to: message.to };
          send(ws, line);
          for (const other of room.players.values()) {
            if (uidOf(other.key) !== message.to) continue;
            const target = sockets.get(other.id);
            if (target) send(target, line);
          }
          return;
        }
        case "find": {
          if (!room.allow(me, "chat", now)) return send(ws, { t: "error", reason: "Slow down a little." });
          const mine = uidOf(me.key);
          const uid = message.phone ? inbox.uidOfPhone(message.phone) : (message.uid ?? null);
          const name = uid ? inbox.nameOf(uid) : null;
          if (!uid || name === null || uid === mine) return send(ws, { t: "error", reason: uid === mine ? "That is your own number." : message.phone ? "There is no player with that phone number." : "There is no player with that ID." });
          inbox.open(mine, uid);
          return send(ws, { t: "person", uid, name, phone: inbox.phoneOf(uid) ?? undefined });
        }
        case "emote": {
          if (me.where !== "world" || !room.allow(me, "chat", now)) return;
          const line: ServerMessage = { t: "emote", from: me.id, emote: message.emote };
          for (const other of room.inWorld()) {
            if (other.id === me.id || Math.hypot(other.x - me.x, other.z - me.z) > HEARING_RANGE) continue;
            const target = sockets.get(other.id);
            if (target) send(target, line);
          }
          return;
        }
        case "pay": {
          if (!room.allow(me, "pay", now)) return send(ws, { t: "error", reason: "Slow down: too many payments." });
          const result = room.pay(me, message.to, message.amount, now);
          if (!result.ok) return send(ws, { t: "error", reason: result.reason });
          send(ws, { t: "money", balance: room.money(me), note: `You sent ₦${message.amount.toLocaleString()} to ${result.to.name}.` });
          sendLife(me);
          const target = sockets.get(result.to.id);
          if (target) {
            send(target, { t: "money", balance: room.money(result.to), note: `${me.name} sent you ₦${message.amount.toLocaleString()}.` });
            sendLife(result.to);
          }
          return;
        }
        case "payto": {
          if (!room.allow(me, "pay", now)) return send(ws, { t: "error", reason: "Slow down: too many payments." });
          const mine = uidOf(me.key);
          const target = message.phone ? inbox.uidOfPhone(message.phone) : (message.uid ?? null);
          const name = target ? inbox.nameOf(target) : null;
          if (target === mine) return send(ws, { t: "error", reason: "You can't pay yourself." });
          if (!target || name === null) return send(ws, { t: "error", reason: message.phone ? "There is no player with that phone number." : "There is no player with that ID." });
          const bad = room.checkAmount(message.amount);
          if (bad) return send(ws, { t: "error", reason: bad });
          const other = [...room.players.values()].find((p) => p.life && uidOf(p.key) === target);
          if (message.pin) {
            // from the bank account: the card's PIN, the bank's limit and fee
            const out = room.bankDebit(me, message.amount, message.pin, `Sent to ${name}`, now);
            if (!out.ok) return send(ws, { t: "error", reason: out.reason });
            if (other) room.credit(other, message.amount, `From ${me.name}`, now);
            else payments.queue(target, { from: me.name, amount: message.amount, at: now });
          } else if (other) {
            const result = room.payPlayer(me, other, message.amount, now);
            if (!result.ok) return send(ws, { t: "error", reason: result.reason });
          } else {
            const out = room.lifePayDebit(me, message.amount, `Sent to ${name}`, now);
            if (!out.ok) return send(ws, { t: "error", reason: out.reason });
            payments.queue(target, { from: me.name, amount: message.amount, at: now });
          }
          send(ws, { t: "money", balance: room.money(me), note: `You sent ₦${message.amount.toLocaleString()} to ${name}.` });
          sendLife(me);
          if (other) {
            const target = sockets.get(other.id);
            if (target) {
              send(target, { t: "money", balance: room.money(other), note: `${me.name} sent you ₦${message.amount.toLocaleString()}.` });
              sendLife(other);
            }
          }
          // it shows in the conversation, for both of them, and stays there
          const text = `₦${message.amount.toLocaleString()} sent`;
          inbox.send(mine, target, text, now);
          const line: ServerMessage = { t: "chat", from: me.id, fromUid: mine, name: me.name, text, at: now, to: target };
          send(ws, line);
          if (other) {
            const target = sockets.get(other.id);
            if (target) send(target, line);
          }
          return;
        }
        case "ping":
          return send(ws, { t: "pong", ts: message.ts, serverTime: now });
        case "rtc": {
          if (!room.allow(me, "rtc", now)) return;
          return handleCall(me, ws, message.to, message.data, now);
        }
        default:
          return;
      }
    };

    ws.on("close", () => {
      clearTimeout(helloTimer);
      if (me) {
        const c = callOf(me);
        if (c) endCall(c, "The call dropped.", me);
        room.leave(me.id);
        analytics.leave(me.id);
        if (sockets.get(me.id) === ws) sockets.delete(me.id);
        if (me.inside) leavePlace(me, false);
        if (me.where === "world") broadcast({ t: "leave", id: me.id });
      }
    });
    ws.on("error", () => ws.close());
  });

  // Every second each life lives a second, is sent to its player, and every so often is written to disk.
  let lifeTicks = 0;
  const lifeInterval = setInterval(() => {
    const now = Date.now();
    room.stepLives(now);
    for (const p of room.players.values()) {
      try {
        sendLife(p);
      } catch (e) {
        console.error(`could not send the life of ${p.name}`, e);
      }
    }
    if (++lifeTicks % 15 === 0) {
      for (const p of room.players.values()) room.saveLife(p, now);
      store.flush();
    }
  }, 1000);

  let tick = 0;
  const interval = setInterval(() => {
    // inside the places: each place's people hear where the others stand
    const byPlace = new Map<string, Player[]>();
    for (const p of room.players.values()) if (p.inside) byPlace.set(p.inside, [...(byPlace.get(p.inside) ?? []), p]);
    for (const [place, members] of byPlace) {
      if (members.length < 2) continue;
      const text = JSON.stringify({ t: "pstate", place, players: members.map((p) => ({ id: p.id, x: p.px, z: p.pz, yaw: p.pyaw, clip: p.pclip })) } satisfies ServerMessage);
      for (const m of members) {
        const target = sockets.get(m.id);
        if (target && target.readyState === target.OPEN) target.send(text);
      }
    }
    const here = room.inWorld();
    if (here.length < 2) return; // nobody to tell
    tick++;
    broadcast({ t: "state", tick, serverTime: Date.now(), players: here.map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, clip: p.clip, level: p.level })) });
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
        clearInterval(lifeInterval);
        analytics.close();
        inbox.close();
        const now = Date.now();
        for (const p of room.players.values()) room.saveLife(p, now);
        store.flush();
        for (const ws of sockets.values()) ws.terminate();
        wss.close(() => http.close(() => resolve()));
      }),
  };
}
