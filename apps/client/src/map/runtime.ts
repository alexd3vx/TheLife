import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { blockRect, createNavGrid } from "@thelife/shared";
import { generateDistrict, walkBlockers, DISTRICT_HALF } from "@thelife/game-core";
import { Avatar } from "../lab/avatar";
import { loadSavedLook } from "../lab/looks";
import type { AssetManifest } from "../lab/manifest";
import { CharacterController, type GameBridge } from "../play/controller";
import { grassTexture } from "../play/world";
import type { TapMenu } from "../play/runtime";
import { buildGroundDetail } from "./chunkBuilder";
import { ChunkStreamer, type StreamStats } from "./streamer";

export interface MapStats {
  fps: number;
  calls: number;
  triangles: number;
  geometries: number;
  stream: StreamStats;
  ratio: number;
  position: { x: number; z: number };
}

export interface TourResult {
  seconds: number;
  avgFps: number;
  /** The average of the slowest 1% of frames, as a frame rate: what stutter feels like. */
  lowFps: number;
  worstFrameMs: number;
  peakCalls: number;
  peakGeometries: number;
  chunkBuilds: number;
}

export interface MapRuntime {
  dispose(): void;
  resetView(): void;
  zoomOut(): void;
  /** Switches between day and night (street lamps light up). */
  setNight(on: boolean): void;
  /** Flies over the whole district while measuring the frame rate. */
  tour(onProgress?: (fraction: number) => void): Promise<TourResult>;
  debug: {
    stats(): MapStats;
    teleport(x: number, z: number): void;
    tapGround(x: number, z: number): boolean;
    streamer: ChunkStreamer;
    state(): CharacterController["state"];
    night(): boolean;
  };
}

export interface MapEvents {
  onStats(stats: MapStats): void;
  onMenu(menu: TapMenu | null): void;
}

const TAP_MAX_MOVE = 8;
const TAP_MAX_TIME = 450;

