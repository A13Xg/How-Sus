/**
 * main.jsx — Application entry point.
 *
 * Mounts the React tree into #root with:
 *  - StrictMode    : double-invokes lifecycle hooks in development to surface
 *                    side-effect bugs early; has no effect in production.
 *  - ErrorBoundary : class-based boundary that catches unhandled render errors
 *                    across the entire tree and shows a user-friendly fallback
 *                    instead of a completely blank page.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './components/ErrorBoundary.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Wrap the entire app so any unhandled render error shows a recovery UI */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
