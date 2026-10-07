import * as THREE from "three";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getToken } from "../net/tokenBridge";
import { serverHttpBase } from "../net/useServerStats";
import { isAdmin } from "../ui/admin";
import { Avatar, REAL_FOR_LIFE } from "./avatar";
import { animConfig, type SlotSetting } from "./animConfig";
import { importAnimationFile } from "./animImport";
import { loadSavedLook } from "./looks";
import { loadManifest } from "./manifest";
import { createViewer, type Viewer } from "./viewer";
import "./animeditor.css";

/** The moves the game plays, in plain words. Pick one, find a clip that suits it, set it up, publish. */
const SLOTS: { id: string; label: string; group: string }[] = [
  { id: "Idle_Loop", label: "Standing still", group: "Moving" },
  { id: "Walk_Loop", label: "Walking", group: "Moving" },
  { id: "Walk_Formal_Loop", label: "Walking, slowly", group: "Moving" },
  { id: "Jog_Fwd_Loop", label: "Running", group: "Moving" },
  { id: "Sprint_Loop", label: "Sprinting", group: "Moving" },
  { id: "Sitting_Enter", label: "Sitting down", group: "Sitting" },
  { id: "Sitting_Idle_Loop", label: "Sitting", group: "Sitting" },
  { id: "Sitting_Exit", label: "Getting up", group: "Sitting" },
  { id: "Life_Eat_Loop", label: "Eating at the table", group: "Home" },
  { id: "Life_Eat_Standing_Loop", label: "Eating standing", group: "Home" },
  { id: "Life_Drink_Loop", label: "Drinking", group: "Home" },
  { id: "Life_Cook_Loop", label: "Cooking", group: "Home" },
  { id: "Life_Type_Loop", label: "Working at the computer", group: "Home" },
  { id: "Life_Wash_Loop", label: "Showering and washing", group: "Home" },
  { id: "Life_Brush_Loop", label: "Brushing teeth", group: "Home" },
  { id: "Life_Read_Loop", label: "Reading", group: "Home" },
  { id: "Life_Sleep_Loop", label: "Sleeping", group: "Home" },
  { id: "Life_Phone_Loop", label: "On the phone", group: "Home" },
  { id: "Dance_Loop", label: "Dancing to the radio", group: "Home" },
  { id: "Life_Yawn", label: "Yawning (tired)", group: "Body language" },
  { id: "Life_Stretch", label: "Stretching", group: "Body language" },
  { id: "Life_BellyRub", label: "Rubbing the stomach (hungry)", group: "Body language" },
  { id: "Life_Fidget", label: "Fidgeting (needs the toilet)", group: "Body language" },
  { id: "Life_Wave_Loop", label: "Waving at someone", group: "With others" },
  { id: "Life_Cheer_Loop", label: "Cheering", group: "With others" },
  { id: "Life_Talk_Loop", label: "Talking", group: "With others" },
];

const fmt = (t: number) => `${t.toFixed(2)}s`;
const safeName = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 40);

