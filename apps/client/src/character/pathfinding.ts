import type { GridPos, GridSize, PlacedObject } from '@interna/shared';
import { CATALOG } from '../catalog/placeholders';
import { rotatedFootprint } from '../scene/grid';

/** Предметы ниже этой высоты (ковры) не мешают ходить. */
const WALKABLE_HEIGHT = 0.05;

/** Карта занятых клеток: blocked[z][x] === true — пройти нельзя. */
export function buildOccupancy(size: GridSize, objects: PlacedObject[]): boolean[][] {
  const blocked = Array.from({ length: size.h }, () => Array<boolean>(size.w).fill(false));
  for (const object of objects) {
    const def = CATALOG[object.defId];
    if (!def || def.height < WALKABLE_HEIGHT) continue;
    const fp = rotatedFootprint(def.footprint, object.rotation);
    for (let dz = 0; dz < fp.h; dz++) {
      for (let dx = 0; dx < fp.w; dx++) {
        const row = blocked[object.pos.z + dz];
        if (row && object.pos.x + dx < size.w) row[object.pos.x + dx] = true;
      }
    }
  }
  return blocked;
}

export function isWalkable(blocked: boolean[][], cell: GridPos) {
  return blocked[cell.z]?.[cell.x] === false;
}

const DIRS = [
  { x: 1, z: 0, cost: 1 },
  { x: -1, z: 0, cost: 1 },
  { x: 0, z: 1, cost: 1 },
  { x: 0, z: -1, cost: 1 },
  { x: 1, z: 1, cost: Math.SQRT2 },
  { x: 1, z: -1, cost: Math.SQRT2 },
  { x: -1, z: 1, cost: Math.SQRT2 },
  { x: -1, z: -1, cost: Math.SQRT2 },
];

/**
 * A* по сетке с диагоналями (без срезания углов о мебель).
 * Возвращает клетки пути без стартовой, или null, если дойти нельзя.
 */
export function findPath(blocked: boolean[][], start: GridPos, goal: GridPos): GridPos[] | null {
  if (!isWalkable(blocked, goal)) return null;
  if (start.x === goal.x && start.z === goal.z) return [];

  const w = blocked[0]?.length ?? 0;
  const key = (p: GridPos) => p.z * w + p.x;
  const heuristic = (p: GridPos) => {
    const dx = Math.abs(p.x - goal.x);
    const dz = Math.abs(p.z - goal.z);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };

  const open = new Map<number, GridPos>([[key(start), start]]);
  const came = new Map<number, GridPos>();
  const g = new Map<number, number>([[key(start), 0]]);
  const f = new Map<number, number>([[key(start), heuristic(start)]]);

  while (open.size > 0) {
    // Комната маленькая (≈100 клеток), поэтому обычный перебор вместо кучи.
    let current: GridPos | undefined;
    let best = Infinity;
    for (const [k, p] of open) {
      const score = f.get(k) ?? Infinity;
      if (score < best) {
        best = score;
        current = p;
      }
    }
    if (!current) break;
    const ck = key(current);
    if (current.x === goal.x && current.z === goal.z) return reconstruct(came, current, key);
    open.delete(ck);

    for (const dir of DIRS) {
      const next = { x: current.x + dir.x, z: current.z + dir.z };
      if (!isWalkable(blocked, next)) continue;
      // По диагонали можно, только если обе соседние клетки свободны.
      if (dir.x !== 0 && dir.z !== 0) {
        if (!isWalkable(blocked, { x: current.x + dir.x, z: current.z })) continue;
        if (!isWalkable(blocked, { x: current.x, z: current.z + dir.z })) continue;
      }
      const nk = key(next);
      const tentative = (g.get(ck) ?? Infinity) + dir.cost;
      if (tentative < (g.get(nk) ?? Infinity)) {
        came.set(nk, current);
        g.set(nk, tentative);
        f.set(nk, tentative + heuristic(next));
        open.set(nk, next);
      }
    }
  }
  return null;
}

function reconstruct(came: Map<number, GridPos>, end: GridPos, key: (p: GridPos) => number) {
  const path = [end];
  let current = end;
  while (came.has(key(current))) {
    current = came.get(key(current))!;
    path.unshift(current);
  }
  path.shift(); // стартовая клетка
  return simplify(path);
}

/** Убирает промежуточные точки на прямых отрезках, чтобы персонаж не «дёргался» на каждой клетке. */
function simplify(path: GridPos[]) {
  if (path.length < 3) return path;
  const result: GridPos[] = [];
  for (let i = 0; i < path.length; i++) {
    const prev = path[i - 1];
    const cur = path[i]!;
    const next = path[i + 1];
    if (prev && next && cur.x - prev.x === next.x - cur.x && cur.z - prev.z === next.z - cur.z) continue;
    result.push(cur);
  }
  return result;
}
