import * as THREE from "three";
import { Avatar } from "../lab/avatar";
import type { Look } from "../lab/looks";
import { loadManifest } from "../lab/manifest";
import { HALF_W } from "./projection";

const TILE_W = HALF_W * 2;

/** The drawing area around the character, in the same units as the room's pictures (the origin is the middle of the feet). */
const AREA = { w: 300, h: 330, ox: 150, oy: 262 };
const ELEVATION = (30 * Math.PI) / 180;

/**
 * The character, drawn live from the 3D model with the same isometric camera as the room, at the screen's own resolution.
 * Nothing is baked, so it is as sharp as the screen allows, can face any way and moves smoothly; the room around it stays painted.
 * The picture comes out of a hidden WebGL canvas and is drawn into the room like any other sprite.
 */
export class LiveChar {
  private avatar: Avatar | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private clip = "";
  private px = 0;
  private elev = 30;
  private holder = new THREE.Group();

  constructor(public look: Look) {}

  async load(): Promise<void> {
    const manifest = await loadManifest();
    const avatar = new Avatar(manifest, this.look);
    await avatar.load();
    this.avatar = avatar;
    this.holder.add(avatar.root);
    this.scene.add(this.holder);
    // warm daylight from the front-left, a cool fill from the back right, so a face and body read clearly from the room's camera
    this.scene.add(new THREE.HemisphereLight("#fff1dc", "#6b5a48", 1.1));
    const sun = new THREE.DirectionalLight("#fff0da", 2.3);
    sun.position.set(-4, 7, 5);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight("#a9bcff", 0.7);
    fill.position.set(6, 3, -4);
    this.scene.add(fill);
    const d = 30;
    this.cam.position.set(d * Math.cos(ELEVATION) * Math.SQRT1_2, d * Math.sin(ELEVATION), d * Math.cos(ELEVATION) * Math.SQRT1_2);
    this.cam.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    this.renderer = renderer;
    avatar.play("Idle_Loop", 0);
    this.clip = "Idle_Loop";
  }

  get ready(): boolean {
    return !!this.avatar && !!this.renderer;
  }

  async setLook(patch: Partial<Look>): Promise<void> {
    this.look = { ...this.look, ...patch };
    await this.avatar?.setLook(patch);
  }

  /** Advances the current animation. */
  tick(dt: number): void {
    this.avatar?.update(dt);
  }

  /** Makes sure this animation is the one playing (with a short blend from the last one). */
  play(clip: string, fade = 0.18): void {
    if (!this.avatar || clip === this.clip) return;
    if (this.avatar.play(clip, fade)) this.clip = clip;
  }

  /** Puts a one-shot animation (sitting down, getting up) at a point from 0 to 1 along it, and holds it there. */
  scrub(clip: string, k: number): void {
    const a = this.avatar;
    if (!a) return;
    a.stop();
    if (!a.play(clip, 0)) return;
    this.clip = "";
    a.update(Math.max(0.0001, Math.min(0.9999, k)) * (a.clipDuration(clip) || 1));
  }

  /**
   * Draws the character facing `yaw` for a screen showing `s` device pixels per picture pixel, and returns it with where its origin is,
   * in the room's own units (so it can be placed like any sprite).
   */
  draw(yaw: number, s: number, elevationDeg = 30): { img: CanvasImageSource; w: number; h: number; ax: number; ay: number } | null {
    const r = this.renderer, a = this.avatar;
    if (!r || !a) return null;
    // sizes move in steps so pinching to zoom doesn't rebuild the picture every frame
    const q = Math.max(0.5, Math.round(s * 4) / 4);
    const wpx = Math.ceil(AREA.w * q), hpx = Math.ceil(AREA.h * q);
    if (r.domElement.width !== wpx || r.domElement.height !== hpx) r.setSize(wpx, hpx, false);
    if (this.px !== q) {
      this.px = q;
      const k = (TILE_W / Math.SQRT2) * q; // pixels per metre
      this.cam.left = -(AREA.ox * q) / k;
      this.cam.right = (wpx - AREA.ox * q) / k;
      this.cam.top = (AREA.oy * q) / k;
      this.cam.bottom = -(hpx - AREA.oy * q) / k;
      this.cam.updateProjectionMatrix();
    }
    if (this.elev !== elevationDeg) {
      // the studio looks at the person from nearly eye level; the room looks down at the usual isometric angle
      this.elev = elevationDeg;
      const e = (elevationDeg * Math.PI) / 180, d = 30;
      this.cam.position.set(d * Math.cos(e) * Math.SQRT1_2, d * Math.sin(e), d * Math.cos(e) * Math.SQRT1_2);
      this.cam.lookAt(0, 0, 0);
    }
    a.root.rotation.y = yaw;
    r.render(this.scene, this.cam);
    return { img: r.domElement, w: AREA.w, h: AREA.h, ax: AREA.ox, ay: AREA.oy };
  }

  dispose(): void {
    this.avatar?.dispose();
    this.renderer?.dispose();
  }
}
