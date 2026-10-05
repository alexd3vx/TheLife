// Prints bounding boxes (in the file's own units) so parts from different packs can be compared for fit.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const file of process.argv.slice(2)) {
  const doc = await io.read(file);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute("POSITION");
    for (let i = 0; i < pos.getCount(); i++) { const v = pos.getElement(i, []); for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); } }
    tris += (p.getIndices()?.getCount() ?? pos.getCount()) / 3;
  }
  const f = (a) => a.map((n) => n.toFixed(2)).join(", ");
  console.log(file.split("/").pop().padEnd(34), "min", f(min), "| max", f(max), "| tris", tris, "| skins", doc.getRoot().listSkins().length);
}
