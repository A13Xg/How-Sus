/**
 * ResultsPanel - Displays the final analysis results.
 *
 * Features:
 *  - Circular SVG authenticity score gauge with animated stroke
 *  - Source verification table with verified/unverified flags
 *  - Duplicate detection bars via AnimatedProgressBar
 *  - Optional AI analysis section (shown when apiKey was set)
 *  - Expandable detail panels for findings, EXIF, duplicates, AI, sources
 *  - Dark patterns detail panel (detected manipulation tactics with tips)
 *  - Sentiment word chips (positive/negative words highlighted)
 *  - Readability score bar (Flesch Reading Ease + stats grid — text type only)
 *  - "How to read this report" glossary panel for first-time users
 *  - Skeleton loader state while results prop is null (shows during brief lag)
 *  - Download buttons: PDF (jsPDF) and full HTML report with glow hover animation
 *  - Full ARIA labelling and keyboard navigation
 *
 * Props:
 *   results        {object}   - scanResults from App.jsx
 *   inputData      {object}   - { type, value, file, … }
 *   aiConfig       {object}   - { apiKey, provider, model } (session memory)
 *   confidenceScore{number}   - 0-100 signal confidence (computed by App)
 *   scanHistory    {Array}    - previous scan entries from localStorage
 *   onClearHistory {function} - clears the scan history
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import jsPDF from 'jspdf';
import ExpandablePanel from './ExpandablePanel';
import AnimatedProgressBar from './AnimatedProgressBar';
import './ResultsPanel.css';

// ─── URL safety helper ────────────────────────────────────────────────────
// Only allow http/https URLs to prevent XSS via javascript: or data: schemes.
// Returns the URL parser's reconstructed href (not the original string) to
// ensure the value passed to href/src attributes is untainted.
function safeUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    // Return the canonicalised href from the URL object, not the raw input
    return parsed.href;
  } catch {
    return null;
  }
}

// ─── Score colour helper ───────────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 70) return '#10b981';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

function scoreLabel(score) {
  if (score >= 70) return 'Likely Authentic';
  if (score >= 40) return 'Uncertain';
  return 'Likely False';
}

function MetricDetailModal({ metric, onClose }) {
  if (!metric) return null;

  return (
    <div className="metric-modal-backdrop" role="presentation" onClick={onClose}>
      <motion.div
        className="metric-modal"
        role="dialog"
        aria-modal="true"
        aria-label={metric.title}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="metric-modal-head">
          <h3>{metric.title}</h3>
          <button type="button" className="metric-close" onClick={onClose} aria-label="Close metric details">✕</button>
        </div>
        {metric.value && <p className="metric-current"><strong>Current value:</strong> {metric.value}</p>}
        {metric.explanation && <p className="metric-body">{metric.explanation}</p>}
        {metric.signals?.length > 0 && (
          <ul className="metric-signals">
            {metric.signals.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        )}
        {metric.excerpt && (
          <div className="metric-excerpt-section">
            <p className="metric-section-label">📍 Evidence / Matched Content</p>
            <blockquote className="metric-excerpt">{metric.excerpt}</blockquote>
          </div>
        )}
        {metric.dataPath?.length > 0 && (
          <div className="metric-datapath-section">
            <p className="metric-section-label">🔗 How this was determined</p>
            <ol className="metric-datapath">
              {metric.dataPath.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          </div>
        )}
        {metric.searchUrl && (
          <a
            href={safeUrl(metric.searchUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="metric-search-link"
          >
            🔍 Search this claim
          </a>
        )}
      </motion.div>
    </div>
  );
}

// ─── Circular gauge ────────────────────────────────────────────────────────
function ScoreGauge({ score, onDetails }) {
  const R = 54;
  const circ = 2 * Math.PI * R;
  const offset = circ - (score / 100) * circ;
  const color = scoreColor(score);

  return (
    <div className="score-gauge" aria-label={`Authenticity score: ${score} out of 100 — ${scoreLabel(score)}`}>
      <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden="true">
        {/* Track */}
        <circle cx="70" cy="70" r={R} fill="none" stroke="#1e2d4a" strokeWidth="12" />
        {/* Animated arc */}
        <motion.circle
          cx="70" cy="70" r={R}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.3, ease: 'easeOut' }}
          transform="rotate(-90 70 70)"
        />
        {/* Score number */}
        <motion.text
          x="70" y="66"
          textAnchor="middle"
          fill={color}
          fontSize="26"
          fontWeight="800"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          {score}
        </motion.text>
        <text x="70" y="82" textAnchor="middle" fill="#94a3b8" fontSize="11">/ 100</text>
      </svg>
      <motion.p
        className="score-label"
        style={{ color }}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
      >
        {scoreLabel(score)}
      </motion.p>
      <button type="button" className="metric-info-btn" onClick={onDetails} aria-label="Explain authenticity score">
        Details
      </button>
    </div>
  );
}

// ─── Finding row ───────────────────────────────────────────────────────────
const STATUS_COLOR = { good: '#10b981', bad: '#ef4444', warn: '#f59e0b', info: '#3b82f6' };
const STATUS_ICON  = { good: '✓', bad: '✗', warn: '⚠', info: 'ℹ' };

function FindingRow({ finding, index, onDetails }) {
  const color = STATUS_COLOR[finding.status] || '#94a3b8';
  const icon  = STATUS_ICON[finding.status]  || '•';
  return (
    <motion.div
      className="finding-row"
      initial={{ opacity: 0, x: -15 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.055 }}
      role="row"
    >
      <span className="finding-status" style={{ color }} aria-label={finding.status} role="cell">
        {icon}
      </span>
      <span className="finding-label" role="cell">
        {finding.label}
        <button type="button" className="metric-info-btn" onClick={onDetails} aria-label={`Explain ${finding.label}`}>
          Details
        </button>
      </span>
      <span className="finding-value" style={{ color }} role="cell">{finding.value}</span>
    </motion.div>
  );
}

// ─── Source row ────────────────────────────────────────────────────────────
function SourceRow({ source, index, onDetails }) {
  const verified = source.verified;
  return (
    <motion.tr
      className="source-row"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.07 }}
    >
      <td className="source-label">
        {source.label}
        <button type="button" className="metric-info-btn source-info-btn" onClick={onDetails} aria-label={`Explain source ${source.label}`}>
          Details
        </button>
      </td>
      <td>
        <span className={`source-badge ${verified === true ? 'verified' : verified === false ? 'unverified' : 'neutral'}`}>
          {verified === true ? '✓ Verified' : verified === false ? '✗ Not verified' : '— N/A'}
        </span>
      </td>
      <td className="source-date">{source.date || '—'}</td>
    </motion.tr>
  );
}

