import { CELL_SIZE, type GridPos, type GridSize, type Rotation } from '@interna/shared';

/** Размер комнаты в метрах. Комната стоит центром в начале координат. */
export function roomDimensions(size: GridSize) {
  return { width: size.w * CELL_SIZE, depth: size.h * CELL_SIZE };
}

/** Занимаемая площадь с учётом поворота: при 90° и 270° ширина и глубина меняются местами. */
export function rotatedFootprint(footprint: GridSize, rotation: Rotation): GridSize {
  return rotation === 90 || rotation === 270 ? { w: footprint.h, h: footprint.w } : footprint;
}

/** Центр предмета в мировых координатах (x, z) по его левой-верхней клетке. */
export function footprintCenter(pos: GridPos, footprint: GridSize, roomSize: GridSize) {
  const { width, depth } = roomDimensions(roomSize);
  return {
    x: (pos.x + footprint.w / 2) * CELL_SIZE - width / 2,
    z: (pos.z + footprint.h / 2) * CELL_SIZE - depth / 2,
  };
}

/** Центр клетки в мировых координатах. */
export function cellCenter(cell: GridPos, roomSize: GridSize) {
  return footprintCenter(cell, { w: 1, h: 1 }, roomSize);
}

/** Клетка под точкой (x, z) в мировых координатах, или null, если точка за пределами комнаты. */
export function worldToCell(x: number, z: number, roomSize: GridSize): GridPos | null {
  const { width, depth } = roomDimensions(roomSize);
  const cell = { x: Math.floor((x + width / 2) / CELL_SIZE), z: Math.floor((z + depth / 2) / CELL_SIZE) };
  if (cell.x < 0 || cell.z < 0 || cell.x >= roomSize.w || cell.z >= roomSize.h) return null;
  return cell;
}

export function rotationToRadians(rotation: Rotation) {
  return (-rotation * Math.PI) / 180;
}
