// Bakes isometric sprites from the 3D models. Needs the dev server running (pnpm --filter @thelife/client dev) and playwright-core.
// Usage: node tools/sprites/bake.mjs props [id,id,...]   |   node tools/sprites/bake.mjs char
import { createRequire } from "node:module";
const require = createRequire(process.env.PLAYWRIGHT_FROM || import.meta.url);
const { chromium } = require("playwright-core");
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = join(root, "apps/client/public/sprites");
const mode = process.argv[2] || "props";
const only = process.argv[3]?.split(",");
const url = process.env.BAKE_URL || "http://localhost:5173/?splash=0#/bake";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on("pageerror", (e) => console.log("PAGEERR", e.message));
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__bake?.ready, null, { timeout: 120000 });

const save = (rel, dataUrl) => {
  const file = join(out, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
};

if (mode === "props") {
  const ids = only ?? (await page.evaluate(() => window.__bake.furnitureIds()));
  const index = {};
  for (const id of ids) {
    const sprites = await page.evaluate((id) => window.__bake.props([id]), id).catch((e) => { console.log("FAILED", id, e.message.slice(0, 80)); return []; });
    for (const s of sprites) {
      save(`props/${id}_${s.rot}.png`, s.image);
      (index[id] ??= { size: s.size })[s.rot] = { w: s.w, h: s.h, ax: s.ax, ay: s.ay };
    }
    console.log(id, sprites.length);
  }
  const file = join(out, "props.json");
  let old = {};
  try { old = JSON.parse((await import("node:fs")).readFileSync(file, "utf8")); } catch {}
  writeFileSync(file, JSON.stringify({ ...old, ...index }));
} else if (mode === "layers") {
  // node bake.mjs layers <realmale|realfemale> [key,key] [clip,clip]
  const body = process.argv[3];
  const keysArg = process.argv[4] && process.argv[4] !== "all" ? process.argv[4].split(",") : null;
  const clipsArg = process.argv[5] ? process.argv[5].split(",") : null;
  const variants = await page.evaluate((b) => window.__bake.layerVariants(b), body);
  for (const v of variants) {
    if (keysArg && !keysArg.includes(v.key)) continue;
    const t0 = Date.now();
    const sheets = await page.evaluate(([b, k, c]) => window.__bake.layer(b, k, c), [body, v.key, clipsArg]).catch((e) => { console.log("FAILED", v.key, e.message.slice(0, 100)); return null; });
    if (!sheets) continue;
    const index = {};
    for (const [clip, sheet] of Object.entries(sheets)) {
      if (!sheet) continue;
      save(`char2/${body}/${v.key}/${clip}.png`, sheet.image);
      index[clip] = { width: sheet.width, height: sheet.height, cells: sheet.cells.map((c) => [c.dir, c.frame, c.x, c.y, c.w, c.h, c.ax, c.ay]) };
    }
    const file = join(out, `char2/${body}/${v.key}/index.json`);
    let old = {};
    try { old = JSON.parse((await import("node:fs")).readFileSync(file, "utf8")); } catch {}
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ ...old, ...index }));
    console.log(body, v.key, Object.keys(index).length, "clips", Math.round((Date.now() - t0) / 1000) + "s");
  }
} else {
  const sprites = await page.evaluate((o) => window.__bake.character(o), only ?? null);
  const index = { frames: {} };
  for (const s of sprites) {
    save(`char/${s.clip}_${s.dir}_${s.frame}.png`, s.image);
    (index.frames[s.clip] ??= []).push({ dir: s.dir, frame: s.frame, w: s.w, h: s.h, ax: s.ax, ay: s.ay });
  }
  const cfile = join(out, "char.json");
  let prev = { frames: {} };
  try { prev = JSON.parse((await import("node:fs")).readFileSync(cfile, "utf8")); } catch {}
  writeFileSync(cfile, JSON.stringify({ frames: { ...prev.frames, ...index.frames } }));
  console.log("character frames", sprites.length);
}
await browser.close();
