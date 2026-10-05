import * as THREE from "three";
import type { Facing, Rect } from "@thelife/game-core";
import type { MeshBuilder } from "./meshBuilder";

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const OUT: Record<Facing, THREE.Vector3Like> = { 0: { x: 0, y: 0, z: -1 }, 1: { x: 1, y: 0, z: 0 }, 2: { x: 0, y: 0, z: 1 }, 3: { x: -1, y: 0, z: 0 } };

/** A rectangle on a wall: `u0..u1` along the wall from its start, `v0..v1` up, pushed `off` metres out from the surface. */
export function wallRect(b: MeshBuilder, fp: Rect, side: Facing, u0: number, u1: number, v0: number, v1: number, off: number, color: THREE.Color) {
  let p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3;
  if (side === 0) {
    const z = fp.minZ - off;
    [p0, p1, p2, p3] = [V(fp.minX + u0, v0, z), V(fp.minX + u1, v0, z), V(fp.minX + u1, v1, z), V(fp.minX + u0, v1, z)];
  } else if (side === 2) {
    const z = fp.maxZ + off;
    [p0, p1, p2, p3] = [V(fp.minX + u0, v0, z), V(fp.minX + u1, v0, z), V(fp.minX + u1, v1, z), V(fp.minX + u0, v1, z)];
  } else if (side === 1) {
    const x = fp.maxX + off;
    [p0, p1, p2, p3] = [V(x, v0, fp.minZ + u0), V(x, v0, fp.minZ + u1), V(x, v1, fp.minZ + u1), V(x, v1, fp.minZ + u0)];
  } else {
    const x = fp.minX - off;
    [p0, p1, p2, p3] = [V(x, v0, fp.minZ + u0), V(x, v0, fp.minZ + u1), V(x, v1, fp.minZ + u1), V(x, v1, fp.minZ + u0)];
  }
  b.quad(p0, p1, p2, p3, OUT[side], color);
}

