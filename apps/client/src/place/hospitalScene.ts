import * as THREE from "three";
import { canvasTexture, std, type PlaceRoom } from "./roomKit";

/** The hospital's ground floor: a reception desk with a nurse, two ward beds behind a curtain, a pharmacy hatch, a waiting area. White and teal. */

export function buildHospitalRoom(name: string): PlaceRoom {
  const g = new THREE.Group();
  const W = 10, D = 8, H = 3.4;
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, shadow = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };

  // floor: pale blue-grey vinyl with a teal guide line to the wards
  const vinyl = canvasTexture(256, 256, (c) => {
    c.fillStyle = "#e6eef6";
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = "rgba(60,90,130,.14)";
    c.lineWidth = 3;
    c.strokeRect(0, 0, 256, 256);
  }, [W / 2, D / 2]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: vinyl, roughness: 0.3, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);
  const guide = new THREE.Mesh(new THREE.PlaneGeometry(0.22, D - 1), new THREE.MeshStandardMaterial({ color: "#2fb8b0", roughness: 0.5 }));
  guide.rotation.x = -Math.PI / 2;
  guide.position.set(-1.9, 0.01, 0.4);
  g.add(guide);

  // walls
  const wall = std("#f2f7fb", 0.95);
  const teal = std("#1f9d97", 0.6);
  box(W, H, 0.2, wall, 0, 0, -D / 2 - 0.1);
  box(0.2, H, D, wall, -W / 2 - 0.1, 0, 0);
  box(0.2, H, D, wall, W / 2 + 0.1, 0, 0);
  box(W, 0.45, 0.06, teal, 0, 0, -D / 2 + 0.03);
  box(0.06, 0.45, D, teal, -W / 2 + 0.03, 0, 0);
  box(0.06, 0.45, D, teal, W / 2 - 0.03, 0, 0);

  // the sign with a cross
  const sign = canvasTexture(1024, 256, (c) => {
    c.fillStyle = "#0e3a52";
    c.fillRect(0, 0, 1024, 256);
    c.fillStyle = "#ffffff";
    c.fillRect(70, 70, 120, 36);
    c.fillRect(112, 28, 36, 120);
    c.fillStyle = "#c8f1ee";
    c.font = "800 78px system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(name.toUpperCase().slice(0, 24), 590, 100);
    c.fillStyle = "#7fd6cf";
    c.font = "600 38px system-ui, sans-serif";
    c.fillText("CARE · WARDS · PHARMACY · OPEN 24H", 560, 205);
  });
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: sign }));
  signMesh.position.set(0, 2.55, -D / 2 + 0.05);
  g.add(signMesh);

  // windows on the left wall
  const glass = new THREE.MeshStandardMaterial({ color: "#d3f0ff", emissive: "#7cc4ff", emissiveIntensity: 0.5, roughness: 0.1, transparent: true, opacity: 0.85 });
  for (const z of [-1.8, 1.8]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.6), glass);
    w.position.set(-W / 2 + 0.02, 1.9, z);
    w.rotation.y = Math.PI / 2;
    g.add(w);
  }

  // reception desk, with the nurse behind it
  box(4.2, 1.0, 0.8, std("#ffffff", 0.5), -0.1, 0, -1.7);
  box(4.4, 0.07, 0.95, std("#1f9d97", 0.35, 0.1), -0.1, 1.0, -1.7);
  box(0.5, 0.35, 0.05, std("#12233f", 0.4), -1.2, 1.1, -1.8); // a monitor
  box(0.45, 0.04, 0.3, std("#dfe8f0", 0.5), -1.2, 1.07, -1.65, false);
  box(0.6, 0.03, 0.4, std("#fff4cf", 0.8), 1.2, 1.07, -1.7, false); // a clipboard
  box(4.2, 1.1, 0.45, std("#e5eef6", 0.8), -0.1, 0, -3.5); // records cabinets
  box(4.2, 0.4, 0.4, std("#cfe0ec", 0.8), -0.1, 1.5, -3.5);

  // ward beds on the right, behind a curtain rail
  const sheet = std("#ffffff", 0.9);
  const blanket = std("#7fd6cf", 0.9);
  const frame = std("#9fb3c6", 0.4, 0.5);
  for (const z of [-2.6, -0.9]) {
    box(1.0, 0.1, 1.9, frame, 3.7, 0.45, z, false);
    box(0.9, 0.18, 1.8, sheet, 3.7, 0.55, z);
    box(0.92, 0.12, 1.0, blanket, 3.7, 0.73, z + 0.35);
    box(0.5, 0.1, 0.35, std("#f6fbff", 0.9), 3.7, 0.73, z - 0.75);
    for (const [dx, dz] of [[-0.45, -0.9], [0.45, -0.9], [-0.45, 0.9], [0.45, 0.9]] as const) box(0.06, 0.45, 0.06, frame, 3.7 + dx, 0, z + dz, false);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 4.6), std("#b8c7d6", 0.3, 0.7));
  rail.position.set(2.7, 2.3, -1.9);
  g.add(rail);
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.7), new THREE.MeshStandardMaterial({ color: "#a6e3de", roughness: 0.95, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  curtain.rotation.y = Math.PI / 2;
  curtain.position.set(2.7, 1.45, -1.6);
  g.add(curtain);
  // a drip stand
  box(0.03, 1.7, 0.03, frame, 3.1, 0, -0.4, false);
  const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.14, 4, 8), new THREE.MeshStandardMaterial({ color: "#d8f4ff", transparent: true, opacity: 0.75, roughness: 0.2 }));
  bag.position.set(3.1, 1.65, -0.4);
  g.add(bag);

  // pharmacy hatch on the left
  box(0.6, 1.0, 2.4, std("#ffffff", 0.5), -W / 2 + 0.55, 0, -2.6);
  box(0.7, 0.07, 2.6, std("#1f9d97", 0.35), -W / 2 + 0.55, 1.0, -2.6);
  box(0.4, 1.4, 2.4, std("#e8f1f6", 0.8), -W / 2 + 0.3, 1.1, -2.6);
  const bottles = [std("#ffb86b"), std("#7fd6cf"), std("#ff9aa2"), std("#fff1a8")];
  for (let i = 0; i < 8; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 10), bottles[i % 4]);
    b.position.set(-W / 2 + 0.55, 1.2 + (i % 2) * 0.55, -3.5 + i * 0.28);
    g.add(b);
  }

  // waiting chairs and plants
  const seat = std("#2fb8b0", 0.7);
  for (const x of [-3.4, -2.6, -1.8]) {
    box(0.6, 0.1, 0.55, seat, x, 0.42, 2.7);
    box(0.6, 0.45, 0.08, seat, x, 0.5, 2.95);
    box(0.06, 0.42, 0.06, std("#6b7f95", 0.4, 0.6), x - 0.24, 0, 2.7, false);
    box(0.06, 0.42, 0.06, std("#6b7f95", 0.4, 0.6), x + 0.24, 0, 2.7, false);
  }
  for (const [x, z] of [[-4.4, 3.4], [4.4, 3.4]] as const) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.45, 12), std("#7a8cb8", 0.8));
    pot.position.set(x, 0.22, z);
    g.add(pot);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), std("#3f9a74", 0.9));
    leaves.position.set(x, 0.95, z);
    leaves.scale.y = 1.3;
    leaves.castShadow = true;
    g.add(leaves);
  }
  box(0.04, 0.2, 0.14, std("#ffffff", 0.4), -W / 2 + 0.03, 0.6, 2.4, false); // the charging socket

  const lampMat = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#f2fbff", emissiveIntensity: 1.5 });
  for (const x of [-3, 0, 3]) for (const z of [-1, 2]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.4), lampMat);
    lamp.position.set(x, H - 0.1, z);
    g.add(lamp);
  }

  return { group: g, playerAt: new THREE.Vector3(1.1, 0, -0.5), staffAt: new THREE.Vector3(-0.1, 0, -2.7), update() {} };
}
