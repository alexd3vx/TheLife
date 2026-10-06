import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GROUP_LABEL, lagosMinuteNow, openStatus, placeGroup, type District, type Landmark, type PlaceGroup } from "@thelife/game-core";
import { PIN_STYLE } from "./pins";
import { GameIcon, iconPath } from "../ui/icons";
import "./citymap.css";

/**
 * The city map: the real island from above at a slant, buildings standing up from the ground, every named place with a label that
 * says whether it is open. Pan with a finger or the mouse, pinch or scroll to zoom. Drawn on a 2D canvas from the same data as the 3D world.
 */

const COLOURS = {
  water: [96, 150, 214],
  street: [214, 222, 236],
  block: [226, 231, 242],
  park: [176, 200, 238],
  market: [208, 212, 244],
} as const;

const WALLS = ["#dfe6f2", "#d0d9ea", "#e6ebf5", "#c8d2e6", "#d8dff0", "#c3ccdf"];
const ROOFS = ["#8e9bb8", "#7f8cab", "#9aa6c2", "#7384a8", "#8a96b6", "#7a88a6"];

/** The map keeps to blues: places that are green on the 3D street are blue-teal here. */
const BLUE_PIN: Record<string, string> = { school: "#3a6fd8", stadium: "#2f86d4", park: "#4a8fe0" };
const pinColour = (kind: string, fallback: string) => BLUE_PIN[kind] ?? fallback;

interface Props {
  district: District;
  player: { x: number; z: number } | null;
  home: { x: number; z: number } | null;
  others?: { id: string; name: string; x: number; z: number }[];
  /** The hour of the day in Lagos, for opening hours. */
  hour: number;
  weekday: number;
  selected: string | null;
  onSelect(id: string | null): void;
  /** Taps on the "Walk"/"Ride" etc. come from the sheet the page shows. */
  className?: string;
}

interface Building {
  /** x, z pairs */
  pts: Float32Array;
  h: number;
  lit: string;
  dark: string;
  roof: string;
  key: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** +1 / -1: which way round the corners go */
  wind: number;
  /** longest side, for skipping what is too small to see */
  size: number;
}

let groundPicture: HTMLCanvasElement | null = null;
function ground(district: District): HTMLCanvasElement {
  if (groundPicture) return groundPicture;
  const t = district.terrain!;
  const c = document.createElement("canvas");
  c.width = t.width;
  c.height = t.height;
  const g = c.getContext("2d")!;
  const img = g.createImageData(c.width, c.height);
  for (let i = 0; i < t.cls.length; i++) {
    const k = t.cls[i]!;
    const rgb = k === 0 ? COLOURS.water : k === 1 ? COLOURS.street : k === 2 ? COLOURS.block : k === 3 ? COLOURS.park : COLOURS.market;
    // a little variation so the ground isn't one flat colour
    const v = ((i * 2654435761) >>> 24) % 9 - 4;
    img.data[i * 4] = rgb[0] + v;
    img.data[i * 4 + 1] = rgb[1] + v;
    img.data[i * 4 + 2] = rgb[2] + v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  groundPicture = c;
  return c;
}

let buildingsCache: Building[] | null = null;
function buildings(district: District): Building[] {
  if (buildingsCache) return buildingsCache;
  const out: Building[] = [];
  for (const l of district.lots) {
    const f = l.footprint;
    const poly: [number, number][] = l.poly ?? [[f.minX, f.minZ], [f.maxX, f.minZ], [f.maxX, f.maxZ], [f.minX, f.maxZ]];
    const named = !!l.landmark;
    const h = Math.max(3.2, l.floors * l.storey) * (named ? 1.15 : 1);
    const c = l.colour % WALLS.length;
    const pts = new Float32Array(poly.length * 2);
    poly.forEach(([x, z], i) => {
      pts[i * 2] = x;
      pts[i * 2 + 1] = z;
    });
    out.push({ pts, h, lit: shade(WALLS[c]!, 0.94), dark: shade(WALLS[c]!, 0.8), roof: ROOFS[c]!, key: (f.minX + f.maxX + f.minZ + f.maxZ) / 2, minX: f.minX, maxX: f.maxX, minZ: f.minZ, maxZ: f.maxZ, wind: area(poly) > 0 ? 1 : -1, size: Math.max(f.maxX - f.minX, f.maxZ - f.minZ) });
  }
  out.sort((a, b) => a.key - b.key);
  buildingsCache = out;
  return out;
}

let landBox: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
/** The part of the map that is land (the rest is open water), so "whole island" fills the screen with the island. */
function land(district: District) {
  if (landBox) return landBox;
  const t = district.terrain!;
  let minX = t.width, maxX = 0, minZ = t.height, maxZ = 0;
  for (let z = 0; z < t.height; z += 2) for (let x = 0; x < t.width; x += 2) if (t.cls[z * t.width + x] !== 0) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  landBox = { minX: minX * t.cell, maxX: maxX * t.cell, minZ: minZ * t.cell, maxZ: maxZ * t.cell };
  return landBox;
}

const area = (p: [number, number][]) => {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, z1] = p[i]!, [x2, z2] = p[(i + 1) % p.length]!;
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
};

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k)), g = Math.min(255, Math.round(((n >> 8) & 255) * k)), b = Math.min(255, Math.round((n & 255) * k));
  return `rgb(${r},${g},${b})`;
}

