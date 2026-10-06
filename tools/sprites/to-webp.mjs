// Converts the baked PNG sprites to WebP (much smaller). Run from tools/assets so `sharp` resolves:
//   cd tools/assets && cp ../sprites/to-webp.mjs ./x.mjs && node x.mjs && rm x.mjs
import sharp from "sharp";
import { readdirSync, statSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../apps/client/public/sprites");
let before = 0, after = 0, n = 0;
async function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      await walk(p);
      continue;
    }
    if (!f.endsWith(".png")) continue;
    const dst = p.replace(/\.png$/, ".webp");
    before += statSync(p).size;
    await sharp(p).webp({ quality: 88, alphaQuality: 94, effort: 4 }).toFile(dst);
    after += statSync(dst).size;
    unlinkSync(p);
    n++;
  }
}
await walk(root);
console.log(`${n} files: PNG ${(before / 1e6).toFixed(1)} MB -> WebP ${(after / 1e6).toFixed(1)} MB`);
