/**
 * ErrorBoundary.jsx — React class-based error boundary.
 *
 * Catches unhandled render/lifecycle errors anywhere in the wrapped subtree
 * and displays a user-friendly fallback instead of a blank page.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 *
 * Props:
 *   children    {ReactNode}  — subtree to protect
 *   fallback    {ReactNode}  — optional custom fallback UI
 *
 * State:
 *   hasError    {boolean}    — true once an error has been caught
 *   errorMsg    {string}     — human-readable error message shown to the user
 */
import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    /** @type {{ hasError: boolean, errorMsg: string }} */
    this.state = { hasError: false, errorMsg: '' };
  }

  /**
   * Static lifecycle: called when a descendant throws during rendering.
   * Maps the error to state so `render()` can show the fallback.
   *
   * @param {Error} error - the thrown error
   * @returns {{ hasError: boolean, errorMsg: string }}
   */
  static getDerivedStateFromError(error) {
    return { hasError: true, errorMsg: error?.message ?? 'An unexpected error occurred.' };
  }

  /**
   * Lifecycle: called after the error has been caught.
   * Ideal for logging to an external service (not used here — GitHub Pages only).
   *
   * @param {Error}            error - the caught error
   * @param {React.ErrorInfo}  info  - component stack trace info
   */
  componentDidCatch(error, info) {
    // In a production environment with a backend, send these details to an
    // error tracking service (e.g. Sentry). For GitHub Pages (no backend) we
    // log to the browser console only.
    console.error('[HowSus ErrorBoundary]', error, info.componentStack);
  }

  /** Reset the boundary so the user can try again without a full page reload. */
  handleReset = () => {
    this.setState({ hasError: false, errorMsg: '' });
  };

  render() {
    if (this.state.hasError) {
      // Prefer a custom fallback if the parent provided one
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="error-boundary-fallback" role="alert">
          <div className="error-boundary-card">
            <span className="error-boundary-icon" aria-hidden="true">⚠</span>
            <h2>Something went wrong</h2>
            <p className="error-boundary-msg">{this.state.errorMsg}</p>
            <p className="error-boundary-hint">
              Try resetting the page. If the issue persists, please&nbsp;
              <a
                href="https://github.com/A13Xg/How-Sus/issues"
                target="_blank"
                rel="noopener noreferrer"
              >
                open an issue
              </a>
              .
            </p>
            <button
              type="button"
              className="btn-scan"
              onClick={this.handleReset}
            >
              ↺ Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
