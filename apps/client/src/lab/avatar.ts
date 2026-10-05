import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { assetUrl, type AssetManifest, type AssetRecord } from "./manifest";
import { loadGLTF, loadGltfTexture } from "./loaders";
import { CLOTH_COLORS, EYE_COLORS, HAIR_COLORS, SKIN_TONES, type Look } from "./looks";
import { readBodyRest, type BodyRest } from "./procedural/bodyRest";
import { fabricTexture, type FabricId } from "./procedural/fabrics";
import { buildGarment, isProceduralGarment } from "./procedural/garments";
import { buildHair } from "./procedural/hair";
import { hairTexture } from "./procedural/hairTextures";

/** hair/clothing come from glTF files; proc-* are generated in code from the body. */
type PartKind = "hair" | "clothing" | "proc-hair" | "proc-garment";

/** Body areas (by bone) that a garment covers; those triangles are removed from the skin mesh so skin never pokes through. */
const COVERED_BONES: Record<string, string[]> = {
  top: ["spine_01", "spine_02", "spine_03", "clavicle_l", "clavicle_r"],
  sleeves: ["upperarm_l", "upperarm_r"],
  bottom: ["pelvis", "thigh_l", "thigh_r", "calf_l", "calf_r"],
  shoes: ["foot_l", "foot_r", "ball_l", "ball_r", "ball_leaf_l", "ball_leaf_r"],
};

function skinnedMeshesOf(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((child) => {
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(child as THREE.SkinnedMesh);
  });
  return meshes;
}

function materialsOf(mesh: THREE.Mesh): THREE.MeshStandardMaterial[] {
  const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return list.filter((m): m is THREE.MeshStandardMaterial => (m as THREE.MeshStandardMaterial).isMeshStandardMaterial);
}

function eachMaterial(root: THREE.Object3D, fn: (material: THREE.MeshStandardMaterial) => void) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) for (const material of materialsOf(mesh)) fn(material);
  });
}

/**
 * A customisable, animatable person built from separate glTF parts that all share one skeleton:
 * body (skin, eyes, brows) + hair + clothing. Parts are bound to the body's skeleton by bone name,
 * so any animation clip made for that skeleton plays on every combination.
 */
export class Avatar {
  readonly root = new THREE.Group();
  private bodyScene: THREE.Object3D | null = null;
  private skeleton: THREE.Skeleton | null = null;
  private bodyMesh: THREE.SkinnedMesh | null = null;
  private originalIndex: ArrayLike<number> | null = null;
  private vertexBone: Uint16Array | null = null;
  private bodyRest: BodyRest | null = null;
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

  private find(id: string): AssetRecord | undefined {
    return this.manifest.assets.find((a) => a.id === id);
  }

  private asset(id: string): AssetRecord {
    const record = this.find(id);
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
    this.prepareBodyMask();

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
    if (patch.outfitVariant !== undefined || patch.topColor !== undefined || patch.bottomColor !== undefined || patch.shoesColor !== undefined) {
      await this.applyOutfitTextures();
      this.applyProceduralMaterials();
    }
    if (patch.topFabric !== undefined || patch.bottomFabric !== undefined) this.applyProceduralMaterials();
    await this.syncParts();
  }

  // ------------------------------------------------------------------ skin, eyes, brows

  private async applySkin(): Promise<void> {
    if (!this.bodyScene) return;
    const tone = SKIN_TONES.find((t) => t.id === this.look.skinTone) ?? SKIN_TONES[0]!;
    const lightMap = tone.map === "light" ? await loadGltfTexture(assetUrl(`characters/skin_${this.look.body}_light.webp`)) : null;
    eachMaterial(this.bodyScene, (material) => {
      if (!/superhero/i.test(material.name)) return;
      material.userData.darkMap ??= material.map;
      material.map = lightMap ?? (material.userData.darkMap as THREE.Texture | null);
      material.color.set(tone.tint);
      material.needsUpdate = true;
    });
  }

  private applyEyes(): void {
    if (!this.bodyScene) return;
    const swatch = EYE_COLORS.find((s) => s.id === this.look.eyeColor) ?? EYE_COLORS[0]!;
    eachMaterial(this.bodyScene, (material) => {
      if (/eye/i.test(material.name)) material.color.set(swatch.color);
    });
  }

  private applyBuiltInBrows(): void {
    const hidden = this.look.brows !== null;
    for (const brow of this.builtInBrows) brow.visible = !hidden;
  }

  private applyHairColor(): void {
    const swatch = HAIR_COLORS.find((s) => s.id === this.look.hairColor) ?? HAIR_COLORS[0]!;
    const tint = new THREE.Color(swatch.color);
    for (const brow of this.builtInBrows) eachMaterial(brow, (m) => m.color.copy(tint));
    for (const part of this.partRoots.values()) {
      if (part.userData.kind === "hair" || part.userData.kind === "proc-hair") eachMaterial(part, (m) => m.color.copy(tint));
    }
  }

