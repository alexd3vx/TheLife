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
  /** A switch (lamp) rather than an activity: no game action, it just flips the item's on/off state. */
  toggle?: boolean;
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
  /** Where the head should turn while doing it (world point), if there is something to look at. */
  look?: [number, number, number];
  /** For beds: where to sit down on the edge before lying back, and the way to face while sitting. */
  edge?: { pose: [number, number, number]; yaw: number };
  hint: string;
}

export interface DerivedItem {
  def: Placement;
  /** Catalog category and default action. */
  category: string;
  action?: string;
  toggle?: "light";
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
 * Height of the surface you'd actually sit or lie on near x, z: the middle of a small grid of top-down samples, so a
 * pillow on part of the seat, or the seam between two cushions, doesn't move the character up or down.
 */
export function supportHeight(object: THREE.Object3D, x: number, z: number, fromY: number, spread = 0.15): number | null {
  const heights: number[] = [];
  for (const dx of [-spread, 0, spread]) {
    for (const dz of [-spread, 0, spread]) {
      const h = surfaceHeight(object, x + dx, z + dz, fromY);
      if (h !== null) heights.push(h);
    }
  }
  if (!heights.length) return null;
  heights.sort((a, b) => a - b);
  return heights[Math.floor((heights.length - 1) / 2)]!; // the middle sample: robust to a seam or a pillow
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

export function deriveInteractions(items: DerivedItem[], ok: Ok, boxOf?: (id: string) => THREE.Box3 | undefined): Map<string, Interaction[]> {
  const result = new Map<string, Interaction[]>();
  for (const item of items) {
    const actionId = itemAction(item);
    const action = actionId ? ACTIONS[actionId] : undefined;
    if ((!actionId || !action) && !item.toggle) continue;
    if (!action) {
      // A switch: stand in front of it, face it, flip it.
      const rot = ((item.def.rot ?? 0) * Math.PI) / 180;
      const f = { x: Math.sin(rot), z: Math.cos(rot) };
      const r = { x: Math.cos(rot), z: -Math.sin(rot) };
      const c = item.reach.getCenter(new THREE.Vector3());
      const gap = (dx: number, dz: number) => extent(item.reach, dx, dz) + STAND_GAP;
      const approach = firstOk(
        [
          [c.x + f.x * gap(f.x, f.z), c.z + f.z * gap(f.x, f.z)],
          [c.x + r.x * gap(r.x, r.z), c.z + r.z * gap(r.x, r.z)],
          [c.x - r.x * gap(r.x, r.z), c.z - r.z * gap(r.x, r.z)],
          [c.x - f.x * gap(f.x, f.z), c.z - f.z * gap(f.x, f.z)],
          // if all four are taken (a desk against a wall with a chair at it), any free spot round the piece will do
          ...[0.7, 1.4, 2.1, 2.8, 3.5, 4.2, 4.9, 5.6].flatMap((turn) => [1, 1.5].map((far): [number, number] => {
            const a = Math.atan2(f.x, f.z) + turn;
            const d = Math.max(gap(Math.sin(a), Math.cos(a)), 0.5) * far;
            return [c.x + Math.sin(a) * d, c.z + Math.cos(a) * d];
          })),
        ],
        ok,
      );
      result.set(item.def.id, [{ id: item.def.id, itemId: item.def.id, action: "", toggle: true, approach, yaw: Math.atan2(c.x - approach[0], c.z - approach[1]), at: [c.x, c.z], look: [c.x, Math.min(item.reach.max.y, 1.3), c.z], hint: "Switch on or off" }]);
      continue;
    }
    if (!actionId) continue;

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
        const watched = item.def.link?.map((id) => boxOf?.(id)).find((b): b is THREE.Box3 => !!b);
        const look = watched ? watched.getCenter(new THREE.Vector3()) : undefined;
        list.push({
          id: slots.length > 1 ? `${item.def.id}#${index}` : item.def.id,
          itemId: item.def.id,
          action: actionId,
          approach,
          yaw: Math.atan2(f.x, f.z),
          pose: [rx, top - HIP_HEIGHT, rz],
          at: [cx, cz],
          ...(look ? { look: [look.x, look.y, look.z] as [number, number, number] } : {}),
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
      // Sit on the edge nearest the approach first, then lie back: hips on the edge, facing away from the bed.
      const out = new THREE.Vector2(approach[0] - centre.x, approach[1] - centre.z).normalize();
      const reach = extent(item.box, out.x, out.y);
      const hx = centre.x + out.x * (reach - 0.24);
      const hz = centre.z + out.y * (reach - 0.24);
      const edge = { pose: [hx + out.x * SEAT_BACK, top - HIP_HEIGHT, hz + out.y * SEAT_BACK] as [number, number, number], yaw: Math.atan2(out.x, out.y) };
      list.push({ id: item.def.id, itemId: item.def.id, action: actionId, approach, yaw: Math.atan2(f.x, f.z), pose: [centre.x, top, centre.z], at: [centre.x, centre.z], edge, hint });
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
      const lookHeight = THREE.MathUtils.clamp(item.reach.min.y + (item.reach.max.y - item.reach.min.y) * 0.65, 0.95, 1.5);
      const interaction: Interaction = { id: item.def.id, itemId: item.def.id, action: actionId, approach, yaw, at: [c.x, c.z], look: [c.x, lookHeight, c.z], hint };
      if (ENTER_ACTIONS.has(actionId)) interaction.pose = [centre.x, item.box.min.y, centre.z];
      list.push(interaction);
    }
    if (list.length) result.set(item.def.id, list);
  }
  return result;
}
