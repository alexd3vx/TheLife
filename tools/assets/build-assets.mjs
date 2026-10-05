// Turns raw CC0 source packs (assets-src/) into game-ready, compressed glTF in
// apps/client/public/assets/, and writes manifest.json describing every asset.
// Run `bash tools/assets/fetch-all.sh` first. Usage: pnpm --filter @thelife/asset-tools build
import { Logger, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, reorder, resample, textureCompress } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUDGETS, CREDITS, FURNITURE, HAIR, OUTFITS, OUTFIT_PARTS, VEHICLES } from "./sources.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = join(root, "assets-src");
const OUT = join(root, "apps/client/public/assets");
const STAGE = join(root, "assets-src/.stage");

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .setLogger(new Logger(Logger.Verbosity.WARN))
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

const manifest = { generatedAt: new Date().toISOString(), credits: CREDITS, budgets: BUDGETS, outfits: {}, assets: [] };

function ensure(dir) {
  mkdirSync(dir, { recursive: true });
}

function stats(doc) {
  const rootDoc = doc.getRoot();
  let triangles = 0;
  for (const mesh of rootDoc.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      triangles += (idx ? idx.getCount() : prim.getAttribute("POSITION").getCount()) / 3;
    }
  }
  return {
    triangles: Math.round(triangles),
    materials: rootDoc.listMaterials().length,
    textures: rootDoc.listTextures().length,
    joints: rootDoc.listSkins().reduce((n, s) => n + s.listJoints().length, 0),
    animations: rootDoc.listAnimations().length,
    clipNames: rootDoc.listAnimations().map((a) => a.getName()),
  };
}

async function write(doc, category, id, outPath, extra = {}) {
  ensure(dirname(outPath));
  await io.write(outPath, doc);
  const bytes = statSync(outPath).size;
  const record = {
    id,
    category,
    file: outPath.slice(OUT.length + 1),
    bytes,
    ...stats(doc),
    ...extra,
  };
  manifest.assets.push(record);
  console.log(`${category.padEnd(10)} ${id.padEnd(28)} ${(bytes / 1024).toFixed(0).padStart(6)} KB  ${String(record.triangles).padStart(6)} tris`);
}

// Skinned parts (bodies, hair) must keep raw float positions: quantization hides its decompression scale in the
// skeleton's inverse-bind matrices, and we re-bind hair to the body's skeleton at runtime.
async function optimise(doc, { textureSize = 1024, quality = 80, skinned = false } = {}) {
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  await doc.transform(
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [textureSize, textureSize], quality }),
  );
  if (skinned) {
    await doc.transform(reorder({ encoder: MeshoptEncoder, target: "size" }));
    doc
      .createExtension(EXTMeshoptCompression)
      .setRequired(true)
      .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  } else {
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  }
}

// The Quaternius glTF files reference a couple of textures with a "_png" suffix that the pack does not ship.
function stageCharacterFolder(srcDir) {
  rmSync(STAGE, { recursive: true, force: true });
  ensure(STAGE);
  for (const file of readdirSync(srcDir)) copyFileSync(join(srcDir, file), join(STAGE, file));
  for (const name of ["T_Hair_1_Normal", "T_Eye_Normal"]) {
    if (!existsSync(join(STAGE, `${name}_png.png`)) && existsSync(join(STAGE, `${name}.png`))) {
      copyFileSync(join(STAGE, `${name}.png`), join(STAGE, `${name}_png.png`));
    }
  }
}

// ---------------------------------------------------------------- characters
const baseDir = join(SRC, "quaternius/base-characters/extracted/Universal Base Characters[Standard]");
const bodiesDir = join(baseDir, "Base Characters/Godot - UE");
const hairDir = join(baseDir, "Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)");
const textureDir = join(baseDir, "Base Characters/Textures");

if (!existsSync(bodiesDir)) {
  console.error("Missing assets-src. Run: bash tools/assets/fetch-all.sh");
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });

