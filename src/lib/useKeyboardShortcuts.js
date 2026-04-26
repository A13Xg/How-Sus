/**
 * useKeyboardShortcuts.js — Global keyboard shortcut handler.
 */
import { useEffect, useCallback } from 'react';

export const SHORTCUTS = [
  { keys: 'Shift+Enter', description: 'Trigger scan' },
  { keys: 'Escape', description: 'Reset / close modal' },
  { keys: 'Ctrl+K', description: 'Focus URL input' },
  { keys: '?', description: 'Show keyboard shortcuts' },
];

export default function useKeyboardShortcuts({ onScan, onReset, onShowHelp }) {
  const handler = useCallback((e) => {
    // Skip if typing in an input/textarea (except Shift+Enter and Escape)
    const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (e.key === 'Escape') { onReset?.(); return; }
    if (e.shiftKey && e.key === 'Enter') { e.preventDefault(); onScan?.(); return; }
    if (inInput) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const urlInput = document.querySelector('.url-input');
      urlInput?.focus();
      return;
    }
    if (e.key === '?') { onShowHelp?.(); return; }
  }, [onScan, onReset, onShowHelp]);

  useEffect(() => {
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handler]);
}
