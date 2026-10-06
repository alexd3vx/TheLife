import { useState } from "react";
import { PRESET_LABEL, applyPreset, recommendedPreset, updateSettings, useSettings, type Preset, type Settings, type ShadowQuality } from "./settings";
import { GameIcon } from "../ui/icons";
import "./settings.css";

type Tab = "graphics" | "display" | "controls" | "online";

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="st-row">
      <span className="st-label">
        <strong>{title}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <span className="st-control">{children}</span>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <button className={`st-toggle${on ? " is-on" : ""}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

function Segments<T extends string | number>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange(v: T): void; label: string }) {
  return (
    <div className="st-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.id)} role="radio" aria-checked={value === o.id} className={value === o.id ? "is-on" : ""} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ value, min, max, step, onChange, format, label }: { value: number; min: number; max: number; step: number; onChange(v: number): void; format(v: number): string; label: string }) {
  return (
    <span className="st-slider">
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
      <output>{format(value)}</output>
    </span>
  );
}

/** The settings screen: a preset on top, then every option. Changes apply to the running game straight away. */
export default function SettingsPanel({ onClose }: { onClose?(): void }) {
  const s = useSettings();
  const [tab, setTab] = useState<Tab>("graphics");
  const set = (patch: Partial<Settings>) => updateSettings(patch);
  const rec = recommendedPreset();
  const presets: Preset[] = ["recommended", "low", "medium", "high", "ultra"];
  return (
    <div className="st-panel" role="dialog" aria-label="Settings">
      <header className="st-head">
        <h2>Settings</h2>
        {onClose ? (
          <button className="st-close" onClick={onClose} aria-label="Close settings">
            <GameIcon name="close" size={18} />
          </button>
        ) : (
          <a className="st-close" href="#/map" aria-label="Back to the game">
            <GameIcon name="close" size={18} />
          </a>
        )}
      </header>
      <nav className="st-tabs" role="tablist">
        {(["graphics", "display", "controls", "online"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t[0]!.toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      <div className="st-body">
        {tab === "graphics" && (
          <>
            <div className="st-presets" role="radiogroup" aria-label="Graphics preset">
              {presets.map((p) => (
                <button key={p} role="radio" aria-checked={s.preset === p} className={s.preset === p ? "is-on" : ""} onClick={() => applyPreset(p)}>
                  {PRESET_LABEL[p]}
                </button>
              ))}
              <button role="radio" aria-checked={s.preset === "custom"} className={s.preset === "custom" ? "is-on" : ""} disabled>
                Custom
              </button>
            </div>
            <p className="st-note">Recommended for this device: <b>{PRESET_LABEL[rec]}</b>. Change any option below and the preset becomes Custom.</p>

            <h3>Picture</h3>
            <Row title="Resolution" hint="Higher is sharper but heavier. 100% is one pixel per screen pixel.">
              <Slider label="Resolution" value={s.resolution} min={0.5} max={2} step={0.25} onChange={(v) => set({ resolution: v })} format={(v) => `${Math.round(v * 100)}%`} />
            </Row>
            <Row title="Adjust automatically" hint="Lowers resolution and shadow updates if the frame rate drops, then raises them again.">
              <Toggle label="Adjust automatically" on={s.autoAdjust} onChange={(v) => set({ autoAdjust: v })} />
            </Row>
            <Row title="Frame rate limit" hint="A lower limit saves battery and heat.">
              <Segments label="Frame rate limit" value={s.fpsCap} onChange={(v) => set({ fpsCap: v })} options={[{ id: 30, label: "30" }, { id: 45, label: "45" }, { id: 60, label: "60" }, { id: 0, label: "Max" }]} />
            </Row>
            <Row title="Anti-aliasing" hint="Smooths jagged edges. Takes effect the next time the game loads.">
              <Toggle label="Anti-aliasing" on={s.antialias} onChange={(v) => set({ antialias: v })} />
            </Row>
            <Row title="Draw distance" hint="How far you can see.">
              <Slider label="Draw distance" value={s.drawDistance} min={0.5} max={1.2} step={0.1} onChange={(v) => set({ drawDistance: v })} format={(v) => `${Math.round(v * 100)}%`} />
            </Row>

            <h3>Light and shadow</h3>
            <Row title="Shadows">
              <Segments<ShadowQuality> label="Shadows" value={s.shadows} onChange={(v) => set({ shadows: v })} options={[{ id: "off", label: "Off" }, { id: "low", label: "Low" }, { id: "medium", label: "Med" }, { id: "high", label: "High" }]} />
            </Row>
            <Row title="Shadow distance">
              <Slider label="Shadow distance" value={s.shadowDistance} min={0.5} max={1.5} step={0.1} onChange={(v) => set({ shadowDistance: v })} format={(v) => `${Math.round(v * 100)}%`} />
            </Row>
            <Row title="Bloom" hint="A soft glow around bright lights, the sun and the sky.">
              <Toggle label="Bloom" on={s.bloom} onChange={(v) => set({ bloom: v })} />
            </Row>
            {s.bloom && (
              <Row title="Bloom strength">
                <Slider label="Bloom strength" value={s.bloomStrength} min={0.1} max={1.5} step={0.1} onChange={(v) => set({ bloomStrength: v })} format={(v) => v.toFixed(1)} />
              </Row>
            )}
            <Row title="Lights indoors" hint="How many lamps and screens can glow at once.">
              <Segments label="Lights indoors" value={s.lights} onChange={(v) => set({ lights: v })} options={[{ id: 1, label: "1" }, { id: 2, label: "2" }, { id: 4, label: "4" }, { id: 8, label: "8" }]} />
            </Row>

            <h3>World</h3>
            <Row title="Look" hint="Characters switch now. Streets and buildings follow when the real Lagos map arrives.">
              <Segments label="Look" value={s.textureStyle} onChange={(v) => set({ textureStyle: v })} options={[{ id: "cartoon", label: "Cartoon" }, { id: "realistic", label: "Realistic" }]} />
            </Row>
            <Row title="People on the street" hint="How busy the pavements are.">
              <Slider label="People on the street" value={s.crowd} min={0} max={100} step={10} onChange={(v) => set({ crowd: v })} format={(v) => `${v}%`} />
            </Row>
          </>
        )}

        {tab === "display" && (
          <>
            <Row title="Show frame rate">
              <Toggle label="Show frame rate" on={s.showFps} onChange={(v) => set({ showFps: v })} />
            </Row>
            <Row title="Show performance details" hint="Draw calls, triangles and chunks. For testing.">
              <Toggle label="Show performance details" on={s.showStats} onChange={(v) => set({ showStats: v })} />
            </Row>
            <Row title="Player name tags" hint="Names above other players.">
              <Toggle label="Player name tags" on={s.nameTags} onChange={(v) => set({ nameTags: v })} />
            </Row>
          </>
        )}

        {tab === "controls" && (
          <>
            <Row title="Camera speed" hint="How fast the view turns and zooms when you drag.">
              <Slider label="Camera speed" value={s.cameraSpeed} min={0.4} max={2} step={0.1} onChange={(v) => set({ cameraSpeed: v })} format={(v) => `${v.toFixed(1)}x`} />
            </Row>
            <p className="st-note">Tap the ground to walk there (you run if it is far). Tap something you can use to see what you can do with it. Drag to turn the camera, pinch or scroll to zoom.</p>
          </>
        )}

        {tab === "online" && (
          <>
            <Row title="Server address" hint="Where the online world runs, for example wss://46-105-53-216.sslip.io">
              <input className="st-text" value={s.serverUrl} onChange={(e) => set({ serverUrl: e.target.value.trim() })} placeholder="wss://..." spellCheck={false} autoCapitalize="off" aria-label="Server address" />
            </Row>
          </>
        )}
      </div>
    </div>
  );
}
