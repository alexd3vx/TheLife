import type { FaName } from "../ui/icons";
import { LightBudget } from "./lightBudget";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { isFree } from "@thelife/shared";
import { AdaptiveQuality } from "../graphics";
import { getSettings, shadowMapSize, subscribeSettings } from "../settings/settings";
import { PostFX } from "../settings/postfx";
import { bodyFor, sexOf } from "../lab/looks";
import { Avatar } from "../lab/avatar";
import { loadSavedLook, parseLook } from "../lab/looks";
import type { AssetManifest } from "../lab/manifest";
import { CharacterController, type GameBridge, type Status } from "./controller";
import { GameSession, type HudSnapshot } from "./gameSession";
import { markRestart } from "./pendingLife";
import type { SimEvent } from "@thelife/game-core";
import { buildShowroomLayout, type Layout } from "./layout";
import { layoutForTier, layoutWithHome } from "./layouts";
import { homeLock } from "../phone/remote";
import { homeMove, homeSell, homeBuy } from "../phone/remote";
import { furnitureById } from "@thelife/game-core";
import { FURNITURE } from "@thelife/game-core";
import { buildWorld, type PlacedItem } from "./world";
import type { Interaction } from "./interactions";

export interface RuntimeEvents {
  onStatus(status: Status): void;
  onHud(snapshot: HudSnapshot): void;
  onEvents(events: SimEvent[]): void;
  /** Lines for the "While you were away" panel. */
  onAway(lines: string[]): void;
  /** Hint for the thing under the pointer (desktop hover), or null. */
  onHover(hint: string | null): void;
  onStats(text: string): void;
  /** What a tap offers (walk, run, use...), or null to close the menu. */
  onMenu?(menu: TapMenu | null): void;
  /** The fridge, the stove or the table was tapped: open the kitchen on this tab. */
  onKitchen?(tab: "fridge" | "cook" | "eat"): void;
  /** Home editing: what is picked up now (null = nothing). */
  onEditSelect?(info: { id: string; furniture: string; name: string; bought: boolean; price: number } | null): void;
}

export interface TapMenu {
  /** Where on the screen the tap was, in pixels from the top-left of the play area. */
  x: number;
  y: number;
  title: string | null;
  options: { label: string; icon: FaName; run(): void }[];
}

export interface PlayRuntime {
  dispose(): void;
  buyGroceries(): void;
  /** Walks to the nearest thing that does this action (the stove for "cook", a chair for "eatDish") and starts it. */
  useAction(action: string): boolean;
  /** Draws the 3D scene less while the phone covers it. */
  setPhoneOpen(open: boolean): void;
  /** The running game, for the phone screen. Null in the showroom. */
  session: GameSession | null;
  newGame(): void;
  /** Rearranging the home: pick up, move, turn, sell and buy furniture. */
  edit: { start(): void; stop(): void; rotate(): void; nudge(sx: number, sy: number): void; sell(): void; buy(furniture: string): Promise<string | null> };
  setFollow(on: boolean): void;
  resetView(): void;
  /** For tests and debugging. */
  debug: {
    tapGround(x: number, z: number): boolean;
    canWalkTo(x: number, z: number): boolean;
    /** Locks or unlocks the front door; returns whether it is locked now. */
    toggleDoor(): boolean;
    /** The route to an item's use spot from where the character stands, as points (null when there is none). */
    routeToItem(id: string): [number, number][] | null;
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
    /** Draw calls, triangles and average milliseconds per frame (update vs render), for performance checks. */
    perf(): { calls: number; triangles: number; geometries: number; textures: number; updateMs: number; renderMs: number; ratio: number; shadowEvery: number };
    state(): CharacterController["state"];
    free(x: number, z: number): boolean;
    session: GameSession | null;
    avatar: Avatar;
    scene: THREE.Scene;
    canReach(interactionId: string): boolean;
    teleport(x: number, z: number): void;
    setView(azimuthDeg: number, polarDeg: number, distance: number): void;
    /** Where a point in the world is on the screen (pixels), for tests. */
    screenOf(x: number, y: number, z: number): [number, number];
    world: { items: PlacedItem[]; layout: Layout; fits: (id: string | null, f: string, size: THREE.Vector3, x: number, z: number, rot: number, why?: { r: string }) => boolean };
  };
}

