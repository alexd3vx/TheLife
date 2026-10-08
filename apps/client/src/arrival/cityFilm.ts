import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { Avatar } from "../lab/avatar";
import { createCharacter, resolveLook } from "../lab/character";
import { locomotionRate } from "../lab/locomotion";
import { assetUrl } from "../lab/manifest";
import { Crowd } from "../map/crowd";
import { crowdLookOf, npcLookFromSeed } from "../lab/npcSpec";
import { addStageEnvironment } from "../lab/stageLight";
import { createCityScene, type CityScene } from "../world3d/layout";

export type Tier = "lapo" | "middle" | "nepo";
export type CityBeat = "arrive" | "ride" | "street" | "face";
/** Seconds each beat lasts. */
export const CITY_SECS: Record<CityBeat, number> = { arrive: 6, ride: 7, street: 5, face: 4.5 };

const VEHICLE: Record<Tier, { file: string; tint?: string }> = {
  nepo: { file: "vehicles/suv-luxury.glb", tint: "#16181f" },
  middle: { file: "vehicles/taxi.glb" },
  lapo: { file: "vehicles/van.glb", tint: "#f2c230" },
};
const MOOD: Record<Tier, { mood: "smirk" | "happy" | "worried"; amount: number }> = {
  nepo: { mood: "smirk", amount: 0.8 },
  middle: { mood: "happy", amount: 0.8 },
  lapo: { mood: "worried", amount: 0.35 },
};

/**
 * The opening film, in real 3D on the same golden-hour Lagos street as the sign-in film, with the player's own character: a crane shot
 * down the street as the ride comes home, the ride itself, stepping out onto the pavement and a close-up. The vehicle matches the
 * person's background (a luxury SUV, a taxi or a danfo-yellow van). It is a few hundred draw calls at most (the street, one vehicle,
 * a small crowd, one person) so it runs on a mid-range phone.
 *
 * The street runs along x. The sun is on the +z side, so the buildings on the -z side are lit: the car drives along the lane next to them
 * (heading -x), the person walks that pavement and the camera looks -z with the sun behind it.
 */
