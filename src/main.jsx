/**
 * main.jsx — Application entry point.
 *
 * Mounts the React tree into #root with:
 *  - StrictMode    : double-invokes lifecycle hooks in development to surface
 *                    side-effect bugs early; has no effect in production.
 *  - ErrorBoundary : class-based boundary that catches unhandled render errors
 *                    across the entire tree and shows a user-friendly fallback
 *                    instead of a completely blank page.
 *
 * Global error handlers are registered before mounting so any uncaught
 * exceptions or promise rejections are captured in the log panel.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './components/ErrorBoundary.css'
import logger from './lib/logger.js'

/**
 * __APP_VERSION__ is a compile-time constant injected by Vite via the
 * `define` option in vite.config.js. It is replaced with the `version`
 * field from package.json during the build.
 * @see vite.config.js
 */
/* global __APP_VERSION__ */

// ── Global error capture ──────────────────────────────────────────────────────
// These handlers run before React has a chance to catch errors, so they are
// the last line of defence for unexpected exceptions.

window.addEventListener('error', (event) => {
  logger.error(`Uncaught error: ${event.message}`, {
    source: event.filename,
    line: event.lineno,
    col: event.colno,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error
    ? event.reason.message
    : String(event.reason ?? 'Unknown promise rejection');
  logger.error(`Unhandled promise rejection: ${reason}`);
});

// ── Startup log ───────────────────────────────────────────────────────────────
logger.info(`HowSus ${__APP_VERSION__} initializing…`);

// ── Mount ─────────────────────────────────────────────────────────────────────
try {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      {/* Wrap the entire app so any unhandled render error shows a recovery UI */}
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
  logger.info('React app mounted successfully');
} catch (err) {
  logger.error(`Failed to mount React app: ${err.message}`);
  throw err;
}
