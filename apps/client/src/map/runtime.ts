import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { blockOutside, blockRectCentres, createNavGrid, isFree, type NavGrid } from "@thelife/shared";
import { walkBlockers, hasInterior, generatePlan, climbStep, planBlockers, stairProgress, DISTRICT_HALF, type BuildingPlan, type Lot, type PlanStairs } from "@thelife/game-core";
import { getDistrict } from "./districtData";
import { pinTexture } from "./pins";
import { Avatar } from "../lab/avatar";
import { loadSavedLook } from "../lab/looks";
import type { AssetManifest } from "../lab/manifest";
import { CharacterController, type GameBridge } from "../play/controller";
import { grassTexture } from "../play/world";
import type { TapMenu } from "../play/runtime";
import { buildGroundDetail, buildInteriorScene, capHideLevel, capHideLot } from "./chunkBuilder";
import { Pedestrians } from "./pedestrians";
import { AdaptiveQuality, type Quality } from "../graphics";
import { ChunkStreamer, type StreamStats } from "./streamer";
import { RemotePlayers } from "./remotePlayers";
import { DoorManager } from "./doors";

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
  /** Walk or run to the front door of a named place. */
  goTo(id: string, pace: "walk" | "run" | "auto"): boolean;
  quality(): Quality;
  setQuality(q: Quality): void;
  /** Switches between day and night (street lamps light up). */
  setNight(on: boolean): void;
  /** Flies over the whole district while measuring the frame rate. */
  tour(onProgress?: (fraction: number) => void): Promise<TourResult>;
  /** Other players in the shared world, and the local player's pose to send to the server. */
  online: {
    remotes: RemotePlayers;
    pose(): { x: number; y: number; z: number; yaw: number; clip: string; level: number };
    /** The server moved us back: put the character at the corrected spot. */
    correct(x: number, z: number): void;
  };
  debug: {
    stats(): MapStats;
    teleport(x: number, z: number): void;
    lookAt(x: number, z: number, height?: number, back?: number): void;
    tapGround(x: number, z: number): boolean;
    streamer: ChunkStreamer;
    simulate(seconds: number): void;
    navFree(x: number, z: number): boolean;
    landmarks: import("@thelife/game-core").Landmark[];
    plan(id: string): import("@thelife/game-core").BuildingPlan;
    floor(): { level: number; y: number; lot: string | null };
    houses(): { id: string; floors: number; garage: boolean; facing: number; inside: { x: number; z: number }; kind: string }[];
    state(): CharacterController["state"];
    night(): boolean;
  };
}

export interface MapEvents {
  onStats(stats: MapStats): void;
  onMenu(menu: TapMenu | null): void;
  /** Walking into or out of a named place (null = outside). */
  onPlace?(name: string | null): void;
}

const TAP_MAX_MOVE = 8;
const TAP_MAX_TIME = 450;

