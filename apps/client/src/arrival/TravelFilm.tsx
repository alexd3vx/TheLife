import { useEffect, useRef } from "react";
import { FilmRenderer } from "./filmCanvas";
import "./arrival.css";

type Tier = "lapo" | "middle" | "nepo";

/**
 * A short scene for a trip across Lagos: the road, the traffic and the vehicle that suits who you are, drawn in the same hand-inked
 * style as the arrival film. It covers the screen while the character is moved, then hands the city back.
 */
export default function TravelFilm({ tier, to, line, seconds, onDone }: { tier: Tier; to: string; line: string; seconds: number; onDone(): void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = window.setTimeout(() => done.current(), seconds * 1000);
    return () => window.clearTimeout(t);
  }, [seconds]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = new FilmRenderer(canvas, tier);
    r.setHour(new Date().getUTCHours() + 1);
    r.setBeat("ride");
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
  }, [tier]);
  return (
    <div className={`film film-${tier} beat-ride travel`} role="status" aria-label={`On the way to ${to}`} onPointerDown={() => done.current()}>
      <canvas ref={canvasRef} className="film-canvas" />
      <div className="film-vignette" />
      <div className="film-bars top" />
      <div className="film-bars bottom" />
      <div className="film-caption">
        <small>On the way to {to}</small>
        <p>{line}</p>
      </div>
      <button className="film-skip" onClick={(e) => { e.stopPropagation(); done.current(); }}>Skip</button>
    </div>
  );
}