const TAP_MAX_MOVE = 9; // pixels
const TAP_MAX_TIME = 450; // milliseconds

export type PlayMode = "house" | "showroom";

export async function startPlay(container: HTMLElement, manifest: AssetManifest, events: RuntimeEvents, options: { fresh?: boolean; mode?: PlayMode; session?: GameSession } = {}): Promise<PlayRuntime | null> {
  const showroom = options.mode === "showroom";
  // (development only: ?tier=lapo|middle|nepo shows that background's home whatever life is loaded)
  const forcedTier = import.meta.env.DEV ? new URLSearchParams(location.search).get("tier") : null;
  const tierLayout = layoutForTier(forcedTier ?? (options.session ?? undefined)?.sim.state.profile?.tier);
  const layout: Layout = showroom ? buildShowroomLayout(FURNITURE) : layoutWithHome(tierLayout, options.session?.sim.state.home);
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: getSettings().antialias, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  const small = window.matchMedia("(max-width: 860px)").matches;
  // Quality adapts to the device (see graphics.ts): sharp by default, shadow refreshes are given up first.
  let fx: PostFX | null = null;
  const quality = new AdaptiveQuality((r) => {
    renderer.setPixelRatio(r);
    if (container.clientWidth) {
      renderer.setSize(container.clientWidth, container.clientHeight, false);
      fx?.setSize(container.clientWidth, container.clientHeight, r);
    }
  });
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
  container.appendChild(renderer.domElement);

  const world = await buildWorld(manifest, layout, renderer, small ? 1024 : 2048);
  // the character looks the way it was made in the creator (kept with the life on the server), not like whatever this device last tried on
  const lookJson = options.session?.sim.state.look;
  const avatar = new Avatar(manifest, lookJson ? parseLook(lookJson) : loadSavedLook());
  await avatar.load();
  world.scene.add(avatar.root);
  // a soft contact shadow under the character, so they stand on the floor instead of hovering over it
  const blob = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, "rgba(20,12,6,.55)");
    grad.addColorStop(0.55, "rgba(20,12,6,.28)");
    grad.addColorStop(1, "rgba(20,12,6,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 1;
    return mesh;
  })();
  world.scene.add(blob);

  const session = showroom ? null : (options.session ?? new GameSession(options.fresh));
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
  // a bigger house is looked at from a little further back
  const viewScale = layout.house ? Math.max(0.9, Math.min(1.3, (layout.house.bounds.maxX - layout.house.bounds.minX) / 14)) : 1;
  const VIEW_TARGET = showroom ? new THREE.Vector3(0, 0.9, -2) : new THREE.Vector3(-0.5, 0.9, 0.5);
  function resetView() {
    controls.target.copy(follow ? new THREE.Vector3(controller.position.x, 0.9, controller.position.z) : VIEW_TARGET);
    camera.position.set(controls.target.x + 4 * viewScale, 9.5 * viewScale, controls.target.z + 11.5 * viewScale);
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

  // ---- rearranging the home
  let editing = false;
  let selected: PlacedItem | null = null;
  let appliedHome = JSON.stringify(options.session?.sim.state.home ?? null);
  const editMarker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: "#6fe29a", transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
  editMarker.rotation.x = -Math.PI / 2;
  editMarker.visible = false;
  editMarker.renderOrder = 2;
  world.scene.add(editMarker);
  const movable = (i: PlacedItem) => !i.def.onTopOf && !i.def.y && !i.instance.meta.ceiling;
  const bought = (id: string) => /^n\d+$/.test(id);
  function placeMarker() {
    if (!selected || !editing) {
      editMarker.visible = false;
      return;
    }
    const b = selected.bounds;
    editMarker.scale.set(b.max.x - b.min.x + 0.1, b.max.z - b.min.z + 0.1, 1);
    editMarker.position.set((b.min.x + b.max.x) / 2, 0.02, (b.min.z + b.max.z) / 2);
    editMarker.visible = true;
  }
  function select(item: PlacedItem | null) {
    selected = item && movable(item) ? item : null;
    world.highlight(selected?.def.id ?? null);
    placeMarker();
    const sel = selected;
    events.onEditSelect?.(sel ? { id: sel.def.id, furniture: sel.def.furniture, name: sel.catalog.name, bought: bought(sel.def.id), price: sel.catalog.price } : null);
  }
  const snap = (v: number) => Math.round(v * 4) / 4;
  async function refreshLayout(keepId: string | null) {
    const st = options.session!.sim.state;
    appliedHome = JSON.stringify(st.home ?? null);
    await world.relayout(layoutWithHome(tierLayout, st.home));
    controller.setNav(world.nav);
    placedById.clear();
    for (const i of world.items) placedById.set(i.def.id, i);
    select(keepId ? (placedById.get(keepId) ?? null) : null);
  }
  let nudgePos: { id: string; x: number; z: number } | null = null;
  let nudgeTimer = 0;
  async function commitMove(item: PlacedItem, x: number, z: number, rot: number) {
    const st = options.session!.sim.state;
    const r = homeMove(st, item.def.id, x, z, rot);
    if (!r.ok) return options.session!.notice(r.reason);
    await refreshLayout(item.def.id);
  }
  function editTap(clientX: number, clientY: number) {
    pointerRay(clientX, clientY);
    const hits = raycaster.intersectObjects(world.items.map((i) => i.group), true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.itemId) o = o.parent;
      const item = world.items.find((i) => i.group === o);
      if (item && movable(item)) return select(item === selected ? null : item);
      if (item) return;
    }
    const it = selected;
    if (!it) return;
    const at = groundAt(clientX, clientY);
    if (!at) return;
    const x = snap(at.x), z = snap(at.z), rot = it.def.rot ?? 0;
    if (!world.fits(it.def.id, it.def.furniture, it.instance.size, x, z, rot)) return options.session!.notice("That doesn't fit there.");
    void commitMove(it, x, z, rot);
  }

  // ---- the front door: tap it to lock or unlock it (you walk up to it first)
  let doorLocked = !!options.session?.sim.state.home?.locked;
  world.frontDoor?.setLocked(doorLocked);
  let walkingToDoor = false;
  function doorAt(clientX: number, clientY: number): boolean {
    const door = world.frontDoor;
    if (!door) return false;
    pointerRay(clientX, clientY);
    return raycaster.intersectObjects(door.parts, true).length > 0;
  }
  function toggleDoorLock() {
    const session = options.session;
    if (!session) return;
    const r = homeLock(session.sim.state, !doorLocked);
    if (!r.ok) return session.notice(r.reason);
    doorLocked = !doorLocked;
    world.frontDoor?.setLocked(doorLocked);
    session.notice(r.text);
  }
  /** Each frame while walking to the door: lock it once the character is beside it. */
  function doorStep() {
    const door = world.frontDoor;
    if (!walkingToDoor || !door) return;
    if (Math.hypot(controller.position.x - door.x, controller.position.z - door.z) < 1.5) {
      walkingToDoor = false;
      controller.stop();
      toggleDoorLock();
    } else if (controller.mode === "idle") walkingToDoor = false;
  }

  function handleTap(clientX: number, clientY: number) {
    walkingToDoor = false;
    if (editing) return editTap(clientX, clientY);
    const rect = renderer.domElement.getBoundingClientRect();
    const at = { x: clientX - rect.left, y: clientY - rect.top };
    const close = () => events.onMenu?.(null);
    /** Shows the options, or (where there is no menu, as in the showroom) just does the first. */
    const present = (menu: TapMenu) => (events.onMenu ? events.onMenu(menu) : menu.options[0]?.run());
    if (doorAt(clientX, clientY) && world.frontDoor) {
      const door = world.frontDoor;
      present({
        ...at,
        title: "Front door",
        options: [{ label: doorLocked ? "Unlock the door" : "Lock the door", icon: "hand", run: () => {
          close();
          if (Math.hypot(controller.position.x - door.x, controller.position.z - door.z) < 1.5) return toggleDoorLock();
          // stand just inside, then turn the key
          showMarker(door.x, door.z - 1.1, controller.tapGround(door.x, door.z - 1.1, "auto"));
          walkingToDoor = true;
        } }],
      });
      return;
    }
    const picked = interactiveAt(clientX, clientY);
    if (picked) {
      const options = [...world.interactionsFor(picked.item.def.id)].sort(
        (a, b) => Math.hypot(a.at[0] - picked.point.x, a.at[1] - picked.point.z) - Math.hypot(b.at[0] - picked.point.x, b.at[1] - picked.point.z),
      );
      if (options.length) {
        const menu: TapMenu["options"] = [];
        options.slice(0, 3).forEach((interaction, i) => {
          const label = interaction.hint;
          const kitchenTab = interaction.action === "snack" ? "fridge" : interaction.action === "cook" ? "cook" : interaction.action === "eatMeal" ? "eat" : null;
          if (kitchenTab && events.onKitchen) {
            menu.push({ label: kitchenTab === "fridge" ? "Open the fridge" : kitchenTab === "cook" ? "Cook something" : "Have a meal", icon: i === 0 ? "hand" : "spot", run: () => { close(); events.onKitchen!(kitchenTab); } });
            return;
          }
          menu.push({ label, icon: i === 0 ? "hand" : "spot", run: () => { close(); showMarker(interaction.approach[0], interaction.approach[1], controller.tapInteraction(interaction, "auto")); } });
        });
        present({ ...at, title: picked.item.catalog.name, options: menu });
        return;
      }
    }
    const point = groundAt(clientX, clientY);
    if (!point) return close();
    const area = layout.area;
    if (point.x < area.minX || point.x > area.maxX || point.z < area.minZ || point.z > area.maxZ) return close();
    const { x, z } = point;
    // Plain movement has no menu: tap the floor and the character goes (running if it is far). Menus are for using things.
    close();
    showMarker(x, z, controller.tapGround(x, z, "auto"));
  }

  // Taps are told apart from camera drags by how far and how long the pointer moved.
  const down = new Map<number, { x: number; y: number; t: number; moved: boolean }>();
  const canvas = renderer.domElement;
  const onDown = (e: PointerEvent) => {
    events.onMenu?.(null);
    down.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: false });
  };
  const onMove = (e: PointerEvent) => {
    const d = down.get(e.pointerId);
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_MAX_MOVE) d.moved = true;
    if (e.pointerType === "mouse" && down.size === 0 && !editing) {
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
    fx?.setSize(clientWidth, clientHeight, quality.ratio);
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
  let syncClock = 0;
  let relayouting = false;
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
  const lightBudget = new LightBudget(world.scene);
  let frameGap = 0;
  let lastFrameAt = 0;

  // ---- the player's settings, applied now and whenever they change
  fx = new PostFX(renderer, world.scene, camera);
  fx.setSize(container.clientWidth || 1, container.clientHeight || 1, quality.ratio);
  function applySettings() {
    const st = getSettings();
    quality.configure(st);
    world.sun.castShadow = st.shadows !== "off";
    const size = shadowMapSize(st.shadows);
    if (world.sun.shadow.mapSize.x !== size) {
      world.sun.shadow.mapSize.set(size, size);
      world.sun.shadow.map?.dispose();
      world.sun.shadow.map = null;
    }
    renderer.shadowMap.needsUpdate = true;
    void fx?.set(st.bloom, st.bloomStrength);
    frameGap = st.fpsCap ? 1000 / st.fpsCap - 2 : 0;
    lightBudget.keep = st.lights;
    controls.rotateSpeed = st.cameraSpeed;
    controls.zoomSpeed = st.cameraSpeed;
    const want = bodyFor(sexOf(avatar.look.body), st.textureStyle === "realistic");
    if (avatar.look.body !== want) void avatar.setLook({ body: want });
  }
  applySettings();
  const unsubscribeSettings = subscribeSettings(applySettings);
  let renderEvery = 1;
  let frameNo = 0;
  let lowFor = 0;
  let highFor = 0;
  let updateMs = 0;
  let renderMs = 0;
  let timedFrames = 0;
  function loop() {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    if (frameGap && performance.now() - lastFrameAt < frameGap) return; // frame rate limit from the settings
    lastFrameAt = performance.now();
    const dt = Math.min(clock.getDelta(), 0.1) * timeScale;
    if (document.hidden) return;
    const t0 = performance.now();

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
    blob.position.set(avatar.root.position.x, 0.012, avatar.root.position.z);
    blob.visible = avatar.root.position.y < 0.6; // not while lying in bed
    world.updateFurniture(dt, elapsed, usingSet());
    lightBudget.update(controller.position);
    syncClock += dt;
    if (session && syncClock > 1.5) {
      syncClock = 0;
      // the server has the final word on the home: if its version differs from what is drawn, draw that
      if (!relayouting && JSON.stringify(session.sim.state.home ?? null) !== appliedHome) {
        relayouting = true;
        void refreshLayout(selected?.def.id ?? null).finally(() => (relayouting = false));
      }
    }
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
    doorStep();
    world.updateWalls(camera, dt);

    markerAge += dt;
    const m = marker.material as THREE.MeshBasicMaterial;
    m.opacity = Math.max(0, 0.9 - markerAge * 0.7);
    marker.scale.setScalar(1 + Math.min(markerAge, 1.2) * 0.5);

    const t1 = performance.now();
    frameNo++;
    if (frameNo % quality.shadowEvery === 0) renderer.shadowMap.needsUpdate = true;
    // With the phone open the scene is hidden behind it, so draw it rarely: smoother phone, cooler device.
    if (renderEvery === 1 || frames % renderEvery === 0) fx ? fx.render() : renderer.render(world.scene, camera);
    renderMs += performance.now() - t1;
    updateMs += t1 - t0;
    timedFrames++;
    frames++;
    acc += dt;
    if (acc >= 0.5) {
      const fps = frames / acc;
      quality.update(fps);
      events.onStats(`${Math.round(fps)} fps`);
      frames = 0;
      acc = 0;
    }
  }
  loop();
  const saveNow = () => session?.save();
  window.addEventListener("pagehide", saveNow);
  document.addEventListener("visibilitychange", saveNow);

  return {
    session,
    setFollow(on) {
      follow = on;
    },
    resetView,
    setPhoneOpen(open) {
      renderEvery = open ? 8 : 1;
    },
    buyGroceries() {
      session?.buyGroceries();
    },
    useAction(action) {
      let best: { i: Interaction; d: number } | null = null;
      for (const item of world.items) {
        for (const i of world.interactionsFor(item.def.id)) {
          if (i.action !== action) continue;
          const d = Math.hypot(i.approach[0] - controller.position.x, i.approach[1] - controller.position.z);
          if (!best || d < best.d) best = { i, d };
        }
      }
      if (!best) return false;
      return controller.tapInteraction(best.i, "auto");
    },
    edit: {
      start() {
        if (!options.session) return;
        editing = true;
        events.onMenu?.(null);
      },
      stop() {
        editing = false;
        select(null);
      },
      rotate() {
        const it = selected;
        if (!it) return;
        const rot = (((it.def.rot ?? 0) + 90) % 360 + 360) % 360;
        if (!world.fits(it.def.id, it.def.furniture, it.instance.size, it.def.x, it.def.z, rot)) return options.session!.notice("There isn't room to turn it.");
        void commitMove(it, it.def.x, it.def.z, rot);
      },
      nudge(sx, sy) {
        // arrows follow the screen: "up" is away from the camera. One step is half a metre, along whichever floor axis is closest.
        // The piece moves on screen at once; the full re-layout (heights, walking grid, uses) follows a moment after the last tap.
        const it = selected;
        if (!it || !editing || !options.session) return;
        const base = nudgePos && nudgePos.id === it.def.id ? nudgePos : { id: it.def.id, x: it.def.x, z: it.def.z };
        const fx = controls.target.x - camera.position.x, fz = controls.target.z - camera.position.z;
        const len = Math.hypot(fx, fz) || 1;
        const ux = fx / len, uz = fz / len;
        const vx = ux * sy + -uz * sx, vz = uz * sy + ux * sx;
        const step = 0.5;
        const x = base.x + (Math.abs(vx) >= Math.abs(vz) ? Math.sign(vx) * step : 0);
        const z = base.z + (Math.abs(vx) >= Math.abs(vz) ? 0 : Math.sign(vz) * step);
        const rot = it.def.rot ?? 0;
        if (!world.fits(it.def.id, it.def.furniture, it.instance.size, x, z, rot)) return options.session.notice("Something is in the way.");
        const r = homeMove(options.session.sim.state, it.def.id, x, z, rot);
        if (!r.ok) return options.session.notice(r.reason);
        const shift = new THREE.Vector3(x - base.x, 0, z - base.z);
        for (const p of world.items) {
          if (p !== it && p.def.onTopOf !== it.def.id) continue;
          p.group.position.add(shift);
          p.bounds.translate(shift);
        }
        nudgePos = { id: it.def.id, x, z };
        placeMarker();
        window.clearTimeout(nudgeTimer);
        nudgeTimer = window.setTimeout(() => {
          nudgePos = null;
          void refreshLayout(it.def.id);
        }, 350);
      },
      sell() {
        const it = selected;
        if (!it || !options.session) return;
        const r = homeSell(options.session.sim.state, it.def.id, bought(it.def.id) ? undefined : it.def.furniture);
        if (!r.ok) return options.session.notice(r.reason);
        options.session.notice(r.text);
        void refreshLayout(null);
      },
      async buy(furniture: string) {
        const session = options.session;
        if (!session) return "Not available here.";
        const def = furnitureById(furniture);
        if (!def) return "The shop doesn't have that.";
        const size = await world.sizeOf(furniture);
        const spot = world.findSpot(furniture, size);
        if (!spot) return "There's no free space for that. Sell or move something first.";
        const r = homeBuy(session.sim.state, furniture, spot.x, spot.z, 0);
        if (!r.ok) return r.reason;
        session.notice(r.text);
        const id = session.sim.state.home!.added[session.sim.state.home!.added.length - 1]!.id;
        await refreshLayout(id);
        return null;
      },
    },
    newGame() {
      markRestart();
      window.location.hash = "#/create";
    },
    dispose() {
      unsubscribeSettings();
      fx?.dispose();
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
      routeToItem(id: string) {
        const i = world.interactionsFor(id)[0];
        const r = i ? controller.routeTo(i.approach[0], i.approach[1]) : null;
        return r ? r.map((p) => [p.x, p.z] as [number, number]) : null;
      },
      toggleDoor() {
        toggleDoorLock();
        return doorLocked;
      },
      canWalkTo(x: number, z: number) {
        return controller.canReach(x, z);
      },
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
      perf: () => {
        const r = {
          calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
          updateMs: timedFrames ? updateMs / timedFrames : 0, renderMs: timedFrames ? renderMs / timedFrames : 0, ratio: quality.ratio, shadowEvery: quality.shadowEvery,
        };
        updateMs = renderMs = timedFrames = 0;
        return r;
      },
      avatar,
      scene: world.scene,
      state: () => controller.state,
      free: (x, z) => isFree(world.nav, x, z),
      screenOf(x, y, z) {
        const v = new THREE.Vector3(x, y, z).project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        return [(v.x * 0.5 + 0.5) * rect.width + rect.left, (-v.y * 0.5 + 0.5) * rect.height + rect.top];
      },
      world: world as never,
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
