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

const LIGHT = { water: [185, 216, 238], street: [255, 255, 255], block: [232, 214, 190], park: [176, 208, 140], market: [236, 170, 120], text: "#2a2a2a" } as const;
const DARK = { water: [20, 48, 74], street: [58, 72, 96], block: [38, 48, 66], park: [32, 62, 44], market: [90, 62, 44], text: "#e8edf5" } as const;

/** The map picture, drawn once from the island's ground data (water, streets, blocks, parks, the market) and reused. */
const pictures = new Map<string, string>();
function mapPicture(district: District, dark: boolean): string {
  const key = dark ? "dark" : "light";
  const hit = pictures.get(key);
  if (hit) return hit;
  const t = district.terrain!;
  const pal = dark ? DARK : LIGHT;
  const S = 2;
  const canvas = document.createElement("canvas");
  canvas.width = t.width * S;
  canvas.height = t.height * S;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const c = t.classAt(((x + 0.5) / S) * t.cell, ((y + 0.5) / S) * t.cell);
      const rgb = c === 0 ? pal.water : c === 1 ? pal.street : c === 2 ? pal.block : c === 3 ? pal.park : pal.market;
      const o = (y * canvas.width + x) * 4;
      img.data[o] = rgb[0];
      img.data[o + 1] = rgb[1];
      img.data[o + 2] = rgb[2];
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL("image/png");
  pictures.set(key, url);
  return url;
}

/** A drawn map of the island from the same data the 3D world is built from, with a pin on every named place. */
export default function DistrictMap({ district, player = null, others = [], home = null, selected = null, onSelect, dark = false, compact = false }: Props) {
  const col = dark ? DARK : LIGHT;
  const W = district.bounds.maxX;
  const Hh = district.bounds.maxZ;
  const [view, setView] = useState({ cx: district.spawn.x, cz: district.spawn.z, span: compact ? 520 : Math.max(W, Hh) });
  const drag = useRef<{ x: number; y: number; cx: number; cz: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const picture = useMemo(() => mapPicture(district, dark), [district, dark]);
  const lotLayer = useMemo(
    () => district.lots.filter((l) => l.landmark).map((l) => <rect key={l.id} x={l.footprint.minX} y={l.footprint.minZ} width={l.footprint.maxX - l.footprint.minX} height={l.footprint.maxZ - l.footprint.minZ} fill={PIN_STYLE[l.landmark!].colour} opacity={0.9} />),
    [district],
  );

  // A compact map follows the player.
  const centre = compact && player ? player : { x: view.cx, z: view.cz };
  const span = view.span;
  const vx = Math.max(Math.min(0, W - span), Math.min(W - span, centre.x - span / 2));
  const vz = Math.max(Math.min(0, Hh - span), Math.min(Hh - span, centre.z - span / 2));
  const pin = (span / 432) * (compact ? 22 : 15);

  const zoom = (factor: number) => setView((v) => ({ ...v, span: Math.max(80, Math.min(Math.max(W, Hh), v.span * factor)) }));
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
        <image href={picture} x={0} y={0} width={W} height={Hh} preserveAspectRatio="none" />
        {lotLayer}
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
              {!compact && span < 900 && (
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
            {!compact && span < 900 && <text y={-pin * 0.7} textAnchor="middle" fontSize={pin * 0.6} fill="#0b3d22" stroke="#fff" strokeWidth={pin * 0.14} paintOrder="stroke">{o.name}</text>}
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
