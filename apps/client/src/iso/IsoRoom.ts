import { blockOutside, blockRect, createNavGrid, findPath, isFree, nearestFree, type NavGrid, type Point } from "@thelife/shared";
import { ACTIONS, furnitureById } from "@thelife/game-core";
import type { Layout, Placement } from "../play/layout";
import { charImage, charMeta, propImage, propsMeta, type CharFrameMeta, type PropMeta, type SpriteMeta } from "./assets";
import { HALF_H, HALF_W, PX_PER_M_UP, SPRITE_SHARP, dirOf, project, unproject } from "./projection";

const WALK_SPEED = 1.55;
const NAV_CELL = 0.125;
const CHAR_RADIUS = 0.27;
const WALL_H = 2.6;
const INNER_WALL_H = 1.05;
const CUT_WALL_H = 0.55;
const FRAME_FPS = 9;

export type Tier = "lapo" | "middle" | "nepo";

/** What the engine needs from the running game. */
export interface IsoGame {
  start(actionId: string): { ok: boolean; reason?: string };
  cancel(): void;
  active(): { id: string; forced: boolean } | null;
  notice(text: string): void;
}

interface Drawn {
  key: number;
  draw(c: CanvasRenderingContext2D): void;
  /** For taps: the item this picture belongs to, and the screen box it covers. */
  item?: Item;
  img?: HTMLImageElement;
  box?: { x: number; y: number; w: number; h: number };
}

interface Item {
  def: Placement;
  action: string | undefined;
  size: [number, number, number];
  rot: number;
  meta: PropMeta | null;
  image: HTMLImageElement | null;
  /** Floor height this stands on (for things resting on other things). */
  base: number;
  /** Where to stand to use it, and which way to face. */
  approach: Point;
  face: number;
  /** Is the character placed on the item itself (a chair, a bed)? */
  mount: "seat" | "lie" | "enter" | null;
}

type Mode = "idle" | "walking" | "doing";

const SEAT_ACTIONS = new Set(["eatMeal", "tv", "work", "sit", "toilet"]);

function rotQuarter(deg: number | undefined): number {
  return ((Math.round((deg ?? 0) / 90) % 4) + 4) % 4;
}

/**
 * One room, drawn from a fixed isometric angle with pre-painted sprites on a 2D canvas, with a character who walks about and uses
 * things. Everything the game rules need (needs, time, food) still happens in the game session; this only draws and moves.
 */
