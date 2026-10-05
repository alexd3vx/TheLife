import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ACTIONS, FURNITURE, type FurnitureCategory, type FurnitureDef } from "@thelife/game-core";
import { loadManifest } from "../lab/manifest";
import { startPlay, type PlayRuntime } from "./runtime";
import "./play.css";
import "./showroom.css";

type Result = { status: "pass" | "fail" | "info"; note: string };

const naira = (n: number) => `₦${n.toLocaleString()}`;
const CATEGORY_LABEL: Record<FurnitureCategory, string> = {
  seating: "Seating",
  tables: "Tables & desks",
  bedroom: "Bedroom",
  storage: "Storage",
  electronics: "Electronics",
  appliances: "Appliances",
  kitchen: "Kitchen units",
  bathroom: "Bathroom",
  lighting: "Lighting",
  decor: "Decor",
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABEL) as FurnitureCategory[];

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** The showroom: every catalog piece on show, each one usable, with a one-button test that uses them all. */
export default function ShowroomPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<PlayRuntime | null>(null);
  const stopRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [night, setNight] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    loadManifest()
      .then((manifest) =>
        startPlay(
          container,
          manifest,
          { onStatus: (s) => setStatus(s.label), onHover: () => {}, onStats: () => {}, onHud: () => {}, onEvents: () => {}, onAway: () => {} },
          { mode: "showroom" },
        ),
      )
      .then((runtime) => {
        if (disposed) {
          runtime?.dispose();
          return;
        }
        if (!runtime) setError("Your browser can't run WebGL, which the game needs.");
        else {
          runtimeRef.current = runtime;
          (window as unknown as { __play: PlayRuntime["debug"] }).__play = runtime.debug;
          runtime.setFollow(false);
        }
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      disposed = true;
      stopRef.current = true;
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => runtimeRef.current?.debug.setHour(night ? 22 : 12), [night, loading]);

  const grouped = useMemo(() => {
    const map = new Map<FurnitureCategory, FurnitureDef[]>();
    for (const category of CATEGORY_ORDER) map.set(category, []);
    for (const f of FURNITURE) map.get(f.category)!.push(f);
    return [...map.entries()].filter(([, list]) => list.length > 0);
  }, []);

  const show = useCallback((id: string) => {
    setSelected(id);
    runtimeRef.current?.debug.focus(`s_${id}`, 5.5);
  }, []);

  const use = useCallback((id: string) => {
    runtimeRef.current?.debug.focus(`s_${id}`, 7);
    runtimeRef.current?.debug.tapItem(`s_${id}`);
  }, []);

  /** Walks the character to every piece in turn, uses it, and checks it started the right activity with the right animation. */
  const runAll = useCallback(async () => {
    const p = runtimeRef.current?.debug;
    if (!p) return;
    stopRef.current = false;
    setResults({});
    const placed = new Map(p.items().map((i) => [i.id, i]));
    for (const def of FURNITURE) {
      if (stopRef.current) break;
      setRunning(def.id);
      const id = `s_${def.id}`;
      const record = (r: Result) => setResults((prev) => ({ ...prev, [def.id]: r }));
      const item = placed.get(id);
      if (!item) {
        record({ status: "fail", note: "not in the showroom" });
        continue;
      }
      p.focus(id, 7);
      if (def.toggle) {
        if (!p.tapItem(id)) {
          record({ status: "fail", note: "nothing to tap: no approach found" });
          continue;
        }
        let acted = false;
        for (let waited = 0; waited < 60_000 && !stopRef.current; waited += 100) {
          await sleep(100);
          if (p.state().mode !== "idle") acted = true;
          if (acted && p.state().mode === "idle") break;
        }
        record(p.isOn(id) ? { status: "pass", note: "switches on · lamp lights" } : { status: "fail", note: "did not switch on" });
        continue;
      }
      if (!def.action) {
        const reacted = p.tapItem(id);
        record({ status: reacted ? "fail" : "info", note: reacted ? "decor reacted unexpectedly" : item.animated ? "decor (animates)" : "decor, no action" });
        continue;
      }
      const expected = ACTIONS[def.action]!;
      if (!p.tapItem(id)) {
        record({ status: "fail", note: "nothing to tap: no seat/approach found" });
        continue;
      }
      let reached = false;
      for (let waited = 0; waited < 60_000 && !stopRef.current; waited += 100) {
        await sleep(100);
        if (p.state().mode === "doing") {
          reached = true;
          break;
        }
      }
      if (!reached) {
        record({ status: "fail", note: `never started (mode ${p.state().mode})` });
        p.tapGround(0, -7.5);
        await sleep(500);
        continue;
      }
      await sleep(900);
      const state = p.state();
      const wrongAction = state.action !== def.action;
      const wrongClip = state.clip !== expected.clip;
      record(
        wrongAction || wrongClip
          ? { status: "fail", note: `expected ${def.action}/${expected.clip}, got ${state.action}/${state.clip}` }
          : { status: "pass", note: `${expected.label} · ${expected.clip}${item.animated ? " · furniture animates" : ""}` },
      );
    }
    p.tapGround(0, -7.5);
    setRunning(null);
  }, []);

  const passed = Object.values(results).filter((r) => r.status === "pass").length;
  const failed = Object.values(results).filter((r) => r.status === "fail").length;

  return (
    <div className="play showroom">
      <div className="play-stage" ref={containerRef} />

      <div className="play-top">
        <a className="play-chip" href="#/" aria-label="Back">
          ←<span className="play-chip-label"> Back</span>
        </a>
        <button className="play-chip" onClick={() => setPanelOpen((v) => !v)}>
          {panelOpen ? "Hide list" : "Show list"}
        </button>
        <button className="play-chip" onClick={() => setNight((v) => !v)}>
          {night ? "🌙 Night" : "☀️ Day"}
        </button>
        <button className="play-chip showroom-run" disabled={loading || !!running} onClick={runAll}>
          {running ? `Testing… ${FURNITURE.find((f) => f.id === running)?.name ?? ""}` : "▶ Run all tests"}
        </button>
        {running && (
          <button
            className="play-chip"
            onClick={() => {
              stopRef.current = true;
            }}
          >
            Stop
          </button>
        )}
        {(passed > 0 || failed > 0) && (
          <span className="play-chip" role="status">
            ✓ {passed} · ✗ {failed}
          </span>
        )}
      </div>

      {status && (
        <div className="play-banner" role="status">
          <strong>{status}</strong>
        </div>
      )}

      {panelOpen && !loading && (
        <aside className="showroom-panel" aria-label="Furniture catalog">
          <p className="showroom-note">
            Everything here will be sold in shops. Tap a name to look at it; <strong>Use</strong> walks the character to it, and tap the floor to move around.
          </p>
          {grouped.map(([category, list]) => (
            <section key={category}>
              <h3>{CATEGORY_LABEL[category]}</h3>
              <ul>
                {list.map((f) => {
                  const result = results[f.id];
                  return (
                    <li key={f.id} className={selected === f.id ? "is-selected" : ""}>
                      <button className="showroom-name" onClick={() => show(f.id)}>
                        <span className={`showroom-dot showroom-${result?.status ?? "none"}`} aria-hidden="true">
                          {result?.status === "pass" ? "✓" : result?.status === "fail" ? "✗" : result?.status === "info" ? "·" : ""}
                        </span>
                        <span>
                          {f.name}
                          <small>
                            {naira(f.price)}
                            {f.action ? ` · ${ACTIONS[f.action]?.label ?? f.action}` : ""}
                          </small>
                          {result && result.status !== "pass" && <small className="showroom-note-line">{result.note}</small>}
                        </span>
                      </button>
                      {(f.action || f.toggle) && (
                        <button className="showroom-use" disabled={!!running} onClick={() => use(f.id)}>
                          {f.toggle ? "Switch" : "Use"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </aside>
      )}

      {loading && <div className="play-loading">Stocking the showroom…</div>}
      {error && <div className="play-error">{error}</div>}
    </div>
  );
}
