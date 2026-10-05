import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { isFree } from "@thelife/shared";
import { Avatar } from "../lab/avatar";
import { loadSavedLook } from "../lab/looks";
import type { AssetManifest } from "../lab/manifest";
import { CharacterController, type GameBridge, type Status } from "./controller";
import { GameSession, clearGameSave, type HudSnapshot } from "./gameSession";
import type { SimEvent } from "@thelife/game-core";
import { HOUSE_LAYOUT, buildShowroomLayout, type Layout } from "./layout";
import { FURNITURE } from "@thelife/game-core";
import { buildWorld, type PlacedItem } from "./world";

export interface RuntimeEvents {
  onStatus(status: Status): void;
  onHud(snapshot: HudSnapshot): void;
  onEvents(events: SimEvent[]): void;
  /** Lines for the "While you were away" panel. */
  onAway(lines: string[]): void;
  /** Hint for the thing under the pointer (desktop hover), or null. */
  onHover(hint: string | null): void;
  onStats(text: string): void;
}

export interface PlayRuntime {
  dispose(): void;
  buyGroceries(): void;
  newGame(): void;
  setFollow(on: boolean): void;
  resetView(): void;
  /** For tests and debugging. */
  debug: {
    tapGround(x: number, z: number): boolean;
    tapItem(id: string): boolean;
    /** Placed items with what tapping them does (for the showroom tests). */
    items(): { id: string; furniture: string; action: string | null; seats: number; x: number; z: number; animated: boolean; approach: [number, number] | null; pose: [number, number, number] | null; topY: number }[];
    setHour(hour: number): void;
    /** Is this lamp (or other switch) on? */
    isOn(id: string): boolean;
    /** Runs the simulation faster than real time (tests on slow machines). */
    setSpeed(scale: number): void;
    /** Points the camera at a placed item. */
    focus(id: string, distance?: number): void;
    /** Where the character's body is right now, for checking it sits on the furniture. */
    pose(): { hipsY: number | null };
    state(): CharacterController["state"];
    free(x: number, z: number): boolean;
    session: GameSession | null;
    avatar: Avatar;
    scene: THREE.Scene;
    canReach(interactionId: string): boolean;
    teleport(x: number, z: number): void;
    setView(azimuthDeg: number, polarDeg: number, distance: number): void;
  };
}

const TAP_MAX_MOVE = 9; // pixels
const TAP_MAX_TIME = 450; // milliseconds

export type PlayMode = "house" | "showroom";

