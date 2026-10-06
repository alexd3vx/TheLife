import { MINT, PLAYER, SINK, Sim, buildProfile, createGameState, generateLagos, parseGameState, chargingSpotNear, homeFor, rpcCooldown, runRpc, simulateAbsence, transfer, walkableAt, type District, type GameState, type Home, type NewLifeChoices, type RpcArg, type SimEvent } from "@thelife/game-core";
import { MAX_ROOM_PLAYERS, type PlayerView, type Where } from "@thelife/shared";
import { LifeStore } from "./lives.js";

/** Fastest a character may move (running is about 3.3 m/s); the rest is tolerance for network jitter. */
export const MAX_SPEED = 7;
const MAX_STEP_SLACK = 1.2;

export interface Player extends PlayerView {
  /** At home (invisible to others, not in the city) or out in the city. */
  where: Where;
  /** The secret that unlocks this player's life (kept on the server only). */
  key: string;
  /** The player's life, run here. Null until they have made a character. */
  life: Sim | null;
  /** The newest `do` the server has handled, so the client can tell whether a snapshot already includes its actions. */
  ack: number;
  /** Events from the life that the player has not been sent yet. */
  events: SimEvent[];
  /** "While you were away" lines, sent once with the first snapshot. */
  away: string[] | null;
  home: Home | null;
  lastStepAt: number;
  lastCreateAt: number;
  lastRpcAt: Record<string, number>;
  lastMoveAt: number;
  /** Token buckets for rate limits. */
  buckets: Record<"chat" | "pay" | "move" | "rtc" | "rpc", { tokens: number; at: number }>;
}

const LIMITS = { chat: { rate: 1, burst: 4 }, pay: { rate: 1, burst: 3 }, move: { rate: 40, burst: 60 }, rtc: { rate: 20, burst: 40 }, rpc: { rate: 10, burst: 30 } } as const;

export type JoinResult = { ok: true; player: Player } | { ok: false; reason: string };
export type MoveResult = { ok: true } | { ok: false; correct: { x: number; y: number; z: number; level: number } };

/**
 * One shared world (a city instance). It owns the truth: where everyone is, how much money they have. Clients only ask;
 * the room checks and answers. It has no network code, so it can be tested directly.
 */
export class Room {
  readonly players = new Map<string, Player>();
  readonly district: District;
  private nextId = 1;

  constructor(readonly name: string, district = generateLagos(), readonly store = new LifeStore(null)) {
    this.district = district;
  }

  get size(): number {
    return this.players.size;
  }

  join(rawName: string, now: number, look: string | undefined, key: string, where: Where = "world"): JoinResult {
    if (this.players.size >= MAX_ROOM_PLAYERS) return { ok: false, reason: "This world is full. Try again in a moment." };
    const id = `p${this.nextId++}`;
    const spawn = this.district.spawn;
    // Spread new players out a little so they do not stand inside each other.
    const slot = this.players.size;
    const player: Player = {
      id,
      name: this.uniqueName(rawName),
      x: spawn.x + ((slot % 5) - 2) * 0.9,
      y: 0,
      z: spawn.z - Math.floor(slot / 5) * 0.9,
      yaw: spawn.yaw,
      clip: "Idle_Loop",
      level: 0,
      look,
      where,
      key,
      life: null,
      ack: 0,
      events: [],
      away: null,
      home: null,
      lastStepAt: now,
      lastCreateAt: 0,
      lastRpcAt: {},
      lastMoveAt: now,
      buckets: { chat: { tokens: LIMITS.chat.burst, at: now }, pay: { tokens: LIMITS.pay.burst, at: now }, move: { tokens: LIMITS.move.burst, at: now }, rtc: { tokens: LIMITS.rtc.burst, at: now }, rpc: { tokens: LIMITS.rpc.burst, at: now } },
    };
    if (!walkableAt(this.district, player.x, player.z)) {
      player.x = spawn.x;
      player.z = spawn.z;
    }
    this.players.set(id, player);
    this.loadLife(player, now);
    return { ok: true, player };
  }

  leave(id: string, now = Date.now()): void {
    const p = this.players.get(id);
    if (p) this.saveLife(p, now);
    this.players.delete(id);
    this.store.flush();
  }

  // ---------------------------------------------------------------- lives

