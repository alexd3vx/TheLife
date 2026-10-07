import * as THREE from "three";
import { useEffect, useRef } from "react";
import type { Avatar } from "../lab/avatar";
import { createCharacter } from "../lab/character";
import type { Look } from "../lab/looks";
import { locomotionRate } from "../lab/locomotion";
import { getSettings } from "../settings/settings";

/**
 * The person on a small stage, in 3D: the very same character the game plays (same build path, same look, same clips), lit like a
 * portrait. Drag to turn them. Used by the creator and the profile, so what you design is exactly what walks round the city.
 */
export default function CharacterStage({ look, walking, onBusy }: { look: Look; walking: boolean; onBusy?(busy: boolean): void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef<{ avatar: Avatar | null; look: Look; set(look: Look): Promise<void> }>({ avatar: null, look, set: async () => {} });
  const walkRef = useRef(walking);
  walkRef.current = walking;
  const busyRef = useRef(onBusy);
  busyRef.current = onBusy;
  const lookRef = useRef(look);
  lookRef.current = look;

  useEffect(() => {
    const canvas = ref.current!;
    let gone = false;
    let raf = 0;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 40);
    // portrait lighting: warm key from the front-left, cool fill from the right, a rim from behind
    scene.add(new THREE.HemisphereLight("#fff1dc", "#6b7a99", 1.0));
    const key = new THREE.DirectionalLight("#fff0da", 2.6);
    key.position.set(-2.5, 3.5, 3.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2.5, bottom: -1, near: 0.5, far: 12 });
    scene.add(key);
    const fill = new THREE.DirectionalLight("#a9bcff", 0.8);
    fill.position.set(3, 2, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight("#ffffff", 1.2);
    rim.position.set(0.5, 2.5, -4);
    scene.add(rim);
    // a round stage and a soft contact shadow
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, 0.06, 48), new THREE.MeshStandardMaterial({ color: "#c8d6ee", roughness: 0.7 }));
    disc.position.y = -0.03;
    disc.receiveShadow = true;
    scene.add(disc);
    const holder = new THREE.Group();
    scene.add(holder);

    let yaw = 0;
    let target = 0;
    let drag: { x: number; yaw: number } | null = null;
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, yaw: target };
    };
    const move = (e: PointerEvent) => {
      if (drag) target = drag.yaw + (e.clientX - drag.x) * 0.012;
    };
    const up = () => (drag = null);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    const fit = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, getSettings().resolution));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // the whole person fits whatever the shape of the box
      const half = 1.32 / Math.min(1, camera.aspect * 1.25);
      const dist = half / Math.tan((camera.fov * Math.PI) / 360);
      camera.position.set(0, 1.0, dist);
      camera.lookAt(0, 0.88, 0);
      camera.updateProjectionMatrix();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    let current: Look = lookRef.current;
    let applying: Promise<void> = Promise.resolve();
    live.current.set = (next: Look) => {
      applying = applying.then(async () => {
        if (gone || !live.current.avatar) return;
        const patch: Partial<Look> = {};
        for (const k of Object.keys(next) as (keyof Look)[]) if (next[k] !== current[k]) (patch as Record<string, unknown>)[k] = next[k];
        current = next;
        if (Object.keys(patch).length) await live.current.avatar.setLook(patch);
        busyRef.current?.(false);
      });
      return applying;
    };

    busyRef.current?.(true);
    createCharacter(lookRef.current)
      .then((avatar) => {
        if (gone) return avatar.dispose();
        live.current.avatar = avatar;
        holder.add(avatar.root);
        avatar.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.castShadow = true;
        });
        avatar.play("Idle_Loop", 0);
        busyRef.current?.(false);
        if (lookRef.current !== current) void live.current.set(lookRef.current);
      })
      .catch(() => busyRef.current?.(false));

    let clip = "";
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      yaw += (target - yaw) * Math.min(1, dt * 10);
      holder.rotation.y = yaw + (walkRef.current ? 0 : 0.35);
      const avatar = live.current.avatar;
      if (avatar) {
        const want = walkRef.current ? "Walk_Loop" : "Idle_Loop";
        if (want !== clip) {
          clip = want;
          avatar.play(want, 0.2);
          avatar.setSpeed(locomotionRate(walkRef.current ? 1.35 : 0, want));
        }
        avatar.update(dt);
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      live.current.avatar?.dispose();
      live.current.avatar = null;
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the look changed: dress the same person
  useEffect(() => {
    busyRef.current?.(true);
    void live.current.set(look);
  }, [look]);

  return <canvas ref={ref} className="studio-canvas" aria-label="Your character. Drag to turn them." />;
}
