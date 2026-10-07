import * as THREE from "three";
import { canvasTexture, rect, std, type PlaceRoom } from "./roomKit";

/** A police station's front office: a high desk with the duty officer, a notice board, a holding bench, filing cabinets, a flag. Navy and grey. */
export function buildPoliceRoom(name: string): PlaceRoom {
  const g = new THREE.Group();
  const W = 10, D = 8, H = 3.3;
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, shadow = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };

  const lino = canvasTexture(256, 256, (c) => {
    c.fillStyle = "#c9cfd8";
    c.fillRect(0, 0, 256, 256);
    c.fillStyle = "#b7bfcb";
    c.fillRect(0, 0, 128, 128);
    c.fillRect(128, 128, 128, 128);
    c.strokeStyle = "rgba(20,30,50,.15)";
    c.lineWidth = 3;
    c.strokeRect(0, 0, 256, 256);
  }, [W / 2, D / 2]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: lino, roughness: 0.5 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);

  const wall = std("#dfe5ee", 0.95);
  const navy = std("#1d3566", 0.6);
  box(W, H, 0.2, wall, 0, 0, -D / 2 - 0.1);
  box(0.2, H, D, wall, -W / 2 - 0.1, 0, 0);
  box(0.2, H, D, wall, W / 2 + 0.1, 0, 0);
  box(W, 1.1, 0.06, navy, 0, 0, -D / 2 + 0.03);
  box(0.06, 1.1, D, navy, -W / 2 + 0.03, 0, 0);
  box(0.06, 1.1, D, navy, W / 2 - 0.03, 0, 0);

  const sign = canvasTexture(1024, 256, (c) => {
    c.fillStyle = "#14264d";
    c.fillRect(0, 0, 1024, 256);
    c.fillStyle = "#ffffff";
    c.font = "800 80px system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(name.toUpperCase().slice(0, 24), 512, 98);
    c.fillStyle = "#8fb2ff";
    c.font = "600 40px system-ui, sans-serif";
    c.fillText("NIGERIA POLICE FORCE · EMERGENCY 112", 512, 200);
  });
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 1.45), new THREE.MeshBasicMaterial({ map: sign }));
  signMesh.position.set(0, 2.55, -D / 2 + 0.05);
  g.add(signMesh);

  // the duty desk and the officer behind it
  box(4.4, 1.1, 0.8, std("#2a4682", 0.6), -0.1, 0, -1.7);
  box(4.6, 0.07, 0.95, std("#e9edf4", 0.4), -0.1, 1.1, -1.7);
  box(0.4, 0.22, 0.4, std("#12233f", 0.4), 1.4, 1.17, -1.7); // the logbook
  box(0.5, 0.3, 0.05, std("#12233f", 0.4), -1.3, 1.17, -1.9);
  box(4.4, 1.4, 0.45, std("#9aa6b8", 0.5, 0.3), -0.1, 0, -3.5); // filing cabinets
  for (let i = 0; i < 6; i++) box(0.6, 0.02, 0.02, std("#d9dee7", 0.4, 0.7), -2.0 + i * 0.7, 1.0, -3.27, false);

  // notice board on the left wall
  box(0.08, 1.4, 2.4, std("#8d6b4a", 0.8), -W / 2 + 0.1, 1.0, -1.2);
  const paper = [std("#ffffff"), std("#fff2a8"), std("#ffd1d1"), std("#d6e8ff")];
  for (let i = 0; i < 7; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.5), paper[i % 4]);
    p.position.set(-W / 2 + 0.16, 1.4 + (i % 2) * 0.5 - 0.1, -2.1 + i * 0.32);
    p.rotation.y = Math.PI / 2;
    g.add(p);
  }

  // a bench for people waiting, a flag, plants
  const bench = std("#6e7a8f", 0.7, 0.2);
  for (const x of [1.8, 3.2]) {
    box(1.2, 0.1, 0.5, bench, x, 0.44, 2.8);
    box(1.2, 0.5, 0.08, bench, x, 0.5, 3.05);
    box(0.08, 0.44, 0.45, std("#4f5b70", 0.5, 0.5), x - 0.5, 0, 2.8, false);
    box(0.08, 0.44, 0.45, std("#4f5b70", 0.5, 0.5), x + 0.5, 0, 2.8, false);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 8), std("#c9d1de", 0.3, 0.7));
  pole.position.set(3.3, 1.3, -3.4);
  g.add(pole);
  const flagTex = canvasTexture(96, 64, (c) => {
    c.fillStyle = "#1f9d4d"; c.fillRect(0, 0, 32, 64);
    c.fillStyle = "#ffffff"; c.fillRect(32, 0, 32, 64);
    c.fillStyle = "#1f9d4d"; c.fillRect(64, 0, 32, 64);
  });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.66), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide }));
  flag.position.set(3.82, 2.3, -3.4);
  g.add(flag);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.45, 12), std("#7a8cb8", 0.8));
  pot.position.set(-4.4, 0.22, 3.4);
  g.add(pot);
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), std("#3f8f6a", 0.9));
  leaves.position.set(-4.4, 0.95, 3.4);
  leaves.scale.y = 1.3;
  g.add(leaves);
  box(0.04, 0.2, 0.14, std("#ffffff", 0.4), -W / 2 + 0.03, 0.6, 2.4, false); // the charging socket

  return {
    group: g,
    spawn: new THREE.Vector3(0.6, 0, 3.0),
    bounds: rect(0, 0, 9.2, 7.6),
    blockers: [rect(-0.1, -2.5, 5.0, 2.6), rect(-W / 2 + 0.2, -1.2, 0.6, 2.6), rect(2.5, 2.8, 2.9, 0.8), rect(3.3, -3.4, 0.5, 0.5), rect(-4.4, 3.4, 0.7, 0.7)],
    door: rect(0, D / 2 + 0.3, 2.4, 0.6),
    spots: [
      { id: "desk", label: "Talk to the duty officer", x: -0.1, z: -0.3, r: 1.9, face: Math.PI, focus: "desk" },
      { id: "board", label: "Read the notice board", x: -3.7, z: -1.2, r: 1.2, face: -Math.PI / 2, focus: "board" },
      { id: "socket", label: "Charge your phone", x: -4.1, z: 2.4, r: 1.2, face: -Math.PI / 2, focus: "charge" },
    ],
    staff: [{ x: -0.1, z: -2.7, yaw: 0, clip: "Idle_Loop", greeting: "Good day. How may I help you?" }],
    waypoints: [[-3.0, 1.0], [1.0, 1.4], [3.4, 1.0], [-1.0, 3.1], [2.0, 3.2]],
    visitors: 2,
    update() {},
  };
}
