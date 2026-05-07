/**
 * InputSection - Tabbed input panel for URL / Text / Image / Code / File analysis.
 *
 * Features:
 *  - Framer Motion tab indicator animation
 *  - Inline animated validation error messages
 *  - Drag-and-drop image upload with preview
 *  - Code tab with language detection badges
 *  - File tab for file inspection
 *  - Optional date range filter
 *  - Full ARIA labelling and keyboard navigation
 *
 * Props:
 *   inputData    {object}   - { type, value, dateFrom, dateTo, file }
 *   onInputChange{function} - called with updated inputData
 *   onScan       {function} - triggers the scan
 *   onReset      {function} - resets state back to idle
 *   scanning     {boolean}  - true while scan is running
 *   scanPhase    {string}   - 'idle'|'scanning'|'complete'|'error'
 */
import React, { useRef, useState, useCallback, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { detectLanguage } from '../lib/codeAnalyzer.js';
import './InputSection.css';

const TABS = [
  { id: 'url',   label: '🔗 URL',   placeholder: 'https://example.com/news-article' },
  { id: 'text',  label: '📝 Text',  placeholder: 'Paste an article, post, or any text to analyze for authenticity…' },
  { id: 'image', label: '🖼 Image', placeholder: '' },
  { id: 'code',  label: '💻 Code',  placeholder: 'Paste a Bash, Python, or PowerShell snippet to analyze for suspicious patterns…' },
  { id: 'file',  label: '📂 File',  placeholder: '' },
];

const LANG_BADGES = [
  { id: 'bash',        label: 'Bash/sh',    color: '#f59e0b' },
  { id: 'python',      label: 'Python',     color: '#3b82f6' },
  { id: 'powershell',  label: 'PowerShell', color: '#8b5cf6' },
];

/** Validate input and return an error string, or null if valid. */
function validate(inputData) {
  if (inputData.type === 'url') {
    const v = inputData.value.trim();
    if (!v) return 'Please enter a URL.';
    try {
      new URL(v.startsWith('http') ? v : `https://${v}`);
    } catch {
      return 'Please enter a valid URL (e.g. https://example.com/article).';
    }
    return null;
  }
  if (inputData.type === 'text') {
    const v = inputData.value.trim();
    if (!v) return 'Please paste some text to analyze.';
    if (v.length < 10) return 'Text is too short — please provide at least 10 characters.';
    return null;
  }
  if (inputData.type === 'image') {
    if (!inputData.file) return 'Please select or drop an image file.';
    return null;
  }
  if (inputData.type === 'code') {
    const v = inputData.value.trim();
    if (!v) return 'Please paste a code snippet to analyze.';
    if (v.length < 5) return 'Snippet is too short — please provide at least a few characters.';
    return null;
  }
  if (inputData.type === 'file') {
    if (!inputData.file) return 'Please select or drop a file to inspect.';
    return null;
  }
  return null;
}

export default function InputSection({ inputData, onInputChange, onScan, onReset, scanning, scanPhase }) {
  const fileInputRef = useRef(null);
  const anyFileInputRef = useRef(null);
  const [validationError, setValidationError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const tabGroupId = useId();

  const detectedLang = inputData.type === 'code' ? detectLanguage(inputData.value || '') : 'unknown';

  const handleTabChange = useCallback((type) => {
    if (scanning) return;
    setValidationError(null);
    onInputChange({ ...inputData, type, value: '', file: null });
  }, [scanning, inputData, onInputChange]);

  const handleFileChange = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setValidationError('Only image files are supported (JPEG, PNG, WebP, TIFF).');
      return;
    }
    setValidationError(null);
    onInputChange({ ...inputData, file, value: file.name });
  }, [inputData, onInputChange]);

  const handleAnyFileChange = useCallback((file) => {
    if (!file) return;
    setValidationError(null);
    onInputChange({ ...inputData, file, value: file.name });
  }, [inputData, onInputChange]);

  const handleScan = useCallback(() => {
    const err = validate(inputData);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    onScan();
  }, [inputData, onScan]);

  const activeTab = TABS.find((t) => t.id === inputData.type);

  return (
    <motion.section
      className="input-section"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      aria-label="Content input"
    >
      <div className="input-card">
        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        <div
          className="input-tabs"
          role="tablist"
          aria-label="Input type"
        >
          {TABS.map((tab) => {
            const isActive = inputData.type === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-${tabGroupId}-${tab.id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tabGroupId}`}
                className={`input-tab ${isActive ? 'active' : ''}`}
                onClick={() => handleTabChange(tab.id)}
                disabled={scanning}
                tabIndex={isActive ? 0 : -1}
                onKeyDown={(e) => {
                  // Arrow-key navigation between tabs
                  const idx = TABS.findIndex((t) => t.id === inputData.type);
                  if (e.key === 'ArrowRight') handleTabChange(TABS[(idx + 1) % TABS.length].id);
                  if (e.key === 'ArrowLeft')  handleTabChange(TABS[(idx - 1 + TABS.length) % TABS.length].id);
                }}
              >
                {tab.label}
                {/* Animated underline indicator */}
                {isActive && (
                  <motion.span
                    className="tab-indicator"
                    layoutId={`tab-indicator-${tabGroupId}`}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* ── Tab panel ────────────────────────────────────────────────── */}
        <div
          id={`tabpanel-${tabGroupId}`}
          role="tabpanel"
          aria-labelledby={`tab-${tabGroupId}-${inputData.type}`}
          className="input-body"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={inputData.type}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {/* Image drop zone */}
              {inputData.type === 'image' ? (
                <div
                  className={`file-drop ${inputData.file ? 'has-file' : ''} ${dragOver ? 'drag-active' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    handleFileChange(e.dataTransfer.files[0]);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={inputData.file ? `Selected image: ${inputData.file.name}. Click to change.` : 'Click or drag an image file here'}
                >
                  {inputData.file ? (
                    <>
                      <div className="file-preview-icon" aria-hidden="true">🖼</div>
                      <p className="file-name">{inputData.file.name}</p>
                      <p className="file-size">{(inputData.file.size / 1024).toFixed(1)} KB</p>
                      <p className="file-change-hint">Click to change</p>
                    </>
                  ) : (
                    <>
                      <div className="file-drop-icon" aria-hidden="true">⬆</div>
                      <p>Drop image here or <span>click to browse</span></p>
                      <p className="file-hint">Supports JPEG, PNG, WebP, TIFF</p>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileChange(e.target.files[0])}
                    style={{ display: 'none' }}
                    aria-hidden="true"
                  />
                </div>
              ) : inputData.type === 'url' ? (
                <input
                  className={`text-input url-input ${validationError ? 'input-error' : ''}`}
                  type="url"
                  value={inputData.value}
                  onChange={(e) => {
                    setValidationError(null);
                    onInputChange({ ...inputData, value: e.target.value });
                  }}
                  placeholder={activeTab?.placeholder}
                  disabled={scanning}
                  onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                  aria-label="URL to analyse"
                  aria-invalid={!!validationError}
                  aria-describedby={validationError ? 'input-error-msg' : undefined}
                  autoComplete="url"
                  spellCheck={false}
                />
              ) : inputData.type === 'file' ? (
                <div
                  className={`file-drop ${inputData.file ? 'has-file' : ''} ${dragOver ? 'drag-active' : ''}`}
                  onClick={() => anyFileInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') anyFileInputRef.current?.click(); }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    handleAnyFileChange(e.dataTransfer.files[0]);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={inputData.file ? `Selected file: ${inputData.file.name}. Click to change.` : 'Click or drag any file here for inspection'}
                >
                  {inputData.file ? (
                    <>
                      <div className="file-preview-icon" aria-hidden="true">📂</div>
                      <p className="file-name">{inputData.file.name}</p>
                      <p className="file-size">{(inputData.file.size / 1024).toFixed(1)} KB</p>
                      <p className="file-change-hint">Click to change</p>
                    </>
                  ) : (
                    <>
                      <div className="file-drop-icon" aria-hidden="true">⬆</div>
                      <p>Drop any file here or <span>click to browse</span></p>
                      <p className="file-hint">EXE, DLL, ZIP, PDF, scripts, documents — any file type</p>
                    </>
                  )}
                  <input
                    ref={anyFileInputRef}
                    type="file"
                    onChange={(e) => handleAnyFileChange(e.target.files[0])}
                    style={{ display: 'none' }}
                    aria-hidden="true"
                  />
                </div>
              ) : inputData.type === 'code' ? (
                <>
                  {/* Language detection badges */}
                  <div className="lang-badges" aria-label="Detected language">
                    {LANG_BADGES.map((b) => (
                      <span
                        key={b.id}
                        className={`lang-badge ${detectedLang === b.id ? 'lang-badge--active' : ''}`}
                        style={detectedLang === b.id ? { borderColor: b.color, color: b.color } : {}}
                        aria-label={`${b.label}${detectedLang === b.id ? ' (detected)' : ''}`}
                      >
                        {b.label}
                        {detectedLang === b.id && <span className="lang-badge-dot" aria-hidden="true" style={{ background: b.color }} />}
                      </span>
                    ))}
                    {detectedLang === 'unknown' && (
                      <span className="lang-badge lang-badge--unknown">Auto-detect</span>
                    )}
                  </div>
                  <textarea
                    className={`text-input textarea-input code-input ${validationError ? 'input-error' : ''}`}
                    value={inputData.value}
                    onChange={(e) => {
                      setValidationError(null);
                      onInputChange({ ...inputData, value: e.target.value });
                    }}
                    placeholder={activeTab?.placeholder}
                    disabled={scanning}
                    rows={8}
                    aria-label="Code snippet to analyse"
                    aria-invalid={!!validationError}
                    aria-describedby={validationError ? 'input-error-msg' : undefined}
                    spellCheck={false}
                  />
                </>
              ) : (
                <textarea
                  className={`text-input textarea-input ${validationError ? 'input-error' : ''}`}
                  value={inputData.value}
                  onChange={(e) => {
                    setValidationError(null);
                    onInputChange({ ...inputData, value: e.target.value });
                  }}
                  placeholder={activeTab?.placeholder}
                  disabled={scanning}
                  rows={6}
                  aria-label="Text to analyse"
                  aria-invalid={!!validationError}
                  aria-describedby={validationError ? 'input-error-msg' : undefined}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {/* ── Animated validation error ────────────────────────────── */}
          <AnimatePresence>
            {validationError && (
              <motion.p
                id="input-error-msg"
                className="input-error-msg"
                role="alert"
                aria-live="assertive"
                initial={{ opacity: 0, height: 0, y: -4 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }}
              >
                ⚠ {validationError}
              </motion.p>
            )}
          </AnimatePresence>

          {/* ── Date range filter (URL/text only) ────────────────────── */}
          {inputData.type !== 'code' && inputData.type !== 'file' && (
          <div className="date-range-row" role="group" aria-label="Optional date range filter">
            <span className="date-label" aria-hidden="true">📅 Date range <span className="optional-tag">(optional)</span></span>
            <div className="date-inputs">
              <label className="sr-only" htmlFor="date-from">From date</label>
              <input
                id="date-from"
                type="date"
                className="date-input"
                value={inputData.dateFrom}
                onChange={(e) => onInputChange({ ...inputData, dateFrom: e.target.value })}
                disabled={scanning}
                aria-label="Start date"
              />
              <span className="date-sep" aria-hidden="true">–</span>
              <label className="sr-only" htmlFor="date-to">To date</label>
              <input
                id="date-to"
                type="date"
                className="date-input"
                value={inputData.dateTo}
                onChange={(e) => onInputChange({ ...inputData, dateTo: e.target.value })}
                disabled={scanning}
                aria-label="End date"
              />
            </div>
          </div>
          )}
        </div>

        {/* ── Footer actions ───────────────────────────────────────────── */}
        <div className="input-footer">
          {scanPhase !== 'idle' && (
            <button
              className="btn-reset"
              onClick={onReset}
              type="button"
              aria-label="Reset and start a new scan"
            >
              ↺ Reset
            </button>
          )}

          <motion.button
            className={`btn-scan ${scanning ? 'scanning' : ''}`}
            onClick={handleScan}
            disabled={scanning}
            type="button"
            aria-label={scanning ? 'Scanning in progress…' : 'Start analysis'}
            aria-busy={scanning}
            whileHover={!scanning ? { scale: 1.03 } : {}}
            whileTap={!scanning ? { scale: 0.97 } : {}}
          >
            {scanning ? (
              <span className="scan-spinner" aria-hidden="true">
                <span className="spinner-ring" /> Scanning…
              </span>
            ) : '🔍 Analyze'}
          </motion.button>
        </div>
      </div>
    </motion.section>
  );
}
