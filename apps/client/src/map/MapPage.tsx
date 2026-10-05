import { useEffect, useRef, useState } from "react";
import { loadManifest } from "../lab/manifest";
import type { TapMenu } from "../play/runtime";
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    loadManifest()
      .then((manifest) => startMap(container, manifest, { onStats: setStats, onMenu: setMenu }))
      .then((runtime) => {
        if (disposed) {
          runtime?.dispose();
          return;
        }
        if (!runtime) setError("Your browser can't run WebGL, which the game needs.");
        else {
          runtimeRef.current = runtime;
          if (import.meta.env.DEV) (window as unknown as { __map: MapRuntime["debug"] & { tour: MapRuntime["tour"] } }).__map = { ...runtime.debug, tour: runtime.tour };
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
    <div className="play">
      <div className="play-stage" ref={containerRef} />
      <div className="play-top">
        <a className="play-chip" href="#/play" aria-label="Back to the house">
          ←<span className="play-chip-label"> House</span>
        </a>
        <span className="play-chip">Neighbourhood test</span>
        {stats && <span className="play-fps">{Math.round(stats.fps)} fps</span>}
      </div>

      {stats && (
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

      {menu && (
        <div className="play-menu" role="menu" style={{ left: Math.max(8, Math.min(menu.x, (containerRef.current?.clientWidth ?? 600) - 220)), top: Math.max(8, menu.y + 10) }}>
          {menu.options.map((o, i) => (
            <button key={i} role="menuitem" onClick={() => o.run()}>
              <span aria-hidden="true">{o.icon}</span>
              {o.label}
            </button>
          ))}
        </div>
      )}

      <div className="play-controls">
        <button onClick={() => runtimeRef.current?.resetView()}>Reset view</button>
        <button onClick={() => runtimeRef.current?.zoomOut()}>Whole district</button>
        <button onClick={runTour} disabled={touring !== null}>
          {touring === null ? "Run the performance tour" : `Touring… ${touring}%`}
        </button>
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

      {loading && <div className="play-loading">Building the neighbourhood…</div>}
      {error && <div className="play-error">{error}</div>}
    </div>
  );
}
