import { isAdmin } from "../ui/admin";
import GameHud from "../play/GameHud";
import { GameIcon } from "../ui/icons";
import { useEffect, useRef, useState } from "react";
import { loadManifest } from "../lab/manifest";
import type { TapMenu } from "../play/runtime";
import { getDistrict } from "./districtData";
import DistrictMap from "./DistrictMap";
import { PIN_STYLE } from "./pins";
import SettingsPanel from "../settings/SettingsPanel";
import { useSettings } from "../settings/settings";
import OnlinePanel from "../net/OnlinePanel";
import { useOnlineLife } from "../net/useOnlineLife";
import { world } from "../net/world";
import { setChargeChecker } from "../phone/remote";
import { chargingSpotNear } from "@thelife/game-core";
import TouchControls, { useTouchControlsVisible } from "../controls/TouchControls";
import { input } from "../controls/input";
import { useWelcomeBack } from "../arrival/useWelcomeBack";
import { startMap, type MapRuntime, type MapStats, type TourResult } from "./runtime";
import "../play/play.css";
import "./map.css";

/** The neighbourhood, streamed in chunks. A test bench for the map engine: walk around, zoom out, and run the performance tour. */
export default function MapPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<MapRuntime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<MapStats | null>(null);
  const [menu, setMenu] = useState<TapMenu | null>(null);
  const [touring, setTouring] = useState<number | null>(null);
  const [result, setResult] = useState<TourResult | null>(null);
  const [night, setNight] = useState(false);
  const nightRef = useRef(false);
  const [place, setPlace] = useState<string | null>(null);
  const [placeShown, setPlaceShown] = useState<string | null>(null);
  const [bigMap, setBigMap] = useState(false);
  const [miniSpan, setMiniSpan] = useState(320);
  const [picked, setPicked] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const settings = useSettings();
  const admin = isAdmin();
  const district = getDistrict();
  const life = useOnlineLife();
  const [intro, setIntro] = useState<"off" | "playing">("off");
  const welcome = useWelcomeBack(life);
  const introPlayed = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    loadManifest()
      .then((manifest) => startMap(container, manifest, { onStats: setStats, onMenu: setMenu, onPlace: setPlace }))
      .then((runtime) => {
        if (disposed) {
          runtime?.dispose();
          return;
        }
        if (!runtime) setError("Your browser can't run WebGL, which the game needs.");
        else {
          runtimeRef.current = runtime;
          if (import.meta.env.DEV) (window as unknown as { __map: MapRuntime["debug"] & { tour: MapRuntime["tour"] } }).__map = { ...runtime.debug, tour: runtime.tour, setNight: runtime.setNight } as never;
        }
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      disposed = true;
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, []);

  // Your own front door: drawn in the street, and a button to go in when you are standing at it.
  const [home, setHomeState] = useState(world.home);
  useEffect(() => {
    setHomeState(world.home);
    return world.onMessage((m) => {
      if (m.t === "home") setHomeState(m);
    });
  }, []);
  useEffect(() => {
    runtimeRef.current?.setHome(home ? { door: home.door, spawn: home.spawn, tier: home.tier } : null);
  }, [home, loading]);
  const atHome = !!(home && stats && Math.hypot(stats.position.x - home.spawn.x, stats.position.z - home.spawn.z) < 7);

  // Keyboard and on-screen controls: what the interact button does depends on what is close.
  const touchOn = useTouchControlsVisible();
  const [phoneOpen, setPhoneOpen] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setPhoneOpen(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener("thelife-phone-state", on);
    return () => window.removeEventListener("thelife-phone-state", on);
  }, []);
  const nearPlayer = (() => {
    if (!stats || intro !== "off") return null;
    let best: { id: string; name: string } | null = null;
    let bestD = 3.2;
    for (const p of runtimeRef.current?.online.remotes.list() ?? []) {
      const d = Math.hypot(p.x - stats.position.x, p.z - stats.position.z);
      if (d < bestD) {
        bestD = d;
        best = { id: p.id, name: p.name };
      }
    }
    return best;
  })();
  const nearLabel = intro !== "off" ? null : atHome ? "Enter home" : nearPlayer ? nearPlayer.name : null;
  const nearRef = useRef({ atHome, nearPlayer });
  nearRef.current = { atHome, nearPlayer };
  const blocked = phoneOpen || showSettings || bigMap || intro !== "off";
  useEffect(() => {
    runtimeRef.current?.setInputBlocked(blocked);
  }, [blocked, loading]);
  useEffect(() => {
    const detach = input.attach();
    const off = input.onPress((a) => {
      if (a === "phone") return window.dispatchEvent(new CustomEvent("thelife-toggle-phone"));
      if (a === "inventory") return window.dispatchEvent(new CustomEvent("thelife-toggle-bag"));
      if (blockedRef.current) return;
      if (a === "interact") {
        const n = nearRef.current;
        if (n.atHome) window.location.hash = "#/play";
        else if (n.nearPlayer) window.dispatchEvent(new CustomEvent("thelife-open-online", { detail: n.nearPlayer.id }));
      } else if (a === "resetCamera") runtimeRef.current?.resetView();
      else if (a === "map") window.dispatchEvent(new CustomEvent("thelife-open-phone", { detail: "maps" }));
    });
    return () => {
      off();
      detach();
    };
  }, []);
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;

  // Out in the city a phone only charges beside a place with power.
  useEffect(() => {
    setChargeChecker(() => {
      const pose = runtimeRef.current?.online.pose();
      return pose ? chargingSpotNear(district, pose.x, pose.z) : null;
    });
    return () => setChargeChecker(null);
  }, [district]);

  // The opening shot, once the world is drawn and your life has arrived.
  useEffect(() => {
    if (loading || error || !life.session || introPlayed.current || welcome.showing) return;
    const rt = runtimeRef.current;
    if (!rt) return;
    introPlayed.current = true;
    let seen = false;
    try {
      seen = sessionStorage.getItem("thelife.intro") === "1";
      sessionStorage.setItem("thelife.intro", "1");
    } catch {
      /* ignore */
    }
    if (seen || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setIntro("playing");
    void rt.playIntro().then(() => setIntro("off"));
  }, [loading, error, life.session, welcome.showing]);

  // A banner for a few seconds when you walk into a named place.
  useEffect(() => {
    if (!place) return;
    setPlaceShown(place);
    const t = window.setTimeout(() => setPlaceShown(null), 3200);
    return () => window.clearTimeout(t);
  }, [place]);

  const runTour = async () => {
    const rt = runtimeRef.current;
    if (!rt || touring !== null) return;
    setResult(null);
    setTouring(0);
    const r = await rt.tour((f) => setTouring(Math.round(f * 100)));
    setTouring(null);
    setResult(r);
    rt.resetView();
  };

  return (
    <div className={`play${touchOn ? " has-touch" : ""}`}>
      <div className="play-stage" ref={containerRef} />
      <div className="play-top">
        <a className="play-chip" href="#/" aria-label="Back to the menu">
          ←<span className="play-chip-label"> Menu</span>
        </a>
        <a className="play-chip" href="#/play" aria-label="Go home">
          <GameIcon name="home" /><span className="play-chip-label"> Home</span>
        </a>
        <span className="play-chip">Lagos Island</span>
        {stats && settings.showFps && <span className="play-fps">{Math.round(stats.fps)} fps</span>}
      </div>

      {welcome.node}
      {intro === "playing" && (
        <div className="intro" onPointerDown={() => runtimeRef.current?.skipIntro()}>
          <div className="intro-bar top" />
          <div className="intro-bar bottom" />
          <div className="intro-title">
            <span>Alexion Studios</span>
            <strong>Lagos Island</strong>
            <em>{new Date().toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })} · {new Date().toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" })}</em>
          </div>
          <small className="intro-skip">Tap to skip</small>
        </div>
      )}
      {placeShown && <div className="map-place" role="status">{placeShown}</div>}
      {!loading && !error && life.session && intro === "off" && <GameHud session={life.session} onHour={(h, day) => { runtimeRef.current?.setClock(h, day); const dark = h < 6 || h >= 19; if (dark !== nightRef.current) { nightRef.current = dark; setNight(dark); } }} />}
      {!loading && !error && intro === "off" && <OnlinePanel runtime={runtimeRef} />}

      {stats && settings.showStats && (
        <div className="map-stats" aria-label="Map statistics">
          <span>Draw calls <b>{stats.calls}</b></span>
          <span>Triangles <b>{Math.round(stats.triangles / 1000)}k</b></span>
          <span>Geometries <b>{stats.geometries}</b></span>
          <span>
            Chunks <b>{stats.stream.loaded}</b>/{stats.stream.total} (near {stats.stream.byLod[0]}, mid {stats.stream.byLod[1]}, far {stats.stream.byLod[2]})
          </span>
          <span>Builds/s <b>{stats.stream.buildsPerSecond}</b>, slowest <b>{stats.stream.slowestBuildMs} ms</b></span>
          <span>Resolution <b>{Math.round(stats.ratio * 100) / 100}x</b></span>
        </div>
      )}

      {atHome && intro === "off" && (
        <a className="map-enter" href="#/play">
          <GameIcon name="home" /> Enter home
        </a>
      )}
      {stats && !bigMap && (
        <div className="map-mini">
          <DistrictMap district={district} player={stats.position} home={home ? home.door : null} others={runtimeRef.current?.online.remotes.list() ?? []} compact span={miniSpan} />
          <div className="map-mini-zoom">
            <button onClick={() => setMiniSpan((s) => Math.max(160, s * 0.7))} aria-label="Zoom the minimap in">+</button>
            <button onClick={() => setMiniSpan((s) => Math.min(900, s / 0.7))} aria-label="Zoom the minimap out">−</button>
          </div>
          <button className="map-mini-open" onClick={() => window.dispatchEvent(new CustomEvent("thelife-open-phone", { detail: "maps" }))} aria-label="Open LifeMaps on your phone" />
        </div>
      )}
      {bigMap && (
        <>
          <div className="map-big">
            <DistrictMap district={district} player={stats?.position ?? null} others={runtimeRef.current?.online.remotes.list() ?? []} selected={picked} onSelect={setPicked} />
          </div>
          <button className="map-close" onClick={() => setBigMap(false)}>Close map</button>
          {picked && (() => {
            const lm = district.landmarks.find((l) => l.id === picked)!;
            const dist = stats ? Math.round(Math.hypot(lm.entrance.x - stats.position.x, lm.entrance.z - stats.position.z)) : 0;
            return (
              <div className="map-sheet">
                <strong>{lm.name}</strong>
                <span>{PIN_STYLE[lm.kind].label} · {dist} m away</span>
                <div className="map-sheet-actions">
                  <button onClick={() => { runtimeRef.current?.goTo(lm.id, "walk"); setBigMap(false); }}>Walk there</button>
                  <button onClick={() => { runtimeRef.current?.goTo(lm.id, "run"); setBigMap(false); }}>Run there</button>
                  <button className="is-ghost" onClick={() => setPicked(null)}>Back</button>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {menu && (
        <div className="play-menu" role="menu" style={{ left: Math.max(8, Math.min(menu.x, (containerRef.current?.clientWidth ?? 600) - 220)), top: Math.max(8, menu.y + 10) }}>
          {menu.options.map((o, i) => (
            <button key={i} role="menuitem" onClick={() => o.run()}>
              <GameIcon name={o.icon} />
              {o.label}
            </button>
          ))}
        </div>
      )}

      <div className="play-controls">
        <button onClick={() => runtimeRef.current?.resetView()}>Reset view</button>
        {admin && <button onClick={() => runtimeRef.current?.zoomOut()}>Zoom out (test)</button>}
        {admin && <button onClick={() => setBigMap(true)}>Map (test)</button>}
        <button onClick={() => setShowSettings(true)}><GameIcon name="settings" /> Settings</button>
        {admin && <button aria-pressed={night} onClick={() => { runtimeRef.current?.setNight(!night); setNight(!night); }}>{night ? "Day (test)" : "Night (test)"}</button>}
        {admin && (
          <button onClick={runTour} disabled={touring !== null}>
            {touring === null ? "Performance tour (test)" : `Touring… ${touring}%`}
          </button>
        )}
      </div>

      {result && (
        <div className="play-modal" role="dialog" aria-label="Tour result">
          <div className="play-modal-card">
            <h2>Performance tour</h2>
            <ul>
              <li>Average <b>{result.avgFps} fps</b> over {result.seconds} s</li>
              <li>Slowest 1% of frames: <b>{result.lowFps} fps</b> (worst frame {result.worstFrameMs} ms)</li>
              <li>Peak draw calls {result.peakCalls}, peak geometries {result.peakGeometries}, chunk builds per second up to {result.chunkBuilds}</li>
            </ul>
            <button className="btn btn-primary" onClick={() => setResult(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      {touchOn && !loading && !error && life.session && intro === "off" && !showSettings && !bigMap && !phoneOpen && <TouchControls nearLabel={nearLabel} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {!loading && !error && !life.session && (
        <div className="play-loading" role="status">
          {life.phase === "offline" ? (
            <>
              <span>{life.detail || "Can't reach the world right now."}</span>
              <button className="btn btn-primary" onClick={() => world.reconnect()}>Try again</button>
            </>
          ) : life.phase === "creating" ? (
            "Starting your life…"
          ) : (
            "Connecting to Lagos…"
          )}
        </div>
      )}
      {loading && <div className="play-loading">Building the neighbourhood…</div>}
      {error && <div className="play-error">{error}</div>}
    </div>
  );
}