stageCharacterFolder(bodiesDir);
for (const sex of ["Male", "Female"]) {
  const doc = await io.read(join(STAGE, `Superhero_${sex}_FullBody.gltf`));
  await optimise(doc, { textureSize: 1024, skinned: true });
  await write(doc, "character", `body_${sex.toLowerCase()}`, join(OUT, `characters/body_${sex.toLowerCase()}.glb`), {
    label: `${sex} base (Superhero proportions)`,
    credit: "quaternius-ubc",
  });
}

// Light skin maps. The body files ship the dark map; the lab multiplies the light map by a tone to reach other skin tones.
for (const [sex, file] of [["male", "T_Superhero_Male_Ligh.png"], ["female", "T_Superhero_Female_Light_BaseColor.png"]]) {
  ensure(join(OUT, "characters"));
  const target = join(OUT, `characters/skin_${sex}_light.webp`);
  await sharp(join(textureDir, file)).resize(1024, 1024).webp({ quality: 82 }).toFile(target);
  manifest.assets.push({ id: `skin_${sex}_light`, category: "texture", file: `characters/skin_${sex}_light.webp`, bytes: statSync(target).size, credit: "quaternius-ubc" });
}

stageCharacterFolder(hairDir);
for (const hair of HAIR) {
  const doc = await io.read(join(STAGE, `${hair.file}.gltf`));
  await optimise(doc, { textureSize: 1024, skinned: true });
  await write(doc, "hair", hair.id, join(OUT, `hair/${hair.id}.glb`), { label: hair.label, slot: hair.slot, credit: "quaternius-ubc" });
}
rmSync(STAGE, { recursive: true, force: true });

// ---------------------------------------------------------------- clothing
{
  const outfitRoot = join(SRC, "quaternius/outfits/extracted/Modular Character Outfits - Fantasy[Standard]");
  const partsDir = join(outfitRoot, "Exports/glTF (Godot-Unreal)/Modular Parts");
  const texDir = join(outfitRoot, "Textures");
  if (existsSync(partsDir)) {
    // Shared textures, one set per outfit.
    for (const [outfitId, outfit] of Object.entries(OUTFITS)) {
      const folder = join(texDir, outfit.texturePrefix);
      ensure(join(OUT, "clothing"));
      const save = async (srcName, outName, quality) => {
        const target = join(OUT, `clothing/${outName}.webp`);
        await sharp(join(folder, srcName)).resize(1024, 1024).webp({ quality }).toFile(target);
        manifest.assets.push({ id: outName, category: "texture", file: `clothing/${outName}.webp`, bytes: statSync(target).size, credit: "quaternius-outfits" });
      };
      for (const variant of outfit.variants) await save(variant.baseColor, `tex_${outfitId}_${variant.id}_base`, 82);
      // Neutral (greyscale, rebalanced) copy of the first colour set. The game multiplies it by any colour,
      // so one texture gives every garment colour while keeping the stitching, folds and straps.
      {
        const target = join(OUT, `clothing/tex_${outfitId}_gray_base.webp`);
        await sharp(join(folder, outfit.variants[0].baseColor))
          .resize(1024, 1024)
          .greyscale()
          .linear(3.3, 0) // the pack's atlas is dark (mean ~56/255); lifts it so tinted colours read true
          .webp({ quality: 85 })
          .toFile(target);
        manifest.assets.push({ id: `tex_${outfitId}_gray_base`, category: "texture", file: `clothing/tex_${outfitId}_gray_base.webp`, bytes: statSync(target).size, credit: "quaternius-outfits" });
      }
      await save(outfit.normal, `tex_${outfitId}_normal`, 92);
      await save(outfit.orm, `tex_${outfitId}_orm`, 88);
      manifest.outfits[outfitId] = { label: outfit.label, variants: outfit.variants.map((v) => ({ id: v.id, label: v.label })) };
    }

    // Parts. We drop the pack's bare-skin pieces (hands/forearms in a different skin) and keep our own body there.
    stageCharacterFolder(partsDir);
    for (const file of readdirSync(partsDir).filter((f) => f.endsWith(".gltf")).sort()) {
      const name = basename(file, ".gltf"); // e.g. Male_Peasant_Body
      const [sexRaw, outfitRaw, ...rest] = name.split("_");
      const outfitId = outfitRaw.toLowerCase();
      const partName = `_${rest.join("_")}`;
      const part = OUTFIT_PARTS.find((p) => p.match.test(partName));
      if (!OUTFITS[outfitId] || !part) {
        console.warn(`  skipping clothing file ${file}`);
        continue;
      }
      const doc = await io.read(join(STAGE, file));
      const rootDoc = doc.getRoot();
      for (const mesh of rootDoc.listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
          if (/^MI_Regular/i.test(prim.getMaterial()?.getName() ?? "")) prim.dispose();
        }
      }
      for (const material of rootDoc.listMaterials()) {
        material.setBaseColorTexture(null).setNormalTexture(null).setMetallicRoughnessTexture(null);
      }
      await doc.transform(prune());
      await optimise(doc, { skinned: true });
      const sex = sexRaw.toLowerCase();
      await write(doc, "clothing", `${sex}_${outfitId}_${part.slot}`, join(OUT, `clothing/${sex}_${outfitId}_${part.slot}.glb`), {
        label: `${OUTFITS[outfitId].label} ${part.label.toLowerCase()}`,
        slot: part.slot,
        outfit: outfitId,
        sex,
        credit: "quaternius-outfits",
      });
    }
    rmSync(STAGE, { recursive: true, force: true });
  } else {
    console.warn("Outfits pack not found in assets-src; skipping clothing. Run fetch-all.sh");
  }
}

