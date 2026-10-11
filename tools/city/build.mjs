// Builds the game's Lagos: a city board of the real districts of Lagos (mainland: Ikeja, Mushin, Yaba, Surulere, Oshodi, Apapa; the
// islands: Lagos Island, Ikoyi, Victoria Island, Banana Island, Eko Atlantic; and Lekki), laid out the way the city really lies (the
// lagoon between the mainland and the islands, joined by Third Mainland, Carter and Eko bridges, the Lekki-Ikoyi Link over the creek,
// the Atlantic to the south). Everything is generated from this file, the same every time: no outside data.
// Output: packages/game-core/src/lagosData.ts, lagosBuildings.ts, lagosRoads.ts (the files the game already reads).
// Usage: node tools/city/build.mjs [--png out.png]
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Grid, writePng } from "../osm/geo.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "packages", "game-core", "src");
const CELL = 3, WORLD_W = 2700, WORLD_H = 2100;
const W = WORLD_W / CELL, H = WORLD_H / CELL;
const WATER = 0, STREET = 1, BLOCK = 2, PARK = 3, MARKET = 5;

let seed = 20240607;
const rand = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a, b) => a + rand() * (b - a);
const pick = (list) => list[Math.floor(rand() * list.length)];

const g = new Grid(W, H, CELL);
const at = (x, z) => (x < 0 || z < 0 || x >= WORLD_W || z >= WORLD_H ? WATER : g.a[Math.floor(z / CELL) * W + Math.floor(x / CELL)]);
const poly = (pts) => pts;

// ---------------------------------------------------------------- the land and the water
const MAINLAND = [[0, 0], [2700, 0], [2700, 560], [2400, 610], [2050, 650], [1700, 640], [1400, 670], [1150, 720], [930, 740], [780, 770], [690, 830], [640, 930], [600, 1050], [540, 1180], [470, 1330], [380, 1470], [230, 1540], [90, 1520], [0, 1440]];
const ISLANDS = [[800, 985], [920, 950], [1050, 925], [1200, 935], [1400, 960], [1650, 975], [1900, 970], [2200, 985], [2450, 1000], [2700, 1030], [2700, 1890], [2400, 1905], [2000, 1890], [1750, 1960], [1350, 1970], [1250, 1870], [1000, 1800], [880, 1650], [820, 1400], [800, 1180]];
g.fillRings([MAINLAND], BLOCK);
g.fillRings([ISLANDS], BLOCK);
// a ring of open water round the world, so nobody walks off the edge
for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (x < 12 || z < 12 || x >= W - 12 || z >= H - 12) g.a[z * W + x] = WATER;
// the creek between Lagos Island and Ikoyi, and the Lekki channel
g.fillRings([[[1290, 925], [1340, 925], [1340, 1340], [1315, 1365], [1290, 1340]]], WATER);
g.fillRings([[[1840, 955], [2000, 955], [2000, 1480], [1920, 1525], [1840, 1480]]], WATER);
// Banana Island, a small island in the lagoon
g.fillRings([[[1620, 800], [1700, 785], [1770, 805], [1775, 860], [1700, 878], [1625, 868]]], BLOCK);

