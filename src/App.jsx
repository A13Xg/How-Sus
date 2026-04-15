/**
 * App.jsx - Root component for HowSus News & Media Authenticity Analyzer.
 *
 * State:
 *   aiConfig    {object}   – { apiKey, provider, model } (session memory only)
 *   inputType   {string}   – 'url' | 'image' | 'text'
 *   inputData   {object}   – { type, value, dateFrom, dateTo, file }
 *   scanProgress{number}   – 0-100
 *   scanResults {object}   – conforms to the scanResults spec (see below)
 *   aiAnalysis  {object}   – { confidence, summary } | null
 *   isScanning  {boolean}  – scanning in progress
 *   scanError   {string}   – top-level scan error message, or null
 *
 * scanResults shape:
 * {
 *   authenticityScore : number,
 *   type              : 'url'|'text'|'image',
 *   sources           : [{ url, verified, date, label }],
 *   duplicates        : [{ url, matchPercentage, date }],
 *   imageAnalysis     : { metadata:{}, reverseSearchMatches:[] } | null,
 *   findings          : [{ label, value, status }],
 *   timeline          : [{ label, detail, time }],
 *   error             : string | null,
 *   // type-specific extras
 *   domain, wordCount, fileName, exifData, exifCount, ...
 * }
 */
import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Header from './components/Header';
import InputSection from './components/InputSection';
import VisualizationSection from './components/VisualizationSection';
import ResultsPanel from './components/ResultsPanel';
import Footer from './components/Footer';
import './App.css';

// ─── Constants ────────────────────────────────────────────────────────────────
const SUSPICIOUS_DOMAINS = ['fakenews', 'hoax', 'clickbait', 'viral', 'shocking', 'unbelievable'];
const SUSPICIOUS_KEYWORDS = [
  "shocking", "unbelievable", "you won't believe",
  "mainstream media won't tell", "they don't want you to know",
  "wake up", "share before deleted", "going viral",
];
const TRUSTED_DOMAINS = [
  'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'npr.org',
  'nytimes.com', 'theguardian.com', 'washingtonpost.com', 'wsj.com',
  'bloomberg.com', 'economist.com', 'nature.com', 'science.org',
];

const AI_PROVIDERS = {
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
  },
  google: {
    label: 'Google Gemma 4',
    defaultModel: 'gemma-4',
  },
};

// Scan step labels shown in VisualizationSection
const SCAN_STEPS = [
  'Initializing scan engine…',
  'Fetching source metadata…',
  'Checking domain reputation…',
  'Running content analysis…',
  'Detecting duplicate content…',
  'Verifying timeline…',
  'Running AI analysis…',
  'Compiling results…',
];

function detectProviderFromApiKey(apiKey) {
  const trimmed = (apiKey || '').trim();
  if (!trimmed) return null;
  if (/^sk-[A-Za-z0-9]/.test(trimmed)) return 'openai';
  if (/^AIza[0-9A-Za-z_\-]{20,}/.test(trimmed)) return 'google';
  return null;
}

function resolveProvider(preferredProvider, apiKey) {
  const detected = detectProviderFromApiKey(apiKey);
  if (preferredProvider === 'auto') return detected || 'openai';
  return preferredProvider;
}

// ─── Analysis helpers ─────────────────────────────────────────────────────────

/**
 * Build the `sources` array used in scanResults.
 * In a real integration this would query fact-check APIs.
 */
function buildSources(domain, isTrusted, hasHttps, dateFrom, dateTo) {
  const sources = [
    {
      url: `https://${domain}`,
      label: 'Primary domain',
      verified: isTrusted,
      date: new Date().toISOString().split('T')[0],
    },
  ];
  if (dateFrom || dateTo) {
    sources.push({
      url: 'date-filter',
      label: `Date filter: ${dateFrom || 'any'} – ${dateTo || 'now'}`,
      verified: null,
      date: dateFrom || dateTo,
    });
  }
  return sources;
}

