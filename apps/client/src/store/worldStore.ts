import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Book, CharacterAppearance, ReadingProgress, GridPos, Photo, PlacedObject, Rotation, Track, World } from '@interna/shared';
import { DEFAULT_PERSONALITY, PERSONALITY_MAX } from '../character/personalities';
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
  // Пустая рамка над тумбочкой: ждёт ваше фото.
  { id: 'o12', defId: 'photoFrame', pos: { x: 2, z: 0 }, rotation: 0, state: {} },
  // Окно над комодом.
  { id: 'o13', defId: 'window', pos: { x: 7, z: 0 }, rotation: 0, state: {} },
];

/** Имя персонажа по умолчанию; его можно поменять в панели персонажа. */
export const DEFAULT_CHARACTER_NAME = 'Ева';
/** Так персонажа звали по умолчанию в прошлых версиях прототипа. */
const OLD_DEFAULT_NAMES = ['Тест', 'Саша'];

/**
 * Мир из старой версии (из браузера или с сервера) — к нынешнему виду. Срабатывает один раз:
 * у старого мира нет характера, а после обновления он есть, и имя больше не трогаем.
 */
function upgradeWorld(world: World): World {
  const character = world.character as World['character'] & { personality?: string };
  if (typeof character.personality !== 'string') {
    character.personality = DEFAULT_PERSONALITY;
    if (OLD_DEFAULT_NAMES.includes(character.name)) character.name = DEFAULT_CHARACTER_NAME;
  }
  return world;
}

/** Стартовый мир, пока нет онбординга. */
const initialWorld: World = {
  id: 'local',
  room: { size: { w: 10, h: 10 }, floor: 'oak', wall: 'cream' },
  objects: initialObjects,
  character: {
    id: 'c1',
    name: DEFAULT_CHARACTER_NAME,
    personality: DEFAULT_PERSONALITY,
    appearance: { body: 'female', hair: 'Hair_Long', beard: false, hairColor: '#ffffff' },
    pos: { x: 5, z: 3 },
  },
};