// ---------------------------------------------------------------- streets
const roadRows = [];
const rowOf = (width, pts) => {
  const row = [Math.round(width * 10), Math.round(pts[0][0] * 10), Math.round(pts[0][1] * 10)];
  let px = row[1], pz = row[2];
  for (let i = 1; i < pts.length; i++) {
    const x = Math.round(pts[i][0] * 10), z = Math.round(pts[i][1] * 10);
    row.push(x - px, z - pz);
    px = x;
    pz = z;
  }
  return row;
};
/** The parts of a straight line that lie on land (every point two metres apart is tested). */
function landRuns(p0, p1) {
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const n = Math.max(1, Math.ceil(len / 2));
  const runs = [];
  let start = null, last = null;
  for (let i = 0; i <= n; i++) {
    const x = p0[0] + ((p1[0] - p0[0]) * i) / n, z = p0[1] + ((p1[1] - p0[1]) * i) / n;
    const land = at(x, z) !== WATER;
    if (land && start === null) start = [x, z];
    if (land) last = [x, z];
    if (!land && start !== null) {
      runs.push([start, last]);
      start = null;
    }
  }
  if (start !== null) runs.push([start, last]);
  return runs.filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 8);
}
/** A street along a polyline. Bridges cross water; every other street is cut at the shore. */
function road(pts, width, bridge = false) {
  if (bridge) {
    g.line(pts, width, STREET, null);
    roadRows.push(rowOf(width, pts));
    return;
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    for (const [a, b] of landRuns(pts[i], pts[i + 1])) {
      g.line([a, b], width, STREET, [BLOCK, PARK, MARKET, STREET]);
      roadRows.push(rowOf(width, [a, b]));
    }
  }
}
/** Streets in a grid over a rectangle: every few lines a wider collector street, some lines left out so the blocks differ. */
function streets([x0, z0, x1, z1], sx, sz, w, every = 3, wide = w + 3) {
  sx *= 1.3;
  sz *= 1.3;
  let n = 0;
  for (let x = x0 + between(0, sx * 0.4); x < x1; x += sx * between(0.8, 1.25), n++) road([[x, z0], [x, z1]], n % every === 0 ? wide : w);
  n = 0;
  for (let z = z0 + between(0, sz * 0.4); z < z1; z += sz * between(0.8, 1.25), n++) road([[x0, z], [x1, z]], n % every === 0 ? wide : w);
}
const DISTRICTS = [
  // mainland
  { name: "Ikeja", rect: [0, 0, 790, 430], sx: 95, sz: 85, w: 8 },
  { name: "Mushin", rect: [0, 430, 400, 830], sx: 55, sz: 50, w: 6, every: 4, wide: 9 },
  { name: "Surulere", rect: [400, 430, 820, 800], sx: 75, sz: 68, w: 7 },
  { name: "Oshodi", rect: [790, 0, 1300, 410], sx: 90, sz: 80, w: 8 },
  { name: "Yaba", rect: [820, 410, 1300, 760], sx: 68, sz: 60, w: 7 },
  { name: "Ketu", rect: [1300, 0, 2700, 760], sx: 105, sz: 92, w: 8 },
  { name: "Apapa", rect: [0, 830, 640, 1560], sx: 70, sz: 66, w: 7 },
  // the islands
  { name: "Lagos Island", rect: [790, 925, 1285, 1250], sx: 46, sz: 42, w: 6, every: 4, wide: 9 },
  { name: "Onikan", rect: [790, 1250, 1345, 1980], sx: 82, sz: 76, w: 8 },
  { name: "Ikoyi", rect: [1345, 925, 1835, 1450], sx: 120, sz: 100, w: 8 },
  { name: "Victoria Island", rect: [1345, 1450, 1990, 1900], sx: 110, sz: 95, w: 9, every: 2, wide: 12 },
  { name: "Lekki", rect: [1990, 925, 2700, 1920], sx: 135, sz: 112, w: 8 },
  { name: "Eko Atlantic", rect: [1300, 1860, 1760, 1965], sx: 115, sz: 105, w: 12 },
  { name: "Banana Island", rect: [1625, 795, 1770, 870], sx: 48, sz: 40, w: 6 },
];
for (const d of DISTRICTS) streets(d.rect, d.sx, d.sz, d.w, d.every ?? 3, d.wide ?? d.w + 3);