export async function startMap(container: HTMLElement, manifest: AssetManifest, events: MapEvents): Promise<MapRuntime | null> {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 2, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  const small = window.matchMedia("(max-width: 860px)").matches;
  const quality = new AdaptiveQuality((r) => {
    renderer.setPixelRatio(r);
    if (container.clientWidth) renderer.setSize(container.clientWidth, container.clientHeight, false);
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
  container.appendChild(renderer.domElement);

  const district = getDistrict();
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
  const shadowSize = 1024;
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

  // Map pins floating above every named place.
  const pinSprites: THREE.Sprite[] = [];
  for (const lm of district.landmarks) {
    const lot = district.lots.find((l) => l.id === lm.lotId);
    const top = lot ? lot.floors * lot.storey : 6;
    const extra = lm.kind === "airport" ? 18 : lm.kind === "mosque" ? 7 : lm.kind === "church" ? 5 : 3;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTexture(lm.kind), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, fog: false }));
    sprite.center.set(0.5, 0);
    sprite.scale.set(0.045, 0.06, 1);
    sprite.position.set(lm.x, top + extra + 2, lm.z);
    sprite.renderOrder = 50;
    sprite.userData.landmarkId = lm.id;
    scene.add(sprite);
    pinSprites.push(sprite);
  }

  const streamer = new ChunkStreamer(district);
  scene.add(streamer.root);
  const remotes = new RemotePlayers(manifest);
  scene.add(remotes.root);
  const peds = new Pedestrians(small ? 40 : 70);
  scene.add(peds.root);

  // Walking: a 1 m navigation grid from the same data the server will have.
  const interiorLots = district.lots.filter(hasInterior);
  const nav = createNavGrid(district.bounds, 0.5);
  for (const r of walkBlockers(district)) blockRectCentres(nav, r, 0.25);
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

  // ---- floors: the ground is the district grid; each upper floor of a building has its own small grid. Stairs are ramps:
  // the player's height follows the flight, and the grid is swapped when they reach the top or the bottom.
  const groundNav = nav;
  const planCache = new Map<string, BuildingPlan>();
  const planOf = (lot: Lot) => {
    let p = planCache.get(lot.id);
    if (!p) planCache.set(lot.id, (p = generatePlan(lot)));
    return p;
  };
  const doors = new DoorManager(scene, interiorLots, planOf);
  // Inside a building the street is switched off: you see the building on its own, like the house. Outside carries on without you.
  const interiorScenes = new Map<string, { group: THREE.Group; geometries: THREE.BufferGeometry[] }>();
  let interiorGroup: THREE.Group | null = null;
  function setInterior(lot: Lot | null) {
    if (interiorGroup) interiorGroup.visible = false;
    interiorGroup = null;
    const inside = lot !== null;
    streamer.root.visible = !inside;
    groundDetail.group.visible = !inside;
    ground.visible = !inside;
    peds.setVisible(!inside);
    doors.setVisible(!inside);
    for (const pin of pinSprites) pin.visible = !inside;
    if (lot) {
      let built = interiorScenes.get(lot.id);
      if (!built) {
        built = buildInteriorScene(lot);
        interiorScenes.set(lot.id, built);
        scene.add(built.group);
        if (interiorScenes.size > 6) {
          const [oldId, old] = interiorScenes.entries().next().value as [string, { group: THREE.Group; geometries: THREE.BufferGeometry[] }];
          if (old !== built) {
            scene.remove(old.group);
            for (const g of old.geometries) g.dispose();
            interiorScenes.delete(oldId);
          }
        }
      }
      built.group.visible = true;
      interiorGroup = built.group;
    }
  }
  let placeName: string | null = null;
  const levelGrids = new Map<string, NavGrid>();
  const levelGrid = (lot: Lot, level: number): NavGrid => {
    const key = `${lot.id}:${level}`;
    let g = levelGrids.get(key);
    if (!g) {
      const f = lot.footprint;
      g = createNavGrid({ minX: f.minX - 1, maxX: f.maxX + 1, minZ: f.minZ - 1, maxZ: f.maxZ + 1 }, 0.5);
      blockOutside(g, f, 0.15);
      for (const r of planBlockers(planOf(lot), level)) blockRectCentres(g, r, 0.25);
      levelGrids.set(key, g);
    }
    return g;
  };
  let floorLot: Lot | null = null;
  let floorLevel = 0;
  const flightsHere = (): PlanStairs[] => (floorLot ? planOf(floorLot).stairs.filter((s) => s.floor === floorLevel || s.floor === floorLevel - 1) : []);
  /** Updates which floor the player is on and how high they stand. Returns the height in metres. */
  function updateFloor(): number {
    const px = controller.position.x, pz = controller.position.z;
    const inside = interiorLots.find((l) => px > l.footprint.minX - 0.3 && px < l.footprint.maxX + 0.3 && pz > l.footprint.minZ - 0.3 && pz < l.footprint.maxZ + 0.3) ?? null;
    if (inside !== floorLot) {
      floorLot = inside;
      floorLevel = 0;
      controller.setNav(groundNav);
      setInterior(inside);
      remotes.only = inside ? { minX: inside.footprint.minX - 0.5, maxX: inside.footprint.maxX + 0.5, minZ: inside.footprint.minZ - 0.5, maxZ: inside.footprint.maxZ + 0.5 } : null;
    }
    if (!floorLot) {
      capHideLot.value = -1;
      return 0;
    }
    const plan = planOf(floorLot);
    capHideLot.value = Number(floorLot.id.slice(1));
    capHideLevel.value = floorLevel;
    for (const s of flightsHere()) {
      const t = stairProgress(s, px, pz);
      if (t === null) continue;
      const up = s.floor === floorLevel; // a flight starting on this floor climbs from here; otherwise this is the hole of the flight below
      const step = climbStep(s.climbs);
      const r = s.rect;
      const half = Math.max(r.maxX - r.minX, r.maxZ - r.minZ) / 2;
      const centre = { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
      if (up && t >= 0.7) {
        floorLevel = s.floor + 1;
        controller.setNav(levelGrid(floorLot, floorLevel));
        controller.tapGround(centre.x + step.x * (half + 0.9), centre.z + step.z * (half + 0.9), "walk"); // step off onto the landing
      } else if (!up && t <= 0.3) {
        floorLevel = s.floor;
        controller.setNav(s.floor === 0 ? groundNav : levelGrid(floorLot, s.floor));
        controller.tapGround(centre.x - step.x * (half + 0.9), centre.z - step.z * (half + 0.9), "walk");
      }
      return (s.floor + t) * plan.storey;
    }
    return floorLevel * plan.storey;
  }
  /** If a tap landed on a flight that starts (or ends) on this floor, walk its whole length. */
  function stairTarget(x: number, z: number): { x: number; z: number } | null {
    for (const s of flightsHere()) {
      if (stairProgress(s, x, z, 0.6) === null) continue;
      const step = climbStep(s.climbs);
      const r = s.rect;
      const half = Math.max(r.maxX - r.minX, r.maxZ - r.minZ) / 2;
      const centre = { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
      const up = s.floor === floorLevel;
      const sign = up ? 1 : -1;
      return { x: centre.x + sign * step.x * (half - 0.35), z: centre.z + sign * step.z * (half - 0.35) };
    }
    return null;
  }
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
    marker.position.set(x, controller.position.y + 0.06, z);
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
  function pinAt(clientX: number, clientY: number): string | null {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pinSprites, false);
    return hits[0]?.object.userData.landmarkId ?? null;
  }
  function goTo(id: string, pace: "walk" | "run" | "auto"): boolean {
    const lm = district.landmarks.find((l) => l.id === id);
    if (!lm) return false;
    const ok = controller.tapGround(lm.entrance.x, lm.entrance.z, pace);
    showMarker(lm.entrance.x, lm.entrance.z, ok);
    return ok;
  }
  function handleTap(clientX: number, clientY: number) {
    const rect = renderer.domElement.getBoundingClientRect();
    const pinHit = pinAt(clientX, clientY);
    if (pinHit) {
      const lm = district.landmarks.find((l) => l.id === pinHit)!;
      showMarker(lm.entrance.x, lm.entrance.z, controller.canReach(lm.entrance.x, lm.entrance.z));
      events.onMenu(null);
      goTo(lm.id, "auto");
      return;
    }
    plane.constant = -controller.position.y - 0.02; // taps land on the floor the player is on
    const point = groundAt(clientX, clientY);
    if (!point || Math.abs(point.x) > DISTRICT_HALF || Math.abs(point.z) > DISTRICT_HALF) return events.onMenu(null);
    const stairs = stairTarget(point.x, point.z);
    const { x, z } = stairs ?? point;
    // Plain movement has no menu: tap and go.
    events.onMenu(null);
    showMarker(x, z, controller.tapGround(x, z, "auto"));
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
  let frameNo = 0;
  let fps = 60;
  const followTarget = new THREE.Vector3();
  const shadowFocus = new THREE.Vector3();
  let tourFrames: number[] | null = null;
  let tourPeakCalls = 0;
  let tourPeakGeo = 0;
  let tourCancel = false;
  renderer.shadowMap.autoUpdate = false;

  function currentStats(): MapStats {
    return {
      fps,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      stream: streamer.stats(),
      ratio: quality.ratio,
      position: { x: controller.position.x, z: controller.position.z },
    };
  }

  let lastX = controller.position.x, lastZ = controller.position.z, localSpeed = 0;
  function loop() {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.1);
    if (document.hidden) return;
    controller.update(dt);
    remotes.focus.copy(controller.position);
    remotes.update(dt);
    localSpeed += (Math.hypot(controller.position.x - lastX, controller.position.z - lastZ) / Math.max(dt, 0.001) - localSpeed) * Math.min(1, dt * 8);
    lastX = controller.position.x;
    lastZ = controller.position.z;
    avatar.update(dt);
    streamer.update(controller.position.x, controller.position.z);
    // Take the roof (and any floors above the player's) off the building they are standing in, and follow the stairs up and down.
    controller.position.y = updateFloor();
    doors.update(controller.position.x, controller.position.z, dt);
    peds.update(dt, controller.position.x, controller.position.z);
    const here = floorLot?.landmark ? (district.landmarks.find((l) => l.lotId === floorLot!.id)?.name ?? null) : null;
    if (here !== placeName) {
      placeName = here;
      events.onPlace?.(here);
    }

    // Shadows follow the player, snapped to the shadow-map texels so they don't shimmer.
    const texel = (span * 2) / shadowSize;
    shadowFocus.set(Math.round(controller.position.x / texel) * texel, 0, Math.round(controller.position.z / texel) * texel);
    sun.target.position.copy(shadowFocus);
    sun.position.copy(shadowFocus).add(SUN_OFFSET);

    followTarget.set(controller.position.x, 0.9 + controller.position.y, controller.position.z);
    const shift = followTarget.clone().sub(controls.target).multiplyScalar(Math.min(1, dt * 4));
    controls.target.add(shift);
    camera.position.add(shift);
    controls.update();

    markerAge += dt;
    const m = marker.material as THREE.MeshBasicMaterial;
    m.opacity = Math.max(0, 0.9 - markerAge * 0.7);
    if (m.opacity <= 0) marker.visible = false;

    frameNo++;
    if (frameNo % quality.shadowEvery === 0) renderer.shadowMap.needsUpdate = true;
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
      quality.update(fps);
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
    goTo,
    quality: () => quality.mode,
    setQuality(q) {
      quality.setQuality(q);
    },
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
    online: {
      remotes,
      pose: () => ({
        x: controller.position.x,
        y: controller.position.y,
        z: controller.position.z,
        yaw: controller.yaw,
        clip: localSpeed > 2.6 ? "Jog_Fwd_Loop" : localSpeed > 0.4 ? "Walk_Loop" : "Idle_Loop",
        level: floorLevel,
      }),
      correct: (x, z) => controller.place(x, z, controller.yaw),
    },
    dispose() {
      remotes.dispose();
      doors.dispose();
      peds.dispose();
      for (const built of interiorScenes.values()) for (const g of built.geometries) g.dispose();
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
      lookAt: (x, z, height = 40, back = 60) => {
        controls.target.set(x, 0, z);
        camera.position.set(x + back * 0.4, height, z + back);
        controls.update();
      },
      tapGround: (x, z) => controller.tapGround(x, z),
      streamer,
      /** Runs the character for this many seconds at once (for tests on slow machines). */
      simulate: (seconds: number) => {
        for (let t = 0; t < seconds; t += 0.05) {
          controller.position.y = updateFloor();
          controller.update(0.05);
        }
      },
      navFree: (x: number, z: number) => isFree(groundNav, x, z),
      landmarks: district.landmarks,
      plan: (id: string) => planOf(district.lots.find((l) => l.id === id)!),
      floor: () => ({ level: floorLevel, y: controller.position.y, lot: floorLot?.id ?? null }),
      houses: () => interiorLots.map((l) => ({ id: l.id, floors: l.floors, garage: l.garage, facing: l.facing, inside: generatePlan(l).inside, kind: l.kind })),
      state: () => controller.state,
      night: () => night,
    },
  };
}