  // ------------------------------------------------------------------ hiding covered skin

  private prepareBodyMask(): void {
    this.originalIndex = null;
    this.vertexBone = null;
    this.bodyRest = null;
    const mesh = this.bodyMesh;
    if (!mesh || !mesh.geometry.index) return;
    // The geometry is shared with the loader cache, so edit our own copy.
    mesh.geometry = mesh.geometry.clone();
    const index = mesh.geometry.index!;
    this.originalIndex = index.array.slice();

    const skinIndex = mesh.geometry.getAttribute("skinIndex") as THREE.BufferAttribute;
    const skinWeight = mesh.geometry.getAttribute("skinWeight") as THREE.BufferAttribute;
    const dominant = new Uint16Array(skinIndex.count);
    for (let v = 0; v < skinIndex.count; v++) {
      let best = 0;
      let bestWeight = -1;
      for (let k = 0; k < 4; k++) {
        const w = skinWeight.getComponent(v, k);
        if (w > bestWeight) {
          bestWeight = w;
          best = skinIndex.getComponent(v, k);
        }
      }
      dominant[v] = best;
    }
    this.vertexBone = dominant;
    this.bodyRest = readBodyRest(mesh, mesh.geometry.clone(), dominant);
  }

  private updateBodyMask(): void {
    const mesh = this.bodyMesh;
    if (!mesh || !this.skeleton || !this.originalIndex || !this.vertexBone) return;

    const hiddenBoneNames = new Set<string>();
    for (const [slot, part] of this.partRoots) {
      const covers = (part.userData.covers as string[] | undefined) ?? COVERED_BONES[slot] ?? [];
      for (const name of covers) hiddenBoneNames.add(name);
    }

    const hidden = new Set<number>();
    this.skeleton.bones.forEach((bone, i) => {
      if (hiddenBoneNames.has(bone.name)) hidden.add(i);
    });

    const source = this.originalIndex;
    const kept: number[] = [];
    for (let i = 0; i < source.length; i += 3) {
      const a = source[i]!;
      const b = source[i + 1]!;
      const c = source[i + 2]!;
      const isHidden = hidden.has(this.vertexBone[a]!) && hidden.has(this.vertexBone[b]!) && hidden.has(this.vertexBone[c]!);
      if (!isHidden) kept.push(a, b, c);
    }
    const ArrayType = source instanceof Uint32Array ? Uint32Array : Uint16Array;
    mesh.geometry.setIndex(new THREE.BufferAttribute(new ArrayType(kept), 1));
  }

  // ------------------------------------------------------------------ attached parts (hair, clothing)

  private clearParts(): void {
    for (const part of this.partRoots.values()) part.parent?.remove(part);
    this.partRoots.clear();
  }

  private wantedParts(): Record<string, { id: string; kind: PartKind } | null> {
    const { body, top, bottom, shoes, hood, pauldrons } = this.look;
    const clothing = (outfit: string | null, slot: string) => {
      if (!outfit) return null;
      if (isProceduralGarment(outfit)) return slot === "top" || slot === "bottom" || slot === "shoes" ? { id: outfit, kind: "proc-garment" as const } : null;
      const id = `${body}_${outfit}_${slot}`;
      return this.find(id) ? { id, kind: "clothing" as const } : null;
    };
    const hair = (id: string | null) => (id ? { id, kind: id.startsWith("p_") ? ("proc-hair" as const) : ("hair" as const) } : null);
    return {
      hair: hair(this.look.hair),
      facial: hair(this.look.beard ? "beard" : null),
      brows: hair(this.look.brows),
      top: clothing(top, "top"),
      sleeves: isProceduralGarment(top) ? null : clothing(top, "sleeves"),
      bottom: clothing(bottom, "bottom"),
      shoes: clothing(shoes, "shoes"),
      hood: hood ? clothing("ranger", "hood") : null,
      acc: pauldrons ? clothing("ranger", "acc") : null,
    };
  }

  /** Makes the attached parts match `look`. */
  private async syncParts(): Promise<void> {
    const wanted = this.wantedParts();
    const token = this.loadToken;
    for (const [slot, want] of Object.entries(wanted)) {
      const current = this.partRoots.get(slot);
      if (current && current.userData.assetId === want?.id) continue;
      if (current) {
        current.parent?.remove(current);
        this.partRoots.delete(slot);
      }
      if (!want) continue;
      const part = await this.buildPart(want.id, want.kind);
      if (token !== this.loadToken || !part) return;
      this.partRoots.set(slot, part);
    }
    this.applyHairColor();
    await this.applyOutfitTextures();
    this.applyProceduralMaterials();
    this.updateBodyMask();
  }

