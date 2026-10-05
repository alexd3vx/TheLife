import { useEffect, useRef, useState } from "react";
import { loadManifest } from "../lab/manifest";
import type { Status } from "./controller";
import { startPlay, type PlayRuntime } from "./runtime";
import "./play.css";

export default function PlayPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<PlayRuntime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ label: null, hint: null });
  const [hover, setHover] = useState<string | null>(null);
  const [stats, setStats] = useState("");
  const [follow, setFollow] = useState(true);
  const [introVisible, setIntroVisible] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    loadManifest()
      .then((manifest) => startPlay(container, manifest, { onStatus: setStatus, onHover: setHover, onStats: setStats }))
      .then((runtime) => {
        if (disposed) {
          runtime?.dispose();
          return;
        }
        if (!runtime) {
          setError("Your browser can't run WebGL, which the game needs.");
        } else {
          runtimeRef.current = runtime;
          if (import.meta.env.DEV) (window as unknown as { __play: PlayRuntime["debug"] }).__play = runtime.debug;
        }
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    const hide = window.setTimeout(() => setIntroVisible(false), 9000);
    return () => {
      disposed = true;
      window.clearTimeout(hide);
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => runtimeRef.current?.setFollow(follow), [follow]);

  const banner = status.label ?? hover;

  return (
    <div className="play">
      <div className="play-stage" ref={containerRef} />

      <div className="play-top">
        <a className="play-chip" href="#/">
          ← Back
        </a>
        <a className="play-chip" href="#/lab">
          Customise
        </a>
        <span className="play-fps">{stats}</span>
      </div>

      {banner && (
        <div className="play-banner" role="status">
          <strong>{banner}</strong>
          {status.label && status.hint && <span>{status.hint}</span>}
        </div>
      )}

      {introVisible && !loading && !error && (
        <div className="play-intro">
          <strong>Tap the floor</strong> to walk · <strong>tap furniture</strong> to use it · drag to look around
        </div>
      )}

      <div className="play-controls">
        <button aria-pressed={follow} onClick={() => setFollow((v) => !v)}>
          Follow
        </button>
        <button onClick={() => runtimeRef.current?.resetView()}>Reset view</button>
      </div>

      {loading && <div className="play-loading">Building the house…</div>}
      {error && <div className="play-error">{error}</div>}
    </div>
  );
}
