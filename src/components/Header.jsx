import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './Header.css';

export default function Header({ apiKey, onApiKeyChange }) {
  const [showApiInput, setShowApiInput] = useState(false);
  const [tempKey, setTempKey] = useState('');

  const handleSave = () => {
    onApiKeyChange(tempKey);
    setShowApiInput(false);
  };

  return (
    <header className="header">
      <div className="header-inner">
        <motion.div
          className="logo-area"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="logo-icon">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
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
            <p>News & Media Authenticity Analyzer</p>
          </div>
        </motion.div>

        <motion.div
          className="header-actions"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="api-key-area">
            <button
              className={`api-key-btn ${apiKey ? 'has-key' : ''}`}
              onClick={() => { setShowApiInput(!showApiInput); setTempKey(apiKey); }}
              title="Configure AI API Key (OpenAI)"
            >
              <span className="api-dot" />
              {apiKey ? 'AI On' : 'AI Key'}
            </button>
            <AnimatePresence>
              {showApiInput && (
                <motion.div
                  className="api-key-dropdown"
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <p className="api-key-label">OpenAI API Key <span>(session only)</span></p>
                  <input
                    type="password"
                    value={tempKey}
                    onChange={e => setTempKey(e.target.value)}
                    placeholder="sk-..."
                    className="api-key-input"
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    autoFocus
                  />
                  <div className="api-key-actions">
                    <button className="btn-save" onClick={handleSave}>Save</button>
                    {apiKey && <button className="btn-clear" onClick={() => { onApiKeyChange(''); setShowApiInput(false); }}>Clear</button>}
                  </div>
                  <p className="api-key-note">Key stored in memory only. Not sent anywhere except OpenAI.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </header>
  );
}
