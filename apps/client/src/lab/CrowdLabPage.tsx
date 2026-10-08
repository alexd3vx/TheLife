import * as THREE from "three";
import { useEffect, useRef } from "react";
import { createCharacter } from "./character";
import type { Avatar } from "./avatar";
import { Crowd } from "../map/crowd";
import { crowdLookOf, diffLook, npcLookFromSeed, recolourLook, seeded } from "./npcSpec";
import { addStageEnvironment } from "./stageLight";
import "./bodylab.css";

declare global {
  interface Window {
    __crowd?: {
      view(v: "street" | "close" | "side"): void;
      real(seeds: number[]): Promise<void>;
      info(): { triangles: number; calls: number; crowdTriangles: number; frameMs: number };
      level(l: 0 | 1 | 2): void;
      redress(a: number, b: number): Promise<number>;
      topBox(look: Record<string, unknown>, again?: boolean): Promise<{ v: number; maxY: number }[]>;
      timePatch(seed: number, patch: Record<string, unknown>): Promise<number>;
      redressCheap(a: number, b: number): Promise<number>;
    };
  }
}

/** A developer page for crowds: sixty seeded people walking, a camera at street distance or close, and real characters of the same seeds beside them. Open it at #/crowd. */
export default function CrowdLabPage() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    let gone = false;
    let raf = 0;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#9cc4ee");
    scene.fog = new THREE.Fog("#9cc4ee", 40, 140);
    const dropEnvironment = addStageEnvironment(renderer, scene, 0.5);
    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
    scene.add(new THREE.HemisphereLight("#fff1dc", "#6b7a99", 1.1));
    const sun = new THREE.DirectionalLight("#fff0da", 2.4);
    sun.position.set(-20, 30, 25);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: "#4a4d55", roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const N = 60;
    const seeds = Array.from({ length: N }, (_, i) => 1000 + i * 7919);
    const people = seeds.map((s, i) => {
      const r = seeded(s);
      return { x: (r() - 0.5) * 60, z: (r() - 0.5) * 60 + 20, yaw: r() * Math.PI * 2, speed: 1.1 + r() * 0.5, i };
    });
    let crowd: Crowd | null = null;
    let level: 0 | 1 | 2 = 1;
    const reals: Avatar[] = [];
    let mode: "street" | "close" | "side" = "street";
    const pose = () => {
      if (mode === "street") {
        cam.position.set(0, 2.2, -2);
        cam.lookAt(0, 1.4, 25);
      } else if (mode === "close") {
        cam.position.set(0, 1.5, 10);
        cam.lookAt(0, 1.0, 0);
      } else {
        cam.position.set(10, 1.5, 4);
        cam.lookAt(0, 1.0, 4);
      }
    };
    pose();
    Crowd.load(N).then((c) => {
      if (gone) return c.dispose();
      crowd = c;
      scene.add(c.root);
      seeds.forEach((s, i) => c.setPerson(i, crowdLookOf(npcLookFromSeed(s))));
      people.forEach((p, i) => c.setGait(i, p.speed, i * 1.7));
    });
    let frameMs = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (w && h) {
        renderer.setPixelRatio(1);
        renderer.setSize(w, h, false);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }
      for (const p of people) {
        p.x += Math.sin(p.yaw) * p.speed * dt;
        p.z += Math.cos(p.yaw) * p.speed * dt;
        if (Math.abs(p.x) > 40 || p.z < 4 || p.z > 60) p.yaw += Math.PI;
        crowd?.place(p.i, p.x, p.z, p.yaw, level);
      }
      crowd?.update(dt);
      for (const a of reals) a.update(dt);
      const t0 = performance.now();
      renderer.render(scene, cam);
      frameMs = performance.now() - t0;
    };
    raf = requestAnimationFrame(loop);
    window.__crowd = {
      view: (v) => {
        mode = v;
        pose();
      },
      async real(list) {
        for (const a of reals.splice(0)) {
          a.root.removeFromParent();
          a.dispose();
        }
        for (let k = 0; k < list.length; k++) {
          const a = await createCharacter(npcLookFromSeed(list[k]!), { face: false });
          a.root.position.set(-1.6 + k * 1.1, 0, 4);
          a.play("Walk_Loop", 0);
          scene.add(a.root);
          reals.push(a);
        }
      },
      info: () => ({ triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, crowdTriangles: crowd?.drawnTriangles() ?? 0, frameMs }),
      level: (l) => (level = l),
      async topBox(look, again) {
        const av = await createCharacter({ ...npcLookFromSeed(1), ...(look as object) } as never, { face: (look as { faceRig?: boolean }).faceRig === true });
        if (again) await av.setLook({ shape: { ...(look as { shape: object }).shape, age: 27 } } as never);
        const out: { v: number; maxY: number }[] = [];
        av.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && m.parent?.userData?.slot === "top") {
            m.geometry.computeBoundingBox();
            out.push({ v: m.geometry.getAttribute("position").count, maxY: Math.round(m.geometry.boundingBox!.max.y * 100) / 100 });
          }
        });
        av.dispose();
        return out;
      },
      async timePatch(seed, patch) {
        const av = await createCharacter(npcLookFromSeed(seed), { face: false });
        const t0 = performance.now();
        await av.setLook(patch as never);
        const ms = performance.now() - t0;
        av.dispose();
        return ms;
      },
      async redressCheap(a, b) {
        const base = npcLookFromSeed(a);
        const av = await createCharacter(base, { face: false });
        const t0 = performance.now();
        await av.setLook(diffLook(base, recolourLook(base, b)));
        const ms = performance.now() - t0;
        av.dispose();
        return ms;
      },
      async redress(a, b) {
        const av = await createCharacter(npcLookFromSeed(a), { face: false });
        const t0 = performance.now();
        await av.setLook(diffLook(npcLookFromSeed(a), npcLookFromSeed(b)));
        const ms = performance.now() - t0;
        av.dispose();
        return ms;
      },
    };
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      delete window.__crowd;
      crowd?.dispose();
      for (const a of reals) a.dispose();
      dropEnvironment();
      renderer.dispose();
    };
  }, []);
  return <canvas ref={ref} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", display: "block" }} />;
}
