import * as THREE from "three";
import type { Avatar } from "../lab/avatar";
import { createCharacter, resolveLook } from "../lab/character";
import { locomotionRate } from "../lab/locomotion";
import type { Tier } from "./cityFilm";

/**
 * The phone version of the last two beats of the arrival film (stepping out onto the pavement, then the close-up). The street is not
 * built here: a picture of it, rendered from the same camera (see tools/film/render_arrival.mjs), sits behind a transparent canvas, and
 * only the player's own character is drawn live, walking in place while the picture drifts past. One character, one light or two and no
 * shadow map: it holds 60 frames a second on a phone that cannot run the full street.
 */
const MOOD: Record<Tier, { mood: "smirk" | "happy" | "worried"; amount: number }> = {
  nepo: { mood: "smirk", amount: 0.8 },
  middle: { mood: "happy", amount: 0.8 },
  lapo: { mood: "worried", amount: 0.35 },
};

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

export class LiteFilm {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
  private avatar: Avatar | null = null;
  private beat: "street" | "face" = "street";
  private t = 0;
  private gone = false;
  private started = false;
  readonly loaded: Promise<void>;

  constructor(private canvas: HTMLCanvasElement, private tier: Tier, lookJson?: string | null) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    // golden hour on the street: a low warm light from the side the sun is, a cool sky fill, a warm rim from behind
    this.scene.add(new THREE.HemisphereLight("#bcd0ff", "#c89a6c", 1.15));
    const key = new THREE.DirectionalLight("#ffd9a8", 2.4);
    key.position.set(-2.5, 3.2, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight("#ffb070", 2.2);
    rim.position.set(1.5, 2.5, -4);
    this.scene.add(rim);
    // a soft dark patch under the feet in place of a shadow map
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 24),
      new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.01;
    this.scene.add(blob);
    this.loaded = createCharacter(resolveLook(lookJson), { face: true })
      .then((a) => {
        if (this.gone) return a.dispose();
        this.avatar = a;
        a.root.rotation.y = -Math.PI / 2;
        a.play("Idle_Loop", 0);
        this.scene.add(a.root);
      })
      .catch((e) => {
        if (import.meta.env.DEV) console.warn("film character", e);
      });
    this.resize();
    window.addEventListener("resize", this.resize);
  }

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  setBeat(kind: "street" | "face") {
    this.beat = kind;
    this.t = 0;
    this.started = false;
  }

  dispose() {
    this.gone = true;
    window.removeEventListener("resize", this.resize);
    this.avatar?.dispose();
    this.renderer.dispose();
  }

  draw(dt: number) {
    if (this.gone) return;
    this.t += dt;
    const a = this.avatar;
    const cam = this.camera;
    if (a) {
      if (this.beat === "street") {
        if (!this.started) {
          this.started = true;
          a.play("Walk_Loop", 0.2);
          a.setSpeed(locomotionRate(1.3, "Walk_Loop"));
        }
        const k = clamp01(this.t / 5);
        // the same camera as the full film's walk: beside her and a little ahead, from the road side
        cam.position.set(-lerp(3.4, 2.4, k), lerp(1.3, 1.4, k), lerp(3.6, 3.0, k));
        cam.lookAt(-0.3, 1.2, -0.3);
        cam.fov = 36;
      } else {
        if (!this.started) {
          this.started = true;
          a.play("Idle_Loop", 0.4);
          a.setSpeed(1);
        }
        const u = smooth(clamp01(this.t / 4.5));
        a.root.rotation.y = lerp(-Math.PI / 2, 0.06 * Math.PI, smooth(clamp01((this.t - 0.2) / 1.0)));
        const m = MOOD[this.tier];
        a.setMood(m.mood, smooth(clamp01((this.t - 1.2) / 1.2)) * m.amount);
        cam.position.set(lerp(-0.5, 0.1, u), lerp(1.58, 1.62, u), lerp(2.4, 1.6, u));
        cam.lookAt(0, 1.6, 0);
        cam.fov = lerp(26, 22, u);
      }
      cam.updateProjectionMatrix();
      a.update(dt);
    }
    this.renderer.render(this.scene, cam);
  }
}

function blobTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, "rgba(20,12,8,.55)");
  grad.addColorStop(1, "rgba(20,12,8,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
