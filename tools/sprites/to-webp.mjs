// Converts the baked PNG sprites to WebP (much smaller). Run from tools/assets so `sharp` resolves: node ../sprites/to-webp.mjs
import sharp from "sharp";
import { readdirSync, statSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../apps/client/public/sprites");
let before = 0, after = 0;
for (const dir of ["props", "char"]) {
  for (const f of readdirSync(join(root, dir))) {
    if (!f.endsWith(".png")) continue;
    const src = join(root, dir, f);
    const dst = join(root, dir, f.replace(/\.png$/, ".webp"));
    before += statSync(src).size;
    await sharp(src).webp({ quality: 86, alphaQuality: 90, effort: 5 }).toFile(dst);
    after += statSync(dst).size;
    unlinkSync(src);
  }
}
console.log(`PNG ${(before / 1e6).toFixed(1)} MB -> WebP ${(after / 1e6).toFixed(1)} MB`);
