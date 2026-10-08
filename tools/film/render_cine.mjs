// Renders the sign-in film: steps the #/cine page one frame at a time, takes a picture of each and pipes them into ffmpeg.
// Needs the dev server (`bash /tmp/dev-up.sh` or `pnpm --filter client dev`), Chromium and ffmpeg.
//   node tools/film/render_cine.mjs <portrait|wide> <out-dir> [frames: 10-20 or 0,48,100]
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const [kind = "portrait", outDir = "/tmp/cine", range] = process.argv.slice(2);
const size = kind === "wide" ? { width: 1280, height: 720 } : { width: 720, height: 1280 };
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: size, deviceScaleFactor: 1 })).newPage();
page.on("pageerror", (e) => console.log("PAGEERR", e.message));
await page.goto("http://localhost:5173/?splash=0#/cine", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__cine?.ready, null, { timeout: 300000 });
await page.waitForTimeout(1500);
const total = await page.evaluate(() => window.__cine.frames);
const list = !range ? Array.from({ length: total }, (_, i) => i) : range.includes(",") ? range.split(",").map(Number) : (([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k))(range.split("-").map(Number));
for (const i of list) {
  await page.evaluate((i) => window.__cine.frame(i), i);
  await page.screenshot({ path: `${outDir}/f${String(i).padStart(4, "0")}.jpg`, type: "jpeg", quality: 93 });
  if (i % 24 === 0) console.log("frame", i, "of", total);
}
await browser.close();
