import * as THREE from "three";

// Small triangle-soup toolkit used to cut garments out of the body mesh with clean, straight edges.

export interface Vertex {
  p: [number, number, number];
  n: [number, number, number];
  uv: [number, number];
  si: [number, number, number, number];
  sw: [number, number, number, number];
  /** Baked shading: 1 open cloth, lower in creases and along stitched edges (set by the smoothing pass). */
  shade?: number;
}

export type Triangle = [Vertex, Vertex, Vertex];

function vertexAt(g: THREE.BufferGeometry, i: number): Vertex {
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const uv = g.getAttribute("uv");
  const si = g.getAttribute("skinIndex");
  const sw = g.getAttribute("skinWeight");
  return {
    p: [pos.getX(i), pos.getY(i), pos.getZ(i)],
    n: [nor.getX(i), nor.getY(i), nor.getZ(i)],
    uv: [uv.getX(i), uv.getY(i)],
    si: [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)],
    sw: [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)],
  };
}

/** Takes the triangles whose three vertices all pass `keepVertex` (given the vertex index). */
export function extractTriangles(g: THREE.BufferGeometry, keepVertex: (index: number) => boolean): Triangle[] {
  const index = g.index;
  if (!index) throw new Error("Geometry must be indexed");
  const out: Triangle[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    if (keepVertex(a) && keepVertex(b) && keepVertex(c)) out.push([vertexAt(g, a), vertexAt(g, b), vertexAt(g, c)]);
  }
  return out;
}

function mix(a: Vertex, b: Vertex, t: number): Vertex {
  const lerp3 = (x: number[], y: number[]) => [x[0]! + (y[0]! - x[0]!) * t, x[1]! + (y[1]! - x[1]!) * t, x[2]! + (y[2]! - x[2]!) * t] as [number, number, number];
  const nearest = t < 0.5 ? a : b; // bone indices/weights can't be blended, so take the closer endpoint
  const n = lerp3(a.n, b.n);
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  return {
    p: lerp3(a.p, b.p),
    n: [n[0] / len, n[1] / len, n[2] / len],
    uv: [a.uv[0] + (b.uv[0] - a.uv[0]) * t, a.uv[1] + (b.uv[1] - a.uv[1]) * t],
    si: [...nearest.si] as Vertex["si"],
    sw: [...nearest.sw] as Vertex["sw"],
  };
}

/**
 * Keeps the part of each triangle where `field(p) >= 0`, cutting triangles that straddle the boundary along the line
 * where the field (interpolated along each edge) crosses zero. A signed distance works best.
 */
export function clipField(triangles: Triangle[], field: (p: [number, number, number]) => number): Triangle[] {
  const dist = (v: Vertex) => field(v.p);
  const out: Triangle[] = [];
  for (const tri of triangles) {
    const d = [dist(tri[0]), dist(tri[1]), dist(tri[2])] as const;
    const inside = d.map((x) => x >= 0);
    const count = inside.filter(Boolean).length;
    if (count === 3) {
      out.push(tri);
      continue;
    }
    if (count === 0) continue;

    const polygon: Vertex[] = [];
    for (let i = 0; i < 3; i++) {
      const a = tri[i]!;
      const b = tri[(i + 1) % 3]!;
      const da = d[i]!;
      const db = d[(i + 1) % 3]!;
      if (da >= 0) polygon.push(a);
      if (da >= 0 !== db >= 0) polygon.push(mix(a, b, da / (da - db)));
    }
    for (let i = 1; i + 1 < polygon.length; i++) out.push([polygon[0]!, polygon[i]!, polygon[i + 1]!]);
  }
  return out;
}

/** Keeps the part of each triangle where  axis·p + offset >= 0 , cutting triangles that straddle the plane. */
export function clipPlane(triangles: Triangle[], axis: [number, number, number], offset: number): Triangle[] {
  return clipField(triangles, (p) => axis[0] * p[0] + axis[1] * p[1] + axis[2] * p[2] + offset);
}

export interface BuildOptions {
  /** Push every vertex outward along its normal (metres) so the garment sits above the skin. */
  offset: number;
  /** Optional per-vertex tweak after offsetting (e.g. flatten a sole). */
  adjust?: (p: THREE.Vector3, n: THREE.Vector3) => void;
  /** UV projection scale for tileable fabric textures. */
  uvScale: number;
  /** Rounds of smoothing over the garment's surface (0 = follow the body exactly). Cloth hangs smoothly; it doesn't copy every muscle. */
  smooth?: number;
  /** How far the smoothing pulls inward at most, so a smoothed garment never sinks into the body. */
}