function metricDetailsFromSummary(item, results, inputData) {
  const details = {
    title: item.key,
    value: item.val,
    explanation: 'This metric summarizes key signals used in the authenticity score.',
    signals: [],
  };

  if (item.key === 'Input type') {
    details.explanation = 'This selects which analysis pipeline was used: URL checks, text heuristics, or EXIF metadata extraction.';
    details.signals = [`Input mode: ${results.type}`, `Original value preview: ${(inputData.value || inputData.file?.name || 'N/A').slice(0, 80)}`];
  }
  if (item.key === 'Domain') {
    details.explanation = 'Domain is normalized from the URL and checked against trusted and suspicious patterns.';
    details.signals = [
      `Trusted list match: ${results.isTrusted ? 'Yes' : 'No'}`,
      `Suspicious pattern match: ${results.isSuspicious ? 'Yes' : 'No'}`,
      `HTTPS: ${results.hasHttps ? 'Enabled' : 'Missing'}`,
    ];
  }
  if (item.key === 'Words') {
    details.explanation = 'Word count affects confidence. Extremely short text has less context and is less reliable for analysis.';
    details.signals = [`Word count: ${results.wordCount}`, `Average word length: ${results.avgWordLen || 'N/A'}`];
  }
  if (item.key === 'EXIF fields') {
    details.explanation = 'EXIF presence helps estimate provenance. More metadata typically means better traceability.';
    details.signals = [`Extracted EXIF fields: ${results.exifCount}`, `Camera metadata present: ${results.imageAnalysis?.metadata?.camera ? 'Yes' : 'No'}`];
  }
  if (item.key === 'Similar sources') {
    details.explanation = 'Potential duplicates are detected with heuristic similarity scoring and listed with per-source percentages.';
    details.signals = (results.duplicates || []).slice(0, 4).map((d) => `${d.source ?? d.url}: ${d.matchPercentage ?? d.similarity}%`);
  }
  if (item.key === 'Consistency') {
    details.explanation = 'Cross-source consistency compares corroborating vs conflicting external signals for the detected claims.';
    details.signals = [
      `Corroborating sources: ${results.crossCheck?.corroboratingCount ?? 0}`,
      `Conflicting sources: ${results.crossCheck?.conflictingCount ?? 0}`,
      `Method: ${results.crossCheck?.methodology || 'N/A'}`,
    ];
  }

  return details;
}

function metricDetailsFromFinding(finding, results) {
  return {
    title: finding.label,
    value: finding.value,
    explanation:
      finding.explanation ||
      `Status ${finding.status.toUpperCase()} was assigned by rule thresholds for ${finding.label.toLowerCase()}.`,
    signals: [
      `Current status: ${finding.status}`,
      `Overall authenticity score: ${results.authenticityScore}`,
      `Metric category: ${results.type}`,
    ],
  };
}

function metricDetailsFromSource(source) {
  return {
    title: `Source: ${source.label}`,
    value: source.url || 'N/A',
    explanation: 'Source verification status reflects trusted-domain matching and metadata confidence checks for this entry.',
    signals: [
      `Verification status: ${source.verified === true ? 'Verified' : source.verified === false ? 'Not verified' : 'N/A'}`,
      `Source URL: ${source.url || 'N/A'}`,
      `Recorded date: ${source.date || 'N/A'}`,
    ],
  };
}

function metricDetailsFromDuplicate(duplicate) {
  const pct = duplicate.matchPercentage ?? duplicate.similarity ?? 0;
  return {
    title: `Duplicate similarity: ${duplicate.source ?? duplicate.url}`,
    value: `${pct}%`,
    explanation: 'Similarity score is a heuristic match estimate for repeated content traces across channels.',
    signals: [
      `Similarity: ${pct}%`,
      `Source: ${duplicate.source ?? duplicate.url}`,
      `Observed date: ${duplicate.date || 'N/A'}`,
    ],
  };
}

function metricDetailsFromCrossCheck(entry, type, crossCheck) {
  const tierLabels = { 1: 'Tier 1 — Wire service / Public broadcaster', 2: 'Tier 2 — Major outlet', 3: 'Tier 3 — Unknown / Aggregator' };
  const signals = [
    `Claim: ${entry.claim}`,
    `Confidence: ${entry.confidence}%`,
    `Trust tier: ${tierLabels[entry.tier] || tierLabels[3]}`,
    `Methodology: ${crossCheck?.methodology || 'N/A'}`,
    `Note: ${entry.note || 'N/A'}`,
  ];
  if (entry.matchedText) signals.push(`Matched text: ${entry.matchedText}`);
  if (entry.evidence?.length) {
    entry.evidence.forEach((ev) => signals.push(`\u25b8 ${ev}`));
  }
  return {
    title: `${type === 'corroborating' ? '\u2705 Corroborating' : '\u26a0 Conflicting'} \u2014 ${entry.source}`,
    value: `${entry.confidence}% confidence`,
    explanation:
      type === 'corroborating'
        ? 'This source aligned with major claims from the scanned content based on signal analysis.'
        : 'This source diverged from major claims and may indicate contradictions or omitted context.',
    signals,
    searchUrl: entry.searchUrl || null,
  };
}

