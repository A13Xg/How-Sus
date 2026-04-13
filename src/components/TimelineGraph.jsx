/**
 * TimelineGraph - Animated vertical timeline for news verification events.
 *
 * Each event fades in sequentially (staggered delay), and its dot pulses
 * subtly to draw attention after it appears.
 *
 * Props:
 *   events {Array<{label, detail, time}>} - ordered list of timeline events
 */
import React from 'react';
import { motion } from 'framer-motion';
import './TimelineGraph.css';

export default function TimelineGraph({ events = [] }) {
  if (!events.length) return null;

  return (
    <ol className="tg-list" aria-label="Verification timeline">
      {events.map((ev, i) => (
        <motion.li
          key={i}
          className="tg-item"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.16, duration: 0.38 }}
        >
          {/* Dot with a repeat-pulse after it fades in */}
          <div className="tg-dot-col" aria-hidden="true">
            <motion.span
              className="tg-dot"
              animate={{
                scale: [1, 1.45, 1],
                opacity: [1, 0.65, 1],
              }}
              transition={{
                delay: i * 0.16 + 0.5,
                duration: 1.1,
                repeat: Infinity,
                repeatDelay: 3.5,
              }}
            />
            {/* Connector line below dot (hidden for last item) */}
            {i < events.length - 1 && <span className="tg-line" />}
          </div>

          <div className="tg-body">
            <p className="tg-label">{ev.label}</p>
            <p className="tg-detail">{ev.detail}</p>
            <time className="tg-time">{ev.time}</time>
          </div>
        </motion.li>
      ))}
    </ol>
  );
}
