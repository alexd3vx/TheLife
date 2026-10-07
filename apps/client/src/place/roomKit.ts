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

/** What every interior hands back: its 3D group, where the customer and the staff member stand. */
export interface PlaceRoom {
  group: THREE.Group;
  playerAt: THREE.Vector3;
  staffAt: THREE.Vector3;
  update(dt: number): void;
}
