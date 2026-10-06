import { useCallback, useEffect, useRef, useState } from "react";
import { GameIcon, type FaName } from "../ui/icons";
import { getSettings, updateSettings, useSettings } from "../settings/settings";
import { DEFAULT_TOUCH, TOUCH_LABEL, type TouchId, type TouchSpot } from "./bindings";
import { input } from "./input";
import "./touch.css";

const BUTTONS: { id: Exclude<TouchId, "stick">; icon: FaName; label: string }[] = [
  { id: "interact", icon: "hand", label: "Interact" },
  { id: "run", icon: "run", label: "Run" },
  { id: "phone", icon: "phone", label: "Phone" },
  { id: "camera", icon: "camera", label: "Camera behind me" },
];

export const isTouchDevice = () => (window.matchMedia?.("(pointer: coarse)").matches ?? false) || "ontouchstart" in window;

export function useTouchControlsVisible(): boolean {
  const s = useSettings();
  return s.touchControls === "on" || (s.touchControls === "auto" && isTouchDevice());
}

function buzz(ms = 12) {
  if (getSettings().haptics && "vibrate" in navigator) navigator.vibrate(ms);
}

/**
 * The on-screen controls: a stick on the left, buttons on the right. Everything sits where the player put it (and at the size they chose);
 * dragging anywhere else on the screen turns the camera. With `editing`, each piece can be dragged and resized instead of used.
 */
export default function TouchControls({ editing = false, nearLabel, onPhone }: { editing?: boolean; nearLabel?: string | null; onPhone?(): void }) {
  const s = useSettings();
  const [selected, setSelected] = useState<TouchId | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const spotStyle = (spot: TouchSpot): React.CSSProperties => ({ ["--x" as string]: `${spot.x * 100}%`, ["--y" as string]: `${spot.y * 100}%`, ["--s" as string]: spot.s });

  // Moving a control in the editor.
  const dragFor = useCallback(
    (id: TouchId) => (e: React.PointerEvent) => {
      if (!editing) return;
      e.preventDefault();
      e.stopPropagation();
      setSelected(id);
      const box = root.current!.getBoundingClientRect();
      const move = (ev: PointerEvent) => {
        const x = Math.max(0.04, Math.min(0.96, (ev.clientX - box.left) / box.width));
        const y = Math.max(0.06, Math.min(0.94, 1 - (ev.clientY - box.top) / box.height));
        updateSettings({ touch: { ...getSettings().touch, [id]: { ...getSettings().touch[id], x, y } } });
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [editing],
  );

  return (
    <div ref={root} className={`touch${editing ? " is-editing" : ""}`} style={{ ["--op" as string]: s.touchOpacity }}>
      {(editing || !s.touch.stick.hidden) && <Stick spot={s.touch.stick} style={spotStyle(s.touch.stick)} editing={editing} selected={selected === "stick"} onEditDown={dragFor("stick")} />}
      {BUTTONS.map((b) => {
        const spot = s.touch[b.id];
        if (spot.hidden && !editing) return null;
        const label = b.id === "interact" && nearLabel ? nearLabel : b.label;
        return (
          <button
            key={b.id}
            className={`touch-btn touch-${b.id}${spot.hidden ? " is-hidden" : ""}${selected === b.id ? " is-selected" : ""}${b.id === "interact" && nearLabel ? " is-hot" : ""}`}
            style={spotStyle(spot)}
            aria-label={label}
            onPointerDown={(e) => {
              if (editing) return dragFor(b.id)(e);
              e.preventDefault();
              buzz();
              if (b.id === "run") input.setRun(true);
              else if (b.id === "phone" && onPhone) onPhone();
              else input.press(b.id === "camera" ? "resetCamera" : b.id === "phone" ? "phone" : "interact");
            }}
            onPointerUp={() => b.id === "run" && !editing && input.setRun(false)}
            onPointerCancel={() => b.id === "run" && input.setRun(false)}
            onPointerLeave={() => b.id === "run" && input.setRun(false)}
          >
            <GameIcon name={b.icon} size={22} />
            {b.id === "interact" && nearLabel && !editing && <span className="touch-label">{nearLabel}</span>}
          </button>
        );
      })}
      {editing && selected && (
        <div className="touch-edit-bar" onPointerDown={(e) => e.stopPropagation()}>
          <strong>{TOUCH_LABEL[selected]}</strong>
          <label>
            Size
            <input type="range" min={0.6} max={1.8} step={0.05} value={s.touch[selected].s} onChange={(e) => updateSettings({ touch: { ...s.touch, [selected]: { ...s.touch[selected], s: Number(e.target.value) } } })} />
          </label>
          <button onClick={() => updateSettings({ touch: { ...s.touch, [selected]: { ...s.touch[selected], hidden: !s.touch[selected].hidden } } })}>{s.touch[selected].hidden ? "Show" : "Hide"}</button>
          <button onClick={() => updateSettings({ touch: { ...s.touch, [selected]: { ...DEFAULT_TOUCH[selected] } } })}>Reset this</button>
        </div>
      )}
    </div>
  );
}

function Stick({ spot, style, editing, selected, onEditDown }: { spot: TouchSpot; style: React.CSSProperties; editing: boolean; selected: boolean; onEditDown(e: React.PointerEvent): void }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);

  useEffect(() => () => input.setStick(0, 0), []);

  const set = (clientX: number, clientY: number) => {
    const r = base.current!.getBoundingClientRect();
    const radius = r.width / 2;
    let dx = clientX - (r.left + radius), dy = clientY - (r.top + radius);
    const len = Math.hypot(dx, dy);
    const max = radius * 0.8;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    setKnob({ x: dx, y: dy });
    const m = Math.min(1, Math.hypot(dx, dy) / max);
    const dead = m < 0.12 ? 0 : m;
    input.setStick(len > 0 ? (dx / Math.max(len, 1)) * dead : 0, len > 0 ? (-dy / Math.max(len, 1)) * dead : 0);
  };

  return (
    <div
      ref={base}
      className={`touch-stick${selected ? " is-selected" : ""}`}
      style={style}
      onPointerDown={(e) => {
        if (editing) return onEditDown(e);
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        active.current = e.pointerId;
        set(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (active.current === e.pointerId) set(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (active.current !== e.pointerId) return;
        active.current = null;
        setKnob({ x: 0, y: 0 });
        input.setStick(0, 0);
      }}
      onPointerCancel={() => {
        active.current = null;
        setKnob({ x: 0, y: 0 });
        input.setStick(0, 0);
      }}
      aria-label="Move"
    >
      <div className="touch-stick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      <span className="touch-stick-ring" aria-hidden="true" />
      {spot.hidden && editing && <em>hidden</em>}
    </div>
  );
}
