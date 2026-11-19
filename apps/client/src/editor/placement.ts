import type { GridPos, GridSize, PlacedObject, Rotation } from '@interna/shared';
import { CATALOG } from '../catalog/placeholders';
import { rotatedFootprint } from '../scene/grid';

/** Предметы ниже этой высоты (ковры) лежат на полу: по ним можно ходить и ставить на них мебель. */
export const FLAT_HEIGHT = 0.05;

export function isFlat(defId: string) {
  const def = CATALOG[defId];
  return !!def && def.height < FLAT_HEIGHT;
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
 * - мебель нельзя ставить на клетки, где стоит персонаж.
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

  const flat = def.height < FLAT_HEIGHT;
  for (const other of objects) {
    if (other.id === query.ignoreId) continue;
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
