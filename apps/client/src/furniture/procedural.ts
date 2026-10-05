import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { ankara, ceramic, chrome, coir, emissive, enamel, fabric, glass, granite, paint, rubber, steel, wood } from "./materials";

// Realistic furniture built in code where the free libraries have nothing suitable: fridge, bathroom fittings, a proper
// bed with mattress and pillows, a wardrobe, a flat-screen TV, a washing machine, kitchen units, a lamp and rugs.
// Origin is the centre of the footprint on the floor; the front faces +z. Metres.

export interface FurnitureContext {
  /** Someone is using it right now. */
  using: boolean;
  /** 0 (day) to 1 (night). */
  night: number;
  /** Seconds since the scene started, for continuous motion. */
  time: number;
}

export interface FurnitureBuild {
  object: THREE.Group;
  update?(dt: number, ctx: FurnitureContext): void;
}

function box(w: number, h: number, d: number, material: THREE.Material, radius = 0.01, segments = 3): THREE.Mesh {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, segments, Math.min(radius, w / 2, h / 2, d / 2)), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(rTop: number, rBottom: number, h: number, material: THREE.Material, segments = 24): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function at<T extends THREE.Object3D>(object: T, x: number, y: number, z: number): T {
  object.position.set(x, y, z);
  return object;
}

const ease = (current: number, target: number, dt: number, rate = 6) => current + (target - current) * Math.min(1, dt * rate);

// ------------------------------------------------------------------ kitchen

function kitchenUnit(withSink: boolean): FurnitureBuild {
  const g = new THREE.Group();
  const body = paint("#e7dfd0");
  g.add(at(box(0.9, 0.82, 0.58, body, 0.012), 0, 0.45, -0.01));
  g.add(at(box(0.84, 0.08, 0.5, rubber(), 0.005), 0, 0.04, 0));
  const top = at(box(0.94, 0.04, 0.62, granite(), 0.008), 0, 0.88, 0);
  g.add(top);
  for (const x of [-0.225, 0.225]) {
    g.add(at(box(0.41, 0.7, 0.018, paint("#f1ebe0"), 0.008), x, 0.45, 0.285));
    g.add(at(box(0.012, 0.16, 0.02, steel(), 0.005), x + (x < 0 ? 0.17 : -0.17), 0.68, 0.305));
  }
  if (withSink) {
    g.add(at(box(0.52, 0.012, 0.36, steel(), 0.004), 0, 0.905, 0.02));
    g.add(at(box(0.46, 0.012, 0.3, new THREE.MeshStandardMaterial({ color: "#8b9096", roughness: 0.5, metalness: 1 }), 0.004), 0, 0.898, 0.02));
    g.add(at(cyl(0.012, 0.014, 0.2, chrome()), 0, 0.99, -0.22));
    const spout = at(cyl(0.01, 0.01, 0.16, chrome(), 12), 0, 1.08, -0.15);
    spout.rotation.x = Math.PI / 2;
    g.add(spout);
  }
  return { object: g };
}

function kitchenWall(): FurnitureBuild {
  const g = new THREE.Group();
  g.add(at(box(0.9, 0.7, 0.34, paint("#e7dfd0"), 0.012), 0, 0.35, 0));
  for (const x of [-0.225, 0.225]) {
    g.add(at(box(0.42, 0.64, 0.018, paint("#f1ebe0"), 0.008), x, 0.35, 0.175));
    g.add(at(box(0.012, 0.14, 0.02, steel(), 0.005), x + (x < 0 ? 0.17 : -0.17), 0.12, 0.195));
  }
  return { object: g };
}

// ------------------------------------------------------------------ fridge (door really opens)

