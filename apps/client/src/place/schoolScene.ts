import * as THREE from "three";
import { canvasTexture, rect, std, type PlaceRoom } from "./roomKit";

/** A school: a classroom with a chalkboard and teacher, rows of desks, a library wall of books and a row of computers. */
export function buildSchoolRoom(name: string): PlaceRoom {
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

  const tiles = canvasTexture(256, 256, (c) => {
    c.fillStyle = "#e9dcc0";
    c.fillRect(0, 0, 256, 256);
    c.fillStyle = "#dccaa6";
    c.fillRect(0, 0, 128, 128);
    c.fillRect(128, 128, 128, 128);
  }, [W / 2, D / 2]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);

  const wall = std("#fbf3dd", 0.95);
  const green = std("#2f7d52", 0.7);
  box(W, H, 0.2, wall, 0, 0, -D / 2 - 0.1);
  box(0.2, H, D, wall, -W / 2 - 0.1, 0, 0);
  box(0.2, H, D, wall, W / 2 + 0.1, 0, 0);
  box(W, 0.9, 0.06, green, 0, 0, -D / 2 + 0.03);
  box(0.06, 0.9, D, green, -W / 2 + 0.03, 0, 0);
  box(0.06, 0.9, D, green, W / 2 - 0.03, 0, 0);

  // chalkboard with writing, and the school's name above it
  const board = canvasTexture(1024, 400, (c) => {
    c.fillStyle = "#26402f";
    c.fillRect(0, 0, 1024, 400);
    c.fillStyle = "rgba(255,255,255,.85)";
    c.font = "700 64px 'Comic Sans MS', cursive, sans-serif";
    c.textAlign = "left";
    c.fillText("Today: 12 x 4 = 48", 60, 110);
    c.fillText("Spelling: neighbour", 60, 200);
    c.fillText("Be on time, be kind.", 60, 290);
  });
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.5), new THREE.MeshBasicMaterial({ map: board }));
  boardMesh.position.set(0, 1.9, -D / 2 + 0.06);
  g.add(boardMesh);
  const sign = canvasTexture(1024, 140, (c) => {
    c.fillStyle = "#1f5a3c";
    c.fillRect(0, 0, 1024, 140);
    c.fillStyle = "#fff6d8";
    c.font = "800 46px system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(name.toUpperCase().slice(0, 36), 512, 72);
  });
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.7), new THREE.MeshBasicMaterial({ map: sign }));
  signMesh.position.set(0, 3.0, -D / 2 + 0.06);
  g.add(signMesh);

  // the teacher's desk
  box(1.8, 0.85, 0.8, std("#8d6b4a", 0.8), 0, 0, -2.4);
  box(1.95, 0.05, 0.9, std("#a98255", 0.7), 0, 0.85, -2.4);

  // student desks in two blocks
  const desk = std("#c79a5b", 0.8);
  const leg = std("#6b7f95", 0.5, 0.5);
  const desks: [number, number][] = [[-2.6, 1.0], [-1.3, 1.0], [-2.6, 2.3], [-1.3, 2.3]];
  for (const [x, z] of desks) {
    box(1.0, 0.07, 0.6, desk, x, 0.72, z);
    box(0.05, 0.72, 0.05, leg, x - 0.45, 0, z - 0.25, false);
    box(0.05, 0.72, 0.05, leg, x + 0.45, 0, z - 0.25, false);
    box(0.05, 0.72, 0.05, leg, x - 0.45, 0, z + 0.25, false);
    box(0.05, 0.72, 0.05, leg, x + 0.45, 0, z + 0.25, false);
    box(0.4, 0.05, 0.4, std("#2f7d52", 0.7), x, 0.44, z + 0.55, false);
  }

  // library wall on the left: shelves full of books
  const shelf = std("#7a5230", 0.8);
  box(0.5, 2.2, 3.6, shelf, -W / 2 + 0.4, 0, -1.5);
  const spines = ["#c0392b", "#2f6bff", "#f2b632", "#2f9d6a", "#8e44ad", "#ecf0f1", "#e67e22"].map((c) => std(c, 0.7));
  for (let row = 0; row < 5; row++) for (let i = 0; i < 14; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3 + (i % 3) * 0.04, 0.1), spines[(row * 3 + i) % spines.length]);
    b.position.set(-W / 2 + 0.7, 0.35 + row * 0.42, -3.1 + i * 0.25);
    g.add(b);
  }

  // computers on the right
  const deskTop = std("#d8dde6", 0.5);
  box(1.0, 0.07, 3.6, deskTop, W / 2 - 0.7, 0.72, -1.5);
  for (const z of [-2.8, -1.5, -0.2]) {
    box(0.05, 0.72, 0.5, leg, W / 2 - 1.1, 0, z, false);
    box(0.06, 0.4, 0.55, std("#12233f", 0.4), W / 2 - 0.75, 0.82, z);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.34), new THREE.MeshStandardMaterial({ color: "#7fb8ff", emissive: "#4d8dff", emissiveIntensity: 0.9 }));
    screen.position.set(W / 2 - 0.75 - 0.04, 1.02, z);
    screen.rotation.y = -Math.PI / 2;
    g.add(screen);
  }

  // a globe and a flag for the feel of it
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: "#3f8fd6", roughness: 0.6 }));
  globe.position.set(1.0, 1.15, -2.4);
  g.add(globe);
  box(0.04, 0.2, 0.14, std("#ffffff", 0.4), -W / 2 + 0.03, 0.6, 2.9, false); // the socket

  return {
    group: g,
    spawn: new THREE.Vector3(0.6, 0, 3.0),
    bounds: rect(0, 0, 9.2, 7.6),
    blockers: [rect(0, -2.55, 3.0, 2.0), rect(-1.95, 1.65, 2.8, 2.2), rect(-W / 2 + 0.4, -1.5, 1.0, 3.8), rect(W / 2 - 0.75, -1.5, 1.4, 3.8)],
    door: rect(0, D / 2 + 0.3, 2.4, 0.6),
    spots: [
      { id: "teacher", label: "Talk to the teacher", x: 0, z: -0.5, r: 1.7, face: Math.PI, focus: "class" },
      { id: "library", label: "Read in the library", x: -3.3, z: -1.5, r: 1.2, face: -Math.PI / 2, focus: "library" },
      { id: "lab", label: "Use the computers", x: 3.2, z: -1.5, r: 1.2, face: Math.PI / 2, focus: "lab" },
      { id: "socket", label: "Charge your phone", x: -4.1, z: 2.9, r: 1.1, face: -Math.PI / 2, focus: "charge" },
    ],
    staff: [{ x: 0, z: -3.3, yaw: 0, clip: "Idle_Loop", greeting: "Good morning! Come in, come in. Class is about to begin." }],
    waypoints: [[0.6, 1.2], [1.8, 2.6], [-0.2, 3.0], [2.6, 0.4], [-3.6, 1.6], [3.6, 2.8]],
    visitors: 4,
    update() {},
  };
}
