import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { readdirSync } from "node:fs";
import { join } from "node:path";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const root = join(import.meta.dirname, "../../assets-src/polyhaven");
for (const id of readdirSync(root).sort()) {
  try {
    const doc = await io.read(join(root, id, `${id}.gltf`));
    let tris = 0; const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    const scene = doc.getRoot().listScenes()[0];
    // world bounds via node traversal
    const walk = (node, parentM) => {
      const m = node.getMatrix ? node.getWorldMatrix() : null;
      const mesh = node.getMesh();
      if (mesh) for (const p of mesh.listPrimitives()) {
        const pos = p.getAttribute("POSITION"); tris += (p.getIndices()?.getCount() ?? pos.getCount()) / 3;
        for (let i = 0; i < pos.getCount(); i++) { const v = pos.getElement(i, []); const w = [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]]; for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], w[k]); max[k] = Math.max(max[k], w[k]); } }
      }
      for (const c of node.listChildren()) walk(c);
    };
    for (const n of scene.listChildren()) walk(n);
    const size = max.map((v, i) => (v - min[i]).toFixed(2));
    const anim = doc.getRoot().listAnimations().length, skins = doc.getRoot().listSkins().length;
    console.log(id.padEnd(30), String(Math.round(tris)).padStart(7), "tris  size(x,y,z)", size.join(" x "), anim ? `anim:${anim}` : "", skins ? `skins:${skins}` : "", "tex:", doc.getRoot().listTextures().length);
  } catch (e) { console.log(id, "ERR", e.message.slice(0, 80)); }
}