function fridge(): FurnitureBuild {
  const g = new THREE.Group();
  const W = 0.7;
  const D = 0.68;
  const H = 1.8;
  g.add(at(box(W, H, D - 0.04, enamel(), 0.02), 0, H / 2, -0.02));
  // freezer door (fixed) and fridge door (hinged on the left)
  g.add(at(box(W - 0.02, 0.52, 0.04, enamel(), 0.015), 0, 1.51, D / 2 - 0.02));
  g.add(at(box(0.018, 0.34, 0.03, steel(), 0.008), W / 2 - 0.08, 1.4, D / 2 + 0.02));
  g.add(at(box(0.7, 0.02, 0.008, rubber(), 0.002), 0, 1.245, D / 2 + 0.004));

  const hinge = new THREE.Group();
  hinge.position.set(-W / 2 + 0.01, 0, D / 2 - 0.02);
  const door = at(box(W - 0.02, 1.2, 0.06, enamel(), 0.015), (W - 0.02) / 2, 0.64, 0.02);
  hinge.add(door);
  hinge.add(at(box(0.018, 0.5, 0.03, steel(), 0.008), W - 0.08, 0.95, 0.06));
  // shelves on the door's inside face
  for (const y of [0.35, 0.7, 1.05]) hinge.add(at(box(W - 0.14, 0.02, 0.07, glass(0.5), 0.004), (W - 0.02) / 2, y, -0.025));
  g.add(hinge);

  // interior, lit when the door opens
  const interior = new THREE.Group();
  interior.add(at(box(W - 0.1, 1.14, 0.3, new THREE.MeshStandardMaterial({ color: "#eef3f3", roughness: 0.4, emissive: "#fff7e0", emissiveIntensity: 0.25 }), 0.01), 0, 0.64, 0.06));
  for (const y of [0.35, 0.65, 0.95]) interior.add(at(box(W - 0.14, 0.012, 0.32, glass(0.45), 0.003), 0, y, 0.12));
  interior.add(at(box(0.5, 0.2, 0.2, new THREE.MeshStandardMaterial({ color: "#9bb7a0", roughness: 0.6 }), 0.02), 0.06, 0.45, 0.1));
  g.add(interior);
  const light = new THREE.PointLight("#fff2dc", 0, 1.8, 2);
  light.position.set(0, 1.0, 0.3);
  g.add(light);

  let open = 0;
  return {
    object: g,
    update(dt, ctx) {
      open = ease(open, ctx.using ? 1 : 0, dt, 4);
      hinge.rotation.y = -open * 1.75;
      light.intensity = open * 1.2;
    },
  };
}

// ------------------------------------------------------------------ bathroom

function toilet(): FurnitureBuild {
  const g = new THREE.Group();
  // bowl from a lathe profile, stretched front-to-back
  const profile = [
    [0.0, 0.0], [0.14, 0.0], [0.17, 0.05], [0.2, 0.16], [0.22, 0.3], [0.21, 0.4], [0.19, 0.42], [0.16, 0.42], [0.15, 0.36], [0.0, 0.3],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), ceramic());
  bowl.scale.set(0.88, 1, 1.28);
  bowl.position.set(0, 0, 0.06);
  bowl.castShadow = true;
  g.add(bowl);
  g.add(at(cyl(0.12, 0.15, 0.1, ceramic()), 0, 0.05, -0.12));
  // seat ring and lid
  const seat = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 12, 40), new THREE.MeshStandardMaterial({ color: "#f4f4f2", roughness: 0.35 }));
  seat.rotation.x = Math.PI / 2;
  seat.scale.set(0.88, 1.28, 1);
  seat.position.set(0, 0.425, 0.06);
  g.add(seat);
  // cistern
  g.add(at(box(0.38, 0.36, 0.17, ceramic(), 0.03), 0, 0.6, -0.27));
  g.add(at(box(0.4, 0.03, 0.19, ceramic(), 0.012), 0, 0.795, -0.27));
  g.add(at(cyl(0.025, 0.025, 0.02, chrome()), 0.1, 0.82, -0.27));
  return { object: g };
}

function basin(): FurnitureBuild {
  const g = new THREE.Group();
  g.add(at(cyl(0.07, 0.09, 0.66, ceramic()), 0, 0.33, -0.05));
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.27, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), ceramic());
  bowl.scale.set(1.0, 0.45, 0.8);
  bowl.rotation.x = Math.PI;
  bowl.position.set(0, 0.86, 0);
  g.add(bowl);
  g.add(at(box(0.56, 0.05, 0.1, ceramic(), 0.02), 0, 0.88, -0.16));
  g.add(at(cyl(0.012, 0.014, 0.1, chrome()), 0, 0.95, -0.14));
  const spout = at(cyl(0.01, 0.01, 0.12, chrome(), 12), 0, 1.0, -0.08);
  spout.rotation.x = Math.PI / 2;
  g.add(spout);
  return { object: g };
}

