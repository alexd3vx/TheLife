import { useEffect, useRef, useState } from "react";
import { FilmRenderer, type FilmBeat } from "./filmCanvas";
import "./arrival.css";

type Tier = "lapo" | "middle" | "nepo";

interface Beat {
  /** Seconds this part lasts. */
  secs: number;
  kind: "title" | FilmBeat;
}

const TIMELINE: Beat[] = [
  { secs: 3.4, kind: "title" },
  { secs: 5.5, kind: "flight" },
  { secs: 8.2, kind: "landing" },
  { secs: 4, kind: "taxi" },
  { secs: 7.5, kind: "ride" },
  { secs: 3.8, kind: "home" },
];

const WORDS: Record<Tier, { flight: string; flightSub: string; landed: string; landedSub: string; ride: string; rideSub: string; home: string }> = {
  nepo: {
    flight: "Private jet",
    flightSub: "Cruising into Lagos. The city lights are coming up.",
    landed: "Welcome to Lagos",
    landedSub: "Murtala Muhammed Airport, private terminal. Your driver is waiting at the steps.",
    ride: "Black SUV, security car behind",
    rideSub: "Straight past the traffic. Ikoyi is quiet tonight.",
    home: "Home. The gate opens.",
  },
  middle: {
    flight: "Economy, seat 23C",
    flightSub: "A fair flight, a long queue behind you. Lagos is below.",
    landed: "Welcome to Lagos",
    landedSub: "Murtala Muhammed Airport. Bags collected. Your ride is booked.",
    ride: "A taxi through the evening rush",
    rideSub: "Third Mainland Bridge, windows down, the radio loud.",
    home: "Home. You find the key.",
  },
  lapo: {
    flight: "The cheapest seat on the plane",
    flightSub: "Tired already. You count your money one more time.",
    landed: "Welcome to Lagos",
    landedSub: "Murtala Muhammed Airport. No one is waiting for you. That is fine.",
    ride: "Bargaining for a keke, then a danfo",
    rideSub: "Fifteen hundred naira, and a long way to Isale Eko.",
    home: "Home. One room, one door.",
  },
};

/**
 * The opening film, played once when a new character is made: the flight into Lagos, a real landing (glide, touchdown, tyre smoke, roll-out),
 * the taxi to the terminal, the ride to the front door in a vehicle that matches the person's background, and the door itself. It is drawn
 * on one canvas from a few pre-painted layers, so it runs smoothly on weak phones. Tap to skip.
 */
export default function ArrivalFilm({ tier, onDone }: { tier: Tier; onDone(): void }) {
  const [i, setI] = useState(0);
  const beat = TIMELINE[i]!;
  const words = WORDS[tier];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<FilmRenderer | null>(null);

  // The page around the film redraws all the time; the film's own clock must not restart each time it does.
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = window.setTimeout(() => (i + 1 >= TIMELINE.length ? done.current() : setI(i + 1)), beat.secs * 1000);
    return () => window.clearTimeout(t);
  }, [i, beat.secs]);

  // One drawing loop for the whole film.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = new FilmRenderer(canvas, tier);
    renderer.current = r;
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
  useEffect(() => {
    if (beat.kind !== "title") renderer.current?.setBeat(beat.kind);
  }, [beat.kind]);

  return (
    <div className={`film film-${tier} beat-${beat.kind}`} role="presentation" onPointerDown={onDone}>
      <canvas ref={canvasRef} className={`film-canvas${beat.kind === "title" ? " is-hidden" : ""}`} />
      <div className="film-vignette" />
      <div className="film-bars top" />
      <div className="film-bars bottom" />

      {beat.kind === "title" && (
        <div className="film-title">
          <span className="film-flare" />
          <small>Alexion Studios presents</small>
          <h1>TheLife</h1>
          <em>A new life in Lagos</em>
        </div>
      )}

      {beat.kind === "flight" && (
        <div className="film-caption">
          <small>{words.flight}</small>
          <p>{words.flightSub}</p>
        </div>
      )}

      {beat.kind === "landing" && (
        <div className="film-caption">
          <small>Lagos, evening</small>
          <p>Lights below. Wheels down in a moment.</p>
        </div>
      )}

      {beat.kind === "taxi" && (
        <div className="film-landed">
          <small>{words.landed}</small>
          <h2>Murtala Muhammed International</h2>
          <p>{words.landedSub}</p>
        </div>
      )}

      {beat.kind === "ride" && (
        <div className="film-caption">
          <small>{words.ride}</small>
          <p>{words.rideSub}</p>
        </div>
      )}

      {beat.kind === "home" && (
        <div className="film-landed">
          <small>Your door</small>
          <h2>{words.home}</h2>
        </div>
      )}

      <button className="film-skip" onClick={(e) => { e.stopPropagation(); onDone(); }}>Skip</button>
      <div className="film-progress"><span style={{ width: `${((i + 1) / TIMELINE.length) * 100}%` }} /></div>
    </div>
  );
}
