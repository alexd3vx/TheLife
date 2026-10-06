import { useEffect, useRef, useState } from "react";
import GameHud from "../play/GameHud";
import KitchenPanel from "../kitchen/KitchenPanel";
import ArrivalFilm from "../arrival/ArrivalFilm";
import { useWelcomeBack } from "../arrival/useWelcomeBack";
import { useOnlineLife } from "../net/useOnlineLife";
import { world } from "../net/world";
import { layoutForTier } from "../play/layouts";
import { IsoRoom, type IsoGame, type Tier } from "./IsoRoom";
import "../play/play.css";
import "./iso.css";

/** The home in 2.5D: a painted isometric room. A preview of the new look, at #/iso. */
export default function IsoPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roomRef = useRef<IsoRoom | null>(null);
  const life = useOnlineLife("home");
  const [ready, setReady] = useState(false);
  const [introOn, setIntroOn] = useState(true);
  const [filmDone, setFilmDone] = useState(false);
  const introStarted = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; title: string; options: { label: string; run(): void }[] } | null>(null);
  const [kitchen, setKitchen] = useState<"fridge" | "cook" | "eat" | null>(null);
  const session = life.session;
  const welcome = useWelcomeBack(life);
  if (import.meta.env.DEV) (window as unknown as { __life: unknown }).__life = { justArrived: life.justArrived, phase: life.phase, has: !!life.session, showing: welcome.showing };
  const tier = (session?.sim.state.profile?.tier ?? "middle") as Tier;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !session) return;
    const game: IsoGame = {
      start: (id) => session.start(id),
      cancel: () => session.cancel(),
      active: () => session.active(),
      notice: (t) => session.notice(t),
    };
    const room = new IsoRoom(canvas, layoutForTier(tier), tier, game);
    roomRef.current = room;
    room.onStatus = setStatus;
    room.onMenu = setMenu;
    room.onKitchen = setKitchen;
    room.introDone = () => setIntroOn(false);
    let detach: (() => void) | null = null;
    let gone = false;
    room.load().then(
      () => {
        if (gone) return;
        detach = room.attach();
        setReady(true);
        if (import.meta.env.DEV) (window as unknown as { __iso: IsoRoom }).__iso = room;
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      gone = true;
      detach?.();
      roomRef.current = null;
    };
  }, [session, tier]);

  // The arrival: once the room's pictures are loaded, and any film or welcome-back scene has finished, the room paints itself in.
  const filmShowing = life.justArrived && !!session && !filmDone;
  useEffect(() => {
    if (!ready || filmShowing || welcome.showing || introStarted.current) return;
    introStarted.current = true;
    roomRef.current?.playIntro(!life.justArrived);
  }, [ready, filmShowing, welcome.showing, life.justArrived]);

  return (
    <div className="play">
      <canvas ref={canvasRef} className="play-stage" style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }} />
      <div className="play-top">
        <a className="play-chip" href="#/" aria-label="Back to the menu">←<span className="play-chip-label"> Back</span></a>
        <a className="play-chip" href="#/map">Go outside</a>
      </div>
      {session && ready && !introOn && <GameHud session={session} onHour={(h) => roomRef.current?.setHour(h)} />}
      {status && <div className="play-banner" role="status">{status}</div>}
      {menu && (
        <div className="play-menu" role="menu" style={{ left: Math.max(8, Math.min(menu.x, (canvasRef.current?.clientWidth ?? 600) - 220)), top: Math.max(8, menu.y + 10) }}>
          {menu.options.map((o, i) => (
            <button key={i} role="menuitem" onClick={() => o.run()}>{o.label}</button>
          ))}
        </div>
      )}
      {kitchen && session && (
        <KitchenPanel session={session} initialTab={kitchen} onClose={() => setKitchen(null)} runUse={(a) => roomRef.current?.useAction(a === "cook" ? "cook" : a) ?? false} />
      )}
      {filmShowing && <ArrivalFilm tier={tier} onDone={() => setFilmDone(true)} />}
      {!ready && !error && !filmShowing && (
        <div className="play-loading" role="status">
          {life.phase === "offline" ? (
            <>
              <span>{life.detail || "Can't reach the world right now."}</span>
              <button className="btn btn-primary" onClick={() => world.reconnect()}>Try again</button>
            </>
          ) : (
            <span className="iso-wait" aria-label="Loading" />
          )}
        </div>
      )}
      {welcome.node}
      {error && <div className="play-error">{error}</div>}
    </div>
  );
}
