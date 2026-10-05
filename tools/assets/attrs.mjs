import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization, EXTTextureWebP } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, EXTTextureWebP]).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(process.argv[2]);
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  for (const p of mesh.listPrimitives()) console.log(node.getName(), mesh.getName(), p.listSemantics().join(","), "mat", p.getMaterial()?.getName(), "verts", p.getAttribute("POSITION").getCount(), "skin", !!node.getSkin());
}
console.log("scene nodes:", doc.getRoot().listScenes()[0].listChildren().map((n) => n.getName()));
