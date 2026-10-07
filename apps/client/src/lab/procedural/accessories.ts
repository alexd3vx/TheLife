import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { jointPos, type BodyRest } from "./bodyRest";
import { cap, measureHead, sphere, tube } from "./hair";

export interface AccessoryChoice {
  id: string;
  label: string;
  /** Which bone it rides on. */
  bone: "Head" | "neck_01";
}

export const ACCESSORIES: AccessoryChoice[] = [
  { id: "a_round", label: "Round glasses", bone: "Head" },
  { id: "a_square", label: "Square glasses", bone: "Head" },
  { id: "a_shades", label: "Sunglasses", bone: "Head" },
  { id: "a_cap", label: "Cap", bone: "Head" },
  { id: "a_beanie", label: "Beanie", bone: "Head" },
  { id: "a_headband", label: "Headband", bone: "Head" },
  { id: "a_hoops", label: "Hoop earrings", bone: "Head" },
  { id: "a_chain", label: "Chain", bone: "neck_01" },
  { id: "a_tie", label: "Tie", bone: "neck_01" },
];

export const accessoryById = (id: string | null): AccessoryChoice | undefined => ACCESSORIES.find((a) => a.id === id);

export interface AccessoryResult {
  geometry: THREE.BufferGeometry;
  /** A matte or glossy finish, and whether the colour setting applies (shades are always dark, hoops always gold). */
  roughness: number;
  metalness: number;
  fixedColour?: string;
}

const torus = (centre: THREE.Vector3, r: number, tubeR: number, tilt = 0) => {
  const g = new THREE.TorusGeometry(r, tubeR, 8, 28);
  g.rotateY(tilt);
  g.translate(centre.x, centre.y, centre.z);
  return g;
};

/** Builds one accessory in the space of the bone it rides on. */
/** A part built from a primitive has no vertex colours (RGBA, like the hair shapes); give it white ones so it can be merged with a dome that does. */
function withWhiteColor(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!g.getAttribute("color")) g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 4).fill(1), 4));
  return g;
}