function shower(): FurnitureBuild {
  const g = new THREE.Group();
  const S = 0.95;
  g.add(at(box(S, 0.1, S, ceramic(), 0.03), 0, 0.05, 0));
  // glass walls: left, right, back; the front is open so you can step in
  for (const x of [-S / 2 + 0.01, S / 2 - 0.01]) g.add(at(box(0.012, 2.0, S - 0.04, glass(0.2), 0.002), x, 1.1, 0));
  g.add(at(box(S - 0.04, 2.0, 0.012, glass(0.2), 0.002), 0, 1.1, -S / 2 + 0.01));
  for (const [x, z] of [[-S / 2, -S / 2], [S / 2, -S / 2], [-S / 2, S / 2], [S / 2, S / 2]] as const) g.add(at(cyl(0.012, 0.012, 2.1, chrome(), 10), x, 1.15, z));
  g.add(at(box(S, 0.025, 0.025, chrome(), 0.005), 0, 2.15, S / 2));
  g.add(at(box(S, 0.025, 0.025, chrome(), 0.005), 0, 2.15, -S / 2));
  // rail, head and hose
  g.add(at(cyl(0.012, 0.012, 1.3, chrome(), 10), 0.2, 1.4, -S / 2 + 0.05));
  const head = at(cyl(0.09, 0.07, 0.025, chrome()), 0.2, 2.02, -0.2);
  g.add(head);
  g.add(at(cyl(0.012, 0.012, 0.3, chrome(), 10), 0.2, 2.1, -S / 2 + 0.05));
  // water: thin streaks that fall and wrap around while someone is showering
  const drops: THREE.Mesh[] = [];
  const dropMaterial = new THREE.MeshBasicMaterial({ color: "#bfe6ff", transparent: true, opacity: 0.55, depthWrite: false });
  const dropGeometry = new THREE.CylinderGeometry(0.003, 0.003, 0.22, 4);
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 * 3.1;
    const r = 0.02 + ((i * 37) % 100) / 100 * 0.17;
    const drop = new THREE.Mesh(dropGeometry, dropMaterial);
    drop.position.set(0.2 + Math.cos(a) * r, 1.0, -0.2 + Math.sin(a) * r);
    drop.visible = false;
    drop.userData.phase = ((i * 13) % 100) / 100;
    g.add(drop);
    drops.push(drop);
  }
  return {
    object: g,
    update(dt, ctx) {
      for (const drop of drops) {
        drop.visible = ctx.using;
        if (!ctx.using) continue;
        drop.userData.phase = (drop.userData.phase + dt * 1.6) % 1;
        drop.position.y = 1.98 - drop.userData.phase * 1.9;
      }
    },
  };
}

// ------------------------------------------------------------------ bedroom

function bed(): FurnitureBuild {
  const g = new THREE.Group();
  const W = 1.62;
  const L = 2.05;
  const frame = wood("#6e4a2e");
  g.add(at(box(W + 0.06, 0.2, L + 0.06, frame, 0.02), 0, 0.28, 0));
  for (const [x, z] of [[-W / 2, -L / 2], [W / 2, -L / 2], [-W / 2, L / 2], [W / 2, L / 2]] as const) g.add(at(box(0.08, 0.2, 0.08, frame, 0.015), x, 0.1, z));
  // headboard at the back (-z)
  g.add(at(box(W + 0.1, 0.95, 0.1, fabric("#6b5a4d"), 0.04), 0, 0.72, -L / 2 - 0.02));
  g.add(at(box(W + 0.14, 0.05, 0.14, frame, 0.015), 0, 1.2, -L / 2 - 0.02));
  g.add(at(box(W + 0.06, 0.26, 0.06, frame, 0.02), 0, 0.4, L / 2 + 0.03));
  // mattress, sheet, duvet (patterned) and pillows
  g.add(at(box(W - 0.04, 0.22, L - 0.1, fabric("#f4f1ea"), 0.07), 0, 0.5, 0.02));
  g.add(at(box(W - 0.02, 0.08, L * 0.62, ankara("#c4543f", "#1f6f66", "#f3e2b8"), 0.04), 0, 0.64, 0.3));
  for (const x of [-0.37, 0.37]) {
    const pillow = box(0.62, 0.13, 0.4, fabric("#fbfaf6"), 0.06, 4);
    pillow.position.set(x, 0.67, -L / 2 + 0.34);
    pillow.rotation.x = -0.08;
    g.add(pillow);
  }
  return { object: g };
}

function wardrobe(): FurnitureBuild {
  const g = new THREE.Group();
  const W = 1.4;
  const H = 2.0;
  const D = 0.6;
  g.add(at(box(W, H, D - 0.03, wood("#7a5233"), 0.012), 0, H / 2, -0.015));
  for (const side of [-1, 1]) {
    g.add(at(box(W / 2 - 0.02, H - 0.1, 0.03, wood("#85603d", "wood2"), 0.01), side * (W / 4), H / 2, D / 2 - 0.01));
    g.add(at(box(0.015, 0.4, 0.025, steel(), 0.006), -side * 0.04 + side * 0.0, 1.0, D / 2 + 0.025));
  }
  g.add(at(box(W + 0.04, 0.04, D + 0.04, wood("#6b4629"), 0.01), 0, H + 0.02, 0));
  return { object: g };
}