  /** Picks the player's saved life up where it was left, letting the time they were away pass. */
  private loadLife(player: Player, now: number): void {
    const saved = this.store.get(player.key);
    if (!saved) return;
    // Lives saved by older versions of the game may lack newer parts; reading them through the same checks as a local save fills those in.
    const state = parseGameState(structuredClone(saved.state)) ?? structuredClone(saved.state);
    let lines: string[] = [];
    try {
      lines = simulateAbsence(state, (now - saved.savedAt) / 60000).lines;
    } catch (e) {
      console.error("could not replay the time away", e);
    }
    player.away = lines.length ? lines : null;
    player.life = new Sim(state, { realClock: true });
    if (state.look) player.look = state.look;
    player.lastStepAt = now;
    this.assignHome(player);
    this.rename(player, `${state.profile?.firstName ?? player.name} ${state.profile?.surname ?? ""}`.trim());
  }

  /** Starts a new life from a character choice. The profile is rebuilt from the background, so nothing is taken on trust. */
  createLife(player: Player, choice: NewLifeChoices, now: number, replace = false, look?: string): { ok: true } | { ok: false; reason: string } {
    if (player.life && !replace) return { ok: false, reason: "You already have a life." };
    if (player.life && now - player.lastCreateAt < 60_000) return { ok: false, reason: "Wait a minute before starting over again." };
    player.lastCreateAt = now;
    const profile = buildProfile(choice);
    if (!profile) return { ok: false, reason: "That character isn't valid." };
    player.life = new Sim(createGameState(profile), { realClock: true });
    if (look) {
      player.life.state.look = look;
      player.look = look;
    }
    player.lastStepAt = now;
    this.assignHome(player);
    player.away = null;
    this.rename(player, `${profile.firstName} ${profile.surname}`.trim());
    this.saveLife(player, now);
    return { ok: true };
  }

  /** Saves a new look with the life (the wardrobe and the hairdresser use this). */
  setLook(player: Player, look: string): void {
    if (!player.life) return;
    player.life.state.look = look;
    player.look = look;
  }

  /** A player's home is a building of their background, the same one every time (their account decides). */
  private assignHome(player: Player): void {
    const tier = player.life?.state.profile?.tier;
    player.home = tier ? homeFor(this.district, tier, player.key) : null;
  }

  /** Puts a player on the pavement outside their own front door (stepping out of the house, or arriving). */
  stepOutside(player: Player): void {
    const h = player.home;
    if (!h) return;
    player.x = h.spawn.x;
    player.z = h.spawn.z;
    player.y = 0;
    player.yaw = h.yaw;
    player.level = 0;
  }

  private rename(player: Player, name: string): void {
    const clean = name.slice(0, 20) || player.name;
    const taken = new Set([...this.players.values()].filter((p) => p !== player).map((p) => p.name.toLowerCase()));
    player.name = taken.has(clean.toLowerCase()) ? `${clean.slice(0, 16)} ${player.id.slice(1)}` : clean;
  }

  saveLife(player: Player, now: number): void {
    if (player.life) this.store.set(player.key, { state: structuredClone(player.life.state), savedAt: now });
  }

  /** Lets every online life run for the real time that has passed. */
  stepLives(now: number): void {
    for (const p of this.players.values()) {
      if (!p.life) continue;
      const dt = Math.max(0, Math.min(5, (now - p.lastStepAt) / 1000));
      p.lastStepAt = now;
      try {
        p.life.step(dt);
      } catch (e) {
        // One broken life must never take the whole server (and everyone else's connection) down with it.
        console.error(`life of ${p.name} failed to step`, e);
        continue;
      }
      // Walk away from the socket and the phone comes unplugged.
      if (p.life.state.phone.plugged === "wall" && p.where === "world" && !chargingSpotNear(this.district, p.x, p.z)) {
        p.life.state.phone.plugged = null;
        p.events.push({ kind: "warn", text: "You moved away from the socket and your phone unplugged.", minute: p.life.state.minute });
      }
      p.events.push(...p.life.drainEvents());
    }
  }

