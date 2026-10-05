import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization, EXTTextureWebP } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, EXTTextureWebP]).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read("../../apps/client/public/assets/characters/body_male.glb");
for (const mesh of doc.getRoot().listMeshes()) {
  const tris = mesh.listPrimitives().reduce((n, p) => n + p.getIndices().getCount() / 3, 0);
  console.log("mesh", mesh.getName(), tris, "tris; morph targets:", mesh.listPrimitives()[0].listTargets().length, mesh.getExtras?.());
}
const skin = doc.getRoot().listSkins()[0];
console.log("joints", skin.listJoints().length, skin.listJoints().map((j) => j.getName()).join(" "));
