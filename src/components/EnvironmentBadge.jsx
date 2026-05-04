/**
 * EnvironmentBadge - Shows a small indicator badge with hover tooltip explaining
 * which features are unavailable in the current runtime environment.
 *
 * In a GitHub Pages (static-only) environment, features like real reverse image
 * search, real-time fact-check APIs, and server-side storage are unavailable.
 * This component makes that transparent to users.
 */
import React, { useState } from 'react';
import './EnvironmentBadge.css';

// Detect runtime environment characteristics
function detectEnvironment() {
  const isLocalhost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
     window.location.hostname === '127.0.0.1');

  const isGitHubPages = typeof window !== 'undefined' &&
    window.location.hostname.endsWith('.github.io');

  const hasServiceWorker = 'serviceWorker' in navigator;
  const hasIndexedDB = 'indexedDB' in window;
  const isOnline = navigator.onLine;

  return {
    isLocalhost,
    isGitHubPages,
    isStaticHost: isGitHubPages || !isLocalhost,
    hasServiceWorker,
    hasIndexedDB,
    isOnline,
    label: isLocalhost ? 'Local Dev' : isGitHubPages ? 'GitHub Pages' : 'Web',
  };
}

const STATIC_ONLY_FEATURES = [
  {
    name: 'Reverse Image Search',
    unavailable: true,
    reason: 'Requires a server-side proxy to query image search APIs. Not available in static hosting environments.'
  },
  {
    name: 'Real-Time Fact-Check API',
    unavailable: true,
    reason: 'Live fact-check databases (ClaimBuster, Google Fact Check Tools) require server-side API keys for security. All analysis here is heuristic.'
  },
  {
    name: 'Domain WHOIS Lookup',
    unavailable: true,
    reason: 'WHOIS lookups require a server-side proxy due to browser CORS restrictions.'
  },
  {
    name: 'AI Analysis',
    unavailable: false,
    reason: 'Available with your own API key (OpenAI or Google Gemini). Your key is used only in your browser session.'
  },
  {
    name: 'EXIF Metadata',
    unavailable: false,
    reason: 'Extracted locally in your browser. No image data is sent to any server.'
  },
];

export default function EnvironmentBadge() {
  const [showTooltip, setShowTooltip] = useState(false);
  const env = detectEnvironment();

  const unavailableCount = STATIC_ONLY_FEATURES.filter(f => f.unavailable).length;

  return (
    <div className="env-badge-wrapper">
      <div
        className={`env-badge ${env.isStaticHost ? 'env-badge--static' : 'env-badge--local'}`}
        aria-label={`Runtime environment: ${env.label}`}
      >
        <span className="env-badge__dot" />
        <span className="env-badge__label">{env.label}</span>
        <button
          type="button"
          className="env-badge__help"
          aria-label="About feature availability"
          aria-expanded={showTooltip}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onFocus={() => setShowTooltip(true)}
          onBlur={() => setShowTooltip(false)}
        >
          ?
        </button>
      </div>

      {showTooltip && (
        <div className="env-tooltip" role="tooltip">
          <p className="env-tooltip__title">Runtime: <strong>{env.label}</strong></p>
          <p className="env-tooltip__desc">
            HowSus runs entirely in your browser.
            {env.isStaticHost
              ? ` ${unavailableCount} features require server infrastructure and are not available here.`
              : ' All features are available in this environment.'}
          </p>
          <ul className="env-tooltip__list">
            {STATIC_ONLY_FEATURES.map(f => (
              <li key={f.name} className={`env-tooltip__item ${f.unavailable ? 'env-tooltip__item--unavailable' : 'env-tooltip__item--available'}`}>
                <span className="env-tooltip__status">{f.unavailable ? '✗' : '✓'}</span>
                <span>
                  <strong>{f.name}</strong>
                  {f.unavailable && <span className="env-tooltip__reason"> — {f.reason}</span>}
                </span>
              </li>
            ))}
          </ul>
          {!env.isOnline && (
            <p className="env-tooltip__offline">⚠ You appear to be offline. Some features may be unavailable.</p>
          )}
        </div>
      )}
    </div>
  );
}
