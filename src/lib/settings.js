/**
 * settings.js — Persistent settings store with React hook.
 */
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'howsus-settings';

export const DEFAULT_SETTINGS = {
  theme: 'dark',
  animations: true,
  autoUpdateCheck: true,
  autoUpdateInterval: 60,
  scanHistorySize: 10,
  showLogPanel: false,
  compactMode: false,
  highContrast: false,
  customTrustedDomains: [],
  customBlockedDomains: [],
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

export function useSettings() {
  const [settings, setSettings] = useState(loadSettings);

  const updateSetting = useCallback((key, value) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    saveSettings(DEFAULT_SETTINGS);
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  return [settings, updateSetting, resetSettings];
}
