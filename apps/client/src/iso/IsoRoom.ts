import { blockOutside, blockRect, createNavGrid, findPath, isFree, nearestFree, type NavGrid, type Point } from "@thelife/shared";
import { ACTIONS, furnitureById } from "@thelife/game-core";
import type { Layout, Placement } from "../play/layout";
import { propImage, propsMeta, sharpNow, spriteSharp, type PropMeta, type SpriteMeta } from "./assets";
import type { CharProvider } from "./charProvider";
import type { LiveChar } from "./livechar";
import { getSettings, subscribeSettings } from "../settings/settings";
import { HALF_H, HALF_W, PX_PER_M_UP, dirOf, project, unproject } from "./projection";

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

type Mode = "idle" | "walking" | "doing" | "moving";

interface Puff {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  kind: "dust" | "steam" | "drop" | "note" | "z" | "spark";
}
interface Ripple {
  x: number;
  z: number;
  age: number;
}
/** A short move that has its own animation: sitting down, getting up, lying back. */
interface Move {
  kind: "enter" | "exit";
  t: number;
  dur: number;
  from: Point;
  to: Point;
  fromLift: number;
  toLift: number;
  item: Item;
  clip: string;
}

const SEAT_ACTIONS = new Set(["eatMeal", "tv", "work", "sit", "toilet"]);