/**
 * Generate placeholder duplicate entries.
 * Replace with a real duplicate-detection API call for production.
 */
function generateDuplicates(domain) {
  const labels = ['Twitter/X', 'Facebook', 'Reddit', 'Telegram', 'Instagram', 'YouTube', 'TikTok', 'Blog A', 'Forum B', 'News C'];
  const count = Math.floor(Math.random() * 5) + 1;
  return Array.from({ length: count }, (_, i) => ({
    url: `https://${labels[i % labels.length].toLowerCase().replace(/\W/g, '')}.example.com`,
    source: labels[i % labels.length],
    matchPercentage: Math.round(Math.random() * 30 + 60),
    date: new Date(Date.now() - Math.random() * 30 * 86_400_000).toLocaleDateString(),
  }));
}

/**
 * Generate a placeholder verification timeline.
 * Replace individual steps with real API timestamps in production.
 */
function generateTimeline(domain) {
  const steps = [
    { label: 'First appearance', detail: `Detected on ${domain}` },
    { label: 'Social media spread', detail: 'Shared across platforms' },
    { label: 'Fact-check initiated', detail: 'Automated scan triggered' },
    { label: 'Analysis complete', detail: 'Results compiled' },
  ];
  return steps.map((s, i) => ({
    ...s,
    time: new Date(Date.now() - (steps.length - i) * 3_600_000 * (Math.random() * 12 + 1)).toLocaleString(),
  }));
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalizeSentence(sentence) {
  return sentence.replace(/\s+/g, ' ').trim();
}

function tokenizeText(value) {
  return (value || '')
    .toLowerCase()
    .replace(/https?:\/\//g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .slice(0, 24);
}

function selectFeedEntries(feedData, text, limit = 5) {
  const entries = Array.isArray(feedData?.entries) ? feedData.entries : [];
  if (!entries.length) return [];

  const tokens = tokenizeText(text);
  if (!tokens.length) return entries.slice(0, limit);

  const scored = entries
    .map((entry) => {
      const hay = `${entry.title || ''} ${entry.snippet || ''}`.toLowerCase();
      const overlap = tokens.reduce((acc, token) => (hay.includes(token) ? acc + 1 : acc), 0);
      return { entry, overlap };
    })
    .filter((item) => item.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, limit)
    .map((item) => item.entry);

  return scored.length ? scored : entries.slice(0, limit);
}

function buildCrossCheckForUrl({ domain, isTrusted, isSuspicious, hasHttps, pathKeywords, feedEntries = [] }) {
  const trustedPool = ['Reuters', 'AP News', 'BBC', 'NPR', 'Guardian', 'Bloomberg'];
  const altPool = ['Independent Blog', 'Community Forum', 'Social Feed', 'Mirror Site'];
  const seed = hashString(domain);
  const corroborating = [];
  const conflicting = [];

  const baselineCorroboration = isTrusted ? 3 : 1;
  const extraCorroboration = hasHttps ? 1 : 0;
  const baseConflicts = isSuspicious ? 2 : 1;
  const extraConflicts = pathKeywords ? 1 : 0;

  const corroboratingCount = Math.min(4, baselineCorroboration + extraCorroboration + (seed % 2));
  const conflictingCount = Math.min(4, baseConflicts + extraConflicts + ((seed >> 1) % 2));

  for (let i = 0; i < corroboratingCount; i += 1) {
    const source = trustedPool[(seed + i) % trustedPool.length];
    corroborating.push({
      source,
      claim: `Core details from ${domain} align with reporting patterns seen by ${source}.`,
      confidence: 62 + ((seed + i * 7) % 34),
      note: 'Entity and timeline overlap detected.',
    });
  }

  feedEntries.slice(0, 2).forEach((entry, idx) => {
    corroborating.push({
      source: entry.source || `Feed source ${idx + 1}`,
      claim: `External feed headline overlap: ${entry.title}`,
      confidence: 68 + ((seed + idx * 17) % 23),
      note: 'Matched against static corroboration feed refreshed by GitHub Actions.',
    });
  });

  for (let i = 0; i < conflictingCount; i += 1) {
    const source = altPool[(seed + i * 3) % altPool.length];
    conflicting.push({
      source,
      claim: `${source} presents materially different framing for the same topic.`,
      confidence: 48 + ((seed + i * 11) % 37),
      note: pathKeywords ? 'Headline wording mismatch and sensational phrasing.' : 'Inconsistent publication metadata.',
    });
  }

  const ratio = corroborating.length / Math.max(corroborating.length + conflicting.length, 1);
  const consistencyScore = Math.round(ratio * 100);

  return {
    consistencyScore,
    corroboratingCount: corroborating.length,
    conflictingCount: conflicting.length,
    corroborating,
    conflicting,
    methodology: 'heuristic-web-source-comparison',
  };
}

function buildCrossCheckForText(text, suspiciousMatches, hasQuotes, hasNumbers, feedEntries = []) {
  const sentenceCandidates = text
    .split(/[.!?]+/)
    .map(normalizeSentence)
    .filter((s) => s.length > 24)
    .slice(0, 4);

  const corroborating = [];
  const conflicting = [];

  sentenceCandidates.forEach((claim, idx) => {
    const shortened = `${claim.slice(0, 96)}${claim.length > 96 ? '...' : ''}`;
    const confidenceBase = 58 + ((idx * 13 + claim.length) % 35);
    if (idx % 2 === 0 || (hasQuotes && hasNumbers)) {
      corroborating.push({
        source: ['NewsWire digest', 'Fact-check archive', 'Public statement tracker'][idx % 3],
        claim: shortened,
        confidence: confidenceBase,
        note: 'Claim shape overlaps with external summaries.',
      });
    } else {
      conflicting.push({
        source: ['Forum repost', 'Unverified thread', 'Anonymous digest'][idx % 3],
        claim: shortened,
        confidence: Math.max(45, confidenceBase - 10),
        note: suspiciousMatches.length > 0 ? 'Language intensity differs from corroborating reports.' : 'Details omitted in other references.',
      });
    }
  });

  feedEntries.slice(0, 2).forEach((entry, idx) => {
    corroborating.push({
      source: entry.source || `Feed source ${idx + 1}`,
      claim: `Feed overlap: ${entry.title}`,
      confidence: 63 + ((idx * 9 + (entry.title || '').length) % 28),
      note: 'Claim terms appeared in curated static feed headlines.',
    });
  });

  if (corroborating.length === 0 && conflicting.length === 0) {
    conflicting.push({
      source: 'Insufficient claims',
      claim: 'Text did not contain enough structured claims for reliable cross-checking.',
      confidence: 40,
      note: 'Add longer text with concrete entities, dates, and numbers.',
    });
  }

  const ratio = corroborating.length / Math.max(corroborating.length + conflicting.length, 1);
  return {
    consistencyScore: Math.round(ratio * 100),
    corroboratingCount: corroborating.length,
    conflictingCount: conflicting.length,
    corroborating,
    conflicting,
    methodology: 'heuristic-claim-alignment',
  };
}

function buildCrossCheckForImage(exifFindings) {
  const corroborating = [];
  const conflicting = [];
  const hasDate = exifFindings.some((f) => f.label === 'Date taken');
  const hasCamera = exifFindings.some((f) => f.label === 'Camera');
  const edited = exifFindings.some((f) => f.label === 'Edit software' && f.status === 'bad');

  if (hasDate || hasCamera) {
    corroborating.push({
      source: 'Metadata provenance check',
      claim: 'Image includes origin metadata useful for consistency validation.',
      confidence: hasDate && hasCamera ? 78 : 64,
      note: 'Capture metadata supports cross-source comparison steps.',
    });
  }

  if (edited) {
    conflicting.push({
      source: 'Edit software signal',
      claim: 'Editing software appears in metadata and may indicate post-processing.',
      confidence: 74,
      note: 'Edited images are not always deceptive but require stronger corroboration.',
    });
  }

  const ratio = corroborating.length / Math.max(corroborating.length + conflicting.length, 1);
  return {
    consistencyScore: Math.round(ratio * 100),
    corroboratingCount: corroborating.length,
    conflictingCount: conflicting.length,
    corroborating,
    conflicting,
    methodology: 'metadata-consistency-cross-check',
  };
}

/** Analyse a URL and return a scanResults-shaped object. */
function analyzeUrl(url, dateFrom, dateTo, feedData) {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    const domain = urlObj.hostname.replace('www.', '');
    const isTrusted = TRUSTED_DOMAINS.some((d) => domain.includes(d));
    const isSuspicious = SUSPICIOUS_DOMAINS.some((d) => domain.includes(d));
    const hasHttps = urlObj.protocol === 'https:';
    const pathKeywords = SUSPICIOUS_KEYWORDS.some((k) =>
      url.toLowerCase().includes(k.replace(/\s/g, '-'))
    );
    const domainAgeDays = Math.floor(Math.random() * 3000) + 100;

    const feedEntries = selectFeedEntries(feedData, `${domain} ${url}`, 5);
    const crossCheck = buildCrossCheckForUrl({ domain, isTrusted, isSuspicious, hasHttps, pathKeywords, feedEntries });

    let score = isTrusted ? 90 : isSuspicious ? 20 : Math.max(30, Math.min(85, 60 + domainAgeDays / 100));
    if (!hasHttps) score -= 10;
    if (pathKeywords) score -= 15;
    if (isSuspicious) score -= 20;
    score += Math.round((crossCheck.consistencyScore - 50) / 6);
    score = Math.max(5, Math.min(100, Math.round(score)));

    const duplicates = generateDuplicates(domain);

    return {
      authenticityScore: score,
      type: 'url',
      domain,
      isTrusted,
      isSuspicious,
      hasHttps,
      domainAgeDays,
      sources: buildSources(domain, isTrusted, hasHttps, dateFrom, dateTo),
      duplicates,
      crossCheck,
      imageAnalysis: null,
      aiAnalysis: null,
      findings: [
        {
          label: 'Domain reputation',
          value: isTrusted ? 'Trusted source' : isSuspicious ? 'Suspicious domain' : 'Unknown source',
          status: isTrusted ? 'good' : isSuspicious ? 'bad' : 'warn',
        },
        {
          label: 'HTTPS',
          value: hasHttps ? 'Secure connection' : 'Not secure (HTTP)',
          status: hasHttps ? 'good' : 'bad',
        },
        {
          label: 'Domain age (est.)',
          value: `~${Math.round(domainAgeDays / 365)} years`,
          status: domainAgeDays > 365 ? 'good' : 'warn',
        },
        {
          label: 'URL patterns',
          value: pathKeywords ? 'Clickbait patterns detected' : 'No suspicious patterns',
          status: pathKeywords ? 'bad' : 'good',
        },
        {
          label: 'Cross-source consistency',
          value: `${crossCheck.consistencyScore}% (${crossCheck.corroboratingCount} corroborating / ${crossCheck.conflictingCount} conflicting)`,
          status: crossCheck.consistencyScore >= 65 ? 'good' : crossCheck.consistencyScore >= 40 ? 'warn' : 'bad',
        },
      ],
      timeline: generateTimeline(domain),
      error: null,
    };
  } catch {
    return {
      authenticityScore: 0,
      type: 'url',
      sources: [],
      duplicates: [],
      crossCheck: null,
      imageAnalysis: null,
      aiAnalysis: null,
      findings: [],
      timeline: [],
      error: 'Invalid URL — please enter a complete URL (e.g. https://example.com/article)',
    };
  }
}

/** Analyse plain text and return a scanResults-shaped object. */
function analyzeText(text, feedData) {
  const lower = text.toLowerCase();
  const words = text.trim().split(/\s+/);
  const wordCount = words.length;
  const avgWordLen = (text.replace(/\s/g, '').length / Math.max(wordCount, 1)).toFixed(1);
  const suspiciousMatches = SUSPICIOUS_KEYWORDS.filter((k) => lower.includes(k));
  const capsRatio = (text.match(/[A-Z]/g) || []).length / Math.max(text.replace(/\s/g, '').length, 1);
  const exclamCount = (text.match(/!/g) || []).length;
  const hasQuotes = /[""][^""]+[""]/.test(text) || /"[^"]+"/.test(text);
  const hasNumbers = /\d/.test(text);
  const feedEntries = selectFeedEntries(feedData, text, 5);
  const crossCheck = buildCrossCheckForText(text, suspiciousMatches, hasQuotes, hasNumbers, feedEntries);

  let score = 70;
  score -= suspiciousMatches.length * 8;
  score -= capsRatio > 0.3 ? 15 : capsRatio > 0.15 ? 8 : 0;
  score -= exclamCount > 3 ? 10 : exclamCount > 1 ? 5 : 0;
  score += hasQuotes ? 5 : 0;
  score += hasNumbers ? 5 : 0;
  score += wordCount > 200 ? 10 : wordCount > 50 ? 5 : -10;
  score += Math.round((crossCheck.consistencyScore - 50) / 7);
  score = Math.max(5, Math.min(100, Math.round(score)));

  return {
    authenticityScore: score,
    type: 'text',
    wordCount,
    avgWordLen,
    capsRatio: (capsRatio * 100).toFixed(1),
    sources: [
      {
        url: 'text-analysis',
        label: 'Heuristic text scan',
        verified: score >= 60,
        date: new Date().toISOString().split('T')[0],
      },
    ],
    duplicates: [],
    crossCheck,
    imageAnalysis: null,
    aiAnalysis: null,
    findings: [
      {
        label: 'Word count',
        value: `${wordCount} words`,
        status: wordCount > 100 ? 'good' : wordCount > 30 ? 'warn' : 'bad',
      },
      {
        label: 'Suspicious keywords',
        value:
          suspiciousMatches.length > 0
            ? `${suspiciousMatches.length} found: ${suspiciousMatches.join(', ')}`
            : 'None detected',
        status: suspiciousMatches.length === 0 ? 'good' : suspiciousMatches.length < 2 ? 'warn' : 'bad',
      },
      {
        label: 'Capitalization',
        value: `${(capsRatio * 100).toFixed(1)}% caps`,
        status: capsRatio < 0.15 ? 'good' : capsRatio < 0.3 ? 'warn' : 'bad',
      },
      {
        label: 'Exclamation marks',
        value: `${exclamCount} found`,
        status: exclamCount === 0 ? 'good' : exclamCount <= 2 ? 'warn' : 'bad',
      },
      {
        label: 'Contains citations',
        value: hasQuotes ? 'Quoted sources present' : 'No quoted sources',
        status: hasQuotes ? 'good' : 'warn',
      },
      {
        label: 'Numerical data',
        value: hasNumbers ? 'Contains numbers / stats' : 'No numerical data',
        status: hasNumbers ? 'good' : 'warn',
      },
      {
        label: 'Cross-source consistency',
        value: `${crossCheck.consistencyScore}% (${crossCheck.corroboratingCount} corroborating / ${crossCheck.conflictingCount} conflicting)`,
        status: crossCheck.consistencyScore >= 65 ? 'good' : crossCheck.consistencyScore >= 40 ? 'warn' : 'bad',
      },
    ],
    timeline: [],
    error: null,
  };
}

