import { useEffect, useRef } from "react";
import { FilmRenderer } from "./filmCanvas";
import "./arrival.css";

const hello = (hour: number) => (hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : hour < 21 ? "Good evening" : "Good night");

/**
 * For someone coming back to their life: Lagos at the real time of day drifts past, a greeting, and what has changed. It is short and
 * can be skipped with a tap. (The long arrival film is only for a brand new person.)
 */
export default function WelcomeBack({ name, tier, hour, date, time, awayCount, onDone }: { name: string; tier: "lapo" | "middle" | "nepo"; hour: number; date: string; time: string; awayCount: number; onDone(): void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = window.setTimeout(() => done.current(), 4200);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = new FilmRenderer(canvas, tier);
    r.setHour(hour);
    r.setBeat("welcome");
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      r.draw(dt);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tier, hour]);
  return (
    <div className="film welcome" role="presentation" onPointerDown={onDone}>
      <canvas ref={canvasRef} className="film-canvas" />
      <div className="film-vignette" />
      <div className="film-bars top" />
      <div className="film-bars bottom" />
      <div className="welcome-text">
        <small>{hello(hour)}</small>
        <h2>Welcome back, {name}</h2>
        <p>{date} · {time} in Lagos</p>
        {awayCount > 0 && <em>{awayCount} thing{awayCount === 1 ? "" : "s"} happened while you were away.</em>}
      </div>
      <button className="film-skip" onClick={(e) => { e.stopPropagation(); onDone(); }}>Skip</button>
    </div>
  );
}
