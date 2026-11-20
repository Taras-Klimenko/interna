import { CELL_SIZE, type GridSize, type PlacedObject } from '@interna/shared';
import { CATALOG } from '../catalog/catalog';
import { footprintCenter, roomDimensions, rotatedFootprint, worldToCell } from './grid';

/**
 * Вы сами в комнате (режим от первого лица): где стоите и куда смотрите.
 * Меняется каждый кадр, поэтому это простой объект, а не стор: React тут перерисовывать нечего.
 */
export const player = {
  /** Включён ли режим от первого лица. */
  active: false,
  /** Ставили ли вас в комнату в этой сессии: при повторном входе продолжаем с того же места. */
  placed: false,
  x: 0,
  z: 0,
  /** Поворот головы в радианах: yaw — влево (+) и вправо, pitch — вверх (+) и вниз. */
  yaw: 0,
  pitch: 0,
  /** Куда идти после тапа по полу (точки в мировых координатах). */
  route: [] as { x: number; z: number }[],
};

/** Где стоит персонаж: пишет Character каждый кадр, читают ваши столкновения. */
export const characterBody = { x: 0, z: 0 };

/** Радиус «тела» игрока и персонажа для столкновений. */
export const PLAYER_RADIUS = 0.18;
export const CHARACTER_RADIUS = 0.22;
/** Рост: на этой высоте глаза. */
export const EYE_HEIGHT = 1.55;
/** С такого расстояния до предмета дотягиваетесь сами (метры от края предмета). */
export const REACH = 1.1;

/** Можно ли стоять в точке: внутри комнаты, не в мебели и не в персонаже. */
export function canStand(x: number, z: number, blocked: boolean[][], room: GridSize) {
  const { width, depth } = roomDimensions(room);
  const r = PLAYER_RADIUS;
  if (x < -width / 2 + r || x > width / 2 - r || z < -depth / 2 + r || z > depth / 2 - r) return false;

  const u = x + width / 2;
  const v = z + depth / 2;
  for (let cz = Math.floor((v - r) / CELL_SIZE); cz <= Math.floor((v + r) / CELL_SIZE); cz++) {
    for (let cx = Math.floor((u - r) / CELL_SIZE); cx <= Math.floor((u + r) / CELL_SIZE); cx++) {
      if (!blocked[cz]?.[cx]) continue;
      // Ближайшая к центру тела точка клетки: дальше радиуса — не задеваем.
      const nx = Math.min(Math.max(u, cx * CELL_SIZE), (cx + 1) * CELL_SIZE);
      const nz = Math.min(Math.max(v, cz * CELL_SIZE), (cz + 1) * CELL_SIZE);
      if (Math.hypot(u - nx, v - nz) < r) return false;
    }
  }
  return Math.hypot(x - characterBody.x, z - characterBody.z) >= r + CHARACTER_RADIUS;
}

/** Клетка, где вы стоите (null — режим выключен). */
export function playerCell(room: GridSize) {
  return player.active ? worldToCell(player.x, player.z, room) : null;
}

/** Дотягиваетесь ли до предмета с места, где стоите. */
export function playerCanReach(object: PlacedObject, room: GridSize) {
  const def = CATALOG[object.defId];
  if (!player.active || !def) return false;
  const fp = rotatedFootprint(def.footprint, object.rotation);
  const c = footprintCenter(object.pos, fp, room);
  const dx = Math.max(Math.abs(player.x - c.x) - (fp.w * CELL_SIZE) / 2, 0);
  const dz = Math.max(Math.abs(player.z - c.z) - (fp.h * CELL_SIZE) / 2, 0);
  return Math.hypot(dx, dz) <= REACH;
}
