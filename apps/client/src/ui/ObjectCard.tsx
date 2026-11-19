import { useEffect } from 'react';
import type { ObjectDef, PlacedObject } from '@interna/shared';
import { CATALOG } from '../catalog/catalog';
import { ACTIONS, bookCapacity, requestAction } from '../interaction/actions';
import { useCharacterStore } from '../store/characterStore';
import { useInteractionStore } from '../store/interactionStore';
import { useWorldStore } from '../store/worldStore';
import { Notice } from './Notice';
import { pause, step, unlockAudio, useMusicStore } from '../audio/player';

/** Карточка выбранного предмета: что с ним сейчас и что с ним можно сделать. */
export function ObjectCard() {
  const selectedId = useInteractionStore((s) => s.selectedId);
  const panelOpen = useInteractionStore((s) => s.panel !== null);
  const notice = useInteractionStore((s) => s.notice);
  const object = useWorldStore((s) => s.world.objects.find((o) => o.id === selectedId) ?? null);
  const characterName = useWorldStore((s) => s.world.character.name);
  const task = useCharacterStore((s) => s.task);
  const playing = useMusicStore((s) => s.playing && s.speakerId === selectedId);
  const playingTrackId = useMusicStore((s) => (s.speakerId === selectedId ? s.trackId : null));
  const { select, openPanel } = useInteractionStore.getState();

  // Esc закрывает карточку (если открыта панель шкафа или колонки — сначала её).
  useEffect(() => {
    if (!selectedId || panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, panelOpen, select]);

  const def = object ? CATALOG[object.defId] : undefined;
  const busy = task && object && task.objectId === object.id ? task : null;
  const hasTracks = (object?.state.media?.playlist.length ?? 0) > 0;
  const nowPlaying = object?.state.media?.playlist.find((t) => t.id === playingTrackId);

  return (
    <>
      {object && def && (
        <div className="object-bar" role="toolbar" aria-label={`Предмет: ${def.name}`}>
          <span className="object-bar-name">
            {def.name}
            <span className="object-bar-status">
              {' · '}
              {busy
                ? `${characterName} ${busy.phase === 'walking' ? ACTIONS[busy.action].going : ACTIONS[busy.action].doing}…`
                : playing && nowPlaying
                  ? `играет «${nowPlaying.title}»`
                  : statusOf(object, def)}
            </span>
          </span>

          {has(def, 'light') && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => requestAction(object.id, object.state.light?.on ? 'lightOff' : 'lightOn')}
            >
              {object.state.light?.on ? 'Выключить' : 'Включить'}
            </button>
          )}
          {has(def, 'needs') && (
            <button type="button" disabled={!!busy} onClick={() => requestAction(object.id, 'water')}>
              Полить
            </button>
          )}
          {bookCapacity(def) !== null && (
            <button type="button" onClick={() => openPanel('shelf', object.id)}>
              Книги
            </button>
          )}
          {has(def, 'media') && hasTracks && !playing && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => {
                // Звук разрешают только в ответ на нажатие — «будим» плеер сейчас, а включит его персонаж.
                unlockAudio();
                requestAction(object.id, 'musicOn');
              }}
            >
              Включить
            </button>
          )}
          {has(def, 'media') && playing && (
            <>
              <button type="button" onClick={pause}>
                Пауза
              </button>
              <button type="button" onClick={() => void step(1)}>
                Дальше
              </button>
            </>
          )}
          {has(def, 'media') && (
            <button type="button" onClick={() => openPanel('music', object.id)}>
              Плейлист
            </button>
          )}
          <button type="button" onClick={() => select(null)} title="Esc" aria-label="Закрыть">
            ✕
          </button>
        </div>
      )}
      <Notice notice={notice} />
    </>
  );
}

function has(def: ObjectDef, type: ObjectDef['components'][number]['type']) {
  return def.components.some((c) => c.type === type);
}

/** Короткое состояние предмета для карточки. */
function statusOf(object: PlacedObject, def: ObjectDef): string {
  const parts: string[] = [];
  if (has(def, 'light')) parts.push(object.state.light?.on ? 'горит' : 'выключен');
  if (has(def, 'needs')) {
    const water = object.state.needs?.water ?? 1;
    parts.push(water >= 0.7 ? 'земля влажная' : water >= 0.35 ? 'пора полить' : 'земля сухая');
  }
  if (has(def, 'media')) {
    const count = object.state.media?.playlist.length ?? 0;
    parts.push(count === 0 ? 'нет музыки' : 'тихо');
  }
  const capacity = bookCapacity(def);
  if (capacity !== null) {
    const count = object.state.container?.length ?? 0;
    parts.push(count === 0 ? 'пусто' : `книг: ${count} из ${capacity}`);
  }
  return parts.join(', ');
}
