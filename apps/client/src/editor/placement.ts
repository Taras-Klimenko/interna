import { CELL_SIZE, type GridPos, type GridSize, type ObjectDef, type PlacedObject, type Rotation } from '@interna/shared';
import { CATALOG } from '../catalog/catalog';
import { roomDimensions, rotatedFootprint } from '../scene/grid';

/** Предметы ниже этой высоты (ковры) лежат на полу: по ним можно ходить и ставить на них мебель. */
export const FLAT_HEIGHT = 0.05;

export function isFlat(defId: string) {
  const def = CATALOG[defId];
  return !!def && !def.mount && def.height < FLAT_HEIGHT;
}

export function isWallMounted(defId: string) {
  return !!CATALOG[defId]?.mount;
}

/** Высота центра настенного предмета над полом. */
export function wallItemCenter(def: ObjectDef) {
  return (def.mount?.bottom ?? 0) + def.height / 2;
}

/**
 * Куда смотрит предмет с таким поворотом (единичный вектор в плоскости x/z).
 * Для настенного предмета это заодно направление «от стены в комнату».
 */
export function facingOf(rotation: Rotation): { x: number; z: number } {
  switch (rotation) {
    case 0:
      return { x: 0, z: 1 };
    case 90:
      return { x: -1, z: 0 };
    case 180:
      return { x: 0, z: -1 };
    case 270:
      return { x: 1, z: 0 };
  }
}

/** Висит ли предмет с таким поворотом у своей стены (у широкого — его первая клетка): рамка с поворотом 0 смотрит в +z, значит висит на задней стене (z = 0). */
function onItsWall(pos: GridPos, rotation: Rotation, room: GridSize) {
  switch (rotation) {
    case 0:
      return pos.z === 0;
    case 90:
      return pos.x === room.w - 1;
    case 180:
      return pos.z === room.h - 1;
    case 270:
      return pos.x === 0;
  }
}

export interface WallSpot {
  pos: GridPos;
  rotation: Rotation;
}

/**
 * Место на ближайшей стене к точке (x, z) в мировых координатах. Точка может быть и за стеной.
 * span — ширина предмета вдоль стены в клетках: широкий предмет (окно) встаёт серединой под курсор.
 * usable — на какие стены можно вешать (например, только на видимые с камеры).
 */
export function wallSpotAt(
  x: number,
  z: number,
  room: GridSize,
  span = 1,
  usable: (rotation: Rotation) => boolean = () => true,
): WallSpot {
  const { width, depth } = roomDimensions(room);
  const u = x + width / 2;
  const v = z + depth / 2;
  const col = Math.min(Math.max(Math.round(u / CELL_SIZE - span / 2), 0), Math.max(0, room.w - span));
  const row = Math.min(Math.max(Math.round(v / CELL_SIZE - span / 2), 0), Math.max(0, room.h - span));
  // Расстояние до линии стены: точка может быть и по ту сторону, за углом комнаты.
  const walls: [number, WallSpot][] = [
    [Math.abs(v), { pos: { x: col, z: 0 }, rotation: 0 }],
    [Math.abs(width - u), { pos: { x: room.w - 1, z: row }, rotation: 90 }],
    [Math.abs(depth - v), { pos: { x: col, z: room.h - 1 }, rotation: 180 }],
    [Math.abs(u), { pos: { x: 0, z: row }, rotation: 270 }],
  ];
  const candidates = walls.filter(([, spot]) => usable(spot.rotation));
  const pool = candidates.length > 0 ? candidates : walls;
  pool.sort((a, b) => a[0] - b[0]);
  return pool[0]![1];
}

export function footprintOf(defId: string, rotation: Rotation): GridSize {
  const def = CATALOG[defId];
  return def ? rotatedFootprint(def.footprint, rotation) : { w: 1, h: 1 };
}

export function nextRotation(rotation: Rotation): Rotation {
  return ((rotation + 90) % 360) as Rotation;
}

/** Сдвигает предмет так, чтобы он целиком помещался в комнате (упирается в стену, а не уходит за неё). */
export function clampToRoom(pos: GridPos, footprint: GridSize, room: GridSize): GridPos {
  return {
    x: Math.min(Math.max(pos.x, 0), Math.max(0, room.w - footprint.w)),
    z: Math.min(Math.max(pos.z, 0), Math.max(0, room.h - footprint.h)),
  };
}