// the long roads that tie it together
const ARTERIALS = [
  [[[0, 330], [400, 400], [800, 520], [1010, 600]], 14, "Agege Motor Road"],
  [[[1010, 560], [1300, 360], [1700, 160], [1900, 0]], 15, "Ikorodu Road"],
  [[[420, 560], [830, 615]], 13, "Western Avenue"],
  [[[200, 150], [700, 320], [900, 400]], 13, "Allen Avenue"],
  [[[700, 425], [1500, 415], [2300, 420]], 15, "Lagos-Ibadan Expressway"],
  [[[300, 820], [520, 700], [800, 560]], 15, "Apapa-Oshodi Expressway"],
  [[[150, 1010], [300, 1170], [450, 1300]], 12, "Wharf Road"],
  [[[815, 990], [1000, 940], [1280, 960]], 14, "Marina"],
  [[[1000, 940], [1000, 1780]], 14, "Broad Street"],
  [[[1000, 1420], [1290, 1420]], 13, "Onikan Road"],
  [[[1345, 1000], [1600, 1260], [1830, 1440]], 15, "Awolowo Road"],
  [[[1345, 1600], [1990, 1640], [2680, 1720]], 17, "Ozumba Mbadiwe Way"],
  [[[1345, 1740], [1990, 1745]], 15, "Adetokunbo Ademola Street"],
  [[[2000, 1100], [2680, 1180]], 17, "Lekki-Epe Expressway"],
  [[[1300, 1920], [1760, 1925]], 15, "Eko Atlantic Boulevard"],
];
for (const [pts, w] of ARTERIALS) road(pts, w);
// bridges: the Third Mainland, Carter and Eko Bridges over the lagoon, Falomo over the creek, the Lekki-Ikoyi Link, and the way on to Banana Island
const BRIDGES = [
  [[[1070, 470], [1050, 700], [1025, 985]], 15, "Third Mainland Bridge"],
  [[[905, 560], [895, 760], [870, 985]], 12, "Carter Bridge"],
  [[[770, 640], [790, 790], [840, 985]], 13, "Eko Bridge"],
  [[[1240, 1080], [1390, 1080]], 12, "Falomo Bridge"],
  [[[1790, 1160], [2060, 1160]], 15, "Lekki-Ikoyi Link Bridge"],
  [[[1700, 900], [1700, 1000]], 8, "Banana Island Bridge"],
];
for (const [pts, w] of BRIDGES) road(pts, w, true);

// ---------------------------------------------------------------- parks, markets and big open places
const OPEN = []; // rectangles kept free of buildings
const rectCells = (cx, cz, w, d, value, keepFree = true) => {
  const x0 = cx - w / 2, z0 = cz - d / 2, x1 = cx + w / 2, z1 = cz + d / 2;
  for (let z = Math.floor(z0 / CELL); z <= Math.floor(z1 / CELL); z++) {
    for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++) {
      if (x < 0 || z < 0 || x >= W || z >= H) continue;
      if (g.a[z * W + x] === BLOCK) g.a[z * W + x] = value;
    }
  }
  if (keepFree) OPEN.push([x0, z0, x1, z1]);
};
const PARKS = [
  [1160, 1160, 110, 80], [1130, 1560, 150, 120], [1560, 1120, 160, 110], [1650, 1800, 140, 70], [2300, 1350, 340, 220],
  [2150, 1800, 260, 70], [520, 520, 90, 70], [1100, 1630, 120, 80], [1750, 520, 120, 90], [700, 260, 100, 80], [240, 640, 80, 70], [1900, 340, 110, 90],
  [1540, 1530, 90, 70], [1360, 1790, 100, 70], [1850, 1270, 80, 60], [1030, 360, 90, 70],
];
for (const [x, z, w, d] of PARKS) rectCells(x, z, w, d, PARK);
const MARKETS = [
  [925, 1180, 120, 90], [840, 1060, 100, 70], [1070, 1100, 90, 70], [610, 600, 120, 85], [985, 560, 100, 70], [330, 255, 120, 90], [200, 640, 100, 80],
  [1120, 250, 130, 90], [1570, 1710, 100, 80], [2160, 1460, 110, 80], [470, 1050, 100, 70], [1160, 1350, 90, 70],
];
for (const [x, z, w, d] of MARKETS) rectCells(x, z, w, d, MARKET);
// stadiums keep a wide lawn (the pitch, the track and the stands go on it), the ports and the airport a yard
const STADIUMS = [[600, 690, 190, 150], [1210, 1490, 180, 150]];
for (const [x, z, w, d] of STADIUMS) rectCells(x, z, w, d, PARK);
const YARDS = [[300, 1280, 90, 70], [190, 1400, 90, 70], [2540, 1760, 100, 80], [420, 140, 200, 110]];
for (const [x, z, w, d] of YARDS) rectCells(x, z, w, d, BLOCK);

