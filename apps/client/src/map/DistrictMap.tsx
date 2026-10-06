import { useMemo, useRef, useState } from "react";
import type { District } from "@thelife/game-core";
import { PIN_STYLE } from "./pins";
import { GameIcon, iconPath } from "../ui/icons";

interface Props {
  district: District;
  /** Where the player is (a blue dot), if known. */
  player?: { x: number; z: number } | null;
  /** Other players online (green dots). */
  others?: { id: string; name: string; x: number; z: number }[];
  home?: { x: number; z: number } | null;
  selected?: string | null;
  onSelect?(id: string | null): void;
  dark?: boolean;
  /** Small corner map: no zoom buttons, labels hidden. */
  compact?: boolean;
}

const LIGHT = { land: "#d9e6c6", road: "#ffffff", roadEdge: "#b8b3a6", block: "#e9e4d8", lot: "#cfc8b8", paving: "#c4c1b8", field: "#d3c68f", water: "#b9d8ee", runway: "#6b7078", park: "#bcd69b", text: "#2a2a2a" };
const DARK = { land: "#1a2230", road: "#33425a", roadEdge: "#22304a", block: "#202a3a", lot: "#2e3b52", paving: "#2b3446", field: "#2a3a2c", water: "#14304a", runway: "#3a414d", park: "#1f3a2a", text: "#e8edf5" };