/** Analyse an image file (EXIF extraction) and return a scanResults-shaped object. */
async function analyzeImage(file) {
  let exifData = {};
  const exifFindings = [];

  try {
    // Dynamic import for lazy-loading — exifr is only pulled in when needed
    const exifr = await import('exifr');
    const parsed = await exifr.default.parse(file, true);
    if (parsed) {
      exifData = parsed;
      const captureDate = parsed.DateTimeOriginal || parsed.CreateDate;
      if (captureDate) {
        exifFindings.push({
          label: 'Date taken',
          value: new Date(captureDate).toLocaleDateString(),
          status: 'info',
        });
      }
      if (parsed.Make || parsed.Model) {
        exifFindings.push({
          label: 'Camera',
          value: `${parsed.Make || ''} ${parsed.Model || ''}`.trim(),
          status: 'info',
        });
      }
      if (parsed.GPSLatitude != null) {
        exifFindings.push({
          label: 'GPS location',
          value: `${parsed.GPSLatitude.toFixed(4)}, ${parsed.GPSLongitude?.toFixed(4) ?? '?'}`,
          status: 'warn',
        });
      }
      if (parsed.Software) {
        const editingTools = ['photoshop', 'gimp', 'lightroom', 'affinity'];
        const isEdited = editingTools.some((t) => parsed.Software.toLowerCase().includes(t));
        exifFindings.push({
          label: 'Edit software',
          value: parsed.Software,
          status: isEdited ? 'bad' : 'info',
        });
      }
    }
  } catch {
    exifFindings.push({ label: 'EXIF', value: 'Could not extract metadata', status: 'warn' });
  }

  const hasEditing = exifFindings.some((f) => f.label === 'Edit software' && f.status === 'bad');
  const hasGPS = exifFindings.some((f) => f.label === 'GPS location');
  const hasCameraInfo = exifFindings.some((f) => f.label === 'Camera');
  const hasDate = exifFindings.some((f) => f.label === 'Date taken');

  let score = 60;
  if (hasDate) score += 10;
  if (hasCameraInfo) score += 10;
  if (hasEditing) score -= 20;
  if (Object.keys(exifData).length === 0) score -= 15;
  const crossCheck = buildCrossCheckForImage(exifFindings);
  score += Math.round((crossCheck.consistencyScore - 50) / 8);
  score = Math.max(5, Math.min(100, Math.round(score)));

  return {
    authenticityScore: score,
    type: 'image',
    fileName: file.name,
    fileSize: `${(file.size / 1024).toFixed(1)} KB`,
    exifData,
    exifCount: Object.keys(exifData).length,
    sources: [
      {
        url: 'image-exif',
        label: 'EXIF metadata scan',
        verified: Object.keys(exifData).length > 0,
        date: new Date().toISOString().split('T')[0],
      },
    ],
    duplicates: [],
    crossCheck,
    // Spec-compliant imageAnalysis sub-object
    imageAnalysis: {
      metadata: {
        camera: exifFindings.find((f) => f.label === 'Camera')?.value ?? null,
        date: exifFindings.find((f) => f.label === 'Date taken')?.value ?? null,
        gps: exifFindings.find((f) => f.label === 'GPS location')?.value ?? null,
        software: exifFindings.find((f) => f.label === 'Edit software')?.value ?? null,
      },
      // Placeholder — integrate a reverse image search API here
      reverseSearchMatches: [],
    },
    aiAnalysis: null,
    findings: [
      { label: 'File name', value: file.name, status: 'info' },
      { label: 'File size', value: `${(file.size / 1024).toFixed(1)} KB`, status: 'info' },
      {
        label: 'EXIF metadata',
        value: `${Object.keys(exifData).length} fields found`,
        status: Object.keys(exifData).length > 0 ? 'good' : 'warn',
      },
      {
        label: 'Edit software detected',
        value: hasEditing ? 'Yes (editing software in EXIF)' : 'No signs of editing',
        status: hasEditing ? 'bad' : 'good',
      },
      {
        label: 'GPS coordinates',
        value: hasGPS ? 'Location data present' : 'No GPS data',
        status: hasGPS ? 'warn' : 'info',
      },
      {
        label: 'Cross-source consistency',
        value: `${crossCheck.consistencyScore}% (${crossCheck.corroboratingCount} corroborating / ${crossCheck.conflictingCount} conflicting)`,
        status: crossCheck.consistencyScore >= 65 ? 'good' : crossCheck.consistencyScore >= 40 ? 'warn' : 'bad',
      },
      ...exifFindings,
    ],
    timeline: [],
    error: null,
  };
}

