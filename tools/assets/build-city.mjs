// Bundles the Kenney City Kits (CC0) into three small glTF files for the city board: one node per building, named after the source
// file (building-a, low-detail-building-c, building-type-k ...), the shared colour palette picture stored once per bundle.
// Run `bash tools/assets/fetch-all.sh` first. Usage: node tools/assets/build-city.mjs
import { Logger, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, mergeDocuments, meshopt, prune, quantize, unpartition } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { readdirSync, statSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(root, "apps/client/public/assets/city");
mkdirSync(OUT, { recursive: true });
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().setLogger(new Logger(Logger.Verbosity.WARN)).registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

const KITS = [
  { slug: "city-kit-commercial", out: "commercial.glb", pick: (n) => /^(building-[a-n]|building-skyscraper-[a-e]|low-detail-building-.*)$/.test(n) },
  { slug: "city-kit-suburban", out: "suburban.glb", pick: (n) => /^(building-type-[a-u]|tree-large|tree-small)$/.test(n) },
  { slug: "city-kit-industrial", out: "industrial.glb", pick: (n) => /^(building-[a-t]|detail-tank|detail-tank-large|shipping-container-[abc]|chimney-(basic|large|medium|small)|water-tower)$/.test(n) },
];

for (const kit of KITS) {
  const dir = join(root, "assets-src/kenney", kit.slug, "Models/GLB format");
  const files = readdirSync(dir).filter((f) => f.endsWith(".glb") && kit.pick(f.replace(/\.glb$/, "")));
  const doc = await io.read(join(dir, files[0]));
  const scene0 = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  for (const n of scene0.listChildren()) n.setName(files[0].replace(/\.glb$/, ""));
  for (const f of files.slice(1)) {
    const src = await io.read(join(dir, f));
    const map = mergeDocuments(doc, src);
    const sc = map.get(src.getRoot().getDefaultScene() ?? src.getRoot().listScenes()[0]);
    for (const n of sc.listChildren()) {
      n.setName(f.replace(/\.glb$/, ""));
      sc.removeChild(n);
      scene0.addChild(n);
    }
    sc.dispose();
  }
  await doc.transform(dedup(), prune(), unpartition(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }), meshopt({ encoder: MeshoptEncoder, level: "high" }));
  const out = join(OUT, kit.out);
  await io.write(out, doc);
  console.log(kit.out, files.length, "models", (statSync(out).size / 1024).toFixed(0), "KB");
}
