/**
 * logger.js — Centralized logging singleton with circular buffer and subscriber system.
 */

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const MAX_ENTRIES = 200;

let _logs = [];
let _id = 0;
const _subscribers = new Set();

function _notify() {
  _subscribers.forEach((cb) => cb([..._logs]));
}

function _log(level, message, data) {
  const entry = {
    id: ++_id,
    timestamp: new Date().toISOString(),
    level,
    message,
    data: data !== undefined ? data : null,
  };
  _logs = [entry, ..._logs].slice(0, MAX_ENTRIES);
  _notify();

  if (level === 'ERROR') console.error('[HowSus:ERROR]', message, data ?? '');
  else if (level === 'WARN') console.warn('[HowSus:WARN]', message, data ?? '');
  else console.log(`[HowSus:${level}]`, message, data ?? '');
}

const logger = {
  debug: (message, data) => _log('DEBUG', message, data),
  info:  (message, data) => _log('INFO',  message, data),
  warn:  (message, data) => _log('WARN',  message, data),
  error: (message, data) => _log('ERROR', message, data),
  getLogs: () => [..._logs],
  clear: () => { _logs = []; _notify(); },
  subscribe: (cb) => {
    _subscribers.add(cb);
    cb([..._logs]);
    return () => _subscribers.delete(cb);
  },

  /** Log entry/exit of a named operation with timing. */
  group: async (name, fn) => {
    const start = performance.now();
    _log('DEBUG', `[group:start] ${name}`);
    try {
      const result = await fn();
      _log('DEBUG', `[group:end] ${name}`, { durationMs: (performance.now() - start).toFixed(1) });
      return result;
    } catch (err) {
      _log('ERROR', `[group:error] ${name}`, { durationMs: (performance.now() - start).toFixed(1), error: err?.message, stack: err?.stack });
      throw err;
    }
  },

  /** Start a named performance timer. */
  time: (label) => {
    if (typeof performance !== 'undefined') {
      performance.mark(`howsus:${label}:start`);
    }
    _log('DEBUG', `[timer:start] ${label}`);
  },

  /** End a named performance timer and log the duration. */
  timeEnd: (label) => {
    let durationMs = null;
    try {
      if (typeof performance !== 'undefined') {
        performance.mark(`howsus:${label}:end`);
        performance.measure(`howsus:${label}`, `howsus:${label}:start`, `howsus:${label}:end`);
        const entries = performance.getEntriesByName(`howsus:${label}`);
        if (entries.length) durationMs = entries[entries.length - 1].duration.toFixed(1);
      }
    } catch (err) { _log('DEBUG', `[timer:end:error] ${label}`, { error: err?.message }); }
    _log('DEBUG', `[timer:end] ${label}`, durationMs != null ? { durationMs } : undefined);
  },
};

export { LOG_LEVELS };
export default logger;