export async function startPlay(container: HTMLElement, manifest: AssetManifest, events: RuntimeEvents, options: { fresh?: boolean; mode?: PlayMode } = {}): Promise<PlayRuntime | null> {
  const showroom = options.mode === "showroom";
  const layout: Layout = showroom ? buildShowroomLayout(FURNITURE) : HOUSE_LAYOUT;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  const small = window.matchMedia("(max-width: 860px)").matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
  container.appendChild(renderer.domElement);

  const world = await buildWorld(manifest, layout, renderer, small ? 1024 : 2048);
  const avatar = new Avatar(manifest, loadSavedLook());
  await avatar.load();
  world.scene.add(avatar.root);

  const session = showroom ? null : new GameSession(options.fresh);
  if (session?.awaySummary.length) events.onAway(session.awaySummary);
  // The showroom has no needs or money: every activity can always start, and runs until you walk away.
  let fakeActive: { id: string; forced: boolean } | null = null;
  const bridge: GameBridge = session
    ? { start: (id) => session.start(id), cancel: () => session.cancel(), active: () => session.active(), speedFactor: () => session.speedFactor(), notice: (t) => session.notice(t), needs: () => session.sim.state.needs }
    : {
        start: (id) => {
          fakeActive = { id, forced: false };
          return { ok: true };
        },
        cancel: () => {
          fakeActive = null;
        },
        active: () => fakeActive,
        speedFactor: () => 1,
        notice: () => {},
        needs: () => ({ hunger: 100, energy: 100, hygiene: 100, bladder: 100, fun: 100 }),
      };
  /** Items switched on by the player (lamps). */
  const switchedOn = new Set<string>();
  const controller = new CharacterController(avatar, world.nav, bridge, events.onStatus, (id) => {
    if (!switchedOn.delete(id)) switchedOn.add(id);
  });
  controller.place(layout.start.x, layout.start.z, layout.start.yaw);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.3, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minDistance = 3.5;
  controls.maxDistance = 24;
  controls.minPolarAngle = 0.2;
  controls.maxPolarAngle = 1.38;
  controls.screenSpacePanning = false;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

  let follow = true;
  const VIEW_TARGET = showroom ? new THREE.Vector3(0, 0.9, -2) : new THREE.Vector3(-0.5, 0.9, 0.5);
  function resetView() {
    controls.target.copy(follow ? new THREE.Vector3(controller.position.x, 0.9, controller.position.z) : VIEW_TARGET);
    camera.position.set(controls.target.x + 4, 9.5, controls.target.z + 11.5);
    controls.update();
  }
  resetView();
  await world.prewarm(renderer, camera);

  // ---- target marker
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.3, 40),
    new THREE.MeshBasicMaterial({ color: "#7dffb5", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  marker.rotation.x = -Math.PI / 2;
  world.scene.add(marker);
  let markerAge = 99;
  function showMarker(x: number, z: number, ok: boolean) {
    marker.position.set(x, 0.05, z);
    (marker.material as THREE.MeshBasicMaterial).color.set(ok ? "#7dffb5" : "#ff6b5e");
    markerAge = 0;
  }

  // ---- picking
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.02);
  const hit = new THREE.Vector3();

  function pointerRay(clientX: number, clientY: number) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }

  function interactiveAt(clientX: number, clientY: number): { item: PlacedItem; point: THREE.Vector3 } | null {
    pointerRay(clientX, clientY);
    const hits = raycaster.intersectObjects(world.pickables, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.itemId) o = o.parent;
      const item = world.items.find((i) => i.group === o);
      if (item) return { item, point: h.point };
    }
    return null;
  }

  /** The way of using an item that suits a tap: for a sofa, the seat nearest the finger. */
  function chooseInteraction(item: PlacedItem, point: THREE.Vector3 | null) {
    const options = world.interactionsFor(item.def.id);
    if (!point || options.length < 2) return options[0];
    return [...options].sort((a, b) => Math.hypot(a.at[0] - point.x, a.at[1] - point.z) - Math.hypot(b.at[0] - point.x, b.at[1] - point.z))[0];
  }

  function groundAt(clientX: number, clientY: number): THREE.Vector3 | null {
    pointerRay(clientX, clientY);
    return raycaster.ray.intersectPlane(plane, hit) ? hit.clone() : null;
  }

  function handleTap(clientX: number, clientY: number) {
    const picked = interactiveAt(clientX, clientY);
    if (picked) {
      const interaction = chooseInteraction(picked.item, picked.point);
      if (interaction) {
        const ok = controller.tapInteraction(interaction);
        showMarker(interaction.approach[0], interaction.approach[1], ok);
        return;
      }
    }
    const point = groundAt(clientX, clientY);
    if (!point) return;
    const area = layout.area;
    if (point.x < area.minX || point.x > area.maxX || point.z < area.minZ || point.z > area.maxZ) return;
    const ok = controller.tapGround(point.x, point.z);
    showMarker(point.x, point.z, ok);
  }

  // Taps are told apart from camera drags by how far and how long the pointer moved.
  const down = new Map<number, { x: number; y: number; t: number; moved: boolean }>();
  const canvas = renderer.domElement;
  const onDown = (e: PointerEvent) => {
    down.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: false });
  };
  const onMove = (e: PointerEvent) => {
    const d = down.get(e.pointerId);
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_MAX_MOVE) d.moved = true;
    if (e.pointerType === "mouse" && down.size === 0) {
      const picked = interactiveAt(e.clientX, e.clientY);
      canvas.style.cursor = picked ? "pointer" : "crosshair";
      world.highlight(picked?.item.def.id ?? null);
      events.onHover(picked ? (chooseInteraction(picked.item, picked.point)?.hint ?? null) : null);
    }
  };
  const onUp = (e: PointerEvent) => {
    const d = down.get(e.pointerId);
    const wasMulti = down.size > 1;
    down.delete(e.pointerId);
    if (!d || d.moved || wasMulti || e.button > 0) return;
    if (performance.now() - d.t > TAP_MAX_TIME) return;
    handleTap(e.clientX, e.clientY);
  };
  const onCancel = (e: PointerEvent) => down.delete(e.pointerId);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.style.cursor = "crosshair";

  // ---- sizing and loop
  function resize() {
    const { clientWidth, clientHeight } = container;
    if (!clientWidth || !clientHeight) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.fov = camera.aspect < 0.9 ? 52 : 38;
    camera.updateProjectionMatrix();
  }
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  const clock = new THREE.Clock();
  let raf = 0;
  let stopped = false;
  let frames = 0;
  let acc = 0;
  let hudClock = 1;
  const followTarget = new THREE.Vector3();
  let elapsed = 0;
  let timeScale = 1;
  let showroomHour = 12;
  const placedById = new Map(world.items.map((i) => [i.def.id, i]));
  /** Everything that reacts to the character using one item: the item itself, and what it's linked to (a TV when you sit on the sofa). */
  function usingSet(): Set<string> {
    const set = new Set<string>(switchedOn);
    const id = controller.usingItem;
    if (!id) return set;
    set.add(id);
    for (const link of placedById.get(id)?.def.link ?? []) set.add(link);
    return set;
  }
  function loop() {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.1) * timeScale;
    if (document.hidden) return;

    elapsed += dt;
    if (session) {
      const simEvents = session.step(dt);
      if (simEvents.length) events.onEvents(simEvents);
      world.setTimeOfDay(session.sim.clock.hourFloat);
    } else {
      world.setTimeOfDay(showroomHour);
    }
    controller.update(dt);
    avatar.update(dt);
    world.updateFurniture(dt, elapsed, usingSet());
    hudClock += dt;
    if (session && hudClock > 0.2) {
      hudClock = 0;
      events.onHud(session.snapshot());
    }

    if (follow) {
      followTarget.set(controller.position.x, 0.9, controller.position.z);
      const shift = followTarget.clone().sub(controls.target).multiplyScalar(Math.min(1, dt * 4));
      controls.target.add(shift);
      camera.position.add(shift);
    }
    controls.update();
    world.updateWalls(camera, dt);

    markerAge += dt;
    const m = marker.material as THREE.MeshBasicMaterial;
    m.opacity = Math.max(0, 0.9 - markerAge * 0.7);
    marker.scale.setScalar(1 + Math.min(markerAge, 1.2) * 0.5);

    renderer.render(world.scene, camera);
    frames++;
    acc += dt;
    if (acc >= 0.5) {
      events.onStats(`${Math.round(frames / acc)} fps`);
      frames = 0;
      acc = 0;
    }
  }
  loop();
  const saveNow = () => session?.save();
  window.addEventListener("pagehide", saveNow);
  document.addEventListener("visibilitychange", saveNow);

  return {
    setFollow(on) {
      follow = on;
    },
    resetView,
    buyGroceries() {
      session?.buyGroceries();
    },
    newGame() {
      clearGameSave();
      location.reload();
    },
    dispose() {
      stopped = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      session?.save();
      window.removeEventListener("pagehide", saveNow);
      document.removeEventListener("visibilitychange", saveNow);
      controls.dispose();
      avatar.dispose();
      world.dispose();
      renderer.dispose();
      canvas.remove();
    },
    debug: {
      tapGround: (x, z) => controller.tapGround(x, z),
      tapItem(id) {
        const interaction = world.interactionsFor(id)[0];
        return interaction ? controller.tapInteraction(interaction) : false;
      },
      items: () =>
        world.items.map((i) => {
          const own = world.interactions.get(i.def.id) ?? [];
          return {
            id: i.def.id,
            furniture: i.def.furniture,
            action: own[0]?.action ?? null,
            seats: own.length,
            x: i.def.x,
            z: i.def.z,
            animated: i.instance.animated,
            approach: own[0]?.approach ?? null,
            pose: own[0]?.pose ?? null,
            topY: i.bounds.max.y,
          };
        }),
      setHour(hour) {
        showroomHour = hour;
      },
      isOn: (id) => switchedOn.has(id),
      setSpeed(scale) {
        timeScale = scale;
      },
      focus(id, distance = 6) {
        const item = placedById.get(id);
        if (!item) return;
        const c = item.bounds.getCenter(new THREE.Vector3());
        controls.target.set(c.x, Math.min(c.y, 1.2), c.z);
        camera.position.set(c.x + distance * 0.45, controls.target.y + distance * 0.6, c.z + distance * 0.8);
        controls.update();
      },
      pose() {
        const bone = avatar.root.getObjectByName("pelvis") ?? avatar.root.getObjectByName("Hips") ?? avatar.root.getObjectByName("hips");
        if (!bone) return { hipsY: null };
        return { hipsY: bone.getWorldPosition(new THREE.Vector3()).y };
      },
      avatar,
      scene: world.scene,
      state: () => controller.state,
      free: (x, z) => isFree(world.nav, x, z),
      get session() {
        return session;
      },
      canReach(id) {
        const i = world.interactionsFor(id)[0];
        return i ? controller.canReach(i.approach[0], i.approach[1]) : false;
      },
      teleport(x, z) {
        controller.place(x, z, controller.yaw);
      },
      setView(azimuthDeg, polarDeg, distance) {
        const az = (azimuthDeg * Math.PI) / 180;
        const pol = (polarDeg * Math.PI) / 180;
        camera.position.set(
          controls.target.x + distance * Math.sin(pol) * Math.sin(az),
          controls.target.y + distance * Math.cos(pol),
          controls.target.z + distance * Math.sin(pol) * Math.cos(az),
        );
        controls.update();
      },
    },
  };
}
