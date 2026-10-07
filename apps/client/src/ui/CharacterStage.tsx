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
export type StageFocus = "full" | "upper" | "head";
export type StageBackdrop = "studio" | "room" | "street";
export interface StageApi {
  /** A small picture of the person as they are now (a data URL), for saved looks. */
  snapshot(): string | null;
}

/** Where the camera looks for each focus: the middle of the view and how tall a slice of the world fits, in metres. */
function aimFor(focus: StageFocus, personHeight: number): { half: number; y: number } {
  const top = personHeight - 0.14;
  if (focus === "head") return { half: 0.27, y: top - 0.1 };
  if (focus === "upper") return { half: 0.55, y: top - 0.26 };
  const k = personHeight / 1.75;
  return { half: 1.32 * k, y: 0.88 * k };
}

function buildBackdrop(kind: StageBackdrop): THREE.Group {
  const g = new THREE.Group();
  const mat = (color: string, rough = 0.9, emissive?: string) => new THREE.MeshStandardMaterial({ color, roughness: rough, emissive: emissive ?? "#000000", emissiveIntensity: emissive ? 1.2 : 0 });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.receiveShadow = true;
    g.add(b);
    return b;
  };
  if (kind === "room") {
    box(8, 0.1, 8, 0, -0.05, 0, mat("#8a6a4c", 0.6)); // wooden floor
    box(8, 3.2, 0.1, 0, 1.6, -1.7, mat("#d9cdbb")); // back wall
    box(0.1, 3.2, 8, -2.3, 1.6, 0, mat("#cdbfa8")); // side wall
    box(1.1, 1.3, 0.04, 1.1, 1.55, -1.64, mat("#9fd0ff", 0.3, "#6fb0f0")); // window
    box(1.2, 0.05, 0.05, 1.1, 2.22, -1.62, mat("#f4efe6"));
    box(1.2, 0.05, 0.05, 1.1, 0.9, -1.62, mat("#f4efe6"));
    box(1.4, 0.05, 1.0, 0, 0.01, 0.1, mat("#9a3a3a", 1)); // rug
    box(1.7, 0.5, 0.75, -1.2, 0.25, -1.2, mat("#3c5f8f")); // sofa seat
    box(1.7, 0.55, 0.2, -1.2, 0.7, -1.5, mat("#34557f")); // sofa back
    box(0.14, 0.9, 0.14, 1.9, 0.45, -1.3, mat("#2b2b2e")); // lamp stand
    box(0.4, 0.3, 0.4, 1.9, 1.05, -1.3, mat("#ffe2a8", 0.5, "#ffc86a"));
    const lamp = new THREE.PointLight("#ffc98a", 4, 5);
    lamp.position.set(1.9, 1.1, -1.0);
    g.add(lamp);
  } else if (kind === "street") {
    box(30, 0.1, 30, 0, -0.05, 0, mat("#3a3e47", 0.95)); // road
    box(30, 0.14, 2.2, 0, 0.0, -3.6, mat("#9a9a96")); // pavement
    box(30, 0.04, 0.12, 0, 0.01, -1.6, mat("#d8d8c8")); // road line
    const cols = ["#d9a76a", "#a5c0d6", "#c98a7a", "#8fb08a", "#d7cfc0"];
    for (let i = -3; i <= 3; i++) {
      const h = 2.8 + ((i * 7) & 3) * 0.8;
      const b = box(1.9, h, 2, i * 2.1, h / 2, -5.5, mat(cols[(i + 3) % cols.length]!));
      for (let r = 0; r < Math.floor(h / 0.9); r++) box(0.5, 0.45, 0.05, i * 2.1 - 0.4, 0.9 + r * 0.9, -4.47, mat("#26384f", 0.3, "#2b4a78")), box(0.5, 0.45, 0.05, i * 2.1 + 0.4, 0.9 + r * 0.9, -4.47, mat("#26384f", 0.3));
      b.castShadow = true;
    }
  }
  return g;
}

