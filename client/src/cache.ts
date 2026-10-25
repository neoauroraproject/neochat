// Minimal IndexedDB key-value cache so the app opens instantly and works offline.
// Everything here is best-effort: a failure just means we fall back to the network.

const DB_NAME = "neochat";
const STORE = "kv";
let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export const cacheGet = <T>(key: string) => tx<T>("readonly", (s) => s.get(key) as IDBRequest<T>);
export const cacheSet = (key: string, value: unknown) => tx("readwrite", (s) => s.put(value, key));
export const cacheClear = () => tx("readwrite", (s) => s.clear());

const timers = new Map<string, number>();
/** Debounced write so rapid message bursts don't hammer IndexedDB. */
export function cacheSetLater(key: string, value: () => unknown, delay = 800) {
  window.clearTimeout(timers.get(key));
  timers.set(
    key,
    window.setTimeout(() => {
      timers.delete(key);
      cacheSet(key, value());
    }, delay),
  );
}

export async function clearAllCaches() {
  await cacheClear();
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    /* Cache Storage unavailable */
  }
}
