import type { GridPos, GridSize, ObjectDef, PlacedObject } from '@interna/shared';
import { CATALOG } from '../catalog/catalog';
import { buildOccupancy, findPath, isWalkable } from '../character/pathfinding';
import { footprintCenter, rotatedFootprint } from '../scene/grid';
import { useWorldStore } from '../store/worldStore';
import { useCharacterStore } from '../store/characterStore';
import { useInteractionStore } from '../store/interactionStore';
import { resume } from '../audio/player';
import { playerCanReach } from '../scene/player';

/** Что персонаж умеет делать с предметами. Позже этот же список станет «инструментами» для ИИ. */
export type ActionId = 'lightOn' | 'lightOff' | 'water' | 'musicOn';

interface ActionDef {
  /** Анимация у предмета. Эффект применяется, когда она доиграет. */
  clip: string;
  /** Что делает персонаж — для подписи в карточке предмета: пока идёт и когда уже на месте. */
  going: string;
  doing: string;
  apply: (objectId: string) => void;
}

export const ACTIONS: Record<ActionId, ActionDef> = {
  lightOn: {
    clip: 'Interact',
    going: 'идёт включить свет',
    doing: 'включает свет',
    apply: (id) => useWorldStore.getState().setLight(id, true),
  },
  lightOff: {
    clip: 'Interact',
    going: 'идёт выключить свет',
    doing: 'выключает свет',
    apply: (id) => useWorldStore.getState().setLight(id, false),
  },
  water: {
    clip: 'Farm_Watering',
    going: 'идёт поливать',
    doing: 'поливает',
    apply: (id) => useWorldStore.getState().water(id),
  },
  musicOn: {
    clip: 'Interact',
    going: 'идёт включить музыку',
    doing: 'включает музыку',
    apply: (id) => void resume(id),
  },
};

/** Есть ли у предмета что-то, кроме «просто стоять»: такие предметы открывают карточку по клику. */
export function hasInteractions(def: ObjectDef) {
  return def.components.some(
    (c) =>
      c.type === 'light' ||
      c.type === 'needs' ||
      c.type === 'media' ||
      c.type === 'display' ||
      (c.type === 'container' && c.accepts === 'book'),
  );
}

/** Сколько книг помещается в предмет, или null, если книги в него не ставят. */
export function bookCapacity(def: ObjectDef): number | null {
  for (const c of def.components) if (c.type === 'container' && c.accepts === 'book') return c.capacity;
  return null;
}

/** Подход не спереди — чуть «дороже»: к шкафу лучше подойти лицом к полкам, даже если сбоку на шаг ближе. */
const SIDE_PENALTY = 2;

/**
 * Клетка рядом с предметом, куда персонажу встать, и путь до неё.
 * Берём соседние по стороне клетки (не по диагонали), выбираем ближайшую по пути, предпочитая переднюю сторону.
 * null — подойти нельзя (предмет со всех сторон заставлен).
 */
export function planApproach(
  object: PlacedObject,
  roomSize: GridSize,
  blocked: boolean[][],
  start: GridPos,
): { cells: GridPos[]; target: GridPos } | null {
  const def = CATALOG[object.defId];
  if (!def) return null;
  const fp = rotatedFootprint(def.footprint, object.rotation);
  const { x, z } = object.pos;

  // Модель при повороте 0 смотрит в +z; поворот идёт по часовой стрелке (если смотреть сверху).
  const front = { 0: '+z', 90: '-x', 180: '-z', 270: '+x' }[object.rotation];
  const candidates: { cell: GridPos; side: string }[] = [];
  for (let dx = 0; dx < fp.w; dx++) {
    candidates.push({ cell: { x: x + dx, z: z - 1 }, side: '-z' });
    candidates.push({ cell: { x: x + dx, z: z + fp.h }, side: '+z' });
  }
  for (let dz = 0; dz < fp.h; dz++) {
    candidates.push({ cell: { x: x - 1, z: z + dz }, side: '-x' });
    candidates.push({ cell: { x: x + fp.w, z: z + dz }, side: '+x' });
  }

  let best: { cells: GridPos[]; target: GridPos; score: number } | null = null;
  for (const { cell, side } of candidates) {
    if (cell.x < 0 || cell.z < 0 || cell.x >= roomSize.w || cell.z >= roomSize.h) continue;
    if (!isWalkable(blocked, cell)) continue;
    const cells = findPath(blocked, start, cell);
    if (!cells) continue;
    const score = pathLength(start, cells) + (side === front ? 0 : SIDE_PENALTY);
    if (!best || score < best.score) best = { cells, target: cell, score };
  }
  return best && { cells: best.cells, target: best.target };
}

function pathLength(start: GridPos, cells: GridPos[]) {
  let length = 0;
  let prev = start;
  for (const cell of cells) {
    length += Math.hypot(cell.x - prev.x, cell.z - prev.z);
    prev = cell;
  }
  return length;
}

/**
 * Попросить персонажа сделать что-то с предметом: он подходит, поворачивается к предмету и играет анимацию.
 * Если подойти нельзя — делаем сразу, чтобы кнопка не «молчала». А если вы сами (от первого лица)
 * стоите рядом с предметом — делаете сами.
 */
export function requestAction(objectId: string, action: ActionId) {
  const { world } = useWorldStore.getState();
  const object = world.objects.find((o) => o.id === objectId);
  const def = object && CATALOG[object.defId];
  if (!object || !def) return;

  // От первого лица вы стоите рядом с предметом — делаете сами, сразу.
  if (playerCanReach(object, world.room.size)) {
    ACTIONS[action].apply(objectId);
    return;
  }

  const blocked = buildOccupancy(world.room.size, world.objects);
  const plan = planApproach(object, world.room.size, blocked, world.character.pos);
  if (!plan) {
    ACTIONS[action].apply(objectId);
    useInteractionStore.getState().notify('Персонажу не подойти — сделано без него');
    return;
  }
  const face = footprintCenter(object.pos, rotatedFootprint(def.footprint, object.rotation), world.room.size);
  useCharacterStore.getState().walkForTask(plan.cells, plan.target, { objectId, action, face });
}

/** Анимация дела доиграла: применяем эффект, если предмет ещё на месте. */
export function completeTask() {
  const { task } = useCharacterStore.getState();
  if (!task) return;
  useCharacterStore.getState().cancelTask();
  if (useWorldStore.getState().world.objects.some((o) => o.id === task.objectId)) ACTIONS[task.action].apply(task.objectId);
}
