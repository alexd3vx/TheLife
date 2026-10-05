import * as THREE from "three";
import type { Rng } from "./rng";
import { makeConcreteTexture, makeGroundTexture, makeRoadTexture } from "./textures";

export const ROAD_WIDTH = 12;
export const SIDEWALK_WIDTH = 3;
/** Distance from street centre to where building fronts start. */
export const FRONT_LINE = ROAD_WIDTH / 2 + SIDEWALK_WIDTH + 0.5;
export const CROSS_STREET_X = 20;
export const CROSS_STREET_WIDTH = 10;

export function createStreet(rng: Rng, length: number): THREE.Group {
  const street = new THREE.Group();

  const groundTexture = makeGroundTexture(rng);
  groundTexture.repeat.set(70, 70);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  street.add(ground);

  const roadTexture = makeRoadTexture(rng);
  roadTexture.repeat.set(length / ROAD_WIDTH, 1);
  const roadMaterial = new THREE.MeshStandardMaterial({ map: roadTexture, roughness: 0.92 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(length, ROAD_WIDTH), roadMaterial);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.02;
  road.receiveShadow = true;
  street.add(road);

  const crossTexture = roadTexture.clone();
  crossTexture.needsUpdate = true;
  crossTexture.repeat.set(length / ROAD_WIDTH / 2, 1);
  const cross = new THREE.Mesh(
    new THREE.PlaneGeometry(length / 2, CROSS_STREET_WIDTH),
    new THREE.MeshStandardMaterial({ map: crossTexture, roughness: 0.92 }),
  );
  cross.rotation.x = -Math.PI / 2;
  cross.rotation.z = Math.PI / 2;
  cross.position.set(CROSS_STREET_X, 0.03, 0);
  cross.receiveShadow = true;
  street.add(cross);

  const concreteTexture = makeConcreteTexture(rng);
  concreteTexture.repeat.set(length / 4, SIDEWALK_WIDTH / 4);
  const sidewalkMaterial = new THREE.MeshStandardMaterial({ map: concreteTexture, roughness: 0.95 });
  for (const side of [-1, 1]) {
    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(length, 0.22, SIDEWALK_WIDTH), sidewalkMaterial);
    sidewalk.position.set(0, 0.11, side * (ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2));
    sidewalk.receiveShadow = true;
    sidewalk.castShadow = true;
    street.add(sidewalk);
  }

  return street;
}