// ---------------------------------------------------------------- buildings
/** What gets built where: sizes in metres, floors, the share of each kind (0 house, 1 flats, 2 shop, 3 hangar, 4 terminal). */
const STYLES = {
  dense: { w: [6, 10], d: [8, 12], floors: [1, 2], kinds: [[0, 0.8], [2, 0.14], [1, 0.06]], gap: 1.2, row: [2, 4], pitched: 0.45, skip: 0.04 },
  ikeja: { w: [10, 17], d: [11, 17], floors: [1, 3], kinds: [[0, 0.55], [1, 0.25], [2, 0.2]], gap: 3, row: [4, 8], pitched: 0.4, skip: 0.1 },
  yaba: { w: [10, 18], d: [12, 18], floors: [2, 5], kinds: [[1, 0.5], [2, 0.3], [0, 0.2]], gap: 2, row: [3, 6], pitched: 0.12, skip: 0.06 },
  apapa: { w: [14, 30], d: [16, 30], floors: [1, 2], kinds: [[3, 0.4], [0, 0.35], [2, 0.25]], gap: 4, row: [5, 9], pitched: 0.1, skip: 0.12 },
  old: { w: [7, 13], d: [10, 15], floors: [2, 6], kinds: [[2, 0.4], [1, 0.4], [0, 0.2]], gap: 1, row: [2, 4], pitched: 0.05, skip: 0.03 },
  cbd: { w: [16, 28], d: [16, 26], floors: [6, 18], kinds: [[1, 0.8], [2, 0.2]], gap: 4, row: [6, 9], pitched: 0, skip: 0.1 },
  island: { w: [10, 20], d: [12, 20], floors: [2, 7], kinds: [[1, 0.5], [2, 0.25], [0, 0.25]], gap: 3, row: [4, 7], pitched: 0.1, skip: 0.1 },
  ikoyi: { w: [17, 27], d: [18, 26], floors: [1, 3], kinds: [[0, 0.8], [1, 0.2]], gap: 9, row: [8, 12], pitched: 0.5, skip: 0.1 },
  vi: { w: [22, 38], d: [22, 36], floors: [5, 16], kinds: [[1, 0.8], [2, 0.1], [0, 0.1]], gap: 9, row: [8, 12], pitched: 0.05, skip: 0.18 },
  lekki: { w: [16, 24], d: [18, 25], floors: [1, 2], kinds: [[0, 0.78], [1, 0.22]], gap: 7, row: [7, 11], pitched: 0.4, skip: 0.18 },
  eko: { w: [32, 46], d: [32, 44], floors: [10, 32], kinds: [[1, 1]], gap: 18, row: [14, 20], pitched: 0, skip: 0.2 },
  banana: { w: [22, 30], d: [22, 28], floors: [2, 3], kinds: [[0, 1]], gap: 10, row: [9, 12], pitched: 0.3, skip: 0.1 },
};
// where each style applies: the first rectangle that holds the point (the small special areas come before the districts)
const STYLE_AREAS = [
  ["cbd", [840, 960, 1180, 1070]], ["eko", [1300, 1860, 1760, 1965]], ["banana", [1625, 795, 1770, 870]],
  ["vi", [1345, 1450, 1990, 1860]], ["old", [810, 960, 1285, 1250]], ["island", [810, 1250, 1285, 1800]], ["ikoyi", [1345, 960, 1835, 1450]], ["lekki", [1835, 960, 2700, 1900]],
  ["dense", [0, 430, 400, 830]], ["yaba", [400, 440, 1300, 760]], ["apapa", [0, 830, 620, 1560]],
];
const styleAt = (x, z) => {
  for (const [name, [x0, z0, x1, z1]] of STYLE_AREAS) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return STYLES[name];
  return STYLES.ikeja;
};
const inOpen = (x0, z0, x1, z1) => OPEN.some(([a, b, c, d]) => x1 > a - 4 && x0 < c + 4 && z1 > b - 4 && z0 < d + 4);
/** Is the whole rectangle (with a metre and a half to spare) built-up ground? */
const solid = (x0, z0, x1, z1) => {
  for (let z = z0 - 1.5; z <= z1 + 1.5; z += 2.5) for (let x = x0 - 1.5; x <= x1 + 1.5; x += 2.5) if (at(x, z) !== BLOCK) return false;
  return at(x1 + 1.5, z1 + 1.5) === BLOCK && at(x0 - 1.5, z1 + 1.5) === BLOCK && at(x1 + 1.5, z0 - 1.5) === BLOCK;
};
const weighted = (list) => {
  let r = rand();
  for (const [v, p] of list) if ((r -= p) <= 0) return v;
  return list[0][0];
};

