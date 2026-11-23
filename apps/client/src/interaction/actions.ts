import type { GridPos, GridSize, ObjectDef, PlacedObject } from '@interna/shared';
import { CATALOG } from '../catalog/catalog';
import { buildOccupancy, findPath, isWalkable } from '../character/pathfinding';
import { footprintCenter, rotatedFootprint } from '../scene/grid';
import { useWorldStore } from '../store/worldStore';
import { useCharacterStore } from '../store/characterStore';
import { useInteractionStore } from '../store/interactionStore';
import { pause, playTrack, resume, useMusicStore } from '../audio/player';
import { playerCanReach } from '../scene/player';

/**
 * Что персонаж умеет делать с предметами. Их же (через сервер) выбирает модель в разговоре:
 * см. apps/server/src/chat/tools.ts.
 */
export type ActionId = 'lightOn' | 'lightOff' | 'water' | 'musicOn' | 'musicOff' | 'visit' | 'takeBook';

interface ActionDef {
  /** Анимация у предмета. Эффект применяется, когда она доиграет; null — без анимации, сразу. */
  clip: string | null;
  /** Что делает персонаж — для подписи в карточке предмета: пока идёт и когда уже на месте. */
  going: string;
  doing: string;
  /** arg — уточнение дела: название трека, название книги. */
  apply: (objectId: string, arg?: string) => void;
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
    apply: (id, title) => {
      const track = title && playlistOf(id).find((item) => item.title === title);
      void (track ? playTrack(id, track.id) : resume(id));
    },
  },
  musicOff: {
    clip: 'Interact',
    going: 'идёт выключить музыку',
    doing: 'выключает музыку',
    apply: (id) => {
      if (useMusicStore.getState().speakerId === id) pause();
    },
  },
  visit: {
    clip: null,
    going: 'идёт сюда',
    doing: 'рядом',
    apply: () => undefined,
  },
  takeBook: {
    clip: 'PickUp_Table',
    going: 'идёт за книгой',
    doing: 'берёт книгу',
    apply: (_, title) => {
      if (!title) return;
      const name = useWorldStore.getState().world.character.name;
      useInteractionStore.getState().notify(`${name} берёт с полки «${title}»`);
    },
  },
};

function playlistOf(objectId: string) {
  return useWorldStore.getState().world.objects.find((o) => o.id === objectId)?.state.media?.playlist ?? [];
}

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

export interface PlannedAction {
  objectId: string;
  action: ActionId;
  arg?: string;
}

/** Дела, которые персонаж выполнит следом за текущим (несколько просьб в одном ответе в разговоре). */
const queue: PlannedAction[] = [];
/** Дело завершилось своим чередом, а не было отменено. */
let completing = false;

/**
 * Попросить персонажа сделать что-то с предметом: он подходит, поворачивается к предмету и играет анимацию.
 * Если подойти нельзя — делаем сразу, чтобы кнопка не «молчала». А если вы сами (от первого лица)
 * стоите рядом с предметом — делаете сами. Новая просьба отменяет очередь дел из разговора.
 */
export function requestAction(objectId: string, action: ActionId) {
  queue.length = 0;
  startAction({ objectId, action }, false);
}

/**
 * Дело, которое персонаж выбрал сам в разговоре: делает он, даже если вы стоите рядом, а если уже занят —
 * встаёт в очередь.
 */
export function enqueueCharacterAction(planned: PlannedAction) {
  const { task, target } = useCharacterStore.getState();
  if (task || target) queue.push(planned);
  else startAction(planned, true);
}

function startAction({ objectId, action, arg }: PlannedAction, byCharacter: boolean) {
  const { world } = useWorldStore.getState();
  const object = world.objects.find((o) => o.id === objectId);
  const def = object && CATALOG[object.defId];
  if (!object || !def) return runNext();

  // От первого лица вы стоите рядом с предметом — делаете сами, сразу.
  if (!byCharacter && playerCanReach(object, world.room.size)) {
    ACTIONS[action].apply(objectId, arg);
    return;
  }

  const blocked = buildOccupancy(world.room.size, world.objects);
  const plan = planApproach(object, world.room.size, blocked, world.character.pos);
  if (!plan) {
    ACTIONS[action].apply(objectId, arg);
    if (action !== 'visit') useInteractionStore.getState().notify('Персонажу не подойти — сделано без него');
    return runNext();
  }
  const face = footprintCenter(object.pos, rotatedFootprint(def.footprint, object.rotation), world.room.size);
  useCharacterStore.getState().walkForTask(plan.cells, plan.target, { objectId, action, face, arg });
}

function runNext() {
  const next = queue.shift();
  if (next) startAction(next, true);
}

/** Анимация дела доиграла (или дело без анимации — персонаж дошёл): применяем эффект, если предмет ещё на месте. */
export function completeTask() {
  const { task } = useCharacterStore.getState();
  if (!task) return;
  completing = true;
  useCharacterStore.getState().cancelTask();
  completing = false;
  if (useWorldStore.getState().world.objects.some((o) => o.id === task.objectId)) ACTIONS[task.action].apply(task.objectId, task.arg);
  runNext();
}

// Дело отменили (клик по полу, режим расстановки) — очередь из разговора тоже отменяется.
useCharacterStore.subscribe((state, previous) => {
  if (previous.task && !state.task && !completing) queue.length = 0;
});
