// Turns the downloaded OpenStreetMap data into the game's Lagos Island: a ground grid (water, street, block, park, market),
// real building outlines with heights, and named places. Output: packages/game-core/src/lagosData.ts and lagosBuildings.ts.
// Usage: node tools/osm/build.mjs        (needs tools/osm/raw from download.mjs)
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readOsm } from "./parse.mjs";
import { Grid, area, projector, stitch, writePng } from "./geo.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const raw = join(here, "raw");
const outDir = join(here, "..", "..", "packages", "game-core", "src");

// The frame the data was downloaded in, and the part of it that becomes the game world.
const LAT0 = 6.48, LON0 = 3.365;
const EXTENT = { x0: 1500, z0: 1450, x1: 6000, z1: 4700 }; // metres in that frame
const CELL = 3;
const WORLD_W = EXTENT.x1 - EXTENT.x0, WORLD_H = EXTENT.z1 - EXTENT.z0;
const W = Math.ceil(WORLD_W / CELL), H = Math.ceil(WORLD_H / CELL);
const WATER = 0, STREET = 1, BLOCK = 2, PARK = 3, MARKET = 5;

const o = readOsm(raw);
const proj = projector(LAT0, LON0);
const toWorld = ([x, z]) => [x - EXTENT.x0, z - EXTENT.z0];
const pt = (id) => {
  const n = o.nodes.get(id);
  return n ? toWorld(proj(n[0], n[1])) : null;
};
const ptsOf = (ids) => ids.map(pt).filter(Boolean);
const inside = ([x, z]) => x > -50 && z > -50 && x < WORLD_W + 50 && z < WORLD_H + 50;
const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };

/** All the closed rings of a way or a multipolygon relation (outer rings first, then inner), as world points. */
function ringsOfRelation(rel) {
  const get = (role) => stitch(rel.members.filter((m) => m.type === "way" && m.role === role && o.ways.has(m.ref)).map((m) => o.ways.get(m.ref).nodes)).map(ptsOf);
  return { outer: get("outer").filter((r) => r.length > 3), inner: get("inner").filter((r) => r.length > 3) };
}
const closed = (w) => w.nodes.length > 3 && w.nodes[0] === w.nodes[w.nodes.length - 1];

// ---------------------------------------------------------------- the ground
const g = new Grid(W, H, CELL);
const tagged = (w) => w.tags;

// 1. Where is land? Anything built or paved (not bridges) marks land; closing gaps up to ~80 m leaves the lagoon and the creeks as water.
const occ = new Grid(W, H, CELL);
for (const w of o.ways.values()) {
  const t = w.tags;
  if (t.building && closed(w)) occ.fillRings([ptsOf(w.nodes)], 1);
  else if (t.highway && !t.bridge && !t.tunnel && !["footway", "path", "steps", "cycleway"].includes(t.highway)) occ.line(ptsOf(w.nodes), 10, 1);
  else if ((t.landuse || t.leisure === "park" || t.leisure === "pitch" || t.leisure === "stadium" || t.amenity === "marketplace") && closed(w) && !t.water) occ.fillRings([ptsOf(w.nodes)], 1);
}
function distanceTo(grid, target) {
  // Chamfer distance (in cells) to the nearest cell holding `target`.
  const { w, h, a } = grid;
  const d = new Float32Array(w * h).fill(1e6);
  for (let i = 0; i < w * h; i++) if (a[i] === target) d[i] = 0;
  const s2 = Math.SQRT2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 1);
    if (y > 0) { v = Math.min(v, d[i - w] + 1); if (x > 0) v = Math.min(v, d[i - w - 1] + s2); if (x < w - 1) v = Math.min(v, d[i - w + 1] + s2); }
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
    if (y < h - 1) { v = Math.min(v, d[i + w] + 1); if (x < w - 1) v = Math.min(v, d[i + w + 1] + s2); if (x > 0) v = Math.min(v, d[i + w - 1] + s2); }
    d[i] = v;
  }
  return d;
}
const R = Math.round(40 / CELL);
const near = distanceTo(occ, 1);
const grown = new Grid(W, H, CELL);
for (let i = 0; i < W * H; i++) grown.a[i] = near[i] <= R ? 1 : 0;
const far = distanceTo(grown, 0);
for (let i = 0; i < W * H; i++) g.a[i] = far[i] > R - 0.5 ? BLOCK : WATER; // eroded back: the shore sits at the real edge of the built land

