import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type LightingName = "studio" | "daylight" | "sunset" | "night";

export const LIGHTING_LABELS: Record<LightingName, string> = {
  studio: "Studio",
  daylight: "Daylight",
  sunset: "Sunset",
  night: "Night",
};

interface Preset {
  background: string;
  hemi: [string, string, number];
  key: [string, number, [number, number, number]];
  fill?: [string, number, [number, number, number]];
  rim?: [string, number, [number, number, number]];
  exposure: number;
  envIntensity: number;
  points?: [string, number, [number, number, number]][];
}

const PRESETS: Record<LightingName, Preset> = {
  studio: {
    background: "#23262b",
    hemi: ["#cfd8e8", "#40362e", 0.6],
    key: ["#fff1de", 2.4, [3, 5, 4]],
    fill: ["#9db6e8", 0.7, [-4, 2, 2]],
    rim: ["#ffd9b0", 1.6, [-2, 3, -4]],
    exposure: 1,
    envIntensity: 0.55,
  },
  daylight: {
    background: "#9fc4e8",
    hemi: ["#cfe4ff", "#9a8a72", 1.1],
    key: ["#fff6e6", 3.4, [4, 7, 3]],
    exposure: 1,
    envIntensity: 0.7,
  },
  sunset: {
    background: "#6a3a52",
    hemi: ["#a9b5ee", "#8a5a46", 0.7],
    key: ["#ffb072", 3.6, [-5, 2.2, 3]],
    rim: ["#7a8cff", 1.0, [4, 3, -3]],
    exposure: 1.05,
    envIntensity: 0.4,
  },
  night: {
    background: "#0c1020",
    hemi: ["#3a4a8a", "#14110f", 0.35],
    key: ["#7f94ff", 0.8, [3, 5, 3]],
    exposure: 1,
    envIntensity: 0.15,
    points: [["#ffb35e", 28, [1.6, 1.6, 1.2]]],
  },
};

export interface ViewerStats {
  fps: number;
  triangles: number;
  drawCalls: number;
  textures: number;
}

export interface Viewer {
  scene: THREE.Scene;
  subjectGroup: THREE.Group;
  setSubject(object: THREE.Object3D | null, frame?: boolean): void;
  setLighting(name: LightingName): void;
  setWireframe(on: boolean): void;
  setTurntable(on: boolean): void;
  addFrameCallback(callback: (delta: number) => void): void;
  resetCamera(): void;
  /** Looks at the subject at `height` (0 = feet, 1 = top), from `zoom` times the full-body distance (smaller = closer). */
  closeUp(height: number, zoom: number): void;
  screenshot(): string;
  onStats(callback: (stats: ViewerStats) => void): void;
  dispose(): void;
}

export function createViewer(container: HTMLElement): Viewer | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
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

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.4;
  controls.maxDistance = 14;
  controls.maxPolarAngle = Math.PI * 0.52;

  const lightGroup = new THREE.Group();
  scene.add(lightGroup);
  const subjectGroup = new THREE.Group();
  scene.add(subjectGroup);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(2.4, 64),
    new THREE.MeshStandardMaterial({ color: "#2f3238", roughness: 0.9, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.PolarGridHelper(2.4, 8, 6, 64, "#4a4f58", "#3a3f48");
  grid.position.y = 0.002;
  scene.add(grid);

  let wireframe = false;
  let turntable = false;
  let subject: THREE.Object3D | null = null;
  const callbacks: ((delta: number) => void)[] = [];
  let statsListener: ((stats: ViewerStats) => void) | null = null;

  function applyDisplayModes() {
    subjectGroup.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) (material as THREE.MeshStandardMaterial).wireframe = wireframe;
    });
  }

  function setLighting(name: LightingName) {
    const preset = PRESETS[name];
    lightGroup.clear();
    scene.background = new THREE.Color(preset.background);
    renderer.toneMappingExposure = preset.exposure;
    scene.environmentIntensity = preset.envIntensity;
    lightGroup.add(new THREE.HemisphereLight(preset.hemi[0], preset.hemi[1], preset.hemi[2]));

    const key = new THREE.DirectionalLight(preset.key[0], preset.key[1]);
    key.position.set(...preset.key[2]);
    key.castShadow = true;
    key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = key.shadow.camera.bottom = -3;
    key.shadow.camera.right = key.shadow.camera.top = 3;
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.02;
    lightGroup.add(key);

    for (const extra of [preset.fill, preset.rim]) {
      if (!extra) continue;
      const light = new THREE.DirectionalLight(extra[0], extra[1]);
      light.position.set(...extra[2]);
      lightGroup.add(light);
    }
    for (const [color, intensity, position] of preset.points ?? []) {
      const light = new THREE.PointLight(color, intensity, 12, 2);
      light.position.set(...position);
      lightGroup.add(light);
    }
  }

  function resetCamera() {
    const box = subject ? new THREE.Box3().setFromObject(subject) : new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1.8, 0.5));
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 0.3);
    const distance = (radius / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.5;
    controls.target.copy(centre);
    camera.position.set(centre.x + distance * 0.45, centre.y + radius * 0.12, centre.z + distance * 0.9);
    controls.update();
  }

  function closeUp(height: number, zoom: number) {
    if (!subject) return;
    const box = new THREE.Box3().setFromObject(subject);
    const size = box.getSize(new THREE.Vector3());
    const target = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y + size.y * height, (box.min.z + box.max.z) / 2);
    const distance = (Math.max(size.y, 0.3) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.5 * zoom;
    controls.target.copy(target);
    camera.position.set(target.x + distance * 0.35, target.y + size.y * 0.02, target.z + distance * 0.94);
    controls.update();
  }

  function resize() {
    const { clientWidth, clientHeight } = container;
    if (!clientWidth || !clientHeight) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  setLighting("studio");
  resetCamera();

  const clock = new THREE.Clock();
  let rafId = 0;
  let stopped = false;
  let frames = 0;
  let statsClock = 0;
  function loop() {
    if (stopped) return;
    rafId = requestAnimationFrame(loop);
    const delta = Math.min(clock.getDelta(), 0.1);
    if (document.hidden) return;
    for (const callback of callbacks) callback(delta);
    if (turntable && subject) subjectGroup.rotation.y += delta * 0.6;
    controls.update();
    renderer.render(scene, camera);

    frames++;
    statsClock += delta;
    if (statsClock >= 0.5) {
      statsListener?.({
        fps: Math.round(frames / statsClock),
        triangles: renderer.info.render.triangles,
        drawCalls: renderer.info.render.calls,
        textures: renderer.info.memory.textures,
      });
      frames = 0;
      statsClock = 0;
    }
  }
  loop();

  return {
    scene,
    subjectGroup,
    setSubject(object, frame = true) {
      if (subject) subjectGroup.remove(subject);
      subject = object;
      subjectGroup.rotation.y = 0;
      if (object) {
        subjectGroup.add(object);
        applyDisplayModes();
      }
      if (frame) resetCamera();
    },
    setLighting,
    setWireframe(on) {
      wireframe = on;
      applyDisplayModes();
    },
    setTurntable(on) {
      turntable = on;
    },
    addFrameCallback(callback) {
      callbacks.push(callback);
    },
    resetCamera,
    closeUp,
    screenshot: () => renderer.domElement.toDataURL("image/png"),
    onStats(callback) {
      statsListener = callback;
    },
    dispose() {
      stopped = true;
      cancelAnimationFrame(rafId);
      observer.disconnect();
      controls.dispose();
      environment.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
