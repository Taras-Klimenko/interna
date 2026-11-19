import { create } from 'zustand';
import type { Track } from '@interna/shared';
import { useWorldStore } from '../store/worldStore';
import { useInteractionStore } from '../store/interactionStore';
import { deleteUnusedTrackFiles, loadTrackFile } from './trackFiles';

/**
 * Плеер комнаты: один <audio> на всё приложение, играет одна колонка за раз.
 * Плейлист и «текущий трек» хранятся в мире, а играет ли сейчас музыка — только здесь:
 * после перезагрузки страницы браузер всё равно не даст включить звук без нажатия.
 */
interface MusicStore {
  speakerId: string | null;
  trackId: string | null;
  playing: boolean;
  /** Секунды. */
  position: number;
  duration: number;
  volume: number;
}

const VOLUME_KEY = 'interna.volume';

function storedVolume() {
  const value = Number(typeof localStorage !== 'undefined' ? localStorage.getItem(VOLUME_KEY) : NaN);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.7;
}

export const useMusicStore = create<MusicStore>()(() => ({
  speakerId: null,
  trackId: null,
  playing: false,
  position: 0,
  duration: 0,
  volume: storedVolume(),
}));

const audio = new Audio();
audio.preload = 'auto';
audio.volume = useMusicStore.getState().volume;

let objectUrl: string | null = null;
/** Пока «разблокируем» звук тишиной, события плеера игнорируем. */
let unlocking = false;
let unlocked = false;

/** WAV без единого сэмпла: им «будим» <audio> на iOS прямо в обработчике нажатия. */
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

audio.addEventListener('play', () => !unlocking && useMusicStore.setState({ playing: true }));
audio.addEventListener('pause', () => !unlocking && useMusicStore.setState({ playing: false }));
audio.addEventListener('timeupdate', () => !unlocking && useMusicStore.setState({ position: audio.currentTime }));
audio.addEventListener('loadedmetadata', () => !unlocking && useMusicStore.setState({ duration: audio.duration || 0 }));
audio.addEventListener('ended', () => {
  if (!unlocking) void step(1);
});

/**
 * Браузеры (особенно Safari на iOS) разрешают звук, только если play() вызван в ответ на нажатие.
 * Персонаж включает музыку через несколько секунд после нажатия, поэтому «будим» плеер сразу по кнопке.
 */
export function unlockAudio() {
  if (unlocked || audio.src) return;
  unlocked = true;
  unlocking = true;
  audio.src = SILENCE;
  audio
    .play()
    .catch(() => undefined)
    .finally(() => {
      // Пока тишина играла, мог успеть загрузиться настоящий трек — его не трогаем.
      if (audio.src.startsWith('data:')) {
        audio.pause();
        audio.removeAttribute('src');
      }
      unlocking = false;
    });
}

function playlistOf(speakerId: string | null): Track[] {
  if (!speakerId) return [];
  return useWorldStore.getState().world.objects.find((o) => o.id === speakerId)?.state.media?.playlist ?? [];
}

async function startPlayback() {
  try {
    await audio.play();
  } catch (error) {
    // AbortError — play() прервал следующий трек, это нормально.
    if (error instanceof DOMException && error.name === 'AbortError') return;
    useMusicStore.setState({ playing: false });
    useInteractionStore.getState().notify('Браузер не дал включить звук — нажмите ещё раз');
  }
}

/** Включить конкретный трек колонки. */
export async function playTrack(speakerId: string, trackId: string) {
  const blob = await loadTrackFile(trackId).catch(() => undefined);
  if (!blob) {
    useInteractionStore.getState().notify('Файл трека не найден в этом браузере');
    return;
  }
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(blob);
  audio.src = objectUrl;
  useMusicStore.setState({ speakerId, trackId, position: 0, duration: 0 });
  useWorldStore.getState().setCurrentTrack(speakerId, trackId);
  await startPlayback();
}

/** Продолжить с того же места или начать с текущего (или первого) трека. */
export async function resume(speakerId: string) {
  const state = useMusicStore.getState();
  if (state.speakerId === speakerId && state.trackId && audio.src) return startPlayback();
  const playlist = playlistOf(speakerId);
  const current = useWorldStore.getState().world.objects.find((o) => o.id === speakerId)?.state.media?.current;
  const trackId = playlist.find((t) => t.id === current)?.id ?? playlist[0]?.id;
  if (trackId) await playTrack(speakerId, trackId);
}

export function pause() {
  audio.pause();
}

/** Следующий (1) или предыдущий (-1) трек; плейлист закольцован. */
export async function step(dir: 1 | -1) {
  const { speakerId, trackId } = useMusicStore.getState();
  const playlist = playlistOf(speakerId);
  if (!speakerId || playlist.length === 0) return stop();
  const index = playlist.findIndex((t) => t.id === trackId);
  const next = playlist[(index + dir + playlist.length) % playlist.length]!;
  await playTrack(speakerId, next.id);
}

export function seek(seconds: number) {
  if (Number.isFinite(seconds)) audio.currentTime = seconds;
}

export function setVolume(volume: number) {
  audio.volume = volume;
  useMusicStore.setState({ volume });
  localStorage.setItem(VOLUME_KEY, String(volume));
}

export function stop() {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  useMusicStore.setState({ speakerId: null, trackId: null, playing: false, position: 0, duration: 0 });
}

/**
 * Следит за миром: если колонку убрали или из плейлиста удалили играющий трек — останавливаемся.
 * При запуске удаляет из хранилища файлы, на которые больше не ссылается ни один плейлист.
 */
export function syncPlayerWithWorld() {
  const usedIds = new Set(
    useWorldStore.getState().world.objects.flatMap((o) => o.state.media?.playlist.map((t) => t.id) ?? []),
  );
  void deleteUnusedTrackFiles(usedIds).catch(() => undefined);

  return useWorldStore.subscribe((state) => {
    const { speakerId, trackId } = useMusicStore.getState();
    if (!speakerId) return;
    const speaker = state.world.objects.find((o) => o.id === speakerId);
    if (!speaker?.state.media?.playlist.some((t) => t.id === trackId)) stop();
  });
}
