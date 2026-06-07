/**
 * Vitest setup file.
 *
 * Node.js v22+ declares a getter on globalThis.localStorage that throws when
 * --localstorage-file is not provided.  happy-dom provides its own
 * localStorage on the Window object but doesn't always override the Node
 * global before tests import application code.  This shim ensures a working
 * localStorage is present from the start.
 */

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      get length() { return store.size; },
      key: (index: number) => [...store.keys()][index] ?? null,
    },
  });
}
