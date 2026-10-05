import * as THREE from "three";
import { createBuilding, createBuildingMaterials, type BuildingSpec } from "./buildings";
import {
  createBillboard,
  createPalm,
  createPowerPole,
  createPropMaterials,
  createStreetLamp,
  createWire,
} from "./props";
import { createRng } from "./rng";
import { createSky, HORIZON_COLOR } from "./sky";
import { CROSS_STREET_WIDTH, CROSS_STREET_X, FRONT_LINE, ROAD_WIDTH, SIDEWALK_WIDTH, createStreet } from "./street";
import { makeConcreteTexture, makeFacade, makeGlowTexture } from "./textures";
import { animateWalk, createPerson, type Person } from "./people";
import { createBus, createCar } from "./vehicles";

export interface CityScene {
  scene: THREE.Scene;
  /** Keeps the sky centred on the camera and moves cars and people. */
  update(deltaSeconds: number, camera: THREE.Camera): void;
  dispose(): void;
}

export interface CityOptions {
  shadowMapSize: number;
  seed?: number;
}

const STREET_LENGTH = 300;
const WALLS = ["#e9dcc0", "#d9a86a", "#c9d8c0", "#e7c9c0", "#cfd6dc", "#f0e8d6", "#d6b48a"];
const CAR_COLORS = ["#b8c0c8", "#1f2a36", "#a8322b", "#e9e9e6", "#2f5d8a", "#3a3a3a", "#caa04a"];

interface Vehicle {
  object: THREE.Object3D;
  speed: number;
  direction: 1 | -1;
}

export function createCityScene(options: CityOptions): CityScene {
  const rng = createRng(options.seed ?? 11);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HORIZON_COLOR, 70, 330);

  const sunDirection = new THREE.Vector3(-0.55, 0.32, 0.77).normalize();
  const glowTexture = makeGlowTexture();
  const sky = createSky(glowTexture, sunDirection);
  scene.add(sky);

  addLighting(scene, sunDirection, options.shadowMapSize);
  scene.add(createStreet(rng, STREET_LENGTH));

  const facades = WALLS.map((wall) => makeFacade(rng, wall, 0.32));
  const buildingMats = createBuildingMaterials(makeConcreteTexture(rng));
  const buildings = new THREE.Group();
  let billboardPlaced = false;

  for (const side of [-1, 1] as const) {
    const facing = (side === -1 ? 1 : -1) as 1 | -1;

    // Front row along the street.
    let x = -STREET_LENGTH / 2 + 6;
    while (x < STREET_LENGTH / 2 - 10) {
      const width = rng.range(9, 16);
      const centre = x + width / 2;
      const crossesJunction = Math.abs(centre - CROSS_STREET_X) < CROSS_STREET_WIDTH / 2 + width / 2 + 1;
      if (!crossesJunction) {
        const near = Math.abs(centre) < 70;
        const roll = rng.next();
        const style = roll < (near ? 0.4 : 0.15) ? "tower" : roll < (near ? 0.75 : 0.55) ? "shop" : "house";
        const depth = rng.range(11, 16);
        const floors = style === "tower" ? rng.int(4, 8) : style === "shop" ? rng.int(2, 3) : 1;
        const spec: BuildingSpec = {
          style,
          x: centre,
          z: side * (FRONT_LINE + depth / 2),
          width,
          depth,
          floors,
          facing,
          facade: rng.pick(facades),
        };
        const building = createBuilding(spec, buildingMats, rng);
        buildings.add(building);

        if (!billboardPlaced && side === -1 && style === "tower" && centre > -30 && centre < 10) {
          const billboard = createBillboard();
          billboard.position.set(centre, floors * 3.4 + 0.6, spec.z + depth / 2 - 1);
          buildings.add(billboard);
          billboardPlaced = true;
        }
      }
      x += width + rng.range(0.4, 2.2);
    }

    // Taller backdrop towers for skyline depth.
    for (let i = 0; i < 12; i++) {
      const width = rng.range(12, 20);
      const depth = rng.range(12, 18);
      buildings.add(
        createBuilding(
          {
            style: "tower",
            x: -110 + i * 20 + rng.range(-4, 4),
            z: side * rng.range(38, 56),
            width,
            depth,
            floors: rng.int(8, 15),
            facing,
            facade: rng.pick(facades),
          },
          buildingMats,
          rng,
        ),
      );
    }
  }
  scene.add(buildings);

  const propMats = createPropMaterials(glowTexture);
  const props = new THREE.Group();
  const curbZ = ROAD_WIDTH / 2 + SIDEWALK_WIDTH - 0.6;

  for (let x = -120; x <= 120; x += 20) {
    for (const side of [-1, 1] as const) {
      const lamp = createStreetLamp(propMats, (side === 1 ? -1 : 1) as 1 | -1);
      lamp.position.set(x + (side === 1 ? 0 : 10), 0.2, side * curbZ);
      props.add(lamp);
    }
  }
  for (const side of [-1, 1] as const) {
    const poles: THREE.Vector3[] = [];
    for (let x = -112; x <= 112; x += 28) {
      const pole = createPowerPole(propMats);
      pole.position.set(x, 0.2, side * (curbZ + 0.6));
      props.add(pole);
      poles.push(new THREE.Vector3(x, 9.3, side * (curbZ + 0.6)));
    }
    for (let i = 0; i < poles.length - 1; i++) {
      for (const dz of [-1.1, 0, 1.1]) {
        const a = poles[i]!.clone().add(new THREE.Vector3(0, 0, dz));
        const b = poles[i + 1]!.clone().add(new THREE.Vector3(0, 0, dz));
        props.add(createWire(a, b, 0.9));
      }
    }
    for (let x = -118; x < 118; x += rng.range(12, 26)) {
      if (Math.abs(x - CROSS_STREET_X) < 7) continue;
      const palm = createPalm(propMats, rng);
      palm.position.set(x, 0.2, side * (curbZ + 1.2));
      props.add(palm);
    }
  }
  scene.add(props);

  const vehicles = createTraffic(rng, scene);
  const people = createPedestrians(rng, scene);

  return {
    scene,
    update(delta, camera) {
      sky.position.copy(camera.position);
      for (const vehicle of vehicles) {
        vehicle.object.position.x += vehicle.speed * vehicle.direction * delta;
        if (vehicle.object.position.x > 130) vehicle.object.position.x = -130;
        if (vehicle.object.position.x < -130) vehicle.object.position.x = 130;
      }
      for (const person of people) {
        const p = person.object.position;
        p.x += person.speed * person.direction * delta;
        if (p.x > 70) p.x = -70;
        if (p.x < -70) p.x = 70;
        animateWalk(person, p.x * 3.2);
      }
    },
    dispose() {
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const material of materials) {
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) value.dispose();
          }
          material.dispose();
        }
      });
    },
  };
}

