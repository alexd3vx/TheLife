import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization, EXTTextureWebP } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, EXTTextureWebP]).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
for (const f of ["body_male", "body_female", "body_realmale", "body_realfemale"]) {
  const doc = await io.read(`../../apps/client/public/assets/characters/${f}.glb`);
  let best = null;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh || !node.getSkin()) continue;
    const prim = mesh.listPrimitives()[0];
    if (!best || prim.getAttribute("POSITION").getCount() > best.prim.getAttribute("POSITION").getCount()) best = { node, prim };
  }
  const joints = best.node.getSkin().listJoints().map((j) => j.getName());
  const head = joints.indexOf("Head");
  const pos = best.prim.getAttribute("POSITION"), ji = best.prim.getAttribute("JOINTS_0"), jw = best.prim.getAttribute("WEIGHTS_0");
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9]; let n = 0;
  for (let i = 0; i < pos.getCount(); i++) {
    const idx = ji.getElement(i, []), w = jw.getElement(i, []);
    let bi = 0; for (let k = 1; k < 4; k++) if (w[k] > w[bi]) bi = k;
    if (idx[bi] !== head) continue;
    const p = pos.getElement(i, []); n++;
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  }
  console.log(f, "head verts", n, "min", min.map((v) => +v.toFixed(3)), "max", max.map((v) => +v.toFixed(3)));
}
