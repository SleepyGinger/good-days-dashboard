// This file runs before Next.js initializes
// Polyfill localStorage for Node.js 25+ which has a broken experimental implementation

export async function register() {
  if (typeof globalThis.localStorage !== 'undefined') {
    // Check if localStorage.getItem is not a function (broken Node.js implementation)
    if (typeof globalThis.localStorage.getItem !== 'function') {
      (globalThis as any).localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      };
    }
  }
}
