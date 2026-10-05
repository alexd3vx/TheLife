import * as THREE from "three";
import type { Rng } from "./rng";
import { makeBillboardTexture, makeFrondTexture } from "./textures";

export interface PropMaterials {
  frond: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  lampGlow: THREE.SpriteMaterial;
}

export function createPropMaterials(glowTexture: THREE.Texture): PropMaterials {
  return {
    frond: new THREE.MeshStandardMaterial({
      map: makeFrondTexture(),
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      roughness: 0.8,
    }),
    bark: new THREE.MeshStandardMaterial({ color: "#6a5238", roughness: 1 }),
    metal: new THREE.MeshStandardMaterial({ color: "#3a3f45", metalness: 0.7, roughness: 0.45 }),
    wood: new THREE.MeshStandardMaterial({ color: "#4b3a2a", roughness: 1 }),
    lampGlow: new THREE.SpriteMaterial({
      map: glowTexture,
      color: "#ffcf8a",
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  };
}

export function createPalm(mats: PropMaterials, rng: Rng): THREE.Group {
  const palm = new THREE.Group();
  const height = rng.range(6.5, 9);
  const lean = rng.range(-0.18, 0.18);

  const segments = 5;
  let y = 0;
  for (let i = 0; i < segments; i++) {
    const segHeight = height / segments;
    const radius = 0.34 - i * 0.04;
    const segment = new THREE.Mesh(new THREE.CylinderGeometry(radius - 0.03, radius, segHeight, 8), mats.bark);
    segment.position.set(lean * y, y + segHeight / 2, 0);
    segment.rotation.z = -lean * 0.9;
    palm.add(segment);
    y += segHeight;
  }

  const crown = new THREE.Group();
  crown.position.set(lean * height, height, 0);
  const fronds = 9;
  for (let i = 0; i < fronds; i++) {
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), mats.frond);
    const pivot = new THREE.Group();
    frond.position.x = 1.7;
    frond.rotation.x = -Math.PI / 2 + 0.25;
    pivot.add(frond);
    pivot.rotation.y = (i / fronds) * Math.PI * 2 + rng.range(-0.2, 0.2);
    pivot.rotation.z = rng.range(-0.55, -0.2);
    crown.add(pivot);
  }
  palm.add(crown);
  palm.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return palm;
}

export function createStreetLamp(mats: PropMaterials, armDirection: 1 | -1): THREE.Group {
  const lamp = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 7.5, 8), mats.metal);
  pole.position.y = 3.75;
  lamp.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.2), mats.metal);
  arm.position.set(0, 7.4, armDirection * 1.0);
  lamp.add(arm);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.14, 0.9),
    new THREE.MeshStandardMaterial({ color: "#ffe9b8", emissive: "#ffcf8a", emissiveIntensity: 2.2 }),
  );
  head.position.set(0, 7.3, armDirection * 2);
  lamp.add(head);
  const glow = new THREE.Sprite(mats.lampGlow);
  glow.scale.set(4.5, 4.5, 1);
  glow.position.set(0, 7.1, armDirection * 2);
  lamp.add(glow);
  pole.castShadow = true;
  return lamp;
}

export function createPowerPole(mats: PropMaterials): THREE.Group {
  const pole = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 10, 8), mats.wood);
  trunk.position.y = 5;
  trunk.castShadow = true;
  pole.add(trunk);
  const crossarm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 2.6), mats.wood);
  crossarm.position.y = 9.3;
  pole.add(crossarm);
  const crossarm2 = crossarm.clone();
  crossarm2.position.y = 8.2;
  crossarm2.scale.z = 0.7;
  pole.add(crossarm2);
  return pole;
}

/** Sagging cables between two points, drawn as thin lines. */
export function createWire(from: THREE.Vector3, to: THREE.Vector3, sag: number): THREE.Line {
  const mid = from.clone().add(to).multiplyScalar(0.5);
  mid.y -= sag;
  const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
  const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(16));
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: "#151515" }));
}

export function createBillboard(): THREE.Group {
  const billboard = new THREE.Group();
  const frameMaterial = new THREE.MeshStandardMaterial({ color: "#2b2f34", metalness: 0.6, roughness: 0.5 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(12.4, 6.4, 0.3), frameMaterial);
  frame.position.y = 5.2;
  billboard.add(frame);
  const texture = makeBillboardTexture();
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 6),
    new THREE.MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: new THREE.Color("#ffffff"),
      emissiveIntensity: 0.55,
      roughness: 0.6,
    }),
  );
  face.position.set(0, 5.2, 0.17);
  billboard.add(face);
  for (const x of [-4, 4]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.4, 0.25), frameMaterial);
    leg.position.set(x, 0.8, 0);
    billboard.add(leg);
  }
  billboard.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return billboard;
}
