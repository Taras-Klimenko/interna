import { create } from 'zustand';
import type { World } from '@interna/shared';
import { useWorldStore } from '../store/worldStore';
import { useAccountStore } from '../store/accountStore';
import { useInteractionStore } from '../store/interactionStore';
import { ApiError, OfflineError, api } from './http';

/**
 * Синхронизация мира с сервером. Мир по-прежнему живёт в браузере (localStorage), а сервер хранит копию:
 * после изменений она отправляется туда с небольшой задержкой. У каждой копии на сервере есть номер версии —
 * по нему видно, что мир успели поменять на другом устройстве.
 */

/** Ждём столько после последнего изменения, прежде чем отправить мир (персонаж ходит — мир меняется каждый шаг). */
const SAVE_DELAY_MS = 1500;
/** Без связи пробуем снова через столько. */
const RETRY_MS = 15_000;

export type SyncState = 'idle' | 'saving' | 'saved' | 'offline';

export const useSyncStore = create<{ state: SyncState }>()(() => ({ state: 'idle' }));

/** Что известно о серверной копии мира на этом устройстве. Хранится рядом с миром в localStorage. */
interface SyncMeta {
  userId: string;
  /** Версия на сервере, от которой мы меняли мир; null — копии на сервере ещё нет. */
  version: number | null;
  /** Есть изменения, которые ещё не ушли на сервер. */
  dirty: boolean;
}

const META_KEY = 'interna.sync';

function loadMeta(): SyncMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as SyncMeta) : null;
  } catch {
    return null;
  }
}

function saveMeta(meta: SyncMeta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // Не страшно: при следующем запуске сверимся с сервером заново.
  }
}

interface RemoteWorld {
  world: World;
  version: number;
}

let meta: SyncMeta | null = null;
let token: string | null = null;
let timer: number | undefined;
let inFlight = false;
/** Мир заменяем серверной копией — это не «изменение пользователя», отправлять его обратно не нужно. */
let applyingRemote = false;

const notify = (text: string) => useInteractionStore.getState().notify(text);
const setState = (state: SyncState) => useSyncStore.setState({ state });

/**
 * Запускается после входа (и при старте, если вход запомнен). Сверяет мир с сервером и дальше
 * отправляет изменения. Возвращает функцию остановки (при выходе из аккаунта).
 */
export function startWorldSync(userId: string, sessionToken: string) {
  token = sessionToken;
  const saved = loadMeta();
  const firstOnDevice = saved?.userId !== userId;
  meta = firstOnDevice ? { userId, version: null, dirty: true } : saved;

  void reconcile(firstOnDevice);

  const unsubscribe = useWorldStore.subscribe((state, previous) => {
    if (state.world === previous.world || applyingRemote || !meta) return;
    meta.dirty = true;
    saveMeta(meta);
    schedule(SAVE_DELAY_MS);
  });
  const onOnline = () => schedule(0);
  // Вкладку закрывают или прячут (телефон заблокировали) — отправляем сразу, не дожидаясь задержки.
  const onHide = () => {
    if (document.visibilityState === 'hidden' && meta?.dirty) void push(true);
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onHide);

  return () => {
    unsubscribe();
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onHide);
    window.clearTimeout(timer);
    token = null;
    meta = null;
    setState('idle');
  };
}

/** Первая сверка: чья копия свежее — эта или серверная. */
async function reconcile(firstOnDevice: boolean) {
  if (!meta) return;
  let remote: RemoteWorld | null;
  try {
    remote = await api<RemoteWorld>('/world', { token });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) remote = null;
    else return handleError(error);
  }
  if (!meta) return;

  if (!remote) {
    // На сервере мира ещё нет: эта комната становится вашей комнатой на сервере.
    meta.version = null;
    meta.dirty = true;
    await push();
    return;
  }

  if (firstOnDevice) {
    // На этом устройстве входим впервые, а комната на сервере уже есть (обставили на другом устройстве).
    const keepServer = window.confirm(
      'На сервере уже есть ваша комната. Загрузить её?\n\nОК — открыть комнату с сервера.\nОтмена — заменить её комнатой из этого браузера.',
    );
    if (keepServer) {
      applyRemote(remote);
      notify('Комната загружена с сервера');
    } else {
      meta.version = remote.version;
      meta.dirty = true;
      await push();
    }
    return;
  }

  if (remote.version === meta.version) {
    if (meta.dirty) await push();
    else setState('saved');
    return;
  }

  // На сервере версия новее: комнату меняли на другом устройстве.
  const hadLocalChanges = meta.dirty;
  applyRemote(remote);
  notify(hadLocalChanges ? 'Комнату меняли на другом устройстве — открыта последняя версия' : 'Комната обновлена с другого устройства');
}

function schedule(delay: number) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void push(), delay);
}

async function push(keepalive = false) {
  if (!meta || !token || !meta.dirty) return;
  if (inFlight) {
    schedule(SAVE_DELAY_MS);
    return;
  }
  inFlight = true;
  const sent = useWorldStore.getState().world;
  setState('saving');
  try {
    const result = await api<{ version: number }>('/world', {
      method: 'PUT',
      token,
      body: { world: sent, baseVersion: meta.version },
      keepalive,
    });
    if (!meta) return;
    meta.version = result.version;
    // Пока шёл запрос, мир могли поменять ещё раз — тогда отправим и это.
    meta.dirty = useWorldStore.getState().world !== sent;
    saveMeta(meta);
    if (meta.dirty) schedule(SAVE_DELAY_MS);
    else setState('saved');
  } catch (error) {
    if (error instanceof ApiError && error.status === 409 && error.body.world) {
      applyRemote({ world: error.body.world as World, version: error.body.version as number });
      notify('Комнату меняли на другом устройстве — открыта последняя версия');
    } else {
      handleError(error);
    }
  } finally {
    inFlight = false;
  }
}

function applyRemote(remote: RemoteWorld) {
  if (!meta) return;
  applyingRemote = true;
  try {
    useWorldStore.getState().replaceWorld(remote.world);
  } finally {
    applyingRemote = false;
  }
  meta.version = remote.version;
  meta.dirty = false;
  saveMeta(meta);
  setState('saved');
}

function handleError(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    useAccountStore.getState().expire();
    notify('Вход устарел — войдите снова, комната пока сохраняется в браузере');
    return;
  }
  if (error instanceof OfflineError) {
    setState('offline');
    schedule(RETRY_MS);
    return;
  }
  // Сервер отказался принять мир (400) или упал (500): оставляем изменения в браузере и пробуем позже.
  console.warn('Не удалось сохранить комнату на сервере', error);
  setState('offline');
  schedule(RETRY_MS);
}
