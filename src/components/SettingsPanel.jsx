/**
 * SettingsPanel — Slide-in settings drawer from the right side.
 *
 * Sections: Appearance, Automation, Privacy & Data, Advanced
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { APP_VERSION, checkForUpdates } from '../lib/updateChecker.js';
import logger from '../lib/logger.js';
import './SettingsPanel.css';

function Toggle({ checked, onChange, id, label, disabled = false }) {
  return (
    <div className="settings-toggle-row">
      <label className="settings-toggle-label" htmlFor={id}>{label}</label>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={`toggle-switch ${checked ? 'on' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && onChange(!checked)}
      >
        <span className="toggle-thumb" />
      </button>
    </div>
  );
}

export default function SettingsPanel({ isOpen = false, settings, onUpdate, onReset, onClose, onClearHistory, onExportHistory, scanHistory = [] }) {
  const [newTrustedDomain, setNewTrustedDomain] = useState('');
  const [newBlockedDomain, setNewBlockedDomain] = useState('');
  const [updateStatus, setUpdateStatus] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  // Focus close button on open
  useEffect(() => { setTimeout(() => closeRef.current?.focus(), 60); }, []);

  // Escape key closes panel
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    const result = await checkForUpdates();
    setUpdateStatus(result);
    setCheckingUpdate(false);
  }, []);

  const handleAddTrusted = useCallback(() => {
    const d = newTrustedDomain.trim().toLowerCase();
    if (!d) return;
    const list = [...(settings.customTrustedDomains || [])];
    if (!list.includes(d)) {
      onUpdate('customTrustedDomains', [...list, d]);
      logger.info('Added custom trusted domain', { domain: d });
    }
    setNewTrustedDomain('');
  }, [newTrustedDomain, settings.customTrustedDomains, onUpdate]);

  const handleAddBlocked = useCallback(() => {
    const d = newBlockedDomain.trim().toLowerCase();
    if (!d) return;
    const list = [...(settings.customBlockedDomains || [])];
    if (!list.includes(d)) {
      onUpdate('customBlockedDomains', [...list, d]);
      logger.info('Added custom blocked domain', { domain: d });
    }
    setNewBlockedDomain('');
  }, [newBlockedDomain, settings.customBlockedDomains, onUpdate]);

  return (
    <AnimatePresence>
      {isOpen && (
      <div className="settings-overlay" aria-modal="true" role="dialog" aria-label="Settings">
        {/* Backdrop */}
        <motion.div
          className="settings-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />

        {/* Drawer */}
        <motion.aside
          ref={panelRef}
          className="settings-drawer"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        >
          <div className="settings-head">
            <h2>⚙ Settings</h2>
            <span className="settings-version">v{APP_VERSION}</span>
            <button ref={closeRef} type="button" className="settings-close-btn" onClick={onClose} aria-label="Close settings">✕</button>
          </div>

          <div className="settings-body">

            {/* ── Appearance ── */}
            <section className="settings-section">
              <h3>Appearance</h3>

              <div className="settings-field">
                <label className="settings-label">Theme</label>
                <div className="theme-radio-group" role="radiogroup" aria-label="Theme selection">
                  {['dark', 'light', 'system'].map((t) => (
                    <label key={t} className={`theme-radio-btn ${settings.theme === t ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="theme"
                        value={t}
                        checked={settings.theme === t}
                        onChange={() => onUpdate('theme', t)}
                      />
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              <Toggle id="animations" label="Animations" checked={settings.animations} onChange={(v) => onUpdate('animations', v)} />
              <Toggle id="compactMode" label="Compact Mode" checked={settings.compactMode} onChange={(v) => onUpdate('compactMode', v)} />
              <Toggle id="highContrast" label="High Contrast (Accessibility)" checked={settings.highContrast} onChange={(v) => onUpdate('highContrast', v)} />
            </section>

            {/* ── Automation ── */}
            <section className="settings-section">
              <h3>Automation</h3>
              <Toggle id="autoUpdateCheck" label="Check for updates automatically" checked={settings.autoUpdateCheck} onChange={(v) => onUpdate('autoUpdateCheck', v)} />
              {settings.autoUpdateCheck && (
                <div className="settings-field">
                  <label className="settings-label" htmlFor="update-interval">Check interval</label>
                  <select
                    id="update-interval"
                    className="settings-select"
                    value={settings.autoUpdateInterval}
                    onChange={(e) => onUpdate('autoUpdateInterval', Number(e.target.value))}
                  >
                    <option value={5}>Every 5 minutes</option>
                    <option value={15}>Every 15 minutes</option>
                    <option value={30}>Every 30 minutes</option>
                    <option value={60}>Every hour</option>
                    <option value={1440}>Once a day</option>
                  </select>
                </div>
              )}
              <div className="settings-action-row">
                <button
                  type="button"
                  className="btn-settings-action"
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate}
                >
                  {checkingUpdate ? 'Checking…' : '↻ Check Now'}
                </button>
                {updateStatus && (
                  <span className={`update-status ${updateStatus.hasUpdate ? 'has-update' : ''}`}>
                    {updateStatus.hasUpdate
                      ? `⬆ Update available (${updateStatus.latestSha?.slice(0, 7)})`
                      : '✓ Up to date'}
                  </span>
                )}
              </div>
            </section>

            {/* ── Privacy & Data ── */}
            <section className="settings-section">
              <h3>Privacy &amp; Data</h3>
              <div className="settings-field">
                <label className="settings-label" htmlFor="history-size">
                  Max scan history: {settings.scanHistorySize}
                </label>
                <input
                  id="history-size"
                  type="range"
                  min={5}
                  max={50}
                  step={5}
                  value={settings.scanHistorySize}
                  onChange={(e) => onUpdate('scanHistorySize', Number(e.target.value))}
                  className="settings-range"
                  aria-label="Max scan history entries"
                />
                <div className="range-labels"><span>5</span><span>50</span></div>
              </div>

              <div className="settings-action-row">
                <button type="button" className="btn-settings-action danger" onClick={onClearHistory}>
                  🗑 Clear History
                </button>
                <button
                  type="button"
                  className="btn-settings-action"
                  onClick={onExportHistory}
                  disabled={scanHistory.length === 0}
                >
                  ⬇ Export CSV
                </button>
              </div>

              <Toggle id="showLogPanel" label="Show log panel" checked={settings.showLogPanel} onChange={(v) => onUpdate('showLogPanel', v)} />
            </section>

            {/* ── Advanced ── */}
            <section className="settings-section">
              <h3>Advanced</h3>

              <div className="settings-field">
                <label className="settings-label">Custom Trusted Domains</label>
                <div className="domain-list">
                  {(settings.customTrustedDomains || []).map((d) => (
                    <div key={d} className="domain-tag trusted">
                      <span>{d}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${d}`}
                        onClick={() => onUpdate('customTrustedDomains', settings.customTrustedDomains.filter((x) => x !== d))}
                      >✕</button>
                    </div>
                  ))}
                </div>
                <div className="domain-input-row">
                  <input
                    type="text"
                    className="settings-input"
                    value={newTrustedDomain}
                    onChange={(e) => setNewTrustedDomain(e.target.value)}
                    placeholder="example.com"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTrusted()}
                    aria-label="New trusted domain"
                  />
                  <button type="button" className="btn-settings-action small" onClick={handleAddTrusted}>Add</button>
                </div>
              </div>

              <div className="settings-field">
                <label className="settings-label">Custom Suspicious Domains</label>
                <div className="domain-list">
                  {(settings.customBlockedDomains || []).map((d) => (
                    <div key={d} className="domain-tag blocked">
                      <span>{d}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${d}`}
                        onClick={() => onUpdate('customBlockedDomains', settings.customBlockedDomains.filter((x) => x !== d))}
                      >✕</button>
                    </div>
                  ))}
                </div>
                <div className="domain-input-row">
                  <input
                    type="text"
                    className="settings-input"
                    value={newBlockedDomain}
                    onChange={(e) => setNewBlockedDomain(e.target.value)}
                    placeholder="suspicious-news.com"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddBlocked()}
                    aria-label="New blocked domain"
                  />
                  <button type="button" className="btn-settings-action small" onClick={handleAddBlocked}>Add</button>
                </div>
              </div>

              <div className="settings-action-row">
                {confirmReset ? (
                  <div className="settings-confirm-row">
                    <span>Are you sure? This resets all settings.</span>
                    <button type="button" className="btn-settings-action danger" onClick={() => { onReset(); setConfirmReset(false); }}>
                      Yes, reset
                    </button>
                    <button type="button" className="btn-settings-action" onClick={() => setConfirmReset(false)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn-settings-action danger"
                    onClick={() => setConfirmReset(true)}
                  >
                    ↺ Reset All Settings
                  </button>
                )}
              </div>
            </section>
          </div>
        </motion.aside>
      </div>
      )}
    </AnimatePresence>
  );
}
