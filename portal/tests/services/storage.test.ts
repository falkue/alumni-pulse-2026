import { describe, expect, it } from 'vitest';
import { createMemoryStorage, createStore, STORAGE_PREFIX, type StorageLike } from '../../src/services/local/storage';

/** Storage, das bei jedem Zugriff wirft (z. B. QuotaExceeded / privater Modus). */
function throwingStorage(): StorageLike {
  const fail = () => {
    throw new DOMException('denied', 'QuotaExceededError');
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

describe('createStore', () => {
  it('nutzt das Präfix apulse.v1.', () => {
    expect(STORAGE_PREFIX).toBe('apulse.v1.');
    const mem = createMemoryStorage();
    createStore(mem).set('session', { uid: 'u1' });
    expect(mem.getItem('apulse.v1.session')).toBe('{"uid":"u1"}');
    expect(mem.getItem('session')).toBeNull();
  });

  it('Round-Trip über JSON', () => {
    const store = createStore(createMemoryStorage());
    const value = { a: 1, b: ['x', null], c: { d: true } };
    store.set('k', value);
    expect(store.get('k')).toEqual(value);
  });

  it('liefert null für fehlende Schlüssel', () => {
    expect(createStore(createMemoryStorage()).get('nix')).toBeNull();
  });

  it('liefert bei kaputtem JSON null ohne Exception', () => {
    const mem = createMemoryStorage();
    mem.setItem(STORAGE_PREFIX + 'bad', '{nicht json');
    expect(createStore(mem).get('bad')).toBeNull();
  });

  it('stürzt nicht ab, wenn das Storage wirft', () => {
    const store = createStore(throwingStorage());
    expect(() => store.set('k', 1)).not.toThrow();
    expect(store.get('k')).toBeNull();
    expect(() => store.remove('k')).not.toThrow();
  });

  it('remove entfernt den Eintrag', () => {
    const mem = createMemoryStorage();
    const store = createStore(mem);
    store.set('k', 1);
    store.remove('k');
    expect(store.get('k')).toBeNull();
    expect(mem.getItem(STORAGE_PREFIX + 'k')).toBeNull();
  });
});
