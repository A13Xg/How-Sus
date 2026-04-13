/**
 * AnimatedProgressBar - Reusable animated progress bar with state-aware colours.
 *
 * Smoothly transitions between values using Framer Motion.
 * Supports error / paused / warning states with distinct colours and a glow
 * effect at the leading edge.
 *
 * Props:
 *   value     {number}                           - 0-100
 *   color     {string}                           - CSS colour override
 *   showLabel {boolean}                          - Show % text (default false)
 *   size      {'sm'|'md'|'lg'}                   - Track height (default 'md')
 *   glowing   {boolean}                          - Leading-edge glow (default true)
 *   state     {'error'|'warning'|'paused'|null}  - Special state
 *   label     {string}                           - aria-label text
 *   className {string}                           - Extra class names
 */
import React from 'react';
import { motion } from 'framer-motion';
import './AnimatedProgressBar.css';

const STATE_COLORS = {
  error: '#ef4444',
  warning: '#f59e0b',
  paused: '#94a3b8',
};

export default function AnimatedProgressBar({
  value = 0,
  color,
  showLabel = false,
  size = 'md',
  glowing = true,
  state = null,
  label = '',
  className = '',
}) {
  const clamped = Math.max(0, Math.min(100, value));

  // Determine bar colour: explicit prop > state colour > default gradient
  const isGradient = !color && !state;
  const barStyle = isGradient
    ? { background: 'var(--gradient-cyan)' }
    : { background: state ? STATE_COLORS[state] : color };

  const glowColor = state ? STATE_COLORS[state] : 'var(--accent-cyan)';

  return (
    <div
      className={`apb-container apb-${size} ${className}`}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label || `Progress: ${clamped}%`}
    >
      <div className="apb-track">
        {/* Filled bar - animates width smoothly */}
        <motion.div
          className="apb-fill"
          style={barStyle}
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />

        {/* Leading-edge glow dot */}
        {glowing && clamped > 0 && clamped < 100 && (
          <motion.div
            className="apb-glow"
            style={{ background: glowColor, boxShadow: `0 0 8px 2px ${glowColor}` }}
            animate={{ left: `${clamped}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        )}
      </div>

      {showLabel && (
        <span className="apb-label" aria-hidden="true">
          {clamped}%
        </span>
      )}
    </div>
  );
}
