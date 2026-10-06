import { MINT, balance, createLedger, generateLagos, transfer, walkableAt, type District, type Ledger } from "@thelife/game-core";
import { MAX_ROOM_PLAYERS, type PlayerView } from "@thelife/shared";

/** Money a player starts with in the prototype world. */
export const START_MONEY = 20_000;
/** Fastest a character may move (running is about 3.3 m/s); the rest is tolerance for network jitter. */
export const MAX_SPEED = 7;
const MAX_STEP_SLACK = 1.2;

export interface Player extends PlayerView {
  /** The ledger account that holds this player's money. */
  account: string;
  lastMoveAt: number;
  /** Token buckets for rate limits. */
  buckets: Record<"chat" | "pay" | "move" | "rtc", { tokens: number; at: number }>;
}

const LIMITS = { chat: { rate: 1, burst: 4 }, pay: { rate: 1, burst: 3 }, move: { rate: 40, burst: 60 }, rtc: { rate: 20, burst: 40 } } as const;

export type JoinResult = { ok: true; player: Player } | { ok: false; reason: string };
export type MoveResult = { ok: true } | { ok: false; correct: { x: number; y: number; z: number; level: number } };

/**
 * One shared world (a city instance). It owns the truth: where everyone is, how much money they have. Clients only ask;
 * the room checks and answers. It has no network code, so it can be tested directly.
 */
export class Room {
  readonly players = new Map<string, Player>();
  readonly ledger: Ledger = createLedger();
  readonly district: District;
  private nextId = 1;
  private minute = 0;

  constructor(readonly name: string, district = generateLagos()) {
    this.district = district;
  }

  get size(): number {
    return this.players.size;
  }

  join(rawName: string, now: number, look?: string): JoinResult {
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
      account: `acct:${id}`,
      lastMoveAt: now,
      buckets: { chat: { tokens: LIMITS.chat.burst, at: now }, pay: { tokens: LIMITS.pay.burst, at: now }, move: { tokens: LIMITS.move.burst, at: now }, rtc: { tokens: LIMITS.rtc.burst, at: now } },
    };
    if (!walkableAt(this.district, player.x, player.z)) {
      player.x = spawn.x;
      player.z = spawn.z;
    }
    transfer(this.ledger, MINT, player.account, START_MONEY, "Starting money", this.minute);
    this.players.set(id, player);
    return { ok: true, player };
  }

  leave(id: string): void {
    this.players.delete(id);
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

  /** Moves money between two players. The ledger always balances; nobody can go below zero. */
  pay(from: Player, toId: string, amount: number): { ok: true; to: Player } | { ok: false; reason: string } {
    const to = this.players.get(toId);
    if (!to) return { ok: false, reason: "That player isn't here any more." };
    if (to.id === from.id) return { ok: false, reason: "You can't pay yourself." };
    if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: "Enter a whole amount above zero." };
    if (amount > 1_000_000) return { ok: false, reason: "That is more than one payment can carry." };
    const r = transfer(this.ledger, from.account, to.account, amount, `${from.name} to ${to.name}`, this.minute);
    return r.ok ? { ok: true, to } : { ok: false, reason: "You don't have enough money." };
  }

  money(player: Player): number {
    return balance(this.ledger, player.account);
  }

  view(p: Player): PlayerView {
    return { id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, yaw: p.yaw, clip: p.clip, level: p.level, look: p.look };
  }
}
