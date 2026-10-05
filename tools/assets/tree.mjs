import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { join } from "node:path";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const id of process.argv.slice(2)) {
  const doc = await io.read(join(import.meta.dirname, "../../assets-src/polyhaven", id, `${id}.gltf`));
  console.log("\n==", id, "animations:", doc.getRoot().listAnimations().map((a) => `${a.getName()}(${a.listChannels().length}ch, ${a.listChannels()[0]?.getTargetNode()?.getName()}.${a.listChannels()[0]?.getTargetPath()})`).join(", ") || "none");
  const walk = (n, d) => { console.log("  ".repeat(d) + (n.getName() || "(unnamed)") + (n.getMesh() ? ` [mesh ${n.getMesh().getName()}]` : "") + (n.getSkin() ? " [skin]" : "")); n.listChildren().forEach((c) => walk(c, d + 1)); };
  doc.getRoot().listScenes()[0].listChildren().forEach((n) => walk(n, 1));
}
