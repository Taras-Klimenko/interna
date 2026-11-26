import type { World } from '@interna/shared';
import type { RoomEvent } from '../api/chat';
import { CATALOG } from '../catalog/catalog';
import { useWorldStore } from '../store/worldStore';
import { useEditorStore } from '../store/editorStore';
import { useReaderStore } from '../store/readerStore';
import { useChatStore } from '../store/chatStore';

/**
 * Замечаем, что произошло в комнате, и просим персонажа откликнуться: хозяин поставил книгу, повесил фото,
 * добавил трек, обставил комнату или давно молчит. Возвращение после перерыва — отдельный рассказ
 * «Пока тебя не было…» (chatStore.away).
 * События за несколько секунд собираются в одну реакцию; сервер ещё и сам не даёт реагировать чаще раза в минуту.
 */

/** Столько часов без комнаты — уже «вернулся после перерыва». */
const VISIT_GAP_HOURS = 4;
/** Ждём столько после события: вдруг следом добавят ещё книгу — тогда одна реакция на обе. */
const COLLECT_MS = 4_000;
/** Сейчас реагировать нельзя (персонаж отвечает, открыта читалка) — пробуем снова через столько. */
const RETRY_MS = 5_000;
/** Столько минут без разговора — «давно тихо». И не чаще, чем раз в SILENCE_REPEAT_MS. */
const SILENCE_MINUTES = 30;
const SILENCE_REPEAT_MS = 2 * 60 * 60 * 1000;
const LAST_SEEN_EVERY_MS = 60_000;

interface Snapshot {
  books: Map<string, { title: string; author: string }>;
  photos: Map<string, { id: string; caption: string }>;
  tracks: Map<string, string>;
  objects: Map<string, string>;
}

function snapshot(world: World): Snapshot {
  const snap: Snapshot = { books: new Map(), photos: new Map(), tracks: new Map(), objects: new Map() };
  for (const object of world.objects) {
    snap.objects.set(object.id, object.defId);
    for (const book of object.state.container ?? []) snap.books.set(book.id, { title: book.title, author: book.author });
    for (const track of object.state.media?.playlist ?? []) snap.tracks.set(track.id, track.title);
    const photo = object.state.display?.photo;
    if (photo) snap.photos.set(object.id, { id: photo.id, caption: photo.caption });
  }
  return snap;
}

const objectName = (defId: string) => CATALOG[defId]?.name ?? 'предмет';

/** Подпись события в чате, пока персонаж отвечает (после ответа её заменит текст с сервера). */
function labelOf(events: RoomEvent[]) {
  return events
    .map((event) => {
      switch (event.type) {
        case 'visit':
          return 'Вы вернулись';
        case 'newBooks':
          return `На полке: ${event.books.map((book) => `«${book.title}»`).join(', ')}`;
        case 'newPhoto':
          return 'Новое фото на стене';
        case 'newTracks':
          return `В плейлисте: ${event.titles.map((title) => `«${title}»`).join(', ')}`;
        case 'newObjects':
          return `В комнате: ${event.names.join(', ')}`;
        case 'silence':
          return 'Давно тихо';
      }
    })
    .join(' · ');
}

/** Несколько событий одного типа — одно событие со списком. */
function merge(events: RoomEvent[]): RoomEvent[] {
  const result: RoomEvent[] = [];
  for (const event of events) {
    const same = result.find((item) => item.type === event.type);
    if (!same) result.push(structuredClone(event));
    else if (same.type === 'newBooks' && event.type === 'newBooks') same.books.push(...event.books);
    else if (same.type === 'newTracks' && event.type === 'newTracks') same.titles.push(...event.titles);
    else if (same.type === 'newObjects' && event.type === 'newObjects') same.names.push(...event.names);
    else if (same.type === 'newPhoto' && event.type === 'newPhoto') same.caption = event.caption;
  }
  return result;
}

