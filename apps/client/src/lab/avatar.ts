import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { assetUrl, type AssetManifest, type AssetRecord } from "./manifest";
import { loadGLTF, loadGltfTexture } from "./loaders";
import { EYE_COLORS, HAIR_COLORS, SKIN_TONES, type Look } from "./looks";

type SkinnedMeshes = THREE.SkinnedMesh[];

function skinnedMeshesOf(root: THREE.Object3D): SkinnedMeshes {
  const meshes: SkinnedMeshes = [];
  root.traverse((child) => {
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(child as THREE.SkinnedMesh);
  });
  return meshes;
}

function materialsOf(mesh: THREE.Mesh): THREE.MeshStandardMaterial[] {
  const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return list.filter((m): m is THREE.MeshStandardMaterial => (m as THREE.MeshStandardMaterial).isMeshStandardMaterial);
}

/**
 * A customisable, animatable person built from separate glTF parts that all share one skeleton:
 * body (skin, eyes, brows) + hair + facial hair. Parts are bound to the body's skeleton by bone name,
 * so any animation clip made for that skeleton plays on every combination.
 */
export class Avatar {
  readonly root = new THREE.Group();
  private bodyScene: THREE.Object3D | null = null;
  private skeleton: THREE.Skeleton | null = null;
  private bodyMesh: THREE.SkinnedMesh | null = null;
  private partRoots = new Map<string, THREE.Object3D>();
  private mixer: THREE.AnimationMixer | null = null;
  private currentAction: THREE.AnimationAction | null = null;
  private clips = new Map<string, THREE.AnimationClip>();
  private builtInBrows: THREE.Object3D[] = [];
  private loadToken = 0;
  look: Look;

  constructor(
    private readonly manifest: AssetManifest,
    initial: Look,
  ) {
    this.look = { ...initial };
  }

  async load(): Promise<void> {
    await this.rebuild();
    await this.loadAnimations();
  }

  get clipNames(): string[] {
    return [...this.clips.keys()];
  }

  private asset(id: string): AssetRecord {
    const record = this.manifest.assets.find((a) => a.id === id);
    if (!record) throw new Error(`Unknown asset: ${id}`);
    return record;
  }

  /** Rebuilds the whole figure, e.g. when the body changes. */
  private async rebuild(): Promise<void> {
    const token = ++this.loadToken;
    const gltf = await loadGLTF(assetUrl(this.asset(`body_${this.look.body}`).file));
    if (token !== this.loadToken) return;

    const wasPlaying = this.currentAction?.getClip().name;
    this.clearParts();
    if (this.bodyScene) this.root.remove(this.bodyScene);
    this.mixer?.stopAllAction();

    this.bodyScene = SkeletonUtils.clone(gltf.scene);
    this.root.add(this.bodyScene);

    const meshes = skinnedMeshesOf(this.bodyScene);
    this.bodyMesh = meshes.find((m) => materialsOf(m).some((mat) => /superhero/i.test(mat.name))) ?? meshes[0] ?? null;
    this.skeleton = this.bodyMesh?.skeleton ?? null;
    this.builtInBrows = meshes.filter((m) => materialsOf(m).some((mat) => /hair/i.test(mat.name)));
    for (const mesh of meshes) {
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }

    this.mixer = new THREE.AnimationMixer(this.bodyScene);
    this.currentAction = null;

    await this.applySkin();
    this.applyEyes();
    this.applyBuiltInBrows();
    await this.syncParts();
    if (token !== this.loadToken) return;
    if (wasPlaying) this.play(wasPlaying, 0);
  }

  private async loadAnimations(): Promise<void> {
    const gltf = await loadGLTF(assetUrl(this.asset("ual1").file));
    for (const clip of gltf.animations) this.clips.set(clip.name, clip);
  }

  async setLook(patch: Partial<Look>): Promise<void> {
    const previous = this.look;
    this.look = { ...previous, ...patch };

    if (patch.body && patch.body !== previous.body) {
      await this.rebuild();
      return;
    }
    if (patch.skinTone !== undefined) await this.applySkin();
    if (patch.eyeColor !== undefined) this.applyEyes();
    if (patch.hairColor !== undefined) this.applyHairColor();
    if (patch.brows !== undefined) this.applyBuiltInBrows();
    if (patch.hair !== undefined || patch.beard !== undefined || patch.brows !== undefined) await this.syncParts();
  }

