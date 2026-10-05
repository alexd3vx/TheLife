// Prints a quick report for glTF/GLB files: meshes, triangles, skins, morph targets, animations, textures.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { statSync } from "node:fs";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const file of process.argv.slice(2)) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  let tris = 0;
  let morphs = 0;
  const meshes = [];
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const count = idx ? idx.getCount() : prim.getAttribute("POSITION").getCount();
      tris += count / 3;
      morphs += prim.listTargets().length;
    }
    meshes.push(mesh.getName());
  }
  const joints = root.listSkins().reduce((n, s) => n + s.listJoints().length, 0);
  const textures = root.listTextures().map((t) => `${t.getName() || t.getURI()} ${t.getSize()?.join("x")}`);
  const anims = root.listAnimations().map((a) => a.getName());
  console.log(`\n${file.split("/").slice(-1)[0]}  (${(statSync(file).size / 1e6).toFixed(1)} MB)`);
  console.log(`  meshes: ${meshes.length} [${meshes.slice(0, 8).join(", ")}]  tris: ${Math.round(tris)}  skins: ${root.listSkins().length}  joints: ${joints}  morphTargets: ${morphs}`);
  console.log(`  textures: ${textures.join(" | ") || "none"}`);
  console.log(`  animations: ${anims.length}${anims.length ? " e.g. " + anims.slice(0, 6).join(", ") : ""}`);
}
