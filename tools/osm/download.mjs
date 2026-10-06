// Downloads OpenStreetMap data (ODbL, "(c) OpenStreetMap contributors") for an area in small tiles through the public map API
// and saves the raw XML under tools/osm/raw/. Usage: node tools/osm/download.mjs <south> <west> <north> <east> [tile=0.01]
// Be kind to the service: one request at a time, a pause between them, and a descriptive user agent.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [s, w, n, e, tileArg] = process.argv.slice(2).map(Number);
if (![s, w, n, e].every(Number.isFinite)) {
  console.error("usage: node tools/osm/download.mjs <south> <west> <north> <east> [tile]");
  process.exit(1);
}
const tile = tileArg || 0.01;
const out = join(dirname(fileURLToPath(import.meta.url)), "raw");
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const f = (v) => v.toFixed(5);

async function get(south, west, north, east, depth = 0) {
  const name = join(out, `${f(south)}_${f(west)}_${f(north)}_${f(east)}.osm`);
  if (existsSync(name)) return;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${west},${south},${east},${north}`, { headers: { "user-agent": "TheLife-map-pipeline/0.2 (Alexion Studios; one-off import)" } });
    if (res.status === 400 && depth < 4) {
      // Too many nodes in one request: split into four.
      const mx = (west + east) / 2, my = (south + north) / 2;
      for (const [a, b, c, d] of [[south, west, my, mx], [south, mx, my, east], [my, west, north, mx], [my, mx, north, east]]) await get(a, b, c, d, depth + 1);
      return;
    }
    if (res.ok) {
      writeFileSync(name, Buffer.from(await res.arrayBuffer()));
      console.log("saved", name);
      await sleep(1200);
      return;
    }
    console.error("retry", res.status, name);
    await sleep(5000 * (attempt + 1));
  }
  throw new Error("giving up on " + name);
}

for (let y = s; y < n - 1e-9; y += tile) for (let x = w; x < e - 1e-9; x += tile) await get(y, x, Math.min(n, y + tile), Math.min(e, x + tile));
console.log("done");
