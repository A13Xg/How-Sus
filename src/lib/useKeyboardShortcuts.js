/**
 * useKeyboardShortcuts.js — Global keyboard shortcut handler.
 */
import { useEffect, useCallback } from 'react';

export const SHORTCUTS = [
  { keys: 'Shift+Enter', description: 'Trigger scan' },
  { keys: 'Escape', description: 'Reset / close modal' },
  { keys: 'Ctrl+K', description: 'Focus URL input' },
];

export default function useKeyboardShortcuts({ onScan, onReset, onFocusUrl }) {
  const handler = useCallback((e) => {
    const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (e.key === 'Escape') { onReset?.(); return; }
    if (e.shiftKey && e.key === 'Enter') { e.preventDefault(); onScan?.(); return; }
    if (inInput) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      onFocusUrl?.();
      return;
    }
  }, [onScan, onReset, onFocusUrl]);

  useEffect(() => {
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handler]);
}
