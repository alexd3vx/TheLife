// How each catalog item is drawn and used, beyond what its 3D shape already tells us. Seat heights, footprints and
// facing are measured from the model itself; this only records the few things that can't be: how many seats a sofa has,
// which way a model's front points, what's mounted on the ceiling.

export interface ModelMeta {
  /** Degrees to rotate the model so its front faces +z. Poly Haven models already do. */
  rotation?: number;
  scale?: number;
  /** Seat centres along the item's width (local x, metres) for sofas and benches. One centred seat by default. */
  slots?: number[];
  /** Local [x, z] to sit at when it isn't the footprint centre. */
  seatPoint?: [number, number];
  /** Known seat height; otherwise measured with a ray from above. */
  seatY?: number;
  /** Known mattress height for beds. */
  lieY?: number;
  /** Hangs from the ceiling at this height (metres, to its underside). */
  ceiling?: boolean;
  /** Hangs on a wall at this height (metres to its bottom). */
  wallHeight?: number;
  /** The item emits light at night (a lamp). */
  lamp?: { x: number; y: number; z: number; color: string; strength: number };
}

export const MODEL_META: Record<string, ModelMeta> = {
  // seating
  sofa_02: { slots: [-0.45, 0.45] },
  sofa_03: { slots: [-0.8, 0, 0.8] },
  painted_wooden_bench: { slots: [-0.28, 0.28] },
  // procedural
  p_toilet: { seatY: 0.43, seatPoint: [0, 0.06] },
  // ceiling
  ceiling_fan: { ceiling: true },
  // lamps that glow at night
  desk_lamp_arm_01: { lamp: { x: 0, y: 0.8, z: 0.3, color: "#ffd9a0", strength: 3 } },
  vintage_oil_lamp: { lamp: { x: 0, y: 0.55, z: 0, color: "#ffb35e", strength: 2.5 } },
};

export function metaFor(id: string): ModelMeta {
  return MODEL_META[id] ?? {};
}
