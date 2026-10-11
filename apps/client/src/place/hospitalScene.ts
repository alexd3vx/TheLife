import * as THREE from "three";
import { canvasTexture, rect, std, type PlaceRoom } from "./roomKit";

/** The hospital's ground floor: a reception desk with a nurse, two ward beds behind a curtain, a pharmacy hatch, a waiting area. White and teal. */

export function buildHospitalRoom(name: string): PlaceRoom {
  const g = new THREE.Group();
  // A roomy ground floor (about 16 by 12 m): a reception hall, four beds on the ward side, a pharmacy and a big waiting area.
  const W = 16, D = 12, H = 3.6;
  const zb = (d: number) => -D / 2 + d;
  const BED_X = W / 2 - 1.3;
  const BED_Z = [-3.8, -1.9, 0, 1.9];
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
  guide.position.set(-3.6, 0.01, 0.4);
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
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 1.85), new THREE.MeshBasicMaterial({ map: sign }));
  signMesh.position.set(0, 2.7, -D / 2 + 0.05);
  g.add(signMesh);

  // windows on the left wall
  const glass = new THREE.MeshStandardMaterial({ color: "#d3f0ff", emissive: "#7cc4ff", emissiveIntensity: 0.5, roughness: 0.1, transparent: true, opacity: 0.85 });
  for (const z of [-3.6, 0, 3.6]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), glass);
    w.position.set(-W / 2 + 0.02, 1.9, z);
    w.rotation.y = Math.PI / 2;
    g.add(w);
  }

  // reception desk, with the nurse behind it
  const DESK_Z = zb(2.4);
  box(6.6, 1.0, 0.8, std("#ffffff", 0.5), -0.1, 0, DESK_Z);
  box(6.8, 0.07, 0.95, std("#1f9d97", 0.35, 0.1), -0.1, 1.0, DESK_Z);
  for (const mx of [-2.2, 0.6]) {
    box(0.5, 0.35, 0.05, std("#12233f", 0.4), mx, 1.1, DESK_Z - 0.1); // a monitor
    box(0.45, 0.04, 0.3, std("#dfe8f0", 0.5), mx, 1.07, DESK_Z + 0.05, false);
  }
  box(0.6, 0.03, 0.4, std("#fff4cf", 0.8), 2.2, 1.07, DESK_Z, false); // a clipboard
  box(6.6, 1.1, 0.45, std("#e5eef6", 0.8), -0.1, 0, zb(0.6)); // records cabinets
  box(6.6, 0.4, 0.4, std("#cfe0ec", 0.8), -0.1, 1.5, zb(0.6));

  // ward beds on the right, behind a curtain rail
  const sheet = std("#ffffff", 0.9);
  const blanket = std("#7fd6cf", 0.9);
  const frame = std("#9fb3c6", 0.4, 0.5);
  for (const z of BED_Z) {
    box(1.0, 0.1, 1.9, frame, BED_X, 0.45, z, false);
    box(0.9, 0.18, 1.8, sheet, BED_X, 0.55, z);
    box(0.92, 0.12, 1.0, blanket, BED_X, 0.73, z + 0.35);
    box(0.5, 0.1, 0.35, std("#f6fbff", 0.9), BED_X, 0.73, z - 0.75);
    for (const [dx, dz] of [[-0.45, -0.9], [0.45, -0.9], [-0.45, 0.9], [0.45, 0.9]] as const) box(0.06, 0.45, 0.06, frame, BED_X + dx, 0, z + dz, false);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 8.4), std("#b8c7d6", 0.3, 0.7));
  rail.position.set(BED_X - 1.0, 2.3, -0.95);
  g.add(rail);
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 1.7), new THREE.MeshStandardMaterial({ color: "#a6e3de", roughness: 0.95, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  curtain.rotation.y = Math.PI / 2;
  curtain.position.set(BED_X - 1.0, 1.45, -0.95);
  g.add(curtain);
  // a drip stand
  box(0.03, 1.7, 0.03, frame, BED_X - 0.6, 0, 0.9, false);
  const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.14, 4, 8), new THREE.MeshStandardMaterial({ color: "#d8f4ff", transparent: true, opacity: 0.75, roughness: 0.2 }));
  bag.position.set(BED_X - 0.6, 1.65, 0.9);
  g.add(bag);

  // pharmacy hatch on the left
  const PHARM_Z = -3.4;
  box(0.6, 1.0, 3.4, std("#ffffff", 0.5), -W / 2 + 0.55, 0, PHARM_Z);
  box(0.7, 0.07, 3.6, std("#1f9d97", 0.35), -W / 2 + 0.55, 1.0, PHARM_Z);
  box(0.4, 1.4, 3.4, std("#e8f1f6", 0.8), -W / 2 + 0.3, 1.1, PHARM_Z);
  const bottles = [std("#ffb86b"), std("#7fd6cf"), std("#ff9aa2"), std("#fff1a8")];
  for (let i = 0; i < 10; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 10), bottles[i % 4]);
    b.position.set(-W / 2 + 0.55, 1.2 + (i % 2) * 0.55, PHARM_Z - 1.4 + i * 0.31);
    g.add(b);
  }

  // waiting chairs and plants
  const seat = std("#2fb8b0", 0.7);
  const SEATS: [number, number][] = [];
  for (const z of [3.8, 5.0]) for (let i = 0; i < 5; i++) SEATS.push([-6.2 + i * 0.8, z]);
  for (const [x, z] of SEATS) {
    box(0.6, 0.1, 0.55, seat, x, 0.42, z);
    box(0.6, 0.45, 0.08, seat, x, 0.5, z + 0.25);
    box(0.06, 0.42, 0.06, std("#6b7f95", 0.4, 0.6), x - 0.24, 0, z, false);
    box(0.06, 0.42, 0.06, std("#6b7f95", 0.4, 0.6), x + 0.24, 0, z, false);
  }
  const PLANTS: [number, number][] = [[-W / 2 + 0.6, D / 2 - 0.6], [W / 2 - 0.6, D / 2 - 0.6], [-W / 2 + 0.6, 0.8], [0, D / 2 - 0.6]];
  for (const [x, z] of PLANTS) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.45, 12), std("#7a8cb8", 0.8));
    pot.position.set(x, 0.22, z);
    g.add(pot);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), std("#3f9a74", 0.9));
    leaves.position.set(x, 0.95, z);
    leaves.scale.y = 1.3;
    leaves.castShadow = true;
    g.add(leaves);
  }
  box(0.04, 0.2, 0.14, std("#ffffff", 0.4), -W / 2 + 0.03, 0.6, 2.2, false); // the charging socket


  return {
    group: g,
    spawn: new THREE.Vector3(0.6, 0, D / 2 - 1.0),
    bounds: rect(0, 0, W - 0.8, D - 0.4),
    blockers: [
      rect(-0.1, -D / 2 + 1.5, 7.2, 3.0),
      rect(-W / 2 + 0.55, PHARM_Z, 1.0, 3.6),
      rect(BED_X, -0.95, 2.4, 7.0),
      ...SEATS.map(([x, z]) => rect(x, z + 0.1, 0.7, 0.7)),
      ...PLANTS.map(([x, z]) => rect(x, z, 0.7, 0.7)),
    ],
    door: rect(0, D / 2 + 0.3, 2.4, 0.6),
    spots: [
      { id: "reception", label: "Talk to the nurse", x: -0.1, z: DESK_Z + 1.6, r: 2.1, face: Math.PI, focus: "care" },
      { id: "pharmacy", label: "Pharmacy hatch", x: -W / 2 + 2.0, z: PHARM_Z, r: 1.5, face: -Math.PI / 2, focus: "pharmacy" },
      { id: "ward", label: "Ask for a ward bed", x: BED_X - 2.4, z: -0.95, r: 1.7, face: Math.PI / 2, focus: "ward" },
      { id: "socket", label: "Charge your phone", x: -W / 2 + 0.9, z: 2.2, r: 1.2, face: -Math.PI / 2, focus: "charge" },
    ],
    staff: [
      { x: -0.1, z: DESK_Z - 1.0, yaw: 0, clip: "Idle_Loop", greeting: `Welcome to ${name}. What is the matter?` },
      { x: BED_X - 1.7, z: 1.0, yaw: Math.PI / 2, clip: "Idle_Loop", greeting: "The doctor will see you soon." },
    ],
    waypoints: [[-3.2, 0.6], [-1.2, 1.8], [1.4, 2.4], [3.4, 3.4], [0.8, 4.2], [-3.4, -0.6], [2.4, 0.9], [-2.0, 3.0], [4.0, 1.2]],
    visitors: 6,
    update() {},
  };
}