function overlaps(aPos: GridPos, aSize: GridSize, bPos: GridPos, bSize: GridSize) {
  return aPos.x < bPos.x + bSize.w && bPos.x < aPos.x + aSize.w && aPos.z < bPos.z + bSize.h && bPos.z < aPos.z + aSize.h;
}

export interface PlacementQuery {
  defId: string;
  pos: GridPos;
  rotation: Rotation;
  /** Предмет, который сейчас переносим: с самим собой он не пересекается. */
  ignoreId?: string | null;
}

/**
 * Можно ли поставить предмет. Правила:
 * - целиком внутри комнаты;
 * - мебель не пересекается с мебелью, ковёр — с ковром, а мебель на ковре — можно;
 * - мебель нельзя ставить на клетки, где стоит персонаж;
 * - настенный предмет висит у «своей» стены, не на другом настенном и не за высокой мебелью
 *   (рамку над комодом повесить можно, а над шкафом — нет).
 */
export function canPlace(
  query: PlacementQuery,
  room: GridSize,
  objects: PlacedObject[],
  characterCells: GridPos[],
): boolean {
  const def = CATALOG[query.defId];
  if (!def) return false;
  const size = rotatedFootprint(def.footprint, query.rotation);
  const { pos } = query;
  if (pos.x < 0 || pos.z < 0 || pos.x + size.w > room.w || pos.z + size.h > room.h) return false;

  if (def.mount) {
    if (!onItsWall(pos, query.rotation, room)) return false;
    for (const other of objects) {
      const otherDef = CATALOG[other.defId];
      if (other.id === query.ignoreId || !otherDef) continue;
      const otherSize = rotatedFootprint(otherDef.footprint, other.rotation);
      if (!overlaps(pos, size, other.pos, otherSize)) continue;
      if (otherDef.mount ? other.rotation === query.rotation : otherDef.height > def.mount.bottom) return false;
    }
    return true;
  }

  const flat = def.height < FLAT_HEIGHT;
  for (const other of objects) {
    if (other.id === query.ignoreId) continue;
    const otherDef = CATALOG[other.defId];
    if (otherDef?.mount) {
      // Высокая мебель упрётся в висящую на стене рамку.
      if (def.height > otherDef.mount.bottom && overlaps(pos, size, other.pos, footprintOf(other.defId, other.rotation))) return false;
      continue;
    }
    if (isFlat(other.defId) !== flat) continue;
    if (overlaps(pos, size, other.pos, footprintOf(other.defId, other.rotation))) return false;
  }

  if (!flat) {
    for (const cell of characterCells) {
      if (overlaps(pos, size, cell, { w: 1, h: 1 })) return false;
    }
  }
  return true;
}

/**
 * Ближайшая к `preferred` позиция, где предмет помещается. Ищем по расширяющимся квадратам.
 * null — места в комнате нет совсем.
 */
export function findFreeSpot(
  query: PlacementQuery,
  room: GridSize,
  objects: PlacedObject[],
  characterCells: GridPos[],
): GridPos | null {
  const size = footprintOf(query.defId, query.rotation);
  const start = clampToRoom(query.pos, size, room);
  const maxRadius = Math.max(room.w, room.h);
  for (let r = 0; r <= maxRadius; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const pos = { x: start.x + dx, z: start.z + dz };
        if (canPlace({ ...query, pos }, room, objects, characterCells)) return pos;
      }
    }
  }
  return null;
}

/**
 * Свободное место для настенного предмета: сначала задняя стена (её видно с начального ракурса),
 * потом боковые и передняя, на каждой — поближе к середине.
 */
export function findFreeWallSpot(defId: string, room: GridSize, objects: PlacedObject[]): WallSpot | null {
  const walls: { rotation: Rotation; length: number; at: (i: number) => GridPos }[] = [
    { rotation: 0, length: room.w, at: (i) => ({ x: i, z: 0 }) },
    { rotation: 270, length: room.h, at: (i) => ({ x: 0, z: i }) },
    { rotation: 90, length: room.h, at: (i) => ({ x: room.w - 1, z: i }) },
    { rotation: 180, length: room.w, at: (i) => ({ x: i, z: room.h - 1 }) },
  ];
  for (const wall of walls) {
    const middle = (wall.length - 1) / 2;
    const order = [...Array(wall.length).keys()].sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle));
    for (const i of order) {
      const spot = { pos: wall.at(i), rotation: wall.rotation };
      if (canPlace({ defId, ...spot }, room, objects, [])) return spot;
    }
  }
  return null;
}
