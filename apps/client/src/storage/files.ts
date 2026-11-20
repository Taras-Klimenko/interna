/**
 * Файлы пользователя (музыка, фото) в IndexedDB: localStorage для них слишком мал.
 * Ключ — id трека или фото из состояния мира.
 */
const DB_NAME = 'interna';
const DB_VERSION = 2;
const STORES = ['tracks', 'photos'] as const;
type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      // Версия 1 знала только про треки: недостающие хранилища досоздаём, существующие не трогаем.
      for (const name of STORES) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

async function run<T>(name: StoreName, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const request = action(tx.objectStore(name));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function fileStore(name: StoreName) {
  const remove = (id: string) => run(name, 'readwrite', (store) => store.delete(id));
  return {
    save: (id: string, file: Blob) => run(name, 'readwrite', (store) => store.put(file, id)),
    load: (id: string) => run(name, 'readonly', (store) => store.get(id) as IDBRequest<Blob | undefined>),
    remove,
    /** Удаляет файлы, на которые больше ничто в мире не ссылается (предмет убрали, комнату сбросили). */
    removeUnused: async (usedIds: Set<string>) => {
      const keys = await run(name, 'readonly', (store) => store.getAllKeys());
      await Promise.all(keys.filter((key) => !usedIds.has(String(key))).map((key) => remove(String(key))));
    },
  };
}

export const trackFiles = fileStore('tracks');
export const photoFiles = fileStore('photos');

/** Просим браузер не вычищать хранилище при нехватке места. Если откажет — ничего страшного. */
export function requestPersistentStorage() {
  void navigator.storage?.persist?.().catch(() => undefined);
}
