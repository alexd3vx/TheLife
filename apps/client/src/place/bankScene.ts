import * as THREE from "three";
import { canvasTexture, rect, std, type PlaceRoom } from "./roomKit";

/** The bank branch's lobby, built from simple shapes: tiled floor, a teller's counter behind glass, cash machines, benches, plants. */

export function buildBankRoom(name: string): PlaceRoom {
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

  // floor: big blue and cream tiles
  const tiles = canvasTexture(256, 256, (c) => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      c.fillStyle = (x + y) % 2 ? "#dfe8f7" : "#b9cdee";
      c.fillRect(x * 128, y * 128, 128, 128);
    }
    c.strokeStyle = "rgba(18,35,63,.18)";
    c.lineWidth = 3;
    c.strokeRect(0, 0, 256, 256);
  }, [W / 1.5 / 2, D / 1.5 / 2]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.35, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);

  // walls: back and sides
  const wall = std("#e9effa", 0.95);
  const trim = std("#2f55d8", 0.6);
  box(W, H, 0.2, wall, 0, 0, -D / 2 - 0.1);
  box(0.2, H, D, wall, -W / 2 - 0.1, 0, 0);
  box(0.2, H, D, wall, W / 2 + 0.1, 0, 0);
  box(W, 0.5, 0.06, trim, 0, 0, -D / 2 + 0.03);
  box(0.06, 0.5, D, trim, -W / 2 + 0.03, 0, 0);
  box(0.06, 0.5, D, trim, W / 2 - 0.03, 0, 0);

  // the bank's sign on the back wall
  const sign = canvasTexture(1024, 256, (c) => {
    c.fillStyle = "#12233f";
    c.fillRect(0, 0, 1024, 256);
    const grad = c.createLinearGradient(0, 0, 1024, 0);
    grad.addColorStop(0, "#5b9bff");
    grad.addColorStop(1, "#a8c8ff");
    c.fillStyle = grad;
    c.font = "800 120px system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(name.toUpperCase().slice(0, 22), 512, 120);
    c.fillStyle = "#a8c8ff";
    c.font = "600 40px system-ui, sans-serif";
    c.fillText("SAVINGS · LOANS · CASH", 512, 210);
  });
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.4), new THREE.MeshBasicMaterial({ map: sign }));
  signMesh.position.set(0, 2.55, -D / 2 + 0.05);
  g.add(signMesh);

  // windows on the side walls
  const glass = new THREE.MeshStandardMaterial({ color: "#bfe0ff", emissive: "#6fb0ff", emissiveIntensity: 0.55, roughness: 0.1, transparent: true, opacity: 0.85 });
  for (const z of [-1.8, 1.8]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.6), glass);
    w.position.set(-W / 2 + 0.02, 1.9, z);
    w.rotation.y = Math.PI / 2;
    g.add(w);
  }

  // the counter and the glass over it
  const counterTop = std("#12233f", 0.35, 0.2);
  const counterBody = std("#2f55d8", 0.6);
  box(5.2, 1.0, 0.9, counterBody, 0, 0, -1.6);
  box(5.4, 0.08, 1.05, counterTop, 0, 1.0, -1.6);
  const screen = new THREE.MeshStandardMaterial({ color: "#c8e3ff", transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1 });
  for (const x of [-1.7, 0, 1.7]) {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.04), screen);
    pane.position.set(x, 1.55, -1.95);
    g.add(pane);
  }
  box(5.2, 0.12, 0.5, std("#a8c8ff", 0.5), 0, 0, -3.4); // the shelf behind the teller
  box(5.2, 1.0, 0.5, std("#dfe8f7", 0.8), 0, 0.12, -3.5);

  // cash machines along the right wall
  const atmBody = std("#1d2f5c", 0.5, 0.3);
  const atmScreen = new THREE.MeshStandardMaterial({ color: "#7fb8ff", emissive: "#4d8dff", emissiveIntensity: 1.2 });
  for (const z of [0.2, 1.5]) {
    box(0.7, 1.7, 0.9, atmBody, W / 2 - 0.55, 0, z);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), atmScreen);
    s.position.set(W / 2 - 0.55 - 0.351, 1.35, z);
    s.rotation.y = -Math.PI / 2;
    g.add(s);
    box(0.4, 0.05, 0.5, std("#9fb3d6", 0.4), W / 2 - 0.9, 0.95, z, false);
  }

  // waiting benches, rope posts, plants
  const bench = std("#f4f8ff", 0.7);
  const legs = std("#5c6f92", 0.5, 0.4);
  for (const x of [-3.2, -1.7]) {
    box(1.2, 0.12, 0.45, bench, x, 0.42, 2.7);
    box(1.2, 0.5, 0.08, bench, x, 0.5, 2.9);
    box(0.08, 0.42, 0.4, legs, x - 0.5, 0, 2.7);
    box(0.08, 0.42, 0.4, legs, x + 0.5, 0, 2.7);
  }
  for (const x of [-2.6, -0.7, 0.7, 2.6]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 10), std("#c9d6ee", 0.3, 0.6));
    post.position.set(x, 0.45, 0.2);
    post.castShadow = true;
    g.add(post);
  }
  for (const cx of [-1.65, 1.65]) {
    const rope = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.03, 0.03), std("#2f55d8", 0.7));
    rope.position.set(cx, 0.8, 0.2);
    g.add(rope);
  }
  for (const [x, z] of [[-4.4, -3.4], [4.4, 3.4], [-4.4, 3.4]] as const) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.45, 12), std("#7a8cb8", 0.8));
    pot.position.set(x, 0.22, z);
    g.add(pot);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), std("#3f8f8a", 0.9));
    leaves.position.set(x, 0.95, z);
    leaves.scale.y = 1.3;
    leaves.castShadow = true;
    g.add(leaves);
  }
  // a charging socket plate on the side wall
  box(0.04, 0.2, 0.14, std("#ffffff", 0.4), -W / 2 + 0.03, 0.6, 2.4, false);

  // light fittings

  return {
    group: g,
    spawn: new THREE.Vector3(0.6, 0, 3.0),
    bounds: rect(0, 0, 9.2, 7.6),
    blockers: [rect(0, -2.5, 5.8, 2.6), rect(W / 2 - 0.55, 0.2, 0.8, 1.0), rect(W / 2 - 0.55, 1.5, 0.8, 1.0), rect(-3.2, 2.8, 1.4, 0.6), rect(-1.7, 2.8, 1.4, 0.6), rect(-4.4, -3.4, 0.7, 0.7), rect(4.4, 3.4, 0.7, 0.7), rect(-4.4, 3.4, 0.7, 0.7)],
    door: rect(0, D / 2 + 0.3, 2.4, 0.6),
    spots: [
      { id: "teller", label: "Talk to the teller", x: 0, z: -0.3, r: 1.9, face: Math.PI, focus: "teller" },
      { id: "atm", label: "Use the cash machine", x: 3.5, z: 0.85, r: 1.5, face: Math.PI / 2, focus: "atm" },
      { id: "socket", label: "Charge your phone", x: -4.1, z: 2.4, r: 1.2, face: -Math.PI / 2, focus: "charge" },
    ],
    staff: [{ x: -0.1, z: -2.75, yaw: 0, clip: "Life_Type_Loop", greeting: `Welcome to ${name}. How can I help?` }],
    waypoints: [[-3.6, 0.9], [-0.9, 1.5], [2.6, 2.3], [3.0, 3.1], [-0.6, 3.1], [1.6, 0.9], [-3.4, 0.2]],
    visitors: 3,
    update() {},
  };
}
