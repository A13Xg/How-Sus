/**
 * VisualizationSection - Real-time animated scanning feedback panel.
 *
 * Shows while scanPhase is 'scanning' or 'complete'.
 *
 * Features:
 *  - AnimatedProgressBar with leading glow
 *  - Step indicator grid (each step fades in as it completes)
 *  - Skeleton placeholders for NetworkGraph and TimelineGraph while scanning
 *  - Smooth transition to actual data once scan completes
 *  - All heavy sub-components (NetworkGraph, TimelineGraph) are lazy-loaded
 *    via React.lazy so they don't block the initial bundle.
 *
 * Props:
 *   scanPhase   {string}  - 'scanning' | 'complete' | 'error'
 *   progress    {number}  - 0-100
 *   currentStep {string}  - current step label
 *   inputType   {string}  - 'url'|'text'|'image'
 *   results     {object}  - scanResults (null while scanning)
 */
import React, { Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AnimatedProgressBar from './AnimatedProgressBar';
import './VisualizationSection.css';

// Lazy-load heavy canvas components to keep initial bundle small
const NetworkGraph = lazy(() => import('./NetworkGraph'));
const TimelineGraph = lazy(() => import('./TimelineGraph'));

const SCAN_STEPS = [
  { id: 'init',      label: 'Engine Init',     icon: '⚙'  },
  { id: 'meta',      label: 'Metadata',        icon: '📋' },
  { id: 'domain',    label: 'Domain Check',    icon: '🌐' },
  { id: 'content',   label: 'Content Scan',    icon: '🔎' },
  { id: 'duplicate', label: 'Dupe Detection',  icon: '🔁' },
  { id: 'timeline',  label: 'Timeline',        icon: '📅' },
  { id: 'ai',        label: 'AI Analysis',     icon: '🤖' },
  { id: 'compile',   label: 'Compiling',       icon: '✅' },
];

/** Skeleton block for loading placeholders */
function Skeleton({ height = 20, width = '100%', rounded = false, style = {} }) {
  return (
    <div
      className={`skeleton ${rounded ? 'skeleton-circle' : ''}`}
      style={{ height, width, ...style }}
      aria-hidden="true"
    />
  );
}

/** Placeholder shown inside the sub-cards while still scanning */
function SubCardSkeleton({ rows = 4 }) {
  return (
    <div className="skeleton-group">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={14} width={`${75 + Math.random() * 20}%`} style={{ marginBottom: 8 }} />
      ))}
    </div>
  );
}

export default function VisualizationSection({ scanPhase, progress, currentStep, inputType, results }) {
  const completedSteps = Math.floor((progress / 100) * SCAN_STEPS.length);
  const isScanning = scanPhase === 'scanning';
  const isComplete = scanPhase === 'complete';

  const showDuplicates = !isScanning && results?.duplicates?.length > 0;
  const showTimeline   = !isScanning && results?.timeline?.length > 0;

  return (
    <motion.section
      className="viz-section"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      aria-label="Scan progress and visualisation"
      aria-live="polite"
    >
      <div className="viz-card">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="viz-header">
          <h2 className="viz-title">
            {isScanning ? (
              <><span className="pulse-dot" aria-hidden="true" /> Scanning…</>
            ) : (
              <><span className="done-dot" aria-hidden="true" /> Analysis Complete</>
            )}
          </h2>
          <span className="viz-progress-text" aria-label={`${progress}% complete`}>{progress}%</span>
        </div>

        {/* ── Progress bar ─────────────────────────────────────────── */}
        <AnimatedProgressBar
          value={progress}
          size="md"
          glowing={isScanning}
          label="Scan progress"
          className="viz-progress-bar"
        />

        {/* ── Current step label ───────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {isScanning && currentStep && (
            <motion.p
              key={currentStep}
              className="current-step"
              aria-live="polite"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.25 }}
            >
              {currentStep}
            </motion.p>
          )}
        </AnimatePresence>

        {/* ── Step grid ────────────────────────────────────────────── */}
        <div className="steps-grid" role="list" aria-label="Scan steps">
          {SCAN_STEPS.map((step, i) => {
            const state = i < completedSteps ? 'done' : i === completedSteps ? 'active' : 'pending';
            return (
              <motion.div
                key={step.id}
                className={`step-item ${state}`}
                role="listitem"
                aria-label={`${step.label}: ${state}`}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.055 }}
              >
                <span className="step-icon" aria-hidden="true">{step.icon}</span>
                <span className="step-label">{step.label}</span>
                <span className="step-status" aria-hidden="true">
                  {state === 'done' ? '✓' : state === 'active' ? '…' : ''}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* ── Network graph + Timeline (shown after scan) ──────────── */}
        <AnimatePresence>
          {(isScanning || isComplete) && (
            <motion.div
              className="viz-results-preview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: isComplete ? 0.2 : 0 }}
            >
              {/* Duplicate network */}
              <div className="viz-sub-card">
                <h3>Duplicate Detection Network</h3>
                {isScanning || !showDuplicates ? (
                  <SubCardSkeleton rows={5} />
                ) : (
                  <Suspense fallback={<SubCardSkeleton rows={5} />}>
                    <NetworkGraph duplicates={results.duplicates} />
                    <p className="viz-sub-note">
                      {results.duplicates.length} similar source{results.duplicates.length !== 1 ? 's' : ''} found
                    </p>
                  </Suspense>
                )}
              </div>

              {/* Verification timeline — hidden for image type (no timeline data) */}
              {inputType !== 'image' && (
                <div className="viz-sub-card">
                  <h3>Verification Timeline</h3>
                  {isScanning || !showTimeline ? (
                    <SubCardSkeleton rows={4} />
                  ) : (
                    <Suspense fallback={<SubCardSkeleton rows={4} />}>
                      <TimelineGraph events={results.timeline} />
                    </Suspense>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
