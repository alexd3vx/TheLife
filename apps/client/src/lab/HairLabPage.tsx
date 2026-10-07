import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import { createCharacter } from "./character";
import type { Avatar } from "./avatar";
import { DEFAULT_LOOK, HAIR_COLORS, SKIN_TONES, type Look } from "./looks";
import { HAIR_STYLES } from "../iso/wardrobe";
import "./bodylab.css";

/** A developer page for hair: one person, a close camera (front, side, back, top), every style and colour. Open it at #/hair. */
export default function HairLabPage() {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef<{ set(p: Partial<Look>): Promise<void>; view(v: string): void; state(s: "none" | "underwear" | "towel" | "night"): Promise<void>; walk(on: boolean): void; mood(m: string): void; speak(on: boolean): void; wink(): void; look(x: number, y: number, z: number): void; clipAt(name: string, frac: number): number } | null>(null);
  const [look, setLook] = useState<Look>({ ...DEFAULT_LOOK, top: null, bottom: null, shoes: null, hair: "p_afro" });
  const [view, setView] = useState("front");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = ref.current!;
    let gone = false;
    let raf = 0;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 20);
    scene.add(new THREE.HemisphereLight("#fff1dc", "#6b7a99", 1.0));
    const key = new THREE.DirectionalLight("#fff0da", 2.6);
    key.position.set(-2, 3, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight("#a9bcff", 0.8);
    fill.position.set(3, 1.5, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight("#ffffff", 1.2);
    rim.position.set(0.5, 2.5, -4);
    scene.add(rim);
    let avatar: Avatar | null = null;
    let v = "front";
    const frame = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      const head = avatar?.headHeight() ?? 1.65;
      const full = v === "full" || v === "upper" || v === "lower" || v === "feet";
      const d = v === "full" ? 5.2 : v === "upper" ? 2.9 : v === "lower" ? 3.2 : v === "feet" ? 1.8 : 1.25;
      const aim = v === "upper" ? 1.2 : v === "lower" ? 0.55 : v === "feet" ? 0.15 : 0.9;
      const angle = v === "front" ? 0 : v === "side" ? Math.PI / 2 : v === "back" ? Math.PI : v === "three" ? Math.PI / 4 : 0;
      const up = v === "top" ? 0.9 : 0;
      cam.position.set(Math.sin(angle) * d * Math.cos(up), full ? aim + 0.1 : head + 0.04 + Math.sin(up) * d, Math.cos(angle) * d * Math.cos(up));
      cam.lookAt(0, full ? aim : head + 0.02, 0);
    };
    new ResizeObserver(frame).observe(canvas);
    createCharacter(look).then((a) => {
      if (gone) return a.dispose();
      avatar = a;
      scene.add(a.root);
      a.play("Idle_Loop", 0);
      let chain = Promise.resolve();
      live.current = {
        set: (p) => (chain = chain.then(async () => { await a.setLook(p); frame(); })),
        view: (nv) => { v = nv; frame(); },
        mood: (m) => a.setMood(m as never),
        speak: (on) => a.face?.speak(on),
        clipAt: (name, frac) => {
          a.play(name, 0);
          const d = a.clipDuration(name);
          a.setPlayback({ paused: true, time: d * frac });
          a.update(0.001);
          return d;
        },
        look: (x, y, z) => a.setLookTarget(new THREE.Vector3(x, y, z)),
        wink: () => a.face?.wink1("l"),
        walk: (on) => {
          walking = on;
          a.play(on ? "Walk_Loop" : "Idle_Loop", 0.2);
          a.setSpeed(on ? 1.15 : 1);
          if (!on) a.root.position.set(0, 0, 0);
        },
        state: (st) => (chain = chain.then(async () => { await a.setOutfitState(st); })),
      };
      (window as unknown as { __hair?: unknown }).__hair = live.current;
      frame();
      setReady(true);
    });
    let last = performance.now();
    let walking = false;
    let dir = 1;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      if (walking && avatar) {
        // walk back and forth across the stage at the game's walking speed (the stage is stepped in fixed slices so the cloth sees real speeds)
        avatar.root.position.x += dir * 1.55 * dt;
        if (Math.abs(avatar.root.position.x) > 1.2) dir = -dir;
        avatar.root.rotation.y = dir * Math.PI / 2;
      }
      avatar?.update(dt);
      last = now;
      renderer.render(scene, cam);
    };
    raf = requestAnimationFrame(loop);
    return () => { gone = true; cancelAnimationFrame(raf); avatar?.dispose(); renderer.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (p: Partial<Look>) => { setLook((l) => ({ ...l, ...p })); void live.current?.set(p); };
  return (
    <div className="bl">
      <div className="bl-stage">
        <canvas ref={ref} />
        {!ready && <div className="bl-wait">Loading…</div>}
        <div className="bl-views">
          {["front", "three", "side", "back", "top", "full", "upper", "lower", "feet"].map((x) => <button key={x} className={view === x ? "is-on" : ""} onClick={() => { setView(x); live.current?.view(x); }}>{x}</button>)}
        </div>
      </div>
      <div className="bl-panel">
        <div className="bl-tabs">
          {HAIR_STYLES.map((h) => <button key={h.id} className={look.hair === h.id ? "is-on" : ""} onClick={() => patch({ hair: h.id })}>{h.label}</button>)}
        </div>
        <div className="bl-swatches">
          {HAIR_COLORS.map((c) => <button key={c.id} className={look.hairColor === c.id ? "is-on" : ""} style={{ background: c.color }} onClick={() => patch({ hairColor: c.id })} />)}
          {SKIN_TONES.slice(0, 7).map((t) => <button key={t.id} className={look.skinTone === t.id ? "is-on" : ""} style={{ background: t.base }} onClick={() => patch({ skinTone: t.id })} />)}
          <button onClick={() => patch({ body: look.body === "realmale" ? "realfemale" : "realmale" })}>sex</button>
        </div>
      </div>
    </div>
  );
}
