/**
 * Аудиофайлы пользователя в IndexedDB: localStorage для них слишком мал.
 * Ключ — id трека из плейлиста колонки.
 */
const DB_NAME = 'interna';
const STORE = 'tracks';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function saveTrackFile(id: string, file: Blob) {
  return run('readwrite', (store) => store.put(file, id));
}

export function loadTrackFile(id: string): Promise<Blob | undefined> {
  return run('readonly', (store) => store.get(id) as IDBRequest<Blob | undefined>);
}

export function deleteTrackFile(id: string) {
  return run('readwrite', (store) => store.delete(id));
}

/** Удаляет файлы, на которые больше не ссылается ни один плейлист (колонку убрали, комнату сбросили). */
export async function deleteUnusedTrackFiles(usedIds: Set<string>) {
  const keys = await run('readonly', (store) => store.getAllKeys());
  await Promise.all(keys.filter((key) => !usedIds.has(String(key))).map((key) => deleteTrackFile(String(key))));
}

/** Просим браузер не вычищать хранилище при нехватке места. Если откажет — ничего страшного. */
export function requestPersistentStorage() {
  void navigator.storage?.persist?.().catch(() => undefined);
}
