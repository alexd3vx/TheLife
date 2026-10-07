// Builds the extra animation libraries (real, hand-authored clips by Quaternius and Kay Lousberg, both CC0) into small glTF files that
// hold only skeleton + chosen clips, and records them in manifest.json. Run after tools/assets/fetch-all.sh. Usage: node build-animations.mjs
import { Logger, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, resample } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CREDITS } from "./sources.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = join(root, "assets-src");
const OUT = join(root, "apps/client/public/assets");
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

const PACKS = [
  { id: "mixamo_xbot", credit: "mixamo-soldier", file: join(SRC, "mixamo/Xbot.glb"), keep: ["agree", "headShake", "idle", "run", "sad_pose", "sneak_pose", "walk"] },
  { id: "mixamo_soldier", credit: "mixamo-soldier", file: join(SRC, "mixamo/Soldier.glb"), keep: ["TPose", "Idle", "Walk", "Run"] },
  {
    id: "ual2",
    credit: "quaternius-ual2",
    file: join(SRC, "quaternius/animation-library-2/extracted/Unreal-Godot/UAL2_Standard.glb"),
    keep: ["A_TPose", "Consume", "Idle_TalkingPhone_Loop", "Idle_FoldArms_Loop", "Farm_Watering", "LayToIdle"],
  },
  { id: "kaykit_sim", credit: "kaykit-animations", file: join(SRC, "kaykit/animations/extracted/Animations/gltf/Rig_Medium/Rig_Medium_Simulation.glb"), keep: ["T-Pose", "Lie_Down", "Lie_Idle", "Lie_StandUp", "Sit_Chair_Down", "Sit_Chair_Idle", "Sit_Chair_StandUp", "Waving", "Cheering"] },
  { id: "kaykit_general", credit: "kaykit-animations", file: join(SRC, "kaykit/animations/extracted/Animations/gltf/Rig_Medium/Rig_Medium_General.glb"), keep: ["Idle_A", "Idle_B", "Interact", "PickUp", "Use_Item", "T-Pose"] },
  { id: "kaykit_tools", credit: "kaykit-animations", file: join(SRC, "kaykit/animations/extracted/Animations/gltf/Rig_Medium/Rig_Medium_Tools.glb"), keep: ["Work_A", "Work_B", "Work_C", "Working_A", "Working_B", "Working_C", "Holding_A", "Holding_B", "Holding_C", "Hammer", "Saw", "T-Pose"] },
  { id: "kaykit_move", credit: "kaykit-animations", file: join(SRC, "kaykit/animations/extracted/Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb"), keep: ["Walking_A", "Walking_B", "Walking_C", "Running_A", "Running_B", "T-Pose"] },
];

const manifestPath = join(OUT, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.credits = { ...manifest.credits, "quaternius-ual2": CREDITS["quaternius-ual2"], "kaykit-animations": CREDITS["kaykit-animations"], "mixamo-soldier": CREDITS["mixamo-soldier"] };
mkdirSync(join(OUT, "animations"), { recursive: true });

for (const pack of PACKS) {
  if (!existsSync(pack.file)) {
    console.warn("missing", pack.file);
    continue;
  }
  const doc = await io.read(pack.file);
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  const root0 = doc.getRoot();
  // keep the skeleton's nodes, drop meshes, skins, materials and textures; keep only the chosen clips
  for (const node of root0.listNodes()) {
    if (node.getMesh()) node.setMesh(null);
    if (node.getSkin()) node.setSkin(null);
  }
  for (const m of root0.listMeshes()) m.dispose();
  for (const s of root0.listSkins()) s.dispose();
  for (const m of root0.listMaterials()) m.dispose();
  for (const t of root0.listTextures()) t.dispose();
  for (const a of root0.listAnimations()) if (!pack.keep.includes(a.getName())) a.dispose();
  await doc.transform(resample({ tolerance: 0.0025 }), prune({ keepLeaves: true }), dedup(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const out = join(OUT, `animations/${pack.id}.glb`);
  await io.write(out, doc);
  const names = doc.getRoot().listAnimations().map((a) => a.getName());
  const record = { id: pack.id, category: "animation", file: `animations/${pack.id}.glb`, bytes: statSync(out).size, animations: names.length, clipNames: names, label: pack.id, credit: pack.credit };
  manifest.assets = manifest.assets.filter((a) => a.id !== pack.id).concat(record);
  console.log(pack.id.padEnd(16), String(Math.round(record.bytes / 1024)).padStart(6), "KB", names.join(", "));
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
