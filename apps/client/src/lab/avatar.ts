import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { assetUrl, type AssetManifest, type AssetRecord } from "./manifest";
import { loadGLTF, loadGltfTexture } from "./loaders";
import { CLOTH_COLORS, EYE_COLORS, HAIR_COLORS, SKIN_TONES, isRealistic, sexOf, type Look } from "./looks";
import { STYLISED_HEAD_BOX, headBox, readBodyRest, type BodyRest } from "./procedural/bodyRest";
import { fabricTexture, type FabricId } from "./procedural/fabrics";
import { buildGarment, isProceduralGarment } from "./procedural/garments";
import { buildHair } from "./procedural/hair";
import { hairTexture } from "./procedural/hairTextures";
import { skinTextures } from "./procedural/skinTexture";
import { buildLifeClips } from "./procedural/lifeClips";

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
  private libraryClips = new Map<string, THREE.AnimationClip>();
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
    // The skin is the biggest skinned mesh (the rest are eyes and brows).
    this.bodyMesh = meshes.reduce<THREE.SkinnedMesh | null>((best, m) => (!best || m.geometry.getAttribute("position").count > best.geometry.getAttribute("position").count ? m : best), null);
    this.skeleton = this.bodyMesh?.skeleton ?? null;
    this.builtInBrows = meshes.filter((m) => materialsOf(m).some((mat) => /hair/i.test(mat.name)));
    for (const mesh of meshes) {
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    this.prepareBodyMask();
    this.eyelids = [];
    if (isRealistic(this.look.body)) this.buildEyelids();

    this.mixer = new THREE.AnimationMixer(this.bodyScene);
    this.currentAction = null;
    this.lookBones = null;

    await this.applySkin();
    this.applyEyes();
    this.applyBuiltInBrows();
    await this.syncParts();
    if (token !== this.loadToken) return;
    this.addLifeClips();
    if (wasPlaying) this.play(wasPlaying, 0);
  }

  private async loadAnimations(): Promise<void> {
    const gltf = await loadGLTF(assetUrl(this.asset("ual1").file));
    this.libraryClips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
    for (const clip of gltf.animations) this.clips.set(clip.name, clip);
    this.addLifeClips();
  }

  /** Everyday-life clips (sleep, eat, type...) are built against this body's bind pose. */
  private addLifeClips(): void {
    if (!this.bodyScene || !this.skeleton || this.libraryClips.size === 0) return;
    const bones = new Map<string, THREE.Bone>(this.skeleton.bones.map((b) => [b.name, b]));
    const playing = this.currentAction?.getClip().name;
    for (const clip of buildLifeClips({ root: this.bodyScene, bones }, this.libraryClips)) this.clips.set(clip.name, clip);
    if (playing) this.play(playing, 0);
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
    if (isRealistic(this.look.body)) {
      // No photo texture: the skin tone is the colour, with a fine procedural surface on top.
      const detail = skinTextures();
      const body = this.bodyMesh;
      if (body) {
        for (const material of materialsOf(body)) {
          material.map = detail.map;
          material.normalMap = detail.normal;
          material.normalScale.set(0.35, 0.35);
          material.color.set(tone.base);
          material.roughness = 0.62;
          material.metalness = 0;
          material.needsUpdate = true;
        }
      }
      return;
    }
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
      if (/eye/i.test(material.name)) material.color.set(isRealistic(this.look.body) ? "#ffffff" : swatch.color);
    });
    if (isRealistic(this.look.body)) this.paintRealisticEyes(swatch.color);
  }

  /** The realistic eyes mark their iris and pupil in vertex colours; paint them white, the chosen iris colour and near-black. */
  private paintRealisticEyes(irisColour: string): void {
    const iris = new THREE.Color(irisColour === "#ffffff" ? "#5a3a22" : irisColour).multiplyScalar(0.8);
    const sclera = new THREE.Color("#ece8e2");
    const pupil = new THREE.Color("#0b0a0a");
    this.bodyScene?.traverse((child) => {
      const mesh = child as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh || !materialsOf(mesh).some((m) => /eye/i.test(m.name))) return;
      const geometry = mesh.geometry;
      const mask = (geometry.userData.eyeMask as Float32Array | undefined) ?? (() => {
        const source = geometry.getAttribute("color") as THREE.BufferAttribute;
        const copy = new Float32Array(source.count * 2);
        for (let i = 0; i < source.count; i++) {
          copy[i * 2] = source.getX(i);
          copy[i * 2 + 1] = source.getY(i);
        }
        geometry.userData.eyeMask = copy;
        return copy;
      })();
      const count = mask.length / 2;
      const colours = new Float32Array(count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < count; i++) {
        c.copy(sclera);
        if (mask[i * 2]! > 0.5) c.copy(iris);
        if (mask[i * 2 + 1]! > 0.5) c.copy(pupil);
        colours[i * 3] = c.r;
        colours[i * 3 + 1] = c.g;
        colours[i * 3 + 2] = c.b;
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
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

    // Garments cut from the body also say exactly which body triangles lie wholly beneath them.
    const covered = new Set<number>();
    for (const part of this.partRoots.values()) {
      const triangles = part.userData.coveredTriangles as Set<number> | undefined;
      if (triangles) for (const id of triangles) covered.add(id);
    }

    const source = this.originalIndex;
    const kept: number[] = [];
    for (let i = 0; i < source.length; i += 3) {
      const a = source[i]!;
      const b = source[i + 1]!;
      const c = source[i + 2]!;
      const isHidden = covered.has(i / 3) || (hidden.has(this.vertexBone[a]!) && hidden.has(this.vertexBone[b]!) && hidden.has(this.vertexBone[c]!));
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
      if (kind === "hair" && isRealistic(this.look.body)) this.fitHairToHead(geometry);
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

  /**
   * The Quaternius hairstyles were modelled around the stylised head. Moves and scales one onto the realistic head
   * (box to box, a little larger so tight caps such as the buzz cut cover the scalp instead of sinking into it).
   */
  private fitHairToHead(geometry: THREE.BufferGeometry): void {
    const target = this.bodyRest ? headBox(this.bodyRest) : null;
    if (!target) return;
    const source = STYLISED_HEAD_BOX[sexOf(this.look.body)];
    const sourceSize = source.getSize(new THREE.Vector3());
    const targetSize = target.getSize(new THREE.Vector3());
    const scale = new THREE.Vector3(targetSize.x / sourceSize.x, targetSize.y / sourceSize.y, targetSize.z / sourceSize.z).multiplyScalar(1.05);
    const from = source.getCenter(new THREE.Vector3());
    const to = target.getCenter(new THREE.Vector3());
    const matrix = new THREE.Matrix4().makeTranslation(to.x, to.y, to.z).multiply(new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z)).multiply(new THREE.Matrix4().makeTranslation(-from.x, -from.y, -from.z));
    geometry.applyMatrix4(matrix);
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
    group.userData.coveredTriangles = result.coveredTriangles;
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
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = false;
    next.reset().setEffectiveWeight(1).play();
    if (this.currentAction && this.currentAction !== next) this.currentAction.crossFadeTo(next, fade, false);
    this.currentAction = next;
    return true;
  }

  /** Length of a clip in seconds (0 if there is none). */
  clipDuration(name: string): number {
    return this.clips.get(name)?.duration ?? 0;
  }

  /** Plays a clip once and holds its last pose. Returns its length in seconds (0 if the clip doesn't exist). */
  playOnce(name: string, fade = 0.12): number {
    const clip = this.clips.get(name);
    if (!clip || !this.mixer) return 0;
    const next = this.mixer.clipAction(clip);
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
    next.reset().setEffectiveWeight(1).play();
    if (this.currentAction && this.currentAction !== next) this.currentAction.crossFadeTo(next, fade, false);
    this.currentAction = next;
    return clip.duration;
  }

  /**
   * How far below the character's origin the lowest point of the body sits when a clip is posed at `time` seconds
   * (negative = below). Used to rest a lying body exactly on a mattress without hand-tuned offsets.
   */
  lowestPoint(name: string, time = 0.5): number | null {
    const clip = this.clips.get(name);
    if (!clip || !this.bodyScene) return null;
    // Start from the bind pose: bones this clip has no tracks for (the sleeping clip drops the legs) must not keep whatever
    // pose the playing clip left them in, or the measurement describes a body that never exists.
    this.skeleton?.pose();
    const mixer = new THREE.AnimationMixer(this.bodyScene);
    const action = mixer.clipAction(clip);
    action.play();
    action.time = Math.min(time, clip.duration);
    mixer.update(0);
    this.root.updateMatrixWorld(true);
    const heights: number[] = [];
    const point = new THREE.Vector3();
    this.root.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh) return;
      mesh.skeleton.update();
      const position = mesh.geometry.getAttribute("position");
      for (let i = 0; i < position.count; i += 2) {
        mesh.getVertexPosition(i, point);
        point.applyMatrix4(mesh.matrixWorld);
        heights.push(point.y);
      }
    });
    // The 3rd percentile, not the very lowest vertex: heels and fingertips dip below the back that carries the weight.
    heights.sort((a, b) => a - b);
    const lowest = heights.length ? heights[Math.floor(heights.length * 0.03)]! : Infinity;
    action.stop();
    mixer.uncacheRoot(this.bodyScene);
    return Number.isFinite(lowest) ? lowest - this.root.position.y : null;
  }

  /** Where the body is right now in the world: lowest skin point and a few joints (for checking poses on furniture). */
  worldStats(): { lowest: number; head: number; pelvis: number; foot: number; hand: number } | null {
    if (!this.bodyMesh || !this.skeleton) return null;
    this.root.updateMatrixWorld(true);
    const mesh = this.bodyMesh;
    mesh.skeleton.update();
    const position = mesh.geometry.getAttribute("position");
    const point = new THREE.Vector3();
    const heights: number[] = [];
    for (let i = 0; i < position.count; i += 2) {
      mesh.getVertexPosition(i, point);
      point.applyMatrix4(mesh.matrixWorld);
      heights.push(point.y);
    }
    heights.sort((a, b) => a - b);
    const y = (name: string) => this.skeleton!.bones.find((b) => b.name === name)?.getWorldPosition(new THREE.Vector3()).y ?? NaN;
    return { lowest: heights[Math.floor(heights.length * 0.03)]!, head: y("Head"), pelvis: y("pelvis"), foot: y("foot_l"), hand: y("hand_l") };
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
    this.applyLook(delta);
    this.applyBlink(delta);
  }

  // ------------------------------------------------------------------ blinking

  private eyelids: THREE.Group[] = [];
  private blinkClock = 0;
  private nextBlinkAt = 2.5;

  /**
   * Skin-coloured upper eyelids over the realistic eyes. Each is a spherical cap just larger than the eyeball, riding on
   * the head bone, that swings down over the eye for a blink. The bodies have no eyelid geometry or face morphs, so this
   * is what makes the eyes blink at all.
   */
  private buildEyelids(): void {
    const rest = this.bodyRest;
    const body = this.bodyMesh;
    const headBone = this.skeleton?.bones.find((b) => b.name === "Head");
    const toHead = rest?.toBoneSpace("Head");
    if (!rest || !body || !headBone || !toHead || !this.bodyScene) return;
    const material = materialsOf(body)[0];
    if (!material) return;

    this.bodyScene.traverse((child) => {
      const mesh = child as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh || !materialsOf(mesh).some((m) => /eye/i.test(m.name))) return;
      mesh.geometry.computeBoundingSphere();
      const sphere = mesh.geometry.boundingSphere!;
      const centre = sphere.center.clone().applyMatrix4(toHead);
      // Eye axes (forward = +Z, up = +Y in the mesh's own space) expressed in the head bone's space.
      const basis = new THREE.Matrix4().extractRotation(toHead);
      const forward = new THREE.Vector3(0, 0, 1).applyMatrix4(basis).normalize();
      const up = new THREE.Vector3(0, 1, 0).applyMatrix4(basis).normalize();
      const right = new THREE.Vector3().crossVectors(up, forward).normalize();
      const pivot = new THREE.Group();
      pivot.matrix.makeBasis(right, up, forward).setPosition(centre);
      pivot.matrixAutoUpdate = false;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(sphere.radius * 1.07, 20, 12, 0, Math.PI * 2, 0, THREE.MathUtils.degToRad(72)), material);
      cap.castShadow = false;
      cap.rotation.x = THREE.MathUtils.degToRad(-25); // open: the cap rests up and back, clear of the iris
      pivot.add(cap);
      headBone.add(pivot);
      this.eyelids.push(pivot);
    });
  }

  private applyBlink(delta: number): void {
    if (!this.eyelids.length) return;
    this.blinkClock += delta;
    let closed = 0;
    if (this.blinkClock >= this.nextBlinkAt) {
      const t = this.blinkClock - this.nextBlinkAt;
      closed = t < 0.07 ? t / 0.07 : t < 0.19 ? 1 - (t - 0.07) / 0.12 : 0;
      if (t >= 0.19) {
        this.blinkClock = 0;
        this.nextBlinkAt = 2 + Math.random() * 4.5;
      }
    }
    const angle = THREE.MathUtils.degToRad(-25 + 70 * closed);
    for (const pivot of this.eyelids) (pivot.children[0] as THREE.Mesh).rotation.x = angle;
  }

  // ------------------------------------------------------------------ looking

  private lookTarget: THREE.Vector3 | null = null;
  private lookYaw = 0;
  private lookPitch = 0;
  private lookBones: { neck: THREE.Bone; head: THREE.Bone } | null = null;

  /** Makes the head (and a little of the neck) turn toward a world point. Null looks straight ahead. */
  setLookTarget(point: THREE.Vector3 | null): void {
    this.lookTarget = point ? point.clone() : null;
  }

  /** Turns the neck and head toward the look target on top of whatever the clip is doing. Runs after the animation. */
  private applyLook(delta: number): void {
    if (!this.skeleton) return;
    if (!this.lookBones) {
      const neck = this.skeleton.bones.find((b) => b.name === "neck_01");
      const head = this.skeleton.bones.find((b) => b.name === "Head");
      if (!neck || !head) return;
      this.lookBones = { neck, head };
    }
    const { neck, head } = this.lookBones;
    const bodyYaw = this.root.rotation.y;

    let yawGoal = 0;
    let pitchGoal = 0;
    if (this.lookTarget) {
      this.root.updateMatrixWorld(true);
      const from = head.getWorldPosition(new THREE.Vector3());
      const dir = this.lookTarget.clone().sub(from);
      const horizontal = Math.hypot(dir.x, dir.z);
      if (horizontal > 0.05) {
        let yaw = Math.atan2(dir.x, dir.z) - bodyYaw;
        yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
        yawGoal = THREE.MathUtils.clamp(yaw, -1.1, 1.1); // about 63 degrees each way
        pitchGoal = THREE.MathUtils.clamp(Math.atan2(-dir.y, horizontal), -0.4, 0.5);
      }
    }
    const k = 1 - Math.exp(-7 * delta);
    this.lookYaw += (yawGoal - this.lookYaw) * k;
    this.lookPitch += (pitchGoal - this.lookPitch) * k;
    if (Math.abs(this.lookYaw) < 0.003 && Math.abs(this.lookPitch) < 0.003) return;

    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3(Math.cos(bodyYaw), 0, -Math.sin(bodyYaw));
    const turn = (bone: THREE.Bone, share: number) => {
      const parent = bone.parent;
      if (!parent) return;
      parent.updateWorldMatrix(true, false);
      const parentQ = parent.getWorldQuaternion(new THREE.Quaternion());
      const worldQ = parentQ.clone().multiply(bone.quaternion);
      const delta = new THREE.Quaternion()
        .setFromAxisAngle(up, this.lookYaw * share)
        .multiply(new THREE.Quaternion().setFromAxisAngle(right, this.lookPitch * share));
      bone.quaternion.copy(parentQ.invert().multiply(delta.multiply(worldQ)));
      bone.updateMatrixWorld(true);
    };
    turn(neck, 0.4);
    turn(head, 0.6);
  }

  dispose(): void {
    this.loadToken++;
    this.mixer?.stopAllAction();
    this.root.clear();
  }
}
