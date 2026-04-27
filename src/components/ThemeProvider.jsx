/**
 * ThemeProvider — Applies theme data attributes to document.documentElement.
 */
import { useEffect } from 'react';

export default function ThemeProvider({ settings }) {
  const { theme, highContrast, compactMode } = settings;

  useEffect(() => {
    const root = document.documentElement;
    const apply = (resolved) => {
      root.setAttribute('data-theme', resolved);
    };

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      apply(mq.matches ? 'dark' : 'light');
      const onChange = (e) => apply(e.matches ? 'dark' : 'light');
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    } else {
      apply(theme);
    }
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (highContrast) root.setAttribute('data-high-contrast', 'true');
    else root.removeAttribute('data-high-contrast');
  }, [highContrast]);

  useEffect(() => {
    const root = document.documentElement;
    if (compactMode) root.setAttribute('data-compact', 'true');
    else root.removeAttribute('data-compact');
  }, [compactMode]);

  return null;
}