export default function AnimEditorPage() {
  const boxRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<Avatar | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"moves" | "library" | "import">("moves");
  const [slots, setSlots] = useState<Record<string, SlotSetting>>({ ...animConfig.slots });
  const [slot, setSlot] = useState<string>("Life_Cook_Loop");
  const [clipName, setClipName] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [custom, setCustom] = useState<string[]>([...animConfig.custom.keys()]);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(1);
  const [trim, setTrim] = useState<[number, number]>([0, 1]);
  const [hold, setHold] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [dirty, setDirty] = useState(false);
  const [allowed, setAllowed] = useState(isAdmin() || import.meta.env.DEV);
  // the account's admin flag arrives a moment after the page opens
  useEffect(() => {
    if (allowed) return;
    const t = window.setInterval(() => isAdmin() && setAllowed(true), 400);
    return () => window.clearInterval(t);
  }, [allowed]);

  // the base clip being looked at (library clip, imported clip, or what the selected move plays now)
  const baseClip = useCallback((): THREE.AnimationClip | undefined => {
    const a = avatarRef.current;
    if (!a) return undefined;
    if (clipName) return a.rawClip(clipName);
    return a.slotClip(slot);
  }, [clipName, slot]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const viewer: Viewer | null = createViewer(box);
    if (!viewer) {
      setError("This browser can't draw 3D.");
      return;
    }
    viewer.setLighting("daylight");
    let gone = false;
    (async () => {
      await animConfig.load();
      const manifest = await loadManifest();
      const avatar = new Avatar(manifest, loadSavedLook());
      await avatar.load();
      if (gone) return;
      avatarRef.current = avatar;
      viewer.setSubject(avatar.root);
      viewer.addFrameCallback((dt) => {
        avatar.update(dt);
        setTime(avatar.playbackTime);
      });
      setNames(avatar.libraryNames());
      setSlots({ ...animConfig.slots });
      setReady(true);
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      gone = true;
      viewer.dispose();
    };
  }, []);

  // show what the selection plays, with the current settings applied
  const preview = useCallback(
    (settings?: SlotSetting) => {
      const a = avatarRef.current;
      const base = baseClip();
      if (!a || !base) return;
      const s: SlotSetting = settings ?? { clip: clipName ?? "", speed, loop, hold, trim: trim[1] > trim[0] && (trim[0] > 0 || trim[1] < base.duration - 0.01) ? trim : null };
      // the preview applies the settings the same way the game does
      const key = `${s.speed ?? 1}|${s.hold ?? ""}|${s.trim?.join(",") ?? ""}`;
      void key;
      import("./animConfig").then(({ derive }) => {
        const made = derive(base, "preview", { ...s, hold: s.hold ?? null });
        a.playClip(made, s.loop !== false);
        setDuration(made.duration);
        setPlaying(true);
      });
    },
    [baseClip, clipName, speed, loop, hold, trim],
  );

  // choosing a move or a clip loads its settings into the controls and plays it
  useEffect(() => {
    if (!ready) return;
    const a = avatarRef.current!;
    const base = baseClip();
    if (!base) return;
    const cur = !clipName ? slots[slot] : undefined;
    setSpeed(cur?.speed ?? 1);
    setLoop(cur?.loop !== false);
    setHold(cur?.hold ?? null);
    setTrim(cur?.trim ?? [0, base.duration]);
    setDuration(base.duration);
    void a;
    const t = window.setTimeout(() => preview(cur ?? { clip: clipName ?? "", loop: true }), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, slot, clipName]);

  const replay = () => preview();
  const toggle = () => {
    const next = !playing;
    avatarRef.current?.setPlayback({ paused: !next });
    setPlaying(next);
  };
  const scrub = (t: number) => {
    avatarRef.current?.setPlayback({ paused: true, time: t });
    setPlaying(false);
  };

  const usable = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...custom.map((c) => `custom:${c}`), ...names];
    return all.filter((n) => !q || n.toLowerCase().includes(q));
  }, [names, custom, query]);

  const useForSlot = () => {
    if (!clipName) return setStatus("Pick a clip in the Library first.");
    const base = baseClip();
    const s: SlotSetting = { clip: clipName, speed, loop };
    if (hold !== null) s.hold = hold;
    if (base && trim[1] > trim[0] && (trim[0] > 0 || trim[1] < base.duration - 0.01)) s.trim = trim;
    const next = { ...slots, [slot]: s };
    setSlots(next);
    animConfig.setSlots(next);
    setDirty(true);
    setStatus(`"${SLOTS.find((x) => x.id === slot)?.label}" now uses ${clipName}. Publish to save it for everyone.`);
  };
  const resetSlot = () => {
    const next = { ...slots };
    delete next[slot];
    setSlots(next);
    animConfig.setSlots(next);
    setClipName(null);
    setDirty(true);
    setStatus("Back to the built-in move. Publish to save it.");
  };

  const importFiles = async (files: FileList | null) => {
    const a = avatarRef.current;
    if (!files || !a) return;
    setStatus("Reading the file…");
    try {
      const added: string[] = [];
      for (const f of Array.from(files)) {
        for (const { name, clip } of await importAnimationFile(f, a)) {
          animConfig.addCustom(name, clip);
          added.push(name);
        }
      }
      setCustom([...animConfig.custom.keys()]);
      setPending((p) => new Set([...p, ...added]));
      setStatus(`Added ${added.join(", ")}. They are in the Library under "custom:". Publish to keep them.`);
      setTab("library");
      if (added[0]) setClipName(`custom:${added[0]}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  const publish = async () => {
    setStatus("Publishing…");
    const token = await getToken();
    const headers: Record<string, string> = { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) };
    try {
      const used = new Set(Object.values(slots).filter((s) => s.clip.startsWith("custom:")).map((s) => s.clip.slice(7)));
      for (const n of new Set([...pending, ...used])) {
        const clip = animConfig.custom.get(n);
        if (!clip || (!pending.has(n) && !used.has(n))) continue;
        if (!pending.has(n)) continue; // already on the server
        const res = await fetch(`${serverHttpBase()}/anim/clip/${safeName(n)}`, { method: "PUT", headers, body: JSON.stringify(THREE.AnimationClip.toJSON(clip)) });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `The server said ${res.status}`);
      }
      const res = await fetch(`${serverHttpBase()}/anim/map`, { method: "PUT", headers, body: JSON.stringify({ slots }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `The server said ${res.status}`);
      setPending(new Set());
      setDirty(false);
      setStatus("Published. Everyone gets it the next time they open the game.");
    } catch (e) {
      setStatus(`Could not publish: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  if (!allowed) {
    return (
      <main className="ae-denied">
        <h1>Animation editor</h1>
        <p>This is the owner's tool. Log in with the owner account to use it.</p>
        <a href="#/">Back</a>
      </main>
    );
  }
  const group = (g: string) => SLOTS.filter((s) => s.group === g);
  const defaultOf = (id: string) => REAL_FOR_LIFE[id] ?? (id === "Idle_Loop" ? "held pose" : "built-in");
  return (
    <main className="ae">
      <div className="ae-stage" ref={boxRef}>
        {!ready && !error && <div className="ae-wait">Loading the character…</div>}
        {error && <div className="ae-wait">{error}</div>}
        <a className="ae-back" href="#/">←</a>
      </div>

      <div className="ae-transport">
        <button onClick={toggle} aria-label={playing ? "Pause" : "Play"}>{playing ? "❚❚" : "▶"}</button>
        <input type="range" min={0} max={Math.max(0.05, duration)} step={0.01} value={Math.min(time % Math.max(0.05, duration), duration)} onChange={(e) => scrub(Number(e.target.value))} aria-label="Position in the clip" />
        <span>{fmt(Math.min(time % Math.max(0.05, duration), duration))} / {fmt(duration)}</span>
      </div>

      <nav className="ae-tabs">
        {(["moves", "library", "import"] as const).map((t) => (
          <button key={t} className={tab === t ? "is-on" : ""} onClick={() => setTab(t)}>{t === "moves" ? "Moves" : t === "library" ? "Library" : "Import"}</button>
        ))}
        <button className="ae-publish" onClick={() => void publish()} disabled={!dirty && pending.size === 0}>Publish{dirty || pending.size ? " •" : ""}</button>
      </nav>

      <div className="ae-body">
        {tab === "moves" &&
          ["Moving", "Sitting", "Home", "Body language", "With others"].map((g) => (
            <section key={g}>
              <h3>{g}</h3>
              <ul className="ae-list">
                {group(g).map((s) => (
                  <li key={s.id}>
                    <button className={slot === s.id && !clipName ? "is-on" : ""} onClick={() => { setClipName(null); setSlot(s.id); }}>
                      <b>{s.label}</b>
                      <small>{slots[s.id] ? `${slots[s.id]!.clip}${slots[s.id]!.speed && slots[s.id]!.speed !== 1 ? ` ×${slots[s.id]!.speed}` : ""}` : `built-in (${defaultOf(s.id)})`}</small>
                      {slots[s.id] && <em>edited</em>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}

        {tab === "library" && (
          <>
            <input className="ae-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clips (walk, sit, work, lie…)" />
            <ul className="ae-list">
              {usable.map((n) => (
                <li key={n}>
                  <button className={clipName === n ? "is-on" : ""} onClick={() => setClipName(n)}>
                    <b>{n}</b>
                    <small>{n.startsWith("custom:") ? (pending.has(n.slice(7)) ? "yours, not published yet" : "yours") : n.startsWith("KK_") ? "KayKit" : n.startsWith("XB_") || n.startsWith("MX_") ? "Mixamo" : n.startsWith("U2_") ? "Quaternius 2" : "Quaternius"}</small>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {tab === "import" && (
          <div className="ae-import">
            <p>Add your own animation: a Mixamo <b>.fbx</b> (download "FBX Binary, with skin" or without), or a <b>.glb</b>. It is fitted to the body automatically.</p>
            <label className="ae-file">
              Choose files
              <input type="file" accept=".fbx,.glb,.gltf" multiple onChange={(e) => void importFiles(e.target.files)} />
            </label>
            <p className="ae-note">Each clip then shows in the Library as <code>custom:name</code>. Assign it to a move, then Publish.</p>
          </div>
        )}
      </div>

      <div className="ae-bar">
        <div className="ae-selected">
          <small>Move</small>
          <b>{SLOTS.find((s) => s.id === slot)?.label}</b>
          <small>Clip: {clipName ?? slots[slot]?.clip ?? defaultOf(slot)}</small>
        </div>
        <details className="ae-more">
          <summary>Fine tune: speed, loop, freeze, trim</summary>
        <div className="ae-controls">
          <label>Speed
            <select value={speed} onChange={(e) => { setSpeed(Number(e.target.value)); }}>
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => <option key={v} value={v}>{v}×</option>)}
            </select>
          </label>
          <label className="ae-check"><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Loop</label>
          <button onClick={() => setHold(hold === null ? Math.min(time, duration) : null)}>{hold === null ? "Freeze here" : `Frozen at ${fmt(hold)} (undo)`}</button>
        </div>
        <div className="ae-trim">
          <label>Start {fmt(trim[0])}<input type="range" min={0} max={Math.max(0.05, baseClip()?.duration ?? duration)} step={0.02} value={trim[0]} onChange={(e) => setTrim([Math.min(Number(e.target.value), trim[1] - 0.1), trim[1]])} /></label>
          <label>End {fmt(trim[1])}<input type="range" min={0} max={Math.max(0.05, baseClip()?.duration ?? duration)} step={0.02} value={trim[1]} onChange={(e) => setTrim([trim[0], Math.max(Number(e.target.value), trim[0] + 0.1)])} /></label>
        </div>
        </details>
        <div className="ae-actions">
          <button onClick={replay}>Try these settings</button>
          <button className="primary" onClick={useForSlot}>Use for this move</button>
          <button onClick={resetSlot} disabled={!slots[slot]}>Back to built-in</button>
        </div>
        {status && <p className="ae-status" role="status">{status}</p>}
      </div>
    </main>
  );
}
