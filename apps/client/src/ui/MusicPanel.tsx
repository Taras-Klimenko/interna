import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Track } from '@interna/shared';
import { CATALOG } from '../catalog/catalog';
import { pause, playTrack, resume, seek, setVolume, step, stop, useMusicStore } from '../audio/player';
import { requestPersistentStorage, trackFiles } from '../storage/files';
import { useInteractionStore } from '../store/interactionStore';
import { newId, useWorldStore } from '../store/worldStore';

/** Сколько треков можно положить в одну колонку. */
const MAX_TRACKS = 100;

const titleFromFile = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || name;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function tracksLabel(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} трек`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} трека`;
  return `${n} треков`;
}

/** Открытая колонка: плеер и плейлист из ваших аудиофайлов. */
export function MusicPanel() {
  const speakerId = useInteractionStore((s) => (s.panel?.kind === 'music' ? s.panel.id : null));
  const closePanel = useInteractionStore((s) => s.closePanel);
  const speaker = useWorldStore((s) => s.world.objects.find((o) => o.id === speakerId) ?? null);
  const music = useMusicStore();
  const [adding, setAdding] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!speakerId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [speakerId, closePanel]);

  const def = speaker ? CATALOG[speaker.defId] : undefined;
  if (!speaker || !def) return null;

  const playlist = speaker.state.media?.playlist ?? [];
  const ours = music.speakerId === speaker.id;
  const current = ours ? playlist.find((t) => t.id === music.trackId) : undefined;
  const playing = ours && music.playing;

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])].filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i.test(f.name));
    e.target.value = '';
    if (files.length === 0) return;
    const room = MAX_TRACKS - playlist.length;
    if (room <= 0) return useInteractionStore.getState().notify(`В колонке уже ${MAX_TRACKS} треков`);

    setAdding(true);
    requestPersistentStorage();
    const added: Track[] = [];
    try {
      for (const file of files.slice(0, room)) {
        const track: Track = {
          id: newId(),
          kind: 'track',
          title: titleFromFile(file.name),
          fileName: file.name,
          size: file.size,
          addedAt: new Date().toISOString(),
        };
        await trackFiles.save(track.id, file);
        added.push(track);
      }
    } catch (error) {
      const full = error instanceof DOMException && error.name === 'QuotaExceededError';
      useInteractionStore.getState().notify(full ? 'Не хватает места в хранилище браузера' : 'Не удалось сохранить файл');
    } finally {
      if (added.length > 0) useWorldStore.getState().addTracks(speaker.id, added);
      setAdding(false);
    }
  };

  const onRemove = (track: Track) => {
    if (!window.confirm(`Убрать «${track.title}» из плейлиста? Файл удалится из браузера.`)) return;
    if (ours && music.trackId === track.id) stop();
    useWorldStore.getState().removeTrack(speaker.id, track.id);
    void trackFiles.remove(track.id).catch(() => undefined);
  };

  const togglePlay = () => {
    if (playing) pause();
    else void resume(speaker.id);
  };

  return (
    <aside className="sheet" aria-label={def.name}>
      <header className="sheet-header">
        <div>
          <h2 className="sheet-title">{def.name}</h2>
          <p className="sheet-subtitle">{playlist.length === 0 ? 'плейлист пуст' : tracksLabel(playlist.length)}</p>
        </div>
        <button type="button" className="sheet-close" onClick={closePanel} title="Esc" aria-label="Закрыть">
          ✕
        </button>
      </header>

      <div className="sheet-body">
        {playlist.length > 0 && (
          <section className="player">
            <div className="player-title">{current?.title ?? 'Ничего не играет'}</div>
            <input
              type="range"
              className="player-seek"
              min={0}
              max={music.duration || 0}
              step={1}
              value={ours ? Math.min(music.position, music.duration || 0) : 0}
              onChange={(e) => seek(Number(e.target.value))}
              disabled={!current || !music.duration}
              aria-label="Позиция в треке"
            />
            <div className="player-row">
              <span className="player-time">
                {formatTime(ours ? music.position : 0)} / {formatTime(ours ? music.duration : 0)}
              </span>
              <div className="player-buttons">
                <button type="button" onClick={() => void step(-1)} disabled={!current} aria-label="Предыдущий трек" title="Предыдущий">
                  ⏮
                </button>
                <button type="button" className="player-main" onClick={togglePlay} aria-label={playing ? 'Пауза' : 'Играть'}>
                  {playing ? '⏸' : '▶'}
                </button>
                <button type="button" onClick={() => void step(1)} disabled={!current} aria-label="Следующий трек" title="Следующий">
                  ⏭
                </button>
              </div>
            </div>
            <label className="player-volume">
              <span>Громкость</span>
              <input type="range" min={0} max={1} step={0.05} value={music.volume} onChange={(e) => setVolume(Number(e.target.value))} />
            </label>
          </section>
        )}

        {playlist.length === 0 ? (
          <p className="sheet-empty">Добавьте свои аудиофайлы — колонка будет играть их по кругу.</p>
        ) : (
          <ul className="track-list">
            {playlist.map((track) => (
              <li key={track.id} className="track" data-current={current?.id === track.id}>
                <button type="button" className="track-play" onClick={() => void playTrack(speaker.id, track.id)} title={track.fileName}>
                  <span className="track-mark" aria-hidden="true">
                    {current?.id === track.id ? (playing ? '♪' : '❚❚') : '▶'}
                  </span>
                  <span className="track-title">{track.title}</span>
                </button>
                <button type="button" className="book-remove" onClick={() => onRemove(track)} aria-label={`Убрать «${track.title}»`} title="Убрать">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <input ref={fileInput} type="file" accept="audio/*" multiple hidden onChange={(e) => void onFiles(e)} />
        <button type="button" className="book-submit" onClick={() => fileInput.current?.click()} disabled={adding}>
          {adding ? 'Добавляю…' : 'Добавить музыку'}
        </button>
        <p className="panel-note">Файлы хранятся только в этом браузере и никуда не загружаются.</p>
      </div>
    </aside>
  );
}
