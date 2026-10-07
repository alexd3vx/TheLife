import * as THREE from "three";

/** Small helpers the place interiors share. */

export function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  t.anisotropy = 4;
  return t;
}

export const std = (color: string, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

/** A flat rectangle on the floor (x and z, in metres) that people cannot walk through. */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
export const rect = (cx: number, cz: number, w: number, d: number): Rect => ({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });

/** Somewhere to stand to use something: the counter, a cash machine, a socket. `focus` says which part of the service sheet it opens. */
export interface Spot {
  id: string;
  /** The button the player sees when they stand here ("Talk to the teller"). */
  label: string;
  x: number;
  z: number;
  /** How close you must be, in metres. */
  r: number;
  /** Which way the character turns to face the thing (radians; 0 faces the camera, PI faces the back wall). */
  face: number;
  focus: string;
}

export interface StaffSpec {
  x: number;
  z: number;
  /** Height of the floor they stand on (a platform). */
  y?: number;
  yaw: number;
  clip: string;
  greeting: string;
}

/** What every interior hands back: its 3D group, a walkable floor with things in the way, the spots that open a menu, who works there and where visitors wander. */
export interface PlaceRoom {
  group: THREE.Group;
  /** Where you appear (just inside the door). */
  spawn: THREE.Vector3;
  /** The walkable floor. */
  bounds: Rect;
  blockers: Rect[];
  /** Walk into this to go back out to the street. */
  door: Rect;
  spots: Spot[];
  staff: StaffSpec[];
  /** Places the other people in the room walk between. */
  waypoints: [number, number][];
  /** How many other visitors are there on an ordinary day. */
  visitors: number;
  update(dt: number): void;
}