/** Запустить наблюдение для вошедшего пользователя. Возвращает функцию остановки. */
export function startRoomEvents(userId: string) {
  const lastSeenKey = `interna.lastSeen.${userId}`;
  let queue: RoomEvent[] = [];
  let timer: number | undefined;
  let snap = snapshot(useWorldStore.getState().world);
  let lastTalk = Date.now();
  let lastSilence = 0;

  const add = (event: RoomEvent) => {
    queue.push(event);
    schedule(COLLECT_MS);
  };
  const schedule = (delay: number) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void flush(), delay);
  };

  const flush = async () => {
    if (queue.length === 0) return;
    await useChatStore.getState().ensureLoaded();
    const chat = useChatStore.getState();
    if (chat.status !== 'ready') {
      // Чат на сервере выключен или недоступен — реагировать некому.
      queue = [];
      return;
    }
    if (chat.pending || useReaderStore.getState().open || useEditorStore.getState().active || document.visibilityState !== 'visible') {
      schedule(RETRY_MS);
      return;
    }
    const events = merge(queue);
    queue = [];
    await useChatStore.getState().react(events, labelOf(events));
  };

  // Вернулись после перерыва: при запуске и когда вкладка снова видна (телефон разблокировали).
  const checkVisit = () => {
    const lastSeen = Number(localStorage.getItem(lastSeenKey) ?? 0);
    const hours = (Date.now() - lastSeen) / 3_600_000;
    markSeen();
    if (lastSeen <= 0) return;
    // Без хозяина растения подсыхают: полить их — повод и для него, и для персонажа.
    if (hours > 0.25) useWorldStore.getState().dryPlants(hours);
    if (hours >= VISIT_GAP_HOURS) void useChatStore.getState().away(Math.round(hours * 10) / 10);
  };
  const markSeen = () => {
    try {
      localStorage.setItem(lastSeenKey, String(Date.now()));
    } catch {
      // Без localStorage просто не узнаем о перерыве.
    }
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') checkVisit();
    else markSeen();
  };

  // Новые книги, фото, треки, вещи — сравниваем мир до и после изменения.
  const unsubscribeWorld = useWorldStore.subscribe((state, previous) => {
    // Мир заменили целиком (пришёл с сервера, сбросили комнату) — это не «хозяин что-то добавил».
    if (state.teleportSeq !== previous.teleportSeq) {
      snap = snapshot(state.world);
      return;
    }
    if (state.world === previous.world) return;
    const next = snapshot(state.world);
    const books = [...next.books].filter(([id]) => !snap.books.has(id)).map(([, book]) => book);
    if (books.length > 0) add({ type: 'newBooks', books });
    for (const [frameId, photo] of next.photos) {
      if (snap.photos.get(frameId)?.id !== photo.id) add({ type: 'newPhoto', caption: photo.caption });
    }
    const titles = [...next.tracks].filter(([id]) => !snap.tracks.has(id)).map(([, title]) => title);
    if (titles.length > 0) add({ type: 'newTracks', titles });
    // Вещи считаем, когда хозяин закончит обставлять комнату (см. ниже).
    snap = { ...next, objects: useEditorStore.getState().active ? snap.objects : next.objects };
  });

  // Вышли из режима расстановки — что нового появилось в комнате.
  const unsubscribeEditor = useEditorStore.subscribe((state, previous) => {
    if (!previous.active || state.active) return;
    const current = snapshot(useWorldStore.getState().world).objects;
    const names = [...current].filter(([id]) => !snap.objects.has(id)).map(([, defId]) => objectName(defId));
    snap.objects = current;
    if (names.length > 0) add({ type: 'newObjects', names: [...new Set(names)] });
  });

  // Давно тихо: считаем от последней реплики (своей или персонажа).
  const unsubscribeChat = useChatStore.subscribe((state, previous) => {
    if (state.messages.length !== previous.messages.length || (state.pending && !previous.pending)) lastTalk = Date.now();
  });
  const tick = window.setInterval(() => {
    if (document.visibilityState === 'visible') markSeen();
    const now = Date.now();
    if (
      document.visibilityState === 'visible' &&
      document.hasFocus() &&
      now - lastTalk >= SILENCE_MINUTES * 60_000 &&
      now - lastSilence >= SILENCE_REPEAT_MS
    ) {
      lastSilence = now;
      add({ type: 'silence', minutes: Math.round((now - lastTalk) / 60_000) });
    }
  }, LAST_SEEN_EVERY_MS);

  checkVisit();
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    markSeen();
    window.clearTimeout(timer);
    window.clearInterval(tick);
    document.removeEventListener('visibilitychange', onVisibility);
    unsubscribeWorld();
    unsubscribeEditor();
    unsubscribeChat();
  };
}