// every block of built-up ground: a flood fill finds it, rows of lots fill it
const label = new Int32Array(W * H);
const buildings = [];
let blocks = 0;
for (let start = 0; start < W * H; start++) {
  if (g.a[start] !== BLOCK || label[start]) continue;
  blocks++;
  const stack = [start];
  label[start] = blocks;
  let minX = W, maxX = 0, minZ = H, maxZ = 0;
  while (stack.length) {
    const i = stack.pop();
    const x = i % W, z = (i / W) | 0;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    for (const j of [i - 1, i + 1, i - W, i + W]) {
      if (j < 0 || j >= W * H || g.a[j] !== BLOCK || label[j]) continue;
      if ((j === i - 1 && x === 0) || (j === i + 1 && x === W - 1)) continue;
      label[j] = blocks;
      stack.push(j);
    }
  }
  const left = minX * CELL, right = (maxX + 1) * CELL, top = minZ * CELL, bottom = (maxZ + 1) * CELL;
  const style = styleAt((left + right) / 2, (top + bottom) / 2);
  let z = top + 2.5;
  while (z < bottom - 2) {
    const d = between(style.d[0], style.d[1]);
    let x = left + 2.5, placed = 0;
    while (x < right - 2) {
      const w = between(style.w[0], style.w[1]);
      if (solid(x, z, x + w, z + d) && !inOpen(x, z, x + w, z + d)) {
        if (rand() > style.skip) {
          const kind = weighted(style.kinds);
          let floors = Math.round(between(style.floors[0], style.floors[1]));
          if (kind === 3) floors = 1;
          if (kind === 0) floors = Math.min(floors, 3);
          const roof = kind === 0 && rand() < style.pitched ? 1 : 0;
          buildings.push({ kind, floors, roof, x0: x, z0: z, w, d });
        }
        placed++;
        x += w + style.gap;
      } else x += 3;
    }
    z += d + between(style.row[0], style.row[1]);
  }
}

