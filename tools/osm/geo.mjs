// Geometry helpers for the OSM import: projection, joining ways into rings, filling polygons and drawing wide lines on a grid.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

/** Metres east / south of an origin (lat0 = top edge, lon0 = left edge). A flat projection is plenty for a few kilometres. */
export function projector(lat0, lon0) {
  const kLat = 110574, kLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return (lat, lon) => [(lon - lon0) * kLon, (lat0 - lat) * kLat];
}

/** Joins ways (arrays of node ids) end to end into closed rings. Returns arrays of node ids. Open leftovers are dropped. */
export function stitch(wayNodeLists) {
  const rings = [];
  const pool = wayNodeLists.filter((w) => w.length > 1).map((w) => [...w]);
  while (pool.length) {
    let cur = pool.pop();
    let grew = true;
    while (grew && cur[0] !== cur[cur.length - 1]) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i];
        if (w[0] === cur[cur.length - 1]) cur = cur.concat(w.slice(1));
        else if (w[w.length - 1] === cur[cur.length - 1]) cur = cur.concat(w.slice(0, -1).reverse());
        else if (w[w.length - 1] === cur[0]) cur = w.concat(cur.slice(1));
        else if (w[0] === cur[0]) cur = w.slice(1).reverse().concat(cur);
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (cur.length > 3 && cur[0] === cur[cur.length - 1]) rings.push(cur);
  }
  return rings;
}

export function area(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return a / 2;
}

/** A grid of bytes with the drawing operations the import needs. Coordinates are metres; `cell` is metres per cell. */
export class Grid {
  constructor(width, height, cell) {
    this.w = width;
    this.h = height;
    this.cell = cell;
    this.a = new Uint8Array(width * height);
  }
  /** Fills the inside of rings (even-odd, so holes work) with a value. */
  fillRings(rings, value) {
    const { w, h, cell } = this;
    const edges = [];
    for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) edges.push([r[j][0] / cell, r[j][1] / cell, r[i][0] / cell, r[i][1] / cell]);
    let minY = Infinity, maxY = -Infinity;
    for (const e of edges) { minY = Math.min(minY, e[1], e[3]); maxY = Math.max(maxY, e[1], e[3]); }
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(h - 1, Math.ceil(maxY)); y++) {
      const cy = y + 0.5, xs = [];
      for (const [x0, y0, x1, y1] of edges) if (y0 > cy !== y1 > cy) xs.push(x0 + ((cy - y0) / (y1 - y0)) * (x1 - x0));
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
        for (let x = a; x <= b; x++) this.a[y * w + x] = value;
      }
    }
  }
  /** Draws a line of the given width (metres), stamping `value`; `only` restricts it to cells that currently hold one of those values. */
  line(pts, width, value, only = null) {
    const { w, h, cell } = this;
    const r = Math.max(0.5, width / 2 / cell);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0] = [pts[i][0] / cell, pts[i][1] / cell], [x1, y1] = [pts[i + 1][0] / cell, pts[i + 1][1] / cell];
      const len = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(1, Math.ceil(len / 0.5));
      for (let s = 0; s <= steps; s++) {
        const cx = x0 + ((x1 - x0) * s) / steps, cy = y0 + ((y1 - y0) * s) / steps;
        for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
          if (y < 0 || y >= h) continue;
          for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
            if (x < 0 || x >= w) continue;
            if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue;
            const i2 = y * w + x;
            if (only && !only.includes(this.a[i2])) continue;
            this.a[i2] = value;
          }
        }
      }
    }
  }
}

/** Writes an RGB picture (for looking at the result). palette maps a grid value to [r, g, b]. */
export function writePng(path, grid, palette) {
  const { w, h, a } = grid;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const c = palette[a[y * w + x]] ?? [255, 0, 255];
      raw.set(c, y * (w * 3 + 1) + 1 + x * 3);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}