// ---------------------------------------------------------------- animations
{
  const animDir = join(SRC, "quaternius/animation-library/extracted/Universal Animation Library[Standard]/Unreal-Godot");
  const doc = await io.read(join(animDir, "UAL1_Standard.glb"));
  // Keep only the skeleton nodes and clips; the mannequin mesh is not needed.
  for (const node of doc.getRoot().listNodes()) {
    if (node.getMesh()) node.setMesh(null);
    if (node.getSkin()) node.setSkin(null);
  }
  for (const mesh of doc.getRoot().listMeshes()) mesh.dispose();
  for (const skin of doc.getRoot().listSkins()) skin.dispose();
  for (const material of doc.getRoot().listMaterials()) material.dispose();
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  await doc.transform(resample(), prune({ keepLeaves: true }), dedup());
  await write(doc, "animation", "ual1", join(OUT, "animations/ual1.glb"), { label: "Universal Animation Library (standard)", credit: "quaternius-ual" });
}

// ---------------------------------------------------------------- props + vehicles
async function copyKit(kitDir, items, category, outSub, credit) {
  for (const item of items) {
    const file = join(kitDir, `${item.file}.glb`);
    if (!existsSync(file)) {
      console.warn(`  missing ${item.file}`);
      continue;
    }
    const doc = await io.read(file);
    await optimise(doc, { textureSize: 512, quality: 78 });
    await write(doc, category, item.id, join(OUT, `${outSub}/${item.id}.glb`), { label: item.label, group: item.group, credit });
  }
}

await copyKit(join(SRC, "kenney/furniture-kit/extracted/Models/GLTF format"), FURNITURE, "furniture", "props", "kenney-furniture");
await copyKit(join(SRC, "kenney/car-kit/extracted/Models/GLB format"), VEHICLES, "vehicle", "vehicles", "kenney-cars");

// ---------------------------------------------------------------- budgets + manifest
let failures = 0;
for (const asset of manifest.assets) {
  const budget = BUDGETS[asset.category];
  if (!budget) continue;
  const problems = [];
  if (budget.maxTriangles && asset.triangles > budget.maxTriangles) problems.push(`triangles ${asset.triangles} > ${budget.maxTriangles}`);
  if (budget.maxBytes && asset.bytes > budget.maxBytes) problems.push(`size ${asset.bytes} > ${budget.maxBytes}`);
  if (problems.length) {
    failures++;
    asset.budgetProblems = problems;
    console.error(`BUDGET ${asset.id}: ${problems.join(", ")}`);
  }
}

writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
const totalBytes = manifest.assets.reduce((n, a) => n + a.bytes, 0);
console.log(`\n${manifest.assets.length} assets, ${(totalBytes / 1e6).toFixed(1)} MB total, ${failures} over budget`);
if (failures) process.exitCode = 1;
