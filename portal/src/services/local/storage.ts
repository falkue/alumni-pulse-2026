/**
 * Dünne Key-Value-Hülle um ein Storage-Objekt (Default: window.localStorage).
 * Werte werden als JSON abgelegt; Fehler (Quota, privater Modus) werden geschluckt.
 */

/** Minimale Storage-Schnittstelle; localStorage erfüllt sie, Tests nutzen eine In-Memory-Variante. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_PREFIX = 'apulse.v1.';

export interface KeyValueStore {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

/** Einfaches In-Memory-Storage (für Tests und als Fallback ohne localStorage). */
export function createMemoryStorage(): StorageLike {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

/** Erzeugt den Store. Ohne Argument wird window.localStorage genutzt (sonst Memory-Fallback). */
export function createStore(storage?: StorageLike): KeyValueStore {
  let backend: StorageLike;
  try {
    backend = storage ?? window.localStorage;
  } catch {
    backend = createMemoryStorage();
  }
  return {
    get<T>(key: string): T | null {
      try {
        const raw = backend.getItem(STORAGE_PREFIX + key);
        return raw === null ? null : (JSON.parse(raw) as T);
      } catch {
        return null; // kaputtes JSON oder Zugriff verweigert -> wie "nicht vorhanden"
      }
    },
    set(key, value) {
      try {
        backend.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
      } catch {
        /* Quota/privater Modus: Demo läuft ohne Persistenz weiter */
      }
    },
    remove(key) {
      try {
        backend.removeItem(STORAGE_PREFIX + key);
      } catch {
        /* ignorieren */
      }
    },
  };
}
