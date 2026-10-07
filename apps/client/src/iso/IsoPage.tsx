import { useEffect, useRef, useState } from "react";
import GameHud from "../play/GameHud";
import { BottomNav, MoreMenu } from "../play/HudParts";
import KitchenPanel from "../kitchen/KitchenPanel";
import ArrivalFilm from "../arrival/ArrivalFilm";
import WelcomeBack from "../arrival/WelcomeBack";
import { useWelcomeBack } from "../arrival/useWelcomeBack";
import { getPending } from "../play/pendingLife";
import { useOnlineLife } from "../net/useOnlineLife";
import { world } from "../net/world";
import { IsoRoom, type IsoGame, type Tier } from "./IsoRoom";
import { PaperDoll } from "./paperdoll";
import { LiveChar } from "./livechar";
import { parseLook } from "../lab/looks";
import "../play/play.css";
import "./iso.css";
import SettingsPanel from "../settings/SettingsPanel";
import EditPad from "./EditPad";
import HomeShop from "./HomeShop";
import { homeBuy, homeMove, homeSell } from "../phone/remote";
import { layoutForTier, layoutWithHome } from "../play/layouts";

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
  const [showSettings, setShowSettings] = useState(false);
  const [editing, setEditing] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [sel, setSel] = useState<{ id: string; furniture: string; name: string; bought: boolean; price: number } | null>(null);
  const appliedHome = useRef("null");
  const [kitchen, setKitchen] = useState<"fridge" | "cook" | "eat" | null>(null);
  const session = life.session;
  const welcome = useWelcomeBack(life, ready);
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
    let gone = false;
    let detach: (() => void) | null = null;
    let liveRef: LiveChar | null = null;
    (async () => {
      // The character is stacked together from sprite layers in their saved look: no 3D, and it is ready as soon as the pictures load.
      const look = parseLook(session.sim.state.look);
      const char = new PaperDoll(look);
      // the character is drawn live from the 3D model (sharp at any size); if that can't start, the baked pictures are the fallback
      let live: LiveChar | null = null;
      if (!new URLSearchParams(window.location.search).has("sprites")) {
        try {
          live = new LiveChar(look);
          await live.load();
        } catch (e) {
          console.warn("live character unavailable, using pictures", e);
          live?.dispose();
          live = null;
        }
      }
      if (gone) {
        live?.dispose();
        return;
      }
      liveRef = live;
      const room = new IsoRoom(canvas, layoutWithHome(layoutForTier(tier), session.sim.state.home), tier, game, char);
      appliedHome.current = JSON.stringify(session.sim.state.home ?? null);
      room.live = live;
      roomRef.current = room;
      room.onStatus = setStatus;
      room.onMenu = setMenu;
      room.onKitchen = setKitchen;
      room.onSelect = setSel;
      room.onEditChange = (c) => {
        const st = session.sim.state;
        const r = c.kind === "move" ? homeMove(st, c.id, c.x, c.z, c.rot) : homeSell(st, c.id, c.bought ? undefined : c.furniture);
        if (!r.ok) {
          session.notice(r.reason);
          return;
        }
        if (c.kind === "sell") session.notice(r.text);
        appliedHome.current = JSON.stringify(st.home ?? null);
        void room.setLayout(layoutWithHome(layoutForTier(tier), st.home));
      };
      room.introDone = () => setIntroOn(false);
      await room.load();
      if (gone) return;
      detach = room.attach();
      setReady(true);
      if (import.meta.env.DEV) (window as unknown as { __iso: IsoRoom }).__iso = room;
    })().catch((e) => !gone && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      gone = true;
      liveRef?.dispose();
      detach?.();
      roomRef.current = null;
    };
  }, [session, tier]);

  // The server has the final word on the home: if its version differs from what is on screen, redraw it.
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => {
      const now = JSON.stringify(session.sim.state.home ?? null);
      if (now !== appliedHome.current && roomRef.current && !roomRef.current.introPlaying) {
        appliedHome.current = now;
        void roomRef.current.setLayout(layoutWithHome(layoutForTier(tier), session.sim.state.home));
      }
    }, 1500);
    return () => clearInterval(t);
  }, [session, tier]);

  const buy = (furniture: string) => {
    const room = roomRef.current;
    if (!room || !session) return;
    const spot = room.findSpotFor(furniture);
    if (!spot) return session.notice("There's no free space for that. Sell or move something first.");
    const st = session.sim.state;
    const r = homeBuy(st, furniture, spot.x, spot.z, 0);
    if (!r.ok) return session.notice(r.reason);
    session.notice(r.text);
    appliedHome.current = JSON.stringify(st.home ?? null);
    const id = st.home!.added[st.home!.added.length - 1]!.id;
    setShopOpen(false);
    void room.setLayout(layoutWithHome(layoutForTier(tier), st.home)).then(() => room.selectId(id));
  };
  const toggleEdit = () => {
    const room = roomRef.current;
    if (!room) return;
    if (editing) {
      room.stopEdit();
      setEditing(false);
      setShopOpen(false);
    } else {
      room.startEdit();
      setEditing(true);
    }
  };

  // The arrival: once the room's pictures are loaded, and any film or welcome-back scene has finished, the room paints itself in.
  // A new person's arrival film starts the moment they come through the creator, over the connecting and loading (not after).
  const pendingLife = getPending();
  const arriving = life.justArrived || !!pendingLife;
  const filmShowing = arriving && !filmDone;
  const filmTier = (session?.sim.state.profile?.tier ?? pendingLife?.profile.tier ?? "middle") as Tier;
  // The opening scene must never hold the screen forever: if the home still isn't ready well after the film, say so.
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (ready || !(arriving && filmDone)) return setStuck(false);
    const t = setTimeout(() => setStuck(true), 20000);
    return () => clearTimeout(t);
  }, [ready, arriving, filmDone]);
  const offline = life.phase === "offline" && !session;
  useEffect(() => {
    if (!ready || !session || filmShowing || welcome.showing || introStarted.current) return;
    introStarted.current = true;
    roomRef.current?.playIntro(!life.justArrived);
  }, [ready, filmShowing, welcome.showing, life.justArrived]);

  return (
    <div className="play hud-on">
      <canvas ref={canvasRef} className="play-stage" style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }} />
      <div className="play-top">
        <a className="play-chip" href="#/" aria-label="Back to the menu">←<span className="play-chip-label"> Back</span></a>
      </div>
      {!editing && (
        <MoreMenu
          items={[
            ...(session && ready && !introOn ? [{ label: "Edit home", icon: "home" as const, run: toggleEdit }] : []),
            { label: "Settings", icon: "settings" as const, run: () => setShowSettings(true) },
          ]}
        />
      )}
      {!editing && session && ready && !introOn && (
        <BottomNav active="home" onBag={() => window.dispatchEvent(new CustomEvent("thelife-toggle-bag"))} onBuy={() => { toggleEdit(); setShopOpen(true); }} />
      )}
      {editing && (
        <>
          <div className="home-hint">{sel ? "Drag it, tap the floor, or use the arrows." : "Tap a piece of furniture to pick it up."}</div>
          <EditPad active={!!sel} onMove={(sx, sy) => roomRef.current?.nudgeSelected(sx, sy)} onTurn={() => roomRef.current?.rotateSelected()} />
          <div className="home-bar">
            <button disabled={!sel} onClick={() => roomRef.current?.rotateSelected()}>Turn</button>
            <button className="danger" disabled={!sel} onClick={() => roomRef.current?.sellSelected()}>
              {sel ? `Sell ${sel.bought ? "₦" + Math.floor(sel.price * 0.6).toLocaleString() : "₦" + Math.floor(sel.price * 0.25).toLocaleString()}` : "Sell"}
            </button>
            <button onClick={() => setShopOpen(true)}>Shop</button>
            <button className="primary" onClick={toggleEdit}>Done</button>
          </div>
        </>
      )}
      {editing && shopOpen && session && <HomeShop session={session} onBuy={buy} onClose={() => setShopOpen(false)} />}
      {showSettings && (
        <div style={{ position: "absolute", inset: 0, zIndex: 80 }}>
          <SettingsPanel onClose={() => setShowSettings(false)} />
        </div>
      )}
      {session && ready && !introOn && !editing && <GameHud session={session} onHour={(h) => roomRef.current?.setHour(h)} />}
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
      {filmShowing && <ArrivalFilm tier={filmTier} onDone={() => setFilmDone(true)} />}
      {/* the film ended before the room was ready: the opening scene holds the screen until it is */}
      {arriving && filmDone && !ready && !stuck && <WelcomeBack tier={filmTier} hour={new Date().getUTCHours() + 1} awayCount={0} ready={false} onDone={() => undefined} />}
      {arriving && filmDone && !ready && stuck && (
        <div className="play-loading" role="status" style={{ zIndex: 60 }}>
          <span>
            {error || life.detail || (session ? "Your home's pictures are taking too long to load." : life.phase === "connecting" ? "Can't reach the game server." : "The game server isn't answering.")}
            <small style={{ display: "block", opacity: 0.6, marginTop: 6 }}>({life.phase}{session ? ", life loaded" : ", no life yet"}; {world.trace})</small>
          </span>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button>
        </div>
      )}
      {welcome.node}
      {offline && (
        <div className="play-loading" role="status" style={{ zIndex: 60 }}>
          <span>{life.detail || "Can't reach the world right now."}</span>
          <button className="btn btn-primary" onClick={() => world.reconnect()}>Try again</button>
        </div>
      )}
      {error && <div className="play-error">{error}</div>}
    </div>
  );
}
