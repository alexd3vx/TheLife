import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { loadManifest } from "../lab/manifest";
import { syncAssets, type SyncProgress } from "./assetCache";
import { formatMB } from "./plan";
import { watchForUpdates } from "./version";
import "./boot.css";

type Phase = "brand" | "loading" | "welcome" | "leaving" | "done";

const FEATURES = [
  { title: "Tap to walk", text: "Tap the floor to move, tap furniture to use it. No controls to learn." },
  { title: "A life with consequences", text: "Hunger, sleep, rent and mood all matter. Miss the rent and you will feel it." },
  { title: "Furnish it for real", text: "Every sofa, bed and fridge has a naira price. Earn it, then buy it." },
  { title: "Yours, on your device", text: "Your life saves on this device and the game plays offline." },
];

const STEPS = ["Finding your assets", "Loading animations", "Setting up your home"];

const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const skipSplash = () => new URLSearchParams(window.location.search).get("splash") === "0";

/** Alexion Studios splash, then the loading screen (downloads the game once, finds it on the device after), then the game. */
export function Boot({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(skipSplash() ? "done" : "brand");
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [synced, setSynced] = useState(false);
  const [step, setStep] = useState(0);
  const [feature, setFeature] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [updateReady, setUpdateReady] = useState(false);
  const skipBrand = useRef<() => void>(() => {});

  // Prepare the game's files while the brand plays.
  useEffect(() => {
    if (phase === "done") return;
    let alive = true;
    setError(null);
    setSynced(false);
    (async () => {
      try {
        const manifest = await loadManifest();
        const result = await syncAssets(manifest, (p) => alive && setProgress(p));
        if (!alive) return;
        if (result.failed.length) setWarning("Some files will finish loading while you play.");
        setSynced(true);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Could not reach the game files.");
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // The scripted sequence: brand -> loading -> welcome -> game.
  const syncedRef = useRef(false);
  syncedRef.current = synced;
  const errorRef = useRef<string | null>(null);
  errorRef.current = error;
  const progressRef = useRef<SyncProgress | null>(null);
  progressRef.current = progress;

  useEffect(() => {
    if (phase !== "brand") return;
    let alive = true;
    const quick = reduceMotion();
    (async () => {
      await Promise.race([sleep(quick ? 1200 : 2600), new Promise<void>((resolve) => (skipBrand.current = resolve))]);
      if (!alive) return;
      setPhase("loading");
    })();
    return () => {
      alive = false;
    };
  }, [phase, attempt]);

  useEffect(() => {
    if (phase !== "loading") return;
    let alive = true;
    const quick = reduceMotion();
    (async () => {
      // Wait for the files. When they were already on the device, walk through the steps so the player sees what is happening.
      const t0 = performance.now();
      while (alive && !syncedRef.current) {
        if (errorRef.current) return;
        await sleep(100);
      }
      if (!alive) return;
      const downloaded = (progressRef.current?.toDownload ?? 0) > 0;
      if (!downloaded) {
        const per = quick ? 250 : 500;
        for (let i = 0; i < STEPS.length && alive; i++) {
          setStep(i);
          await sleep(per);
        }
      } else {
        await sleep(Math.max(0, 900 - (performance.now() - t0)));
      }
      if (!alive) return;
      setStep(STEPS.length);
      setPhase("welcome");
    })();
    return () => {
      alive = false;
    };
  }, [phase, attempt]);

  useEffect(() => {
    if (phase !== "welcome") return;
    const timer = window.setTimeout(() => setPhase("leaving"), reduceMotion() ? 600 : 1200);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = window.setTimeout(() => setPhase("done"), 600); // matches the fade-out in boot.css
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "loading") return;
    const timer = window.setInterval(() => setFeature((f) => (f + 1) % FEATURES.length), 3400);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "done") return;
    return watchForUpdates(() => setUpdateReady(true));
  }, [phase]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  const percent = progress && progress.toDownload > 0 ? Math.min(100, Math.round((progress.loaded / progress.toDownload) * 100)) : null;
  const downloading = progress !== null && progress.toDownload > 0 && !synced;
  const overall = phase === "welcome" || phase === "leaving" ? 100 : downloading && percent !== null ? percent : Math.round(((step + (synced ? 1 : 0)) / (STEPS.length + 1)) * 100);

  return (
    <>
      {phase === "done" && children}
      {phase === "done" && updateReady && (
        <div className="update-banner" role="alert">
          <div>
            <strong>A new version of TheLife is ready</strong>
            <span>Your game is saved. Reload to get the update.</span>
          </div>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )}

      {phase !== "done" && (
        <div className={`boot boot-${phase}`} role="status" aria-live="polite" aria-label="Loading TheLife">
          {phase === "brand" && (
            <button className="boot-brand" onClick={() => skipBrand.current()} aria-label="Skip intro">
              <svg className="boot-mark" viewBox="0 0 100 100" aria-hidden="true">
                <defs>
                  <linearGradient id="boot-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#ffd27a" />
                    <stop offset="1" stopColor="#e8782a" />
                  </linearGradient>
                </defs>
                <path className="boot-mark-a" pathLength="1" d="M20 84 L50 14 L80 84" />
                <path className="boot-mark-bar" pathLength="1" d="M33 62 H67" />
                <path className="boot-mark-orbit" pathLength="1" d="M8 58 C 30 96, 70 96, 92 58" />
                <circle className="boot-mark-dot" cx="50" cy="14" r="4" />
              </svg>
              <span className="boot-brand-name">Alexion Studios</span>
              <span className="boot-brand-sub">presents</span>
            </button>
          )}

          {phase !== "brand" && (
            <div className="boot-load">
              <div className="boot-title">
                <h1>TheLife</h1>
                <p>Build a life. See what happens.</p>
              </div>

              <div className="boot-features" aria-hidden={phase !== "loading"}>
                {FEATURES.map((f, i) => (
                  <div key={f.title} className={`boot-feature${i === feature ? " is-on" : ""}`}>
                    <strong>{f.title}</strong>
                    <span>{f.text}</span>
                  </div>
                ))}
                <div className="boot-dots">
                  {FEATURES.map((f, i) => (
                    <i key={f.title} className={i === feature ? "is-on" : ""} />
                  ))}
                </div>
              </div>

              <div className="boot-progress">
                {error ? (
                  <>
                    <p className="boot-error">Could not reach the game files. Check your connection and try again.</p>
                    <button className="btn btn-primary" onClick={retry}>
                      Try again
                    </button>
                  </>
                ) : (
                  <>
                    <div className="boot-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={overall}>
                      <span style={{ width: `${overall}%` }} />
                    </div>
                    <div className="boot-status">
                      {phase === "welcome" || phase === "leaving" ? (
                        <strong className="boot-welcome">Welcome</strong>
                      ) : downloading ? (
                        <>
                          <span>Downloading game assets</span>
                          <span className="boot-num">
                            {formatMB(progress!.loaded)} of {formatMB(progress!.toDownload)}
                          </span>
                        </>
                      ) : (
                        <span>
                          {STEPS[Math.min(step, STEPS.length - 1)]}
                          <b className="boot-dotsline" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                    {downloading && progress?.firstRun && <p className="boot-note">One-time download. Next time the game opens straight from your device.</p>}
                    {warning && <p className="boot-note">{warning}</p>}
                  </>
                )}
              </div>
            </div>
          )}
          <span className="boot-credit">An Alexion Studios game</span>
        </div>
      )}
    </>
  );
}