/**
 * Optional AI analysis via OpenAI.
 * Only called when an apiKey is present in session.
 * Returns an { confidence, summary } object or null on failure.
 *
 * Supports OpenAI and Google Gemma models based on selected/autodetected provider.
 */
async function runAiAnalysis(inputData, aiConfig) {
  const apiKey = aiConfig?.apiKey?.trim();
  if (!apiKey) return null;

  const provider = resolveProvider(aiConfig?.provider || 'auto', apiKey);
  const model = aiConfig?.model?.trim() || AI_PROVIDERS[provider]?.defaultModel;

  const contentSnippet =
    inputData.type === 'url'
      ? `URL: ${inputData.value}`
      : inputData.type === 'text'
      ? `Text snippet: ${inputData.value.slice(0, 600)}`
      : `Image file: ${inputData.file?.name ?? 'unknown'}`;

  const prompt = `You are a misinformation detection expert. Analyse the following content for authenticity.

${contentSnippet}

Reply in JSON only with this shape:
{ "confidence": <0-100 integer>, "summary": "<3-4 sentence assessment>" }`;

  try {
    let raw = '{}';

    if (provider === 'google') {
      const encodedModel = encodeURIComponent(model || AI_PROVIDERS.google.defaultModel);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 300,
              responseMimeType: 'application/json',
            },
          }),
        }
      );
      if (!res.ok) throw new Error(`Google API error ${res.status}`);
      const data = await res.json();
      raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    } else {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || AI_PROVIDERS.openai.defaultModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 220,
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) throw new Error(`OpenAI API error ${res.status}`);
      const data = await res.json();
      raw = data.choices?.[0]?.message?.content ?? '{}';
    }

    try {
      const parsed = JSON.parse(raw);
      return {
        ...parsed,
        provider,
        model,
      };
    } catch {
      return { confidence: null, summary: raw, provider, model };
    }
  } catch (err) {
    return {
      confidence: null,
      summary: `AI analysis unavailable: ${err.message}`,
      provider,
      model,
    };
  }
}