// Small enclosed "lakes" are only gaps inside interchange loops and between estates, not water: fill them in.
{
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let start = 0; start < W * H; start++) {
    if (g.a[start] !== WATER || seen[start]) continue;
    const members = [];
    let touchesEdge = false;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      members.push(i);
      const x = i % W, y = (i / W) | 0;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) touchesEdge = true;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && g.a[j] === WATER && !seen[j]) { seen[j] = 1; stack.push(j); }
    }
    if (!touchesEdge && members.length < 9000) for (const i of members) g.a[i] = BLOCK;
  }
}

// 2. Real water polygons win over the guess.
const water = [];
for (const r of o.relations.values()) if (r.tags.natural === "water" || r.tags.waterway === "riverbank") water.push(r);
for (const r of water) { const { outer, inner } = ringsOfRelation(r); g.fillRings(outer, WATER); g.fillRings(inner, BLOCK); }
for (const w of o.ways.values()) if ((w.tags.natural === "water" || w.tags.waterway === "riverbank" || w.tags.landuse === "reservoir") && closed(w) && !w.tags.leisure) g.fillRings([ptsOf(w.nodes)], WATER);

// 3. Parks, then the market.
const PARKISH = (t) => ["park", "garden", "pitch", "golf_course", "playground", "recreation_ground", "nature_reserve", "stadium"].includes(t.leisure) || ["grass", "forest", "village_green", "recreation_ground", "cemetery", "meadow"].includes(t.landuse) || ["wood", "scrub", "grassland", "wetland", "heath"].includes(t.natural);
for (const w of o.ways.values()) if (closed(w) && PARKISH(w.tags) && !w.tags.building && w.tags.leisure !== "swimming_pool") g.fillRings([ptsOf(w.nodes)], PARK);
for (const r of o.relations.values()) if (r.tags.type === "multipolygon" && PARKISH(r.tags)) { const { outer } = ringsOfRelation(r); g.fillRings(outer, PARK); }
for (const w of o.ways.values()) if (closed(w) && (w.tags.amenity === "marketplace" || w.tags.landuse === "retail" && /market/i.test(w.tags.name ?? ""))) g.fillRings([ptsOf(w.nodes)], MARKET);