/** A drawn map of the neighbourhood from the same data the 3D world is built from: roads, blocks, buildings, and a pin on every named place. */
export default function DistrictMap({ district, player = null, others = [], home = null, selected = null, onSelect, dark = false, compact = false }: Props) {
  const col = dark ? DARK : LIGHT;
  const H = district.bounds.maxX;
  const [view, setView] = useState({ cx: 0, cz: 0, span: H * 2 });
  const drag = useRef<{ x: number; y: number; cx: number; cz: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const layers = useMemo(
    () => ({
      blocks: district.blocks.map((b, i) => <rect key={i} x={b.area.minX} y={b.area.minZ} width={b.area.maxX - b.area.minX} height={b.area.maxZ - b.area.minZ} fill={b.kind === "park" ? col.park : b.kind === "farm" ? col.field : col.block} />),
      lots: district.lots.map((l) => <rect key={l.id} x={l.footprint.minX} y={l.footprint.minZ} width={l.footprint.maxX - l.footprint.minX} height={l.footprint.maxZ - l.footprint.minZ} fill={l.landmark ? PIN_STYLE[l.landmark].colour : col.lot} opacity={l.landmark ? 0.85 : 1} />),
      roads: district.roads.map((r, i) => <rect key={i} x={r.minX} y={r.minZ} width={r.maxX - r.minX} height={r.maxZ - r.minZ} fill={col.road} stroke={col.roadEdge} strokeWidth={0.6} />),
      paving: district.paving.map((r, i) => <rect key={i} x={r.minX} y={r.minZ} width={r.maxX - r.minX} height={r.maxZ - r.minZ} fill={col.paving} />),
    }),
    [district, col],
  );

  const span = view.span;
  const vx = Math.max(-H, Math.min(H - span, view.cx - span / 2));
  const vz = Math.max(-H, Math.min(H - span, view.cz - span / 2));
  const pin = (span / 432) * (compact ? 22 : 15);

  const zoom = (factor: number) => setView((v) => ({ ...v, span: Math.max(80, Math.min(H * 2, v.span * factor)) }));
  const centreOn = (p: { x: number; z: number } | null | undefined) => p && setView((v) => ({ ...v, cx: p.x, cz: p.z, span: Math.min(v.span, 160) }));

  return (
    <div className={`dmap${compact ? " is-compact" : ""}`}>
      <svg
        ref={svgRef}
        viewBox={`${vx} ${vz} ${span} ${span}`}
        role="img"
        aria-label="Map of the neighbourhood"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz, moved: false };
          (e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || compact) return;
          const rect = svgRef.current!.getBoundingClientRect();
          const dx = ((e.clientX - d.x) / rect.width) * span;
          const dz = ((e.clientY - d.y) / rect.height) * span;
          if (Math.abs(dx) + Math.abs(dz) > 1.5) d.moved = true;
          if (d.moved) setView((v) => ({ ...v, cx: d.cx - dx, cz: d.cz - dz }));
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) onSelect?.(null);
        }}
      >
        <rect x={-H - 200} y={-H - 200} width={H * 2 + 400} height={H * 2 + 400} fill={col.land} />
        {layers.blocks}
        {layers.paving}
        <rect x={district.runway.minX} y={district.runway.minZ} width={district.runway.maxX - district.runway.minX} height={district.runway.maxZ - district.runway.minZ} fill={col.runway} />
        {layers.roads}
        {layers.lots}
        {district.landmarks.map((l) => {
          const on = selected === l.id;
          const s = PIN_STYLE[l.kind];
          const r = pin * (on ? 1.35 : 1);
          return (
            <g
              key={l.id}
              transform={`translate(${l.x} ${l.z})`}
              style={{ cursor: onSelect ? "pointer" : "default" }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => {
                e.stopPropagation();
                onSelect?.(l.id);
              }}
            >
              {on && <circle r={r * 1.7} fill={s.colour} opacity={0.25} />}
              <circle r={r} fill={s.colour} stroke="#fff" strokeWidth={r * 0.14} />
              {(() => {
                const g = iconPath(s.icon);
                if (!g) return null;
                const k = (r * 1.1) / Math.max(g.box[0], g.box[1]);
                return <path d={g.d} fill="#fff" transform={`translate(${(-g.box[0] * k) / 2} ${(-g.box[1] * k) / 2}) scale(${k})`} style={{ pointerEvents: "none" }} />;
              })()}
              {!compact && span < 300 && (
                <text y={r * 1.9} textAnchor="middle" fontSize={r * 0.82} fill={col.text} stroke={dark ? "#0b0f17" : "#ffffff"} strokeWidth={r * 0.2} paintOrder="stroke" style={{ pointerEvents: "none" }}>
                  {l.name}
                </text>
              )}
            </g>
          );
        })}
        {home && (
          <g transform={`translate(${home.x} ${home.z})`} style={{ pointerEvents: "none" }}>
            <circle r={pin * 0.9} fill="#14110f" stroke="#fff" strokeWidth={pin * 0.14} />
            <text textAnchor="middle" dominantBaseline="central" fontSize={pin * 0.95} fill="#fff">⌂</text>
          </g>
        )}
        {others.map((o) => (
          <g key={o.id} transform={`translate(${o.x} ${o.z})`} style={{ pointerEvents: "none" }}>
            <circle r={pin * 0.42} fill="#2fbf71" stroke="#fff" strokeWidth={pin * 0.1} />
            {!compact && span < 300 && <text y={-pin * 0.7} textAnchor="middle" fontSize={pin * 0.6} fill="#0b3d22" stroke="#fff" strokeWidth={pin * 0.14} paintOrder="stroke">{o.name}</text>}
          </g>
        ))}
        {player && (
          <g transform={`translate(${player.x} ${player.z})`} style={{ pointerEvents: "none" }}>
            <circle r={pin * 1.5} fill="#2f7bff" opacity={0.22} />
            <circle r={pin * 0.6} fill="#2f7bff" stroke="#fff" strokeWidth={pin * 0.2} />
          </g>
        )}
      </svg>
      {!compact && (
        <div className="dmap-tools">
          <button onClick={() => zoom(0.7)} aria-label="Zoom in">+</button>
          <button onClick={() => zoom(1 / 0.7)} aria-label="Zoom out">−</button>
          <button onClick={() => centreOn(player ?? home)} aria-label="Centre on me"><GameIcon name="spot" size={16} /></button>
        </div>
      )}
    </div>
  );
}
