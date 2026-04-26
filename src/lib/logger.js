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
  else console.log('[HowSus:' + level + ']', message, data ?? '');
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
};

export { LOG_LEVELS };
export default logger;
