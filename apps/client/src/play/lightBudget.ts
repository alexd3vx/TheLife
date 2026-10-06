import * as THREE from "three";

/**
 * Every point light in the scene costs every pixel of every lit surface, switched on or not. A house has a dozen (lamps, TV glow,
 * fridge, rooms), but only a few matter at once, so only the few that are brightest where the player is stay in the scene's
 * light list. The number kept never changes, so the shaders are not rebuilt when the choice moves from one light to another.
 */
export class LightBudget {
  private lights: THREE.PointLight[] = [];
  private frame = 0;
  private readonly p = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene, public keep = 4) {}

  /** Call every frame with where the player is. */
  update(focus: THREE.Vector3): void {
    if (this.frame++ % 90 === 0) {
      this.lights = [];
      this.scene.traverse((o) => {
        if ((o as THREE.PointLight).isPointLight) this.lights.push(o as THREE.PointLight);
      });
    }
    if (this.lights.length <= this.keep || this.frame % 6 !== 0) return;
    const scored = this.lights.map((l) => {
      l.getWorldPosition(this.p);
      const d2 = this.p.distanceToSquared(focus);
      return { l, score: (l.intensity + 0.001) / (1 + d2) };
    });
    scored.sort((a, b) => b.score - a.score);
    scored.forEach((s, i) => {
      s.l.visible = i < this.keep;
    });
  }
}
