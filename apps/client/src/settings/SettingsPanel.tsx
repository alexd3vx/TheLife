import { isLocked } from "../features";
import { useEffect, useState } from "react";
import { PRESET_LABEL, applyPreset, getSettings, recommendedPreset, updateSettings, useSettings, type Preset, type Settings, type ShadowQuality } from "./settings";
import { GameIcon } from "../ui/icons";
import { isAdmin } from "../ui/admin";
import { PUBLIC_SERVER } from "../net/connection";
import { canFullscreen, toggleFullscreen, useInstall } from "../pwa/pwa";
import { ACTIONS, DEFAULT_KEYS, DEFAULT_TOUCH, keyName, type GameAction } from "../controls/bindings";
import TouchControls, { isTouchDevice } from "../controls/TouchControls";
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

/** One row per action; press "Change" then the key you want. */
function KeyBinder() {
  const s = useSettings();
  const [waiting, setWaiting] = useState<GameAction | null>(null);
  useEffect(() => {
    if (!waiting) return;
    const on = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== "Escape") {
        const keys = { ...getKeys() };
        for (const a of Object.keys(keys) as GameAction[]) keys[a] = keys[a].filter((k) => k !== e.code);
        keys[waiting] = [e.code];
        updateSettings({ keys });
      }
      setWaiting(null);
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [waiting]);
  return (
    <div className="st-keys">
      {ACTIONS.map((a) => (
        <div className="st-key-row" key={a.id}>
          <span>{a.label}</span>
          <span className="st-key-caps">{s.keys[a.id].length ? s.keys[a.id].map((k) => <kbd key={k}>{keyName(k)}</kbd>) : <em>none</em>}</span>
          <button onClick={() => setWaiting(waiting === a.id ? null : a.id)}>{waiting === a.id ? "Press a key…" : "Change"}</button>
        </div>
      ))}
      <button className="st-key-reset" onClick={() => updateSettings({ keys: structuredClone(DEFAULT_KEYS) })}>Reset keys</button>
    </div>
  );
}
const getKeys = () => getSettings().keys;

/** The settings screen: a preset on top, then every option. Changes apply to the running game straight away. */
export default function SettingsPanel({ onClose }: { onClose?(): void }) {
  const s = useSettings();
  const [tab, setTab] = useState<Tab>("graphics");
  const set = (patch: Partial<Settings>) => updateSettings(patch);
  const [editLayout, setEditLayout] = useState(false);
  const install = useInstall();
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
          <a className="st-close" href={isLocked("map") ? "#/play" : "#/map"} aria-label="Back to the game">
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
            <Row title="Resolution" hint="Higher is sharper but heavier. 100% is one pixel per screen pixel; phone screens are usually 200% to 300%. If the picture looks soft, raise this.">
              <Slider label="Resolution" value={s.resolution} min={0.5} max={3} step={0.25} onChange={(v) => set({ resolution: v })} format={(v) => `${Math.round(v * 100)}%`} />
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
            <Row title="Home view" hint="Walk about inside your home in 3D, or look down on it from above (isometric). It applies the next time you open your home.">
              <Segments label="Home view" value={s.homeView} onChange={(v) => set({ homeView: v })} options={[{ id: "3d", label: "3D" }, { id: "iso", label: "Isometric" }]} />
            </Row>
            <Row title="Install the game" hint={install.state === "installed" ? "TheLife is installed on this device." : install.state === "ios" ? "In Safari, tap Share, then Add to Home Screen." : install.state === "unavailable" ? "Use your browser menu: Install app or Add to Home Screen." : "Opens full screen from its own icon. You still need internet to play."}>
              {install.state === "ready" ? <button className="st-btn" onClick={() => void install.install()}>Install</button> : <span>{install.state === "installed" ? "Installed" : ""}</span>}
            </Row>
            {canFullscreen() && (
              <Row title="Full screen" hint="Hides the browser bars.">
                <button className="st-btn" onClick={toggleFullscreen}>Toggle</button>
              </Row>
            )}
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
            <Row title="Tap the ground to walk" hint="Turn off if you only want to walk with the keys or the stick.">
              <Toggle on={s.tapToWalk} onChange={(v) => set({ tapToWalk: v })} label="Tap the ground to walk" />
            </Row>
            <Row title="Flip camera drag" hint="Swap the direction the camera turns when you drag.">
              <Toggle on={s.invertLook} onChange={(v) => set({ invertLook: v })} label="Flip camera drag" />
            </Row>
            <Row title="On-screen controls" hint="The stick and buttons. Auto shows them on phones and tablets.">
              <Segments label="On-screen stick and buttons (optional)" value={s.touchControls} options={[{ id: "auto", label: "Auto" }, { id: "on", label: "On" }, { id: "off", label: "Off" }]} onChange={(v) => set({ touchControls: v })} />
            </Row>
            <Row title="Button see-through" hint="How faint the on-screen controls are.">
              <Slider label="Button see-through" value={s.touchOpacity} min={0.25} max={1} step={0.05} onChange={(v) => set({ touchOpacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
            </Row>
            <Row title="Vibration" hint="A small buzz when you press a button.">
              <Toggle on={s.haptics} onChange={(v) => set({ haptics: v })} label="Vibration" />
            </Row>
            <Row title="Move the buttons" hint="Drag each control where your thumbs like it, make it bigger or smaller, or hide it.">
              <button className="st-btn" onClick={() => setEditLayout(true)}>Edit layout</button>
            </Row>
            <h3 className="st-sub">Keyboard</h3>
            <KeyBinder />
            <p className="st-note">{isTouchDevice() ? "Drag the screen to turn the camera, pinch to zoom." : "Hold the left or right mouse button and drag to turn the camera. Scroll to zoom."} Tap the ground to walk there when that is on.</p>
          </>
        )}

        {editLayout && (
          <div className="st-layout" role="dialog" aria-label="Edit on-screen controls">
            <TouchControls editing />
            <div className="st-layout-bar">
              <span>Drag a control to move it. Tap one to resize or hide it.</span>
              <button onClick={() => updateSettings({ touch: structuredClone(DEFAULT_TOUCH) })}>Reset all</button>
              <button className="is-primary" onClick={() => setEditLayout(false)}>Done</button>
            </div>
          </div>
        )}
        {tab === "online" && (
          <>
            {isAdmin() ? (
              <Row title="Server address (admin)" hint="Where the online world runs. Players always use the built-in address; only admins can change it.">
                <input className="st-text" value={s.serverUrl} onChange={(e) => set({ serverUrl: e.target.value.trim() })} placeholder={PUBLIC_SERVER} spellCheck={false} autoCapitalize="off" aria-label="Server address" />
              </Row>
            ) : (
              <p className="st-note">You are connected to the TheLife world server. Nothing to set up.</p>
            )}
          </>
        )}
      <p className="st-note">Map data © OpenStreetMap contributors (ODbL). Lagos Island is drawn from it.</p>
      </div>
    </div>
  );
}