// ---------------------------------------------------------------- the named places (metres; the game puts each in the nearest building)
const PLACES = [
  // Lagos Island
  ["Tafawa Balewa Square Bus Terminal", "station", 1010, 1330], ["National Museum", "museum", 1100, 1400], ["General Hospital Lagos", "hospital", 895, 1110],
  ["Lagos Central Mosque", "mosque", 965, 1040], ["Cathedral Church of Christ", "church", 1095, 1030], ["Freedom Park", "park", 1160, 1160], ["Balogun Market", "market", 925, 1180],
  ["Ebute Ero Market", "market", 840, 1060], ["Jankara Market", "market", 1070, 1100], ["Lagos City Hall", "government", 1190, 1100], ["Iga Idunganran (Oba's Palace)", "government", 1210, 1020],
  ["Zenith Bank Marina", "bank", 930, 1005], ["First Bank Broad Street", "bank", 1030, 1090], ["GTBank Lagos Island", "bank", 1140, 1065], ["Lagos Island Police Station", "police", 880, 1230],
  ["Lagos Island Fire Station", "fire", 1230, 1210], ["CMS Grammar School", "school", 1050, 1220], ["Methodist Boys' High School", "school", 960, 1260], ["St. Paul's Church Breadfruit", "church", 1170, 1260],
  ["Marina Hotel", "hotel", 1005, 985], ["Total Marina", "fuel", 880, 1000], ["Oando Broad Street", "fuel", 1120, 1260],
  // Onikan and the south of the island
  ["Race Course Park", "park", 1130, 1560], ["Onikan Health Centre", "hospital", 1060, 1490], ["Onikan Police Station", "police", 920, 1600], ["Lagos Stock Exchange", "government", 1180, 1380],
  ["Onikan Stadium", "stadium", 1210, 1480], ["Obalende Bus Terminal", "station", 1150, 1330], ["Obalende Market", "market", 1160, 1350],
  ["NNPC Onikan", "fuel", 960, 1520], ["St. Nicholas Hospital", "hospital", 900, 1480], ["Onikan Mosque", "mosque", 1250, 1560], ["Holy Cross Cathedral", "church", 950, 1370],
  ["Kings College Lagos", "school", 860, 1560], ["Access Bank Onikan", "bank", 1100, 1700], ["Federal Palace Hotel", "hotel", 1180, 1700],
  // Ikoyi and Banana Island
  ["Federal Secretariat Ikoyi", "government", 1450, 1100], ["Ikoyi Park", "park", 1560, 1120], ["Ikoyi Club 1938", "park", 1760, 1330], ["Falomo Police Station", "police", 1400, 1200],
  ["Lagoon Hospital Ikoyi", "hospital", 1650, 1220], ["St. Saviour's Church", "church", 1500, 1320], ["Ikoyi Mosque", "mosque", 1700, 1050], ["Ikoyi Hotels", "hotel", 1560, 1380],
  ["Total Awolowo Road", "fuel", 1460, 1410], ["Stanbic IBTC Ikoyi", "bank", 1620, 1060], ["Corona School Ikoyi", "school", 1720, 1170], ["Banana Island Hotel", "hotel", 1700, 830],
  ["Banana Island Police Post", "police", 1660, 840],
  // Victoria Island
  ["Eko Hotel & Suites", "hotel", 1500, 1700], ["Muri Okunola Park", "park", 1650, 1800], ["Reddington Hospital", "hospital", 1700, 1560], ["Victoria Island Police Station", "police", 1400, 1540],
  ["Oniru Market", "market", 1570, 1710], ["First City Monument Bank VI", "bank", 1450, 1620], ["Access Bank Ahmadu Bello Way", "bank", 1800, 1620], ["Lagos Continental Hotel", "hotel", 1850, 1700],
  ["Christ the Redeemer Church VI", "church", 1380, 1680], ["Victoria Island Central Mosque", "mosque", 1760, 1540], ["Atlantic Hall School", "school", 1900, 1800], ["Mobil Adeola Odeku", "fuel", 1620, 1620],
  ["Victoria Island Fire Station", "fire", 1520, 1790], ["Oniru Government Office", "government", 1840, 1560], ["Bar Beach Park", "park", 1360, 1790],
  // Eko Atlantic
  ["Eko Atlantic Tower", "hotel", 1450, 1890], ["Eko Atlantic Gardens", "park", 1650, 1915], ["Eko Atlantic Bank", "bank", 1550, 1890],
  // Lekki
  ["Lekki Toll Gate Plaza", "station", 2140, 1120], ["Lekki Conservation Centre", "park", 2300, 1350], ["Elegushi Beach", "park", 2150, 1800], ["Circle Mall Lekki", "market", 2160, 1460],
  ["First Foundation Hospital Lekki", "hospital", 2260, 1560], ["Lekki Police Division", "police", 2110, 1260], ["Lekki Phase 1 Mosque", "mosque", 2400, 1250], ["Lekki Baptist Church", "church", 2340, 1560],
  ["Lekki British School", "school", 2480, 1450], ["Lekki Fire Station", "fire", 2220, 1690], ["Four Points Lekki", "hotel", 2420, 1680], ["Oando Lekki", "fuel", 2280, 1160],
  ["Lekki Phase 1 Bank", "bank", 2200, 1560], ["Lekki Local Government Office", "government", 2480, 1180], ["Lekki Deep Sea Port", "port", 2540, 1760],
  // the mainland
  ["National Stadium Surulere", "stadium", 600, 690], ["Randle General Hospital", "hospital", 700, 540], ["Surulere Police Station", "police", 520, 590],
  ["Tejuosho Market", "market", 610, 600], ["Surulere Park", "park", 520, 520], ["Yaba Market", "market", 985, 560], ["Yaba Railway Station", "station", 1090, 600], ["Ebute Metta Railway Station", "station", 880, 660],
  ["Yaba College of Technology", "school", 1000, 470], ["University of Lagos Akoka", "school", 1180, 560], ["Yaba Mainland Hospital", "hospital", 930, 520], ["Yaba Central Mosque", "mosque", 1130, 500],
  ["Our Lady of Apostles Church Yaba", "church", 900, 460], ["Yaba Police Station", "police", 1050, 660], ["Union Bank Yaba", "bank", 960, 610], ["Oando Yaba", "fuel", 860, 560],
  ["Computer Village", "market", 330, 255], ["LASUTH Ikeja", "hospital", 480, 200], ["Lagos State Secretariat Alausa", "government", 560, 130], ["Ikeja Police Command", "police", 380, 300],
  ["Ikeja Bus Terminal", "station", 440, 330], ["Sheraton Ikeja", "hotel", 300, 150], ["Radisson Blu Ikeja", "hotel", 640, 310],
  ["Ikeja Central Mosque", "mosque", 250, 330], ["Ikeja Baptist Church", "church", 540, 340], ["Ikeja Grammar School", "school", 650, 200], ["Access Bank Ikeja", "bank", 420, 250], ["NNPC Ikeja", "fuel", 700, 380],
  ["Ikeja Fire Station", "fire", 150, 250], ["Mushin Market", "market", 200, 640], ["Mushin General Hospital", "hospital", 300, 600], ["Mushin Police Station", "police", 110, 560],
  ["Mushin Central Mosque", "mosque", 330, 700], ["Mushin Assemblies Church", "church", 90, 700], ["Mushin Primary School", "school", 220, 530], ["Oshodi Market", "market", 1120, 250],
  ["Oshodi Bus Terminal", "station", 1060, 330], ["Oshodi Police Station", "police", 1250, 280], ["Oshodi General Hospital", "hospital", 1300, 200], ["Oshodi Mosque", "mosque", 1200, 340],
  ["Oshodi Church of Christ", "church", 970, 200], ["Fidelity Bank Oshodi", "bank", 900, 280], ["Oando Oshodi", "fuel", 1370, 330],
  ["Ojota Park", "station", 1900, 330], ["Ketu Market", "park", 1750, 520], ["Ketu General Hospital", "hospital", 1650, 300], ["Ketu Police Station", "police", 1880, 480], ["Ketu Central Mosque", "mosque", 2100, 250],
  ["Ketu Church", "church", 2300, 450], ["Ketu Secondary School", "school", 2000, 150], ["Ketu Fire Station", "fire", 1600, 150], ["Ikorodu Road Bank", "bank", 1800, 380],
  ["Apapa Port", "port", 300, 1280], ["Tin Can Island Port", "port", 190, 1400], ["Apapa General Hospital", "hospital", 250, 1000], ["Apapa Police Station", "police", 350, 1100], ["Apapa Market", "market", 470, 1050],
  ["Apapa Central Mosque", "mosque", 160, 1120], ["Apapa Church", "church", 400, 940], ["Apapa Grammar School", "school", 220, 900], ["Apapa Fire Station", "fire", 330, 1380], ["Apapa Hotel", "hotel", 130, 1000],
  ["Oando Apapa", "fuel", 440, 1180], ["Apapa Bank", "bank", 200, 1250], ["Apapa Local Government Office", "government", 260, 1150],
  ["Murtala Muhammed Airport", "station", 420, 140], ["Elias Park Ikeja", "park", 700, 260],
];

