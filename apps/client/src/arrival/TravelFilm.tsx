import { useEffect, useRef } from "react";
import { RideScene, type RideKind } from "./rideScene";
import "./arrival.css";

type Tier = "lapo" | "middle" | "nepo";

/**
 * A short scene for a trip across Lagos in real 3D: the road, the traffic and the vehicle you paid for (danfo, keke, taxi or your
 * driver's car), with the city kit's buildings along the street. It covers the screen while the character is moved, then hands the city back.
 */
export default function TravelFilm({ tier, ride, hourOverride, to, line, seconds, onDone }: { tier: Tier; ride?: string; hourOverride?: number; to: string; line: string; seconds: number; onDone(): void }) {
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
    // a ride you did not pay for by name (or on foot) is the vehicle that suits who you are
    const kind: RideKind = ride === "danfo" || ride === "keke" || ride === "taxi" || ride === "driver" ? ride : tier === "nepo" ? "driver" : tier === "middle" ? "taxi" : "danfo";
    const r = new RideScene(canvas, { ride: kind, hour: hourOverride ?? (new Date().getUTCHours() + 1) % 24, mode: "ride" });
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      r.draw(dt);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      r.dispose();
    };
  }, [tier, ride]);
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