export default function CityMap({ district, player, home, others = [], hour, weekday, selected, onSelect }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const W = district.bounds.maxX, H = district.bounds.maxZ;
  // the view: where on the island the middle of the screen is, and metres-to-pixels
  const view = useRef({ cx: player?.x ?? district.spawn.x, cz: player?.z ?? district.spawn.z, s: 0.55 });
  const [, bump] = useState(0);
  const dirty = useRef(true);
  const size = useRef({ w: 1, h: 1, dpr: 1 });
  const [filter, setFilter] = useState<"all" | "open" | PlaceGroup>("all");
  const [listOpen, setListOpen] = useState(() => window.innerWidth > 700);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const hereX = Math.round((player?.x ?? district.spawn.x) / 25) * 25, hereZ = Math.round((player?.z ?? district.spawn.z) / 25) * 25;
  const places = useMemo(() => {
    const here = { x: hereX, z: hereZ };
    return district.landmarks
      .map((l) => ({ l, st: openStatus(l.kind, hour, weekday), d: Math.hypot(l.entrance.x - here.x, l.entrance.z - here.z) }))
      .sort((a, b) => a.d - b.d);
  }, [district, Math.floor(hour * 2), weekday, hereX, hereZ]);
  const shown = useMemo(() => places.filter((p) => (filter === "all" ? true : filter === "open" ? p.st.open : placeGroup(p.l.kind) === filter)), [places, filter]);
  const nearest = places[0]?.d !== undefined && places[0].d < 60 ? places[0].l.id : null;
  const shownRef = useRef(shown);
  shownRef.current = shown;

  const fitAll = () => {
    const v = view.current;
    const b = land(district);
    v.cx = (b.minX + b.maxX) / 2;
    v.cz = (b.minZ + b.maxZ) / 2;
    const lw = b.maxX - b.minX, lh = b.maxZ - b.minZ;
    // the slanted picture is (width + depth) wide and half that tall
    v.s = Math.min(size.current.w / ((lw + lh) * 1.05), size.current.h / ((lw + lh) * 0.5 * 1.35));
    dirty.current = true;
    bump((n) => n + 1);
  };
  const findMe = () => {
    const v = view.current;
    const p = player ?? home ?? district.spawn;
    v.cx = p.x;
    v.cz = p.z;
    v.s = Math.max(v.s, 1.1);
    dirty.current = true;
    bump((n) => n + 1);
  };
  const zoom = (k: number, ax?: number, az?: number) => {
    const v = view.current;
    const s = Math.max(0.12, Math.min(6, v.s * k));
    v.s = s;
    void ax;
    void az;
    dirty.current = true;
    bump((n) => n + 1);
  };

  // world -> screen (CSS pixels)
  const toScreen = (x: number, z: number, y = 0): [number, number] => {
    const v = view.current, { w, h } = size.current;
    return [w / 2 + (x - z - (v.cx - v.cz)) * v.s, h / 2 + ((x + z - (v.cx + v.cz)) * 0.5 - y * 0.8) * v.s];
  };
  const toWorld = (px: number, py: number): { x: number; z: number } => {
    const v = view.current, { w, h } = size.current;
    const a = (px - w / 2) / v.s + (v.cx - v.cz); // x - z
    const b = ((py - h / 2) / v.s) * 2 + (v.cx + v.cz); // x + z
    return { x: (a + b) / 2, z: (b - a) / 2 };
  };

  // sizing
  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      size.current = { w: r.width, h: r.height, dpr };
      const c = canvas.current!;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      if (!initialised.current) {
        initialised.current = true;
        view.current.s = Math.min(1.2, Math.max(0.5, r.width / 900));
      }
      dirty.current = true;
      bump((n) => n + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const initialised = useRef(false);

  // where the pills, the home mark and the player's dot sit on the screen; moved directly, not through React
  const layer = useRef<HTMLDivElement>(null);
  const placeLabels = useRef<() => void>(() => {});
  const playerRef = useRef(player);
  playerRef.current = player;
  // drawing, only when something changed
  const moving = useRef(0);
  useEffect(() => {
    let raf = 0;
    const g = canvas.current!.getContext("2d", { alpha: false })!;
    const blds = buildings(district);
    const ground0 = ground(district);
    const t = district.terrain!;
    const cell = t.cell;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const busy = now < moving.current;
      if (!dirty.current) {
        // the gesture just ended: one full-detail picture
        if (!busy && lastBusy) dirty.current = true;
        else return;
      }
      lastBusy = busy;
      dirty.current = false;
      const { w, h, dpr } = size.current;
      const v = view.current;
      const s = v.s;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#6096d6";
      g.fillRect(0, 0, w, h);
      // the ground: the island's picture, laid down slanted
      const ox = w / 2 - (v.cx - v.cz) * s, oy = h / 2 - (v.cx + v.cz) * 0.5 * s;
      g.setTransform(dpr * s, dpr * s * 0.5, -dpr * s, dpr * s * 0.5, dpr * ox, dpr * oy);
      g.imageSmoothingEnabled = s < 1.4;
      g.drawImage(ground0, 0, 0, t.width * cell, t.height * cell);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      // the buildings, far to near, only those on screen and big enough to see; while the map is being moved the little ones wait
      const corner = toWorld(0, 0), c2 = toWorld(w, 0), c3 = toWorld(0, h), c4 = toWorld(w, h);
      const x0 = Math.min(corner.x, c2.x, c3.x, c4.x) - 40, x1 = Math.max(corner.x, c2.x, c3.x, c4.x) + 40;
      const z0 = Math.min(corner.z, c2.z, c3.z, c4.z) - 40, z1 = Math.max(corner.z, c2.z, c3.z, c4.z) + 40;
      const minPx = busy ? 3.2 : 1.6;
      const sy = s * 0.5, lift = 0.8 * s;
      let drawn = 0, fill = "";
      for (const b of blds) {
        if (b.maxX < x0 || b.minX > x1 || b.maxZ < z0 || b.minZ > z1) continue;
        if (b.size * s < minPx) continue;
        if (++drawn > (busy ? 2500 : 5000)) break;
        const p = b.pts, n = p.length / 2;
        const top = b.h * lift;
        // screen position of corner i at height 0
        const walls = !busy && s > 0.22 && top > 3;
        if (walls) {
          for (let i = 0; i < n; i++) {
            const j = i + 1 === n ? 0 : i + 1;
            const xi = p[i * 2]!, zi = p[i * 2 + 1]!, xj = p[j * 2]!, zj = p[j * 2 + 1]!;
            // outward normal for this winding; visible when it faces the camera (towards +x +z)
            const nx = (zj - zi) * b.wind, nz = -(xj - xi) * b.wind;
            if (nx + nz <= 0) continue;
            const c = nx > nz ? b.lit : b.dark;
            if (c !== fill) {
              g.fillStyle = c;
              fill = c;
            }
            const ax = ox + (xi - zi) * s, ay = oy + (xi + zi) * sy, bx = ox + (xj - zj) * s, by = oy + (xj + zj) * sy;
            g.beginPath();
            g.moveTo(ax, ay);
            g.lineTo(bx, by);
            g.lineTo(bx, by - top);
            g.lineTo(ax, ay - top);
            g.closePath();
            g.fill();
          }
        }
        if (b.roof !== fill) {
          g.fillStyle = b.roof;
          fill = b.roof;
        }
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const x = p[i * 2]!, z = p[i * 2 + 1]!;
          const px = ox + (x - z) * s, py = oy + (x + z) * sy - (walls ? top : b.h * lift);
          if (i) g.lineTo(px, py);
          else g.moveTo(px, py);
        }
        g.closePath();
        g.fill();
      }
      // trees
      if (s > 0.7 && !busy) {
        g.fillStyle = "rgba(70,110,190,.85)";
        let n = 0;
        for (const tr of district.trees) {
          if (tr.x < x0 || tr.x > x1 || tr.z < z0 || tr.z > z1) continue;
          if (++n > 2000) break;
          const [px, py] = toScreen(tr.x, tr.z, 3);
          g.beginPath();
          g.arc(px, py, Math.max(1.5, 2.4 * s), 0, Math.PI * 2);
          g.fill();
        }
      }
      placeLabels.current();
    };
    let lastBusy = false;
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [district]);

  // gestures
  useEffect(() => {
    const c = canvas.current!;
    const pts = new Map<number, { x: number; y: number }>();
    let moved = false, pinch = 0, downAt = 0;
    const down = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      moved = false;
      downAt = performance.now();
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
      p.x = e.offsetX;
      p.y = e.offsetY;
      const v = view.current;
      if (pts.size === 1) {
        if (Math.hypot(dx, dy) > 1) moved = moved || Math.hypot(dx, dy) > 3;
        if (moved) {
          // dragging the map moves the ground under the finger
          const a = -dx / v.s, b = (-dy / v.s) * 2; // change in x - z and x + z
          v.cx += (a + b) / 2;
          v.cz += (b - a) / 2;
          dirty.current = true;
          moving.current = performance.now() + 140;
        }
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch) v.s = Math.max(0.12, Math.min(6, v.s * (d / pinch)));
        pinch = d;
        moved = true;
        dirty.current = true;
        moving.current = performance.now() + 140;
      }
    };
    const up = (e: PointerEvent) => {
      const had = pts.delete(e.pointerId);
      pinch = 0;
      if (had && pts.size === 0 && !moved && performance.now() - downAt < 600) onSelect(null);
      dirty.current = true;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      view.current.s = Math.max(0.12, Math.min(6, view.current.s * Math.exp(-e.deltaY * 0.0015)));
      dirty.current = true;
      moving.current = performance.now() + 160;
    };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("wheel", wheel, { passive: false });
    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      c.removeEventListener("wheel", wheel);
    };
  }, [onSelect]);

  const pill = (l: Landmark, st: { open: boolean; text: string }) => {
    const style = PIN_STYLE[l.kind];
    const on = selected === l.id;
    const glyph = iconPath(style.icon);
    return (
      <button key={l.id} data-wx={l.x} data-wz={l.z} data-wy={18} className={`cm-pin${st.open ? "" : " is-closed"}${on ? " is-on" : ""}`} onClick={() => onSelect(on ? null : l.id)} aria-label={`${l.name}, ${st.text}`}>
        <span className="cm-pin-icon" style={{ background: pinColour(l.kind, style.colour) }}>
          {glyph && (
            <svg viewBox={`0 0 ${glyph.box[0]} ${glyph.box[1]}`} width="12" height="12" aria-hidden="true">
              <path d={glyph.d} fill="#fff" />
            </svg>
          )}
        </span>
        <span className="cm-pin-text">
          <b>{l.name}</b>
          {(!st.open || on) && <small>{nearest === l.id ? "You are here" : st.text}</small>}
          {st.open && !on && nearest === l.id && <small className="here">You are here</small>}
        </span>
        <i className="cm-pin-stem" />
      </button>
    );
  };

  // after every render: find the things to place, then place them (and again each time the map moves)
  useLayoutEffect(() => {
    const el = layer.current;
    if (!el) return;
    const items: { el: HTMLElement; x: number; z: number; y: number; dyn?: "me" }[] = [];
    el.querySelectorAll<HTMLElement>("[data-wx]").forEach((n) => items.push({ el: n, x: +n.dataset.wx!, z: +n.dataset.wz!, y: +n.dataset.wy! }));
    const me = el.querySelector<HTMLElement>(".cm-me");
    if (me) items.push({ el: me, x: 0, z: 0, y: 0, dyn: "me" });
    placeLabels.current = () => {
      const { w, h } = size.current;
      el.classList.toggle("is-dots", view.current.s < 0.7);
      for (const it of items) {
        let x = it.x, z = it.z;
        if (it.dyn) {
          const p = playerRef.current;
          if (!p) continue;
          x = p.x;
          z = p.z;
        }
        const [px, py] = toScreen(x, z, it.y);
        const off = px < -90 || py < -50 || px > w + 90 || py > h + 50;
        if (off) {
          if (it.el.style.display !== "none") it.el.style.display = "none";
          continue;
        }
        if (it.el.style.display) it.el.style.display = "";
        it.el.style.transform = it.dyn ? `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0)` : `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0) translate(-50%,-100%)`;
      }
    };
    placeLabels.current();
  });

  const openCount = places.filter((p) => p.st.open).length;
  const chips: { id: "all" | "open" | PlaceGroup; label: string }[] = [{ id: "all", label: "All" }, { id: "open", label: "Open now" }, ...(Object.keys(GROUP_LABEL) as PlaceGroup[]).map((g) => ({ id: g, label: GROUP_LABEL[g] }))];

  return (
    <div className="citymap" ref={wrap}>
      <canvas ref={canvas} className="cm-canvas" />
      <div className="cm-layer" ref={layer}>
        {shown.map((p) => pill(p.l, p.st))}
        {home && <span className="cm-home" data-wx={home.x} data-wz={home.z} data-wy={6}><GameIcon name="home" size={14} /></span>}
        {others.map((o) => (
          <span key={o.id} className="cm-other" data-wx={o.x} data-wz={o.z} data-wy={2}>{o.name}</span>
        ))}
        {player && <span className="cm-me" />}
      </div>

      <div className={`cm-panel${listOpen ? "" : " is-hidden"}`}>
        <header>
          <div>
            <h2>Lagos map</h2>
            <small>{openCount} of {places.length} places open</small>
          </div>
          <button onClick={() => setListOpen(false)}>Hide list</button>
        </header>
        <div className="cm-chips">
          {chips.map((c) => (
            <button key={c.id} className={filter === c.id ? "is-on" : ""} onClick={() => setFilter(c.id)}>{c.label}</button>
          ))}
        </div>
        <ul>
          {shown.map(({ l, st }) => {
            const style = PIN_STYLE[l.kind];
            return (
              <li key={l.id}>
                <button className={selected === l.id ? "is-on" : ""} onClick={() => { onSelect(l.id); const vv = view.current; vv.cx = l.x; vv.cz = l.z; vv.s = Math.max(vv.s, 1.1); dirty.current = true; bump((n) => n + 1); }}>
                  <span className="cm-row-icon" style={{ background: pinColour(l.kind, style.colour) }}><GameIcon name={style.icon} size={16} /></span>
                  <span className="cm-row-text">
                    <b>{l.name}</b>
                    <small>{style.label}</small>
                  </span>
                  <span className={`cm-row-state${st.open ? " is-open" : ""}`}>{nearest === l.id ? "You are here" : st.open ? "Open" : st.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {!listOpen && <button className="cm-show" onClick={() => setListOpen(true)}>Show list</button>}

      <div className="cm-tools">
        <button onClick={() => zoom(1.4)} aria-label="Zoom in">+</button>
        <button onClick={() => zoom(1 / 1.4)} aria-label="Zoom out">−</button>
        <button className="wide" onClick={fitAll}>Whole island</button>
        <button className="wide" onClick={findMe}>Find me</button>
      </div>
      <span className="cm-credit">© OpenStreetMap contributors</span>
    </div>
  );
}

/** The hour and weekday in Lagos right now, for opening hours. */
export function lagosNow(): { hour: number; weekday: number } {
  const m = lagosMinuteNow();
  const day = Math.floor(m / 1440) + 1; // Day 1 is Thursday 1 January 2026
  return { hour: (m % 1440) / 60, weekday: (day + 3) % 7 };
}
