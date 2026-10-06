import { useEffect, useRef, useState } from "react";
import { LagosScene } from "../ui/LagosScene";
import "./arrival.css";

type Tier = "lapo" | "middle" | "nepo";

interface Beat {
  /** Seconds this part lasts. */
  secs: number;
  kind: "title" | "flight" | "approach" | "landed" | "ride" | "home";
}

const TIMELINE: Beat[] = [
  { secs: 3.6, kind: "title" },
  { secs: 6.5, kind: "flight" },
  { secs: 5.5, kind: "approach" },
  { secs: 5, kind: "landed" },
  { secs: 6, kind: "ride" },
  { secs: 3, kind: "home" },
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

const PLANE = "M0 14 L58 10 Q74 8 92 12 L96 14 Q74 18 60 18 L40 18 L18 36 L8 36 L22 18 L6 18 L2 28 L-4 28 L0 14Z";
const JET = "M0 12 L40 9 Q52 8 62 11 L64 12 Q52 15 42 15 L28 15 L12 28 L6 28 L16 15 L4 15 L0 22 L-4 22 L-2 12Z";

/**
 * The opening film, played once when a new character is made: the flight into Lagos, the landing, the ride to the front door. It
 * is drawn with vectors and CSS (no download, no heavy 3D), tinted differently for each background. Tap to skip.
 */
export default function ArrivalFilm({ tier, onDone }: { tier: Tier; onDone(): void }) {
  const [i, setI] = useState(0);
  const beat = TIMELINE[i]!;
  const words = WORDS[tier];

  // The page around the film redraws all the time; the film's own clock must not restart each time it does.
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = window.setTimeout(() => (i + 1 >= TIMELINE.length ? done.current() : setI(i + 1)), beat.secs * 1000);
    return () => window.clearTimeout(t);
  }, [i, beat.secs]);

  return (
    <div className={`film film-${tier} beat-${beat.kind}`} role="presentation" onPointerDown={onDone}>
      {beat.kind !== "title" && <LagosScene />}
      <div className="film-tint" />
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
        <>
          <svg className="film-plane" viewBox="-10 0 110 40" aria-hidden="true">
            <path d={tier === "nepo" ? JET : PLANE} fill="#0e0a18" />
            <circle cx={tier === "nepo" ? 62 : 90} cy="13" r="1.8" fill="#ff5a4a" className="film-blink" />
            <circle cx="8" cy="30" r="1.2" fill="#6bf0b0" className="film-blink" />
          </svg>
          <div className="film-caption">
            <small>{words.flight}</small>
            <p>{words.flightSub}</p>
          </div>
        </>
      )}

      {beat.kind === "approach" && (
        <>
          <svg className="film-runway" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="rw" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#0a0714" />
                <stop offset="1" stopColor="#1a1426" />
              </linearGradient>
            </defs>
            <path d="M170 120 L230 120 L400 300 L0 300Z" fill="url(#rw)" />
            {Array.from({ length: 14 }, (_, k) => (
              <g key={k} className="rw-light" style={{ animationDelay: `${-k * 0.22}s` }}>
                <circle cx={176 - k * 12} cy={126 + k * 12.5} r={1 + k * 0.28} fill="#ffe9a8" />
                <circle cx={224 + k * 12} cy={126 + k * 12.5} r={1 + k * 0.28} fill="#ffe9a8" />
              </g>
            ))}
            <path d="M200 124 L200 300" stroke="#e8e0c8" strokeWidth="3" strokeDasharray="10 14" className="rw-centre" />
          </svg>
          <div className="film-caption">
            <small>Lagos, evening</small>
            <p>Wheels down in a moment.</p>
          </div>
        </>
      )}

      {beat.kind === "landed" && (
        <div className="film-landed">
          <small>{words.landed}</small>
          <h2>Murtala Muhammed International</h2>
          <p>{words.landedSub}</p>
        </div>
      )}

      {beat.kind === "ride" && (
        <>
          <div className="film-road">
            <div className="film-car">
              <span className="film-car-body" />
              <span className="film-car-lamp" />
            </div>
            <div className="film-lane" />
          </div>
          <div className="film-caption">
            <small>{words.ride}</small>
            <p>{words.rideSub}</p>
          </div>
        </>
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