export async function startMap(container: HTMLElement, manifest: AssetManifest, events: MapEvents): Promise<MapRuntime | null> {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  const small = window.matchMedia("(max-width: 860px)").matches;
  const baseRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  let ratio = baseRatio;
  renderer.setPixelRatio(ratio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
  container.appendChild(renderer.domElement);

  const district = generateDistrict(1);
  const scene = new THREE.Scene();
  const SKY = new THREE.Color("#a9cbe8");
  scene.background = SKY;
  scene.fog = new THREE.Fog(SKY, 140, 330);

  const hemi = new THREE.HemisphereLight("#cfe0ff", "#8a7058", 0.85);
  scene.add(hemi);
  let night = false;
  const sun = new THREE.DirectionalLight("#fff0d6", 2.6);
  const SUN_OFFSET = new THREE.Vector3(-30, 50, 36);
  sun.castShadow = true;
  const shadowSize = small ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  const span = 46; // shadows cover this far around the player
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 5, far: 140 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  // Ground: one big grass plane plus the roads and paving built once.
  const grass = grassTexture();
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
  grass.repeat.set(200, 200);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);
  const groundDetail = buildGroundDetail(district, Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  scene.add(groundDetail.group);

  const streamer = new ChunkStreamer(district);
  scene.add(streamer.root);

  // Walking: a 1 m navigation grid from the same data the server will have.
  const nav = createNavGrid(district.bounds, 1);
  for (const r of walkBlockers(district)) blockRect(nav, r, 0.45);
  // Keep the playable area's outer ring walkable but not the void beyond it.

  const avatar = new Avatar(manifest, loadSavedLook());
  await avatar.load();
  scene.add(avatar.root);
  const bridge: GameBridge = {
    start: () => ({ ok: false, reason: "Nothing to do here yet." }),
    cancel: () => {},
    active: () => null,
    speedFactor: () => 1,
    notice: () => {},
    needs: () => ({ hunger: 100, energy: 100, hygiene: 100, bladder: 100, fun: 100 }),
  };
  const controller = new CharacterController(avatar, nav, bridge, () => {}, () => {});
  controller.place(district.spawn.x, district.spawn.z, district.spawn.yaw);
  streamer.prime(district.spawn.x, district.spawn.z);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 700);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minDistance = 4;
  controls.maxDistance = 420;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = 1.42;
  controls.screenSpacePanning = false;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  function resetView() {
    controls.target.set(controller.position.x, 0.9, controller.position.z);
    camera.position.set(controller.position.x + 8, 11, controller.position.z + 14);
    controls.update();
  }
  resetView();

  // ---- target marker and taps
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 28), new THREE.MeshBasicMaterial({ color: "#7dffb5", transparent: true, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.06;
  marker.visible = false;
  scene.add(marker);
  let markerAge = 9;
  const showMarker = (x: number, z: number, ok: boolean) => {
    marker.position.set(x, 0.06, z);
    marker.visible = true;
    (marker.material as THREE.MeshBasicMaterial).color.set(ok ? "#7dffb5" : "#ff6b5e");
    markerAge = 0;
  };

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  function groundAt(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(plane, hit) ? hit.clone() : null;
  }
  function handleTap(clientX: number, clientY: number) {
    const rect = renderer.domElement.getBoundingClientRect();
    const point = groundAt(clientX, clientY);
    if (!point || Math.abs(point.x) > DISTRICT_HALF || Math.abs(point.z) > DISTRICT_HALF) return events.onMenu(null);
    const { x, z } = point;
    showMarker(x, z, controller.canReach(x, z));
    events.onMenu({
      x: clientX - rect.left,
      y: clientY - rect.top,
      title: null,
      options: [
        { label: "Walk here", icon: "🚶", run: () => { events.onMenu(null); showMarker(x, z, controller.tapGround(x, z, "walk")); } },
        { label: "Run here", icon: "🏃", run: () => { events.onMenu(null); showMarker(x, z, controller.tapGround(x, z, "run")); } },
      ],
    });
  }
  const down = new Map<number, { x: number; y: number; t: number; moved: boolean }>();
  const canvas = renderer.domElement;
  const onDown = (e: PointerEvent) => {
    events.onMenu(null);
    down.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: false });
  };
  const onMove = (e: PointerEvent) => {
    const d = down.get(e.pointerId);
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_MAX_MOVE) d.moved = true;
  };
  const onUp = (e: PointerEvent) => {
    const d = down.get(e.pointerId);
    const multi = down.size > 1;
    down.delete(e.pointerId);
    if (!d || d.moved || multi || e.button > 0 || performance.now() - d.t > TAP_MAX_TIME) return;
    handleTap(e.clientX, e.clientY);
  };
  const onCancel = (e: PointerEvent) => down.delete(e.pointerId);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);

  function resize() {
    const { clientWidth, clientHeight } = container;
    if (!clientWidth || !clientHeight) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.fov = camera.aspect < 0.9 ? 55 : 40;
    camera.updateProjectionMatrix();
  }
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  // ---- loop, with the same adaptive quality as the house
  const clock = new THREE.Clock();
  let raf = 0;
  let stopped = false;
  let frames = 0;
  let acc = 0;
  let lowFor = 0;
  let highFor = 0;
  let shadowEvery = 1;
  let frameNo = 0;
  let fps = 60;
  const followTarget = new THREE.Vector3();
  const shadowFocus = new THREE.Vector3();
  let tourFrames: number[] | null = null;
  let tourPeakCalls = 0;
  let tourPeakGeo = 0;
  let tourCancel = false;
  renderer.shadowMap.autoUpdate = false;

  function adapt(f: number) {
    if (document.hidden) return;
    const apply = () => {
      renderer.setPixelRatio(ratio);
      renderer.setSize(container.clientWidth, container.clientHeight, false);
    };
    if (f < 45) {
      lowFor++;
      highFor = 0;
      if (lowFor >= 2) {
        lowFor = 0;
        if (ratio > baseRatio * 0.55) {
          ratio = Math.max(baseRatio * 0.55, ratio * 0.82);
          apply();
        } else if (shadowEvery < 4) shadowEvery *= 2;
      }
    } else if (f > 56) {
      highFor++;
      lowFor = 0;
      if (highFor >= 6) {
        highFor = 0;
        if (shadowEvery > 1) shadowEvery /= 2;
        else if (ratio < baseRatio) {
          ratio = Math.min(baseRatio, ratio * 1.12);
          apply();
        }
      }
    } else lowFor = highFor = 0;
  }

  function currentStats(): MapStats {
    return {
      fps,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      stream: streamer.stats(),
      ratio,
      position: { x: controller.position.x, z: controller.position.z },
    };
  }

  function loop() {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.1);
    if (document.hidden) return;
    controller.update(dt);
    avatar.update(dt);
    streamer.update(controller.position.x, controller.position.z);

    // Shadows follow the player, snapped to the shadow-map texels so they don't shimmer.
    const texel = (span * 2) / shadowSize;
    shadowFocus.set(Math.round(controller.position.x / texel) * texel, 0, Math.round(controller.position.z / texel) * texel);
    sun.target.position.copy(shadowFocus);
    sun.position.copy(shadowFocus).add(SUN_OFFSET);

    followTarget.set(controller.position.x, 0.9, controller.position.z);
    const shift = followTarget.clone().sub(controls.target).multiplyScalar(Math.min(1, dt * 4));
    controls.target.add(shift);
    camera.position.add(shift);
    controls.update();

    markerAge += dt;
    const m = marker.material as THREE.MeshBasicMaterial;
    m.opacity = Math.max(0, 0.9 - markerAge * 0.7);
    if (m.opacity <= 0) marker.visible = false;

    frameNo++;
    if (frameNo % shadowEvery === 0) renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    if (tourFrames) {
      tourFrames.push(rawDt * 1000);
      tourPeakCalls = Math.max(tourPeakCalls, renderer.info.render.calls);
      tourPeakGeo = Math.max(tourPeakGeo, renderer.info.memory.geometries);
    }
    frames++;
    acc += dt;
    if (acc >= 0.5) {
      fps = frames / acc;
      adapt(fps);
      events.onStats(currentStats());
      frames = 0;
      acc = 0;
    }
  }
  loop();

  async function tour(onProgress?: (fraction: number) => void): Promise<TourResult> {
    // A loop around the district along the streets: out along the north road, down the east side, back along the south, up the west.
    const R = 180;
    const route: [number, number][] = [[-R, -R], [R, -R], [R, R], [-R, R], [-R, -R], [-36, -36], [-36, 36], [36, 36], [36, -36], [-36, -36]];
    tourFrames = [];
    tourPeakCalls = 0;
    tourPeakGeo = 0;
    tourCancel = false;
    const startBuilds = streamer.stats().buildsPerSecond;
    let builds = 0;
    const speed = 22; // metres per second: a fast flight so the streamer is pushed hard
    const t0 = performance.now();
    let total = 0;
    for (let i = 1; i < route.length; i++) total += Math.hypot(route[i]![0] - route[i - 1]![0], route[i]![1] - route[i - 1]![1]);
    let travelled = 0;
    for (let i = 1; i < route.length && !tourCancel; i++) {
      const [ax, az] = route[i - 1]!;
      const [bx, bz] = route[i]!;
      const len = Math.hypot(bx - ax, bz - az);
      let d = 0;
      let last = performance.now();
      while (d < len && !tourCancel) {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        const now = performance.now();
        d = Math.min(len, d + ((now - last) / 1000) * speed);
        last = now;
        controller.place(ax + ((bx - ax) * d) / len, az + ((bz - az) * d) / len, Math.atan2(bx - ax, bz - az));
        builds = Math.max(builds, streamer.stats().buildsPerSecond);
        onProgress?.((travelled + d) / total);
      }
      travelled += len;
    }
    const frameTimes = tourFrames.slice(5).sort((a, b) => a - b);
    tourFrames = null;
    const avg = frameTimes.reduce((s, v) => s + v, 0) / Math.max(1, frameTimes.length);
    const worst = frameTimes.slice(-Math.max(1, Math.floor(frameTimes.length * 0.01)));
    const lowAvg = worst.reduce((s, v) => s + v, 0) / worst.length;
    void startBuilds;
    return {
      seconds: Math.round((performance.now() - t0) / 100) / 10,
      avgFps: Math.round(1000 / avg),
      lowFps: Math.round(1000 / lowAvg),
      worstFrameMs: Math.round(frameTimes[frameTimes.length - 1] ?? 0),
      peakCalls: tourPeakCalls,
      peakGeometries: tourPeakGeo,
      chunkBuilds: builds,
    };
  }

  return {
    resetView,
    setNight(on) {
      night = on;
      groundDetail.setNight(on);
      SKY.set(on ? "#0d1426" : "#a9cbe8");
      scene.fog = new THREE.Fog(SKY, on ? 90 : 140, on ? 360 : 330);
      hemi.intensity = on ? 0.38 : 0.85;
      sun.intensity = on ? 0.35 : 2.6;
      sun.color.set(on ? "#8fa8d8" : "#fff0d6");
      renderer.toneMappingExposure = on ? 1.25 : 1;
    },
    zoomOut() {
      camera.position.set(controls.target.x + 90, 150, controls.target.z + 150);
      controls.update();
    },
    tour,
    dispose() {
      stopped = true;
      tourCancel = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      controls.dispose();
      streamer.dispose();
      renderer.dispose();
      canvas.remove();
    },
    debug: {
      stats: currentStats,
      teleport: (x, z) => controller.place(x, z, 0),
      tapGround: (x, z) => controller.tapGround(x, z),
      streamer,
      state: () => controller.state,
      night: () => night,
    },
  };
}
