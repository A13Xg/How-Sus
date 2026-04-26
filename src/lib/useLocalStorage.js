/**
 * useLocalStorage.js — Custom React hook for persistent localStorage state.
 *
 * Drop-in replacement for useState that additionally reads from and writes to
 * the browser's localStorage, so values survive page reloads.
 *
 * Usage:
 *   const [value, setValue] = useLocalStorage('my-key', defaultValue);
 *   // setValue works the same as setState — accepts either a value or updater fn
 *
 * Cross-tab synchronisation:
 *   This hook intentionally does NOT synchronise state across browser tabs.
 *   HowSus is a single-tab analysis tool; cross-tab sync would add complexity
 *   with no user-facing benefit. If cross-tab sync is needed in the future,
 *   add a `storage` event listener that calls setStoredValue when the key changes.
 *
 * Error handling:
 *   - Parse failures on read fall back to initialValue silently.
 *   - Write failures (e.g. private browsing quotas) are silently ignored.
 *   - This keeps the hook safe in environments where localStorage is restricted.
 *
 * @module useLocalStorage
 */
import { useState, useCallback } from 'react';

/**
 * useLocalStorage — persisted React state backed by localStorage.
 *
 * @template T
 * @param {string} key          - localStorage key to read/write
 * @param {T}      initialValue - fallback value if key is absent or unreadable
 * @returns {[T, function(T|function(T):T): void]}  [storedValue, setValue]
 */
export function useLocalStorage(key, initialValue) {
  // Initialise from localStorage (lazy state init runs once on mount)
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      // JSON.parse handles null (absent key) by throwing, caught below
      return item ? JSON.parse(item) : initialValue;
    } catch {
      // Silently fall back — can happen if JSON is malformed or localStorage
      // is unavailable (e.g. private browsing with storage disabled)
      return initialValue;
    }
  });

  /**
   * setValue — updates both React state and the localStorage entry atomically.
   * Accepts either a direct value or an updater function (same API as setState).
   *
   * @param {T | function(T): T} value - new value or updater function
   */
  const setValue = useCallback((value) => {
    try {
      // Support functional updates (e.g. setValue(prev => [...prev, item]))
      const valueToStore = typeof value === 'function' ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch {
      // localStorage write failure is non-fatal (private browsing, quota exceeded)
    }
  }, [key, storedValue]);

  return [storedValue, setValue];
}

