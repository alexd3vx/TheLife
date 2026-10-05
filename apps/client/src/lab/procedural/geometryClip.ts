import * as THREE from "three";

// Small triangle-soup toolkit used to cut garments out of the body mesh with clean, straight edges.

export interface Vertex {
  p: [number, number, number];
  n: [number, number, number];
  uv: [number, number];
  si: [number, number, number, number];
  sw: [number, number, number, number];
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

/** Keeps the part of each triangle where  axis·p + offset >= 0 , cutting triangles that straddle the plane. */
export function clipPlane(triangles: Triangle[], axis: [number, number, number], offset: number): Triangle[] {
  const dist = (v: Vertex) => axis[0] * v.p[0] + axis[1] * v.p[1] + axis[2] * v.p[2] + offset;
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

export interface BuildOptions {
  /** Push every vertex outward along its normal (metres) so the garment sits above the skin. */
  offset: number;
  /** Optional per-vertex tweak after offsetting (e.g. flatten a sole). */
  adjust?: (p: THREE.Vector3, n: THREE.Vector3) => void;
  /** UV projection scale for tileable fabric textures. */
  uvScale: number;
}

/** Builds a skinned-ready BufferGeometry. UVs are re-projected (box projection) so fabric textures tile. */
export function buildGeometry(triangles: Triangle[], options: BuildOptions): THREE.BufferGeometry {
  const count = triangles.length * 3;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
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
  return geometry;
}