  private async buildPart(id: string, kind: PartKind): Promise<THREE.Object3D | null> {
    if (!this.skeleton || !this.bodyMesh || !this.bodyScene) return null;
    if (kind === "proc-hair") return this.buildProceduralHair(id);
    if (kind === "proc-garment") return this.buildProceduralGarment(id);
    const record = this.asset(id);
    const gltf = await loadGLTF(assetUrl(record.file));
    const clone = SkeletonUtils.clone(gltf.scene);
    const group = new THREE.Group();
    group.userData.assetId = id;
    group.userData.kind = kind;
    group.userData.outfit = record.outfit;
    group.userData.slot = record.slot;

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
        if (kind === "hair") {
          material.alphaTest = Math.max(material.alphaTest, 0.35);
          material.transparent = false;
        }
      }
      skinned.bind(this.skeleton, this.bodyMesh.bindMatrix);
      group.add(skinned);
    }
    this.bodyScene.add(group);
    return group;
  }

  /** Hair generated in code and attached rigidly to the head bone. */
  private buildProceduralHair(id: string): THREE.Object3D | null {
    const rest = this.bodyRest;
    const headBone = this.skeleton?.bones.find((b) => b.name === "Head");
    if (!rest || !headBone) return null;
    const result = buildHair(rest, id);
    if (!result) return null;
    const material = new THREE.MeshStandardMaterial({
      map: hairTexture(result.texture, result.repeat),
      roughness: result.texture === "wrap" ? 0.7 : 0.95,
      side: THREE.DoubleSide,
    });
    material.bumpMap = material.map;
    material.bumpScale = result.texture === "wrap" ? 0.6 : 2.5;
    const mesh = new THREE.Mesh(result.geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const group = new THREE.Group();
    group.userData.assetId = id;
    group.userData.kind = "proc-hair";
    group.add(mesh);
    headBone.add(group);
    return group;
  }

  /** A garment cut from the body mesh, so it shares the body's skeleton and deforms with it. */
  private buildProceduralGarment(id: string): THREE.Object3D | null {
    if (!this.bodyRest || !this.skeleton || !this.bodyMesh || !this.bodyScene) return null;
    const result = buildGarment(this.bodyRest, id);
    if (!result) return null;
    const material = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    const skinned = new THREE.SkinnedMesh(result.geometry, material);
    skinned.frustumCulled = false;
    skinned.castShadow = true;
    skinned.receiveShadow = true;
    skinned.bind(this.skeleton, this.bodyMesh.bindMatrix);
    const group = new THREE.Group();
    group.userData.assetId = id;
    group.userData.kind = "proc-garment";
    group.userData.slot = result.slot;
    group.userData.covers = result.covers;
    group.add(skinned);
    this.bodyScene.add(group);
    return group;
  }

  /** Fabric pattern and colour for procedural garments. */
  private applyProceduralMaterials(): void {
    for (const part of this.partRoots.values()) {
      if (part.userData.kind !== "proc-garment") continue;
      const slot = part.userData.slot as string;
      const fabric = (slot === "bottom" ? this.look.bottomFabric : slot === "top" ? this.look.topFabric : "plain") as FabricId;
      const colour = CLOTH_COLORS.find((c) => c.id === this.colourFor(slot));
      const texture = fabricTexture(fabric);
      eachMaterial(part, (material) => {
        material.map = texture;
        material.color.set(colour?.color ?? "#ffffff");
        material.needsUpdate = true;
      });
    }
  }

  /** Which colour setting a garment slot follows. Sleeves, hood and shoulder guards match the top. */
  private colourFor(slot: string | undefined): string | null {
    const { topColor, bottomColor, shoesColor } = this.look;
    if (slot === "bottom") return bottomColor;
    if (slot === "shoes") return shoesColor;
    return topColor;
  }

  /** Clothing is shipped without textures; each outfit's shared texture set is applied here. */
  private async applyOutfitTextures(): Promise<void> {
    const variant = this.look.outfitVariant;
    for (const part of this.partRoots.values()) {
      if (part.userData.kind !== "clothing") continue;
      const outfit = part.userData.outfit as string | undefined;
      if (!outfit) continue;
      const colour = CLOTH_COLORS.find((c) => c.id === this.colourFor(part.userData.slot as string | undefined));
      const [base, normal, orm] = await Promise.all([
        loadGltfTexture(assetUrl(`clothing/tex_${outfit}_${colour ? "gray" : variant}_base.webp`)),
        loadGltfTexture(assetUrl(`clothing/tex_${outfit}_normal.webp`), THREE.NoColorSpace),
        loadGltfTexture(assetUrl(`clothing/tex_${outfit}_orm.webp`), THREE.NoColorSpace),
      ]);
      eachMaterial(part, (material) => {
        material.map = base;
        material.color.set(colour?.color ?? "#ffffff");
        material.normalMap = normal;
        material.roughnessMap = orm;
        material.metalnessMap = orm;
        material.roughness = 1;
        material.metalness = 1;
        material.needsUpdate = true;
      });
    }
  }

  // ------------------------------------------------------------------ animation

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
