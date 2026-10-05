import * as THREE from "three";
import type { Rng } from "./rng";

const SKIN = ["#3b2417", "#5a3825", "#7a4e33", "#a06c48"];
const TOPS = ["#c4543f", "#e8c35a", "#2f7f6d", "#f3efe6", "#3b5b9a", "#8c3f8f", "#d9772b"];
const BOTTOMS = ["#232a35", "#3a3a3a", "#5a4632", "#1f3a5a"];
const HAIR = ["#0d0907", "#1a1210", "#2a1b12"];

export interface Person {
  object: THREE.Group;
  legs: [THREE.Mesh, THREE.Mesh];
  arms: [THREE.Mesh, THREE.Mesh];
  speed: number;
  direction: 1 | -1;
}

function material(color: string, roughness = 0.85) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

export function createPerson(rng: Rng): Person {
  const object = new THREE.Group();
  const height = rng.range(0.92, 1.08);
  const skin = material(rng.pick(SKIN), 0.6);
  const top = material(rng.pick(TOPS));
  const bottom = material(rng.pick(BOTTOMS));

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.19, 0.62, 12), top);
  torso.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), skin);
  head.position.y = 1.62;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), material(rng.pick(HAIR)));
  hair.position.y = 1.65;
  object.add(torso, head, hair);

  const makeLimb = (radius: number, length: number, mat: THREE.Material, x: number, y: number) => {
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.85, length, 8), mat);
    limb.geometry.translate(0, -length / 2, 0);
    limb.position.set(0, y, x);
    object.add(limb);
    return limb;
  };
  const legs: [THREE.Mesh, THREE.Mesh] = [
    makeLimb(0.09, 0.85, bottom, 0.1, 0.85),
    makeLimb(0.09, 0.85, bottom, -0.1, 0.85),
  ];
  const arms: [THREE.Mesh, THREE.Mesh] = [
    makeLimb(0.065, 0.58, top, 0.27, 1.42),
    makeLimb(0.065, 0.58, top, -0.27, 1.42),
  ];

  object.scale.setScalar(height);
  object.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return { object, legs, arms, speed: rng.range(0.9, 1.5), direction: rng.chance(0.5) ? 1 : -1 };
}

/** Swing legs and arms; `phase` advances with distance walked. */
export function animateWalk(person: Person, phase: number) {
  const swing = Math.sin(phase) * 0.55;
  person.legs[0].rotation.z = swing;
  person.legs[1].rotation.z = -swing;
  person.arms[0].rotation.z = -swing * 0.7;
  person.arms[1].rotation.z = swing * 0.7;
}
