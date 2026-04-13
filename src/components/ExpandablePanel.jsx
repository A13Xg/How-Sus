/**
 * ExpandablePanel - Reusable animated collapsible/expandable section.
 *
 * Props:
 *   title       {string}           - Heading text
 *   children    {React.ReactNode}  - Content inside the panel
 *   defaultOpen {boolean}          - Start expanded (default: false)
 *   badge       {string|number}    - Optional badge next to the title (e.g. count)
 *   icon        {string}           - Optional emoji/icon prefix
 *   id          {string}           - Base id for aria-controls linkage
 */
import React, { useState, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './ExpandablePanel.css';

export default function ExpandablePanel({
  title,
  children,
  defaultOpen = false,
  badge,
  icon,
  id: idProp,
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  // Fall back to React's built-in useId for aria linkage when no id is given
  const uid = useId();
  const panelId = idProp ? `ep-${idProp}` : `ep-${uid}`;

  return (
    <div className="expandable-panel">
      {/* Toggle button -------------------------------------------------- */}
      <button
        type="button"
        className={`expandable-header ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <span className="expandable-title">
          {icon && <span className="expandable-icon" aria-hidden="true">{icon}</span>}
          {title}
          {badge !== undefined && (
            <span className="expandable-badge" aria-label={`${badge} items`}>{badge}</span>
          )}
        </span>

        {/* Chevron rotates 180° when open */}
        <motion.span
          className="expandable-chevron"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          ▾
        </motion.span>
      </button>

      {/* Animated content area ------------------------------------------ */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={panelId}
            className="expandable-content"
            role="region"
            aria-label={title}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="expandable-inner">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