/** Builds a skinned-ready BufferGeometry. UVs are re-projected (box projection) so fabric textures tile. */
/** Smooths the corners of the triangles in place (shared corners are found by position), keeping the surface outside the original. */
function smoothTriangles(triangles: Triangle[], rounds: number): void {
  const key = (p: number[]) => `${Math.round(p[0]! * 2000)},${Math.round(p[1]! * 2000)},${Math.round(p[2]! * 2000)}`;
  const ids = new Map<string, number>();
  const pos: THREE.Vector3[] = [];
  const nor: THREE.Vector3[] = [];
  const nbr: Set<number>[] = [];
  const idOf = (v: Vertex) => {
    const k = key(v.p);
    let id = ids.get(k);
    if (id === undefined) {
      id = pos.length;
      ids.set(k, id);
      pos.push(new THREE.Vector3(...v.p));
      nor.push(new THREE.Vector3(...v.n));
      nbr.push(new Set());
    } else nor[id]!.add(new THREE.Vector3(...v.n));
    return id;
  };
  const tri = triangles.map((t) => t.map(idOf) as [number, number, number]);
  for (const [a, b, c] of tri) {
    nbr[a]!.add(b).add(c);
    nbr[b]!.add(a).add(c);
    nbr[c]!.add(a).add(b);
  }
  nor.forEach((n) => n.normalize());
  // vertices on the cut edges (hems, sleeve ends, neckline) have fewer neighbours: keep them where they are so the cuts stay clean
  const edgeCount = new Map<string, number>();
  for (const [a, b, c] of tri) for (const [x, y] of [[a, b], [b, c], [c, a]] as const) {
    const e = x < y ? `${x}_${y}` : `${y}_${x}`;
    edgeCount.set(e, (edgeCount.get(e) ?? 0) + 1);
  }
  const border = new Set<number>();
  for (const [e, n] of edgeCount) if (n === 1) for (const part of e.split("_")) border.add(Number(part));
  let cur = pos.map((p) => p.clone());
  for (let r = 0; r < rounds; r++) {
    const next = cur.map((p, i) => {
      if (border.has(i)) return p;
      const avg = new THREE.Vector3();
      for (const j of nbr[i]!) avg.add(cur[j]!);
      avg.divideScalar(Math.max(1, nbr[i]!.size));
      return p.clone().lerp(avg, 0.6);
    });
    cur = next;
  }
  // write back, and smooth the normals the same way (lighting reads the shape, so muscles stop showing through the cloth)
  let nn = nor.map((n) => n.clone());
  for (let r = 0; r < rounds; r++) nn = nn.map((n, i) => {
    const avg = n.clone();
    for (const j of nbr[i]!) avg.add(nn[j]!);
    return avg.normalize();
  });
  // baked shading: darker where the cloth bridges a hollow (the smoothed surface stands off the body), and along the cut edges and one
  // ring inside them (hems, cuffs, necklines look stitched)
  const nearBorder = new Set<number>(border);
  for (const b of border) for (const j of nbr[b]!) nearBorder.add(j);
  triangles.forEach((t, ti) => t.forEach((v, k) => {
    const id = tri[ti]![k]!;
    const stand = Math.max(0, cur[id]!.clone().sub(pos[id]!).dot(nor[id]!));
    v.shade = Math.max(0.55, 1 - Math.min(0.4, stand * 14)) * (border.has(id) ? 0.8 : nearBorder.has(id) ? 0.93 : 1);
  }));
  triangles.forEach((t, ti) => t.forEach((v, k) => {
    const id = tri[ti]![k]!;
    // never move inward past the body: only keep a point if it is at or outside where the body was along its normal
    const moved = cur[id]!.clone();
    const orig = pos[id]!;
    const out = moved.clone().sub(orig).dot(nor[id]!);
    if (out < 0) moved.addScaledVector(nor[id]!, -out);
    v.p = [moved.x, moved.y, moved.z];
    v.n = [nn[id]!.x, nn[id]!.y, nn[id]!.z];
  }));
}

export function buildGeometry(triangles: Triangle[], options: BuildOptions): THREE.BufferGeometry {
  if (options.smooth) {
    // work on copies: the same triangles also decide which skin to hide
    triangles = triangles.map((t) => t.map((v) => ({ ...v, p: [...v.p], n: [...v.n] })) as unknown as Triangle);
    smoothTriangles(triangles, options.smooth);
  }
  const count = triangles.length * 3;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const color = new Float32Array(count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();

  let v = 0;
  for (const tri of triangles) {
    // Box projection per triangle, from the face normal's strongest axis.
    const e1 = new THREE.Vector3(...tri[1].p).sub(new THREE.Vector3(...tri[0].p));
    const e2 = new THREE.Vector3(...tri[2].p).sub(new THREE.Vector3(...tri[0].p));
    const fn = e1.cross(e2).normalize();
    const ax = Math.abs(fn.x);
    const ay = Math.abs(fn.y);
    const az = Math.abs(fn.z);
    const mode = ax > ay && ax > az ? 0 : ay > az ? 1 : 2;

    for (const vert of tri) {
      p.set(...vert.p);
      n.set(...vert.n);
      p.addScaledVector(n, options.offset);
      options.adjust?.(p, n);
      position.set([p.x, p.y, p.z], v * 3);
      normal.set([n.x, n.y, n.z], v * 3);
      const s = options.uvScale;
      const coords = mode === 0 ? [p.z * s, p.y * s] : mode === 1 ? [p.x * s, p.z * s] : [p.x * s, p.y * s];
      uv.set(coords, v * 2);
      const shade = vert.shade ?? 1;
      color.set([shade, shade, shade], v * 3);
      skinIndex.set(vert.si, v * 4);
      skinWeight.set(vert.sw, v * 4);
      v++;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute("skinIndex", new THREE.BufferAttribute(skinIndex, 4));
  geometry.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeight, 4));
  geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
  geometry.setAttribute("sway", new THREE.BufferAttribute(new Float32Array(count), 1));
  return geometry;
}
