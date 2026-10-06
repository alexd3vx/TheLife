import { useEffect, useMemo, useRef, useState } from "react";
import { GROUP_LABEL, lagosMinuteNow, openStatus, placeGroup, type District, type Landmark, type PlaceGroup } from "@thelife/game-core";
import { PIN_STYLE } from "./pins";
import { GameIcon, iconPath } from "../ui/icons";
import "./citymap.css";

/**
 * The city map: the real island from above at a slant, buildings standing up from the ground, every named place with a label that
 * says whether it is open. Pan with a finger or the mouse, pinch or scroll to zoom. Drawn on a 2D canvas from the same data as the 3D world.
 */

const COLOURS = {
  water: [141, 178, 208],
  street: [196, 202, 208],
  block: [214, 208, 190],
  park: [160, 196, 130],
  market: [222, 178, 130],
} as const;

const WALLS = ["#d9cfc1", "#cbbfae", "#e0d6c8", "#c2b8aa", "#d6c5b0", "#bfc4c9"];
const ROOFS = ["#9a8f86", "#8a7d74", "#a39689", "#7c8590", "#a58a78", "#8f8a80"];

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
  poly: [number, number][];
  h: number;
  wall: string;
  roof: string;
  key: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
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
    out.push({ poly, h, wall: WALLS[c]!, roof: ROOFS[c]!, key: (f.minX + f.maxX + f.minZ + f.maxZ) / 2, minX: f.minX, maxX: f.maxX, minZ: f.minZ, maxZ: f.maxZ });
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

  const places = useMemo(() => {
    const here = player ?? district.spawn;
    return district.landmarks
      .map((l) => ({ l, st: openStatus(l.kind, hour, weekday), d: Math.hypot(l.entrance.x - here.x, l.entrance.z - here.z) }))
      .sort((a, b) => a.d - b.d);
  }, [district, hour, weekday, player]);
  const shown = places.filter((p) => (filter === "all" ? true : filter === "open" ? p.st.open : placeGroup(p.l.kind) === filter));
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
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

  // drawing, only when something changed
  useEffect(() => {
    let raf = 0;
    const g = canvas.current!.getContext("2d")!;
    const blds = buildings(district);
    const ground0 = ground(district);
    const t = district.terrain!;
    const cell = t.cell;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!dirty.current) return;
      dirty.current = false;
      const { w, h, dpr } = size.current;
      const v = view.current;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#9ab9d6";
      g.fillRect(0, 0, w, h);
      // the ground: the island's picture, laid down slanted
      g.save();
      const ox = w / 2 - (v.cx - v.cz) * v.s, oy = h / 2 - (v.cx + v.cz) * 0.5 * v.s;
      g.setTransform(dpr * v.s, dpr * v.s * 0.5, -dpr * v.s, dpr * v.s * 0.5, dpr * ox, dpr * oy);
      g.imageSmoothingEnabled = v.s < 1.4;
      g.drawImage(ground0, 0, 0, t.width * cell, t.height * cell);
      g.restore();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      // the buildings, far to near, only those on screen (and only those big enough to see when zoomed far out)
      const minH = v.s < 0.3 ? 6 : 0;
      const corner = toWorld(0, 0), c2 = toWorld(w, 0), c3 = toWorld(0, h), c4 = toWorld(w, h);
      const x0 = Math.min(corner.x, c2.x, c3.x, c4.x) - 40, x1 = Math.max(corner.x, c2.x, c3.x, c4.x) + 40;
      const z0 = Math.min(corner.z, c2.z, c3.z, c4.z) - 40, z1 = Math.max(corner.z, c2.z, c3.z, c4.z) + 40;
      let drawn = 0;
      for (const b of blds) {
        if (b.maxX < x0 || b.minX > x1 || b.maxZ < z0 || b.minZ > z1) continue;
        if (b.h < minH) continue;
        if (++drawn > 9000) break;
        const base = b.poly.map(([x, z]) => toScreen(x, z, 0));
        const top = b.poly.map(([x, z]) => toScreen(x, z, b.h));
        const wind = area(b.poly) > 0 ? 1 : -1;
        if (v.s > 0.22) {
          for (let i = 0; i < b.poly.length; i++) {
            const j = (i + 1) % b.poly.length;
            const ex = b.poly[j]![0] - b.poly[i]![0], ez = b.poly[j]![1] - b.poly[i]![1];
            // outward normal for this winding; visible when it faces the camera (towards +x +z)
            const nx = ez * wind, nz = -ex * wind;
            if (nx + nz <= 0) continue;
            g.fillStyle = shade(b.wall, nx > nz ? 0.92 : 0.78);
            g.beginPath();
            g.moveTo(base[i]![0], base[i]![1]);
            g.lineTo(base[j]![0], base[j]![1]);
            g.lineTo(top[j]![0], top[j]![1]);
            g.lineTo(top[i]![0], top[i]![1]);
            g.closePath();
            g.fill();
          }
        }
        g.fillStyle = b.roof;
        g.beginPath();
        top.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.closePath();
        g.fill();
      }
      // trees
      if (v.s > 0.7) {
        g.fillStyle = "rgba(60,110,70,.9)";
        let n = 0;
        for (const tr of district.trees) {
          if (tr.x < x0 || tr.x > x1 || tr.z < z0 || tr.z > z1) continue;
          if (++n > 2500) break;
          const [px, py] = toScreen(tr.x, tr.z, 3);
          g.beginPath();
          g.arc(px, py, Math.max(1.5, 2.4 * v.s), 0, Math.PI * 2);
          g.fill();
        }
      }
    };
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
        }
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch) v.s = Math.max(0.12, Math.min(6, v.s * (d / pinch)));
        pinch = d;
        moved = true;
        dirty.current = true;
      }
    };
    const up = (e: PointerEvent) => {
      const had = pts.delete(e.pointerId);
      pinch = 0;
      if (had && pts.size === 0 && !moved && performance.now() - downAt < 600) onSelect(null);
      bump((n) => n + 1);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      view.current.s = Math.max(0.12, Math.min(6, view.current.s * Math.exp(-e.deltaY * 0.0015)));
      dirty.current = true;
      bump((n) => n + 1);
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

  // labels follow the map while it is moved: re-render them on a light timer
  useEffect(() => {
    const t = setInterval(() => bump((n) => n + 1), 120);
    return () => clearInterval(t);
  }, []);

  const v = view.current;
  const labelled = v.s >= 0.7;
  const pill = (l: Landmark, st: { open: boolean; text: string }) => {
    const [px, py] = toScreen(l.x, l.z, 18);
    if (px < -80 || py < -40 || px > size.current.w + 80 || py > size.current.h + 40) return null;
    const style = PIN_STYLE[l.kind];
    const on = selected === l.id;
    const glyph = iconPath(style.icon);
    return (
      <button key={l.id} className={`cm-pin${st.open ? "" : " is-closed"}${on ? " is-on" : ""}${labelled || on ? "" : " is-dot"}`} style={{ left: px, top: py }} onClick={() => onSelect(on ? null : l.id)} aria-label={`${l.name}, ${st.text}`}>
        <span className="cm-pin-icon" style={{ background: style.colour }}>
          {glyph && (
            <svg viewBox={`0 0 ${glyph.box[0]} ${glyph.box[1]}`} width="12" height="12" aria-hidden="true">
              <path d={glyph.d} fill="#fff" />
            </svg>
          )}
        </span>
        {(labelled || on) && (
          <span className="cm-pin-text">
            <b>{l.name}</b>
            {(!st.open || on) && <small>{nearest === l.id ? "You are here" : st.text}</small>}
            {st.open && !on && nearest === l.id && <small className="here">You are here</small>}
          </span>
        )}
        <i className="cm-pin-stem" />
      </button>
    );
  };

  const me = player ? toScreen(player.x, player.z, 0) : null;
  const homeAt = home ? toScreen(home.x, home.z, 6) : null;
  const openCount = places.filter((p) => p.st.open).length;
  const chips: { id: "all" | "open" | PlaceGroup; label: string }[] = [{ id: "all", label: "All" }, { id: "open", label: "Open now" }, ...(Object.keys(GROUP_LABEL) as PlaceGroup[]).map((g) => ({ id: g, label: GROUP_LABEL[g] }))];

  return (
    <div className="citymap" ref={wrap}>
      <canvas ref={canvas} className="cm-canvas" />
      <div className="cm-layer">
        {shown.map((p) => pill(p.l, p.st))}
        {homeAt && <span className="cm-home" style={{ left: homeAt[0], top: homeAt[1] }}><GameIcon name="home" size={14} /></span>}
        {others.map((o) => {
          const [px, py] = toScreen(o.x, o.z, 2);
          return <span key={o.id} className="cm-other" style={{ left: px, top: py }}>{o.name}</span>;
        })}
        {me && <span className="cm-me" style={{ left: me[0], top: me[1] }} />}
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
                  <span className="cm-row-icon" style={{ background: style.colour }}><GameIcon name={style.icon} size={16} /></span>
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