// ------------------------------------------------------------------ electronics, lighting, floor

function flatTV(): FurnitureBuild {
  const g = new THREE.Group();
  const W = 1.1;
  const H = 0.64;
  g.add(at(box(0.5, 0.025, 0.2, rubber(), 0.01), 0, 0.012, 0));
  g.add(at(box(0.07, 0.3, 0.05, rubber(), 0.01), 0, 0.17, -0.03));
  g.add(at(box(W, H, 0.045, rubber(), 0.012), 0, 0.5 + H / 2 - 0.15, 0));
  const screenMaterial = emissive("#0b0f14", 0.0);
  screenMaterial.color.set("#05070a");
  const screen = at(new THREE.Mesh(new THREE.PlaneGeometry(W - 0.04, H - 0.04), screenMaterial), 0, 0.5 + H / 2 - 0.15, 0.024);
  g.add(screen);
  const glow = new THREE.PointLight("#8fb4ff", 0, 3.5, 2);
  glow.position.set(0, 0.8, 0.7);
  g.add(glow);
  return {
    object: g,
    update(_dt, ctx) {
      const on = ctx.using ? 1 : 0;
      const t = ctx.time;
      const flicker = 0.7 + 0.3 * Math.sin(t * 5.3) * Math.sin(t * 2.1);
      screenMaterial.emissive.setRGB(0.25 + 0.2 * Math.sin(t * 1.7), 0.35 + 0.15 * Math.sin(t * 2.3 + 1), 0.6 + 0.2 * Math.sin(t * 1.1 + 2));
      screenMaterial.emissiveIntensity = on * (1.1 + flicker * 0.4);
      glow.intensity = on * (1.5 + flicker);
    },
  };
}

function washer(): FurnitureBuild {
  const g = new THREE.Group();
  g.add(at(box(0.6, 0.85, 0.58, enamel(), 0.02), 0, 0.425, 0));
  const drum = at(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 36), glass(0.55)), 0, 0.44, 0.3);
  drum.rotation.x = Math.PI / 2;
  g.add(drum);
  const ring = at(new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.025, 12, 40), chrome()), 0, 0.44, 0.3);
  g.add(ring);
  g.add(at(box(0.5, 0.1, 0.02, rubber(), 0.01), 0, 0.77, 0.295));
  g.add(at(cyl(0.03, 0.03, 0.03, steel()), 0.2, 0.77, 0.31));
  return { object: g };
}

function floorLamp(): FurnitureBuild {
  const g = new THREE.Group();
  g.add(at(cyl(0.12, 0.14, 0.03, rubber()), 0, 0.015, 0));
  g.add(at(cyl(0.012, 0.012, 1.45, steel(), 10), 0, 0.75, 0));
  const shade = at(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.24, 0.3, 32, 1, true), new THREE.MeshStandardMaterial({ color: "#f2e4c8", side: THREE.DoubleSide, roughness: 0.9, emissive: "#ffd9a0", emissiveIntensity: 0 })), 0, 1.6, 0);
  g.add(shade);
  const light = new THREE.PointLight("#ffd9a0", 0, 5, 1.8);
  light.position.set(0, 1.55, 0);
  g.add(light);
  return {
    object: g,
    update(_dt, ctx) {
      const on = ctx.night;
      (shade.material as THREE.MeshStandardMaterial).emissiveIntensity = on * 1.2;
      light.intensity = on * 6;
    },
  };
}

function rug(): FurnitureBuild {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(2.0, 0.02, 1.4, 2, 0.008), ankara("#b3361e", "#183d5c", "#efd9a2"));
  mesh.position.y = 0.011;
  mesh.receiveShadow = true;
  g.add(mesh);
  return { object: g };
}

function doormat(): FurnitureBuild {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.025, 0.5, 2, 0.01), coir());
  mesh.position.y = 0.0125;
  mesh.receiveShadow = true;
  g.add(mesh);
  return { object: g };
}

export const PROCEDURAL_BUILDERS: Record<string, () => FurnitureBuild> = {
  p_fridge: fridge,
  p_kitchen_base: () => kitchenUnit(false),
  p_kitchen_sink: () => kitchenUnit(true),
  p_kitchen_wall: kitchenWall,
  p_toilet: toilet,
  p_basin: basin,
  p_shower: shower,
  p_bed: bed,
  p_wardrobe: wardrobe,
  p_tv_flat: flatTV,
  p_washer: washer,
  p_floor_lamp: floorLamp,
  p_rug: rug,
  p_doormat: doormat,
};