function simplifyLine(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let md = 0, mi = -1;
    const [ax, az] = pts[a], [bx, bz] = pts[b];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / len;
      if (d > md) { md = d; mi = i; }
    }
    if (md > eps && mi > 0) { keep[mi] = true; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// 4. Streets, widest first so narrow ones are not hidden. Bridges cross the water.
const WIDTH = { motorway: 17, trunk: 16, primary: 14, secondary: 12, tertiary: 10, motorway_link: 9, trunk_link: 9, primary_link: 9, secondary_link: 8, tertiary_link: 8, residential: 8, unclassified: 8, road: 8, living_street: 7, service: 6, pedestrian: 7, track: 4, footway: 3, path: 3, cycleway: 3, steps: 3 };
const roads = [...o.ways.values()].filter((w) => w.tags.highway && WIDTH[w.tags.highway] && !w.tags.tunnel && !(w.tags.highway === "service" && /parking_aisle|driveway/.test(w.tags.service ?? "")));
roads.sort((a, b) => WIDTH[b.tags.highway] - WIDTH[a.tags.highway]);
const roadRows = [];
for (const w of roads) {
  const width = Math.max(WIDTH[w.tags.highway], CELL * 1.6);
  const pts = simplifyLine(ptsOf(w.nodes), 0.6);
  g.line(pts, width, STREET, w.tags.bridge ? null : [BLOCK, PARK, MARKET, STREET]);
  // For the sharp road drawing: the centre line with its real width (decimetres), so the game can draw exact edges.
  if (pts.length > 1 && pts.some(([x, z]) => x > -30 && z > -30 && x < WORLD_W + 30 && z < WORLD_H + 30)) {
    const row = [Math.round(width * 10), Math.round(pts[0][0] * 10), Math.round(pts[0][1] * 10)];
    let px = row[1], pz = row[2];
    for (let i = 1; i < pts.length; i++) { const x = Math.round(pts[i][0] * 10), z = Math.round(pts[i][1] * 10); row.push(x - px, z - pz); px = x; pz = z; }
    roadRows.push(row);
  }
}
// Paved open areas: pedestrian squares and "area" highways.
const plazaRows = [];
for (const w of o.ways.values()) if (closed(w) && ((w.tags.highway === "pedestrian" && w.tags.area === "yes") || w.tags.place === "square" || w.tags["area:highway"])) {
  const ring = simplifyLine(ptsOf(w.nodes), 0.8);
  g.fillRings([ring], STREET);
  if (ring.length > 3 && Math.abs(area(ring)) > 200) {
    const row = [Math.round(ring[0][0] * 10), Math.round(ring[0][1] * 10)];
    let px = row[0], pz = row[1];
    for (let i = 1; i < ring.length; i++) { const x = Math.round(ring[i][0] * 10), z = Math.round(ring[i][1] * 10); row.push(x - px, z - pz); px = x; pz = z; }
    plazaRows.push(row);
  }
}

// ---------------------------------------------------------------- buildings
function simplify(pts, eps) {
  if (pts.length < 5) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let md = 0, mi = -1;
    const [ax, az] = pts[a], [bx, bz] = pts[b];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / len;
      if (d > md) { md = d; mi = i; }
    }
    if (md > eps && mi > 0) { keep[mi] = true; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const KIND = { house: 0, flats: 1, shop: 2, hangar: 3, terminal: 4 };
const buildings = [];
const addBuilding = (id, ring, tags) => {
  let pts = simplify(ring.slice(0, -1), 0.45);
  if (pts.length < 3) return;
  const a = area(pts);
  if (Math.abs(a) < 10) return;
  if (a < 0) pts = pts.reverse();
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  if (cx < 0 || cz < 0 || cx >= WORLD_W || cz >= WORLD_H) return;
  // Only keep it if it is on land.
  const ci = Math.floor(cz / CELL) * W + Math.floor(cx / CELL);
  if (g.a[ci] === WATER) return;
  const b = tags.building;
  const levels = Number.parseFloat(tags["building:levels"]);
  const hTag = Number.parseFloat(tags.height);
  const m2 = Math.abs(a);
  let kind = "house";
  if (/^(retail|commercial|office|hotel|supermarket|kiosk|shop)$/.test(b) || tags.shop || tags.office) kind = "shop";
  else if (/^(apartments|residential|dormitory)$/.test(b)) kind = "flats";
  else if (/^(industrial|warehouse|garage|garages|hangar|shed|storage_tank|factory)$/.test(b)) kind = "hangar";
  else if (/^(hospital|school|university|college|public|government|civic|train_station|transportation|church|mosque|cathedral|mosque|religious|temple)$/.test(b)) kind = "terminal";
  let floors;
  if (Number.isFinite(hTag) && hTag > 0) floors = Math.max(1, Math.round(hTag / 3.2));
  else if (Number.isFinite(levels) && levels > 0) floors = Math.round(levels);
  else if (kind === "hangar") floors = 1;
  else {
    const r = hash(id);
    floors = kind === "flats" ? 3 + Math.floor(r * 4) : kind === "shop" ? 2 + Math.floor(r * 4) : m2 > 600 ? 3 + Math.floor(r * 4) : m2 > 200 ? 2 + Math.floor(r * 3) : 1 + Math.floor(r * 2);
  }
  floors = Math.max(1, Math.min(40, floors));
  // The turn of the building: along its longest wall.
  let best = 0, yaw = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len > best) { best = len; yaw = Math.atan2(q[1] - p[1], q[0] - p[0]); }
  }
  yaw = ((yaw % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
  if (yaw > Math.PI / 4) yaw -= Math.PI / 2;
  const roofy = tags["roof:shape"] === "gabled" || /^(house|detached|semidetached_house|terrace)$/.test(b) && m2 < 250 && !tags["building:levels"] ? 1 : 0;
  buildings.push({ id, pts, floors, kind: KIND[kind], yaw, roof: roofy, name: tags.name ?? "", amenity: tags.amenity ?? "", tourism: tags.tourism ?? "", religion: tags.religion ?? "", b });
};
for (const [id, w] of o.ways) if (w.tags.building && closed(w) && w.tags.building !== "no") addBuilding(`w${id}`, ptsOf(w.nodes), w.tags);
for (const [id, r] of o.relations) if (r.tags.building && r.tags.type === "multipolygon") for (const ring of ringsOfRelation(r).outer) addBuilding(`r${id}`, [...ring, ring[0]], r.tags);
// Buildings sit on plain ground: carve their footprints out of the streets that were drawn a little too wide.
const foot = new Grid(W, H, CELL);
for (const b of buildings) foot.fillRings([b.pts], 1);
for (let i = 0; i < W * H; i++) if (foot.a[i] && g.a[i] === STREET) g.a[i] = BLOCK;

// ---------------------------------------------------------------- places
const KINDS = [];
const poiKind = (t, b) => {
  if (t.amenity === "police") return "police";
  if (t.amenity === "hospital" || t.amenity === "clinic" && t.name) return "hospital";
  if (["school", "college", "university"].includes(t.amenity)) return "school";
  if (t.amenity === "place_of_worship") return t.religion === "muslim" ? "mosque" : "church";
  if (t.amenity === "fire_station") return "fire";
  if (t.amenity === "bank") return "bank";
  if (t.amenity === "fuel") return "fuel";
  if (t.tourism === "hotel") return "hotel";
  if (t.amenity === "marketplace") return "market";
  if (t.railway === "station" || t.amenity === "bus_station" || t.amenity === "ferry_terminal") return "station";
  if (t.tourism === "museum") return "museum";
  if (["townhall", "courthouse", "embassy"].includes(t.amenity) || t.office === "government" || t.government) return "government";
  if (t.leisure === "stadium") return "stadium";
  if (t.leisure === "park") return "park";
  return null;
};
const centre = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const found = [];
for (const [id, w] of o.ways) {
  const k = poiKind(w.tags);
  if (!k || !w.tags.name || !closed(w)) continue;
  const [x, z] = centre(ptsOf(w.nodes));
  if (x > 0 && z > 0 && x < WORLD_W && z < WORLD_H && g.a[Math.floor(z / CELL) * W + Math.floor(x / CELL)] !== WATER) found.push({ name: w.tags.name, kind: k, x, z });
}
for (const [id, t] of o.nodeTags) {
  const k = poiKind(t);
  if (!k || !t.name) continue;
  const [x, z] = pt(id) ?? [-1, -1];
  if (x > 0 && z > 0 && x < WORLD_W && z < WORLD_H && g.a[Math.floor(z / CELL) * W + Math.floor(x / CELL)] !== WATER) found.push({ name: t.name, kind: k, x, z });
}
// Keep a spread: the famous ones first (named in the list below), then the rest up to a limit per kind.
const CAP = { police: 12, hospital: 14, school: 24, church: 24, mosque: 14, fire: 4, bank: 24, fuel: 14, hotel: 22, market: 8, station: 10, museum: 6, government: 14, stadium: 4, park: 12 };
const FAMOUS = /tafawa|balogun|national museum|marina|cms|freedom park|king.s college|lagos island general|eko hotel|civic|city hall|cathedral|central mosque|stock exchange|nnamdi|race ?course|onikan|tinubu|obalende/i;
const used = {}, places = [];
const seen = new Set();
for (const p of found.sort((a, b) => Number(FAMOUS.test(b.name)) - Number(FAMOUS.test(a.name)))) {
  const key = p.name.toLowerCase();
  if (seen.has(key)) continue;
  if ((used[p.kind] = (used[p.kind] ?? 0) + 1) > CAP[p.kind]) continue;
  seen.add(key);
  places.push({ name: p.name.replace(/"/g, "'").slice(0, 40), kind: p.kind, x: Math.round(p.x / CELL * 10) / 10, y: Math.round(p.z / CELL * 10) / 10 });
}

// ---------------------------------------------------------------- write
// The ground, run-length encoded: [value, run low, run high] bytes, as base64.
const rle = [];
for (let i = 0; i < W * H;) { let j = i; while (j < W * H && g.a[j] === g.a[i] && j - i < 65535) j++; rle.push(g.a[i], (j - i) & 255, (j - i) >> 8); i = j; }
const b64 = Buffer.from(rle).toString("base64");
const placesTs = JSON.stringify(places, null, 2);
writeFileSync(join(outDir, "lagosData.ts"), `// Generated by tools/osm/build.mjs from OpenStreetMap data (c) OpenStreetMap contributors, ODbL. Do not edit by hand.\n// The ground of Lagos Island at ${CELL} m per cell: 0 water, 1 street, 2 built-up ground, 3 park, 5 market.\nexport const LAGOS_CELL = ${CELL};\nexport const LAGOS_W = ${W};\nexport const LAGOS_H = ${H};\nexport interface LagosPlace {\n  name: string;\n  kind: string;\n  /** In cells. */\n  x: number;\n  y: number;\n}\nexport const LAGOS_PLACES: LagosPlace[] = ${placesTs};\nexport const LAGOS_RLE = "${b64}";\n`);
// Buildings: one row each, all numbers in decimetres, outline stored as steps from the first point.
const rows = buildings.map((b) => {
  const x0 = Math.round(b.pts[0][0] * 10), z0 = Math.round(b.pts[0][1] * 10);
  const steps = [];
  let px = x0, pz = z0;
  for (let i = 1; i < b.pts.length; i++) { const x = Math.round(b.pts[i][0] * 10), z = Math.round(b.pts[i][1] * 10); steps.push(x - px, z - pz); px = x; pz = z; }
  return [b.kind, b.floors, Math.round(b.yaw * 1000), b.roof, x0, z0, ...steps];
});
writeFileSync(join(outDir, "lagosBuildings.ts"), `// Generated by tools/osm/build.mjs from OpenStreetMap data (c) OpenStreetMap contributors, ODbL. Do not edit by hand.\n// One row per building: [kind, floors, yaw in milliradians, roof (1 = pitched), x0, z0 in decimetres, then the other corners as steps].\nexport const LAGOS_BUILDINGS: number[][] = ${JSON.stringify(rows)};\n`);
writeFileSync(join(outDir, "lagosRoads.ts"), `// Generated by tools/osm/build.mjs from OpenStreetMap data (c) OpenStreetMap contributors, ODbL. Do not edit by hand.\n// Street centre lines: [width in dm, x0, z0 in dm, then the other points as steps]. And open paved areas: [x0, z0, steps].\nexport const LAGOS_ROADS: number[][] = ${JSON.stringify(roadRows)};\nexport const LAGOS_PLAZAS: number[][] = ${JSON.stringify(plazaRows)};\n`);
console.log({ roads: roadRows.length, plazas: plazaRows.length, grid: [W, H], rleBytes: rle.length, buildings: buildings.length, places: places.length, perKind: used });

mkdirSync("/tmp/osm", { recursive: true });
for (const b of buildings) foot.fillRings([b.pts], 1);
const vis = new Grid(W, H, CELL);
for (let i = 0; i < W * H; i++) vis.a[i] = foot.a[i] ? 9 : g.a[i];
writePng("/tmp/osm/world.png", vis, { 0: [70, 120, 180], 1: [60, 60, 66], 2: [190, 180, 160], 3: [110, 160, 90], 5: [200, 140, 80], 9: [245, 245, 245] });