function addLighting(scene: THREE.Scene, sunDirection: THREE.Vector3, shadowMapSize: number) {
  scene.add(new THREE.HemisphereLight("#a9bdf0", "#8a6048", 1.25));

  const sun = new THREE.DirectionalLight("#ffb978", 3.2);
  sun.position.copy(sunDirection).multiplyScalar(120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  const cam = sun.shadow.camera;
  cam.left = -75;
  cam.right = 75;
  cam.top = 75;
  cam.bottom = -75;
  cam.near = 10;
  cam.far = 300;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight("#6f86c8", 0.5);
  fill.position.set(60, 40, -50);
  scene.add(fill);
}

function createTraffic(rng: ReturnType<typeof createRng>, scene: THREE.Scene): Vehicle[] {
  const vehicles: Vehicle[] = [];
  const laneOffset = ROAD_WIDTH / 4;
  for (let i = 0; i < 12; i++) {
    const direction = (i % 2 === 0 ? 1 : -1) as 1 | -1;
    const object = rng.chance(0.25) ? createBus() : createCar(rng.pick(CAR_COLORS));
    object.position.set(-120 + (i >> 1) * 42 + rng.range(-8, 8), 0.02, direction * laneOffset);
    if (direction === -1) object.rotation.y = Math.PI;
    scene.add(object);
    vehicles.push({ object, speed: rng.range(5, 9), direction });
  }
  return vehicles;
}

function createPedestrians(rng: ReturnType<typeof createRng>, scene: THREE.Scene): Person[] {
  const people: Person[] = [];
  const walkZ = ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2;
  for (let i = 0; i < 18; i++) {
    const person = createPerson(rng);
    const side = i % 2 === 0 ? 1 : -1;
    person.object.position.set(rng.range(-60, 60), 0.22, side * (walkZ + rng.range(-0.8, 0.8)));
    person.object.rotation.y = person.direction === 1 ? 0 : Math.PI;
    scene.add(person.object);
    people.push(person);
  }
  return people;
}
