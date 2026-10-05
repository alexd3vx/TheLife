import * as THREE from "three";
import { ACTIONS } from "@thelife/game-core";
import type { ModelMeta } from "../furniture/models";
import type { Placement } from "./layout";

// Works out how the character uses each placed piece of furniture (where to stand, where to sit, where to lie) from the
// piece's measured shape. Nothing here is tuned per item: add a chair to the catalog and it gets a seat automatically.

/** Distance the hips sit behind the character's origin during Sitting_Idle_Loop, and the hips' height above it (measured from the clip). */
export const SEAT_BACK = 0.331;
export const HIP_HEIGHT = 0.452;
const STAND_GAP = 0.55; // how far in front of a piece you stand to use it

export interface Interaction {
  /** The placed item this belongs to, plus a slot number for multi-seat pieces ("sofa#1"). */
  id: string;
  itemId: string;
  action: string;
  /** Where to stand to start (and where you stand again afterwards). */
  approach: [number, number];
  /** The direction the character faces while doing it (radians; 0 faces south, +z). */
  yaw: number;
  /**
   * Where the character's origin ends up when sitting, lying or stepping into something. For lying the height is the
   * mattress surface; the controller lowers the body onto it using the measured pose.
   */
  pose?: [number, number, number];
  /** Centre of this seat/spot, to match a tap on a multi-seat sofa to the nearest seat. */
  at: [number, number];
  hint: string;
}

export interface DerivedItem {
  def: Placement;
  /** Catalog category and default action. */
  category: string;
  action?: string;
  meta: ModelMeta;
  group: THREE.Object3D;
  /** World box of this item, and of what it stands on (equal when it stands on the floor). */
  box: THREE.Box3;
  reach: THREE.Box3;
}

const HINTS: Record<string, string> = {
  snack: "Grab a snack",
  cook: "Cook a meal",
  eatMeal: "Sit and eat",
  tv: "Sit and watch TV",
  work: "Work at the computer",
  sleep: "Go to sleep",
  toilet: "Use the toilet",
  shower: "Take a shower",
  brush: "Brush your teeth",
  radio: "Dance to the radio",
  read: "Read a book",
  sit: "Sit down",
};

const ENTER_ACTIONS = new Set(["shower"]);

const raycaster = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Height of the surface you'd actually sit or lie on near x, z: the lowest of a small grid of top-down samples, so a
 * pillow or folded blanket on part of the seat doesn't lift the character onto it.
 */
export function supportHeight(object: THREE.Object3D, x: number, z: number, fromY: number, spread = 0.15): number | null {
  const heights: number[] = [];
  for (const dx of [-spread, 0, spread]) {
    for (const dz of [-spread, 0, spread]) {
      const h = surfaceHeight(object, x + dx, z + dz, fromY);
      if (h !== null) heights.push(h);
    }
  }
  return heights.length ? Math.min(...heights) : null;
}

/** Height of the topmost surface of an object at x, z (metres), or null if nothing is there. */
export function surfaceHeight(object: THREE.Object3D, x: number, z: number, fromY: number): number | null {
  raycaster.set(new THREE.Vector3(x, fromY, z), DOWN);
  const hits = raycaster.intersectObject(object, true);
  for (const hit of hits) {
    const mesh = hit.object as THREE.Mesh;
    if (mesh.isMesh && mesh.visible) return hit.point.y;
  }
  return null;
}

export function itemAction(item: DerivedItem): string | undefined {
  if (item.def.decor) return undefined;
  return item.def.action ?? item.action;
}

function extent(box: THREE.Box3, dx: number, dz: number): number {
  const size = box.getSize(new THREE.Vector3());
  return (Math.abs(dx) * size.x) / 2 + (Math.abs(dz) * size.z) / 2;
}

type Ok = (x: number, z: number) => boolean;

function firstOk(candidates: [number, number][], ok: Ok): [number, number] {
  return candidates.find(([x, z]) => ok(x, z)) ?? candidates[0]!;
}

/**
 * Somewhere to walk to before sitting: in front of the seat or to its sides (never behind it, or sliding in would cross
 * the chair), as close as the room allows. Tries rings of growing distance, front first.
 */
function seatApproach(rx: number, rz: number, f: { x: number; z: number }, ok: Ok): [number, number] {
  const facing = Math.atan2(f.x, f.z);
  const candidates: [number, number][] = [];
  for (const distance of [0.65, 0.9, 1.15, 1.4, 1.7, 2.0]) {
    for (const turn of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
      const angle = facing + turn;
      candidates.push([rx + Math.sin(angle) * distance, rz + Math.cos(angle) * distance]);
    }
  }
  return firstOk(candidates, ok);
}