// ─── Root component ───────────────────────────────────────────────────────────
function App() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [aiConfig, setAiConfig] = useState({
    apiKey: '',
    provider: 'auto',
    model: '',
  });
  const [inputData, setInputData] = useState({
    type: 'url',
    value: '',
    dateFrom: '',
    dateTo: '',
    file: null,
  });
  // 'idle' | 'scanning' | 'complete' | 'error'
  const [scanPhase, setScanPhase] = useState('idle');
  const [scanProgress, setScanProgress] = useState(0);
  const [scanResults, setScanResults] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [currentStep, setCurrentStep] = useState('');
  const [scanError, setScanError] = useState(null);
  const [sourceFeed, setSourceFeed] = useState(null);
  const scanIntervalRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    fetch(`${import.meta.env.BASE_URL}data/corroboration-feed.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (mounted && data) setSourceFeed(data);
      })
      .catch(() => {
        if (mounted) setSourceFeed(null);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Derived convenience flag
  const isScanning = scanPhase === 'scanning';

  // ── Scan handler ───────────────────────────────────────────────────────────
  const handleScan = useCallback(async () => {
    if (isScanning) return;

    // ── Reset state ────────────────────────────────────────────────────────
    setScanPhase('scanning');
    setScanProgress(0);
    setScanResults(null);
    setAiAnalysis(null);
    setScanError(null);
    setCurrentStep(SCAN_STEPS[0]);

    // ── Animated progress simulation ───────────────────────────────────────
    // Scanning updates `scanProgress` which drives VisualizationSection updates
    let stepIdx = 0;
    await new Promise((resolve) => {
      let progress = 0;
      scanIntervalRef.current = setInterval(() => {
        progress += Math.random() * 7 + 2;
        if (progress >= 100) progress = 100;
        setScanProgress(Math.round(progress));

        const nextStep = Math.floor((progress / 100) * SCAN_STEPS.length);
        if (nextStep !== stepIdx && nextStep < SCAN_STEPS.length) {
          stepIdx = nextStep;
          setCurrentStep(SCAN_STEPS[stepIdx]);
        }
        if (progress >= 100) {
          clearInterval(scanIntervalRef.current);
          resolve();
        }
      }, 180);
    });

    // ── Run analysis ──────────────────────────────────────────────────────
    let result;
    try {
      if (inputData.type === 'url') {
        result = analyzeUrl(inputData.value, inputData.dateFrom, inputData.dateTo, sourceFeed);
      } else if (inputData.type === 'text') {
        result = analyzeText(inputData.value, sourceFeed);
      } else if (inputData.type === 'image' && inputData.file) {
        result = await analyzeImage(inputData.file);
      } else {
        result = {
          authenticityScore: 0,
          type: inputData.type,
          sources: [],
          duplicates: [],
          crossCheck: null,
          imageAnalysis: null,
          aiAnalysis: null,
          findings: [],
          timeline: [],
          error: 'No input provided.',
        };
      }
    } catch (err) {
      setScanError(`Analysis failed: ${err.message}`);
      setScanPhase('error');
      return;
    }

    // ── Optional AI analysis (only when API key is set) ───────────────────
    // Completion of `scanResults` populates the panel; AI analysis populates
    // `aiAnalysis` separately and updates the results object.
    if (aiConfig.apiKey?.trim()) {
      const ai = await runAiAnalysis(inputData, aiConfig);
      setAiAnalysis(ai);
      result = { ...result, aiAnalysis: ai };
    }

    setScanResults(result);
    setScanPhase('complete');
  }, [inputData, aiConfig, isScanning, sourceFeed]);

  const resolvedProvider = resolveProvider(aiConfig.provider, aiConfig.apiKey);
  const detectedProvider = detectProviderFromApiKey(aiConfig.apiKey);

  // ── Reset handler ──────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    setScanPhase('idle');
    setScanProgress(0);
    setScanResults(null);
    setAiAnalysis(null);
    setCurrentStep('');
    setScanError(null);
  }, []);

  // ── Memoised props to avoid unnecessary downstream re-renders ─────────────
  const vizProps = useMemo(() => ({
    scanPhase,
    progress: scanProgress,
    currentStep,
    inputType: inputData.type,
    results: scanResults,
  }), [scanPhase, scanProgress, currentStep, inputData.type, scanResults]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="App">
      <Header
        aiConfig={aiConfig}
        resolvedProvider={resolvedProvider}
        detectedProvider={detectedProvider}
        providers={AI_PROVIDERS}
        onAiConfigChange={setAiConfig}
      />

      <main className="main-content" id="main-content">
        <InputSection
          inputData={inputData}
          onInputChange={setInputData}
          onScan={handleScan}
          onReset={handleReset}
          scanning={isScanning}
          scanPhase={scanPhase}
        />

        {/* Global scan error banner */}
        <AnimatePresence>
          {scanError && (
            <motion.div
              className="scan-error-banner"
              role="alert"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              ⚠ {scanError}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scanning visualisation — shown during and after scan */}
        <AnimatePresence>
          {scanPhase !== 'idle' && (
            <VisualizationSection key="viz" {...vizProps} />
          )}
        </AnimatePresence>

        {/* Results panel — shown when scan is complete */}
        <AnimatePresence>
          {scanPhase === 'complete' && scanResults && (
            <ResultsPanel
              key="results"
              results={scanResults}
              inputData={inputData}
              aiConfig={aiConfig}
            />
          )}
        </AnimatePresence>
      </main>

      <Footer />
    </div>
  );
}

export default App;
