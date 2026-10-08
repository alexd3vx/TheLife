import * as THREE from "three";
import { useEffect, useRef } from "react";
import { createCityScene } from "../world3d/layout";
import { createCharacter } from "./character";
import type { Avatar } from "./avatar";
import { Crowd } from "../map/crowd";
import { DEFAULT_LOOK, type Look } from "./looks";
import { DEFAULT_SHAPE } from "./bodyShape";
import { crowdLookOf, npcLookFromSeed, seeded } from "./npcSpec";
import { locomotionRate } from "./locomotion";
import { addStageEnvironment } from "./stageLight";
import "./bodylab.css";

declare global {
  interface Window {
    __cine?: { ready: boolean; frame(i: number): void; fps: number; frames: number; cam(p: [number, number, number] | null, l?: [number, number, number], fov?: number): void };
  }
}

const FPS = 24;
const SECONDS = 24;
// The sun sits on the +z side, so the buildings on the -z side are in golden light and anyone walking there is lit from the front
const PAVEMENT = -6.9; // z of the pavement the heroes walk along
const SHOT_B = 4.2;
const SHOT_C = 8.2;
const SHOT_D = 12; // she turns and follows the man down the street, toward the sun
const SHOT_E = 18; // the camera lifts away over the street

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const MAN: Look = { ...DEFAULT_LOOK, body: "realmale", hair: "p_fade", skinTone: "rich", top: "p_polo", topColor: "teal", bottom: "p_trousers", bottomColor: "khaki", shoes: "p_sneakers", shoesColor: "white", shape: { ...DEFAULT_SHAPE, sex: 1, age: 29, height: -0.2, muscle: 0.2 } };
const WOMAN: Look = { ...DEFAULT_LOOK, body: "realfemale", hair: "p_braids", hairColor: "black", skinTone: "deep", top: "p_tee", topColor: "orange", topFabric: "ankara", bottom: "p_jeans", bottomColor: "navy", shoes: "p_sneakers", shoesColor: "white", accessory: "a_hoops", shape: { ...DEFAULT_SHAPE, sex: 0, age: 26, height: -0.2, bust: 0.25, weight: 0.05 } };

/**
 * A developer page that plays the sign-in film one frame at a time: golden-hour Lagos, a crane move down the street, a tracking shot of
 * two people walking home and a close-up. It is not shown to players. `tools/film/render_cine.mjs` steps through it, takes a picture of
 * every frame and ffmpeg turns the pictures into the video on the sign-in page. Open it at #/cine.
 */
