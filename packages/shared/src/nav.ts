// Grid pathfinding for walking characters. Pure logic with no rendering, so the same code can later run on the
// server to validate that a move is possible. Coordinates are metres on the ground plane (x, z).

export interface Point {
  x: number;
  z: number;
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface NavGrid {
  minX: number;
  minZ: number;
  cell: number;
  width: number;
  height: number;
  /** 1 = blocked, 0 = free. */
  blocked: Uint8Array;
}

export function createNavGrid(bounds: Rect, cell: number): NavGrid {
  const width = Math.ceil((bounds.maxX - bounds.minX) / cell);
  const height = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
  return { minX: bounds.minX, minZ: bounds.minZ, cell, width, height, blocked: new Uint8Array(width * height) };
}

function toCell(grid: NavGrid, x: number, z: number): [number, number] {
  return [Math.floor((x - grid.minX) / grid.cell), Math.floor((z - grid.minZ) / grid.cell)];
}

function inside(grid: NavGrid, cx: number, cz: number): boolean {
  return cx >= 0 && cz >= 0 && cx < grid.width && cz < grid.height;
}

/** Marks every cell touched by `rect` (grown by `inflate` metres, e.g. the character's radius) as blocked. */
export function blockRect(grid: NavGrid, rect: Rect, inflate = 0): void {
  const [x0, z0] = toCell(grid, rect.minX - inflate, rect.minZ - inflate);
  const [x1, z1] = toCell(grid, rect.maxX + inflate, rect.maxZ + inflate);
  for (let cz = Math.max(0, z0); cz <= Math.min(grid.height - 1, z1); cz++) {
    for (let cx = Math.max(0, x0); cx <= Math.min(grid.width - 1, x1); cx++) grid.blocked[cz * grid.width + cx] = 1;
  }
}

/** Blocks everything outside `rect`, so characters can't walk off the playable area. */
export function blockOutside(grid: NavGrid, rect: Rect, inflate = 0): void {
  for (let cz = 0; cz < grid.height; cz++) {
    for (let cx = 0; cx < grid.width; cx++) {
      const x = grid.minX + (cx + 0.5) * grid.cell;
      const z = grid.minZ + (cz + 0.5) * grid.cell;
      if (x < rect.minX + inflate || x > rect.maxX - inflate || z < rect.minZ + inflate || z > rect.maxZ - inflate) {
        grid.blocked[cz * grid.width + cx] = 1;
      }
    }
  }
}

export function isFree(grid: NavGrid, x: number, z: number): boolean {
  const [cx, cz] = toCell(grid, x, z);
  return inside(grid, cx, cz) && grid.blocked[cz * grid.width + cx] === 0;
}

/** The closest free spot to (x, z), searching outward in rings; null if nothing is free nearby. */
export function nearestFree(grid: NavGrid, x: number, z: number, maxRadius = 2.5): Point | null {
  if (isFree(grid, x, z)) return { x, z };
  const [cx, cz] = toCell(grid, x, z);
  const maxR = Math.ceil(maxRadius / grid.cell);
  let best: Point | null = null;
  let bestDist = Infinity;
  for (let r = 1; r <= maxR; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (!inside(grid, nx, nz) || grid.blocked[nz * grid.width + nx]) continue;
        const px = grid.minX + (nx + 0.5) * grid.cell;
        const pz = grid.minZ + (nz + 0.5) * grid.cell;
        const d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < bestDist) {
          bestDist = d;
          best = { x: px, z: pz };
        }
      }
    }
    if (best) return best; // the first ring with any free cell holds the nearest one (within a cell)
  }
  return null;
}

/** True if the straight segment between two points crosses only free cells. */
export function lineFree(grid: NavGrid, a: Point, b: Point): boolean {
  const distance = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(distance / (grid.cell * 0.4)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!isFree(grid, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}

class MinHeap {
  private items: { key: number; value: number }[] = [];
  get size() {
    return this.items.length;
  }
  push(key: number, value: number) {
    const a = this.items;
    a.push({ key, value });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p]!.key <= a[i]!.key) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]!.key < a[m]!.key) m = l;
        if (r < a.length && a[r]!.key < a[m]!.key) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top.value;
  }
}

const SQRT2 = Math.SQRT2;

/**
 * Shortest walkable route from `from` to `to`, as waypoints (the start is not included). The route is straightened
 * so the character walks in long lines rather than following grid cells. Returns null if `to` can't be reached.
 */
export function findPath(grid: NavGrid, from: Point, to: Point): Point[] | null {
  const start = nearestFree(grid, from.x, from.z, 1);
  const goal = nearestFree(grid, to.x, to.z, 2.5);
  if (!start || !goal) return null;

  const [sx, sz] = toCell(grid, start.x, start.z);
  const [gx, gz] = toCell(grid, goal.x, goal.z);
  const { width, height } = grid;
  const startIndex = sz * width + sx;
  const goalIndex = gz * width + gx;
  if (startIndex === goalIndex) return [{ x: goal.x, z: goal.z }];

  const g = new Float32Array(width * height).fill(Infinity);
  const parent = new Int32Array(width * height).fill(-1);
  const closed = new Uint8Array(width * height);
  const open = new MinHeap();
  g[startIndex] = 0;
  open.push(0, startIndex);

  const heuristic = (cx: number, cz: number) => {
    const dx = Math.abs(cx - gx);
    const dz = Math.abs(cz - gz);
    return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz);
  };

  let found = false;
  while (open.size) {
    const current = open.pop();
    if (closed[current]) continue;
    closed[current] = 1;
    if (current === goalIndex) {
      found = true;
      break;
    }
    const cx = current % width;
    const cz = (current / width) | 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (!inside(grid, nx, nz)) continue;
        const ni = nz * width + nx;
        if (grid.blocked[ni] || closed[ni]) continue;
        if (dx && dz && (grid.blocked[cz * width + nx] || grid.blocked[nz * width + cx])) continue; // no corner cutting
        const cost = g[current]! + (dx && dz ? SQRT2 : 1);
        if (cost < g[ni]!) {
          g[ni] = cost;
          parent[ni] = current;
          open.push(cost + heuristic(nx, nz), ni);
        }
      }
    }
  }
  if (!found) return null;

  const cells: Point[] = [];
  for (let i = goalIndex; i !== -1; i = parent[i]!) {
    cells.push({ x: grid.minX + ((i % width) + 0.5) * grid.cell, z: grid.minZ + (((i / width) | 0) + 0.5) * grid.cell });
  }
  cells.reverse();
  cells[0] = { x: start.x, z: start.z };

  // String pulling: from each anchor, jump to the farthest point still in clear sight.
  const route: Point[] = [];
  let anchor = 0;
  while (anchor < cells.length - 1) {
    let far = anchor + 1;
    for (let k = cells.length - 1; k > anchor + 1; k--) {
      if (lineFree(grid, cells[anchor]!, cells[k]!)) {
        far = k;
        break;
      }
    }
    route.push(cells[far]!);
    anchor = far;
  }
  // End exactly on the requested spot when it is free, otherwise on the nearest free cell.
  if (isFree(grid, to.x, to.z) && lineFree(grid, route.length > 1 ? route[route.length - 2]! : start, to)) {
    route[route.length - 1] = { x: to.x, z: to.z };
  }
  return route;
}

export function pathLength(from: Point, route: Point[]): number {
  let total = 0;
  let prev = from;
  for (const p of route) {
    total += Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
  }
  return total;
}
