/**
 * Header - Sticky top bar with logo and session-only API key button.
 *
 * The API key button is intentionally small and placed on the right side.
 * The key is never persisted — it lives in React state for the session only.
 *
 * Accessibility:
 *  - The dropdown acts as a dialog: focus moves inside on open.
 *  - Pressing Escape closes the dropdown.
 *  - All interactive elements have aria labels.
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './Header.css';

export default function Header({ aiConfig, resolvedProvider, detectedProvider, providers, onAiConfigChange }) {
  const [showModal, setShowModal] = useState(false);
  const [tempKey, setTempKey] = useState('');
  const [tempProvider, setTempProvider] = useState('auto');
  const [tempModel, setTempModel] = useState('');
  const inputRef = useRef(null);
  const btnRef = useRef(null);

  const providerLabel = useMemo(() => {
    if (!aiConfig.apiKey) return 'AI Key';
    const active = resolvedProvider && providers[resolvedProvider]
      ? providers[resolvedProvider].label
      : 'Provider';
    return `AI ${active}`;
  }, [aiConfig.apiKey, resolvedProvider, providers]);

  // Move focus into the input when the dropdown opens
  useEffect(() => {
    if (showModal) {
      setTempKey(aiConfig.apiKey || '');
      setTempProvider(aiConfig.provider || 'auto');
      setTempModel(aiConfig.model || '');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [showModal, aiConfig]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && showModal) setShowModal(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showModal]);

  const handleSave = () => {
    onAiConfigChange({
      apiKey: tempKey.trim(),
      provider: tempProvider,
      model: tempModel.trim(),
    });
    setShowModal(false);
    btnRef.current?.focus();
  };

  const handleClear = () => {
    onAiConfigChange({ apiKey: '', provider: 'auto', model: '' });
    setTempKey('');
    setTempProvider('auto');
    setTempModel('');
    setShowModal(false);
    btnRef.current?.focus();
  };

  return (
    <header className="header" role="banner">
      {/* Skip-to-content link for keyboard users */}
      <a className="skip-link" href="#main-content">Skip to main content</a>

      <div className="header-inner">
        {/* ── Logo ──────────────────────────────────────────────────────── */}
        <motion.div
          className="logo-area"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="logo-icon" aria-hidden="true">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" focusable="false">
              <circle cx="18" cy="18" r="17" stroke="url(#g1)" strokeWidth="2"/>
              <path d="M18 8 L18 28 M8 18 L28 18" stroke="url(#g1)" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="18" cy="18" r="5" fill="url(#g1)"/>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="36" y2="36">
                  <stop offset="0%" stopColor="#3b82f6"/>
                  <stop offset="100%" stopColor="#8b5cf6"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="logo-text">
            <h1>How<span className="accent">Sus</span></h1>
            <p>News &amp; Media Authenticity Analyzer</p>
          </div>
        </motion.div>

        {/* ── API key control ───────────────────────────────────────────── */}
        <motion.div
          className="header-actions"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="api-key-area">
            <motion.button
              ref={btnRef}
              className={`api-key-btn ${aiConfig.apiKey ? 'has-key' : ''}`}
              onClick={() => setShowModal((v) => !v)}
              aria-haspopup="dialog"
              aria-expanded={showModal}
              aria-label={
                aiConfig.apiKey
                  ? 'AI analysis active. Click to manage provider and API key'
                  : 'Add an API key to enable AI analysis'
              }
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
            >
              <span className="api-dot" aria-hidden="true" />
              {providerLabel}
            </motion.button>

            {/* ── Dropdown modal ─────────────────────────────────────── */}
            <AnimatePresence>
              {showModal && (
                <motion.div
                  className="api-key-dropdown"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Configure AI API Key"
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.18 }}
                >
                  <p className="api-key-label" id="api-key-desc">
                    AI Provider + API Key <span>(session only — never stored)</span>
                  </p>
                  <label className="api-field-label" htmlFor="provider-select">Provider</label>
                  <select
                    id="provider-select"
                    className="api-provider-select"
                    value={tempProvider}
                    onChange={(e) => setTempProvider(e.target.value)}
                    aria-label="AI provider"
                  >
                    <option value="auto">Auto-detect from key</option>
                    <option value="openai">OpenAI</option>
                    <option value="google">Google Gemma 4</option>
                  </select>

                  <input
                    ref={inputRef}
                    type="password"
                    value={tempKey}
                    onChange={(e) => setTempKey(e.target.value)}
                    placeholder="sk-... or AIza..."
                    className="api-key-input"
                    aria-label="AI API key"
                    aria-describedby="api-key-desc api-key-note"
                    autoComplete="off"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSave();
                      if (e.key === 'Escape') setShowModal(false);
                    }}
                  />

                  <label className="api-field-label" htmlFor="model-input">Model (optional override)</label>
                  <input
                    id="model-input"
                    type="text"
                    value={tempModel}
                    onChange={(e) => setTempModel(e.target.value)}
                    placeholder={tempProvider === 'google' ? 'gemma-4' : 'gpt-4o-mini'}
                    className="api-key-input"
                    aria-label="AI model override"
                  />

                  <div className="api-key-actions">
                    <button className="btn-save" onClick={handleSave} type="button">
                      Save
                    </button>
                    {aiConfig.apiKey && (
                      <button className="btn-clear" onClick={handleClear} type="button">
                        Clear
                      </button>
                    )}
                    <button
                      className="btn-cancel"
                      onClick={() => setShowModal(false)}
                      type="button"
                      aria-label="Close API key dialog"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="api-key-note" id="api-key-note">
                    Auto-detect uses key prefix: sk- for OpenAI, AIza for Google. You can override provider manually.
                    Active provider: {resolvedProvider || 'none'}{detectedProvider ? ` (detected: ${detectedProvider})` : ''}.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </header>
  );
}
