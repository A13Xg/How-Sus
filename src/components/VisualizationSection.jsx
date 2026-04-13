import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import './VisualizationSection.css';

const SCAN_STEPS = [
  { id: 'init', label: 'Engine Init', icon: '⚙' },
  { id: 'meta', label: 'Metadata', icon: '📋' },
  { id: 'domain', label: 'Domain Check', icon: '🌐' },
  { id: 'content', label: 'Content Analysis', icon: '🔎' },
  { id: 'duplicate', label: 'Dupe Detection', icon: '🔁' },
  { id: 'timeline', label: 'Timeline', icon: '📅' },
  { id: 'ai', label: 'AI Analysis', icon: '🤖' },
  { id: 'compile', label: 'Compiling', icon: '✅' },
];

function NetworkGraph({ duplicates }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !duplicates?.length) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    const nodes = [
      { x: W / 2, y: H / 2, label: 'Source', r: 18, color: '#3b82f6', main: true },
      ...duplicates.slice(0, 6).map((d, i) => {
        const angle = (i / Math.min(duplicates.length, 6)) * Math.PI * 2 - Math.PI / 2;
        const dist = 80 + Math.random() * 30;
        return {
          x: W / 2 + Math.cos(angle) * dist,
          y: H / 2 + Math.sin(angle) * dist,
          label: d.source,
          r: 10,
          color: d.similarity > 80 ? '#ef4444' : d.similarity > 65 ? '#f59e0b' : '#10b981',
          similarity: d.similarity,
        };
      }),
    ];

    let frame;
    let t = 0;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      t += 0.02;

      nodes.slice(1).forEach((node, i) => {
        const pulseR = node.r + Math.sin(t + i) * 2;
        ctx.beginPath();
        ctx.moveTo(nodes[0].x, nodes[0].y);
        ctx.lineTo(node.x, node.y);
        ctx.strokeStyle = node.color + '55';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(node.x, node.y, pulseR + 4, 0, Math.PI * 2);
        ctx.fillStyle = node.color + '22';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(node.x, node.y, pulseR, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();

        ctx.fillStyle = '#f1f5f9';
        ctx.font = '9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + pulseR + 12);
        ctx.fillText(node.similarity + '%', node.x, node.y + pulseR + 22);
      });

      const mainPulse = nodes[0].r + Math.sin(t * 2) * 3;
      ctx.beginPath();
      ctx.arc(nodes[0].x, nodes[0].y, mainPulse + 6, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82f622';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(nodes[0].x, nodes[0].y, mainPulse, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82f6';
      ctx.fill();

      ctx.fillStyle = 'white';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SRC', nodes[0].x, nodes[0].y);
      ctx.textBaseline = 'alphabetic';

      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [duplicates]);

  return <canvas ref={canvasRef} width={280} height={220} className="network-canvas" />;
}

export default function VisualizationSection({ scanPhase, progress, currentStep, inputType, results }) {
  const completedSteps = Math.floor((progress / 100) * SCAN_STEPS.length);

  return (
    <motion.section
      className="viz-section"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
    >
      <div className="viz-card">
        <div className="viz-header">
          <h2 className="viz-title">
            {scanPhase === 'scanning' ? (
              <><span className="pulse-dot" /> Scanning...</>
            ) : (
              <><span className="done-dot" /> Analysis Complete</>
            )}
          </h2>
          <span className="viz-progress-text">{progress}%</span>
        </div>

        <div className="main-progress-bar">
          <motion.div
            className="main-progress-fill"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
          <div className="progress-glow" style={{ left: `${progress}%` }} />
        </div>

        {currentStep && scanPhase === 'scanning' && (
          <motion.p
            key={currentStep}
            className="current-step"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            {currentStep}
          </motion.p>
        )}

        <div className="steps-grid">
          {SCAN_STEPS.map((step, i) => (
            <motion.div
              key={step.id}
              className={`step-item ${i < completedSteps ? 'done' : i === completedSteps ? 'active' : 'pending'}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.06 }}
            >
              <span className="step-icon">{step.icon}</span>
              <span className="step-label">{step.label}</span>
              <span className="step-status">
                {i < completedSteps ? '✓' : i === completedSteps ? '…' : ''}
              </span>
            </motion.div>
          ))}
        </div>

        {scanPhase === 'complete' && results && (
          <motion.div
            className="viz-results-preview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {results.duplicates?.length > 0 && (
              <div className="viz-sub-card">
                <h3>Duplicate Detection Network</h3>
                <NetworkGraph duplicates={results.duplicates} />
                <p className="viz-sub-note">{results.duplicates.length} similar sources found</p>
              </div>
            )}
            {results.timeline?.length > 0 && (
              <div className="viz-sub-card">
                <h3>Verification Timeline</h3>
                <div className="timeline">
                  {results.timeline.map((ev, i) => (
                    <motion.div
                      key={i}
                      className="timeline-item"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 * i }}
                    >
                      <div className="timeline-dot" />
                      <div className="timeline-content">
                        <p className="timeline-label">{ev.label}</p>
                        <p className="timeline-detail">{ev.detail}</p>
                        <p className="timeline-time">{ev.time}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.section>
  );
}
