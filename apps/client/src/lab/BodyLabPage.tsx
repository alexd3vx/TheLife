import * as THREE from "three";
import { loadGLTF } from "./loaders";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { MorphBody, DEFAULT_SHAPE, shapeWeights, type BodyShape } from "./bodyMorph";
import { SKIN_TONES } from "./looks";
import { assetUrl } from "./manifest";
import { MIXAMO_BONES, captureRest, retargetClip } from "./retarget";
import "./bodylab.css";

/**
 * Phase 1 test page: the new morphable body with every slider, the same retargeted walk the game uses, and a few readouts (triangles,
 * how long a change takes, file sizes). Open it at #/body. It is a developer tool, not part of the game.
 */

type Tab = "Body" | "Face" | "Shape" | "Limbs";
const TABS: Tab[] = ["Body", "Face", "Shape", "Limbs"];
const GROUP_OF_TAB: Record<Tab, string[]> = { Body: [], Face: ["Face", "Eyes", "Nose", "Mouth"], Shape: ["Body"], Limbs: ["Limbs"] };
const HAIR = ["#14100e", "#2b1a12", "#5a3620", "#8a6a3c", "#b9b4a8"];

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function Slider({ label, value, min = -1, max = 1, step = 0.05, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange(v: number): void }) {
  return (
    <label className="bl-slider">
      <span>{label}<b>{Math.round(value * 100) / 100}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export default function BodyLabPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [shape, setShape] = useState<BodyShape>({ ...DEFAULT_SHAPE, sex: 1 });
  const [skin, setSkin] = useState("rich");
  const [hair, setHair] = useState(HAIR[0]!);
  const [tab, setTab] = useState<Tab>("Body");
  const [walking, setWalking] = useState(false);
  const [camera, setCamera] = useState<"full" | "face" | "back">("full");
  const [stats, setStats] = useState({ ms: 0, tris: 0, bones: 0, parts: 0 });
  const live = useRef<{ body: MorphBody | null; set(s: BodyShape): void; cam(c: string): void; walk(on: boolean): void } | null>(null);
  const [sliders, setSliders] = useState<{ id: string; label: string; group: string; oneWay: boolean }[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    let gone = false;
    let raf = 0;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 40);
    scene.add(new THREE.HemisphereLight("#fff1dc", "#6b7a99", 1.0));
    const key = new THREE.DirectionalLight("#fff0da", 2.6);
    key.position.set(-2.5, 3.5, 3.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2.5, bottom: -1, near: 0.5, far: 12 });
    scene.add(key);
    const fill = new THREE.DirectionalLight("#a9bcff", 0.8);
    fill.position.set(3, 2, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight("#ffffff", 1.2);
    rim.position.set(0.5, 2.5, -4);
    scene.add(rim);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, 0.06, 48), new THREE.MeshStandardMaterial({ color: "#c8d6ee", roughness: 0.7 }));
    disc.position.y = -0.03;
    disc.receiveShadow = true;
    scene.add(disc);
    const holder = new THREE.Group();
    scene.add(holder);

    let yaw = 0, targetYaw = 0;
    let drag: { x: number; yaw: number } | null = null;
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, yaw: targetYaw };
    });
    canvas.addEventListener("pointermove", (e) => {
      if (drag) targetYaw = drag.yaw + (e.clientX - drag.x) * 0.012;
    });
    const up = () => (drag = null);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    let view = "full";
    let bodyHeight = 1.75;
    const frame = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      const fit = Math.min(1, cam.aspect * 1.25);
      if (view === "face") {
        const half = 0.2 / Math.min(1, cam.aspect * 1.1);
        const dist = half / Math.tan((cam.fov * Math.PI) / 360);
        cam.position.set(0, bodyHeight - 0.1, dist);
        cam.lookAt(0, bodyHeight - 0.1, 0);
      } else {
        const half = (bodyHeight * 0.56 + 0.1) / fit;
        const dist = half / Math.tan((cam.fov * Math.PI) / 360);
        cam.position.set(0, bodyHeight * 0.56, dist);
        cam.lookAt(0, bodyHeight * 0.5, 0);
      }
      cam.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(frame);
    ro.observe(canvas);

    // ----- the body, and the walk
    let body: MorphBody | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    let src: { scene: THREE.Object3D; clips: THREE.AnimationClip[] } | null = null;
    let wantWalk = false;
    let retargetTimer = 0;
    let current: BodyShape = { ...DEFAULT_SHAPE, sex: 1 };
    const clipsFor = new Map<string, THREE.AnimationClip>();

    const startAnim = () => {
      if (!body || !src) return;
      mixer?.stopAllAction();
      mixer?.uncacheRoot(body.scene);
      body.bones.forEach((b) => b.quaternion.set(0, 0, 0, 1));
      body.scene.updateMatrixWorld(true);
      const bones = [...body.bones.values()];
      const rest = captureRest(bones, body.scene);
      const name = wantWalk ? "walk" : "idle";
      const clip = src.clips.find((c) => c.name === name)!;
      const moved = retargetClip(bones, rest, src.scene, clip, MIXAMO_BONES, 30);
      clipsFor.set(name, moved);
      mixer = new THREE.AnimationMixer(body.scene);
      mixer.clipAction(moved).play();
    };
    const scheduleAnim = () => {
      window.clearTimeout(retargetTimer);
      retargetTimer = window.setTimeout(startAnim, 220);
    };

    const setShape = (s: BodyShape) => {
      current = s;
      if (!body) return;
      const t0 = performance.now();
      mixer?.stopAllAction();
      body.bones.forEach((b) => b.quaternion.set(0, 0, 0, 1));
      body.apply(shapeWeights(s));
      bodyHeight = body.height;
      body.setLayersVisible({ shorts: true, top: s.sex < 0.7 });
      frame();
      const ms = performance.now() - t0;
      let tris = 0;
      body.parts.forEach((p) => (tris += p.mesh.geometry.getIndex()!.count / 3));
      setStats({ ms: Math.round(ms * 10) / 10, tris, bones: body.bones.size, parts: body.parts.size });
      scheduleAnim();
    };
    live.current = {
      body: null,
      set: setShape,
      cam: (c) => {
        view = c;
        if (c === "back") targetYaw = Math.PI;
        else if (drag === null && Math.abs(Math.cos(targetYaw)) < 1) targetYaw = 0;
        frame();
      },
      walk: (on) => {
        wantWalk = on;
        scheduleAnim();
      },
    };

    Promise.all([
      MorphBody.load(),
      loadGLTF(assetUrl("animations/mixamo_xbot.glb")),
    ])
      .then(([b, anim]) => {
        if (gone) return;
        body = b;
        live.current!.body = b;
        holder.add(b.scene);
        src = { scene: SkeletonUtils.clone(anim.scene), clips: anim.animations };
        setSliders(b.meta.sliders.map((s) => ({ id: s.id, label: s.label, group: s.group, oneWay: !s.dec })));
        setShape(current);
        setReady(true);
        (window as unknown as { __body?: unknown }).__body = { body: b, setShape, THREE };
      })
      .catch((e) => !gone && setError(String(e?.message ?? e)));

    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      yaw += (targetYaw - yaw) * Math.min(1, dt * 8);
      holder.rotation.y = yaw;
      mixer?.update(dt);
      renderer.render(scene, cam);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(retargetTimer);
      ro.disconnect();
      body?.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => live.current?.set(shape), [shape, ready]);
  useEffect(() => {
    const b = live.current?.body;
    if (!b) return;
    b.setSkin(SKIN_TONES.find((t) => t.id === skin)?.base ?? "#76503a", shape.sex < 0.5);
  }, [skin, shape.sex < 0.5, ready]);
  useEffect(() => live.current?.body?.setHairColour(hair), [hair, ready]);
  useEffect(() => live.current?.walk(walking), [walking, ready]);
  useEffect(() => live.current?.cam(camera), [camera]);

  const patch = (p: Partial<BodyShape>) => setShape((s) => ({ ...s, ...p }));
  const setDetail = (id: string, v: number) => setShape((s) => ({ ...s, detail: { ...s.detail, [id]: v } }));
  const randomise = () => {
    const sex = Math.random() < 0.5 ? 1 : 0;
    const detail: Record<string, number> = {};
    for (const s of sliders) if (Math.random() < 0.55) detail[s.id] = Math.round(rand(s.oneWay ? 0 : -0.8, 0.8) * 20) / 20;
    setShape({ sex, age: Math.round(rand(18, 68)), muscle: rand(-0.5, 0.9), weight: rand(-0.8, 0.9), height: rand(-0.9, 0.9), proportions: rand(-0.6, 0.6), european: Math.random() < 0.2 ? rand(0, 0.5) : 0, eastAsian: 0, bust: sex ? 0 : rand(-0.5, 0.9), detail });
    setSkin(SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)]!.id);
  };

  const groups = GROUP_OF_TAB[tab];
  const list = useMemo(() => sliders.filter((s) => groups.includes(s.group)), [sliders, groups]);

  return (
    <div className="bl">
      <div className="bl-stage">
        <canvas ref={canvasRef} />
        {!ready && !error && <div className="bl-wait">Loading the body…</div>}
        {error && <div className="bl-wait bl-err">{error}</div>}
        <div className="bl-views">
          {(["full", "face", "back"] as const).map((c) => (
            <button key={c} className={camera === c ? "is-on" : ""} onClick={() => setCamera(c)}>{c}</button>
          ))}
          <button className={walking ? "is-on" : ""} onClick={() => setWalking((w) => !w)}>walk</button>
        </div>
        <div className="bl-stats">{stats.tris.toLocaleString()} tris · {stats.bones} bones · {stats.parts} meshes · change {stats.ms} ms</div>
      </div>
      <div className="bl-panel">
        <div className="bl-bar">
          <button onClick={() => patch({ sex: 1, bust: 0 })}>Male</button>
          <button onClick={() => patch({ sex: 0 })}>Female</button>
          <button onClick={randomise}>Random</button>
          <button onClick={() => setShape({ ...DEFAULT_SHAPE, sex: shape.sex })}>Reset</button>
        </div>
        <div className="bl-tabs">
          {TABS.map((t) => (
            <button key={t} className={tab === t ? "is-on" : ""} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
        <div className="bl-sliders">
          {tab === "Body" && (
            <>
              <Slider label="Sex (0 feminine, 1 masculine)" value={shape.sex} min={0} max={1} onChange={(v) => patch({ sex: v })} />
              <Slider label="Age (years)" value={shape.age} min={18} max={70} step={1} onChange={(v) => patch({ age: v })} />
              <Slider label="Height" value={shape.height} onChange={(v) => patch({ height: v })} />
              <Slider label="Weight" value={shape.weight} onChange={(v) => patch({ weight: v })} />
              <Slider label="Muscle" value={shape.muscle} onChange={(v) => patch({ muscle: v })} />
              <Slider label="Proportions" value={shape.proportions} onChange={(v) => patch({ proportions: v })} />
              <Slider label="Bust (feminine)" value={shape.bust} onChange={(v) => patch({ bust: v })} />
              <Slider label="Features: European" value={shape.european} min={0} max={1} onChange={(v) => patch({ european: v })} />
              <Slider label="Features: East Asian" value={shape.eastAsian} min={0} max={1} onChange={(v) => patch({ eastAsian: v })} />
              <div className="bl-swatches">
                {SKIN_TONES.map((t) => (
                  <button key={t.id} title={t.label} className={skin === t.id ? "is-on" : ""} style={{ background: t.base }} onClick={() => setSkin(t.id)} />
                ))}
              </div>
              <div className="bl-swatches">
                {HAIR.map((c) => (
                  <button key={c} className={hair === c ? "is-on" : ""} style={{ background: c }} onClick={() => setHair(c)} />
                ))}
              </div>
            </>
          )}
          {tab !== "Body" && list.map((s) => <Slider key={s.id} label={s.label} value={shape.detail[s.id] ?? 0} min={s.oneWay ? 0 : -1} onChange={(v) => setDetail(s.id, v)} />)}
        </div>
      </div>
    </div>
  );
}