// ─── EXIF data section ─────────────────────────────────────────────────────
function ExifDetails({ exifData }) {
  const entries = Object.entries(exifData || {}).filter(([, v]) => v != null && typeof v !== 'object');
  if (!entries.length) return <p className="empty-note">No EXIF fields extracted.</p>;
  return (
    <div className="exif-grid">
      {entries.map(([k, v]) => (
        <div key={k} className="exif-row">
          <span className="exif-key">{k}</span>
          <span className="exif-value">{String(v).slice(0, 80)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Dark patterns panel ──────────────────────────────────────────────────

/**
 * Category-to-display-label mapping for the dark patterns panel.
 * These labels match the `category` field in detectDarkPatterns output.
 */
const DARK_PATTERN_CATEGORY_LABELS = {
  urgency:     'Urgency',
  fear:        'Fear Appeal',
  tribalism:   'Tribalism',
  conspiracy:  'Conspiracy',
  sensational: 'Sensational',
  clickbait:   'Clickbait',
};

/**
 * DarkPatternsPanel — shows each detected dark-pattern tactic with its
 * category badge, matched text snippet, and an educational tip.
 *
 * @param {{ darkPatterns: { detected: Array, matchCount: number, riskLevel: string } }} props
 */
function DarkPatternsPanel({ darkPatterns }) {
  if (!darkPatterns) return null;
  const { detected = [], matchCount } = darkPatterns;

  if (matchCount === 0) {
    return (
      <p className="dark-pattern-none">
        <span aria-hidden="true">✓</span> No manipulative framing patterns detected.
      </p>
    );
  }

  return (
    <ul className="dark-patterns-list" aria-label="Detected dark patterns">
      {detected.map((item, i) => (
        <li key={i} className="dark-pattern-item">
          <div className="dark-pattern-head">
            <span className="dark-pattern-label">{item.label}</span>
            {/* Category colour coding */}
            <span className={`dark-pattern-category ${item.category}`}>
              {DARK_PATTERN_CATEGORY_LABELS[item.category] ?? 'Other'}
            </span>
          </div>
          {/* The actual phrase that triggered the pattern match */}
          {item.match && (
            <p className="dark-pattern-match">
              Matched: &ldquo;{item.match}&rdquo;
            </p>
          )}
          {/* Educational context for each pattern */}
          <p className="dark-pattern-tip">{item.tip}</p>
        </li>
      ))}
    </ul>
  );
}

// ─── Sentiment word chips panel ───────────────────────────────────────────

/**
 * SentimentPanel — shows the sentiment score bar plus word-level chips
 * for the matched positive and negative vocabulary from AFINN scoring.
 *
 * @param {{ sentiment: object }} props
 *   sentiment: { label, normalizedScore, intensity, positiveWords, negativeWords }
 */
function SentimentPanel({ sentiment }) {
  if (!sentiment) return null;

  const { label, intensity, positiveWords = [], negativeWords = [] } = sentiment;

  // Derive a bar colour from the overall tone label
  const barColor =
    intensity > 60 ? '#ef4444' :
    intensity > 30 ? '#f59e0b' :
    '#10b981';

  return (
    <div className="sentiment-section">
      {/* Overall intensity progress bar */}
      <div className="sentiment-score-row">
        <span className="sentiment-label-key">Tone</span>
        <AnimatedProgressBar
          value={intensity}
          color={barColor}
          size="sm"
          showLabel
          label={`Emotional intensity: ${intensity}% — ${label}`}
        />
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      </div>

      {/* Positive matched words */}
      <div className="sentiment-row">
        <span className="sentiment-label-key">Positive</span>
        <div className="sentiment-chips">
          {positiveWords.length > 0 ? (
            positiveWords.map((w) => (
              <span key={w} className="sentiment-chip positive">{w}</span>
            ))
          ) : (
            <span className="sentiment-chip-empty">none detected</span>
          )}
        </div>
      </div>

      {/* Negative matched words */}
      <div className="sentiment-row">
        <span className="sentiment-label-key">Negative</span>
        <div className="sentiment-chips">
          {negativeWords.length > 0 ? (
            negativeWords.map((w) => (
              <span key={w} className="sentiment-chip negative">{w}</span>
            ))
          ) : (
            <span className="sentiment-chip-empty">none detected</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Readability visualization panel ─────────────────────────────────────

/**
 * ReadabilityPanel — displays a Flesch Reading Ease bar and a stats grid
 * (sentences, words, average sentence length, syllables/word).
 *
 * @param {{ readability: object }} props
 *   readability: { fleschEase, gradeLabel, sentenceCount, wordCount,
 *                  wordsPerSentence, syllablesPerWord }
 */
function ReadabilityPanel({ readability }) {
  if (!readability) return null;

  const { fleschEase, gradeLabel, sentenceCount, wordCount, wordsPerSentence, syllablesPerWord } = readability;

  // Colour the bar: green = easy, amber = moderate, red = hard
  const barColor =
    fleschEase >= 60 ? '#10b981' :
    fleschEase >= 30 ? '#f59e0b' :
    '#ef4444';

  return (
    <div className="readability-section">
      {/* Flesch Reading Ease bar (higher score = easier to read) */}
      <div className="readability-bar-row">
        <span className="sentiment-label-key">Reading ease</span>
        <AnimatedProgressBar
          value={fleschEase}
          color={barColor}
          size="sm"
          showLabel
          label={`Flesch Reading Ease: ${fleschEase}`}
        />
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'right' }}>
          {fleschEase} / 100
        </span>
      </div>

      {/* Human-readable grade label */}
      <p style={{ fontSize: '0.82rem', color: barColor, fontWeight: 600, margin: 0 }}>
        {gradeLabel}
      </p>

      {/* Detailed stats grid */}
      <div className="readability-stats-grid">
        {[
          { label: 'Sentences',       value: sentenceCount },
          { label: 'Words',           value: wordCount },
          { label: 'Avg words/sent.', value: wordsPerSentence },
          { label: 'Syllables/word',  value: syllablesPerWord },
        ].map((stat) => (
          <div key={stat.label} className="readability-stat">
            <span className="readability-stat-label">{stat.label}</span>
            <span className="readability-stat-value">{stat.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Glossary / help panel ────────────────────────────────────────────────

/**
 * Glossary definitions shown in the "How to read this report" panel.
 * Each entry has an emoji icon, a term, and a plain-language explanation.
 */
const GLOSSARY_ITEMS = [
  {
    icon: '🎯',
    term: 'Authenticity Score',
    desc: 'A 0-100 heuristic score. ≥70 = likely authentic; 40-69 = uncertain; <40 = likely false. It combines domain reputation, content signals, and cross-source consistency.',
  },
  {
    icon: '📡',
    term: 'Signal Confidence',
    desc: 'How much supporting evidence was gathered. High confidence means the score is backed by many signals (tier-1 sources, feed matches, AI). Low confidence means fewer data points.',
  },
  {
    icon: '🧭',
    term: 'Cross-Source Consistency',
    desc: 'Compares corroborating versus conflicting external source signals for the detected claims. Tier-1 (wire services) sources carry more weight.',
  },
  {
    icon: '🔁',
    term: 'Duplicate Detection',
    desc: 'Heuristic similarity scores for how widely the content has been shared or copied. High similarity (≥80%) across many channels can indicate viral misinformation.',
  },
  {
    icon: '🌀',
    term: 'Dark Patterns',
    desc: 'Linguistic tactics that bypass critical thinking: urgency, fear appeals, tribalism ("us vs them"), conspiracy framing, sensationalism, and clickbait.',
  },
  {
    icon: '😶',
    term: 'Sentiment / Emotional Tone',
    desc: 'AFINN-based scoring of emotional language. Extreme negativity or positivity can indicate manipulation. Neutral content tends to be more reliable.',
  },
  {
    icon: '📖',
    term: 'Reading Level',
    desc: 'Flesch Reading Ease (0-100). Higher = easier to read. Legitimate journalism typically scores 50-70. Very complex (< 30) or oversimplified text can be a signal.',
  },
  {
    icon: '📷',
    term: 'EXIF Metadata',
    desc: 'Camera and GPS data embedded in image files. Presence of capture date and camera model improves provenance confidence. Editing software in EXIF is a warning signal.',
  },
];

/**
 * GlossaryPanel — collapsible "How to read this report" help section.
 * Renders a grid of term cards explaining each metric used in the analysis.
 */
function GlossaryPanel() {
  return (
    <div className="glossary-grid" role="list" aria-label="Glossary of report metrics">
      {GLOSSARY_ITEMS.map((item) => (
        <div key={item.term} className="glossary-item" role="listitem">
          <h4>
            <span aria-hidden="true">{item.icon}</span>
            {item.term}
          </h4>
          <p>{item.desc}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Download helpers ──────────────────────────────────────────────────────

function buildPDF(results, inputData) {
  const doc = new jsPDF();
  const score = results.authenticityScore;
  const verdict = scoreLabel(score);
  const inputLabel = inputData.value?.slice(0, 80) || inputData.file?.name || 'N/A';

  let y = 16;
  const line = (text, size = 10, bold = false) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    if (y > 275) { doc.addPage(); y = 16; }
    doc.text(String(text), 15, y);
    y += size * 0.7 + 2;
  };

  line('HowSus — Authenticity Analysis Report', 15, true);
  line('');
  line(`Date: ${new Date().toLocaleString()}`);
  line(`Type: ${results.type.toUpperCase()}   Input: ${inputLabel}`);
  line('');
  line(`Authenticity Score: ${score}/100  (${verdict})`, 12, true);
  line('');
  line('FINDINGS:', 11, true);
  (results.findings || []).forEach((f) => line(`  [${(f.status || '').toUpperCase()}] ${f.label}: ${f.value}`));

  if (results.sources?.length) {
    line('');
    line('SOURCES:', 11, true);
    results.sources.forEach((s) => line(`  ${s.label} — ${s.verified === true ? 'Verified' : s.verified === false ? 'Not verified' : 'N/A'} (${s.date || '—'})`));
  }
  if (results.duplicates?.length) {
    line('');
    line('SIMILAR SOURCES:', 11, true);
    results.duplicates.forEach((d) => line(`  ${d.source ?? d.url} — ${d.matchPercentage ?? d.similarity}% similarity (${d.date})`));
  }
  if (results.crossCheck) {
    line('');
    line('CROSS-SOURCE CONSISTENCY:', 11, true);
    line(`  Score: ${results.crossCheck.consistencyScore}%`);
    line(`  Corroborating: ${results.crossCheck.corroboratingCount} | Conflicting: ${results.crossCheck.conflictingCount}`);
  }
  if (results.aiAnalysis) {
    line('');
    line('AI ANALYSIS:', 11, true);
    const summary = typeof results.aiAnalysis === 'object'
      ? `Confidence: ${results.aiAnalysis.confidence ?? 'N/A'}%\n${results.aiAnalysis.summary || ''}`
      : results.aiAnalysis;
    (summary.match(/.{1,90}/g) || []).forEach((l) => line('  ' + l));
  }
  line('');
  line('Generated by HowSus — howsus.github.io', 9);
  doc.save(`howsus-report-${Date.now()}.pdf`);
}

function buildHTML(results, inputData) {
  const score = results.authenticityScore;
  const color = scoreColor(score);
  const verdict = scoreLabel(score);
  const inputLabel = (inputData.value || inputData.file?.name || 'N/A').slice(0, 120);

  const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
  const sc = STATUS_COLOR;

  const findingsHTML = (results.findings || []).map((f) =>
    row([`<span style="color:${sc[f.status]}">${STATUS_ICON[f.status] || '•'} ${f.label}</span>`, `<span style="color:${sc[f.status]}">${f.value}</span>`])
  ).join('');

  const sourcesHTML = results.sources?.length
    ? `<h2>Source Verification</h2>
       <table><tr><th>Source</th><th>Status</th><th>Date</th></tr>
       ${results.sources.map((s) => row([s.label, s.verified === true ? '✓ Verified' : s.verified === false ? '✗ Not verified' : '—', s.date || '—'])).join('')}
       </table>` : '';

  const dupHTML = results.duplicates?.length
    ? `<h2>Similar Sources</h2>
       <table><tr><th>Source</th><th>Similarity</th><th>Date</th></tr>
       ${results.duplicates.map((d) => row([d.source ?? d.url, `${d.matchPercentage ?? d.similarity}%`, d.date])).join('')}
       </table>` : '';

  const aiHtml = results.aiAnalysis
    ? `<h2>AI Analysis</h2>
       <div class="ai-box">
         ${typeof results.aiAnalysis === 'object'
           ? `<p><strong>Confidence:</strong> ${results.aiAnalysis.confidence ?? 'N/A'}%</p><p>${results.aiAnalysis.summary || ''}</p>`
           : `<p>${results.aiAnalysis}</p>`}
       </div>` : '';

  const consistencyHtml = results.crossCheck
    ? `<h2>Cross-Source Consistency</h2>
       <table><tr><th>Metric</th><th>Value</th></tr>
       ${row(['Consistency Score', `${results.crossCheck.consistencyScore}%`])}
       ${row(['Corroborating Sources', `${results.crossCheck.corroboratingCount}`])}
       ${row(['Conflicting Sources', `${results.crossCheck.conflictingCount}`])}
       ${row(['Method', results.crossCheck.methodology || 'N/A'])}
       </table>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>HowSus Report — ${new Date().toLocaleDateString()}</title>
<style>
  body{font-family:Arial,sans-serif;background:#0a0e1a;color:#f1f5f9;padding:32px;max-width:900px;margin:0 auto}
  h1{color:#3b82f6}h2{color:#8b5cf6;margin-top:28px;border-top:1px solid #1e2d4a;padding-top:16px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{padding:8px 12px;border:1px solid #1e2d4a;text-align:left;font-size:.88rem}
  th{background:#111827;font-weight:700}
  .score{font-size:4rem;font-weight:900;color:${color};margin:8px 0}
  .verdict{font-size:1.2rem;color:${color};margin-bottom:20px}
  .ai-box{background:#1e293b;padding:14px 16px;border-radius:8px;line-height:1.6;font-size:.88rem}
  .footer{margin-top:40px;color:#475569;font-size:.75rem;border-top:1px solid #1e2d4a;padding-top:12px}
</style>
</head>
<body>
<h1>🔍 HowSus — Authenticity Report</h1>
<p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
<p><strong>Type:</strong> ${results.type.toUpperCase()} &nbsp;|&nbsp; <strong>Input:</strong> ${inputLabel}</p>
<div class="score">${score}</div>
<div class="verdict">${verdict}</div>
<h2>Analysis Findings</h2>
<table><tr><th>Check</th><th>Result</th></tr>${findingsHTML}</table>
${sourcesHTML}
${dupHTML}
${consistencyHtml}
${aiHtml}
<div class="footer">Generated by HowSus — News &amp; Media Authenticity Analyzer</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `howsus-report-${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Main component ────────────────────────────────────────────────────────
export default function ResultsPanel({ results, inputData, aiConfig, confidenceScore = 0, scanHistory = [], onClearHistory }) {
  const panelRef = useRef(null);
  const [activeMetric, setActiveMetric] = useState(null);
  const [copyToast, setCopyToast] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  // Stable key for bookmark lookup based on input content
  const bookmarkKey = `${results?.type}:${(inputData?.value || inputData?.file?.name || '').slice(0, 120)}`;
  const [isBookmarked, setIsBookmarked] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('howsus-bookmarks') || '[]');
      return saved.some((b) => b.key === bookmarkKey);
    } catch { return false; }
  });

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setActiveMetric(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleCopyResults = useCallback(() => {
    const text = [
      `HowSus Analysis Report`,
      `Score: ${results?.authenticityScore ?? 0}/100`,
      `Type: ${results?.type}`,
      results?.domain ? `Domain: ${results.domain}` : null,
      `Findings: ${results?.findings?.map((f) => `${f.label}: ${f.value}`).join('; ')}`,
    ].filter(Boolean).join('\n');
    navigator.clipboard?.writeText(text).then(() => {
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2000);
    });
  }, [results]);

  const handleBookmark = useCallback(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('howsus-bookmarks') || '[]');
      const entry = {
        key: bookmarkKey,
        id: Date.now(),
        timestamp: new Date().toISOString(),
        score: results?.authenticityScore,
        type: results?.type,
        input: (inputData?.value || inputData?.file?.name || '').slice(0, 120),
      };
      if (isBookmarked) {
        const filtered = saved.filter((b) => b.key !== bookmarkKey);
        localStorage.setItem('howsus-bookmarks', JSON.stringify(filtered));
        setIsBookmarked(false);
      } else {
        localStorage.setItem('howsus-bookmarks', JSON.stringify([entry, ...saved].slice(0, 50)));
        setIsBookmarked(true);
      }
    } catch { /* ignore */ }
  }, [results, inputData, isBookmarked, bookmarkKey]);

  // summaryItems must be computed before early return to satisfy rules-of-hooks
  const summaryItems = useMemo(() => {
    if (!results) return [];
    const mins = results.wordCount ? Math.max(1, Math.round(results.wordCount / 200)) : null;
    return [
      { key: 'Input type', val: results.type.toUpperCase() },
      results.domain      && { key: 'Domain',       val: results.domain },
      results.wordCount   && { key: 'Words',        val: results.wordCount },
      mins                && { key: 'Read time',    val: `~${mins} min` },
      results.fileName    && { key: 'File',         val: results.fileName },
      results.exifCount !== undefined && { key: 'EXIF fields', val: results.exifCount },
      results.duplicates?.length > 0  && { key: 'Similar sources', val: `${results.duplicates.length} found`, warn: true },
      results.crossCheck  && { key: 'Consistency', val: `${results.crossCheck.consistencyScore}%` },
    ].filter(Boolean);
  }, [results]);

  if (!results) return null; // guard — should not normally render without results

  const score = results.authenticityScore ?? results.score ?? 0;

  return (
    <motion.section
      className="results-panel"
      ref={panelRef}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5 }}
      aria-label="Analysis results"
    >
      <div className="results-card">
        {/* ── Header row ─────────────────────────────────────────────── */}
        <div className="results-header">
          <div className="results-header-left">
            <h2>Analysis Results</h2>
            {confidenceScore > 0 && (
              <span
                className={`confidence-badge ${confidenceScore >= 65 ? 'high' : confidenceScore >= 35 ? 'medium' : 'low'}`}
                title={`Signal confidence: ${confidenceScore}% — based on findings count, feed matches, tier-1 sources, and AI analysis`}
              >
                Signal confidence: {confidenceScore}%
              </span>
            )}
          </div>
          <div className="download-btns" role="group" aria-label="Export or share report">
            <motion.button
              className="btn-download copy"
              onClick={handleCopyResults}
              type="button"
              aria-label="Copy results to clipboard"
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.95 }}
            >
              {copyToast ? '✅ Copied!' : '📋 Copy'}
            </motion.button>
            <motion.button
              className={`btn-download bookmark ${isBookmarked ? 'bookmarked' : ''}`}
              onClick={handleBookmark}
              type="button"
              aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this result'}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.95 }}
            >
              {isBookmarked ? '🔖 Saved' : '🔖 Save'}
            </motion.button>
            <motion.button
              className="btn-download share"
              onClick={() => {
                const payload = {
                  t: inputData.type,
                  v: (inputData.value || inputData.file?.name || '').slice(0, 300),
                  s: score,
                  ts: Date.now(),
                };
                const hash = btoa(encodeURIComponent(JSON.stringify(payload)));
                const url = `${window.location.origin}${window.location.pathname}#share=${hash}`;
                navigator.clipboard?.writeText(url).then(() => {
                  setShareToast(true);
                  setTimeout(() => setShareToast(false), 2000);
                }).catch(() => prompt('Copy this link:', url));
              }}
              type="button"
              aria-label="Copy shareable link"
              whileHover={{ scale: 1.06, boxShadow: '0 0 18px rgba(139,92,246,0.45)' }}
              whileTap={{ scale: 0.95 }}
            >
              {shareToast ? '✅ Link copied!' : '🔗 Share'}
            </motion.button>
            <motion.button
              className="btn-download print"
              onClick={() => window.print()}
              type="button"
              aria-label="Print report"
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.95 }}
            >
              🖨 Print
            </motion.button>
            <motion.button
              className="btn-download pdf"
              onClick={() => buildPDF(results, inputData)}
              type="button"
              aria-label="Download PDF report"
              whileHover={{ scale: 1.06, boxShadow: '0 0 18px rgba(239,68,68,0.45)' }}
              whileTap={{ scale: 0.95 }}
            >
              ⬇ PDF
            </motion.button>
            <motion.button
              className="btn-download html"
              onClick={() => buildHTML(results, inputData)}
              type="button"
              aria-label="Download full HTML report"
              whileHover={{ scale: 1.06, boxShadow: '0 0 18px rgba(59,130,246,0.45)' }}
              whileTap={{ scale: 0.95 }}
            >
              ⬇ HTML
            </motion.button>
          </div>
        </div>

        {/* ── Score + summary ──────────────────────────────────────── */}
        <div className="results-top">
          <ScoreGauge
            score={score}
            onDetails={() => setActiveMetric({
              title: 'Authenticity Score',
              value: `${score}/100 (${scoreLabel(score)})`,
              explanation: 'This score is a weighted heuristic based on domain signals, text patterns, duplicate checks, and metadata quality.',
              signals: [
                `Analysis type: ${results.type}`,
                `Findings counted: ${(results.findings || []).length}`,
                `Duplicate matches: ${(results.duplicates || []).length}`,
              ],
            })}
          />
          <div className="results-summary">
            {summaryItems.map((item) => (
              <div key={item.key} className="summary-item">
                <span className="summary-key">{item.key}</span>
                <span className={`summary-val ${item.warn ? 'warn' : ''}`}>
                  {item.val}
                  <button
                    type="button"
                    className="metric-info-btn"
                    onClick={() => setActiveMetric(metricDetailsFromSummary(item, results, inputData))}
                    aria-label={`Explain ${item.key}`}
                  >
                    Details
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="section-divider" />

        {/* ── Error banner ─────────────────────────────────────────── */}
        {results.error && (
          <div className="error-msg" role="alert">⚠ {results.error}</div>
        )}

        {/* ── Detailed findings (expandable) ───────────────────────── */}
        <ExpandablePanel
          title="Detailed Findings"
          icon="🔎"
          badge={results.findings?.length}
          defaultOpen
          id="findings"
        >
          <div className="findings-section" role="table" aria-label="Detailed findings">
            {results.findings?.map((f, i) => (
              <FindingRow
                key={i}
                finding={f}
                index={i}
                onDetails={() => setActiveMetric(metricDetailsFromFinding(f, results))}
              />
            ))}
          </div>
          {results.domain && (
            <p className="whois-hint">
              💡 Tip: Look up <strong>{results.domain}</strong> on{' '}
              <a href={`https://who.is/whois/${encodeURIComponent(results.domain)}`} target="_blank" rel="noreferrer noopener">who.is</a>{' '}
              or{' '}
              <a href={`https://www.whois.com/whois/${encodeURIComponent(results.domain)}`} target="_blank" rel="noreferrer noopener">whois.com</a>{' '}
              to verify domain registration age and ownership.
            </p>
          )}
        </ExpandablePanel>

        {/* ── Source verification (expandable) ────────────────────── */}
        {results.sources?.length > 0 && (
          <ExpandablePanel
            title="Source Verification"
            icon="🌐"
            badge={results.sources.length}
            defaultOpen
            id="sources"
          >
            <div className="sources-table-wrap">
              <table className="sources-table" aria-label="Source verification results">
                <thead>
                  <tr>
                    <th scope="col">Source</th>
                    <th scope="col">Status</th>
                    <th scope="col">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {results.sources.map((s, i) => (
                    <SourceRow
                      key={i}
                      source={s}
                      index={i}
                      onDetails={() => setActiveMetric(metricDetailsFromSource(s))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </ExpandablePanel>
        )}

        {/* ── Duplicate detection (expandable) ────────────────────── */}
        {results.duplicates?.length > 0 && (
          <ExpandablePanel
            title="Duplicate Detection"
            icon="🔁"
            badge={results.duplicates.length}
            id="duplicates"
          >
            <div className="dup-list">
              {results.duplicates.map((d, i) => {
                const pct = d.matchPercentage ?? d.similarity ?? 0;
                return (
                  <motion.div
                    key={i}
                    className="dup-item"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <span className="dup-source">{d.source ?? d.url}</span>
                    <AnimatedProgressBar
                      value={pct}
                      color={pct >= 80 ? '#ef4444' : pct >= 65 ? '#f59e0b' : '#10b981'}
                      size="sm"
                      glowing={false}
                      label={`${d.source ?? d.url}: ${pct}% similarity`}
                    />
                    <span className="dup-pct">{pct}%</span>
                    <span className="dup-date">{d.date}</span>
                    <button
                      type="button"
                      className="metric-info-btn dup-info-btn"
                      onClick={() => setActiveMetric(metricDetailsFromDuplicate(d))}
                      aria-label={`Explain duplicate match for ${d.source ?? d.url}`}
                    >
                      Details
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </ExpandablePanel>
        )}

        {/* ── Cross-source consistency (expandable) ──────────────── */}
        {results.crossCheck && (
          <ExpandablePanel
            title="Cross-Source Consistency"
            icon="🧭"
            badge={`${results.crossCheck.consistencyScore}%`}
            defaultOpen
            id="consistency"
          >
            <div className="consistency-score-row">
              <span className="summary-key">Consistency score</span>
              <AnimatedProgressBar
                value={results.crossCheck.consistencyScore}
                size="sm"
                showLabel
                color={
                  results.crossCheck.consistencyScore >= 65
                    ? '#10b981'
                    : results.crossCheck.consistencyScore >= 40
                      ? '#f59e0b'
                      : '#ef4444'
                }
                label={`Cross-source consistency ${results.crossCheck.consistencyScore}%`}
              />
              <button
                type="button"
                className="metric-info-btn"
                onClick={() => setActiveMetric({
                  title: 'Cross-Source Consistency Score',
                  value: `${results.crossCheck.consistencyScore}%`,
                  explanation: 'Higher consistency means more corroborating source signals than conflicting ones. Tier-1 sources (wire services, public broadcasters) carry more weight in this calculation.',
                  signals: [
                    `Corroborating count: ${results.crossCheck.corroboratingCount}`,
                    `Conflicting count: ${results.crossCheck.conflictingCount}`,
                    `Tier-1 sources: ${(results.crossCheck.corroborating || []).filter((e) => e.tier === 1).length}`,
                    `Method: ${results.crossCheck.methodology || 'N/A'}`,
                  ],
                })}
                aria-label="Explain consistency score"
              >
                Details
              </button>
            </div>

            {results.crossCheck.matchedKeywords?.length > 0 && (
              <div className="keyword-chips" aria-label="Feed-matched keywords">
                <span className="keyword-chips-label">Matched terms:</span>
                {results.crossCheck.matchedKeywords.map((kw) => (
                  <span key={kw} className="keyword-chip">{kw}</span>
                ))}
              </div>
            )}

            <div className="consistency-grid">
              <div className="consistency-card">
                <h4>Corroborating Sources ({results.crossCheck.corroboratingCount})</h4>
                {(results.crossCheck.corroborating || []).length === 0 ? (
                  <p className="empty-note">No corroborating sources found in this pass.</p>
                ) : (
                  <ul className="consistency-list">
                    {results.crossCheck.corroborating.map((entry, i) => (
                      <li key={`c-${i}`}>
                        <div className="consistency-entry-head">
                          <strong>{entry.source}</strong>
                          <span>{entry.confidence}%</span>
                        </div>
                        <p>{entry.claim}</p>
                        {entry.matchedText && (
                          <p className="cross-check-matched-text">
                            <span className="matched-text-label">Matched:</span> {entry.matchedText}
                          </p>
                        )}
                        <button
                          type="button"
                          className="metric-info-btn"
                          onClick={() => setActiveMetric(metricDetailsFromCrossCheck(entry, 'corroborating', results.crossCheck))}
                          aria-label={`Explain corroborating source ${entry.source}`}
                        >
                          Details
                        </button>
                        {entry.searchUrl && (
                          <a
                            href={safeUrl(entry.searchUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cross-check-search-link"
                            aria-label={`Search for claim about ${entry.source}`}
                          >
                            🔍 Search
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="consistency-card">
                <h4>Conflicting Sources ({results.crossCheck.conflictingCount})</h4>
                {(results.crossCheck.conflicting || []).length === 0 ? (
                  <p className="empty-note">No conflicting sources found in this pass.</p>
                ) : (
                  <ul className="consistency-list">
                    {results.crossCheck.conflicting.map((entry, i) => (
                      <li key={`x-${i}`}>
                        <div className="consistency-entry-head">
                          <strong>{entry.source}</strong>
                          <span>{entry.confidence}%</span>
                        </div>
                        <p>{entry.claim}</p>
                        {entry.matchedText && (
                          <p className="cross-check-matched-text">
                            <span className="matched-text-label">Matched:</span> {entry.matchedText}
                          </p>
                        )}
                        <button
                          type="button"
                          className="metric-info-btn"
                          onClick={() => setActiveMetric(metricDetailsFromCrossCheck(entry, 'conflicting', results.crossCheck))}
                          aria-label={`Explain conflicting source ${entry.source}`}
                        >
                          Details
                        </button>
                        {entry.searchUrl && (
                          <a
                            href={safeUrl(entry.searchUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cross-check-search-link"
                            aria-label={`Search for claim about ${entry.source}`}
                          >
                            🔍 Search
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </ExpandablePanel>
        )}

        {/* ── Image metadata (expandable — image type only) ────────── */}
        {results.type === 'image' && results.imageAnalysis && (
          <ExpandablePanel
            title="Image Metadata (EXIF)"
            icon="📷"
            badge={results.exifCount}
            id="exif"
          >
            {/* ── New image analysis summary fields ── */}
            <div className="image-analysis-summary">
              {results.imageDimensions && (
                <div className="image-analysis-row">
                  <span className="image-analysis-label">📐 Dimensions</span>
                  <span className="image-analysis-value">{results.imageDimensions}</span>
                </div>
              )}
              {results.fileHash && (
                <div className="image-analysis-row">
                  <span className="image-analysis-label">🔑 SHA-256</span>
                  <span className="image-analysis-value image-analysis-mono">{results.fileHash}</span>
                </div>
              )}
              {results.imageAnalysis.mimeSniff && (
                <div className="image-analysis-row">
                  <span className="image-analysis-label">🔍 File type (magic bytes)</span>
                  <span className={`image-analysis-value ${results.imageAnalysis.mimeSniff.mimeMatchesExt ? '' : 'image-analysis-warn'}`}>
                    {results.imageAnalysis.mimeSniff.detectedMime}
                    {!results.imageAnalysis.mimeSniff.mimeMatchesExt && (
                      <span className="image-analysis-badge-bad"> ⚠ MISMATCH</span>
                    )}
                  </span>
                </div>
              )}
              {results.imageAnalysis.colorAnalysis && results.imageAnalysis.colorAnalysis.avgSaturation > 0 && (
                <div className="image-analysis-row">
                  <span className="image-analysis-label">🎨 Avg saturation</span>
                  <span className={`image-analysis-value ${results.imageAnalysis.colorAnalysis.overSaturated ? 'image-analysis-warn' : ''}`}>
                    {results.imageAnalysis.colorAnalysis.avgSaturation}%
                    {results.imageAnalysis.colorAnalysis.overSaturated && <span className="image-analysis-badge-bad"> ⚠ over-saturated</span>}
                    {results.imageAnalysis.colorAnalysis.hasAlpha && <span className="image-analysis-badge-warn"> α alpha channel</span>}
                  </span>
                </div>
              )}
              {results.imageAnalysis.steganographyIndicators?.anomalousFileSize && (
                <div className="image-analysis-row">
                  <span className="image-analysis-label">🕵 Stego indicator</span>
                  <span className="image-analysis-value image-analysis-warn">
                    Anomalous size: {results.imageAnalysis.compressionRatio} bytes/px
                  </span>
                </div>
              )}
            </div>
            <ExifDetails exifData={results.exifData} />
            {results.imageAnalysis.reverseSearchMatches?.length > 0 && (
              <div className="reverse-search">
                <p className="section-subtitle">Reverse Image Search</p>
                <ul>
                  {results.imageAnalysis.reverseSearchMatches.map((url, i) => (
                    <li key={i}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a></li>
                  ))}
                </ul>
              </div>
            )}
          </ExpandablePanel>
        )}

        {/* ── URL screenshot (expandable — url type only) ─────────── */}
        {results.type === 'url' && results.screenshotUrl && (
          <ExpandablePanel
            title="Page Screenshot"
            icon="🖼"
            id="screenshot"
          >
            <div className="screenshot-section">
              {safeUrl(results.screenshotUrl) && (
                <img
                  src={safeUrl(results.screenshotUrl)}
                  alt={`Screenshot of ${results.domain}`}
                  className="page-screenshot"
                  loading="lazy"
                />
              )}
              <p className="screenshot-caption">
                Screenshot captured via{' '}
                <a href="https://microlink.io" target="_blank" rel="noreferrer noopener">Microlink.io</a>
                {' '}at scan time
              </p>
            </div>
          </ExpandablePanel>
        )}
        {/* Screenshot fallback notice */}
        {results.type === 'url' && !results.screenshotUrl && (
          <ExpandablePanel
            title="Page Screenshot"
            icon="🖼"
            id="screenshot-na"
          >
            <div className="screenshot-unavailable">
              <p>📵 Screenshot unavailable — the Microlink.io free screenshot service could not capture this URL, or rate limit was reached.</p>
              <p>
                <a href={`https://www.screenshotmachine.com?url=${encodeURIComponent(results.domain ? `https://${results.domain}` : '')}`} target="_blank" rel="noreferrer noopener">
                  Try Screenshot Machine ↗
                </a>
                {' '}or{' '}
                <a href={`https://web.archive.org/web/*/${results.domain ? `https://${results.domain}` : ''}`} target="_blank" rel="noreferrer noopener">
                  View in Wayback Machine ↗
                </a>
              </p>
            </div>
          </ExpandablePanel>
        )}

        {/* ── AI analysis (expandable — only when AI was run) ──────── */}
        {results.aiAnalysis && (
          <ExpandablePanel
            title="AI Analysis"
            icon="🤖"
            defaultOpen
            id="ai"
          >
            <motion.div
              className="ai-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {typeof results.aiAnalysis === 'object' ? (
                <>
                  {results.aiAnalysis.confidence != null && (
                    <div className="ai-confidence">
                      <span className="summary-key">Confidence</span>
                      <AnimatedProgressBar
                        value={results.aiAnalysis.confidence}
                        size="sm"
                        showLabel
                        label={`AI confidence: ${results.aiAnalysis.confidence}%`}
                      />
                      <button
                        type="button"
                        className="metric-info-btn"
                        onClick={() => setActiveMetric({
                          title: 'AI Confidence',
                          value: `${results.aiAnalysis.confidence}%`,
                          explanation: 'AI confidence is model-reported certainty from the selected provider and model.',
                          signals: [
                            `Provider: ${results.aiAnalysis.provider || aiConfig?.provider || 'N/A'}`,
                            `Model: ${results.aiAnalysis.model || aiConfig?.model || 'N/A'}`,
                            `Summary length: ${(results.aiAnalysis.summary || '').length} characters`,
                          ],
                        })}
                        aria-label="Explain AI confidence"
                      >
                        Details
                      </button>
                    </div>
                  )}
                  {results.aiAnalysis.storyValidity && (
                    <div className="ai-validity-badge-row">
                      <span className="summary-key">Story validity</span>
                      <span className={`ai-validity-badge ${results.aiAnalysis.storyValidity}`}>
                        {results.aiAnalysis.storyValidity === 'likely_valid' ? '✅ Likely Valid'
                          : results.aiAnalysis.storyValidity === 'likely_false' ? '❌ Likely False'
                          : '⚠ Uncertain'}
                      </span>
                      {results.aiAnalysis.validityReason && (
                        <p className="ai-validity-reason">{results.aiAnalysis.validityReason}</p>
                      )}
                    </div>
                  )}
                  {results.aiAnalysis.summary && <p className="ai-summary">{results.aiAnalysis.summary}</p>}
                </>
              ) : (
                <p className="ai-summary">{results.aiAnalysis}</p>
              )}
            </motion.div>
          </ExpandablePanel>
        )}
        {/* ── AI validity section (shown when AI was run or as placeholder) ── */}
        {!results.aiAnalysis && (
          <ExpandablePanel
            title="AI Story Validity"
            icon="🤖"
            id="ai-placeholder"
          >
            <div className="ai-skipped-notice">
              <p>🔑 No AI API key configured — AI story validity check was skipped.</p>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 6 }}>
                Add an OpenAI or Google Gemini API key in the header to enable AI-powered story validity analysis.
              </p>
            </div>
          </ExpandablePanel>
        )}
        {/* ── Scan history ─────────────────────────────────────────── */}
        {scanHistory.length > 0 && (
          <ExpandablePanel title="Scan History" icon="🕑" badge={scanHistory.length} id="history">
            <div className="history-list">
              {scanHistory.map((entry) => (
                <div key={entry.id} className="history-item">
                  <span className="history-type">{entry.type.toUpperCase()}</span>
                  <span className="history-summary" title={entry.inputSummary}>{entry.inputSummary}</span>
                  <span
                    className="history-score"
                    style={{ color: entry.score >= 70 ? '#10b981' : entry.score >= 40 ? '#f59e0b' : '#ef4444' }}
                  >
                    {entry.score}/100
                  </span>
                  <span className="history-time">{new Date(entry.timestamp).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <button type="button" className="btn-clear-history" onClick={onClearHistory}>Clear history</button>
          </ExpandablePanel>
        )}

        {/* ── Dark patterns detail (expandable) ───────────────────── */}
        {results.darkPatterns && (
          <ExpandablePanel
            title="Manipulative Framing Patterns"
            icon="🌀"
            badge={
              results.darkPatterns.matchCount > 0
                ? results.darkPatterns.matchCount
                : null
            }
            id="dark-patterns"
          >
            <DarkPatternsPanel darkPatterns={results.darkPatterns} />
          </ExpandablePanel>
        )}

        {/* ── Sentiment detail (expandable — text/url types with sentiment) ─ */}
        {results.sentiment && (
          <ExpandablePanel
            title="Emotional Tone Analysis"
            icon="😶"
            id="sentiment"
          >
            <SentimentPanel sentiment={results.sentiment} />
          </ExpandablePanel>
        )}

        {/* ── Readability (expandable — text type only) ────────────── */}
        {results.type === 'text' && results.readability && (
          <ExpandablePanel
            title="Reading Level"
            icon="📖"
            id="readability"
          >
            <ReadabilityPanel readability={results.readability} />
          </ExpandablePanel>
        )}

        {/* ── "How to read this report" glossary ──────────────────── */}
        <ExpandablePanel
          title="How to Read This Report"
          icon="❓"
          id="glossary"
        >
          <GlossaryPanel />
        </ExpandablePanel>
      </div>

      <MetricDetailModal metric={activeMetric} onClose={() => setActiveMetric(null)} />
    </motion.section>
  );
}