export function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `o-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface WorldStore {
  world: World;
  /** Растёт, когда персонажа нужно мгновенно переставить (например, после сброса комнаты). */
  teleportSeq: number;
  setAppearance: (patch: Partial<CharacterAppearance>) => void;
  setCharacterName: (name: string) => void;
  setPersonality: (text: string) => void;
  setCharacterPos: (pos: GridPos) => void;
  /** Ставит новый предмет и возвращает его id. Проверка «помещается ли» — на стороне вызывающего. */
  addObject: (defId: string, pos: GridPos, rotation: Rotation) => string;
  moveObject: (id: string, pos: GridPos, rotation: Rotation) => void;
  removeObject: (id: string) => void;
  resetRoom: () => void;
  /** Заменить мир целиком: пришёл с сервера (вход с другого устройства, правки с телефона). */
  replaceWorld: (world: World) => void;
  /** Пол и обои: id варианта из scene/roomStyles. */
  setRoomStyle: (patch: { floor?: string; wall?: string }) => void;
  setLight: (id: string, on: boolean) => void;
  water: (id: string) => void;
  /** Книга из файла приходит со своим id: под ним файл уже лежит в хранилище. */
  addBook: (objectId: string, book: Pick<Book, 'title' | 'author' | 'note'> & Partial<Pick<Book, 'id' | 'file' | 'color'>>) => void;
  removeBook: (objectId: string, bookId: string) => void;
  setBookProgress: (objectId: string, bookId: string, progress: ReadingProgress) => void;
  addTracks: (objectId: string, tracks: Track[]) => void;
  removeTrack: (objectId: string, trackId: string) => void;
  setCurrentTrack: (objectId: string, trackId: string) => void;
  /** Повесить фото в рамку (undefined — снять). Файл сохраняет и удаляет вызывающий. */
  setPhoto: (objectId: string, photo: Photo | undefined) => void;
  setPhotoCaption: (objectId: string, caption: string) => void;
}

/** Ключ в localStorage. Номер версии меняем, когда формат World ломается несовместимо. */
const STORAGE_KEY = 'interna.world';
/** 2 — персонажа «Тест» зовут по-новому; 3 — у персонажа есть характер, по умолчанию его зовут Ева. */
const STORAGE_VERSION = 3;

export const useWorldStore = create<WorldStore>()(
  persist(
    immer((set) => ({
      world: initialWorld,
      teleportSeq: 0,
      setAppearance: (patch) =>
        set((s) => {
          Object.assign(s.world.character.appearance, patch);
        }),
      setCharacterName: (name) =>
        set((s) => {
          s.world.character.name = name.slice(0, 40);
        }),
      setPersonality: (text) =>
        set((s) => {
          s.world.character.personality = text.slice(0, PERSONALITY_MAX);
        }),
      setCharacterPos: (pos) =>
        set((s) => {
          s.world.character.pos = pos;
        }),
      addObject: (defId, pos, rotation) => {
        const id = newId();
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
      setRoomStyle: (patch) =>
        set((s) => {
          Object.assign(s.world.room, patch);
        }),
      replaceWorld: (world) =>
        set((s) => {
          s.world = upgradeWorld(world);
          s.teleportSeq += 1;
        }),
      setLight: (id, on) =>
        set((s) => {
          const object = s.world.objects.find((o) => o.id === id);
          if (object) object.state.light = { on };
        }),
      water: (id) =>
        set((s) => {
          const object = s.world.objects.find((o) => o.id === id);
          if (object) object.state.needs = { water: 1 };
        }),
      addBook: (objectId, book) =>
        set((s) => {
          const object = s.world.objects.find((o) => o.id === objectId);
          if (!object) return;
          (object.state.container ??= []).push({ id: newId(), kind: 'book', ...book, addedAt: new Date().toISOString() });
        }),
      setBookProgress: (objectId, bookId, progress) =>
        set((s) => {
          const book = s.world.objects.find((o) => o.id === objectId)?.state.container?.find((b) => b.id === bookId);
          if (book) book.progress = progress;
        }),
      removeBook: (objectId, bookId) =>
        set((s) => {
          const object = s.world.objects.find((o) => o.id === objectId);
          if (object?.state.container) object.state.container = object.state.container.filter((b) => b.id !== bookId);
        }),
      addTracks: (objectId, tracks) =>
        set((s) => {
          const object = s.world.objects.find((o) => o.id === objectId);
          if (!object) return;
          (object.state.media ??= { playlist: [] }).playlist.push(...tracks);
        }),
      removeTrack: (objectId, trackId) =>
        set((s) => {
          const media = s.world.objects.find((o) => o.id === objectId)?.state.media;
          if (!media) return;
          media.playlist = media.playlist.filter((t) => t.id !== trackId);
          if (media.current === trackId) delete media.current;
        }),
      setCurrentTrack: (objectId, trackId) =>
        set((s) => {
          const media = s.world.objects.find((o) => o.id === objectId)?.state.media;
          if (media) media.current = trackId;
        }),
      setPhoto: (objectId, photo) =>
        set((s) => {
          const object = s.world.objects.find((o) => o.id === objectId);
          if (object) object.state.display = photo ? { photo } : {};
        }),
      setPhotoCaption: (objectId, caption) =>
        set((s) => {
          const photo = s.world.objects.find((o) => o.id === objectId)?.state.display?.photo;
          if (photo) photo.caption = caption;
        }),
    })),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Сохраняем только сам мир, служебные счётчики — нет.
      partialize: (s) => ({ world: s.world }),
      migrate: (persisted) => {
        const state = persisted as { world?: World } | undefined;
        if (state?.world) upgradeWorld(state.world);
        return state as WorldStore;
      },
    },
  ),
);