// ---------------------------------------------------------------- places: put each on the nearest ground that suits it
const places = [];
const taken = new Set();
for (const [name, kind, x, z] of PLACES) {
  if (taken.has(name)) continue;
  taken.add(name);
  const open = ["park", "market", "stadium", "port"].includes(kind);
  let best = null, bestD = 1e9;
  for (let dz = -150; dz <= 150; dz += 6) {
    for (let dx = -150; dx <= 150; dx += 6) {
      const px = x + dx, pz = z + dz;
      const c = at(px, pz);
      const ok = open ? (kind === "market" ? c === MARKET : kind === "port" ? c === BLOCK || c === STREET : c === PARK) : c === BLOCK;
      if (!ok) continue;
      if (!open && !solid(px - 8, pz - 8, px + 8, pz + 8)) continue;
      const d = Math.hypot(dx, dz);
      if (d < bestD) { bestD = d; best = [px, pz]; }
    }
  }
  if (!best) { console.log("no ground for", name); continue; }
  places.push({ name: name.slice(0, 40), kind, x: Math.round(best[0] / CELL * 10) / 10, y: Math.round(best[1] / CELL * 10) / 10 });
}

// ---------------------------------------------------------------- write
const rle = [];
for (let i = 0; i < W * H;) { let j = i; while (j < W * H && g.a[j] === g.a[i] && j - i < 65535) j++; rle.push(g.a[i], (j - i) & 255, (j - i) >> 8); i = j; }
const b64 = Buffer.from(rle).toString("base64");
const HEAD = "// Generated by tools/city/build.mjs (the game's own Lagos: no outside map data). Do not edit by hand.\n";
writeFileSync(join(outDir, "lagosData.ts"), `${HEAD}// The ground of Lagos at ${CELL} m per cell: 0 water, 1 street, 2 built-up ground, 3 park, 5 market.\nexport const LAGOS_CELL = ${CELL};\nexport const LAGOS_W = ${W};\nexport const LAGOS_H = ${H};\nexport interface LagosPlace {\n  name: string;\n  kind: string;\n  /** In cells. */\n  x: number;\n  y: number;\n}\nexport const LAGOS_PLACES: LagosPlace[] = ${JSON.stringify(places, null, 2)};\nexport const LAGOS_RLE = "${b64}";\n`);
const rows = buildings.map((b) => {
  const x0 = Math.round(b.x0 * 10), z0 = Math.round(b.z0 * 10), w = Math.round(b.w * 10), d = Math.round(b.d * 10);
  return [b.kind, b.floors, 0, b.roof, x0, z0, w, 0, 0, d, -w, 0];
});
writeFileSync(join(outDir, "lagosBuildings.ts"), `${HEAD}// One row per building: [kind, floors, yaw in milliradians, roof (1 = pitched), x0, z0 in decimetres, then the other corners as steps].\nexport const LAGOS_BUILDINGS: number[][] = ${JSON.stringify(rows)};\n`);
writeFileSync(join(outDir, "lagosRoads.ts"), `${HEAD}// Street centre lines: [width in dm, x0, z0 in dm, then the other points as steps]. And open paved areas: [x0, z0, steps].\nexport const LAGOS_ROADS: number[][] = ${JSON.stringify(roadRows)};\nexport const LAGOS_PLAZAS: number[][] = [];\n`);
console.log({ roads: roadRows.length, grid: [W, H], blocks, buildings: buildings.length, places: places.length });

const png = process.argv.indexOf("--png");
if (png > 0) {
  const view = new Grid(W, H, CELL);
  view.a.set(g.a);
  for (const b of buildings) for (let z = Math.floor(b.z0 / CELL); z <= Math.floor((b.z0 + b.d) / CELL); z++) for (let x = Math.floor(b.x0 / CELL); x <= Math.floor((b.x0 + b.w) / CELL); x++) view.a[z * W + x] = b.floors > 8 ? 8 : 9;
  for (const p of places) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) view.a[(Math.round(p.y) + dz) * W + Math.round(p.x) + dx] = 7;
  writePng(process.argv[png + 1], view, { 0: [70, 120, 190], 1: [90, 90, 96], 2: [200, 185, 150], 3: [90, 160, 80], 5: [230, 140, 50], 7: [255, 0, 0], 8: [60, 40, 120], 9: [130, 90, 70] });
}
