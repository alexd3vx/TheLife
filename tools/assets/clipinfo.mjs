import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read("../../apps/client/public/assets/animations/ual1.glb");
for (const anim of doc.getRoot().listAnimations()) {
  if (!/^(Sitting|Idle_Loop|Interact|PickUp|Crouch_Idle)/.test(anim.getName())) continue;
  let dur = 0; for (const ch of anim.listChannels()) dur = Math.max(dur, ch.getSampler().getInput().getMax([])[0]);
  const find = (bone, path) => anim.listChannels().find((c) => c.getTargetNode()?.getName() === bone && c.getTargetPath() === path);
  const fmt = (ch, i) => { if (!ch) return "-"; const s = ch.getSampler(); const out = s.getOutput(); const n = s.getInput().getCount(); const k = i < 0 ? n - 1 : i; return [0,1,2].map((j) => out.getElement(k, [])[j].toFixed(3)).join(","); };
  console.log(anim.getName().padEnd(22), "dur", dur.toFixed(2), "| pelvis pos start", fmt(find("pelvis", "translation"), 0), "end", fmt(find("pelvis", "translation"), -1), "| root pos start", fmt(find("root", "translation"), 0), "end", fmt(find("root", "translation"), -1));
}