export function deriveInteractions(items: DerivedItem[], ok: Ok): Map<string, Interaction[]> {
  const result = new Map<string, Interaction[]>();
  for (const item of items) {
    const actionId = itemAction(item);
    const action = actionId ? ACTIONS[actionId] : undefined;
    if (!actionId || !action) continue;

    const rot = ((item.def.rot ?? 0) * Math.PI) / 180;
    const f = { x: Math.sin(rot), z: Math.cos(rot) }; // the way the front faces
    const r = { x: Math.cos(rot), z: -Math.sin(rot) }; // the item's local +x
    const centre = item.box.getCenter(new THREE.Vector3());
    const hint = HINTS[actionId] ?? action.label;
    const list: Interaction[] = [];

    const isSeat = item.category === "seating" || item.def.furniture === "p_toilet";
    const isBed = item.category === "bedroom" && action.pose === "lie";

    if (action.pose === "seat") {
      if (!isSeat) continue; // a TV or desk is used from a seat elsewhere (see Placement.via)
      const slots = item.meta.slots ?? [0];
      const [sx, sz] = item.meta.seatPoint ?? [0, 0];
      slots.forEach((slot, index) => {
        const cx = centre.x + r.x * (slot + sx) + f.x * sz;
        const cz = centre.z + r.z * (slot + sx) + f.z * sz;
        const top = item.meta.seatY !== undefined ? item.box.min.y + item.meta.seatY : (supportHeight(item.group, cx, cz, item.box.max.y + 1, 0.12) ?? item.box.min.y + item.box.getSize(new THREE.Vector3()).y * 0.45);
        const rx = cx + f.x * SEAT_BACK;
        const rz = cz + f.z * SEAT_BACK;
        const approach = seatApproach(rx, rz, f, ok);
        list.push({
          id: slots.length > 1 ? `${item.def.id}#${index}` : item.def.id,
          itemId: item.def.id,
          action: actionId,
          approach,
          yaw: Math.atan2(f.x, f.z),
          pose: [rx, top - HIP_HEIGHT, rz],
          at: [cx, cz],
          hint,
        });
      });
    } else if (action.pose === "lie") {
      if (!isBed) continue;
      const top = item.meta.lieY !== undefined ? item.box.min.y + item.meta.lieY : (supportHeight(item.group, centre.x, centre.z, item.box.max.y + 1, 0.3) ?? item.box.max.y * 0.5);
      const halfD = extent(item.box, f.x, f.z);
      const halfW = extent(item.box, r.x, r.z);
      const approach = firstOk(
        [
          [centre.x + f.x * (halfD + 0.6), centre.z + f.z * (halfD + 0.6)],
          [centre.x + r.x * (halfW + 0.6), centre.z + r.z * (halfW + 0.6)],
          [centre.x - r.x * (halfW + 0.6), centre.z - r.z * (halfW + 0.6)],
        ],
        ok,
      );
      list.push({ id: item.def.id, itemId: item.def.id, action: actionId, approach, yaw: Math.atan2(f.x, f.z), pose: [centre.x, top, centre.z], at: [centre.x, centre.z], hint });
    } else {
      const c = item.reach.getCenter(new THREE.Vector3());
      const gap = (dx: number, dz: number) => extent(item.reach, dx, dz) + STAND_GAP;
      const approach = firstOk(
        [
          [c.x + f.x * gap(f.x, f.z), c.z + f.z * gap(f.x, f.z)],
          [c.x + r.x * gap(r.x, r.z), c.z + r.z * gap(r.x, r.z)],
          [c.x - r.x * gap(r.x, r.z), c.z - r.z * gap(r.x, r.z)],
          [c.x - f.x * gap(f.x, f.z), c.z - f.z * gap(f.x, f.z)],
        ],
        ok,
      );
      const yaw = Math.atan2(c.x - approach[0], c.z - approach[1]); // face the item
      const interaction: Interaction = { id: item.def.id, itemId: item.def.id, action: actionId, approach, yaw, at: [c.x, c.z], hint };
      if (ENTER_ACTIONS.has(actionId)) interaction.pose = [centre.x, item.box.min.y, centre.z];
      list.push(interaction);
    }
    if (list.length) result.set(item.def.id, list);
  }
  return result;
}
