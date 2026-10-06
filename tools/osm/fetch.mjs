// Downloads real map data (OpenStreetMap, ODbL: credit "(c) OpenStreetMap contributors") for an area and saves it as JSON.
// Usage: node tools/osm/fetch.mjs <name> <south> <west> <north> <east>
//   e.g. node tools/osm/fetch.mjs vi 6.423 3.410 6.437 3.432
import { mkdirSync, writeFileSync } from "node:fs";

const [name, s, w, n, e] = process.argv.slice(2);
if (!name || !e) {
  console.error("usage: node tools/osm/fetch.mjs <name> <south> <west> <north> <east>");
  process.exit(1);
}
const bbox = `${s},${w},${n},${e}`;
const query = `[out:json][timeout:60];(
  way["building"](${bbox});
  way["highway"](${bbox});
  way["natural"="water"](${bbox});
  way["waterway"](${bbox});
  way["leisure"~"park|pitch|garden"](${bbox});
  node["amenity"](${bbox});
  way["amenity"](${bbox});
);out body geom;`;
const hosts = ["https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
let data = null;
for (const host of hosts) {
  try {
    const res = await fetch(host, { method: "POST", body: "data=" + encodeURIComponent(query), headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", "user-agent": "TheLife-map-pipeline/0.1 (Alexion Studios)" } });
    if (!res.ok) throw new Error(`${res.status}`);
    data = await res.json();
    console.log("from", host);
    break;
  } catch (err) {
    console.error(host, "failed:", String(err));
  }
}
if (!data) process.exit(2);
mkdirSync("assets-src/osm", { recursive: true });
writeFileSync(`assets-src/osm/${name}.json`, JSON.stringify(data));
const count = (f) => data.elements.filter(f).length;
console.log({ elements: data.elements.length, buildings: count((x) => x.tags?.building), roads: count((x) => x.tags?.highway), water: count((x) => x.tags?.natural === "water" || x.tags?.waterway), amenities: count((x) => x.tags?.amenity) });
