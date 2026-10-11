import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GROUP_LABEL, LAGOS_DISTRICTS, lagosMinuteNow, openStatus, placeGroup, type District, type Landmark, type PlaceGroup } from "@thelife/game-core";
import { PIN_STYLE } from "./pins";
import { GameIcon, iconPath } from "../ui/icons";
import { CityBoard, lookFor } from "./CityBoard";
import "./citymap.css";

/**
 * The city map: Lagos from above as a solid 3D board (see CityBoard.ts). Districts are plates in the sea, the buildings stand up,
 * cars and planes move, and every named place has a badge that says whether it is open. Pan with a finger or the mouse, pinch or
 * scroll to zoom.
 */

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

/** The places that stay on the map when it is zoomed far out. */
const MAJOR = new Set<string>(["airport", "hospital", "bank", "market", "station", "government", "port", "stadium", "museum"]);

export default function CityMap({ district, player, home, others = [], hour, weekday, selected, onSelect }: Props) {
  const forced = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("hour") : null;
  const look = lookFor(forced ? Number(forced) : hour);
  const board = useRef<CityBoard | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const W = district.bounds.maxX, H = district.bounds.maxZ;
  // the view: where on the island the middle of the screen is, and metres-to-pixels
  const view = useRef({ cx: player?.x ?? district.spawn.x, cz: player?.z ?? district.spawn.z, s: 0.3 });
  const [, bump] = useState(0);
  const dirty = useRef(true);
  const size = useRef({ w: 1, h: 1, dpr: 1 });
  const [filter, setFilter] = useState<"all" | "open" | PlaceGroup>("all");
  const [listOpen, setListOpen] = useState(false);
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
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const d of LAGOS_DISTRICTS) {
      x0 = Math.min(x0, d.x0); x1 = Math.max(x1, d.x1); z0 = Math.min(z0, d.z0); z1 = Math.max(z1, d.z1);
    }
    v.cx = (x0 + x1) / 2;
    v.cz = (z0 + z1) / 2;
    v.s = Math.min(size.current.w / ((x1 - x0) * 1.1), size.current.h / ((z1 - z0) * 0.8 * 1.35));
    v.cz += (z1 - z0) * 0.04;
    dirty.current = true;
    bump((n) => n + 1);
  };
  const findMe = () => {
    const v = view.current;
    const p = player ?? home ?? district.spawn;
    v.cx = p.x;
    v.cz = p.z;
    v.s = Math.max(v.s, 0.9);
    dirty.current = true;
    bump((n) => n + 1);
  };
  const zoom = (k: number, ax?: number, az?: number) => {
    const v = view.current;
    const s = Math.max(0.1, Math.min(8, v.s * k));
    v.s = s;
    void ax;
    void az;
    dirty.current = true;
    bump((n) => n + 1);
  };

  // world -> screen (CSS pixels)
  const toScreen = (x: number, z: number, y = 0): [number, number] => board.current?.project(x, z, y) ?? [-9999, -9999];

  // sizing
  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      size.current = { w: r.width, h: r.height, dpr };
      void dpr;
      board.current?.setSize(r.width, r.height);
      if (!initialised.current) {
        initialised.current = true;
        const v = view.current;
        v.s = Math.min(0.9, Math.max(0.4, r.width / 1000));
        dirty.current = true;
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
  // the 3D board: built once per look (day or night), and told where the camera is whenever the view changes
  useEffect(() => {
    const c = canvas.current!;
    const bd = new CityBoard(c, district, look);
    board.current = bd;
    if (import.meta.env.DEV) (window as unknown as { __board?: CityBoard }).__board = bd;
    const r = wrap.current!.getBoundingClientRect();
    bd.setSize(r.width, r.height);
    bd.setView(view.current.cx, view.current.cz, view.current.s);
    bd.onFrame = () => {
      if (dirty.current) {
        dirty.current = false;
        bd.setView(view.current.cx, view.current.cz, view.current.s);
        placeLabels.current();
      }
    };
    dirty.current = true;
    return () => {
      bd.dispose();
      board.current = null;
    };
  }, [district, look]);

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
          const k = board.current?.dragScale() ?? { x: 1 / v.s, z: 1 / v.s };
          v.cx -= dx * k.x;
          v.cz -= dy * k.z;
          dirty.current = true;
        }
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch) v.s = Math.max(0.1, Math.min(8, v.s * (d / pinch)));
        pinch = d;
        moved = true;
        dirty.current = true;
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
      view.current.s = Math.max(0.1, Math.min(8, view.current.s * Math.exp(-e.deltaY * 0.0015)));
      dirty.current = true;
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
      <button key={l.id} data-major={MAJOR.has(l.kind) ? "1" : undefined} data-wx={l.x} data-wz={l.z} data-wy={18} className={`cm-pin${st.open ? "" : " is-closed"}${on ? " is-on" : ""}`} onClick={() => onSelect(on ? null : l.id)} aria-label={`${l.name}, ${st.text}`}>
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
    const items: { el: HTMLElement; x: number; z: number; y: number; dyn?: "me"; center?: boolean }[] = [];
    el.querySelectorAll<HTMLElement>("[data-wx]").forEach((n) => items.push({ el: n, x: +n.dataset.wx!, z: +n.dataset.wz!, y: +n.dataset.wy!, center: !!n.dataset.center }));
    const me = el.querySelector<HTMLElement>(".cm-me");
    if (me) items.push({ el: me, x: 0, z: 0, y: 0, dyn: "me" });
    placeLabels.current = () => {
      const { w, h } = size.current;
      el.classList.toggle("is-dots", view.current.s < 0.45);
      el.classList.toggle("is-far", view.current.s < 0.55);
      el.classList.toggle("is-near", view.current.s > 1.1);
      for (const it of items) {
        let x = it.x, z = it.z;
        if (it.dyn) {
          const p = playerRef.current;
          if (!p) continue;
          x = p.x;
          z = p.z;
        }
        const [px, py] = toScreen(x, z, it.y);
        const off = px < -90 || py < -50 || px > w + 90 || py > h + 50 || !(board.current?.visible(x, z, it.y) ?? false);
        if (off) {
          if (it.el.style.display !== "none") it.el.style.display = "none";
          continue;
        }
        if (it.el.style.display) it.el.style.display = "";
        it.el.style.transform = it.dyn ? `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0)` : it.center ? `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0) translate(-50%,-50%)` : `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0) translate(-50%,-100%)`;
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
        {LAGOS_DISTRICTS.map((d) => (
          <span key={d.name} className="cm-district" data-center="1" data-wx={(d.x0 + d.x1) / 2} data-wz={d.z0 + (d.z1 - d.z0) * 0.12} data-wy={0}>{d.name}</span>
        ))}
        <span className="cm-district cm-sea" data-center="1" data-wx={1000} data-wz={2000} data-wy={0}>Atlantic Ocean</span>
        <span className="cm-district cm-sea" data-center="1" data-wx={1200} data-wz={850} data-wy={0}>The Lagoon</span>
        {home && <span className="cm-home" data-wx={home.x} data-wz={home.z} data-wy={6}><GameIcon name="home" size={14} /></span>}
        {others.map((o) => (
          <span key={o.id} className="cm-other" data-wx={o.x} data-wz={o.z} data-wy={2}>{o.name}</span>
        ))}
        {player && <span className="cm-me" />}
      </div>

      <div className="cm-filters" role="group" aria-label="What to show">
        {chips.map((c) => (
          <button key={c.id} className={filter === c.id ? "is-on" : ""} onClick={() => setFilter(c.id)}>{c.label}</button>
        ))}
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
                <button className={selected === l.id ? "is-on" : ""} onClick={() => { onSelect(l.id); const vv = view.current; vv.cx = l.x; vv.cz = l.z; vv.s = Math.max(vv.s, 0.9); dirty.current = true; bump((n) => n + 1); }}>
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
        <button className="wide" onClick={fitAll}>Whole city</button>
        <button className="wide" onClick={findMe}>Find me</button>
      </div>
      
    </div>
  );
}

/** The hour and weekday in Lagos right now, for opening hours. */
export function lagosNow(): { hour: number; weekday: number } {
  const m = lagosMinuteNow();
  const day = Math.floor(m / 1440) + 1; // Day 1 is Thursday 1 January 2026
  return { hour: (m % 1440) / 60, weekday: (day + 3) % 7 };
}
