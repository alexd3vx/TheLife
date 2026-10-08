import { useEffect, useState } from "react";
import { LagosScene } from "./LagosScene";

/**
 * The sign-in film: a short golden-hour Lagos sequence made with the game's own street and people (see tools/film/render_cine.mjs), played
 * silently behind the sign-in form. The painted skyline sits underneath, so there is never an empty screen: it shows while the video loads,
 * if it cannot play, on a data saver, and for anyone who asked their device for less motion.
 */
const wantsStill = (): boolean => {
  try {
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches || nav.connection?.saveData === true;
  } catch {
    return false;
  }
};

export function AuthFilm() {
  const [portrait, setPortrait] = useState(() => window.matchMedia("(max-aspect-ratio: 1/1)").matches);
  const [playing, setPlaying] = useState(false);
  const [still] = useState(wantsStill);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const q = window.matchMedia("(max-aspect-ratio: 1/1)");
    const on = () => setPortrait(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);

  const name = portrait ? "signin-portrait" : "signin-wide";
  const base = `/assets/film/${name}`;
  return (
    <>
      <LagosScene />
      {!still && !failed && (
        <div className={`auth-film${playing ? " is-playing" : ""}`} aria-hidden="true">
          <video key={name} autoPlay muted loop playsInline preload="auto" poster={`${base}.jpg`} onPlaying={() => setPlaying(true)} onError={() => setFailed(true)}>
            <source src={`${base}.webm`} type="video/webm" />
            <source src={`${base}.mp4`} type="video/mp4" />
          </video>
        </div>
      )}
      <div className="auth-film-shade" aria-hidden="true" />
    </>
  );
}
