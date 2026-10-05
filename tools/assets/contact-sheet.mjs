// Dev utility: node contact-sheet.mjs out.png cols scale a.png b.png ...   (tiles screenshots into one image)
import sharp from "sharp";
const [out, colsArg, scaleArg, ...files] = process.argv.slice(2);
const cols = Number(colsArg);
const scale = Number(scaleArg);
const metas = await Promise.all(files.map((f) => sharp(f).metadata()));
const w = Math.round(metas[0].width * scale);
const h = Math.round(metas[0].height * scale);
const rows = Math.ceil(files.length / cols);
const tiles = await Promise.all(files.map(async (f, i) => ({ input: await sharp(f).resize(w, h).toBuffer(), left: (i % cols) * w, top: Math.floor(i / cols) * h })));
await sharp({ create: { width: w * cols, height: h * rows, channels: 3, background: "#222" } }).composite(tiles).png().toFile(out);
console.log(out, w * cols, "x", h * rows);
