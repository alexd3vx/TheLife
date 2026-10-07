import { useEffect, useRef } from "react";
import type { Look } from "../lab/looks";
import { PaperDoll } from "./paperdoll";
import { sharpNow } from "./assets";
import { LiveChar } from "./livechar";
import { getSettings } from "../settings/settings";

const DIRS = 8;

/**
 * The character studio's stage: a painted corner of a room with the person standing in it, drawn from their sprite layers. Drag to
 * turn them; the walk button shows how they move. Nothing here is 3D.
 */
export default function StudioStage({ look, walking, onBusy }: { look: Look; walking: boolean; onBusy?(busy: boolean): void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const doll = useRef<PaperDoll | null>(null);
  const state = useRef({ dir: 0, yaw: Math.PI / 4, walking, spin: 0, turned: 0 });
  const live = useRef<LiveChar | null>(null);
  const liveFailed = useRef(false);
  state.current.walking = walking;
  const lookRef = useRef(look);
  lookRef.current = look;

  // the look changed: restack the layers
  useEffect(() => {
    let d = doll.current;
    if (!d) d = doll.current = new PaperDoll(look);
    onBusy?.(true);
    const mine = d;
    if (!liveFailed.current && !new URLSearchParams(window.location.search).has("sprites")) {
      // the live 3D figure (sharp at any size, turns smoothly); the picture stack below is only the fallback
      const l = live.current;
      if (!l) {
        const made = (live.current = new LiveChar(look));
        made.load().then(() => onBusy?.(false), () => { liveFailed.current = true; live.current = null; void mine.setLook(look).then(() => mine.prepare(["Idle_Loop", "Walk_Loop"])).then(() => onBusy?.(false)); });
      } else void l.setLook(look).then(() => onBusy?.(false));
      return;
    }
    void mine.setLook(look).then(() => mine.prepare(["Idle_Loop", "Walk_Loop"])).then(() => onBusy?.(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look]);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let drag: { x: number; dir: number; yaw: number } | null = null;
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, dir: state.current.dir, yaw: state.current.yaw };
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      state.current.dir = (((drag.dir + Math.round((e.clientX - drag.x) / 46)) % DIRS) + DIRS) % DIRS;
      state.current.yaw = drag.yaw + (e.clientX - drag.x) * 0.012;
    };
    const up = () => (drag = null);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      t += dt;
      const dpr = Math.min(window.devicePixelRatio || 1, getSettings().resolution);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintStage(ctx, w, h, t);
      const l = live.current;
      if (l?.ready) {
        l.play(state.current.walking ? "Walk_Loop" : "Idle_Loop");
        l.tick(dt);
        const k = Math.min(h / 250, w / 190); // screen pixels per picture pixel
        const f = l.draw(state.current.yaw, k * dpr, 12);
        if (f) {
          const ox = w / 2, oy = h * 0.82;
          ctx.fillStyle = "rgba(14, 26, 54,.28)";
          ctx.beginPath();
          ctx.ellipse(ox, oy + 4, 38 * k, 11 * k, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.drawImage(f.img, ox - f.ax * k, oy - f.ay * k, f.w * k, f.h * k);
        }
        return;
      }
      const d = doll.current;
      if (!d) return;
      const clip = state.current.walking ? "Walk_Loop" : "Idle_Loop";
      const n = d.count(clip, state.current.dir);
      if (!n) return;
      const f = d.frame(clip, state.current.dir, Math.floor(t * (state.current.walking ? 10 : 4)) % n);
      if (!f) return;
      const k = Math.min(h / 300, w / 215); // screen pixels per game pixel (a person is about 140 game pixels tall)
      const s = k / sharpNow.char; // the pictures were drawn this many times larger than the screen size
      const sx = s * (lookRef.current.build ?? 1), sy = s * (lookRef.current.height ?? 1);
      const ox = w / 2, oy = h * 0.8;
      // a soft shadow, then the person
      ctx.fillStyle = "rgba(14, 26, 54,.28)";
      ctx.beginPath();
      ctx.ellipse(ox, oy + 4, 38 * k, 11 * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(f.img, ox - f.ax * sx, oy - f.ay * sy, f.w * sx, f.h * sy);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      live.current?.dispose();
      live.current = null;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={ref} className="studio-canvas" aria-label="Your character. Drag to turn them." />;
}

/** A corner of a painted room: warm wall, wooden floor, a window of evening light. */
function paintStage(c: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const wall = c.createLinearGradient(0, 0, 0, h * 0.62);
  wall.addColorStop(0, "#c9d9f2");
  wall.addColorStop(1, "#a9bde0");
  c.fillStyle = wall;
  c.fillRect(0, 0, w, h);
  // floor: a big diamond of planks
  const cx = w / 2, cy = h * 0.8, rw = w * 0.62, rh = rw * 0.5;
  c.save();
  c.beginPath();
  c.moveTo(cx, cy - rh);
  c.lineTo(cx + rw, cy);
  c.lineTo(cx, cy + rh);
  c.lineTo(cx - rw, cy);
  c.closePath();
  const floor = c.createLinearGradient(0, cy - rh, 0, cy + rh);
  floor.addColorStop(0, "#7d92bd");
  floor.addColorStop(1, "#617aa8");
  c.fillStyle = floor;
  c.fill();
  c.clip();
  c.strokeStyle = "rgba(14, 26, 54,.25)";
  c.lineWidth = 1.5;
  for (let i = -12; i <= 12; i++) {
    c.beginPath();
    c.moveTo(cx - rw + i * rw * 0.09, cy - rh);
    c.lineTo(cx + i * rw * 0.09 + rw, cy + rh * 0.0);
    c.stroke();
  }
  c.restore();
  // a window and its light
  const wx = w * 0.18, wy = h * 0.12, ww = w * 0.2, wh = h * 0.3;
  c.fillStyle = "#bfe3f5";
  c.fillRect(wx, wy, ww, wh);
  c.strokeStyle = "#33466e";
  c.lineWidth = 5;
  c.strokeRect(wx, wy, ww, wh);
  c.beginPath();
  c.moveTo(wx + ww / 2, wy);
  c.lineTo(wx + ww / 2, wy + wh);
  c.moveTo(wx, wy + wh / 2);
  c.lineTo(wx + ww, wy + wh / 2);
  c.stroke();
  c.save();
  c.globalCompositeOperation = "lighter";
  const sway = Math.sin(t * 0.4) * 6;
  c.fillStyle = "rgba(168, 200, 255,.16)";
  c.beginPath();
  c.moveTo(wx, wy + wh);
  c.lineTo(wx + ww, wy + wh);
  c.lineTo(cx + 80 + sway, cy + 30);
  c.lineTo(cx - 120 + sway, cy + 60);
  c.closePath();
  c.fill();
  c.restore();
  // vignette
  const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, "rgba(14, 26, 54,0)");
  v.addColorStop(1, "rgba(14, 26, 54,.35)");
  c.fillStyle = v;
  c.fillRect(0, 0, w, h);
}
