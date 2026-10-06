// The isometric view: a 1 m square on the floor is a diamond 128 px wide and 64 px high; a metre of height is about 78 px.
// World axes: x to the east, z to the south, y up. The camera sits to the south-east, so the north and west walls are the back walls.

export const HALF_W = 64;
export const HALF_H = 32;
export const PX_PER_M_UP = 78.4;

export const project = (x: number, y: number, z: number): [number, number] => [(x - z) * HALF_W, (x + z) * HALF_H - y * PX_PER_M_UP];

/** The point on the floor under a screen position (relative to the world origin's screen position). */
export const unproject = (sx: number, sy: number): [number, number] => {
  const a = sx / HALF_W, b = sy / HALF_H; // x - z, x + z
  return [(a + b) / 2, (b - a) / 2];
};

/** Which of 8 sprite directions faces a heading (dx, dz). 0 faces south (+z), then turning through the west (2) to the north (4). */
export const dirOf = (dx: number, dz: number): number => ((Math.round(Math.atan2(dx, dz) / (Math.PI / 4)) % 8) + 8) % 8;