  /** Runs one whitelisted action on a player's life. */
  act(player: Player, id: number, fn: string, args: RpcArg[], now: number): { ok: true; text?: string } | { ok: false; reason: string } {
    player.ack = id;
    if (!player.life) return { ok: false, reason: "Make your character first." };
    const wait = rpcCooldown(fn);
    if (wait > 0) {
      if (now - (player.lastRpcAt[fn] ?? 0) < wait * 1000) return { ok: true };
      player.lastRpcAt[fn] = now;
    }
    if (fn === "plug" && args[0] === "wall" && player.where === "world" && !chargingSpotNear(this.district, player.x, player.z)) {
      return { ok: false, reason: "There is no socket here. Charge at home, or at a shop, bank, hotel, hospital or station." };
    }
    const result = runRpc(player.life, fn, args);
    player.events.push(...player.life.drainEvents());
    return result;
  }

  /** The state sent to a player's own page: their life, with only the latest few ledger lines. */
  snapshot(player: Player): { state: GameState; active: { id: string; done: number; forced: boolean } | null } | null {
    const life = player.life;
    if (!life) return null;
    const s = life.state;
    const act = life.active;
    return {
      state: { ...s, ledger: { ...s.ledger, entries: s.ledger.entries.slice(-40) } },
      active: act ? { id: act.def.id, done: act.done, forced: act.forced } : null,
    };
  }

  private uniqueName(name: string): string {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; n < 100; n++) {
      const candidate = `${name.slice(0, 16)} ${n}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${name.slice(0, 12)} ${this.nextId}`;
  }

  /** Takes one token from a rate-limit bucket; false means "too fast, ignore this message". */
  allow(player: Player, kind: keyof Player["buckets"], now: number): boolean {
    const b = player.buckets[kind];
    const limit = LIMITS[kind];
    b.tokens = Math.min(limit.burst, b.tokens + ((now - b.at) / 1000) * limit.rate);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  /**
   * A client says where it is. Accept it if it is a believable step from the last accepted position and (on the ground
   * floor) not inside a wall, tree or building; otherwise tell the client where it really is.
   */
  move(player: Player, to: { x: number; y: number; z: number; yaw: number; clip: string; level: number }, now: number): MoveResult {
    const dt = Math.max(0.03, Math.min(2, (now - player.lastMoveAt) / 1000));
    const distance = Math.hypot(to.x - player.x, to.z - player.z);
    const b = this.district.bounds;
    const inside = to.x > b.minX && to.x < b.maxX && to.z > b.minZ && to.z < b.maxZ;
    const farTooFast = distance > MAX_SPEED * dt + MAX_STEP_SLACK;
    const blocked = to.level === 0 && to.y < 0.05 && !walkableAt(this.district, to.x, to.z, 0.1);
    const heightJump = Math.abs(to.y - player.y) > 4 * dt + 1.5;
    if (!inside || farTooFast || blocked || heightJump || to.level > 4) {
      return { ok: false, correct: { x: player.x, y: player.y, z: player.z, level: player.level } };
    }
    player.x = to.x;
    player.y = to.y;
    player.z = to.z;
    player.yaw = to.yaw;
    player.clip = to.clip;
    player.level = to.level;
    player.lastMoveAt = now;
    return { ok: true };
  }

  /** Moves money from one player's life to another's, both ledgers staying balanced. Nobody can go below zero. */
  pay(from: Player, toId: string, amount: number, now: number): { ok: true; to: Player } | { ok: false; reason: string } {
    const to = this.players.get(toId);
    if (!to) return { ok: false, reason: "That player isn't here any more." };
    if (to.id === from.id) return { ok: false, reason: "You can't pay yourself." };
    if (!from.life || !to.life) return { ok: false, reason: "That player hasn't made their character yet." };
    if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: "Enter a whole amount above zero." };
    if (amount > 1_000_000) return { ok: false, reason: "That is more than one payment can carry." };
    const out = transfer(from.life.state.ledger, PLAYER, SINK, amount, `Sent to ${to.name}`, from.life.state.minute);
    if (!out.ok) return { ok: false, reason: "You don't have enough money." };
    from.life.state.stats.totalSpent += amount;
    transfer(to.life.state.ledger, MINT, PLAYER, amount, `From ${from.name}`, to.life.state.minute);
    to.life.state.stats.totalEarned += amount;
    this.saveLife(from, now);
    this.saveLife(to, now);
    return { ok: true, to };
  }

  money(player: Player): number {
    return player.life?.money ?? 0;
  }

  /** Everyone who is out in the city. */
  inWorld(): Player[] {
    return [...this.players.values()].filter((p) => p.where === "world");
  }

  view(p: Player): PlayerView {
    return { id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, yaw: p.yaw, clip: p.clip, level: p.level, look: p.look };
  }
}
