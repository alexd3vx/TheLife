import * as THREE from "three";
import { canvasTexture, rect, std, type PlaceRoom } from "./roomKit";

/**
 * A church (pews either side of a red aisle, an altar with a cross, stained glass) or a mosque (rows of prayer rugs facing a mihrab,
 * a minbar, a shoe rack at the door). Quiet colours and warm light. `busy` fills it for the main service.
 */
export function buildWorshipRoom(name: string, faith: "church" | "mosque", busy: boolean): PlaceRoom {
  const church = faith === "church";
  const g = new THREE.Group();
  const W = 10, D = 10, H = 4.6;
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, shadow = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };

  // floor
  const floorTex = canvasTexture(256, 256, (c) => {
    if (church) {
      c.fillStyle = "#c9b79a";
      c.fillRect(0, 0, 256, 256);
      c.strokeStyle = "rgba(70,50,30,.25)";
      c.lineWidth = 3;
      for (let i = 0; i < 4; i++) c.strokeRect(0, i * 64, 256, 64);
    } else {
      c.fillStyle = "#e6dfc9";
      c.fillRect(0, 0, 256, 256);
      c.strokeStyle = "rgba(40,90,70,.18)";
      c.lineWidth = 3;
      c.strokeRect(0, 0, 256, 256);
    }
  }, [W / 2.4, D / 2.4]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);

  // walls
  const wall = std(church ? "#f4eee2" : "#f1efe4", 0.95);
  const accent = std(church ? "#6b4a2d" : "#2c7a5f", 0.7);
  box(W, H, 0.2, wall, 0, 0, -D / 2 - 0.1);
  box(0.2, H, D, wall, -W / 2 - 0.1, 0, 0);
  box(0.2, H, D, wall, W / 2 + 0.1, 0, 0);
  box(W, 0.5, 0.06, accent, 0, 0, -D / 2 + 0.03);
  box(0.06, 0.5, D, accent, -W / 2 + 0.03, 0, 0);
  box(0.06, 0.5, D, accent, W / 2 - 0.03, 0, 0);

  // the name over the back wall, small and quiet
  const sign = canvasTexture(1024, 160, (c) => {
    c.fillStyle = church ? "#4a3220" : "#1f5a45";
    c.fillRect(0, 0, 1024, 160);
    c.fillStyle = church ? "#f2dfb8" : "#e9f4ea";
    c.font = "700 70px Georgia, serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(name.slice(0, 26), 512, 82);
  });
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.78), new THREE.MeshBasicMaterial({ map: sign }));
  signMesh.position.set(0, 3.9, -D / 2 + 0.05);
  g.add(signMesh);

  // tall windows on both side walls
  const glassCols = church ? ["#e04b3a", "#3f8fd6", "#f2b632", "#3fae6b"] : ["#7fd6c0", "#9bd1ff", "#e9f4c8", "#7fd6c0"];
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const z = -2.8 + i * 2.8;
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.3), new THREE.MeshStandardMaterial({ color: glassCols[(i + (side > 0 ? 1 : 0)) % 4], emissive: glassCols[(i + (side > 0 ? 1 : 0)) % 4], emissiveIntensity: 0.55, transparent: true, opacity: 0.88 }));
    frame.position.set(side * (W / 2 - 0.03), 2.5, z);
    frame.rotation.y = -side * Math.PI / 2;
    g.add(frame);
  }

  const blockers = [] as ReturnType<typeof rect>[];
  const wood = std("#7a5230", 0.8);
  const ink = std("#2a1d12", 0.9);

  if (church) {
    // red aisle
    const aisle = new THREE.Mesh(new THREE.PlaneGeometry(1.5, D - 0.4), new THREE.MeshStandardMaterial({ color: "#9a2f2f", roughness: 0.95 }));
    aisle.rotation.x = -Math.PI / 2;
    aisle.position.set(0, 0.012, 0);
    g.add(aisle);
    // pews: three rows each side
    for (const side of [-1, 1]) for (const z of [-0.4, 1.0, 2.4]) {
      const x = side * 2.9;
      box(3.0, 0.1, 0.55, wood, x, 0.42, z);
      box(3.0, 0.55, 0.08, wood, x, 0.5, z - 0.3);
      box(0.1, 0.45, 0.5, ink, x - 1.45, 0, z, false);
      box(0.1, 0.45, 0.5, ink, x + 1.45, 0, z, false);
      blockers.push(rect(x, z - 0.05, 3.0, 0.8));
    }
    // the altar platform, altar table, cross and candles
    box(5.2, 0.3, 1.9, std("#a99a82", 0.8), 0, 0, -3.95);
    box(1.8, 0.95, 0.7, std("#f0e8d6", 0.7), 0, 0.3, -4.2);
    box(1.9, 0.06, 0.8, std("#c0392b", 0.8), 0, 1.25, -4.2, false);
    box(0.14, 1.9, 0.14, wood, 0, 1.4, -4.65);
    box(1.0, 0.14, 0.14, wood, 0, 2.5, -4.65);
    for (const x of [-0.75, 0.75]) {
      box(0.06, 0.28, 0.06, std("#fff6cf", 0.5), x, 1.31, -4.2, false);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffd479" }));
      flame.position.set(x, 1.65, -4.2);
      g.add(flame);
    }
    box(0.7, 1.15, 0.5, wood, -2.1, 0.3, -3.7); // the pulpit
    blockers.push(rect(0, -4.0, 5.4, 2.2));
    // a candle stand and an offering box by the door
    box(0.5, 0.9, 0.5, ink, -2.6, 0, 3.9);
    for (let i = 0; i < 6; i++) {
      box(0.05, 0.16, 0.05, std("#fff6cf", 0.5), -2.75 + (i % 3) * 0.15, 0.9, 3.8 + Math.floor(i / 3) * 0.2, false);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), new THREE.MeshBasicMaterial({ color: "#ffcb62" }));
      f.position.set(-2.75 + (i % 3) * 0.15, 1.1, 3.8 + Math.floor(i / 3) * 0.2);
      g.add(f);
    }
    blockers.push(rect(-2.6, 3.9, 0.9, 0.9));
    box(0.55, 1.0, 0.45, wood, 2.6, 0, 3.9);
    box(0.35, 0.04, 0.05, std("#f2c64e", 0.4, 0.6), 2.6, 1.01, 3.9, false);
    blockers.push(rect(2.6, 3.9, 0.9, 0.8));
  } else {
    // prayer rugs in rows facing the mihrab (not solid)
    const rugCols = ["#2c7a5f", "#1f5a8a", "#7a2c4a"];
    for (const z of [-1.2, 0.3, 1.8]) for (let i = -3; i <= 3; i++) {
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.0), new THREE.MeshStandardMaterial({ color: rugCols[(i + 4) % 3], roughness: 0.95 }));
      rug.rotation.x = -Math.PI / 2;
      rug.position.set(i * 1.1, 0.012, z);
      g.add(rug);
    }
    // the mihrab niche and a minbar
    box(2.0, 3.2, 0.5, std("#e9dfc2", 0.8), 0, 0, -D / 2 + 0.3);
    const niche = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.6), new THREE.MeshStandardMaterial({ color: "#c4a24a", emissive: "#6a5320", emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.4 }));
    niche.position.set(0, 1.5, -D / 2 + 0.56);
    g.add(niche);
    box(1.0, 0.45, 1.4, wood, 3.0, 0, -4.1);
    box(1.0, 0.9, 0.9, wood, 3.0, 0.45, -4.4);
    blockers.push(rect(0, -4.55, 2.4, 1.2), rect(3.0, -4.2, 1.2, 1.6));
    // shoe rack by the door
    box(1.6, 0.7, 0.45, wood, 3.4, 0, 4.2);
    blockers.push(rect(3.4, 4.2, 1.8, 0.7));
    // a donation box and a Quran shelf on the left
    box(0.5, 1.0, 0.45, wood, -3.3, 0, 4.2);
    blockers.push(rect(-3.3, 4.2, 0.9, 0.8));
    box(0.5, 1.7, 2.4, wood, -W / 2 + 0.4, 0, -1.4);
    blockers.push(rect(-W / 2 + 0.4, -1.4, 0.9, 2.6));
  }

  box(0.04, 0.2, 0.14, std("#ffffff", 0.4), -W / 2 + 0.03, 0.6, 2.9, false); // a socket

  return {
    group: g,
    spawn: new THREE.Vector3(0, 0, 3.6),
    bounds: rect(0, 0, 9.2, 9.6),
    blockers,
    door: rect(0, D / 2 + 0.3, 2.6, 0.6),
    spots: church
      ? [
          { id: "altar", label: "Talk to the pastor", x: 0, z: -2.1, r: 1.8, face: Math.PI, focus: "altar" },
          { id: "pew", label: "Sit and pray", x: 0, z: 1.0, r: 0.95, face: Math.PI, focus: "pew" },
          { id: "offering", label: "Give an offering", x: 1.7, z: 3.7, r: 1.2, face: Math.PI / 2, focus: "offering" },
          { id: "candles", label: "Light a candle", x: -1.6, z: 3.7, r: 1.2, face: -Math.PI / 2, focus: "candles" },
          { id: "socket", label: "Charge your phone", x: -4.1, z: 2.9, r: 1.1, face: -Math.PI / 2, focus: "charge" },
        ]
      : [
          { id: "altar", label: "Talk to the imam", x: 2.6, z: -3.0, r: 1.5, face: Math.PI, focus: "altar" },
          { id: "pew", label: "Pray on a rug", x: 0, z: 0.3, r: 1.3, face: Math.PI, focus: "pew" },
          { id: "offering", label: "Give to the poor box", x: -2.4, z: 3.7, r: 1.2, face: Math.PI, focus: "offering" },
          { id: "candles", label: "Light a lamp", x: 1.6, z: 3.6, r: 0.9, face: Math.PI, focus: "candles" },
          { id: "socket", label: "Charge your phone", x: -4.1, z: 2.9, r: 1.1, face: -Math.PI / 2, focus: "charge" },
        ],
    staff: [church ? { x: 0, y: 0.3, z: -3.7, yaw: 0, clip: "Idle_Loop", greeting: "Peace be with you, my child." } : { x: 3.0, y: 0.45, z: -4.4, yaw: 0, clip: "Idle_Loop", greeting: "Peace be upon you." }],
    waypoints: church ? [[0, 2.0], [-0.4, 0.4], [0.5, -1.4], [1.0, 3.2], [-1.0, 3.3], [0.2, -0.8]] : [[-2.5, -0.2], [2.2, 0.8], [-0.6, 2.4], [3.2, 2.6], [-3.4, 1.2], [0.8, -1.6]],
    visitors: busy ? 8 : 2,
    update() {},
  };
}