export default function CharacterStage({
  look,
  walking,
  onBusy,
  focus = "full",
  backdrop = "studio",
  apiRef,
}: {
  look: Look;
  walking: boolean;
  onBusy?(busy: boolean): void;
  focus?: StageFocus;
  backdrop?: StageBackdrop;
  apiRef?: { current: StageApi | null };
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const backdropRef = useRef(backdrop);
  backdropRef.current = backdrop;
  const sceneApi = useRef<{ setBackdrop(k: StageBackdrop): void; aim(): void }>({ setBackdrop: () => {}, aim: () => {} });
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
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
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

    let personHeight = 1.75;
    // the camera glides between views: `cam` is where it is, `goal` is where it is going
    const cam = { half: 1.32, y: 0.88 };
    let goal = aimFor(focusRef.current, personHeight);
    let snapNext = true;
    const place = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      // the whole slice fits whatever the shape of the box
      const half = cam.half / Math.min(1, camera.aspect * 1.25);
      const dist = half / Math.tan((camera.fov * Math.PI) / 360);
      camera.position.set(0, cam.y + 0.12 * (cam.half / 1.32), dist);
      camera.lookAt(0, cam.y, 0);
      camera.updateProjectionMatrix();
    };
    const fit = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, getSettings().resolution));
      renderer.setSize(w, h, false);
      goal = aimFor(focusRef.current, personHeight);
      if (snapNext) Object.assign(cam, goal);
      place();
    };
    sceneApi.current.aim = () => {
      goal = aimFor(focusRef.current, personHeight);
    };
    let backdropGroup: THREE.Group | null = null;
    const setBackdrop = (kind: StageBackdrop) => {
      if (backdropGroup) {
        scene.remove(backdropGroup);
        backdropGroup.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.geometry.dispose();
            (m.material as THREE.Material).dispose();
          }
        });
        backdropGroup = null;
      }
      disc.visible = kind === "studio";
      scene.background = kind === "street" ? new THREE.Color("#9cc4ee") : kind === "room" ? new THREE.Color("#2a2622") : null;
      if (kind !== "studio") {
        backdropGroup = buildBackdrop(kind);
        scene.add(backdropGroup);
      }
    };
    sceneApi.current.setBackdrop = setBackdrop;
    setBackdrop(backdropRef.current);
    fit();
    snapNext = false;
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    let current: Look = lookRef.current;
    let wanted: Look = lookRef.current;
    let applying: Promise<void> = Promise.resolve();
    let running = false;
    // Changing a body slider rebuilds the person, which takes a moment; while the slider is still moving, only the newest look matters.
    live.current.set = (next: Look) => {
      wanted = next;
      if (running) return applying;
      running = true;
      applying = (async () => {
        try {
          while (!gone && live.current.avatar && wanted !== current) {
            const target = wanted;
            const patch: Partial<Look> = {};
            for (const k of Object.keys(target) as (keyof Look)[]) if (JSON.stringify(target[k]) !== JSON.stringify(current[k])) (patch as Record<string, unknown>)[k] = target[k];
            current = target;
            if (Object.keys(patch).length) await live.current.avatar.setLook(patch);
            personHeight = live.current.avatar.headHeight() + 0.14;
            fit();
          }
        } finally {
          running = false;
          busyRef.current?.(false);
        }
      })();
      return applying;
    };

    busyRef.current?.(true);
    createCharacter(lookRef.current)
      .then((avatar) => {
        if (gone) return avatar.dispose();
        live.current.avatar = avatar;
        personHeight = avatar.headHeight() + 0.14;
        goal = aimFor(focusRef.current, personHeight);
        Object.assign(cam, goal);
        fit();
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
      const glide = Math.min(1, dt * 7);
      if (Math.abs(goal.half - cam.half) > 0.0005 || Math.abs(goal.y - cam.y) > 0.0005) {
        cam.half += (goal.half - cam.half) * glide;
        cam.y += (goal.y - cam.y) * glide;
        place();
      }
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

    if (apiRef) {
      apiRef.current = {
        snapshot() {
          try {
            renderer.render(scene, camera);
            const w = 120, h = 160;
            const c = document.createElement("canvas");
            c.width = w;
            c.height = h;
            const ctx = c.getContext("2d")!;
            ctx.fillStyle = "#0b1426";
            ctx.fillRect(0, 0, w, h);
            // keep the picture's shape: crop the middle of the stage to a 3:4 box
            const sw = canvas.width, sh = canvas.height;
            const cropW = Math.min(sw, (sh * 3) / 4), cropH = (cropW * 4) / 3;
            ctx.drawImage(canvas, (sw - cropW) / 2, (sh - cropH) / 2, cropW, cropH, 0, 0, w, h);
            return c.toDataURL("image/jpeg", 0.7);
          } catch {
            return null;
          }
        },
      };
    }

    return () => {
      if (apiRef) apiRef.current = null;
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

  useEffect(() => sceneApi.current.aim(), [focus]);
  useEffect(() => sceneApi.current.setBackdrop(backdrop), [backdrop]);

  return <canvas ref={ref} className="studio-canvas" aria-label="Your character. Drag to turn them." />;
}