export function buildAccessory(rest: BodyRest, id: string): AccessoryResult | null {
  const choice = accessoryById(id);
  if (!choice) return null;
  const h = measureHead(rest);
  let geometry: THREE.BufferGeometry | null = null;
  let roughness = 0.5;
  let metalness = 0.1;
  let fixedColour: string | undefined;
  const eyeY = h.c.y - h.ry * 0.1;
  const eyeZ = h.c.z + h.rz * 0.94;
  switch (id) {
    case "a_round":
    case "a_square":
    case "a_shades": {
      const parts: THREE.BufferGeometry[] = [];
      const spread = h.rx * 0.45;
      const lens = id === "a_round" ? 0.03 : 0.034;
      for (const side of [-1, 1]) {
        const c = new THREE.Vector3(h.c.x + side * spread, eyeY, eyeZ);
        if (id === "a_round") parts.push(torus(c, lens, 0.0032));
        else {
          // a rounded square rim: four short tubes
          const w = lens * 1.05, hgt = lens * 0.8;
          const corners = [new THREE.Vector3(c.x - w, c.y + hgt, c.z), new THREE.Vector3(c.x + w, c.y + hgt, c.z), new THREE.Vector3(c.x + w, c.y - hgt, c.z), new THREE.Vector3(c.x - w, c.y - hgt, c.z), new THREE.Vector3(c.x - w, c.y + hgt, c.z)];
          for (let k = 0; k < 4; k++) parts.push(tube([corners[k]!, corners[k + 1]!], 0.0032, 5, 2, 1));
        }
        if (id === "a_shades") {
          const disc = new THREE.CircleGeometry(lens * 1.02, 20);
          disc.translate(c.x, c.y, c.z + 0.002);
          parts.push(disc);
        }
        // the arm of the glasses, back along the head to the ear
        parts.push(tube([new THREE.Vector3(c.x + side * lens, c.y + 0.004, c.z), new THREE.Vector3(h.c.x + side * h.rx * 0.98, c.y + 0.006, h.c.z + h.rz * 0.35), new THREE.Vector3(h.c.x + side * h.rx * 1.0, c.y - 0.004, h.c.z - h.rz * 0.1)], 0.0028, 5, 8, 2));
      }
      parts.push(tube([new THREE.Vector3(h.c.x - spread + lens, eyeY + 0.006, eyeZ), new THREE.Vector3(h.c.x, eyeY + 0.012, eyeZ + 0.004), new THREE.Vector3(h.c.x + spread - lens, eyeY + 0.006, eyeZ)], 0.0028, 5, 8, 2));
      geometry = mergeGeometries(parts.map((p) => p.toNonIndexed()), false);
      if (id === "a_shades") {
        fixedColour = "#15161a";
        roughness = 0.25;
      }
      metalness = 0.4;
      break;
    }
    case "a_cap": {
      const dome = cap(h, { scale: [1.08, 1.1, 1.09], front: 0.72, side: 0.5, back: 0.15, bump: 0, lift: 0.004 });
      const brim = new THREE.SphereGeometry(1, 24, 8, 0, Math.PI, 0, Math.PI / 2);
      brim.scale(h.rx * 1.05, 0.006, h.rz * 0.8);
      brim.rotateY(Math.PI);
      brim.translate(h.c.x, h.c.y + h.ry * 0.28, h.c.z + h.rz * 0.92);
      brim.rotateX(0);
      geometry = mergeGeometries([dome.toNonIndexed(), withWhiteColor(brim.toNonIndexed())], false);
      roughness = 0.85;
      break;
    }
    case "a_beanie": {
      const dome = cap(h, { scale: [1.12, 1.14, 1.13], front: 0.55, side: 0.2, back: 0.0, bump: 0.002, lift: 0.006 });
      const pom = sphere(new THREE.Vector3(h.c.x, h.c.y + h.ry * 1.16, h.c.z), [0.03, 0.03, 0.03], 0.04);
      geometry = mergeGeometries([dome.toNonIndexed(), withWhiteColor(pom.toNonIndexed())], false);
      roughness = 0.95;
      break;
    }
    case "a_headband": {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 36; k++) {
        const u = (k / 36) * Math.PI * 2;
        pts.push(new THREE.Vector3(h.c.x + Math.sin(u) * h.rx * 1.06, h.c.y + h.ry * 0.5, h.c.z + Math.cos(u) * h.rz * 1.06));
      }
      geometry = tube(pts, 0.014, 6, 72, 4);
      roughness = 0.9;
      break;
    }
    case "a_hoops": {
      const parts: THREE.BufferGeometry[] = [];
      for (const side of [-1, 1]) {
        const g = new THREE.TorusGeometry(0.017, 0.0026, 8, 20);
        g.rotateY(Math.PI / 2);
        g.translate(h.c.x + side * h.rx * 1.02, h.c.y - h.ry * 0.38, h.c.z - h.rz * 0.04);
        parts.push(g);
      }
      geometry = mergeGeometries(parts, false);
      fixedColour = "#d9b24a";
      metalness = 0.9;
      roughness = 0.25;
      break;
    }
    case "a_chain": {
      // a necklace hanging round the base of the neck, in the neck bone's own space
      const neck = jointPos(rest, "neck_01");
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 32; k++) {
        const u = (k / 32) * Math.PI * 2;
        const dip = Math.max(0, Math.cos(u)) * 0.06;
        pts.push(new THREE.Vector3(neck.x + Math.sin(u) * 0.085, neck.y - 0.025 - dip, neck.z + Math.cos(u) * 0.085));
      }
      geometry = tube(pts, 0.0035, 5, 64, 6);
      fixedColour = "#d9b24a";
      metalness = 0.9;
      roughness = 0.25;
      break;
    }
    default:
      return null;
  }
  if (!geometry) return null;
  const bone = rest.toBoneSpace(choice.bone);
  if (!bone) return null;
  geometry.applyMatrix4(bone);
  geometry.computeVertexNormals();
  return { geometry, roughness, metalness, fixedColour };
}
