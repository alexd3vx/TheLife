import * as THREE from "three";

const glassMaterial = new THREE.MeshStandardMaterial({ color: "#14202c", metalness: 0.9, roughness: 0.08 });
const tyreMaterial = new THREE.MeshStandardMaterial({ color: "#111", roughness: 0.95 });
const rimMaterial = new THREE.MeshStandardMaterial({ color: "#a9adb1", metalness: 0.9, roughness: 0.3 });
const headLightMaterial = new THREE.MeshStandardMaterial({ color: "#fff6dc", emissive: "#fff0c0", emissiveIntensity: 2 });
const tailLightMaterial = new THREE.MeshStandardMaterial({ color: "#ff3b2f", emissive: "#ff1f10", emissiveIntensity: 1.6 });

function paint(color: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0.55, clearcoat: 0.8, clearcoatRoughness: 0.15 });
}

function wheel(radius: number, width: number): THREE.Group {
  const group = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 20), tyreMaterial);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, width + 0.02, 12), rimMaterial);
  tyre.rotation.x = rim.rotation.x = Math.PI / 2;
  group.add(tyre, rim);
  return group;
}

function addLights(group: THREE.Group, length: number, width: number, y: number) {
  for (const z of [-width * 0.38, width * 0.38]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.34), headLightMaterial);
    head.position.set(length / 2, y, z);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.34), tailLightMaterial);
    tail.position.set(-length / 2, y, z);
    group.add(head, tail);
  }
}

function finish(group: THREE.Group): THREE.Group {
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}

/** Cars face +x. */
export function createCar(color: string): THREE.Group {
  const car = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.75, 1.85), paint(color));
  body.position.y = 0.72;
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 1.7), paint(color));
  hood.position.set(1.5, 1.14, 0);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.72, 1.62), glassMaterial);
  cabin.position.set(-0.3, 1.38, 0);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 1.58), paint(color));
  roof.position.set(-0.3, 1.78, 0);
  car.add(body, hood, cabin, roof);
  for (const [x, z] of [[1.4, 0.9], [1.4, -0.9], [-1.4, 0.9], [-1.4, -0.9]] as const) {
    const w = wheel(0.38, 0.28);
    w.position.set(x, 0.38, z);
    car.add(w);
  }
  addLights(car, 4.3, 1.85, 0.8);
  return finish(car);
}

/** Yellow minibus with a black band, a familiar sight on Nigerian roads. */
export function createBus(): THREE.Group {
  const bus = new THREE.Group();
  const yellow = paint("#f2b81c");
  const body = new THREE.Mesh(new THREE.BoxGeometry(7, 2.2, 2.1), yellow);
  body.position.y = 1.55;
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(7.02, 0.35, 2.12),
    new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.6 }),
  );
  band.position.y = 1.2;
  bus.add(body, band);
  for (const z of [1.06, -1.06]) {
    const windows = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.7, 0.04), glassMaterial);
    windows.position.set(-0.3, 1.95, z);
    bus.add(windows);
  }
  const windscreen = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.8, 1.8), glassMaterial);
  windscreen.position.set(3.51, 1.95, 0);
  bus.add(windscreen);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(5, 0.12, 1.7), new THREE.MeshStandardMaterial({ color: "#222", roughness: 0.7 }));
  rack.position.set(-0.6, 2.72, 0);
  bus.add(rack);
  for (const [x, z] of [[2.3, 1], [2.3, -1], [-2.3, 1], [-2.3, -1]] as const) {
    const w = wheel(0.5, 0.34);
    w.position.set(x, 0.5, z);
    bus.add(w);
  }
  addLights(bus, 7, 2.1, 1);
  return finish(bus);
}