const PAVEMENT = -6.9;
const LANE = -3;
const STOP_X = -34;
/** The car cruises at the traffic's own speed, so it never catches up with a car in front of it (traffic has one speed here). */
const CRUISE = 6;
const BRAKE_S = 2.5;
const START_X = STOP_X + CRUISE * (CITY_SECS.arrive + CITY_SECS.ride - BRAKE_S) + 0.5 * CRUISE * BRAKE_S;

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class CityFilm {
  private renderer: THREE.WebGLRenderer;
  private city: CityScene;
  private scene: THREE.Scene;
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 600);
  private beat: CityBeat = "arrive";
  private clock = 0; // seconds since the film began
  private t = 0; // seconds into this beat
  private gone = false;
  private vehicle: THREE.Object3D | null = null;
  private avatar: Avatar | null = null;
  private crowd: Crowd | null = null;
  private walkers: { x: number; z: number; dir: 1 | -1; speed: number }[] = [];
  private released = false;
  private dropEnv: () => void;

  constructor(private canvas: HTMLCanvasElement, private tier: Tier, private lookJson?: string | null) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.city = createCityScene({ shadowMapSize: 1024, seed: 11, pedestrians: false, trafficSpeed: CRUISE });
    this.scene = this.city.scene;
    this.dropEnv = addStageEnvironment(this.renderer, this.scene, 0.35);
    // two lanes of the walkers' pavement and the far pavement: one speed and an even gap per lane, so nobody walks through anybody
    const lanes = [
      { z: 6.7, dir: 1 as const, speed: 1.25, n: 7, gap: 11, x0: -100 },
      { z: 7.6, dir: -1 as const, speed: 1.15, n: 7, gap: 10, x0: -95 },
    ];
    this.walkers = lanes.flatMap((l) => Array.from({ length: l.n }, (_, k) => ({ x: l.x0 + k * l.gap, z: l.z, dir: l.dir, speed: l.speed })));
    void Crowd.load(this.walkers.length).then((c) => {
      if (this.gone) return c.dispose();
      this.crowd = c;
      this.scene.add(c.root);
      this.walkers.forEach((w, i) => {
        c.setPerson(i, crowdLookOf(npcLookFromSeed(700 + i * 13)));
        c.setGait(i, w.speed, i * 1.9);
      });
    });
    void this.loadVehicle();
    void this.loadCharacter();
    this.resize();
    window.addEventListener("resize", this.resize);
  }

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  setBeat(kind: CityBeat) {
    this.beat = kind;
    this.t = 0;
  }

  dispose() {
    this.gone = true;
    window.removeEventListener("resize", this.resize);
    this.avatar?.dispose();
    this.crowd?.dispose();
    this.city.dispose();
    this.dropEnv();
    this.renderer.dispose();
  }

  private async loadVehicle() {
    try {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const spec = VEHICLE[this.tier];
      const car = (await loader.loadAsync(assetUrl(spec.file))).scene;
      if (spec.tint) {
        car.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && (m.material as THREE.MeshStandardMaterial).color) {
            const mat = (m.material as THREE.MeshStandardMaterial).clone();
            if (mat.color.r + mat.color.g + mat.color.b > 0.9) mat.color.set(spec.tint!);
            m.material = mat;
          }
        });
      }
      car.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.castShadow = true;
      });
      if (this.gone) return;
      this.vehicle = car;
      this.scene.add(car);
    } catch (e) {
      if (import.meta.env.DEV) console.warn("film vehicle", e);
    }
  }

  private async loadCharacter() {
    try {
      const a = await createCharacter(resolveLook(this.lookJson), { face: true });
      if (this.gone) return a.dispose();
      this.avatar = a;
      a.root.visible = false;
      a.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.castShadow = true;
      });
      this.scene.add(a.root);
      a.play("Idle_Loop", 0);
    } catch (e) {
      if (import.meta.env.DEV) console.warn("film character", e);
    }
  }

  // ---------------------------------------------------------------- the film

  /** How far along its drive the car is, in metres from the start: cruising, then braking to a stop at the kerb. */
  private carX(clock: number): number {
    const brakeAt = CITY_SECS.arrive + CITY_SECS.ride - BRAKE_S;
    if (clock <= brakeAt) return START_X - CRUISE * clock;
    const u = Math.min(BRAKE_S, clock - brakeAt);
    return START_X - CRUISE * brakeAt - (CRUISE * u - (0.5 * CRUISE * u * u) / BRAKE_S);
  }

  draw(dt: number) {
    if (this.gone) return;
    this.t += dt;
    this.clock += dt;
    const secs = CITY_SECS[this.beat];
    const k = clamp01(this.t / secs);
    const cx = this.carX(this.clock);
    this.city.update(dt, this.camera);

    // the car: on its lane, heading -x; the traffic beside it keeps clear
    if (this.vehicle) {
      this.vehicle.visible = true;
      this.vehicle.position.set(cx, 0.02, LANE);
      this.vehicle.rotation.set(0, -Math.PI / 2, 0);
      for (const v of this.city.vehicles) {
        if (v.direction === -1 && Math.abs(v.object.position.x - cx) < 16) v.object.visible = false;
        else v.object.visible = true;
      }
    }
    // the crowd
    if (this.crowd) {
      this.walkers.forEach((w, i) => {
        w.x += w.dir * w.speed * dt;
        if (w.x > 60) w.x = -140;
        if (w.x < -140) w.x = 60;
        this.crowd!.place(i, w.x, w.z, w.dir > 0 ? Math.PI / 2 : -Math.PI / 2, Math.abs(w.x - cx) < 48 ? 1 : 2, 0.22);
      });
      this.crowd.update(dt);
    }

    const a = this.avatar;
    let focusX = STOP_X;
    if (a) {
      const onFoot = this.beat === "street" || this.beat === "face";
      a.root.visible = onFoot;
      if (onFoot) {
        const walk = this.beat === "street" ? this.t : CITY_SECS.street;
        const hx = STOP_X - 0.4 - 1.3 * Math.min(walk, CITY_SECS.street);
        focusX = hx;
        a.root.position.set(hx, 0.22, PAVEMENT);
        if (this.beat === "street") {
          a.root.rotation.y = -Math.PI / 2;
          if (!this.released) {
            this.released = true;
            a.play("Walk_Loop", 0.2);
            a.setSpeed(locomotionRate(1.3, "Walk_Loop"));
          }
        } else {
          if (this.t < 0.05) {
            a.play("Idle_Loop", 0.4);
            a.setSpeed(1);
          }
          a.root.rotation.y = lerp(-Math.PI / 2, 0.06 * Math.PI, smooth(clamp01((this.t - 0.2) / 1.0)));
          const m = MOOD[this.tier];
          a.setMood(m.mood, smooth(clamp01((this.t - 1.2) / 1.2)) * m.amount);
        }
        a.update(dt);
      }
    }
    this.aim(k, cx, focusX);
    this.renderer.render(this.scene, this.camera);
  }

  private aim(k: number, carX: number, personX: number) {
    const cam = this.camera;
    let fov = 30;
    const shake = (n: number) => new THREE.Vector3(Math.sin(this.clock * 1.7) * 0.012 * n, Math.sin(this.clock * 2.3 + 1) * 0.01 * n, 0);
    if (this.beat === "arrive") {
      // crane: high over the street, swooping down toward the car coming home
      const u = smooth(k);
      cam.position.set(lerp(-132, -66, u), lerp(14, 3.2, u), lerp(1.5, 1.4, u));
      cam.lookAt(lerp(-40, carX + 2, u), lerp(1.5, 1.2, u), lerp(-2, LANE, u));
      fov = lerp(36, 30, u);
    } else if (this.beat === "ride") {
      // alongside the car from the middle of the road, drifting from behind it to the front, the sun behind the camera
      const u = smooth(k);
      cam.position.set(carX + lerp(10, -8, u), lerp(1.6, 1.3, u), lerp(2.4, 1.6, u));
      cam.lookAt(carX, 1.0, LANE);
      fov = lerp(44, 34, u);
      cam.position.add(shake(0.8));
    } else if (this.beat === "street") {
      // she steps onto the pavement and walks; the camera keeps pace on the road side
      cam.position.set(personX - lerp(3.4, 2.4, k), lerp(1.3, 1.4, k), PAVEMENT + lerp(3.6, 3.0, k));
      cam.lookAt(personX - 0.3, 1.2, PAVEMENT - 0.3);
      fov = 36;
      cam.position.add(shake(1.2));
    } else {
      // close-up
      const u = smooth(k);
      cam.position.set(personX + lerp(-0.5, 0.1, u), lerp(1.58, 1.62, u), PAVEMENT + lerp(2.4, 1.6, u));
      cam.lookAt(personX, 1.6, PAVEMENT);
      fov = lerp(26, 22, u);
      cam.position.add(shake(0.5));
    }
    if (cam.aspect > 1.2) fov *= 0.8;
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }
}