  private async applySkin(): Promise<void> {
    if (!this.bodyScene) return;
    const tone = SKIN_TONES.find((t) => t.id === this.look.skinTone) ?? SKIN_TONES[0]!;
    const lightMap = tone.map === "light" ? await loadGltfTexture(assetUrl(`characters/skin_${this.look.body}_light.webp`)) : null;
    this.bodyScene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of materialsOf(mesh)) {
        if (!/superhero/i.test(material.name)) continue;
        material.userData.darkMap ??= material.map;
        material.map = lightMap ?? (material.userData.darkMap as THREE.Texture | null);
        material.color.set(tone.tint);
        material.needsUpdate = true;
      }
    });
  }

  private applyEyes(): void {
    const swatch = EYE_COLORS.find((s) => s.id === this.look.eyeColor) ?? EYE_COLORS[0]!;
    this.bodyScene?.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of materialsOf(mesh)) {
        if (/eye/i.test(material.name)) material.color.set(swatch.color);
      }
    });
  }

  private applyBuiltInBrows(): void {
    const hidden = this.look.brows !== null;
    for (const brow of this.builtInBrows) brow.visible = !hidden;
  }

  private hairTint(): THREE.Color {
    const swatch = HAIR_COLORS.find((s) => s.id === this.look.hairColor) ?? HAIR_COLORS[0]!;
    return new THREE.Color(swatch.color);
  }

  private applyHairColor(): void {
    const tint = this.hairTint();
    for (const brow of this.builtInBrows) {
      brow.traverse((c) => {
        const mesh = c as THREE.Mesh;
        if (mesh.isMesh) for (const m of materialsOf(mesh)) m.color.copy(tint);
      });
    }
    for (const part of this.partRoots.values()) {
      part.traverse((c) => {
        const mesh = c as THREE.Mesh;
        if (mesh.isMesh) for (const m of materialsOf(mesh)) m.color.copy(tint);
      });
    }
  }

  private clearParts(): void {
    for (const part of this.partRoots.values()) part.parent?.remove(part);
    this.partRoots.clear();
  }

  private wantedParts(): Record<string, string | null> {
    return {
      hair: this.look.hair,
      facial: this.look.beard ? "beard" : null,
      brows: this.look.brows,
    };
  }

  /** Makes the attached hair/beard/brows match `look`. */
  private async syncParts(): Promise<void> {
    const wanted = this.wantedParts();
    const token = this.loadToken;
    for (const [slot, id] of Object.entries(wanted)) {
      const current = this.partRoots.get(slot);
      if (current && current.userData.assetId === id) continue;
      if (current) {
        current.parent?.remove(current);
        this.partRoots.delete(slot);
      }
      if (!id) continue;
      const part = await this.buildPart(id);
      if (token !== this.loadToken || !part) return;
      this.partRoots.set(slot, part);
    }
    this.applyHairColor();
  }

  private async buildPart(id: string): Promise<THREE.Object3D | null> {
    if (!this.skeleton || !this.bodyMesh || !this.bodyScene) return null;
    const gltf = await loadGLTF(assetUrl(this.asset(id).file));
    const clone = SkeletonUtils.clone(gltf.scene);
    const group = new THREE.Group();
    group.userData.assetId = id;

    const bodyBones = this.skeleton.bones;
    for (const mesh of skinnedMeshesOf(clone)) {
      const sourceBones = mesh.skeleton.bones;
      const geometry = mesh.geometry.clone();
      const skinIndex = geometry.getAttribute("skinIndex") as THREE.BufferAttribute;
      const remap = sourceBones.map((bone) => bodyBones.findIndex((b) => b.name === bone.name));
      for (let i = 0; i < skinIndex.count; i++) {
        for (let k = 0; k < 4; k++) {
          const target = remap[skinIndex.getComponent(i, k)];
          skinIndex.setComponent(i, k, target !== undefined && target >= 0 ? target : 0);
        }
      }
      skinIndex.needsUpdate = true;

      const materials = materialsOf(mesh).map((m) => m.clone());
      const skinned = new THREE.SkinnedMesh(geometry, materials.length === 1 ? materials[0] : materials);
      skinned.name = mesh.name;
      skinned.frustumCulled = false;
      skinned.castShadow = true;
      skinned.receiveShadow = true;
      for (const material of materials) {
        material.side = THREE.DoubleSide;
        material.alphaTest = Math.max(material.alphaTest, 0.35);
        material.transparent = false;
      }
      skinned.bind(this.skeleton, this.bodyMesh.bindMatrix);
      group.add(skinned);
    }
    this.bodyScene.add(group);
    return group;
  }

  play(name: string, fade = 0.25): boolean {
    const clip = this.clips.get(name);
    if (!clip || !this.mixer) return false;
    const next = this.mixer.clipAction(clip);
    next.reset().setEffectiveWeight(1).play();
    if (this.currentAction && this.currentAction !== next) this.currentAction.crossFadeTo(next, fade, false);
    this.currentAction = next;
    return true;
  }

  stop(): void {
    this.mixer?.stopAllAction();
    this.currentAction = null;
  }

  setSpeed(speed: number): void {
    if (this.mixer) this.mixer.timeScale = speed;
  }

  update(delta: number): void {
    this.mixer?.update(delta);
  }

  dispose(): void {
    this.loadToken++;
    this.mixer?.stopAllAction();
    this.root.clear();
  }
}
