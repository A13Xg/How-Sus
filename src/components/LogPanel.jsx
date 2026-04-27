/**
 * LogPanel — Fixed bottom terminal showing live application logs.
 *
 * Collapsed: 48px strip showing last log entry with expand button.
 * Expanded: 20vh scrollable list of all entries.
 */
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logger from '../lib/logger.js';
import './LogPanel.css';

const LEVEL_COLORS = {
  DEBUG: '#6b7280',
  INFO:  '#06b6d4',
  WARN:  '#f59e0b',
  ERROR: '#ef4444',
};

function formatTime(iso) {
  const d = new Date(iso);
  return d.toTimeString().slice(0, 8);
}

export default function LogPanel({ visible = true }) {
  const [logs, setLogs] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [hasAlert, setHasAlert] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    return logger.subscribe((newLogs) => {
      setLogs(newLogs);
      const last = newLogs[0];
      if (last && (last.level === 'WARN' || last.level === 'ERROR')) {
        setHasAlert(true);
        const t = setTimeout(() => setHasAlert(false), 5000);
        return () => clearTimeout(t);
      }
    });
  }, []);

  // Auto-scroll to bottom (newest) when expanded and new log arrives
  useEffect(() => {
    if (expanded && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [logs, expanded]);

  const lastLog = logs[0];

  if (!visible) return null;

  return (
    <div className="log-panel" aria-label="Application log terminal">
      {/* ── Collapsed / header bar ── */}
      <div
        className="log-bar"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse log panel' : 'Expand log panel'}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded((v) => !v); }}
      >
        <span className="log-bar-left">
          <span className="log-term-label">LOG</span>
          {hasAlert && <span className="log-alert-dot" aria-hidden="true" />}
          {lastLog ? (
            <>
              <span className="log-level-badge" style={{ color: LEVEL_COLORS[lastLog.level] }}>
                {lastLog.level}
              </span>
              <span className="log-last-msg" style={{ color: LEVEL_COLORS[lastLog.level] }}>
                {lastLog.message}
              </span>
            </>
          ) : (
            <span className="log-last-msg" style={{ color: '#6b7280' }}>No log entries yet</span>
          )}
        </span>
        <span className="log-bar-right">
          <button
            type="button"
            className="log-expand-btn"
            aria-label={expanded ? 'Collapse' : 'Expand'}
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          >
            {expanded ? '▾' : '▴'}
          </button>
        </span>
      </div>

      {/* ── Expanded list ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            className="log-expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: '20vh', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
          >
            <div className="log-toolbar">
              <span className="log-count">{logs.length} entries</span>
              <button
                type="button"
                className="log-clear-btn"
                onClick={(e) => { e.stopPropagation(); logger.clear(); }}
              >
                Clear
              </button>
            </div>
            <div className="log-list" ref={listRef} role="log" aria-live="polite">
              {[...logs].reverse().map((entry) => (
                <div key={entry.id} className="log-entry">
                  <span className="log-time">{formatTime(entry.timestamp)}</span>
                  <span className="log-level" style={{ color: LEVEL_COLORS[entry.level] }}>
                    {entry.level}
                  </span>
                  <span className="log-msg">{entry.message}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
