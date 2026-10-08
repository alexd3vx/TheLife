import { useEffect, useRef, useState } from "react";
import { CITY_SECS, CityFilm, type CityBeat } from "./cityFilm";
import { LiteFilm } from "./liteFilm";
import "./arrival.css";

type Tier = "lapo" | "middle" | "nepo";

interface Beat {
  /** Seconds this part lasts. */
  secs: number;
  kind: "title" | CityBeat;
}

const TIMELINE: Beat[] = [
  { secs: 3.2, kind: "title" },
  { secs: CITY_SECS.arrive, kind: "arrive" },
  { secs: CITY_SECS.ride, kind: "ride" },
  { secs: CITY_SECS.street, kind: "street" },
  { secs: CITY_SECS.face, kind: "face" },
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
 * the taxi to the terminal, the ride to the front door in a vehicle that matches the person's background, and the door itself. It is real 3D
 * with the player's own character (a few simple sets, so it runs on weak phones). Tap to skip.
 */
/** A phone (or any small or touch screen): the street is played as a video and only the person is drawn live, so it stays smooth. */
const smallScreen = (): boolean => {
  try {
    return window.matchMedia("(pointer: coarse)").matches || Math.min(window.innerWidth, window.innerHeight) < 700;
  } catch {
    return false;
  }
};

interface Reel {
  setBeat(kind: CityBeat): void;
  draw(dt: number): void;
  dispose(): void;
}

export default function ArrivalFilm({ tier, look, onDone }: { tier: Tier; look?: string | null; onDone(): void }) {
  const [i, setI] = useState(0);
  const beat = TIMELINE[i]!;
  const words = WORDS[tier];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const renderer = useRef<Reel | null>(null);
  const beatRef = useRef<string>(beat.kind);
  beatRef.current = beat.kind;
  // on a phone the first two beats are a video; if it cannot play, the full 3D street is drawn instead
  const [videoFailed, setVideoFailed] = useState(false);
  const lite = useRef(smallScreen()).current && !videoFailed;

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
    let r: Reel;
    if (lite) {
      const l = new LiteFilm(canvas, tier, look ?? undefined);
      r = { setBeat: (k) => (k === "street" || k === "face") && l.setBeat(k), draw: (dt) => (beatRef.current === "street" || beatRef.current === "face") && l.draw(dt), dispose: () => l.dispose() };
    } else {
      const c = new CityFilm(canvas, tier, look ?? undefined);
      if (import.meta.env.DEV) (window as unknown as { __film?: CityFilm }).__film = c;
      r = c;
    }
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
    return () => {
      cancelAnimationFrame(raf);
      r.dispose();
      renderer.current = null;
    };
    // the look is read once when the film starts; changing it mid-film would restart the clock
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, lite]);
  useEffect(() => {
    if (beat.kind !== "title") renderer.current?.setBeat(beat.kind);
  }, [beat.kind, lite]);
  // the video starts with the crane shot; if it has not started moving a few seconds later it will not, so the 3D street takes over
  useEffect(() => {
    if (!lite || beat.kind !== "arrive") return;
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    void v.play().catch(() => setVideoFailed(true));
    const t = window.setTimeout(() => v.currentTime < 0.3 && setVideoFailed(true), 4000);
    return () => window.clearTimeout(t);
  }, [lite, beat.kind]);

  return (
    <div className={`film film-${tier} beat-${beat.kind}`} role="presentation" onPointerDown={onDone}>
      {lite && (
        <>
          <video ref={videoRef} className={`film-video${beat.kind === "arrive" || beat.kind === "ride" ? " is-on" : ""}`} muted playsInline preload="auto" onError={() => setVideoFailed(true)} onEnded={(e) => e.currentTarget.pause()}>
            <source src={`/assets/film/arrival-${tier}.mp4`} type="video/mp4" />
            <source src={`/assets/film/arrival-${tier}.webm`} type="video/webm" />
          </video>
          <div className={`film-plate${beat.kind === "street" ? " is-street" : beat.kind === "face" ? " is-face" : ""}`} />
        </>
      )}
      <canvas ref={canvasRef} className={`film-canvas${lite ? (beat.kind === "street" || beat.kind === "face" ? "" : " is-hidden") : beat.kind === "title" ? " is-hidden" : ""}`} />
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

      {beat.kind === "arrive" && (
        <div className="film-caption">
          <small>{words.flight}</small>
          <p>{words.flightSub}</p>
        </div>
      )}

      {beat.kind === "ride" && (
        <div className="film-caption">
          <small>{words.ride}</small>
          <p>{words.rideSub}</p>
        </div>
      )}

      {beat.kind === "street" && (
        <div className="film-landed">
          <small>{words.landed}</small>
          <h2>Welcome to Lagos</h2>
          <p>{words.landedSub}</p>
        </div>
      )}

      {beat.kind === "face" && (
        <div className="film-landed">
          <small>Your life starts here</small>
          <h2>{words.home}</h2>
        </div>
      )}

      <button className="film-skip" onClick={(e) => { e.stopPropagation(); onDone(); }}>Skip</button>
      <div className="film-progress"><span style={{ width: `${((i + 1) / TIMELINE.length) * 100}%` }} /></div>
    </div>
  );
}
