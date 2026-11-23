import type { ObjectDef, PlacedObject } from '@interna/shared';
import type { ChatContext } from '../api/chat';
import { CATALOG } from '../catalog/catalog';
import { DEFAULT_CHARACTER_NAME, useWorldStore } from '../store/worldStore';
import { useUiStore } from '../store/uiStore';
import { useMusicStore } from '../audio/player';
import { hourFor } from '../scene/timeOfDay';

const has = (def: ObjectDef, type: ObjectDef['components'][number]['type']) => def.components.some((c) => c.type === type);

/** Состояние предмета словами — только то, что может пригодиться в разговоре. */
function stateOf(object: PlacedObject, def: ObjectDef, nowPlaying: string | undefined): string | undefined {
  const parts: string[] = [];
  if (has(def, 'light')) parts.push(object.state.light?.on ? 'горит' : 'выключен');
  if (has(def, 'needs')) {
    const water = object.state.needs?.water ?? 1;
    parts.push(water >= 0.7 ? 'земля влажная' : water >= 0.35 ? 'пора полить' : 'земля сухая');
  }
  if (has(def, 'media')) parts.push(nowPlaying && useMusicStore.getState().speakerId === object.id ? 'играет музыка' : 'тихо');
  if (has(def, 'display')) parts.push(object.state.display?.photo ? 'с фото' : 'пустая');
  if (has(def, 'container')) parts.push(`книг: ${object.state.container?.length ?? 0}`);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/** Снимок комнаты для персонажа: что стоит, что на полках, что играет, который час. */
export function buildChatContext(): ChatContext {
  const { world } = useWorldStore.getState();
  const music = useMusicStore.getState();
  const tracks = world.objects.flatMap((object) => object.state.media?.playlist ?? []);
  const nowPlaying = music.playing ? tracks.find((track) => track.id === music.trackId)?.title : undefined;

  const objects = world.objects.flatMap((object) => {
    const def = CATALOG[object.defId];
    if (!def) return [];
    // Что с предметом можно сделать: по этому сервер даёт модели инструменты.
    const can: ('light' | 'water' | 'music' | 'books')[] = [];
    if (has(def, 'light')) can.push('light');
    if (has(def, 'needs')) can.push('water');
    if (has(def, 'media')) can.push('music');
    if (has(def, 'container')) can.push('books');
    return [
      {
        id: object.id,
        name: def.name,
        state: stateOf(object, def, nowPlaying),
        can,
        on: has(def, 'light') ? (object.state.light?.on ?? false) : undefined,
        tracks: (object.state.media?.playlist ?? []).map((track) => track.title),
      },
    ];
  });
  const books = world.objects.flatMap((object) =>
    (object.state.container ?? []).map((book) => ({
      title: book.title,
      author: book.author,
      shelfId: object.id,
      note: book.note,
      percent: book.progress ? Math.round(book.progress.percent * 100) : undefined,
    })),
  );

  return {
    characterName: world.character.name.trim() || DEFAULT_CHARACTER_NAME,
    personality: world.character.personality,
    gender: world.character.appearance.body,
    hour: Math.floor(hourFor(useUiStore.getState().timeMode)) % 24,
    ownerInside: useUiStore.getState().firstPerson,
    objects,
    books,
    playlist: [...new Set(tracks.map((track) => track.title))],
    nowPlaying,
    photos: world.objects.flatMap((object) => {
      const photo = object.state.display?.photo;
      return photo ? [photo.caption] : [];
    }),
  };
}
