import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { readdirSync } from "node:fs";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization]).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const dir = "../../apps/client/public/assets/props/real/";
let total = 0; const rows = [];
for (const f of readdirSync(dir)) {
  const doc = await io.read(dir + f);
  let mem = 0, n = 0, maxS = 0; const sizes = [];
  for (const t of doc.getRoot().listTextures()) {
    const s = t.getSize(); if (!s) continue; n++; mem += s[0] * s[1] * 4 * 1.33; maxS = Math.max(maxS, s[0]); sizes.push(s[0] + "x" + s[1]);
  }
  total += mem; rows.push([f, n, Math.round(mem / 1e6), sizes.join(" ").slice(0, 60)]);
}
rows.sort((a, b) => b[2] - a[2]);
for (const r of rows.slice(0, 25)) console.log(r.join("\t"));
console.log("total GPU MB if every model loaded once:", Math.round(total / 1e6), "models:", rows.length);