export class IsoRoom {
  private ctx: CanvasRenderingContext2D;
  private items: Item[] = [];
  private nav!: NavGrid;
  private charFrames = new Map<string, CharFrameMeta[]>();
  private charImgs = new Map<string, HTMLImageElement>();
  private raf = 0;
  private last = 0;
  private time = 0;
  private floorCache: { canvas: HTMLCanvasElement; ox: number; oy: number } | null = null;
  private drawn: Drawn[] = [];
  /** Where the character is, which way they face, and what they are doing. */
  pos: Point;
  private yaw = 0;
  private mode: Mode = "idle";
  private path: Point[] = [];
  private pending: Item | null = null;
  private doing: { item: Item; clip: string; mount: Item["mount"]; actionId: string } | null = null;
  private clip = "Idle_Loop";
  private clipTime = 0;
  private hour = 14;
  // the view: where the middle of the room sits on the screen, and the zoom
  private zoom = 1;
  private cx = 0;
  private cy = 0;
  private dpr = 1;
  private w = 1;
  private h = 1;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragged = false;
  private pinch = 0;
  private status: string | null = null;
  onStatus?: (text: string | null) => void;
  onMenu?: (menu: { x: number; y: number; title: string; options: { label: string; run(): void }[] } | null) => void;
  onKitchen?: (tab: "fridge" | "cook" | "eat") => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly layout: Layout,
    private readonly tier: Tier,
    private readonly game: IsoGame | null,
  ) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.pos = { x: layout.start.x, z: layout.start.z };
    this.yaw = layout.start.yaw;
  }

  // ------------------------------------------------------------------ loading

  async load(): Promise<void> {
    const [props, chars] = await Promise.all([propsMeta(), charMeta()]);
    for (const [clip, frames] of Object.entries(chars.frames)) this.charFrames.set(clip, frames);
    const items: Item[] = [];
    const byId = new Map<string, Item>();
    for (const def of this.layout.items) {
      const cat = furnitureById(def.furniture);
      const meta = props[def.furniture] ?? null;
      const rot = rotQuarter(def.rot);
      const size: [number, number, number] = meta?.size ?? [0.6, 0.6, 0.6];
      const ceiling = def.furniture === "ceiling_fan" || def.furniture === "caged_hanging_light";
      const item: Item = { def, action: def.decor ? undefined : (def.action ?? cat?.action), size, rot, meta, image: null, base: ceiling ? WALL_H - size[1] : (def.y ?? 0), approach: { x: def.x, z: def.z }, face: 0, mount: null };
      items.push(item);
      byId.set(def.id, item);
    }
    // things resting on other things take the height of what is below
    for (const item of items) {
      if (item.def.onTopOf) {
        const below = byId.get(item.def.onTopOf);
        if (below) item.base = below.base + below.size[1] + (item.def.y ?? 0);
      }
    }
    await Promise.all(items.map(async (it) => {
      if (!it.meta) return;
      try {
        it.image = await propImage(it.def.furniture, it.rot);
      } catch {
        it.image = null;
      }
    }));
    this.items = items;
    this.buildNav();
    for (const it of items) this.deriveUse(it, byId);
    await this.preloadChar();
    this.fit();
  }

  private async preloadChar() {
    // load the frames of idle and walk right away; the others as they are needed
    await Promise.all(["Idle_Loop", "Walk_Loop"].flatMap((clip) => (this.charFrames.get(clip) ?? []).map((f) => this.loadChar(clip, f.dir, f.frame))));
  }

  private loadChar(clip: string, dir: number, frame: number): Promise<HTMLImageElement | null> {
    const k = `${clip}_${dir}_${frame}`;
    const have = this.charImgs.get(k);
    if (have) return Promise.resolve(have);
    return charImage(clip, dir, frame).then((img) => {
      this.charImgs.set(k, img);
      return img;
    }, () => null);
  }

  // ------------------------------------------------------------------ the floor plan: walking and using things

  private footprint(it: Item): { hx: number; hz: number } {
    const [sx, , sz] = it.size;
    const quarter = it.rot % 2 === 1;
    return { hx: (quarter ? sz : sx) / 2, hz: (quarter ? sx : sz) / 2 };
  }

  private buildNav() {
    const nav = createNavGrid(this.layout.area, NAV_CELL);
    blockOutside(nav, this.layout.area, 0.4);
    const t = (this.layout.house?.wallThickness ?? 0.2) / 2;
    for (const w of this.layout.walls) {
      blockRect(nav, { minX: Math.min(w.a[0], w.b[0]) - t, maxX: Math.max(w.a[0], w.b[0]) + t, minZ: Math.min(w.a[1], w.b[1]) - t, maxZ: Math.max(w.a[1], w.b[1]) + t }, CHAR_RADIUS);
    }
    for (const it of this.items) {
      if (it.def.onTopOf || it.def.y) continue; // on a shelf or the ceiling
      if (it.def.furniture === "p_rug" || it.def.furniture === "p_doormat" || it.def.furniture === "ceiling_fan") continue;
      const { hx, hz } = this.footprint(it);
      // chairs and beds can be sat on and slept on, so they are not walls; but leave them closed so nobody walks through them
      blockRect(nav, { minX: it.def.x - hx, maxX: it.def.x + hx, minZ: it.def.z - hz, maxZ: it.def.z + hz }, CHAR_RADIUS * 0.6);
    }
    this.nav = nav;
  }

  private deriveUse(it: Item, byId: Map<string, Item>) {
    // an item that points at another (a TV that sends you to the sofa) uses that one
    const via = it.def.via ? byId.get(it.def.via) : null;
    const target = via ?? it;
    const action = it.def.action ?? (via ? (via.def.action ?? via.action) : it.action);
    it.action = action;
    const { hx, hz } = this.footprint(target);
    const fx = Math.sin((target.rot * Math.PI) / 2), fz = Math.cos((target.rot * Math.PI) / 2); // the front faces south at 0
    const spot = (d: number): Point => ({ x: target.def.x + fx * (Math.abs(fx) * hx + Math.abs(fz) * hz + d), z: target.def.z + fz * (Math.abs(fx) * hx + Math.abs(fz) * hz + d) });
    if (action && SEAT_ACTIONS.has(action) && (target.def.furniture.includes("chair") || target.def.furniture.includes("stool") || target.def.furniture.includes("sofa") || target.def.furniture.includes("bench") || target.def.furniture === "p_toilet" || target.def.furniture.includes("lounge") || target.def.furniture.includes("Chair") || target.def.furniture.includes("Rocking") || target.def.furniture.includes("Ottoman"))) {
      it.mount = "seat";
      it.approach = this.freeNear(spot(0.55));
      it.face = Math.atan2(-fx, -fz) + Math.PI; // sit facing the way the seat faces
      it.face = Math.atan2(fx, fz);
      if (target !== it) it.approach = target.approach;
    } else if (action === "sleep") {
      it.mount = "lie";
      it.approach = this.freeNear(spot(0.5));
      it.face = Math.atan2(fx, fz);
    } else if (action === "shower") {
      it.mount = "enter";
      it.approach = this.freeNear({ x: target.def.x, z: target.def.z });
      it.face = Math.atan2(fx, fz);
    } else if (action) {
      it.approach = this.freeNear(spot(0.5));
      // stand facing the thing
      it.face = Math.atan2(-fx, -fz);
    }
    if (target !== it && it.mount) it.approach = target.approach;
  }

  private freeNear(p: Point): Point {
    return isFree(this.nav, p.x, p.z) ? p : (nearestFree(this.nav, p.x, p.z, 1.5) ?? p);
  }

  // ------------------------------------------------------------------ view

  setHour(h: number) {
    this.hour = h;
  }

  private fit() {
    const a = this.layout.house?.bounds ?? this.layout.area;
    const corners = [project(a.minX, 0, a.minZ), project(a.maxX, 0, a.minZ), project(a.maxX, 0, a.maxZ), project(a.minX, 0, a.maxZ), project(a.minX, WALL_H, a.minZ), project(a.maxX, WALL_H, a.minZ)];
    const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
    this.cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    this.cy = (Math.min(...ys) + Math.max(...ys)) / 2 + 20;
    const roomW = Math.max(...xs) - Math.min(...xs) + 260, roomH = Math.max(...ys) - Math.min(...ys) + 260;
    this.zoom = Math.min(this.w / roomW, this.h / roomH);
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.w = w;
    this.h = h;
    this.floorCache = null;
    if (this.items.length) this.fit();
  }

  private screenToWorld(px: number, py: number): Point {
    const sx = (px - this.w / 2) / this.zoom + this.cx, sy = (py - this.h / 2) / this.zoom + this.cy;
    const [x, z] = unproject(sx, sy);
    return { x, z };
  }

  // ------------------------------------------------------------------ input

  attach(): () => void {
    const c = this.canvas;
    const down = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      this.dragged = false;
      this.onMenu?.(null);
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    };
    const move = (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
      p.x = e.offsetX;
      p.y = e.offsetY;
      if (this.pointers.size === 1) {
        if (Math.abs(dx) + Math.abs(dy) > 1.5) this.dragged = this.dragged || Math.hypot(dx, dy) > 3;
        if (this.dragged) {
          this.cx -= dx / this.zoom;
          this.cy -= dy / this.zoom;
        }
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (this.pinch) this.zoom = Math.max(0.35, Math.min(2.2, this.zoom * (d / this.pinch)));
        this.pinch = d;
        this.dragged = true;
      }
    };
    const up = (e: PointerEvent) => {
      const had = this.pointers.has(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (had && this.pointers.size === 0 && !this.dragged) this.tap(e.offsetX, e.offsetY);
      this.pinch = 0;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.zoom = Math.max(0.35, Math.min(2.2, this.zoom * Math.exp(-e.deltaY * 0.0015)));
    };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("wheel", wheel, { passive: false });
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(c);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
    return () => {
      cancelAnimationFrame(this.raf);
      ro.disconnect();
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      c.removeEventListener("wheel", wheel);
    };
  }

  private itemAt(px: number, py: number): Item | null {
    const sx = (px - this.w / 2) / this.zoom + this.cx, sy = (py - this.h / 2) / this.zoom + this.cy;
    for (let i = this.drawn.length - 1; i >= 0; i--) {
      const d = this.drawn[i]!;
      if (!d.item || !d.box || !d.img || !d.item.action) continue;
      const b = d.box;
      if (sx < b.x || sx > b.x + b.w || sy < b.y || sy > b.y + b.h) continue;
      if (this.opaqueAt(d.img, (sx - b.x) / b.w, (sy - b.y) / b.h)) return d.item;
    }
    return null;
  }

  private alpha = new Map<HTMLImageElement, CanvasRenderingContext2D>();
  private opaqueAt(img: HTMLImageElement, u: number, v: number): boolean {
    let c = this.alpha.get(img);
    if (!c) {
      const cv = document.createElement("canvas");
      cv.width = img.width;
      cv.height = img.height;
      c = cv.getContext("2d", { willReadFrequently: true })!;
      c.drawImage(img, 0, 0);
      this.alpha.set(img, c);
    }
    const x = Math.max(0, Math.min(img.width - 1, Math.floor(u * img.width))), y = Math.max(0, Math.min(img.height - 1, Math.floor(v * img.height)));
    return c.getImageData(x, y, 1, 1).data[3]! > 40;
  }

  private tap(px: number, py: number) {
    const it = this.itemAt(px, py);
    if (it && it.action) {
      const label = ({ snack: "Open the fridge", cook: "Cook something", eatMeal: "Have a meal", tv: "Sit and watch TV", work: "Work at the computer", sleep: "Go to sleep", toilet: "Use the toilet", shower: "Take a shower", brush: "Brush your teeth", radio: "Dance to the radio", read: "Read a book", sit: "Sit down" } as Record<string, string>)[it.action] ?? "Use";
      const title = furnitureById(it.def.furniture)?.name ?? it.def.furniture;
      const kitchenTab = it.action === "snack" ? "fridge" : it.action === "cook" ? "cook" : it.action === "eatMeal" ? "eat" : null;
      const run = () => {
        this.onMenu?.(null);
        if (kitchenTab && this.onKitchen) this.onKitchen(kitchenTab);
        else this.use(it);
      };
      if (this.onMenu) this.onMenu({ x: px, y: py, title, options: [{ label, run }] });
      else run();
      return;
    }
    this.onMenu?.(null);
    const p = this.screenToWorld(px, py);
    this.walkTo(p, null);
  }

  /** Walk to a spot (or to an item, to use it). */
  walkTo(target: Point, use: Item | null): boolean {
    this.stopDoing();
    const route = findPath(this.nav, this.pos, target);
    if (!route) {
      this.setStatus("You can't get there.");
      return false;
    }
    this.path = route;
    this.pending = use;
    this.mode = this.path.length ? "walking" : "idle";
    if (!this.path.length && use) this.arrive();
    return true;
  }

  use(it: Item) {
    this.walkTo(it.approach, it);
  }

  /** Walks to the nearest thing that does this action and uses it. */
  useAction(action: string): boolean {
    let best: Item | null = null;
    let bd = Infinity;
    for (const it of this.items) {
      if (it.action !== action) continue;
      const d = Math.hypot(it.approach.x - this.pos.x, it.approach.z - this.pos.z);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    if (!best) return false;
    this.use(best);
    return true;
  }

  private setStatus(text: string | null) {
    if (this.status === text) return;
    this.status = text;
    this.onStatus?.(text);
    if (text) window.setTimeout(() => this.status === text && this.setStatus(null), 2600);
  }

  private stopDoing() {
    if (this.doing) {
      this.game?.cancel();
      this.doing = null;
    }
  }

  private arrive() {
    const it = this.pending;
    this.pending = null;
    this.mode = "idle";
    if (!it || !it.action) return;
    if (!this.game) return;
    const r = this.game.start(it.action);
    if (!r.ok) {
      this.setStatus(r.reason ?? "You can't do that right now.");
      return;
    }
    const a = this.game.active();
    const def = a ? ACTIONS[a.id] : null;
    if (!def) return;
    this.doing = { item: it, clip: def.clip, mount: it.mount, actionId: def.id };
    this.mode = "doing";
    this.clip = def.clip;
    this.clipTime = 0;
    this.yaw = it.face;
    if (it.mount) {
      const t = it.def.via ? this.items.find((x) => x.def.id === it.def.via) : null;
      const at = t ?? it;
      this.pos = { x: at.def.x, z: at.def.z };
    }
  }

  // ------------------------------------------------------------------ frame

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    this.time += dt;
    this.update(dt);
    this.render();
  };

  private update(dt: number) {
    if (this.mode === "walking") {
      const next = this.path[0];
      if (!next) {
        this.mode = "idle";
      } else {
        const dx = next.x - this.pos.x, dz = next.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        const step = WALK_SPEED * dt;
        if (d <= step) {
          this.pos = { x: next.x, z: next.z };
          this.path.shift();
          if (!this.path.length) {
            this.mode = "idle";
            if (this.pending) {
              const target = this.pending;
              this.yaw = target.face;
              this.arrive();
            }
          }
        } else {
          this.pos = { x: this.pos.x + (dx / d) * step, z: this.pos.z + (dz / d) * step };
          const want = Math.atan2(dx, dz);
          let diff = ((want - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          this.yaw += diff * Math.min(1, dt * 14);
        }
      }
    }
    // the action finished (or was cancelled): stand up where we were
    if (this.mode === "doing") {
      const a = this.game?.active();
      if (!a) {
        const it = this.doing?.item;
        this.doing = null;
        this.mode = "idle";
        if (it && it.mount) {
          this.pos = { ...it.approach };
        }
      }
    }
    const clip = this.mode === "walking" ? "Walk_Loop" : this.mode === "doing" ? (this.doing?.clip ?? "Idle_Loop") : "Idle_Loop";
    if (clip !== this.clip) {
      this.clip = clip;
      this.clipTime = 0;
    }
    this.clipTime += dt;
  }

  private charSprite(): { img: HTMLImageElement; meta: SpriteMeta } | null {
    const frames = this.charFrames.get(this.clip) ?? this.charFrames.get("Idle_Loop");
    if (!frames) return null;
    const name = this.charFrames.has(this.clip) ? this.clip : "Idle_Loop";
    let dir = dirOf(Math.sin(this.yaw), Math.cos(this.yaw));
    // clips baked in fewer directions: the nearest one
    const dirs = [...new Set(frames.map((f) => f.dir))];
    if (!dirs.includes(dir)) dir = dirs.reduce((best, d) => (Math.min((d - dir + 8) % 8, (dir - d + 8) % 8) < Math.min((best - dir + 8) % 8, (dir - best + 8) % 8) ? d : best), dirs[0]!);
    const mine = frames.filter((f) => f.dir === dir);
    const idx = Math.floor(this.clipTime * FRAME_FPS) % mine.length;
    const meta = mine.find((f) => f.frame === idx) ?? mine[0]!;
    const k = `${name}_${meta.dir}_${meta.frame}`;
    const img = this.charImgs.get(k);
    if (!img) {
      void this.loadChar(name, meta.dir, meta.frame);
      const idle = this.charImgs.get(`Idle_Loop_${dirOf(Math.sin(this.yaw), Math.cos(this.yaw))}_0`);
      const im = this.charFrames.get("Idle_Loop")?.find((f) => f.dir === dirOf(Math.sin(this.yaw), Math.cos(this.yaw)));
      return idle && im ? { img: idle, meta: im } : null;
    }
    return { img, meta };
  }

  // ------------------------------------------------------------------ drawing

  private floor(): { canvas: HTMLCanvasElement; ox: number; oy: number } {
    if (this.floorCache) return this.floorCache;
    const a = this.layout.house?.bounds ?? this.layout.area;
    const pts = [project(a.minX, 0, a.minZ), project(a.maxX, 0, a.minZ), project(a.maxX, 0, a.maxZ), project(a.minX, 0, a.maxZ)];
    const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
    const minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(maxX - minX) + 4;
    canvas.height = Math.ceil(maxY - minY) + 4;
    const c = canvas.getContext("2d")!;
    const rnd = ((seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647))(11);
    const [base, dark, light] = this.tier === "lapo" ? ["#b9ac96", "#a29480", "#cbbfa9"] : this.tier === "middle" ? ["#c9a36c", "#b58c56", "#d8b57f"] : ["#d9d2c4", "#c4bba9", "#ece6da"];
    const ox = -minX + 2, oy = -minY + 2;
    const cell = this.tier === "nepo" ? 1.0 : 0.5; // floor tiles / plank width
    for (let x = a.minX; x < a.maxX - 1e-6; x += cell) {
      for (let z = a.minZ; z < a.maxZ - 1e-6; z += 1) {
        const x2 = Math.min(a.maxX, x + cell), z2 = Math.min(a.maxZ, z + 1);
        const p = [project(x, 0, z), project(x2, 0, z), project(x2, 0, z2), project(x, 0, z2)];
        c.beginPath();
        p.forEach(([px, py], i) => (i ? c.lineTo(px + ox, py + oy) : c.moveTo(px + ox, py + oy)));
        c.closePath();
        const v = rnd();
        c.fillStyle = v < 0.33 ? dark : v < 0.66 ? base : light;
        c.fill();
        c.strokeStyle = "rgba(60,36,16,.28)";
        c.lineWidth = 1;
        c.stroke();
      }
    }
    // soft grain so it doesn't look flat
    for (let i = 0; i < 1800; i++) {
      c.fillStyle = `rgba(${rnd() < 0.5 ? "255,240,210" : "70,45,20"},${0.04 + rnd() * 0.06})`;
      c.fillRect(rnd() * canvas.width, rnd() * canvas.height, 2 + rnd() * 3, 1 + rnd() * 2);
    }
    return (this.floorCache = { canvas, ox: minX - 2, oy: minY - 2 });
  }

  private wallColour(): [string, string, string] {
    return this.tier === "lapo" ? ["#a39a7e", "#8f866b", "#c9c0a3"] : this.tier === "middle" ? ["#e5d3b0", "#cdb98f", "#f2e6cc"] : ["#efe9de", "#d9d1c1", "#faf6ee"];
  }

  private wallShape(x1: number, z1: number, x2: number, z2: number, h: number, c: CanvasRenderingContext2D, face: "south" | "east", ends: { left: boolean; right: boolean }) {
    const t = (this.layout.house?.wallThickness ?? 0.2) / 2;
    const [base, shade, top] = this.wallColour();
    // the visible face is the side towards the camera (+z for walls along x, +x for walls along z)
    const q = face === "south" ? [[x1, z1 + t], [x2, z2 + t]] : [[x1 + t, z1], [x2 + t, z2]];
    const p0 = project(q[0]![0]!, 0, q[0]![1]!), p1 = project(q[1]![0]!, 0, q[1]![1]!), p2 = project(q[1]![0]!, h, q[1]![1]!), p3 = project(q[0]![0]!, h, q[0]![1]!);
    const g = c.createLinearGradient(0, p3[1], 0, p0[1]);
    g.addColorStop(0, face === "south" ? base : shade);
    g.addColorStop(1, face === "south" ? shade : base);
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(p0[0], p0[1]);
    c.lineTo(p1[0], p1[1]);
    c.lineTo(p2[0], p2[1]);
    c.lineTo(p3[0], p3[1]);
    c.closePath();
    c.fill();
    // skirting board
    const s0 = project(q[0]![0]!, 0.14, q[0]![1]!), s1 = project(q[1]![0]!, 0.14, q[1]![1]!);
    c.fillStyle = "rgba(60,36,16,.35)";
    c.beginPath();
    c.moveTo(p0[0], p0[1]);
    c.lineTo(p1[0], p1[1]);
    c.lineTo(s1[0], s1[1]);
    c.lineTo(s0[0], s0[1]);
    c.fill();
    // the top edge
    const tq = face === "south" ? [[x1, z1 - t], [x2, z2 - t], [x2, z2 + t], [x1, z1 + t]] : [[x1 - t, z1], [x2 - t, z2], [x2 + t, z2], [x1 + t, z1]];
    c.fillStyle = top;
    c.beginPath();
    tq.forEach(([qx, qz], i) => {
      const [px, py] = project(qx!, h, qz!);
      if (i) c.lineTo(px, py);
      else c.moveTo(px, py);
    });
    c.closePath();
    c.fill();
    c.strokeStyle = "rgba(58,36,24,.8)";
    c.lineWidth = 2;
    c.beginPath();
    if (ends.left) {
      c.moveTo(p0[0], p0[1]);
      c.lineTo(p3[0], p3[1]);
    } else c.moveTo(p3[0], p3[1]);
    c.lineTo(p2[0], p2[1]);
    if (ends.right) c.lineTo(p1[0], p1[1]);
    c.stroke();
  }

  private render() {
    const c = this.ctx;
    const s = this.zoom * this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#2a2018";
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // outside the house: a painted ground
    const ground = c.createRadialGradient(this.canvas.width / 2, this.canvas.height / 2, 50, this.canvas.width / 2, this.canvas.height / 2, Math.max(this.canvas.width, this.canvas.height) * 0.7);
    ground.addColorStop(0, "#6e8a4e");
    ground.addColorStop(1, "#4a6238");
    c.fillStyle = ground;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(s, 0, 0, s, (this.w / 2 - this.cx * this.zoom) * this.dpr, (this.h / 2 - this.cy * this.zoom) * this.dpr);

    const floor = this.floor();
    c.drawImage(floor.canvas, floor.ox, floor.oy);

    // everything that stands up, sorted back to front
    const list: Drawn[] = [];
    const t = (this.layout.house?.wallThickness ?? 0.2) / 2;
    for (const wall of this.layout.walls) {
      const along = Math.abs(wall.b[0] - wall.a[0]) > Math.abs(wall.b[1] - wall.a[1]) ? "x" : "z";
      const front = wall.outward && (wall.outward[0] > 0 || wall.outward[1] > 0);
      const h = front ? CUT_WALL_H : wall.outward ? WALL_H : INNER_WALL_H;
      const len = along === "x" ? Math.abs(wall.b[0] - wall.a[0]) : Math.abs(wall.b[1] - wall.a[1]);
      const n = Math.max(1, Math.ceil(len));
      for (let i = 0; i < n; i++) {
        const f0 = i / n, f1 = (i + 1) / n;
        const x1 = wall.a[0] + (wall.b[0] - wall.a[0]) * f0, z1 = wall.a[1] + (wall.b[1] - wall.a[1]) * f0;
        const x2 = wall.a[0] + (wall.b[0] - wall.a[0]) * f1, z2 = wall.a[1] + (wall.b[1] - wall.a[1]) * f1;
        const face = along === "x" ? "south" : "east";
        const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
        list.push({ key: mx + mz + (along === "x" ? t : t), draw: (cx) => this.wallShape(Math.min(x1, x2), Math.min(z1, z2), Math.max(x1, x2), Math.max(z1, z2), h, cx, face, { left: i === 0, right: i === n - 1 }) });
      }
    }
    // windows on the back walls
    for (const wall of this.layout.walls) {
      if (!wall.outward || wall.outward[0] > 0 || wall.outward[1] > 0) continue;
      const along = Math.abs(wall.b[0] - wall.a[0]) > Math.abs(wall.b[1] - wall.a[1]);
      const len = along ? Math.abs(wall.b[0] - wall.a[0]) : Math.abs(wall.b[1] - wall.a[1]);
      const count = Math.max(1, Math.floor(len / 3.2));
      for (let i = 0; i < count; i++) {
        const f = (i + 0.5) / count;
        const wx = wall.a[0] + (wall.b[0] - wall.a[0]) * f, wz = wall.a[1] + (wall.b[1] - wall.a[1]) * f;
        list.push({ key: wx + wz + 0.3, draw: (cx) => this.window(cx, wx + (along ? 0 : t), wz + (along ? t : 0), along) });
      }
    }
    for (const it of this.items) {
      if (!it.image || !it.meta) continue;
      const m = it.meta[it.rot] as SpriteMeta | undefined;
      if (!m) continue;
      const [px, py] = project(it.def.x, it.base, it.def.z);
      const w = m.w / SPRITE_SHARP, h = m.h / SPRITE_SHARP;
      const box = { x: px - m.ax / SPRITE_SHARP, y: py - m.ay / SPRITE_SHARP, w, h };
      const { hx, hz } = this.footprint(it);
      const layer = it.def.furniture === "p_rug" || it.def.furniture === "p_doormat" ? -1000 : it.def.onTopOf ? 0.05 : 0;
      const img = it.image;
      const draw: Drawn = {
        key: layer < -1 ? -1000 : it.def.furniture === "ceiling_fan" ? 1000 : it.def.x + it.def.z + (Math.abs(hx) + Math.abs(hz)) * 0.01 + layer,
        item: it,
        img,
        box,
        draw: (cx) => {
          if (layer > -1 && it.def.furniture !== "ceiling_fan") this.shadow(cx, it.def.x, it.def.z, it.base, hx, hz);
          const lit = this.hoverItem === it;
          if (lit) cx.filter = "brightness(1.12)";
          cx.drawImage(img, box.x, box.y, box.w, box.h);
          cx.filter = "none";
        },
      };
      list.push(draw);
    }
    // the character
    const sprite = this.charSprite();
    if (sprite) {
      const mount = this.mode === "doing" ? this.doing?.mount : null;
      const lift = mount === "seat" ? 0.0 : mount === "lie" ? 0.55 : 0;
      const [px, py] = project(this.pos.x, lift, this.pos.z);
      const m = sprite.meta;
      const box = { x: px - m.ax / SPRITE_SHARP, y: py - m.ay / SPRITE_SHARP, w: m.w / SPRITE_SHARP, h: m.h / SPRITE_SHARP };
      list.push({
        key: this.pos.x + this.pos.z + 0.35,
        draw: (cx) => {
          this.shadow(cx, this.pos.x, this.pos.z, 0, 0.3, 0.3);
          cx.drawImage(sprite.img, box.x, box.y, box.w, box.h);
        },
      });
    }
    list.sort((a, b) => a.key - b.key);
    this.drawn = list;
    for (const d of list) d.draw(c);

    // evening: the room cools down and the bulbs warm up
    c.setTransform(1, 0, 0, 1, 0, 0);
    const night = this.hour < 5.5 || this.hour >= 19.3 ? 1 : this.hour < 7 ? 1 - (this.hour - 5.5) / 1.5 : this.hour >= 17.5 ? (this.hour - 17.5) / 1.8 : 0;
    if (night > 0.02) {
      c.fillStyle = `rgba(16,22,58,${0.5 * night})`;
      c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  hoverItem: Item | null = null;

  private shadow(c: CanvasRenderingContext2D, x: number, z: number, y: number, hx: number, hz: number) {
    const [px, py] = project(x, y, z);
    c.fillStyle = "rgba(30,16,6,.22)";
    c.beginPath();
    c.ellipse(px, py, (hx + hz) * HALF_W * 0.85, (hx + hz) * HALF_H * 0.85, 0, 0, Math.PI * 2);
    c.fill();
  }

  private window(c: CanvasRenderingContext2D, x: number, z: number, alongX: boolean) {
    const w = 1.1, y0 = 1.0, y1 = 2.1;
    const a = alongX ? [x - w / 2, z] : [x, z - w / 2], b = alongX ? [x + w / 2, z] : [x, z + w / 2];
    const p = [project(a[0]!, y0, a[1]!), project(b[0]!, y0, b[1]!), project(b[0]!, y1, b[1]!), project(a[0]!, y1, a[1]!)];
    const night = this.hour < 6 || this.hour >= 19;
    c.fillStyle = night ? "#2a3868" : "#bfe3f5";
    c.beginPath();
    p.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
    c.closePath();
    c.fill();
    c.strokeStyle = "#4a3320";
    c.lineWidth = 4;
    c.stroke();
    const mid = [project((a[0]! + b[0]!) / 2, y0, (a[1]! + b[1]!) / 2), project((a[0]! + b[0]!) / 2, y1, (a[1]! + b[1]!) / 2)];
    c.beginPath();
    c.moveTo(mid[0]![0], mid[0]![1]);
    c.lineTo(mid[1]![0], mid[1]![1]);
    c.stroke();
  }
}

void PX_PER_M_UP;
