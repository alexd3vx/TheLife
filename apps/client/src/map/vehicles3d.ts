import * as THREE from "three";

/**
 * The Lagos vehicles the free car kits do not have, built as real 3D shapes: the okada (a motorbike with its rider) and the keke
 * (a yellow three-wheeler). Round wheels and tyres, a tank, a seat, handlebars, lamps, a canopy; vertex-coloured, one geometry each,
 * the front towards +z, the wheels on the ground. Used by the street traffic and by the ride scene.
 */

const C = (hex: string) => new THREE.Color(hex);

class Parts {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly col: number[] = [];

  add(geo: THREE.BufferGeometry, colour: THREE.Color, m: THREE.Matrix4): void {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()) as THREE.BufferGeometry;
    g.applyMatrix4(m);
    g.computeVertexNormals();
    const p = g.getAttribute("position"), n = g.getAttribute("normal");
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      this.col.push(colour.r, colour.g, colour.b);
    }
    g.dispose();
    geo.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const M = new THREE.Matrix4();
const place = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  M.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)).clone();

/** A wheel standing on the ground: a tyre, a rim and a hub, its axle along x. */
function wheel(p: Parts, x: number, z: number, r: number, w: number) {
  p.add(new THREE.CylinderGeometry(r, r, w, 20), C("#17181b"), place(x, r, z, 0, 0, Math.PI / 2));
  p.add(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w * 1.04, 16), C("#a9aeb6"), place(x, r, z, 0, 0, Math.PI / 2));
  p.add(new THREE.CylinderGeometry(r * 0.2, r * 0.2, w * 1.2, 10), C("#4b4f57"), place(x, r, z, 0, 0, Math.PI / 2));
}

/** An okada: a motorbike with its rider in a helmet and a bright shirt. 2.1 m long. */
export function buildOkada(): THREE.BufferGeometry {
  const p = new Parts();
  const red = C("#c9372e"), black = C("#1c1d21"), steel = C("#9096a0"), skin = C("#6b4630"), shirt = C("#e8b21c"), jeans = C("#2b3a5c");
  wheel(p, 0, 0.78, 0.34, 0.12);
  wheel(p, 0, -0.78, 0.34, 0.14);
  // frame, engine, tank, seat
  p.add(new THREE.BoxGeometry(0.2, 0.34, 0.5), steel, place(0, 0.5, 0.05));
  p.add(new THREE.CapsuleGeometry(0.15, 0.4, 4, 10), red, place(0, 0.92, 0.2, Math.PI / 2, 0, 0));
  p.add(new THREE.BoxGeometry(0.26, 0.12, 0.8), black, place(0, 0.84, -0.42));
  p.add(new THREE.BoxGeometry(0.24, 0.1, 0.34), black, place(0, 0.8, -0.95));
  // front fork, handlebars, lamp, mudguards, exhaust
  p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.78, 8), steel, place(0, 0.66, 0.74, -0.3, 0, 0));
  p.add(new THREE.CylinderGeometry(0.025, 0.025, 0.62, 8), black, place(0, 1.1, 0.62, 0, 0, Math.PI / 2));
  p.add(new THREE.SphereGeometry(0.1, 12, 10), C("#fff2b8"), place(0, 1.02, 0.84));
  p.add(new THREE.BoxGeometry(0.12, 0.03, 0.4), red, place(0, 0.74, 0.9, -0.2));
  p.add(new THREE.BoxGeometry(0.14, 0.03, 0.4), red, place(0, 0.72, -0.98, 0.2));
  p.add(new THREE.CylinderGeometry(0.05, 0.04, 0.8, 10), steel, place(0.2, 0.34, -0.5, Math.PI / 2, 0, 0));
  p.add(new THREE.BoxGeometry(0.1, 0.06, 0.03), C("#d8322d"), place(0, 0.8, -1.12));
  // the rider: legs, body, arms to the bars, head in a helmet
  for (const s of [-1, 1]) {
    p.add(new THREE.CapsuleGeometry(0.075, 0.46, 4, 8), jeans, place(s * 0.17, 0.86, -0.18, -0.9, 0, 0));
    p.add(new THREE.CapsuleGeometry(0.06, 0.4, 4, 8), shirt, place(s * 0.27, 1.34, 0.28, -1.0, 0, s * 0.18));
  }
  p.add(new THREE.CapsuleGeometry(0.16, 0.36, 4, 10), shirt, place(0, 1.3, -0.12, 0.35, 0, 0));
  p.add(new THREE.SphereGeometry(0.115, 12, 10), skin, place(0, 1.68, 0.06));
  p.add(new THREE.SphereGeometry(0.135, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), C("#f2f2ee"), place(0, 1.72, 0.06));
  return p.build();
}

/** A keke: the yellow three-wheeler, a rounded cab, a black canopy over the back, a windscreen, a lamp. 2.7 m long. */
export function buildKeke(): THREE.BufferGeometry {
  const p = new Parts();
  const yellow = C("#f2c230"), black = C("#1b1c20"), glass = C("#8fb4d6"), steel = C("#9096a0");
  wheel(p, 0, 0.98, 0.26, 0.12);
  wheel(p, -0.6, -0.72, 0.26, 0.14);
  wheel(p, 0.6, -0.72, 0.26, 0.14);
  // chassis and the lower body, rounded at the front
  p.add(new THREE.BoxGeometry(1.3, 0.14, 2.3), black, place(0, 0.34, 0.05));
  p.add(new THREE.BoxGeometry(1.34, 0.46, 1.5), yellow, place(0, 0.66, -0.35));
  p.add(new THREE.CylinderGeometry(0.4, 0.4, 0.46, 18, 1, false, -Math.PI / 2, Math.PI), yellow, place(0, 0.66, 0.4, 0, 0, 0, 1, 1, 1));
  p.add(new THREE.BoxGeometry(0.8, 0.44, 0.4), yellow, place(0, 0.62, 0.62));
  p.add(new THREE.SphereGeometry(0.36, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), yellow, place(0, 0.84, 0.75, 0, 0, 0, 1, 0.8, 1.1));
  // windscreen, canopy on four posts, seat, handlebars, lamp, mirrors
  p.add(new THREE.BoxGeometry(0.96, 0.52, 0.04), glass, place(0, 1.18, 0.5, -0.35, 0, 0));
  p.add(new THREE.BoxGeometry(1.4, 0.07, 1.7), black, place(0, 1.78, -0.28));
  p.add(new THREE.BoxGeometry(1.3, 0.05, 0.4), black, place(0, 1.76, 0.62, 0.18, 0, 0));
  for (const [x, z] of [[-0.64, 0.5], [0.64, 0.5], [-0.64, -1.08], [0.64, -1.08]] as const) p.add(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 8), black, place(x, 1.28, z));
  p.add(new THREE.BoxGeometry(1.1, 0.14, 0.46), black, place(0, 0.96, -0.6));
  p.add(new THREE.BoxGeometry(1.1, 0.4, 0.1), black, place(0, 1.2, -0.84));
  p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 8), steel, place(0, 1.04, 0.52, 0, 0, Math.PI / 2));
  p.add(new THREE.SphereGeometry(0.09, 12, 10), C("#fff2b8"), place(0, 0.78, 1.17));
  for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.16, 0.1, 0.05), C("#d8322d"), place(s * 0.5, 0.6, -1.12));
  return p.build();
}
