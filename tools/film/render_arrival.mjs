// Renders the first two beats of the arrival film (crane and ride) for one background as pictures, one per frame, from #/filmrender.
//   node tools/film/render_arrival.mjs <nepo|middle|lapo> <out-dir>     then:  sh tools/film/encode_arrival.sh <out-dir> <tier>
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const [tier = "middle", outDir = "/tmp/arrival"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 })).newPage();
page.on("pageerror", (e) => console.log("PAGEERR", e.message));
await page.goto(`http://localhost:5173/?splash=0#/filmrender?tier=${tier}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__fr?.ready, null, { timeout: 300000 });
await page.waitForTimeout(1500);
const total = await page.evaluate(() => window.__fr.frames);
for (let i = 0; i < total; i++) {
  await page.evaluate((i) => window.__fr.frame(i), i);
  await page.screenshot({ path: `${outDir}/f${String(i).padStart(4, "0")}.jpg`, type: "jpeg", quality: 92 });
  if (i % 24 === 0) console.log(tier, "frame", i, "of", total);
}
if (tier === "middle") {
  await page.evaluate(() => window.__fr.plate());
  await page.screenshot({ path: `${outDir}/plate.jpg`, type: "jpeg", quality: 90 });
}
await browser.close();