const ease = (t: number) => t * t * (3 - 2 * t);

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
  private char!: CharProvider;
  /** When set, the character is drawn live from the 3D model (sharp at any size, any direction) instead of from baked pictures. */
  live: LiveChar | null = null;
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
  private puffs: Puff[] = [];
  private ripples: Ripple[] = [];
  private move: Move | null = null;
  private lift = 0;
  private stride = 0;
  /** The arrival: the room paints itself in around the doorway while the character walks in. */
  private intro: { t: number; dur: number; quick: boolean; door: Point } | null = null;
  introDone?: () => void;
  private reveal = 1;
  onStatus?: (text: string | null) => void;
  onMenu?: (menu: { x: number; y: number; title: string; options: { label: string; run(): void }[] } | null) => void;
  onKitchen?: (tab: "fridge" | "cook" | "eat") => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private layout: Layout,
    private readonly tier: Tier,
    private readonly game: IsoGame | null,
    char: CharProvider,
  ) {
    this.char = char;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.pos = { x: layout.start.x, z: layout.start.z };
    this.yaw = layout.start.yaw;
  }

  // ------------------------------------------------------------------ loading

  async load(): Promise<void> {
    await spriteSharp();
    await this.rebuildItems();
    await this.learnSizes();
    if (!this.live) await this.preloadChar();
    this.fit();
  }

  /** Swaps in a changed layout (after furniture was moved, bought or sold) without reloading the room. */
  async setLayout(layout: Layout): Promise<void> {
    this.layout = layout;
    const keep = this.selected?.def.id ?? null;
    this.selected = null;
    this.dragging = false;
    await this.rebuildItems();
    this.floorCache = null;
    if (!isFree(this.nav, this.pos.x, this.pos.z)) this.pos = nearestFree(this.nav, this.pos.x, this.pos.z, 3) ?? { x: layout.start.x, z: layout.start.z };
    if (keep) this.select(this.items.find((i) => i.def.id === keep) ?? null);
  }

  private async rebuildItems(): Promise<void> {
    const props = await propsMeta();
    // (the character is a paper doll of sprite layers; see paperdoll.ts)
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
    this.nav = this.makeNav(items);
    for (const it of items) this.deriveUse(it, byId);
  }

  private async preloadChar() {
    // standing, walking, sitting down and getting up first; the rest while you play
    await this.char.prepare(["Idle_Loop", "Walk_Loop", "Sitting_Enter", "Sitting_Exit"]);
    // one at a time, so playing never stutters while they are put together
    void (async () => {
      for (const c of ["Sitting_Idle_Loop", "Life_Cook_Loop", "Life_Eat_Loop", "Life_Sleep_Loop", "Life_Type_Loop", "Life_Brush_Loop", "Life_Wash_Loop", "Life_Read_Loop", "Life_Eat_Standing_Loop"]) {
        await this.char.prepare([c]).catch(() => undefined);
        await new Promise((r) => setTimeout(r, 250));
      }
    })();
  }

  // ------------------------------------------------------------------ the floor plan: walking and using things

  private footprint(it: Item): { hx: number; hz: number } {
    const [sx, , sz] = it.size;
    const quarter = it.rot % 2 === 1;
    return { hx: (quarter ? sz : sx) / 2, hz: (quarter ? sx : sz) / 2 };
  }

  private makeNav(items: Item[]): NavGrid {
    const nav = createNavGrid(this.layout.area, NAV_CELL);
    blockOutside(nav, this.layout.area, 0.4);
    const t = (this.layout.house?.wallThickness ?? 0.2) / 2;
    for (const w of this.layout.walls) {
      blockRect(nav, { minX: Math.min(w.a[0], w.b[0]) - t, maxX: Math.max(w.a[0], w.b[0]) + t, minZ: Math.min(w.a[1], w.b[1]) - t, maxZ: Math.max(w.a[1], w.b[1]) + t }, CHAR_RADIUS);
    }
    for (const it of items) {
      if (it.def.onTopOf || it.def.y) continue; // on a shelf or the ceiling
      if (it.def.furniture === "p_rug" || it.def.furniture === "p_doormat" || it.def.furniture === "ceiling_fan") continue;
      const { hx, hz } = this.footprint(it);
      // chairs and beds can be sat on and slept on, so they are not walls; but leave them closed so nobody walks through them
      blockRect(nav, { minX: it.def.x - hx, maxX: it.def.x + hx, minZ: it.def.z - hz, maxZ: it.def.z + hz }, CHAR_RADIUS * 0.6);
    }
    return nav;
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
    const roomW = Math.max(...xs) - Math.min(...xs) + 180, roomH = Math.max(...ys) - Math.min(...ys) + 220;
    this.portrait = this.h > this.w * 1.1;
    this.bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    // On a tall phone screen the whole room would be tiny: come in closer and let the camera follow you instead.
    this.zoom = Math.min(this.w / roomW, this.h / roomH) * (this.portrait ? 1.6 : 1);
    this.fitCx = this.cx;
    this.fitCy = this.cy;
    this.fitZoom = this.zoom;
  }

  resize() {
    const st = getSettings();
    // the player's resolution setting is the highest pixel ratio the picture is drawn at; the automatic adjustment only ever lowers it
    this.dpr = Math.min(window.devicePixelRatio || 1, st.resolution) * (st.autoAdjust ? this.quality : 1);
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
      if (this.editing && this.selected && this.pointers.size === 1 && this.editItemAt(e.offsetX, e.offsetY) === this.selected) this.beginDrag(this.selected);
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
        if (this.dragging) {
          if (this.dragged) this.dragTo(e.offsetX, e.offsetY);
        } else if (this.dragged) {
          this.lastTouch = this.clock;
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
      if (this.dragging) this.endDrag();
      else if (had && this.pointers.size === 0 && !this.dragged) this.tap(e.offsetX, e.offsetY);
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
    const offSettings = subscribeSettings(() => this.resize()); // the picture changes size the moment the resolution setting does
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
    return () => {
      cancelAnimationFrame(this.raf);
      offSettings();
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
    if (this.intro) return this.skipIntro();
    if (this.editing) return this.editTap(px, py);
    if (this.move) return;
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
    if (this.walkTo(p, null)) this.ripples.push({ x: p.x, z: p.z, age: 0 });
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
    this.yaw = it.face;
    const target = it.def.via ? (this.items.find((x) => x.def.id === it.def.via) ?? it) : it;
    this.doing = { item: it, clip: def.clip, mount: it.mount, actionId: def.id };
    if (it.mount === "seat" || it.mount === "lie") {
      // sit down (or hop onto the bed) with a proper animation, then carry on with the action
      const lie = it.mount === "lie";
      this.move = { kind: "enter", t: 0, dur: lie ? 0.9 : 0.95, from: { ...this.pos }, to: { x: target.def.x, z: target.def.z }, fromLift: 0, toLift: lie ? 0.55 : 0, item: it, clip: "Sitting_Enter" };
      this.mode = "moving";
      this.clip = "Sitting_Enter";
      this.clipTime = 0;
    } else {
      this.mode = "doing";
      this.clip = def.clip;
      this.clipTime = 0;
      if (it.mount === "enter") this.pos = { x: target.def.x, z: target.def.z };
    }
  }

  // ------------------------------------------------------------------ editing the home

  /** Is the home being rearranged? Taps then pick furniture instead of walking. */
  editing = false;
  private selected: Item | null = null;
  private dragging = false;
  private dragFrom: { def: Placement; kids: { it: Item; def: Placement }[] } | null = null;
  private dragValid = true;
  /** Tells the page what is selected (null = nothing) so it can show its buttons. */
  onSelect?: (info: { id: string; furniture: string; name: string; bought: boolean; price: number } | null) => void;
  /** Asks the page to make a change real: it runs the game rules, then hands the new layout back through setLayout. */
  onEditChange?: (c: { kind: "move"; id: string; x: number; z: number; rot: number; /** The piece is already shown in its new place: no need to rebuild the room straight away. */ quiet?: boolean } | { kind: "sell"; id: string; furniture: string; bought: boolean }) => void;

  startEdit(): void {
    this.stopDoing();
    this.path = [];
    this.pending = null;
    this.mode = "idle";
    this.editing = true;
  }

  stopEdit(): void {
    this.editing = false;
    this.select(null);
  }

  private movable(it: Item): boolean {
    return !!it.meta && !it.def.y && !it.def.onTopOf && it.def.furniture !== "ceiling_fan" && it.def.furniture !== "caged_hanging_light";
  }

  select(it: Item | null): void {
    this.selected = it && this.movable(it) ? it : null;
    const sel = this.selected;
    this.onSelect?.(sel ? { id: sel.def.id, furniture: sel.def.furniture, name: furnitureById(sel.def.furniture)?.name ?? sel.def.furniture, bought: /^n\d+$/.test(sel.def.id), price: furnitureById(sel.def.furniture)?.price ?? 0 } : null);
  }

  /** Selects a piece by its id (after it was bought, say). */
  selectId(id: string): void {
    this.select(this.items.find((i) => i.def.id === id) ?? null);
  }

  private editItemAt(px: number, py: number): Item | null {
    const sx = (px - this.w / 2) / this.zoom + this.cx, sy = (py - this.h / 2) / this.zoom + this.cy;
    for (let i = this.drawn.length - 1; i >= 0; i--) {
      const d = this.drawn[i]!;
      if (!d.item || !d.box || !d.img || !this.movable(d.item)) continue;
      const b = d.box;
      if (sx < b.x || sx > b.x + b.w || sy < b.y || sy > b.y + b.h) continue;
      if (this.opaqueAt(d.img, (sx - b.x) / b.w, (sy - b.y) / b.h)) return d.item;
    }
    return null;
  }

  private static readonly FLAT = new Set(["p_rug", "p_doormat"]);
  private static snap = (v: number) => Math.round(v * 4) / 4;

  /** Can a piece of this footprint stand here? Inside the walls, off the walls, clear of other furniture and not shutting the door in. */
  private fits(self: Item | null, x: number, z: number, rotQ: number, size: [number, number, number], furniture: string, ignore: Set<Item>): boolean {
    const quarter = rotQ % 2 === 1;
    const hx = (quarter ? size[2] : size[0]) / 2, hz = (quarter ? size[0] : size[2]) / 2;
    const r = { minX: x - hx + 0.03, maxX: x + hx - 0.03, minZ: z - hz + 0.03, maxZ: z + hz - 0.03 };
    const b = this.layout.house?.bounds ?? this.layout.area;
    const t = (this.layout.house?.wallThickness ?? 0.2) / 2;
    if (r.minX < b.minX + t || r.maxX > b.maxX - t || r.minZ < b.minZ + t || r.maxZ > b.maxZ - t) return false;
    const hit = (a: { minX: number; maxX: number; minZ: number; maxZ: number }) => r.minX < a.maxX && r.maxX > a.minX && r.minZ < a.maxZ && r.maxZ > a.minZ;
    for (const w of this.layout.walls) {
      if (hit({ minX: Math.min(w.a[0], w.b[0]) - t, maxX: Math.max(w.a[0], w.b[0]) + t, minZ: Math.min(w.a[1], w.b[1]) - t, maxZ: Math.max(w.a[1], w.b[1]) + t })) return false;
    }
    const flat = IsoRoom.FLAT.has(furniture);
    const tentative: Item[] = [];
    for (const o of this.items) {
      if (o === self || ignore.has(o)) continue;
      tentative.push(o);
      if (flat || o.def.onTopOf || o.def.y || IsoRoom.FLAT.has(o.def.furniture) || o.def.furniture === "ceiling_fan") continue;
      const f = this.footprint(o);
      if (hit({ minX: o.def.x - f.hx, maxX: o.def.x + f.hx, minZ: o.def.z - f.hz, maxZ: o.def.z + f.hz })) return false;
    }
    if (flat) return true;
    // never wall yourself in: the door must stay reachable from where the character starts
    const probe: Item = { def: { id: "_probe", furniture, x, z, rot: rotQ * 90 }, action: undefined, size, rot: rotQ, meta: null, image: null, base: 0, approach: { x, z }, face: 0, mount: null };
    const nav = this.makeNav([...tentative, probe]);
    const door = this.doorPoint();
    const inside = { x: door.x, z: door.z - 0.6 };
    const start = nearestFree(nav, this.layout.start.x, this.layout.start.z, 1.5);
    const gate = nearestFree(nav, inside.x, inside.z, 1.5);
    return !!start && !!gate && !!findPath(nav, start, gate);
  }

  private fitsItem(it: Item, x: number, z: number, rotQ: number): boolean {
    const kids = new Set(this.items.filter((o) => o.def.onTopOf === it.def.id));
    return this.fits(it, x, z, rotQ, it.size, it.def.furniture, kids);
  }

  /** The nearest free spot to the middle of the house for something new, or null if there isn't one. */
  findSpotFor(furniture: string): { x: number; z: number } | null {
    const size = (this.propSize(furniture)) ?? [0.8, 0.8, 0.8];
    const b = this.layout.house?.bounds ?? this.layout.area;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const cands: { x: number; z: number; d: number }[] = [];
    for (let x = b.minX; x <= b.maxX; x += 0.25) for (let z = b.minZ; z <= b.maxZ; z += 0.25) cands.push({ x, z, d: Math.hypot(x - cx, z - cz) });
    cands.sort((p, q) => p.d - q.d);
    for (const c of cands) if (this.fits(null, c.x, c.z, 0, size, furniture, new Set())) return { x: c.x, z: c.z };
    return null;
  }

  private propSizes = new Map<string, [number, number, number]>();
  private propSize(furniture: string): [number, number, number] | null {
    return this.propSizes.get(furniture) ?? null;
  }
  /** Remembers the sizes of the catalogue's pieces, so the room can check where a new one fits. */
  async learnSizes(): Promise<void> {
    const props = await propsMeta();
    for (const [id, m] of Object.entries(props)) if (m.size) this.propSizes.set(id, m.size);
  }

  private beginDrag(it: Item): void {
    const kids = this.items.filter((o) => o.def.onTopOf === it.def.id).map((o) => ({ it: o, def: o.def }));
    this.dragFrom = { def: it.def, kids };
    this.dragging = true;
    this.dragValid = true;
  }

  private dragTo(px: number, py: number): void {
    const it = this.selected, from = this.dragFrom;
    if (!it || !from) return;
    const p = this.screenToWorld(px, py);
    const x = IsoRoom.snap(p.x), z = IsoRoom.snap(p.z);
    const dx = x - from.def.x, dz = z - from.def.z;
    it.def = { ...from.def, x, z };
    for (const k of from.kids) k.it.def = { ...k.def, x: k.def.x + dx, z: k.def.z + dz };
    this.dragValid = this.fitsItem(it, x, z, it.rot);
  }

  private endDrag(): void {
    const it = this.selected, from = this.dragFrom;
    this.dragging = false;
    this.dragFrom = null;
    if (!it || !from) return;
    const moved = it.def.x !== from.def.x || it.def.z !== from.def.z;
    if (moved && this.dragValid) {
      this.onEditChange?.({ kind: "move", id: it.def.id, x: it.def.x, z: it.def.z, rot: it.rot * 90 });
      return;
    }
    // it doesn't fit there: back to where it was
    it.def = from.def;
    for (const k of from.kids) k.it.def = k.def;
    if (moved) this.setStatus("That doesn't fit there.");
  }

  rotateSelected(): void {
    const it = this.selected;
    if (!it) return;
    const q = (it.rot + 1) % 4;
    if (!this.fitsItem(it, it.def.x, it.def.z, q)) return this.setStatus("There isn't room to turn it.");
    this.onEditChange?.({ kind: "move", id: it.def.id, x: it.def.x, z: it.def.z, rot: q * 90 });
  }

  /** Moves the picked-up piece one step the way an arrow points on the screen (sx: 1 right, -1 left; sy: 1 up, -1 down). */
  nudgeSelected(sx: number, sy: number): void {
    const it = this.selected;
    if (!it) return;
    const step = 0.5;
    // on this slanted view "right" is +x and -z together, "up" is -x and -z together
    const dx = (sx - sy) * step, dz = (-sx - sy) * step;
    const x = IsoRoom.snap(it.def.x + dx), z = IsoRoom.snap(it.def.z + dz);
    if (!this.fitsItem(it, x, z, it.rot)) return this.setStatus("Something is in the way.");
    // show it at once; the saved layout catches up a moment later
    const kids = this.items.filter((o) => o.def.onTopOf === it.def.id);
    for (const k of kids) k.def = { ...k.def, x: k.def.x + (x - it.def.x), z: k.def.z + (z - it.def.z) };
    it.def = { ...it.def, x, z };
    this.onEditChange?.({ kind: "move", id: it.def.id, x, z, rot: it.rot * 90, quiet: true });
  }

  sellSelected(): void {
    const it = this.selected;
    if (!it) return;
    this.onEditChange?.({ kind: "sell", id: it.def.id, furniture: it.def.furniture, bought: /^n\d+$/.test(it.def.id) });
  }

  private editTap(px: number, py: number): void {
    const hit = this.editItemAt(px, py);
    if (hit) return this.select(hit === this.selected ? null : hit);
    const it = this.selected;
    if (!it) return;
    // tapping the floor sends the selected piece there
    const p = this.screenToWorld(px, py);
    const x = IsoRoom.snap(p.x), z = IsoRoom.snap(p.z);
    if (!this.fitsItem(it, x, z, it.rot)) return this.setStatus("That doesn't fit there.");
    this.onEditChange?.({ kind: "move", id: it.def.id, x, z, rot: it.rot * 90 });
  }

  /** The glow on the floor under the selected piece: green where it fits, red where it doesn't. */
  private footprintGlow(c: CanvasRenderingContext2D, it: Item): void {
    const { hx, hz } = this.footprint(it);
    const pts = [project(it.def.x - hx, 0, it.def.z - hz), project(it.def.x + hx, 0, it.def.z - hz), project(it.def.x + hx, 0, it.def.z + hz), project(it.def.x - hx, 0, it.def.z + hz)];
    c.save();
    c.beginPath();
    pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])));
    c.closePath();
    const ok = !this.dragging || this.dragValid;
    c.fillStyle = ok ? "rgba(110,225,150,.34)" : "rgba(235,90,80,.4)";
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = ok ? "rgba(150,255,185,.95)" : "rgba(255,130,120,.95)";
    c.setLineDash([9, 6]);
    c.lineDashOffset = -this.time * 22;
    c.stroke();
    c.restore();
  }

  // ------------------------------------------------------------------ frame

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const cap = getSettings().fpsCap;
    if (cap && this.last && now - this.last < 1000 / cap - 3) return; // a lower frame rate limit saves battery and heat
    const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    this.time += dt;
    this.update(dt);
    this.render();
    this.adapt(dt);
  };

  /**
   * Keeps the game responsive on slow phones: if frames take too long the picture is drawn at a lower resolution (the sprites are baked
   * sharper than a phone needs), and it climbs back when there is room to spare.
   */
  private quality = 1;
  private slow = 0;
  private fast = 0;
  private adapt(dt: number) {
    if (!getSettings().autoAdjust) {
      this.slow = 0;
      this.fast = 0;
      if (this.quality !== 1) {
        this.quality = 1;
        this.resize();
      }
      return;
    }
    // only a really slow frame counts (under about 20 fps), and never below 70%: a soft picture is worse than a slightly slow one
    const target = getSettings().fpsCap;
    if (dt > (target && target <= 30 ? 0.07 : 0.05)) {
      this.slow += dt;
      this.fast = 0;
    } else if (dt < 0.02) {
      this.fast += dt;
      this.slow = Math.max(0, this.slow - dt);
    }
    if (this.slow > 1.5 && this.quality > 0.7) {
      this.quality = Math.max(0.7, this.quality - 0.15);
      this.slow = 0;
      this.resize();
    } else if (this.fast > 6 && this.quality < 1) {
      this.quality = Math.min(1, this.quality + 0.15);
      this.fast = 0;
      this.resize();
    }
  }

  /** Starts the arrival. `quick` is for someone coming back (the room is already theirs). */
  playIntro(quick = false): void {
    const door = this.doorPoint();
    this.intro = { t: 0, dur: quick ? 1.6 : 3.4, quick, door };
    this.pos = quick ? { ...this.pos } : { x: door.x, z: door.z + 2.4 };
    this.yaw = Math.PI; // facing north, into the room
    this.mode = "idle";
  }

  skipIntro(): void {
    if (!this.intro) return;
    this.intro = null;
    this.reveal = 1;
    this.mode = "idle";
    this.pos = { x: this.layout.start.x, z: this.layout.start.z };
    this.fit();
    this.introDone?.();
  }

  get introPlaying(): boolean {
    return this.intro !== null;
  }

  /** The middle of the doorway in the south wall. */
  private doorPoint(): Point {
    const wall = this.layout.walls.filter((w) => w.outward && w.outward[1] > 0).sort((p, q) => Math.min(p.a[0], p.b[0]) - Math.min(q.a[0], q.b[0]));
    if (wall.length >= 2) {
      const left = wall[0]!, right = wall[1]!;
      const x0 = Math.max(left.a[0], left.b[0]), x1 = Math.min(right.a[0], right.b[0]);
      return { x: (x0 + x1) / 2, z: left.a[1] };
    }
    const b = this.layout.house?.bounds ?? this.layout.area;
    return { x: (b.minX + b.maxX) / 2, z: b.maxZ };
  }

  private burst(x: number, z: number, y: number, kind: Puff["kind"], n: number, spread = 0.3) {
    for (let i = 0; i < n; i++) {
      this.puffs.push({ x: x + (Math.random() - 0.5) * spread, y, z: z + (Math.random() - 0.5) * spread, vx: (Math.random() - 0.5) * 0.5, vy: 0.3 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 0.5, age: 0, life: 0.8 + Math.random() * 0.9, size: 0.06 + Math.random() * 0.08, kind });
    }
  }

  private update(dt: number) {
    // ---- the arrival
    if (this.intro) {
      const it = this.intro;
      it.t += dt;
      const p = Math.min(1, it.t / it.dur);
      this.reveal = it.quick ? ease(Math.min(1, it.t / 0.9)) : ease(Math.min(1, it.t / 1.5));
      if (!it.quick) {
        // the character walks in from the porch
        const walkStart = 1.1, walkEnd = 2.7;
        const wp = Math.max(0, Math.min(1, (it.t - walkStart) / (walkEnd - walkStart)));
        const startPos = { x: it.door.x, z: it.door.z + 2.4 };
        const end = { x: this.layout.start.x, z: this.layout.start.z };
        // straight through the door, then across to the start spot
        const mid = { x: it.door.x, z: it.door.z - 1.1 };
        const q = wp < 0.55 ? wp / 0.55 : (wp - 0.55) / 0.45;
        const from = wp < 0.55 ? startPos : mid, to = wp < 0.55 ? mid : end;
        this.pos = { x: from.x + (to.x - from.x) * q, z: from.z + (to.z - from.z) * q };
        const dx = to.x - from.x, dz = to.z - from.z;
        if (Math.hypot(dx, dz) > 0.01) this.yaw = Math.atan2(dx, dz);
        this.mode = wp > 0 && wp < 1 ? "walking" : "idle";
        if (wp === 0) this.yaw = Math.PI;
      }
      // the camera starts close to the door and settles back on the whole room
      if (p >= 1) {
        this.intro = null;
        this.reveal = 1;
        this.mode = "idle";
        this.introDone?.();
      }
    }
    // ---- walking
    if (this.mode === "walking" && !this.intro) {
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
          const diff = ((want - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          this.yaw += diff * Math.min(1, dt * 14);
        }
      }
    }
    // little puffs of dust on every other footstep
    if (this.mode === "walking") {
      const before = Math.floor(this.stride);
      this.stride += dt * 2.6;
      if (Math.floor(this.stride) !== before) this.burst(this.pos.x, this.pos.z, 0.02, "dust", 2, 0.12);
    }
    // ---- sitting down / getting up: the character glides to the seat while the animation plays
    if (this.move) {
      const m = this.move;
      m.t += dt;
      const k = Math.min(1, m.t / m.dur);
      const e = ease(k);
      this.pos = { x: m.from.x + (m.to.x - m.from.x) * e, z: m.from.z + (m.to.z - m.from.z) * e };
      this.lift = m.fromLift + (m.toLift - m.fromLift) * e + (m.kind === "enter" ? Math.sin(k * Math.PI) * 0.08 : 0);
      if (k >= 1) {
        this.move = null;
        if (m.kind === "enter") {
          this.mode = "doing";
          this.clip = this.doing?.clip ?? "Idle_Loop";
          this.clipTime = 0;
        } else {
          this.mode = "idle";
          this.lift = 0;
          this.clip = "Idle_Loop";
          this.clipTime = 0;
        }
      }
    }
    // ---- the action finished (or was cancelled): stand up where we sat
    if (this.mode === "doing") {
      const a = this.game?.active();
      if (!a) {
        const it = this.doing?.item;
        this.doing = null;
        if (it && (it.mount === "seat" || it.mount === "lie")) {
          this.move = { kind: "exit", t: 0, dur: 0.8, from: { ...this.pos }, to: { ...it.approach }, fromLift: this.lift, toLift: 0, item: it, clip: "Sitting_Exit" };
          this.mode = "moving";
          this.clip = "Sitting_Exit";
          this.clipTime = 0;
        } else {
          if (it && it.mount === "enter") this.pos = { ...it.approach };
          this.mode = "idle";
          this.lift = 0;
        }
      }
    }
    // emotes and effects while doing something
    if (this.mode === "doing" && this.doing) this.effects(dt);
    const wantClip = this.mode === "walking" ? "Walk_Loop" : this.mode === "doing" ? (this.doing?.clip ?? "Idle_Loop") : this.mode === "moving" ? (this.move?.clip ?? "Idle_Loop") : "Idle_Loop";
    if (wantClip !== this.clip) {
      this.clip = wantClip;
      this.clipTime = 0;
    }
    this.clipTime += dt;
    if (this.live?.ready) {
      if (this.move && (wantClip === "Sitting_Enter" || wantClip === "Sitting_Exit")) this.live.scrub(wantClip, Math.min(1, this.move.t / this.move.dur));
      else {
        this.live.play(wantClip);
        this.live.tick(dt);
      }
    }
    // particles
    for (const p of this.puffs) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.kind === "dust") p.vy *= 0.94;
    }
    this.puffs = this.puffs.filter((p) => p.age < p.life);
    for (const r of this.ripples) r.age += dt;
    this.ripples = this.ripples.filter((r) => r.age < 0.9);
    // the camera settles during the arrival
    if (this.intro) {
      const door = project(this.intro.door.x, 0.6, this.intro.door.z);
      const k = ease(Math.min(1, this.intro.t / (this.intro.quick ? 1.2 : 3.0)));
      const from = this.intro.quick ? 1 : 1.55;
      this.cx = door[0] * (1 - k) + this.fitCx * k;
      this.cy = door[1] * (1 - k) + this.fitCy * k;
      this.zoom = this.fitZoom * (from * (1 - k) + k);
    } else if (this.portrait && this.pointers.size === 0 && this.clock - this.lastTouch > 3) {
      const [fx, fy] = project(this.pos.x, 0.9, this.pos.z);
      const b = this.bounds, hw = this.w / 2 / this.zoom, hh = this.h / 2 / this.zoom;
      const clamp = (v: number, lo: number, hi: number, mid: number) => (lo > hi ? mid : Math.max(lo, Math.min(hi, v)));
      const tx = clamp(fx, b.minX + hw - 60, b.maxX - hw + 60, this.fitCx);
      const ty = clamp(fy, b.minY + hh - 60, b.maxY - hh + 60, this.fitCy);
      const k = 1 - Math.exp(-dt * 2.5);
      this.cx += (tx - this.cx) * k;
      this.cy += (ty - this.cy) * k;
    }
    this.clock += dt;
  }

  private emitAt = 0;
  private effects(dt: number) {
    const d = this.doing!;
    this.emitAt -= dt;
    if (this.emitAt > 0) return;
    const target = d.item.def.via ? (this.items.find((x) => x.def.id === d.item.def.via) ?? d.item) : d.item;
    switch (d.actionId) {
      case "sleep":
        this.emitAt = 0.9;
        this.puffs.push({ x: this.pos.x, y: 1.0, z: this.pos.z, vx: 0.1, vy: 0.25, vz: -0.1, age: 0, life: 2.2, size: 0.18, kind: "z" });
        break;
      case "cook":
      case "cookQuick": {
        this.emitAt = 0.12;
        const stove = this.items.find((i) => i.def.furniture === "electric_stove");
        if (stove) this.burst(stove.def.x, stove.def.z, stove.base + stove.size[1] + 0.1, "steam", 1, 0.2);
        break;
      }
      case "shower":
        this.emitAt = 0.05;
        this.burst(target.def.x, target.def.z, 1.9, "drop", 2, 0.4);
        break;
      case "radio":
        this.emitAt = 0.6;
        this.puffs.push({ x: this.pos.x, y: 1.9, z: this.pos.z, vx: (Math.random() - 0.5) * 0.4, vy: 0.5, vz: 0, age: 0, life: 1.6, size: 0.2, kind: "note" });
        break;
      case "eatMeal":
      case "eatDish":
        this.emitAt = 0.9;
        this.burst(this.pos.x, this.pos.z, 1.2, "spark", 1, 0.3);
        break;
      default:
        this.emitAt = 0.5;
    }
  }

  private portrait = false;
  private bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  private lastTouch = -10;
  private clock = 0;
  private fitCx = 0;
  private fitCy = 0;
  private fitZoom = 1;

  private charSprite(): { img: CanvasImageSource; meta: SpriteMeta; live?: boolean } | null {
    if (this.live?.ready) {
      const f = this.live.draw(this.yaw, this.zoom * this.dpr);
      return f ? { img: f.img, meta: f, live: true } : null;
    }
    const want = this.char.ready(this.clip) ? this.clip : "Idle_Loop";
    if (want !== this.clip) this.char.ensure(this.clip);
    let dir = dirOf(Math.sin(this.yaw), Math.cos(this.yaw));
    // animations made in fewer directions use the nearest one
    const dirs = this.char.dirs(want);
    if (!dirs.length) return null;
    if (!dirs.includes(dir)) dir = dirs.reduce((best, d) => (Math.min((d - dir + 8) % 8, (dir - d + 8) % 8) < Math.min((best - dir + 8) % 8, (dir - best + 8) % 8) ? d : best), dirs[0]!);
    const n = this.char.count(want, dir);
    if (!n) return null;
    let idx: number;
    if (this.move && want === this.clip && (want === "Sitting_Enter" || want === "Sitting_Exit")) {
      const k = Math.min(1, this.move.t / this.move.dur);
      idx = Math.min(n - 1, Math.round(k * (n - 1)));
    } else {
      const fps = want === "Idle_Loop" ? 5 : want === "Walk_Loop" ? 10 : FRAME_FPS;
      idx = Math.floor(this.clipTime * fps) % n;
    }
    const f = this.char.frame(want, dir, idx);
    return f ? { img: f.img, meta: f } : null;
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
        c.strokeStyle = "rgba(14, 26, 54,.28)";
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
    c.fillStyle = "rgba(14, 26, 54,.35)";
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

  private layer: HTMLCanvasElement | null = null;

  private render() {
    const main = this.ctx;
    const intro = this.reveal < 1;
    let c = main;
    if (intro) {
      if (!this.layer || this.layer.width !== this.canvas.width || this.layer.height !== this.canvas.height) {
        this.layer = document.createElement("canvas");
        this.layer.width = this.canvas.width;
        this.layer.height = this.canvas.height;
      }
      c = this.layer.getContext("2d")!;
      c.clearRect(0, 0, this.layer.width, this.layer.height);
    }
    this.paint(c);
    if (intro && this.layer) {
      // the room is painted in outwards from the doorway, with a soft brush edge
      const door = this.intro?.door ?? this.doorPoint();
      const [sx, sy] = project(door.x, 0, door.z);
      const px = ((sx - this.cx) * this.zoom + this.w / 2) * this.dpr, py = ((sy - this.cy) * this.zoom + this.h / 2) * this.dpr;
      const r = Math.hypot(this.canvas.width, this.canvas.height) * 1.1 * this.reveal + 40;
      const lc = this.layer.getContext("2d")!;
      lc.setTransform(1, 0, 0, 1, 0, 0);
      lc.globalCompositeOperation = "destination-in";
      const g = lc.createRadialGradient(px, py, Math.max(0, r * 0.55), px, py, r);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      lc.fillStyle = g;
      lc.fillRect(0, 0, this.layer.width, this.layer.height);
      lc.globalCompositeOperation = "source-over";
      main.setTransform(1, 0, 0, 1, 0, 0);
      main.drawImage(this.layer, 0, 0);
    }
  }

  private paint(c: CanvasRenderingContext2D) {
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    const s = this.zoom * this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    // outside the house: painted ground
    const ground = c.createRadialGradient(this.canvas.width / 2, this.canvas.height / 2, 50, this.canvas.width / 2, this.canvas.height / 2, Math.max(this.canvas.width, this.canvas.height) * 0.7);
    ground.addColorStop(0, "#7a9556");
    ground.addColorStop(1, "#4c6439");
    c.fillStyle = ground;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(s, 0, 0, s, (this.w / 2 - this.cx * this.zoom) * this.dpr, (this.h / 2 - this.cy * this.zoom) * this.dpr);

    this.porch(c);
    const floor = this.floor();
    c.drawImage(floor.canvas, floor.ox, floor.oy);
    this.lightPatches(c);

    const t = (this.layout.house?.wallThickness ?? 0.2) / 2;
    const introT = this.intro ? this.intro.t : 99;
    const rise = this.intro ? ease(Math.min(1, Math.max(0, (introT - 0.15) / 1.0))) : 1;
    const door = this.intro?.door ?? this.doorPoint();
    const list: Drawn[] = [];
    for (const wall of this.layout.walls) {
      const along = Math.abs(wall.b[0] - wall.a[0]) > Math.abs(wall.b[1] - wall.a[1]) ? "x" : "z";
      const front = wall.outward && (wall.outward[0] > 0 || wall.outward[1] > 0);
      const h = (front ? CUT_WALL_H : wall.outward ? WALL_H : INNER_WALL_H) * rise;
      const len = along === "x" ? Math.abs(wall.b[0] - wall.a[0]) : Math.abs(wall.b[1] - wall.a[1]);
      const n = Math.max(1, Math.ceil(len));
      for (let i = 0; i < n; i++) {
        const f0 = i / n, f1 = (i + 1) / n;
        const x1 = wall.a[0] + (wall.b[0] - wall.a[0]) * f0, z1 = wall.a[1] + (wall.b[1] - wall.a[1]) * f0;
        const x2 = wall.a[0] + (wall.b[0] - wall.a[0]) * f1, z2 = wall.a[1] + (wall.b[1] - wall.a[1]) * f1;
        const face = along === "x" ? "south" : "east";
        const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
        if (h > 0.01) list.push({ key: mx + mz + t, draw: (cx) => this.wallShape(Math.min(x1, x2), Math.min(z1, z2), Math.max(x1, x2), Math.max(z1, z2), h, cx, face, { left: i === 0, right: i === n - 1 }) });
      }
    }
    if (rise > 0.9) {
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
    }
    // furniture: it drops in around the doorway, nearest first, with a little squash
    for (const it of this.items) {
      if (!it.image || !it.meta) continue;
      const m = it.meta[it.rot] as SpriteMeta | undefined;
      if (!m) continue;
      let pop = 1;
      if (this.intro) {
        const dist = Math.hypot(it.def.x - door.x, it.def.z - door.z);
        const quick = this.intro.quick;
        const start = (quick ? 0.1 : 0.7) + dist * (quick ? 0.03 : 0.07);
        pop = Math.max(0, Math.min(1, (introT - start) / (quick ? 0.35 : 0.5)));
        if (pop <= 0) continue;
      }
      const [px, py] = project(it.def.x, it.base, it.def.z);
      const w = m.w / sharpNow.props, h = m.h / sharpNow.props;
      const box = { x: px - m.ax / sharpNow.props, y: py - m.ay / sharpNow.props, w, h };
      const { hx, hz } = this.footprint(it);
      const layer = it.def.furniture === "p_rug" || it.def.furniture === "p_doormat" ? -1000 : it.def.onTopOf ? 0.05 : 0;
      const img = it.image;
      const ceiling = it.def.furniture === "ceiling_fan";
      if (ceiling) {
        list.push({ key: -500, draw: (cx) => this.fanShadow(cx, it) });
        continue;
      }
      const draw: Drawn = {
        key: layer < -1 ? -1000 : ceiling ? 1000 : it.def.x + it.def.z + (Math.abs(hx) + Math.abs(hz)) * 0.01 + layer,
        item: it,
        img,
        box,
        draw: (cx) => {
          if (layer > -1 && !ceiling) this.shadow(cx, it.def.x, it.def.z, it.base, hx * pop, hz * pop);
          const lit = this.hoverItem === it || (this.editing && this.selected === it);
          if (lit) cx.filter = "brightness(1.12)";
          if (pop < 1) {
            // ease-out-back: drops from above, overshoots a touch, settles
            const back = 1 + 2.7 * Math.pow(pop - 1, 3) + 1.7 * Math.pow(pop - 1, 2);
            const drop = (1 - back) * -60;
            cx.save();
            cx.globalAlpha = Math.min(1, pop * 3);
            cx.translate(px, py + drop);
            cx.scale(1 + (1 - pop) * 0.06, 1 - (1 - pop) * 0.08);
            cx.translate(-px, -py);
            cx.drawImage(img, box.x, box.y, box.w, box.h);
            cx.restore();
          } else cx.drawImage(img, box.x, box.y, box.w, box.h);
          cx.filter = "none";
        },
      };
      list.push(draw);
      if (this.editing && this.selected === it) list.push({ key: -900, draw: (cx) => this.footprintGlow(cx, it) });
    }
    // the character
    const sprite = this.charSprite();
    const showChar = !this.intro || this.intro.t > 0.9 || this.intro.quick;
    let ghost: { img: CanvasImageSource; box: { x: number; y: number; w: number; h: number }; self: Drawn } | null = null;
    if (sprite && showChar) {
      const [px, py] = project(this.pos.x, this.lift, this.pos.z);
      const m = sprite.meta;
      const shape = sprite.live ? { w: 1, h: 1 } : (this.char.shape?.() ?? { w: 1, h: 1 });
      const cs = sprite.live ? 1 : sharpNow.char;
      const box = { x: px - (m.ax / cs) * shape.w, y: py - (m.ay / cs) * shape.h, w: (m.w / cs) * shape.w, h: (m.h / cs) * shape.h };
      const self: Drawn = {
        key: this.pos.x + this.pos.z + 0.35,
        draw: (cx) => {
          this.shadow(cx, this.pos.x, this.pos.z, 0, 0.3, 0.3);
          cx.drawImage(sprite.img, box.x, box.y, box.w, box.h);
        },
      };
      list.push(self);
      ghost = { img: sprite.img, box, self };
    }
    // dust, steam, bubbles
    for (const p of this.puffs) list.push({ key: p.x + p.z + 0.5, draw: (cx) => this.drawPuff(cx, p) });
    list.sort((a, b) => a.key - b.key);
    this.drawn = list;
    for (const d of list) d.draw(c);
    // standing or sitting behind something tall: show a faint outline of the person through it, so they are never lost
    if (ghost) {
      const gi = list.indexOf(ghost.self);
      const g = ghost.box;
      const hidden = list.slice(gi + 1).some((d) => d.item && d.box && d.item.def.furniture !== "p_rug" && d.item.def.furniture !== "p_doormat" && d.box.x < g.x + g.w && d.box.x + d.box.w > g.x && d.box.y < g.y + g.h && d.box.y + d.box.h > g.y && d.box.y < g.y + g.h * 0.5);
      if (hidden) {
        c.save();
        c.globalAlpha = 0.38;
        c.filter = "brightness(1.35) saturate(0.7)";
        c.drawImage(ghost.img, g.x, g.y, g.w, g.h);
        c.restore();
      }
    }
    this.glows(c);
    for (const r of this.ripples) this.drawRipple(c, r);

    // evening: the room cools down, the bulbs warm up
    c.setTransform(1, 0, 0, 1, 0, 0);
    const night = this.nightness();
    if (night > 0.02) {
      c.fillStyle = `rgba(16,22,58,${0.5 * night})`;
      c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    // a soft vignette so the eye stays in the room
    const vg = c.createRadialGradient(this.canvas.width / 2, this.canvas.height / 2, Math.min(this.canvas.width, this.canvas.height) * 0.45, this.canvas.width / 2, this.canvas.height / 2, Math.max(this.canvas.width, this.canvas.height) * 0.75);
    vg.addColorStop(0, "rgba(20,12,6,0)");
    vg.addColorStop(1, "rgba(20,12,6,.38)");
    c.fillStyle = vg;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** A ceiling fan, seen from this angle, is only its shadow turning slowly on the floor. */
  private fanShadow(c: CanvasRenderingContext2D, it: Item) {
    const [px, py] = project(it.def.x, 0, it.def.z);
    const spin = this.time * 3.2;
    c.save();
    c.translate(px, py);
    c.scale(1, 0.5);
    c.fillStyle = "rgba(40,24,10,.16)";
    for (let i = 0; i < 4; i++) {
      c.save();
      c.rotate(spin + (i * Math.PI) / 2);
      c.beginPath();
      c.ellipse(52, 0, 46, 11, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    c.beginPath();
    c.arc(0, 0, 14, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  private nightness(): number {
    const h = this.hour;
    return h < 5.5 || h >= 19.3 ? 1 : h < 7 ? 1 - (h - 5.5) / 1.5 : h >= 17.5 ? (h - 17.5) / 1.8 : 0;
  }

  /** A painted step and path in front of the door. */
  private porch(c: CanvasRenderingContext2D) {
    const d = this.doorPoint();
    const poly = (pts: [number, number][], fill: string, stroke?: string) => {
      c.beginPath();
      pts.forEach(([x, z], i) => {
        const [px, py] = project(x, 0, z);
        if (i) c.lineTo(px, py);
        else c.moveTo(px, py);
      });
      c.closePath();
      c.fillStyle = fill;
      c.fill();
      if (stroke) {
        c.strokeStyle = stroke;
        c.lineWidth = 2;
        c.stroke();
      }
    };
    // a path of packed earth going off to the south
    poly([[d.x - 0.7, d.z], [d.x + 0.7, d.z], [d.x + 1.1, d.z + 6], [d.x - 1.1, d.z + 6]], "#b79a6b");
    // the step
    poly([[d.x - 1.0, d.z - 0.1], [d.x + 1.0, d.z - 0.1], [d.x + 1.0, d.z + 0.9], [d.x - 1.0, d.z + 0.9]], this.tier === "lapo" ? "#9c9484" : "#d9d2c4", "rgba(58,36,24,.7)");
    // a few painted tufts of grass
    const rnd = ((seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647))(5);
    const b = this.layout.house?.bounds ?? this.layout.area;
    for (let i = 0; i < 90; i++) {
      const x = b.minX - 2 + rnd() * (b.maxX - b.minX + 4), z = b.minZ - 2 + rnd() * (b.maxZ - b.minZ + 5);
      if (x > b.minX - 0.3 && x < b.maxX + 0.3 && z > b.minZ - 0.3 && z < b.maxZ + 0.3) continue;
      if (Math.abs(x - d.x) < 1.3 && z > d.z - 0.3) continue;
      const [px, py] = project(x, 0, z);
      c.strokeStyle = rnd() < 0.5 ? "rgba(46,70,30,.5)" : "rgba(160,190,100,.45)";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(px - 4, py);
      c.lineTo(px - 2, py - 7);
      c.moveTo(px, py);
      c.lineTo(px + 1, py - 9);
      c.moveTo(px + 4, py);
      c.lineTo(px + 3, py - 6);
      c.stroke();
    }
  }

  /** Sunlight falling through the back-wall windows onto the floor (by day) or a warm pool of lamplight (by night). */
  private lightPatches(c: CanvasRenderingContext2D) {
    const night = this.nightness();
    if (night > 0.95) return;
    const t = this.time;
    c.save();
    c.globalCompositeOperation = "lighter";
    for (const wall of this.layout.walls) {
      if (!wall.outward || wall.outward[0] > 0 || wall.outward[1] > 0) continue;
      const along = Math.abs(wall.b[0] - wall.a[0]) > Math.abs(wall.b[1] - wall.a[1]);
      const len = along ? Math.abs(wall.b[0] - wall.a[0]) : Math.abs(wall.b[1] - wall.a[1]);
      const count = Math.max(1, Math.floor(len / 3.2));
      for (let i = 0; i < count; i++) {
        const f = (i + 0.5) / count;
        const wx = wall.a[0] + (wall.b[0] - wall.a[0]) * f, wz = wall.a[1] + (wall.b[1] - wall.a[1]) * f;
        // a parallelogram of light thrown across the floor, drifting slowly
        const sway = Math.sin(t * 0.25 + i) * 0.08;
        const ox = along ? 0 : 1, oz = along ? 1 : 0;
        const pts: [number, number][] = [[wx - (along ? 0.55 : 0), wz - (along ? 0 : 0.55)], [wx + (along ? 0.55 : 0), wz + (along ? 0 : 0.55)], [wx + (along ? 0.55 : 0) + ox * 2.4, wz + (along ? 0 : 0.55) + oz * 2.4], [wx - (along ? 0.55 : 0) + ox * 2.4, wz - (along ? 0 : 0.55) + oz * 2.4]];
        c.beginPath();
        pts.forEach(([x, z], k) => {
          const [px, py] = project(x + sway, 0, z + sway);
          if (k) c.lineTo(px, py);
          else c.moveTo(px, py);
        });
        c.closePath();
        c.fillStyle = `rgba(168, 200, 255,${0.16 * (1 - night)})`;
        c.fill();
      }
    }
    c.restore();
  }

  /** Light that glows on top of everything: lamps at night, the TV when watching, the stove ring. */
  private glows(c: CanvasRenderingContext2D) {
    const night = this.nightness();
    const watching = this.doing?.actionId === "tv" ? this.items.find((i) => i.def.furniture.includes("tele") || i.def.furniture === "p_tv_flat") : null;
    c.save();
    c.globalCompositeOperation = "lighter";
    for (const it of this.items) {
      const lamp = it.def.furniture.includes("lamp") || it.def.furniture === "lightbulb_01" || it.def.furniture === "Lantern_01" || it.def.furniture === "caged_hanging_light";
      if (lamp && night > 0.05) {
        const y = it.def.furniture === "lightbulb_01" ? 2.3 : it.base + it.size[1] * 0.8;
        const [px, py] = project(it.def.x, y, it.def.z);
        const flick = 0.9 + Math.sin(this.time * 9 + it.def.x * 7) * 0.04;
        const g = c.createRadialGradient(px, py, 4, px, py, 190);
        g.addColorStop(0, `rgba(255,214,140,${0.55 * night * flick})`);
        g.addColorStop(1, "rgba(255,170,80,0)");
        c.fillStyle = g;
        c.fillRect(px - 200, py - 200, 400, 400);
      }
    }
    if (watching) {
      const [px, py] = project(watching.def.x, watching.base + watching.size[1] * 0.5, watching.def.z);
      const flick = 0.7 + Math.sin(this.time * 17) * 0.1 + Math.sin(this.time * 5.3) * 0.15;
      const g = c.createRadialGradient(px, py, 6, px, py, 230);
      g.addColorStop(0, `rgba(150,190,255,${0.5 * flick})`);
      g.addColorStop(1, "rgba(120,150,255,0)");
      c.fillStyle = g;
      c.fillRect(px - 240, py - 240, 480, 480);
    }
    c.restore();
  }

  private drawPuff(c: CanvasRenderingContext2D, p: Puff) {
    const [px, py] = project(p.x, p.y, p.z);
    const k = p.age / p.life;
    c.save();
    c.globalAlpha = Math.max(0, 1 - k) * (p.kind === "steam" ? 0.5 : p.kind === "dust" ? 0.45 : 0.95);
    if (p.kind === "dust" || p.kind === "steam") {
      c.fillStyle = p.kind === "steam" ? "#fff8ee" : "#d8c7a4";
      c.beginPath();
      c.arc(px, py, p.size * 90 * (1 + k * 1.4), 0, Math.PI * 2);
      c.fill();
    } else if (p.kind === "drop") {
      c.fillStyle = "#9fd4ff";
      c.beginPath();
      c.ellipse(px, py + k * 80, 2.5, 5, 0, 0, Math.PI * 2);
      c.fill();
    } else if (p.kind === "spark") {
      c.strokeStyle = "#ffe08a";
      c.lineWidth = 2.5;
      const r = 6 + k * 8;
      c.beginPath();
      c.moveTo(px - r, py);
      c.lineTo(px + r, py);
      c.moveTo(px, py - r);
      c.lineTo(px, py + r);
      c.stroke();
    } else {
      c.font = `700 ${Math.round(p.size * 120 + k * 8)}px "Fraunces", Georgia, serif`;
      c.fillStyle = p.kind === "z" ? "#e8f0ff" : "#a8c8ff";
      c.strokeStyle = "rgba(40,24,16,.85)";
      c.lineWidth = 4;
      const txt = p.kind === "z" ? "z" : "♪";
      c.strokeText(txt, px + Math.sin(p.age * 3) * 6, py);
      c.fillText(txt, px + Math.sin(p.age * 3) * 6, py);
    }
    c.restore();
  }

  private drawRipple(c: CanvasRenderingContext2D, r: Ripple) {
    const k = r.age / 0.9;
    const [px, py] = project(r.x, 0, r.z);
    c.save();
    c.globalAlpha = (1 - k) * 0.9;
    c.strokeStyle = "#ffe8b0";
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(px, py, 10 + k * 34, (10 + k * 34) / 2, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  hoverItem: Item | null = null;

  private shadow(c: CanvasRenderingContext2D, x: number, z: number, y: number, hx: number, hz: number) {
    const [px, py] = project(x, y, z);
    c.fillStyle = "rgba(14, 26, 54,.22)";
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
