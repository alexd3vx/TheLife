import * as THREE from "three";
import { canvasTexture, rect, std, type PlaceRoom } from "./roomKit";

/**
 * A provision shop: shelves of tins and packs, a fridge of drinks, crates of produce and a counter with the shopkeeper behind it. The
 * market's shop is warm and busy; the fuel station's mini-mart is cooler and tidier. Built from simple shapes.
 */
export function buildShopRoom(name: string, kind: "market" | "fuel"): PlaceRoom {
  const g = new THREE.Group();
  const W = 10, D = 8, H = 3.3;
  const market = kind === "market";
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, shadow = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };

  const tiles = canvasTexture(256, 256, (c) => {
    c.fillStyle = market ? "#d9d2c3" : "#dfe6ee";
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = "rgba(40,50,70,.16)";
    c.lineWidth = 3;
    c.strokeRect(0, 0, 256, 256);
    c.strokeRect(0, 0, 128, 128);
    c.strokeRect(128, 128, 128, 128);
  }, [W / 2, D / 2]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.45 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);

  const wall = std(market ? "#f3ead6" : "#eef3fa", 0.95);
  const band = std(market ? "#e0892f" : "#2f6bff", 0.6);
  box(W, H, 0.2, wall, 0, 0, -D / 2 - 0.1);
  box(0.2, H, D, wall, -W / 2 - 0.1, 0, 0);
  box(0.2, H, D, wall, W / 2 + 0.1, 0, 0);
  box(W, 0.45, 0.06, band, 0, 0, -D / 2 + 0.03);

  const sign = canvasTexture(1024, 256, (c) => {
    c.fillStyle = market ? "#7a3b12" : "#12233f";
    c.fillRect(0, 0, 1024, 256);
    c.fillStyle = market ? "#ffd9a0" : "#a8c8ff";
    c.font = "800 84px system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(name.toUpperCase().slice(0, 22), 512, 100);
    c.font = "600 40px system-ui, sans-serif";
    c.fillText(market ? "FRESH FOOD · PROVISIONS · SNACKS" : "MINI-MART · DRINKS · SNACKS", 512, 200);
  });
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.4), new THREE.MeshBasicMaterial({ map: sign }));
  signMesh.position.set(0, 2.55, -D / 2 + 0.05);
  g.add(signMesh);

  // shelves along the left wall, stocked with coloured packs
  const shelfMat = std("#8d6b4a", 0.8);
  const packs = ["#e04b3a", "#f2b632", "#3f8fd6", "#3fae6b", "#f0f0f0", "#c46ad1"].map((c) => std(c, 0.6));
  for (const z of [-2.8, -0.8, 1.2]) {
    box(0.5, 2.0, 1.6, shelfMat, -W / 2 + 0.4, 0, z);
    for (let row = 0; row < 4; row++) for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.2), packs[(row + i + Math.abs(Math.round(z))) % packs.length]);
      p.position.set(-W / 2 + 0.7, 0.35 + row * 0.45, z - 0.65 + i * 0.3);
      g.add(p);
    }
  }

  // a drinks fridge on the right wall
  box(0.8, 2.0, 2.4, std("#dfe8f2", 0.4, 0.3), W / 2 - 0.5, 0, -1.8);
  const fridgeGlass = new THREE.MeshStandardMaterial({ color: "#bfe3ff", emissive: "#6fb8ff", emissiveIntensity: 0.6, transparent: true, opacity: 0.8, roughness: 0.1 });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.7), fridgeGlass);
  door.position.set(W / 2 - 0.5 - 0.41, 1.05, -1.8);
  door.rotation.y = -Math.PI / 2;
  g.add(door);
  const bottle = [std("#e04b3a"), std("#f2b632"), std("#3fae6b")];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8), bottle[(r + i) % 3]);
    b.position.set(W / 2 - 0.9, 0.5 + r * 0.5, -2.8 + i * 0.35);
    g.add(b);
  }

  // the counter and shopkeeper's shelf
  box(4.0, 1.0, 0.8, std(market ? "#b9722f" : "#2f55d8", 0.6), -0.2, 0, -1.7);
  box(4.2, 0.07, 0.95, std("#f4efe4", 0.4), -0.2, 1.0, -1.7);
  box(0.5, 0.28, 0.4, std("#12233f", 0.4), 1.2, 1.07, -1.75); // the till
  box(4.2, 1.9, 0.4, shelfMat, -0.2, 0, -3.6);
  for (let row = 0; row < 3; row++) for (let i = 0; i < 12; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.14), packs[(row * 3 + i) % packs.length]);
    p.position.set(-2.1 + i * 0.34, 0.4 + row * 0.55, -3.35);
    g.add(p);
  }

  // produce crates
  const crate = std("#a8794a", 0.9);
  const produce = [std("#d6402a", 0.8), std("#7ab648", 0.8), std("#e8a02a", 0.8), std("#9a2f2f", 0.8)];
  [[-3.2, 1.6], [-2.0, 1.6], [2.0, 1.6], [3.2, 1.6]].forEach(([x, z], k) => {
    box(0.9, 0.35, 0.65, crate, x!, 0, z!);
    for (let i = 0; i < 9; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), produce[k % 4]);
      f.position.set(x! - 0.28 + (i % 3) * 0.28, 0.42, z! - 0.2 + Math.floor(i / 3) * 0.2);
      g.add(f);
    }
  });
  box(0.04, 0.2, 0.14, std("#ffffff", 0.4), -W / 2 + 0.03, 0.6, 3.0, false); // the charging socket

  return {
    group: g,
    spawn: new THREE.Vector3(0.6, 0, 3.0),
    bounds: rect(0, 0, 9.2, 7.6),
    blockers: [rect(-0.2, -2.5, 4.6, 2.6), rect(-W / 2 + 0.55, -0.8, 1.0, 5.6), rect(W / 2 - 0.5, -1.8, 1.0, 2.6), rect(-2.6, 1.6, 2.4, 0.8), rect(2.6, 1.6, 2.4, 0.8)],
    door: rect(0, D / 2 + 0.3, 2.4, 0.6),
    spots: [
      { id: "counter", label: market ? "Buy food and drinks" : "Pay at the counter", x: -0.2, z: -0.3, r: 1.9, face: Math.PI, focus: "eat" },
      { id: "shelves", label: "Browse the shelves", x: -3.3, z: -0.4, r: 1.3, face: -Math.PI / 2, focus: "groceries" },
      { id: "produce", label: "Buy groceries", x: 0.0, z: 1.5, r: 1.2, face: Math.PI, focus: "groceries" },
      { id: "fridge", label: "Cold drinks", x: 3.5, z: -1.8, r: 1.3, face: Math.PI / 2, focus: "eat" },
      { id: "socket", label: "Charge your phone", x: -4.0, z: 3.0, r: 1.2, face: -Math.PI / 2, focus: "charge" },
    ],
    staff: [{ x: -0.2, z: -2.7, yaw: 0, clip: "Idle_Loop", greeting: "Welcome, welcome! What will you buy?" }],
    waypoints: [[-3.0, 0.8], [3.0, 0.2], [-1.2, 2.8], [1.6, 3.0], [2.6, -0.2], [-3.4, 2.4]],
    visitors: market ? 5 : 2,
    update() {},
  };
}
