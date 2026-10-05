import * as THREE from "three";

/** Collects flat-shaded, vertex-coloured triangles and turns them into one geometry (one draw call for a whole chunk). */
export class MeshBuilder {
  private readonly pos: number[] = [];
  private readonly col: number[] = [];
  private readonly uv: number[] = [];

  get triangles(): number {
    return this.pos.length / 9;
  }

  tri(a: THREE.Vector3Like, b: THREE.Vector3Like, c: THREE.Vector3Like, ca: THREE.Color, cb = ca, cc = ca): void {
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  }

  /** A quad (a, b, c, d in order) that faces `outward`; the winding is fixed up if needed. */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, outward: THREE.Vector3Like, color: THREE.Color, bottom = color, top = color): void {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const flip = n.x * outward.x + n.y * outward.y + n.z * outward.z < 0;
    // a-b along the bottom edge, c-d along the top edge: colours follow the heights.
    const ca = bottom, cb = bottom, cc = top, cd = top;
    if (!flip) {
      this.tri(a, b, c, ca, cb, cc);
      this.tri(a, c, d, ca, cc, cd);
    } else {
      this.tri(a, c, b, ca, cc, cb);
      this.tri(a, d, c, ca, cd, cc);
    }
  }

  /** An axis-aligned box. The bottom is left out (nobody sees it). `shade` darkens the foot of the walls a little. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: THREE.Color, shade = 0.82): void {
    const low = color.clone().multiplyScalar(shade);
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    this.quad(V(x0, y0, z0), V(x1, y0, z0), V(x1, y1, z0), V(x0, y1, z0), { x: 0, y: 0, z: -1 }, color, low, color);
    this.quad(V(x1, y0, z0), V(x1, y0, z1), V(x1, y1, z1), V(x1, y1, z0), { x: 1, y: 0, z: 0 }, color, low, color);
    this.quad(V(x1, y0, z1), V(x0, y0, z1), V(x0, y1, z1), V(x1, y1, z1), { x: 0, y: 0, z: 1 }, color, low, color);
    this.quad(V(x0, y0, z1), V(x0, y0, z0), V(x0, y1, z0), V(x0, y1, z1), { x: -1, y: 0, z: 0 }, color, low, color);
    const lit = color.clone().multiplyScalar(1.06);
    this.quad(V(x0, y1, z0), V(x1, y1, z0), V(x1, y1, z1), V(x0, y1, z1), { x: 0, y: 1, z: 0 }, lit, lit, lit);
  }

  /** A flat horizontal rectangle facing up. With `uvScale` the texture repeats every that many metres (world-space UVs). */
  flat(x0: number, z0: number, x1: number, z1: number, y: number, color: THREE.Color, uvScale?: number): void {
    const V = (x: number, z: number) => new THREE.Vector3(x, y, z);
    this.quad(V(x0, z0), V(x1, z0), V(x1, z1), V(x0, z1), { x: 0, y: 1, z: 0 }, color);
    if (uvScale) {
      const u = (x: number, z: number) => this.uv.push(x / uvScale, z / uvScale);
      // quad() pushes six vertices, in a-b-c / a-c-d order (or the flipped order): map by position.
      const n = this.pos.length / 3;
      for (let i = n - 6; i < n; i++) u(this.pos[i * 3]!, this.pos[i * 3 + 2]!);
    }
  }

  /** Adds any three.js geometry (a dome, say) transformed by `matrix` and painted one colour (lit a little from above). */
  geometry(geo: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    g.computeVertexNormals();
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    for (let i = 0; i < p.count; i++) {
      const lit = 0.8 + 0.25 * Math.max(0, n.getY(i));
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.col.push(color.r * lit, color.g * lit, color.b * lit);
    }
    g.dispose();
  }

  build(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv.length && this.uv.length / 2 === this.pos.length / 3) g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals(); // non-indexed: one normal per face, so flat shading
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
