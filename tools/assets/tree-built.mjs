import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
for (const id of process.argv.slice(2)) {
  const doc = await io.read(`../../apps/client/public/assets/props/real/${id}.glb`);
  const names = [];
  const walk = (n) => { names.push(n.getName() || "(unnamed)"); n.listChildren().forEach(walk); };
  doc.getRoot().listScenes()[0].listChildren().forEach(walk);
  console.log(id, "->", names.slice(0, 40).join(", "));
}
