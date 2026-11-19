import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { CharacterAppearance, GridPos, PlacedObject, Rotation, World } from '@interna/shared';
import { buildOccupancy, nearestWalkable } from '../character/pathfinding';

/** Стартовая расстановка: её же возвращает кнопка «Сбросить комнату». */
const initialObjects: PlacedObject[] = [
  // Вдоль задней стены (z = 0): кровать изголовьем к стене, тумбочка, растение, шкаф, колонка, комод.
  { id: 'o1', defId: 'bed', pos: { x: 0, z: 0 }, rotation: 0, state: {} },
  { id: 'o2', defId: 'nightstand', pos: { x: 2, z: 0 }, rotation: 0, state: {} },
  { id: 'o3', defId: 'plant', pos: { x: 3, z: 0 }, rotation: 0, state: { needs: { water: 0.6 } } },
  { id: 'o4', defId: 'bookshelf', pos: { x: 4, z: 0 }, rotation: 0, state: {} },
  { id: 'o5', defId: 'speaker', pos: { x: 6, z: 0 }, rotation: 0, state: {} },
  { id: 'o6', defId: 'dresser', pos: { x: 7, z: 0 }, rotation: 0, state: {} },
  // Гостиная зона: диван у левой стены лицом в комнату, ковёр, кресло напротив, торшер и куст в углу.
  { id: 'o7', defId: 'sofa', pos: { x: 0, z: 5 }, rotation: 270, state: {} },
  { id: 'o8', defId: 'rugRound', pos: { x: 3, z: 5 }, rotation: 0, state: {} },
  { id: 'o9', defId: 'armchair', pos: { x: 7, z: 6 }, rotation: 90, state: {} },
  { id: 'o10', defId: 'floorLamp', pos: { x: 9, z: 5 }, rotation: 0, state: { light: { on: true } } },
  { id: 'o11', defId: 'plantBush', pos: { x: 9, z: 9 }, rotation: 0, state: {} },
];

/** Стартовый мир, пока нет онбординга. */
const initialWorld: World = {
  id: 'local',
  room: { size: { w: 10, h: 10 }, floor: 'oak', wall: 'cream' },
  objects: initialObjects,
  character: {
    id: 'c1',
    name: 'Тест',
    appearance: { body: 'female', hair: 'Hair_Long', beard: false, hairColor: '#ffffff' },
    pos: { x: 5, z: 3 },
  },
};

function newObjectId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `o-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface WorldStore {
  world: World;
  /** Растёт, когда персонажа нужно мгновенно переставить (например, после сброса комнаты). */
  teleportSeq: number;
  setAppearance: (patch: Partial<CharacterAppearance>) => void;
  setCharacterPos: (pos: GridPos) => void;
  /** Ставит новый предмет и возвращает его id. Проверка «помещается ли» — на стороне вызывающего. */
  addObject: (defId: string, pos: GridPos, rotation: Rotation) => string;
  moveObject: (id: string, pos: GridPos, rotation: Rotation) => void;
  removeObject: (id: string) => void;
  resetRoom: () => void;
}

/** Ключ в localStorage. Номер версии меняем, когда формат World ломается несовместимо. */
const STORAGE_KEY = 'interna.world';
const STORAGE_VERSION = 1;

export const useWorldStore = create<WorldStore>()(
  persist(
    immer((set) => ({
      world: initialWorld,
      teleportSeq: 0,
      setAppearance: (patch) =>
        set((s) => {
          Object.assign(s.world.character.appearance, patch);
        }),
      setCharacterPos: (pos) =>
        set((s) => {
          s.world.character.pos = pos;
        }),
      addObject: (defId, pos, rotation) => {
        const id = newObjectId();
        set((s) => {
          s.world.objects.push({ id, defId, pos, rotation, state: {} });
        });
        return id;
      },
      moveObject: (id, pos, rotation) =>
        set((s) => {
          const object = s.world.objects.find((o) => o.id === id);
          if (!object) return;
          object.pos = pos;
          object.rotation = rotation;
        }),
      removeObject: (id) =>
        set((s) => {
          s.world.objects = s.world.objects.filter((o) => o.id !== id);
        }),
      resetRoom: () =>
        set((s) => {
          s.world.objects = structuredClone(initialObjects);
          // Если старая клетка персонажа теперь занята — ставим его на ближайшую свободную.
          const blocked = buildOccupancy(s.world.room.size, s.world.objects);
          const free = nearestWalkable(blocked, s.world.character.pos);
          if (free) s.world.character.pos = free;
          s.teleportSeq += 1;
        }),
    })),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Сохраняем только сам мир, служебные счётчики — нет.
      partialize: (s) => ({ world: s.world }),
    },
  ),
);
