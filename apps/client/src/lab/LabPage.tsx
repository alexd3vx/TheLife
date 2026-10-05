import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Avatar } from "./avatar";
import { loadGLTF } from "./loaders";
import { CLOTH_COLORS, DEFAULT_LOOK, EYE_COLORS, FABRIC_OPTIONS, HAIR_COLORS, SKIN_TONES, type Look } from "./looks";
import { PROC_BOTTOMS, PROC_SHOES, PROC_TOPS } from "./procedural/garments";
import { PROC_HAIR } from "./procedural/hair";
import { assetUrl, loadManifest, type AssetManifest, type AssetRecord } from "./manifest";
import { createViewer, LIGHTING_LABELS, type LightingName, type Viewer, type ViewerStats } from "./viewer";
import "./lab.css";

type Tab = "character" | "props" | "vehicles" | "pipeline";

const TABS: { id: Tab; label: string }[] = [
  { id: "character", label: "People" },
  { id: "props", label: "Props" },
  { id: "vehicles", label: "Vehicles" },
  { id: "pipeline", label: "Pipeline" },
];

const DEFAULT_CLIP = "Idle_Loop";

export default function LabPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const avatarRef = useRef<Avatar | null>(null);

  const [manifest, setManifest] = useState<AssetManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("character");
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const [clip, setClip] = useState<string | null>(null);
  const [clips, setClips] = useState<string[]>([]);
  const [speed, setSpeed] = useState(1);
  const [lighting, setLighting] = useState<LightingName>("studio");
  const [wireframe, setWireframe] = useState(false);
  const [turntable, setTurntable] = useState(false);
  const [stats, setStats] = useState<ViewerStats | null>(null);
  const [selected, setSelected] = useState<AssetRecord | null>(null);
  const [busy, setBusy] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);

  // Viewer + manifest
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const viewer = createViewer(container);
    if (!viewer) {
      setError("Your browser can't run WebGL, which the lab needs.");
      return;
    }
    viewerRef.current = viewer;
    viewer.onStats(setStats);
    loadManifest()
      .then(setManifest)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, []);

  // Character
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!manifest || !viewer) return;
    const avatar = new Avatar(manifest, DEFAULT_LOOK);
    avatarRef.current = avatar;
    viewer.addFrameCallback((delta) => avatar.update(delta));
    avatar
      .load()
      .then(() => {
        setClips(avatar.clipNames);
        if (avatar.play(DEFAULT_CLIP, 0)) setClip(DEFAULT_CLIP);
        setBusy(false);
        if (tabRef.current === "character") viewer.setSubject(avatar.root);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setBusy(false);
      });
    return () => avatar.dispose();
  }, [manifest]);

  const tabRef = useRef(tab);
  tabRef.current = tab;

  const updateLook = useCallback((patch: Partial<Look>) => {
    setLook((prev) => ({ ...prev, ...patch }));
    const avatar = avatarRef.current;
    if (!avatar) return;
    setBusy(true);
    avatar
      .setLook(patch)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  }, []);

  const playClip = useCallback((name: string) => {
    if (avatarRef.current?.play(name)) setClip(name);
  }, []);

  useEffect(() => {
    avatarRef.current?.setSpeed(speed);
  }, [speed]);
  useEffect(() => viewerRef.current?.setLighting(lighting), [lighting]);
  useEffect(() => viewerRef.current?.setWireframe(wireframe), [wireframe]);
  useEffect(() => viewerRef.current?.setTurntable(turntable), [turntable]);

  // Switching tabs changes what is on the stage.
  useEffect(() => {
    const viewer = viewerRef.current;
    const avatar = avatarRef.current;
    if (!viewer) return;
    if (tab === "character" && avatar) {
      viewer.setSubject(avatar.root);
      setSelected(null);
    } else if (tab === "props" || tab === "vehicles") {
      viewer.setSubject(null);
      setSelected(null);
    }
  }, [tab]);

  const showAsset = useCallback(async (asset: AssetRecord) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    setSelected(asset);
    setBusy(true);
    try {
      const gltf = await loadGLTF(assetUrl(asset.file));
      const object = gltf.scene.clone(true);
      object.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      // Centre on the floor so every prop sits on the stage the same way.
      const box = new THREE.Box3().setFromObject(object);
      const centre = box.getCenter(new THREE.Vector3());
      object.position.set(-centre.x, -box.min.y, -centre.z);
      const holder = new THREE.Group();
      holder.add(object);
      viewer.setSubject(holder);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const randomise = useCallback(() => {
    const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)] as T;
    const body = pick(["male", "female"] as const);
    const hairs = [...PROC_HAIR, ...(manifest?.assets ?? []).filter((a) => a.slot === "hair")];
    updateLook({
      body,
      skinTone: pick(SKIN_TONES).id,
      hair: Math.random() < 0.08 ? null : pick(hairs).id,
      hairColor: pick(HAIR_COLORS).id,
      beard: body === "male" && Math.random() < 0.35,
      eyeColor: pick(EYE_COLORS).id,
      top: pick(["p_tee", "p_tank", "p_long", "p_kaftan", "peasant", "ranger"] as const),
      bottom: pick(["p_shorts", "p_trousers", "peasant", "ranger"] as const),
      shoes: pick(["p_sneakers", "peasant", "ranger"] as const),
      topFabric: pick(FABRIC_OPTIONS).id,
      bottomFabric: pick(FABRIC_OPTIONS).id,
      hood: Math.random() < 0.15,
      pauldrons: Math.random() < 0.15,
      outfitVariant: pick(["a", "b"] as const),
      topColor: pick(CLOTH_COLORS).id,
      bottomColor: pick(CLOTH_COLORS).id,
      shoesColor: pick(CLOTH_COLORS).id,
    });
  }, [manifest, updateLook]);

  const savePng = useCallback(() => {
    const url = viewerRef.current?.screenshot();
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = "thelife-lab.png";
    link.click();
  }, []);

  const hairStyles = useMemo(() => (manifest?.assets ?? []).filter((a) => a.slot === "hair"), [manifest]);
  const brows = useMemo(() => (manifest?.assets ?? []).filter((a) => a.slot === "brows"), [manifest]);

  return (
    <div className="lab">
      <div className="lab-stage" ref={containerRef}>
        <div className="lab-topbar">
          <a className="lab-back" href="#/">
            ← Back
          </a>
          <strong className="lab-title">Asset Lab</strong>
          <button className="lab-panel-toggle" onClick={() => setPanelOpen((v) => !v)} aria-expanded={panelOpen}>
            {panelOpen ? "Hide panel" : "Show panel"}
          </button>
        </div>
        {busy && <div className="lab-busy" role="status">Loading…</div>}
        {error && (
          <div className="lab-error" role="alert">
            {error}
          </div>
        )}
        {stats && (
          <div className="lab-stats" aria-label="Render statistics">
            {stats.fps} fps · {Math.round(stats.triangles / 1000)}k tris · {stats.drawCalls} draws
          </div>
        )}
      </div>

      <aside className={`lab-panel${panelOpen ? "" : " is-closed"}`}>
        <div className="lab-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="lab-scroll">
          {tab === "character" && (
            <CharacterControls
              look={look}
              hairStyles={hairStyles}
              brows={brows}
              outfits={manifest?.outfits ?? {}}
              clips={clips}
              clip={clip}
              speed={speed}
              onLook={updateLook}
              onClip={playClip}
              onSpeed={setSpeed}
              onRandom={randomise}
            />
          )}
          {(tab === "props" || tab === "vehicles") && manifest && (
            <AssetBrowser
              assets={manifest.assets.filter((a) => a.category === (tab === "props" ? "furniture" : "vehicle"))}
              selected={selected}
              onSelect={(a) => void showAsset(a)}
              manifest={manifest}
            />
          )}
          {tab === "pipeline" && manifest && <PipelineReport manifest={manifest} />}
        </div>

        <div className="lab-footer">
          <label className="lab-field">
            <span>Lighting</span>
            <select value={lighting} onChange={(e) => setLighting(e.target.value as LightingName)}>
              {(Object.keys(LIGHTING_LABELS) as LightingName[]).map((name) => (
                <option key={name} value={name}>
                  {LIGHTING_LABELS[name]}
                </option>
              ))}
            </select>
          </label>
          <label className="lab-check">
            <input type="checkbox" checked={wireframe} onChange={(e) => setWireframe(e.target.checked)} /> Wireframe
          </label>
          <label className="lab-check">
            <input type="checkbox" checked={turntable} onChange={(e) => setTurntable(e.target.checked)} /> Turntable
          </label>
          <div className="lab-buttons">
            <button onClick={() => viewerRef.current?.resetCamera()}>Reset view</button>
            <button onClick={savePng}>Save PNG</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

interface CharacterControlsProps {
  look: Look;
  hairStyles: AssetRecord[];
  brows: AssetRecord[];
  outfits: AssetManifest["outfits"];
  clips: string[];
  clip: string | null;
  speed: number;
  onLook(patch: Partial<Look>): void;
  onClip(name: string): void;
  onSpeed(value: number): void;
  onRandom(): void;
}

function CharacterControls(props: CharacterControlsProps) {
  const { look, hairStyles, brows, outfits, clips, clip, speed, onLook, onClip, onSpeed, onRandom } = props;
  const outfitIds = Object.keys(outfits);
  return (
    <div className="lab-section-stack">
      <section>
        <h3>Body</h3>
        <div className="lab-segment">
          {(["male", "female"] as const).map((sex) => (
            <button key={sex} aria-pressed={look.body === sex} onClick={() => onLook({ body: sex, beard: sex === "male" ? look.beard : false })}>
              {sex === "male" ? "Male" : "Female"}
            </button>
          ))}
        </div>
        <button className="lab-wide" onClick={onRandom}>
          🎲 Randomise
        </button>
      </section>

      <section>
        <h3>Skin tone</h3>
        <div className="lab-swatches">
          {SKIN_TONES.map((tone) => (
            <button
              key={tone.id}
              className="lab-swatch"
              title={tone.label}
              aria-label={tone.label}
              aria-pressed={look.skinTone === tone.id}
              style={{ background: tone.map === "dark" ? "#3a2418" : tone.tint }}
              onClick={() => onLook({ skinTone: tone.id })}
            />
          ))}
        </div>
      </section>

      <section>
        <h3>Hair</h3>
        <div className="lab-chips">
          <button aria-pressed={look.hair === null} onClick={() => onLook({ hair: null })}>
            None
          </button>
          {PROC_HAIR.map((hair) => (
            <button key={hair.id} aria-pressed={look.hair === hair.id} onClick={() => onLook({ hair: hair.id })}>
              {hair.label}
            </button>
          ))}
          {hairStyles.map((hair) => (
            <button key={hair.id} aria-pressed={look.hair === hair.id} onClick={() => onLook({ hair: hair.id })}>
              {hair.label}
            </button>
          ))}
        </div>
        <div className="lab-swatches">
          {HAIR_COLORS.map((swatch) => (
            <button
              key={swatch.id}
              className="lab-swatch"
              title={swatch.label}
              aria-label={`${swatch.label} hair`}
              aria-pressed={look.hairColor === swatch.id}
              style={{ background: swatch.color }}
              onClick={() => onLook({ hairColor: swatch.id })}
            />
          ))}
        </div>
      </section>

      <section>
        <h3>Face</h3>
        <label className="lab-check">
          <input type="checkbox" checked={look.beard} onChange={(e) => onLook({ beard: e.target.checked })} /> Beard
        </label>
        <div className="lab-chips">
          <button aria-pressed={look.brows === null} onClick={() => onLook({ brows: null })}>
            Default brows
          </button>
          {brows.map((brow) => (
            <button key={brow.id} aria-pressed={look.brows === brow.id} onClick={() => onLook({ brows: brow.id })}>
              {brow.label}
            </button>
          ))}
        </div>
        <h4>Eyes</h4>
        <div className="lab-swatches">
          {EYE_COLORS.map((swatch) => (
            <button
              key={swatch.id}
              className="lab-swatch"
              title={swatch.label}
              aria-label={`${swatch.label} eyes`}
              aria-pressed={look.eyeColor === swatch.id}
              style={{ background: swatch.id === "brown" ? "#5b3a1e" : swatch.color }}
              onClick={() => onLook({ eyeColor: swatch.id })}
            />
          ))}
        </div>
      </section>

      <section>
        <h3>Clothing</h3>
        {(
          [
            ["top", "Top", PROC_TOPS],
            ["bottom", "Bottom", PROC_BOTTOMS],
            ["shoes", "Shoes", PROC_SHOES],
          ] as const
        ).map(([slot, label, procedural]) => (
          <div key={slot}>
            <h4>{label}</h4>
            <div className="lab-chips">
              <button aria-pressed={look[slot] === null} onClick={() => onLook({ [slot]: null })}>
                None
              </button>
              {procedural.map((item) => (
                <button key={item.id} aria-pressed={look[slot] === item.id} onClick={() => onLook({ [slot]: item.id })}>
                  {item.label}
                </button>
              ))}
              {outfitIds.map((id) => (
                <button key={id} aria-pressed={look[slot] === id} onClick={() => onLook({ [slot]: id })}>
                  {outfits[id]?.label ?? id}
                </button>
              ))}
            </div>
            {slot !== "shoes" && (
              <div className="lab-chips">
                {FABRIC_OPTIONS.map((fabric) => (
                  <button
                    key={fabric.id}
                    className="lab-chip-small"
                    aria-pressed={look[`${slot}Fabric`] === fabric.id}
                    onClick={() => onLook({ [`${slot}Fabric`]: fabric.id })}
                  >
                    {fabric.label}
                  </button>
                ))}
              </div>
            )}
            <div className="lab-swatches lab-swatches-small">
              <button
                className="lab-swatch lab-swatch-original"
                title="Original colours"
                aria-label={`${label} original colours`}
                aria-pressed={look[`${slot}Color`] === null}
                onClick={() => onLook({ [`${slot}Color`]: null })}
              >
                ∅
              </button>
              {CLOTH_COLORS.map((swatch) => (
                <button
                  key={swatch.id}
                  className="lab-swatch"
                  title={swatch.label}
                  aria-label={`${label} ${swatch.label}`}
                  aria-pressed={look[`${slot}Color`] === swatch.id}
                  style={{ background: swatch.color }}
                  onClick={() => onLook({ [`${slot}Color`]: swatch.id })}
                />
              ))}
            </div>
          </div>
        ))}
        <h4>Extras</h4>
        <label className="lab-check">
          <input type="checkbox" checked={look.hood} onChange={(e) => onLook({ hood: e.target.checked })} /> Hood
        </label>
        <label className="lab-check">
          <input type="checkbox" checked={look.pauldrons} onChange={(e) => onLook({ pauldrons: e.target.checked })} /> Shoulder guards
        </label>
        <h4>Original colour set (when no colour chosen)</h4>
        <div className="lab-chips">
          {(outfits[look.top ?? look.bottom ?? outfitIds[0] ?? ""]?.variants ?? [{ id: "a", label: "Set 1" }]).map((v, i) => (
            <button key={v.id} aria-pressed={look.outfitVariant === v.id} onClick={() => onLook({ outfitVariant: v.id })}>
              Set {i + 1}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Animation</h3>
        <label className="lab-field">
          <span>Speed {speed.toFixed(1)}×</span>
          <input type="range" min={0.2} max={2} step={0.1} value={speed} onChange={(e) => onSpeed(Number(e.target.value))} />
        </label>
        <div className="lab-clips">
          {clips.map((name) => (
            <button key={name} aria-pressed={clip === name} onClick={() => onClip(name)}>
              {name.replace(/_Loop$/, "").replace(/_/g, " ")}
              {name.endsWith("_Loop") ? " ↻" : ""}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function AssetBrowser({
  assets,
  selected,
  onSelect,
  manifest,
}: {
  assets: AssetRecord[];
  selected: AssetRecord | null;
  onSelect(asset: AssetRecord): void;
  manifest: AssetManifest;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, AssetRecord[]>();
    for (const asset of assets) {
      const key = asset.group ?? "other";
      map.set(key, [...(map.get(key) ?? []), asset]);
    }
    return [...map.entries()];
  }, [assets]);

  const credit = selected?.credit ? manifest.credits[selected.credit] : null;

  return (
    <div className="lab-section-stack">
      {selected && (
        <section className="lab-card">
          <h3>{selected.label ?? selected.id}</h3>
          <p>
            {selected.triangles} triangles · {(selected.bytes / 1024).toFixed(0)} KB
          </p>
          {credit && (
            <p className="lab-muted">
              {credit.name} by {credit.author} ({credit.licence})
            </p>
          )}
        </section>
      )}
      {groups.map(([group, items]) => (
        <section key={group}>
          <h3>{group}</h3>
          <div className="lab-chips">
            {items.map((asset) => (
              <button key={asset.id} aria-pressed={selected?.id === asset.id} onClick={() => onSelect(asset)}>
                {asset.label ?? asset.id}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PipelineReport({ manifest }: { manifest: AssetManifest }) {
  const total = manifest.assets.reduce((n, a) => n + a.bytes, 0);
  const rows = manifest.assets.filter((a) => a.category !== "texture");
  const over = rows.filter((a) => a.budgetProblems?.length).length;
  return (
    <div className="lab-section-stack">
      <section className="lab-card">
        <h3>Library</h3>
        <p>
          {manifest.assets.length} assets · {(total / 1e6).toFixed(1)} MB total ·{" "}
          <strong className={over ? "lab-bad" : "lab-good"}>{over ? `${over} over budget` : "all within budget"}</strong>
        </p>
        <p className="lab-muted">Built {new Date(manifest.generatedAt).toLocaleString()}</p>
      </section>

      <section>
        <h3>Budgets</h3>
        <table className="lab-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Max tris</th>
              <th>Max size</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(manifest.budgets).map(([category, budget]) => (
              <tr key={category}>
                <td>{category}</td>
                <td>{budget.maxTriangles?.toLocaleString() ?? "—"}</td>
                <td>{budget.maxBytes ? `${Math.round(budget.maxBytes / 1024)} KB` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Sources & licences</h3>
        <ul className="lab-credits">
          {Object.values(manifest.credits).map((credit) => (
            <li key={credit.name}>
              <a href={credit.url} target="_blank" rel="noreferrer">
                {credit.name}
              </a>{" "}
              — {credit.author}, {credit.licence}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Heaviest assets</h3>
        <table className="lab-table">
          <tbody>
            {[...rows]
              .sort((a, b) => b.bytes - a.bytes)
              .slice(0, 10)
              .map((a) => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td>{a.triangles ? `${a.triangles.toLocaleString()} tris` : "—"}</td>
                  <td>{(a.bytes / 1024).toFixed(0)} KB</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