export default function CineLabPage() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    let gone = false;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const city = createCityScene({ shadowMapSize: 4096, seed: 11, pedestrians: false, trafficSpeed: 6 });
    const scene = city.scene;
    addStageEnvironment(renderer, scene, 0.35);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 600);
    const hero: { woman: Avatar | null; man: Avatar | null; crowd: Crowd | null } = { woman: null, man: null, crowd: null };
    // Three lanes, each with one speed and an even gap, so nobody ever catches up with anybody and walks through them. Lamp posts stand at
    // |z| 8.4 and power poles at 9, the pair walk at -6.9 and -7.7, and the lane coming the other way keeps to the kerb (-6.2), 0.7 m from her.
    const lanes = [
      { z: -6.2, dir: -1 as const, speed: 1.2, n: 5, gap: 14, x0: -118 },
      { z: 6.7, dir: 1 as const, speed: 1.25, n: 10, gap: 11, x0: -122 },
      { z: 7.6, dir: -1 as const, speed: 1.15, n: 11, gap: 10, x0: -120 },
    ];
    const walkers = lanes.flatMap((l, li) => Array.from({ length: l.n }, (_, k) => ({ x: l.x0 + k * l.gap, z: l.z, dir: l.dir, speed: l.speed, phase: (k * 1.7 + li) % 6 })));
    let simTime = 0;
    let rendered = -1;

    const heroX = (t: number) => -30 + 1.35 * Math.min(t, SHOT_C) + (t > SHOT_D ? 1.35 * (t - SHOT_D) : 0);

    void Promise.all([createCharacter(WOMAN, { face: true }), createCharacter(MAN, { face: false }), Crowd.load(walkers.length)]).then(([woman, man, crowd]) => {
      if (gone) return;
      hero.woman = woman;
      hero.man = man;
      hero.crowd = crowd;
      for (const a of [woman, man]) {
        scene.add(a.root);
        a.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = false;
          }
        });
        a.play("Walk_Loop", 0);
        a.setSpeed(locomotionRate(1.35, "Walk_Loop"));
      }
      scene.add(crowd.root);
      walkers.forEach((w, i) => {
        crowd.setPerson(i, crowdLookOf(npcLookFromSeed(900 + i * 17)));
        crowd.setGait(i, w.speed, w.phase);
      });
      woman.setMood("happy", 0.0);
      (window as unknown as { __cineHero: unknown }).__cineHero = hero;
      window.__cine = { ready: true, fps: FPS, frames: FPS * SECONDS, frame, cam: (p, l, fov = 30) => (override = p ? { p: new THREE.Vector3(...p), l: new THREE.Vector3(...(l ?? [0, 1, 0])), fov } : null) };
    });

    function step(dt: number) {
      simTime += dt;
      const t = simTime;
      const { woman, man, crowd } = hero;
      if (!woman || !man || !crowd) return;
      const hx = heroX(t);
      const stopped = t >= SHOT_C && t < SHOT_D;
      man.root.position.set(-30 + 1.35 * t + 0.2, 0.22, PAVEMENT - 0.8);
      man.root.rotation.y = Math.PI / 2;
      woman.root.position.set(hx, 0.22, PAVEMENT);
      if (t >= SHOT_C && t - dt < SHOT_C) {
        woman.play("Idle_Loop", 0.4);
        woman.setSpeed(1);
      }
      if (t >= SHOT_D && t - dt < SHOT_D) {
        woman.play("Walk_Loop", 0.4);
        woman.setSpeed(locomotionRate(1.35, "Walk_Loop"));
      }
      if (stopped) {
        // she turns to the camera, then smiles
        const turn = smooth(clamp01((t - SHOT_C - 0.2) / 1.0));
        woman.root.rotation.y = lerp(Math.PI / 2, Math.PI * 0.07, turn);
        woman.setMood("happy", smooth(clamp01((t - SHOT_C - 1.3) / 1.2)) * 0.9);
      } else if (t >= SHOT_D) {
        woman.root.rotation.y = lerp(Math.PI * 0.07, Math.PI / 2, smooth(clamp01((t - SHOT_D) / 0.8)));
        woman.setMood("happy", 0.35);
      } else {
        woman.root.rotation.y = Math.PI / 2;
      }
      woman.update(dt);
      man.update(dt);
      walkers.forEach((w, i) => {
        w.x += w.dir * w.speed * dt;
        if (w.x > 20) w.x = -125;
        if (w.x < -125) w.x = 20;
        const near = Math.abs(w.x - hx) < 48;
        crowd.place(i, w.x, w.z, w.dir > 0 ? Math.PI / 2 : -Math.PI / 2, near ? 1 : 2, 0.22);
      });
      crowd.update(dt);
      city.update(dt, camera);
    }

    let override: { p: THREE.Vector3; l: THREE.Vector3; fov: number } | null = null;
    function aim(t: number) {
      if (override) {
        camera.fov = override.fov;
        camera.position.copy(override.p);
        camera.lookAt(override.l);
        camera.updateProjectionMatrix();
        return;
      }
      const hx = heroX(t);
      const shake = (k: number) => new THREE.Vector3(Math.sin(t * 1.7) * 0.012 * k, Math.sin(t * 2.3 + 1) * 0.01 * k, 0);
      let pos: THREE.Vector3, look: THREE.Vector3, fov = 30;
      if (t < SHOT_B) {
        // crane: high above the middle of the street, swooping down toward the pavement
        const u = smooth(t / SHOT_B);
        pos = new THREE.Vector3(lerp(-112, -50, u), lerp(14, 2.4, u), lerp(1.5, -5.2, u));
        look = new THREE.Vector3(lerp(-30, hx + 3, u), lerp(1.5, 1.35, u), lerp(-3, PAVEMENT, u));
        fov = lerp(36, 30, u);
      } else if (t < SHOT_C) {
        // tracking: alongside the two of them from the road, pushing in a little, the sun behind the camera
        const u = clamp01((t - SHOT_B) / (SHOT_C - SHOT_B));
        pos = new THREE.Vector3(hx + lerp(2.6, 1.0, u), lerp(1.25, 1.4, u), PAVEMENT + lerp(2.9, 2.3, u));
        look = new THREE.Vector3(hx + 0.35, 1.28, PAVEMENT - 0.4);
        fov = 32;
        pos.add(shake(1.2));
      } else if (t < SHOT_D) {
        // close-up: a slow push in on her face
        const u = smooth(clamp01((t - SHOT_C) / (SECONDS - SHOT_C)));
        pos = new THREE.Vector3(hx + lerp(-0.5, 0.1, u), lerp(1.58, 1.62, u), PAVEMENT + lerp(2.4, 1.6, u));
        look = new THREE.Vector3(hx, 1.6, PAVEMENT);
        fov = lerp(26, 22, u);
        pos.add(shake(0.5));
      } else if (t < SHOT_E) {
        // behind the two of them, low, walking away down the street into the glare of the sun
        const u = clamp01((t - SHOT_D) / (SHOT_E - SHOT_D));
        pos = new THREE.Vector3(hx - lerp(9, 7, u), lerp(1.0, 1.25, u), PAVEMENT + lerp(1.7, 1.3, u));
        look = new THREE.Vector3(hx + 4.2, 1.35, PAVEMENT - 0.5);
        fov = lerp(38, 32, u);
        pos.add(shake(1));
      } else {
        // the camera lifts up and away, over the street
        const u = smooth(clamp01((t - SHOT_E) / (SECONDS - SHOT_E)));
        pos = new THREE.Vector3(hx - lerp(4.6, 52, u), lerp(1.4, 17, u), lerp(-5.0, 3.5, u));
        look = new THREE.Vector3(hx + lerp(9, 24, u), lerp(1.5, 1.2, u), lerp(-6.8, -2, u));
        fov = lerp(26, 34, u);
      }
      camera.fov = fov;
      camera.position.copy(pos);
      camera.lookAt(look);
      camera.updateProjectionMatrix();
    }

    function frame(i: number) {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const want = i / FPS;
      while (simTime < want - 1e-6) {
        aim(simTime);
        step(1 / FPS);
      }
      aim(want);
      city.update(0, camera); // keeps the sky round the camera
      renderer.render(scene, camera);
      rendered = i;
    }
    void rendered;
    return () => {
      gone = true;
      delete window.__cine;
      hero.woman?.dispose();
      hero.man?.dispose();
      hero.crowd?.dispose();
      city.dispose();
      renderer.dispose();
    };
  }, []);
  return <canvas ref={ref} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", display: "block", background: "#000" }} />;
}
