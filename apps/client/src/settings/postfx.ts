import * as THREE from "three";

/** Optional bloom. The extra passes are only downloaded and built when it is switched on. */
export class PostFX {
  private composer: import("three/examples/jsm/postprocessing/EffectComposer.js").EffectComposer | null = null;
  private bloom: import("three/examples/jsm/postprocessing/UnrealBloomPass.js").UnrealBloomPass | null = null;
  private wanted = false;
  private strength = 0.5;
  private token = 0;
  private width = 1;
  private height = 1;
  private ratio = 1;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {}

  get active(): boolean {
    return this.composer !== null && this.wanted;
  }

  setSize(width: number, height: number, ratio: number): void {
    this.width = width;
    this.height = height;
    this.ratio = ratio;
    this.composer?.setPixelRatio(ratio);
    this.composer?.setSize(width, height);
  }

  async set(on: boolean, strength: number): Promise<void> {
    this.wanted = on;
    this.strength = strength;
    if (this.bloom) this.bloom.strength = strength;
    if (!on || this.composer) return;
    const token = ++this.token;
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
      import("three/examples/jsm/postprocessing/EffectComposer.js"),
      import("three/examples/jsm/postprocessing/RenderPass.js"),
      import("three/examples/jsm/postprocessing/UnrealBloomPass.js"),
      import("three/examples/jsm/postprocessing/OutputPass.js"),
    ]);
    if (token !== this.token || !this.wanted) return;
    const target = new THREE.WebGLRenderTarget(this.width, this.height, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    // A high threshold: only really bright things (lamps, the sun, windows) glow.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), this.strength, 0.55, 0.9);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
    composer.setPixelRatio(this.ratio);
    composer.setSize(this.width, this.height);
  }

  render(): void {
    if (this.composer && this.wanted) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.token++;
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
  }
}
