import { CATALOG } from '../catalog/catalog';
import { enqueueCharacterAction, type PlannedAction } from '../interaction/actions';
import { useWorldStore } from '../store/worldStore';

/** Действие, которое персонаж выбрал в разговоре (то же, что RoomAction в apps/server/src/chat/tools.ts). */
export type RoomAction =
  | { type: 'light'; objectId: string; on: boolean }
  | { type: 'water'; objectId: string }
  | { type: 'music'; objectId: string; track?: string }
  | { type: 'stopMusic'; objectId: string }
  | { type: 'goTo'; objectId: string }
  | { type: 'takeBook'; objectId: string; title: string }
  // Записи в память персонажа: сохраняет сервер, здесь — только подпись в чате.
  | { type: 'remember'; text: string }
  | { type: 'diary'; text: string };

function toPlanned(action: RoomAction): PlannedAction | null {
  switch (action.type) {
    case 'light':
      return { objectId: action.objectId, action: action.on ? 'lightOn' : 'lightOff' };
    case 'water':
      return { objectId: action.objectId, action: 'water' };
    case 'music':
      return { objectId: action.objectId, action: 'musicOn', arg: action.track };
    case 'stopMusic':
      return { objectId: action.objectId, action: 'musicOff' };
    case 'goTo':
      return { objectId: action.objectId, action: 'visit' };
    case 'takeBook':
      return { objectId: action.objectId, action: 'takeBook', arg: action.title };
    case 'remember':
    case 'diary':
      return null;
    default:
      return null;
  }
}

/**
 * То, что случилось, пока хозяина не было: применяем к миру сразу, без прогулки персонажа.
 */
export function applyRoomActionNow(action: RoomAction) {
  const world = useWorldStore.getState();
  if (!('objectId' in action) || !world.world.objects.some((o) => o.id === action.objectId)) return;
  if (action.type === 'water') world.water(action.objectId);
  if (action.type === 'light') world.setLight(action.objectId, action.on);
}

/** Персонаж делает то, что решил в разговоре: идёт к предмету (или встаёт в очередь, если занят). */
export function performRoomAction(action: RoomAction) {
  const planned = toPlanned(action);
  // Предмет могли убрать, пока модель думала: такое действие просто пропускаем.
  if (!planned || !useWorldStore.getState().world.objects.some((o) => o.id === planned.objectId)) return;
  enqueueCharacterAction(planned);
}

/** Подпись действия в чате: «включает свет — Торшер». */
export function actionLabel(action: RoomAction): string {
  if (action.type === 'remember') return `запоминает: «${action.text}»`;
  if (action.type === 'diary') return 'пишет в дневник';
  const object = useWorldStore.getState().world.objects.find((o) => o.id === action.objectId);
  const name = (object && CATALOG[object.defId]?.name) ?? 'предмет';
  switch (action.type) {
    case 'light':
      return `${action.on ? 'включает' : 'выключает'} свет — ${name}`;
    case 'water':
      return `поливает — ${name}`;
    case 'music':
      return action.track ? `включает «${action.track}»` : 'включает музыку';
    case 'stopMusic':
      return 'выключает музыку';
    case 'goTo':
      return `идёт — ${name}`;
    case 'takeBook':
      return `берёт с полки «${action.title}»`;
    default:
      return 'что-то делает';
  }
}

export const ACTION_ICONS: Record<RoomAction['type'], string> = {
  light: '💡',
  water: '🪴',
  music: '🎵',
  stopMusic: '🔇',
  goTo: '👣',
  takeBook: '📖',
  remember: '🧠',
  diary: '📔',
};
