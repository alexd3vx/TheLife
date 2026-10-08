import { useEffect, useRef } from "react";
import { CITY_SECS, CityFilm, type Tier } from "../arrival/cityFilm";

declare global {
  interface Window {
    __fr?: { ready: boolean; frames: number; frame(i: number): void; plate(): void };
  }
}

const FPS = 24;

/**
 * A developer page that plays the first two beats of the arrival film (the crane shot and the ride) one frame at a time for
 * `tools/film/render_arrival.mjs`, which turns them into the videos phones play. Open it at #/filmrender?tier=nepo|middle|lapo.
 */
export default function FilmRenderPage() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const tier = (new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("tier") ?? "middle") as Tier;
    const film = new CityFilm(ref.current!, tier, null, { character: false });
    const frames = Math.round((CITY_SECS.arrive + CITY_SECS.ride) * FPS);
    const boundary = Math.round(CITY_SECS.arrive * FPS);
    let at = -1;
    film.setBeat("arrive");
    const wait = window.setInterval(() => {
      if (!film.ready) return;
      window.clearInterval(wait);
      window.__fr = {
        ready: true,
        frames,
        frame(i: number) {
          if (i <= at) return;
          while (at < i) {
            at++;
            if (at === boundary) film.setBeat("ride");
            film.draw(1 / FPS);
          }
        },
        // the empty street, from where the person walks: a backdrop for the phone version
        plate() {
          film.hidePerson = true;
          film.setBeat("street");
          film.draw(1 / FPS);
        },
      };
    }, 200);
    return () => {
      window.clearInterval(wait);
      delete window.__fr;
      film.dispose();
    };
  }, []);
  return <canvas ref={ref} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", display: "block", background: "#000" }} />;
}
