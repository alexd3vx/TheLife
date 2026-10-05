import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { isFree } from "@thelife/shared";
import { Avatar } from "../lab/avatar";
import { loadSavedLook } from "../lab/looks";
import type { AssetManifest } from "../lab/manifest";
import { CharacterController, type Status } from "./controller";
import { INTERACTIONS, PLAY_AREA } from "./layout";
import { buildWorld, type PlacedItem } from "./world";

export interface RuntimeEvents {
  onStatus(status: Status): void;
  /** Hint for the thing under the pointer (desktop hover), or null. */
  onHover(hint: string | null): void;
  onStats(text: string): void;
}

export interface PlayRuntime {
  dispose(): void;
  setFollow(on: boolean): void;
  resetView(): void;
  /** For tests and debugging. */
  debug: {
    tapGround(x: number, z: number): boolean;
    tapItem(id: string): boolean;
    state(): CharacterController["state"];
    free(x: number, z: number): boolean;
    setView(azimuthDeg: number, polarDeg: number, distance: number): void;
  };
}

const TAP_MAX_MOVE = 9; // pixels
const TAP_MAX_TIME = 450; // milliseconds

export async function startPlay(container: HTMLElement, manifest: AssetManifest, events: RuntimeEvents): Promise<PlayRuntime | null> {
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

  const world = await buildWorld(manifest, small ? 1024 : 2048);
  const avatar = new Avatar(manifest, loadSavedLook());
  await avatar.load();
  world.scene.add(avatar.root);

  const controller = new CharacterController(avatar, world.nav, events.onStatus);
  controller.place(-1, 1, Math.PI);

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
  const VIEW_TARGET = new THREE.Vector3(-0.5, 0.9, 0.5);
  function resetView() {
    controls.target.copy(follow ? new THREE.Vector3(controller.position.x, 0.9, controller.position.z) : VIEW_TARGET);
    camera.position.set(controls.target.x + 4, 9.5, controls.target.z + 11.5);
    controls.update();
  }
  resetView();

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

  function interactiveAt(clientX: number, clientY: number): PlacedItem | null {
    pointerRay(clientX, clientY);
    const hits = raycaster.intersectObjects(world.pickables, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.itemId) o = o.parent;
      const item = world.items.find((i) => i.group === o);
      if (item) return item;
    }
    return null;
  }

  function groundAt(clientX: number, clientY: number): THREE.Vector3 | null {
    pointerRay(clientX, clientY);
    return raycaster.ray.intersectPlane(plane, hit) ? hit.clone() : null;
  }

  function handleTap(clientX: number, clientY: number) {
    const item = interactiveAt(clientX, clientY);
    if (item?.def.interaction) {
      const interaction = INTERACTIONS[item.def.interaction];
      if (interaction) {
        const ok = controller.tapInteraction(interaction);
        showMarker(interaction.approach[0], interaction.approach[1], ok);
        return;
      }
    }
    const point = groundAt(clientX, clientY);
    if (!point) return;
    if (point.x < PLAY_AREA.minX || point.x > PLAY_AREA.maxX || point.z < PLAY_AREA.minZ || point.z > PLAY_AREA.maxZ) return;
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
      const item = interactiveAt(e.clientX, e.clientY);
      canvas.style.cursor = item ? "pointer" : "crosshair";
      const lit = item?.def.interaction;
      for (const placed of world.items) for (const m of placed.materials) m.emissive.setHex(lit && placed.def.interaction === lit ? 0x442200 : 0x000000);
      events.onHover(item?.def.interaction ? (INTERACTIONS[item.def.interaction]?.hint ?? null) : null);
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
  const followTarget = new THREE.Vector3();
  function loop() {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.1);
    if (document.hidden) return;

    controller.update(dt);
    avatar.update(dt);

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

  return {
    setFollow(on) {
      follow = on;
    },
    resetView,
    dispose() {
      stopped = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      controls.dispose();
      avatar.dispose();
      world.dispose();
      renderer.dispose();
      canvas.remove();
    },
    debug: {
      tapGround: (x, z) => controller.tapGround(x, z),
      tapItem(id) {
        const item = world.items.find((i) => i.def.id === id);
        const interaction = item?.def.interaction ? INTERACTIONS[item.def.interaction] : undefined;
        return interaction ? controller.tapInteraction(interaction) : false;
      },
      state: () => controller.state,
      free: (x, z) => isFree(world.nav, x, z),
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
