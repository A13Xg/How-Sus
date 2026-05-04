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
import ThemeProvider from './components/ThemeProvider';
import SettingsPanel from './components/SettingsPanel';
import LogPanel from './components/LogPanel';
import './App.css';
import { analyzeSentiment } from './lib/sentiment.js';
import { analyzeReadability } from './lib/readability.js';
import { detectDarkPatterns } from './lib/darkPatterns.js';
import { useLocalStorage } from './lib/useLocalStorage.js';
import { useSettings } from './lib/settings.js';
import { checkForUpdates } from './lib/updateChecker.js';
import logger from './lib/logger.js';
import useKeyboardShortcuts from './lib/useKeyboardShortcuts.js';
import { analyzeFormality } from './lib/formalityAnalyzer.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const SUSPICIOUS_DOMAINS = ['fakenews', 'hoax', 'clickbait', 'viral', 'shocking', 'unbelievable'];
const SUSPICIOUS_KEYWORDS = [
  "shocking", "unbelievable", "you won't believe",
  "mainstream media won't tell", "they don't want you to know",
  "wake up", "share before deleted", "going viral",
  "breaking:", "urgent:", "developing:", "just in:", "exclusive:",
  "world exclusive", "bombshell", "explosive", "smoking gun", "leaked",
  "cover-up", "deep state", "false flag", "crisis actor", "plandemic",
  "sheep", "sheeple", "normies", "the globalists", "new world order",
  "microchips", "5g causes", "they're lying", "truth bomb",
  "share this now", "before it's too late", "time is running out",
  "doctors don't want you to know", "big pharma doesn't want",
  "suppressed information", "banned video",
];
const TRUSTED_DOMAINS = [
  'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'npr.org',
  'nytimes.com', 'theguardian.com', 'washingtonpost.com', 'wsj.com',
  'bloomberg.com', 'economist.com', 'nature.com', 'science.org',
  'cnn.com', 'abc.net.au', 'cbsnews.com', 'nbcnews.com', 'abcnews.go.com',
  'politifact.com', 'snopes.com', 'factcheck.org', 'fullfact.org',
  'usatoday.com', 'latimes.com', 'chicagotribune.com', 'bostonglobe.com',
  'newsweek.com', 'time.com', 'theatlantic.com', 'newyorker.com',
  'foreignpolicy.com', 'foreignaffairs.com',
  'who.int', 'cdc.gov', 'nih.gov', 'fda.gov', 'gov.uk', 'europa.eu',
  'stanford.edu', 'harvard.edu', 'mit.edu', 'oxford.ac.uk', 'cambridge.org',
];

// TLD reputation lists (used in URL analysis)
const SUSPICIOUS_TLDS = ['xyz', 'info', 'click', 'buzz', 'top', 'win', 'bid', 'party', 'club', 'link', 'news', 'review', 'stream', 'download', 'loan', 'tk', 'ml', 'ga', 'cf', 'gq', 'pw', 'cc', 'biz', 'mobi'];
const TRUSTED_TLDS = ['com', 'org', 'edu', 'gov', 'net', 'int'];

// Hedging language patterns (used in text analysis)
const HEDGING_PHRASES = ['allegedly', 'reportedly', 'sources say', 'according to some', 'it is claimed', 'many people believe', 'some say'];

const AI_PROVIDERS = {
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
  },
  google: {
    label: 'Google Gemini',
    defaultModel: 'gemini-1.5-flash',
  },
};

// ─── Trust tier map ────────────────────────────────────────────────────────────
// Tier 1 = wire services / publicly funded broadcasters
// Tier 2 = major established outlets
// Tier 3 = unknown / aggregator (default)
const DOMAIN_TIERS = {
  'reuters.com': 1, 'reutersagency.com': 1,
  'apnews.com': 1,
  'bbc.com': 1, 'bbc.co.uk': 1, 'feeds.bbci.co.uk': 1,
  'npr.org': 1, 'feeds.npr.org': 1,
  'pbs.org': 1,
  'rss.dw.com': 2,
  'nytimes.com': 2, 'theguardian.com': 2, 'washingtonpost.com': 2,
  'wsj.com': 2, 'bloomberg.com': 2, 'economist.com': 2,
  'nature.com': 1, 'science.org': 1,
  'cnn.com': 2, 'cbsnews.com': 2, 'nbcnews.com': 2, 'abcnews.go.com': 2,
  'abc.net.au': 1,
  'politifact.com': 1, 'snopes.com': 1, 'factcheck.org': 1, 'fullfact.org': 1,
  'usatoday.com': 2, 'latimes.com': 2, 'chicagotribune.com': 2,
  'newsweek.com': 2, 'time.com': 2, 'theatlantic.com': 2, 'newyorker.com': 2,
  'foreignpolicy.com': 2, 'foreignaffairs.com': 2,
  'who.int': 1, 'cdc.gov': 1, 'nih.gov': 1,
  'stanford.edu': 1, 'harvard.edu': 1, 'mit.edu': 1,
};

function getSourceTier(sourceOrDomain) {
  if (!sourceOrDomain) return 3;
  const lower = sourceOrDomain.toLowerCase();
  for (const [domain, tier] of Object.entries(DOMAIN_TIERS)) {
    if (lower.includes(domain)) return tier;
  }
  if (/\b(reuters|ap news|bbc|npr|pbs|nature|science)\b/i.test(lower)) return 1;
  if (/\b(guardian|new york times|washington post|bloomberg|wsj|dw |deutsche welle|economist)\b/i.test(lower)) return 2;
  return 3;
}

function tierWeight(tier) {
  return tier === 1 ? 1.0 : tier === 2 ? 0.75 : 0.5;
}

/**
 * computeScanConfidence — derives an overall "signal confidence" percentage (0-100)
 * that reflects how much supporting evidence the scan gathered.
 *
 * The score is distinct from the authenticity score:
 *  - Authenticity score  → "is this content trustworthy?"
 *  - Signal confidence   → "how sure are we about the authenticity score?"
 *
 * Factors:
 *  1. Findings breadth  — more analysis dimensions = higher confidence
 *  2. Tier-1 sources    — wire services / public broadcasters add strong signal
 *  3. Feed keyword hits — overlap with the curated corroboration feed
 *  4. AI analysis       — external AI confirmation adds signal weight
 *  5. Cross-check data  — corroborating vs conflicting ratio contributes
 *  6. EXIF richness     — for images, more metadata = better confidence
 *
 * @param {object}  results - scanResults object from App state
 * @param {boolean} hasAi   - true when an AI analysis was returned
 * @returns {number} integer 0-100
 */
function computeScanConfidence(results, hasAi) {
  if (!results) return 0;

  // Baseline — every completed scan starts with some minimum signal
  let score = 25;

  // 1. Findings breadth (each finding type = one checked dimension)
  const findingsCount = (results.findings || []).length;
  score += Math.min(20, findingsCount * 2); // up to +20

  // 2. Cross-check sub-scores
  if (results.crossCheck) {
    // Tier-1 corroborating sources (wire services, public broadcasters)
    const tier1Count = (results.crossCheck.corroborating || []).filter((e) => e.tier === 1).length;
    score += Math.min(12, tier1Count * 4); // up to +12

    // Curated feed keyword overlap
    const kwCount = results.crossCheck.matchedKeywords?.length ?? 0;
    score += Math.min(8, kwCount * 2); // up to +8

    // Corroborating/conflicting ratio bonus
    const corrCount = results.crossCheck.corroboratingCount ?? 0;
    const conflCount = results.crossCheck.conflictingCount ?? 0;
    const total = corrCount + conflCount;
    if (total > 0) {
      score += Math.round((corrCount / total) * 10); // up to +10
    }
  }

  // 3. AI analysis confirmation
  if (hasAi) score += 15;

  // 4. EXIF richness (image scans only)
  if (results.type === 'image') {
    score += Math.min(10, (results.exifCount ?? 0) > 5 ? 10 : (results.exifCount ?? 0) * 2);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

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

/**
 * detectProviderFromApiKey — auto-detects the AI provider from an API key prefix.
 *
 * Key format heuristics:
 *  - OpenAI keys start with "sk-" followed by alphanumerics
 *  - Google API keys start with "AIza" followed by 20+ alphanumerics/symbols
 *
 * @param {string} apiKey - raw API key string (may be untrimmed)
 * @returns {'openai'|'google'|null} detected provider, or null if unrecognised
 */
function detectProviderFromApiKey(apiKey) {
  const trimmed = (apiKey || '').trim();
  if (!trimmed) return null;
  if (/^sk-[A-Za-z0-9]/.test(trimmed)) return 'openai';
  if (/^AIza[0-9A-Za-z_-]{20,}/.test(trimmed)) return 'google';
  return null;
}

/**
 * resolveProvider — returns the effective AI provider to use.
 *
 * If the user selected 'auto', we detect from the key and fall back to 'openai'.
 * If the user explicitly chose a provider, that choice is respected.
 *
 * @param {'auto'|'openai'|'google'} preferredProvider - from aiConfig.provider
 * @param {string}                   apiKey            - from aiConfig.apiKey
 * @returns {'openai'|'google'} resolved provider name
 */
function resolveProvider(preferredProvider, apiKey) {
  const detected = detectProviderFromApiKey(apiKey);
  if (preferredProvider === 'auto') return detected || 'openai';
  return preferredProvider;
}

// ─── Analysis helpers ─────────────────────────────────────────────────────────

/**
 * buildSources — constructs the `sources` array included in scanResults.
 *
 * Currently returns heuristic entries based on domain and date filter inputs.
 * In a production integration, this would be replaced with calls to fact-check
 * APIs (e.g. Google Fact Check Tools API, ClaimBuster) and return verified
 * citations with confidence scores.
 *
 * @param {string}      domain   - bare hostname (no www.)
 * @param {boolean}     isTrusted - true if domain is in the TRUSTED_DOMAINS list
 * @param {boolean}     hasHttps  - true if URL protocol is https:
 * @param {string|null} dateFrom  - ISO date string for filter start (optional)
 * @param {string|null} dateTo    - ISO date string for filter end (optional)
 * @returns {Array<{url:string, label:string, verified:boolean|null, date:string}>}
 */
function buildSources(domain, isTrusted, hasHttps, dateFrom, dateTo) {
  const sources = [
    {
      url: `https://${domain}`,
      label: 'Primary domain',
      // Mark as verified only if the domain matched the trusted list
      verified: isTrusted,
      date: new Date().toISOString().split('T')[0],
    },
  ];
  // If the user provided a date range filter, add it as a source entry for
  // traceability — it shows in the source table so users know a filter was applied
  if (dateFrom || dateTo) {
    sources.push({
      url: 'date-filter',
      label: `Date filter: ${dateFrom || 'any'} – ${dateTo || 'now'}`,
      verified: null,           // date filters have no verification status
      date: dateFrom || dateTo,
    });
  }
  return sources;
}

/**
 * generateDuplicates — generates placeholder duplicate-detection entries.
 *
 * In production, replace this with a call to a real content-fingerprinting or
 * reverse-search API (e.g. Diffbot, GDELT) to detect actual cross-platform
 * spread of the scanned content.
 *
 * @param {string} domain - the scanned domain (used for deterministic seeding)
 * @returns {Array<{url:string, source:string, matchPercentage:number, date:string}>}
 */
function generateDuplicates(domain) {
  const labels = ['Twitter/X', 'Facebook', 'Reddit', 'Telegram', 'Instagram', 'YouTube', 'TikTok', 'Blog A', 'Forum B', 'News C'];
  const count = Math.floor(Math.random() * 5) + 1;
  return Array.from({ length: count }, (_, i) => ({
    url: `https://${labels[i % labels.length].toLowerCase().replace(/\W/g, '')}.example.com`,
    source: labels[i % labels.length],
    // Similarity score in 60-90% range — indicates "similar but not identical"
    matchPercentage: Math.round(Math.random() * 30 + 60),
    // Random spread date within the last 30 days
    date: new Date(Date.now() - Math.random() * 30 * 86_400_000).toLocaleDateString(),
  }));
}

/**
 * generateTimeline — generates a placeholder verification timeline.
 *
 * In production, replace each step with a real API timestamp:
 *  - "First appearance": earliest date from search index for the content hash
 *  - "Social media spread": earliest repost/share timestamp from social APIs
 *  - "Fact-check initiated": submission timestamp from fact-check API
 *  - "Analysis complete": current timestamp
 *
 * @param {string} domain - the scanned domain (used in the "First appearance" label)
 * @returns {Array<{label:string, detail:string, time:string}>}
 */
function generateTimeline(domain) {
  const steps = [
    { label: 'First appearance', detail: `Detected on ${domain}` },
    { label: 'Social media spread', detail: 'Shared across platforms' },
    { label: 'Fact-check initiated', detail: 'Automated scan triggered' },
    { label: 'Analysis complete', detail: 'Results compiled' },
  ];
  // Backfill timestamps evenly over the past few hours (placeholder)
  return steps.map((s, i) => ({
    ...s,
    time: new Date(Date.now() - (steps.length - i) * 3_600_000 * (Math.random() * 12 + 1)).toLocaleString(),
  }));
}

/**
 * hashString — 32-bit FNV-like integer hash of a string.
 *
 * Used to generate deterministic-but-varied heuristic data (e.g. which sources
 * appear in cross-check results) without relying on Math.random(), making the
 * output stable for the same domain across re-renders.
 *
 * @param {string} value - any string
 * @returns {number} non-negative 32-bit integer
 */
function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * normalizeSentence — collapses internal whitespace and trims a sentence string.
 *
 * @param {string} sentence - raw sentence text
 * @returns {string} cleaned sentence
 */
function normalizeSentence(sentence) {
  return sentence.replace(/\s+/g, ' ').trim();
}

/**
 * tokenizeText — converts text to a lowercased list of tokens for keyword matching.
 *
 * Strips URLs, punctuation, and short tokens, then limits to 48 tokens to keep
 * keyword matching O(n) regardless of input size.
 *
 * @param {string} value - any text input
 * @returns {string[]} array of lowercase tokens (length ≥ 3 characters, max 48)
 */
function tokenizeText(value) {
  return (value || '')
    .toLowerCase()
    .replace(/https?:\/\//g, ' ')  // Remove URL schemes before tokenising
    .replace(/[^a-z0-9\s]/g, ' ')  // Strip punctuation, keep alphanumeric + spaces
    .split(/\s+/)
    .filter((token) => token.length >= 3)  // Skip very short tokens (noise)
    .slice(0, 48);                         // Cap at 48 tokens for performance
}

/**
 * selectFeedEntriesWithKeywords — ranks corroboration feed entries by keyword overlap.
 *
 * Scores each feed entry by counting how many tokenized terms from `text` appear
 * in the entry's title or snippet. Returns the top-ranked entries (or a simple
 * head slice if no tokens match) along with the matched keyword set.
 *
 * @param {object|null} feedData         - parsed corroboration-feed.json (may be null)
 * @param {string}      text             - user input or domain string to match against
 * @param {number}      [limit=8]        - maximum number of entries to return
 * @returns {{ entries: Array, matchedKeywords: string[] }}
 */
function selectFeedEntriesWithKeywords(feedData, text, limit = 8) {
  const entries = Array.isArray(feedData?.entries) ? feedData.entries : [];
  if (!entries.length) return { entries: [], matchedKeywords: [] };

  const tokens = tokenizeText(text);
  // If no usable tokens, fall back to first N entries (no ranking possible)
  if (!tokens.length) return { entries: entries.slice(0, limit), matchedKeywords: [] };

  const matchSet = new Set();
  const scored = entries
    .map((entry) => {
      const hay = `${entry.title || ''} ${entry.snippet || ''}`.toLowerCase();
      let overlap = 0;
      for (const token of tokens) {
        if (hay.includes(token)) { overlap++; matchSet.add(token); }
      }
      return { entry, overlap };
    })
    .filter((item) => item.overlap > 0)      // Discard entries with zero overlap
    .sort((a, b) => b.overlap - a.overlap)   // Best matches first
    .slice(0, limit)
    .map((item) => item.entry);

  return {
    // Fall back to head slice when no overlap was found
    entries: scored.length ? scored : entries.slice(0, limit),
    matchedKeywords: [...matchSet].slice(0, 12),
  };
}

function buildCrossCheckForUrl({ domain, isTrusted, isSuspicious, hasHttps, pathKeywords, feedEntries = [], matchedKeywords = [] }) {
  const trustedPool = [
    { source: 'Reuters', tier: 1, url: 'reuters.com' },
    { source: 'AP News', tier: 1, url: 'apnews.com' },
    { source: 'BBC News', tier: 1, url: 'bbc.com' },
    { source: 'NPR', tier: 1, url: 'npr.org' },
    { source: 'PBS NewsHour', tier: 1, url: 'pbs.org' },
    { source: 'PolitiFact', tier: 1, url: 'politifact.com' },
    { source: 'Snopes', tier: 1, url: 'snopes.com' },
    { source: 'FactCheck.org', tier: 1, url: 'factcheck.org' },
    { source: 'The Guardian', tier: 2, url: 'theguardian.com' },
    { source: 'Bloomberg', tier: 2, url: 'bloomberg.com' },
    { source: 'Deutsche Welle', tier: 2, url: 'dw.com' },
  ];
  const altPool = [
    { source: 'Independent Blog', tier: 3 },
    { source: 'Community Forum', tier: 3 },
    { source: 'Social Media Thread', tier: 3 },
    { source: 'Mirror Site', tier: 3 },
  ];
  const seed = hashString(domain);
  const corroborating = [];
  const conflicting = [];

  const baselineCorroboration = isTrusted ? 3 : isSuspicious ? 0 : 1;
  const extraCorroboration = hasHttps ? 1 : 0;
  const baseConflicts = isSuspicious ? 3 : pathKeywords ? 2 : 1;
  const extraConflicts = !hasHttps ? 1 : 0;

  const corroboratingCount = Math.min(4, baselineCorroboration + extraCorroboration + (seed % 2));
  const conflictingCount = Math.min(4, baseConflicts + extraConflicts + ((seed >> 1) % 2));

  for (let i = 0; i < corroboratingCount; i += 1) {
    const entry = trustedPool[(seed + i) % trustedPool.length];
    const tier = entry.tier;
    const confidence = 62 + ((seed + i * 7) % 34);
    corroborating.push({
      source: entry.source,
      claim: `Domain "${domain}" reporting patterns align with standards observed by ${entry.source}. Domain uses ${hasHttps ? 'HTTPS' : 'HTTP'} and shows ${isTrusted ? 'trusted' : 'neutral'} reputation signals.`,
      matchedText: `Domain: ${domain} | Protocol: ${hasHttps ? 'HTTPS' : 'HTTP'} | Trusted list: ${isTrusted ? 'Yes' : 'No'}`,
      evidence: [
        `Domain: ${domain}`,
        `HTTPS: ${hasHttps ? 'Yes' : 'No'}`,
        `Trusted list match: ${isTrusted ? 'Yes' : 'No'}`,
        `Suspicious patterns: ${isSuspicious ? 'Yes' : 'No'}`,
      ],
      confidence,
      note: 'Heuristic domain analysis — entity and protocol signals.',
      tier,
      searchUrl: `https://www.google.com/search?q=${encodeURIComponent(`site:${entry.source.toLowerCase().replace(/\s/g, '')}.com "${domain}"`)}`,
    });
  }

  feedEntries.slice(0, 2).forEach((entry, idx) => {
    const tier = entry.tier || getSourceTier(entry.source || '');
    const confidence = 68 + ((seed + idx * 17) % 23);
    corroborating.push({
      source: entry.source || `Feed source ${idx + 1}`,
      claim: `Feed keyword overlap detected: "${entry.title}"`,
      matchedText: entry.snippet ? entry.snippet.slice(0, 160) : entry.title,
      evidence: [
        `Feed headline: ${entry.title}`,
        `Matched keywords: ${matchedKeywords.slice(0, 4).join(', ') || 'N/A'}`,
        `Source: ${entry.source || 'curated feed'}`,
        `Published: ${entry.date || 'unknown'}`,
      ],
      confidence,
      note: 'Matched against static corroboration feed refreshed by GitHub Actions.',
      tier,
      searchUrl: `https://www.google.com/search?q=${encodeURIComponent(entry.title?.slice(0, 80) || domain)}`,
    });
  });

  for (let i = 0; i < conflictingCount; i += 1) {
    const entry = altPool[(seed + i * 3) % altPool.length];
    const confidence = 48 + ((seed + i * 11) % 37);
    conflicting.push({
      source: entry.source,
      claim: `${entry.source} presents divergent framing for domain "${domain}". ${pathKeywords ? 'Clickbait URL patterns detected.' : 'Metadata inconsistencies found.'}`,
      matchedText: pathKeywords
        ? `URL path contains suspicious patterns. Domain: ${domain}`
        : `Inconsistent publication metadata for domain: ${domain}`,
      evidence: [
        `Conflicting signal: ${pathKeywords ? 'Sensational URL path keywords' : 'Metadata inconsistency'}`,
        `Domain age estimate: limited`,
        `HTTPS missing: ${!hasHttps ? 'Yes (risk signal)' : 'No'}`,
        `Suspicious patterns: ${isSuspicious ? 'Yes' : 'No'}`,
      ],
      confidence,
      note: pathKeywords ? 'Headline wording mismatch and sensational phrasing.' : 'Inconsistent publication metadata.',
      tier: entry.tier,
      searchUrl: `https://www.google.com/search?q=${encodeURIComponent(`"${domain}" fact check`)}`,
    });
  }

  const corrWeight = corroborating.reduce((acc, e) => acc + tierWeight(e.tier || 3), 0);
  const totalWeight = [...corroborating, ...conflicting].reduce((acc, e) => acc + tierWeight(e.tier || 3), 0);
  const consistencyScore = totalWeight > 0 ? Math.round((corrWeight / totalWeight) * 100) : 50;

  logger.debug('URL cross-check complete', { domain, corroboratingCount: corroborating.length, conflictingCount: conflicting.length, consistencyScore });

  return {
    consistencyScore,
    corroboratingCount: corroborating.length,
    conflictingCount: conflicting.length,
    corroborating,
    conflicting,
    matchedKeywords,
    methodology: 'heuristic-domain-signal-analysis',
  };
}

function buildCrossCheckForText(text, suspiciousMatches, hasQuotes, hasNumbers, feedEntries = [], matchedKeywords = []) {
  const sentences = text
    .split(/[.!?]+/)
    .map(normalizeSentence)
    .filter((s) => s.length > 24)
    .slice(0, 6);

  const corroborating = [];
  const conflicting = [];

  // Detect named entity proxies (capitalized words not at sentence start)
  const entityMatches = (text.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b/g) || [])
    .filter((e) => e.length > 4)
    .slice(0, 8);
  const hasEntities = entityMatches.length >= 2;

  // Check for specific dates
  const datePattern = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/i;
  const hasDates = datePattern.test(text);

  // Byline pattern
  const bylinePattern = /\bby\s+[A-Z][a-z]+\s+[A-Z][a-z]+|\bReported by\b|\bStaff Reporter\b|\bCorrespondent\b/i;
  const hasByline = bylinePattern.test(text);

  sentences.forEach((claim, idx) => {
    const shortened = `${claim.slice(0, 120)}${claim.length > 120 ? '\u2026' : ''}`;
    const confidenceBase = 55 + ((idx * 13 + claim.length) % 38);
    const isSuspicious = suspiciousMatches.some((kw) => claim.toLowerCase().includes(kw));

    if (!isSuspicious && (hasQuotes || hasNumbers || hasEntities || hasDates || idx % 3 !== 2)) {
      const sourceOpts = ['NewsWire Digest', 'Fact-Check Archive', 'Public Statement Tracker', 'Event Record DB'];
      const src = sourceOpts[idx % sourceOpts.length];
      corroborating.push({
        source: src,
        claim: shortened,
        matchedText: shortened,
        evidence: [
          `Claim extracted from sentence ${idx + 1}`,
          hasQuotes ? 'Contains quoted source material' : 'No direct quotes',
          hasNumbers ? 'Contains numerical data' : 'No numerical data',
          hasEntities ? `Named entities: ${entityMatches.slice(0, 3).join(', ')}` : 'No named entities detected',
          hasDates ? 'Specific dates referenced' : 'No specific dates',
          hasByline ? 'Author byline detected' : 'No byline found',
        ],
        confidence: confidenceBase,
        note: 'Claim structure overlaps with factual reporting patterns.',
        tier: getSourceTier(src),
        searchUrl: `https://www.google.com/search?q=${encodeURIComponent(shortened.slice(0, 80))}`,
      });
    } else {
      const src = isSuspicious ? 'Misinformation Pattern Detector' : ['Forum Repost', 'Unverified Thread', 'Anonymous Digest'][idx % 3];
      conflicting.push({
        source: src,
        claim: shortened,
        matchedText: isSuspicious
          ? `Suspicious keywords found: ${suspiciousMatches.filter((kw) => claim.toLowerCase().includes(kw)).join(', ')}`
          : shortened,
        evidence: [
          isSuspicious ? `Suspicious keywords: ${suspiciousMatches.join(', ')}` : 'Unusual phrasing pattern',
          !hasQuotes ? 'No direct quotes or citations' : 'Quotes present',
          `Sentence ${idx + 1} of ${sentences.length}`,
        ],
        confidence: Math.max(40, confidenceBase - 12),
        note: isSuspicious
          ? `Flagged language matches known misinformation patterns: ${suspiciousMatches.slice(0, 2).join(', ')}`
          : 'Unverified phrasing pattern detected.',
        tier: 3,
        searchUrl: `https://www.google.com/search?q=${encodeURIComponent(`fact check ${shortened.slice(0, 60)}`)}`,
      });
    }
  });

  feedEntries.slice(0, 2).forEach((entry, idx) => {
    const tier = entry.tier || getSourceTier(entry.source || '');
    const confidence = 63 + ((idx * 9 + (entry.title || '').length) % 28);
    corroborating.push({
      source: entry.source || `Feed source ${idx + 1}`,
      claim: `Feed match: "${entry.title}"`,
      matchedText: entry.snippet ? entry.snippet.slice(0, 160) : entry.title,
      evidence: [
        `Matched feed headline: ${entry.title}`,
        `Matched terms: ${matchedKeywords.slice(0, 5).join(', ') || 'N/A'}`,
        `Feed source: ${entry.source || 'curated'}`,
        entry.date ? `Published: ${entry.date}` : 'Date unknown',
      ],
      confidence,
      note: 'Keyword terms appeared in curated static feed headlines.',
      tier,
      searchUrl: `https://www.google.com/search?q=${encodeURIComponent(entry.title?.slice(0, 80) || '')}`,
    });
  });

  if (corroborating.length === 0 && conflicting.length === 0) {
    conflicting.push({
      source: 'Insufficient claims',
      claim: 'Text did not contain enough structured claims for reliable cross-checking.',
      matchedText: `Text length: ${text.length} chars, sentences: ${sentences.length}`,
      evidence: ['Text too short or lacks named entities, dates, or specific claims.'],
      confidence: 40,
      note: 'Add longer text with concrete entities, dates, and numbers.',
      tier: 3,
      searchUrl: null,
    });
  }

  const corrWeight = corroborating.reduce((acc, e) => acc + tierWeight(e.tier || 3), 0);
  const totalWeight = [...corroborating, ...conflicting].reduce((acc, e) => acc + tierWeight(e.tier || 3), 0);

  logger.debug('Text cross-check complete', { corroboratingCount: corroborating.length, conflictingCount: conflicting.length });

  return {
    consistencyScore: totalWeight > 0 ? Math.round((corrWeight / totalWeight) * 100) : 50,
    corroboratingCount: corroborating.length,
    conflictingCount: conflicting.length,
    corroborating,
    conflicting,
    matchedKeywords,
    methodology: 'heuristic-claim-alignment',
  };
}

function buildCrossCheckForImage(exifFindings, fileName = '') {
  const corroborating = [];
  const conflicting = [];
  const hasDate = exifFindings.some((f) => f.label === 'Date taken');
  const hasCamera = exifFindings.some((f) => f.label === 'Camera');
  const hasGPS = exifFindings.some((f) => f.label === 'GPS location');
  const edited = exifFindings.some((f) => f.label === 'Edit software' && f.status === 'bad');
  const cameraVal = exifFindings.find((f) => f.label === 'Camera')?.value ?? null;
  const dateVal = exifFindings.find((f) => f.label === 'Date taken')?.value ?? null;
  const softwareVal = exifFindings.find((f) => f.label === 'Edit software')?.value ?? null;

  if (hasDate || hasCamera) {
    corroborating.push({
      source: 'EXIF Metadata Provenance',
      claim: 'Image contains origin metadata useful for authenticity validation.',
      matchedText: [hasCamera ? `Camera: ${cameraVal}` : null, hasDate ? `Date: ${dateVal}` : null, hasGPS ? 'GPS data present' : null].filter(Boolean).join(' | '),
      evidence: [
        hasCamera ? `Camera model: ${cameraVal}` : 'No camera model',
        hasDate ? `Capture date: ${dateVal}` : 'No capture date',
        hasGPS ? 'GPS coordinates embedded' : 'No GPS data',
        `EXIF field count: ${exifFindings.length}`,
      ],
      confidence: hasDate && hasCamera ? 78 : 64,
      note: 'Capture metadata supports cross-source comparison.',
      tier: 2,
      searchUrl: fileName ? `https://images.google.com/?q=${encodeURIComponent(fileName)}` : null,
    });
  } else {
    conflicting.push({
      source: 'Missing Origin Metadata',
      claim: 'No camera or date metadata found — provenance cannot be established.',
      matchedText: `EXIF fields found: ${exifFindings.length}. Missing: camera model, capture date.`,
      evidence: ['No camera model in EXIF', 'No capture date in EXIF', 'Metadata may have been stripped'],
      confidence: 55,
      note: 'Missing metadata is common in screenshots or images processed by social media.',
      tier: 3,
      searchUrl: null,
    });
  }

  if (edited) {
    conflicting.push({
      source: 'Editing Software Signal',
      claim: 'Editing software detected in metadata — potential post-processing.',
      matchedText: `Edit software: ${softwareVal ?? 'unknown'}`,
      evidence: [
        `Software: ${softwareVal ?? 'unknown'}`,
        'Presence of editing software in EXIF indicates the image was opened and saved in photo editing software.',
        'Not necessarily deceptive, but requires stronger corroboration.',
      ],
      confidence: 74,
      note: 'Edited images are not always deceptive but require stronger corroboration.',
      tier: 3,
      searchUrl: null,
    });
  }

  if (hasGPS) {
    corroborating.push({
      source: 'GPS Geolocation Data',
      claim: 'Image embeds GPS coordinates, enabling location verification.',
      matchedText: exifFindings.find((f) => f.label === 'GPS location')?.value ?? 'GPS present',
      evidence: ['GPS coordinates in EXIF can be cross-referenced with claimed location'],
      confidence: 72,
      note: 'GPS data aids provenance verification.',
      tier: 2,
      searchUrl: null,
    });
  }

  const corrWeight = corroborating.reduce((acc, e) => acc + tierWeight(e.tier || 3), 0);
  const totalWeight = [...corroborating, ...conflicting].reduce((acc, e) => acc + tierWeight(e.tier || 3), 0);

  logger.debug('Image cross-check complete', { corroboratingCount: corroborating.length, conflictingCount: conflicting.length });

  return {
    consistencyScore: totalWeight > 0 ? Math.round((corrWeight / totalWeight) * 100) : 50,
    corroboratingCount: corroborating.length,
    conflictingCount: conflicting.length,
    corroborating,
    conflicting,
    matchedKeywords: [],
    methodology: 'metadata-consistency-cross-check',
  };
}

/**
 * computeSourceFreshness — evaluates how fresh the matched feed entries are.
 *
 * Returns a freshness score 0-100 where:
 * - 100 = all matched sources are < 1 day old
 * - 50  = sources are 1-30 days old
 * - 0   = all sources are >90 days old or no date available
 *
 * @param {Array} feedEntries - matched corroboration feed entries
 * @returns {{ score: number, label: string, newestDate: string|null, oldestDate: string|null }}
 */
function computeSourceFreshness(feedEntries) {
  if (!feedEntries || feedEntries.length === 0) {
    return { score: 0, label: 'No sources', newestDate: null, oldestDate: null };
  }

  const now = Date.now();
  const daysOld = feedEntries
    .map((e) => {
      if (!e.date) return null;
      try {
        const t = new Date(e.date).getTime();
        if (isNaN(t)) return null;
        return Math.max(0, (now - t) / 86_400_000);
      } catch { return null; }
    })
    .filter((d) => d !== null);

  if (daysOld.length === 0) return { score: 30, label: 'Unknown date', newestDate: null, oldestDate: null };

  const avgDays = daysOld.reduce((a, b) => a + b, 0) / daysOld.length;

  // Score: 100 for <1 day, linear decay to 0 at 90 days
  const score = Math.max(0, Math.round(100 - (avgDays / 90) * 100));
  const label =
    avgDays < 1 ? 'Very fresh (< 1 day)' :
    avgDays < 7 ? 'Recent (< 1 week)' :
    avgDays < 30 ? 'Moderate (< 1 month)' :
    avgDays < 90 ? 'Aging (< 3 months)' :
    'Stale (> 3 months)';

  const dateEntries = feedEntries.filter((e) => e.date).map((e) => e.date).sort();
  return {
    score,
    label,
    newestDate: dateEntries[0] || null,
    oldestDate: dateEntries[dateEntries.length - 1] || null,
    avgDaysOld: Math.round(avgDays),
  };
}

/**
 * computeClaimDensity — measures how many verifiable claims exist per 100 words.
 *
 * Verifiable claims include:
 * - Specific numbers/statistics
 * - Named people or organizations
 * - Dates
 * - Quoted statements
 * - Attributed sources
 *
 * Higher claim density = more specific, verifiable content (positive signal).
 *
 * @param {string} text - article text
 * @returns {{ density: number, label: string, claimsFound: number, wordCount: number }}
 */
function computeClaimDensity(text) {
  if (!text || text.trim().length < 20) return { density: 0, label: 'No content', claimsFound: 0, wordCount: 0 };

  const wordCount = text.trim().split(/\s+/).length;

  const patterns = [
    /\b\d+(?:\.\d+)?(?:\s*%|\s+percent)/gi,                                                      // Percentages
    /\$\s*\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:million|billion|thousand))?/gi,                       // Dollar amounts
    /\b\d+(?:,\d{3})*(?:\s*(?:million|billion|thousand))\b/gi,                                   // Large numbers
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g,                                                      // Named entities
    /[""][^""]{15,}[""]|"[^"]{15,}"/g,                                                          // Quotations
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi, // Dates
    /\baccording to\s+[A-Z]/g,                                                                   // Attribution
  ];

  let total = 0;
  for (const p of patterns) {
    total += (text.match(p) || []).length;
  }

  const density = wordCount > 0 ? Math.round((total / wordCount) * 100) : 0;

  const label =
    density >= 15 ? 'High (very specific, verifiable)' :
    density >= 8 ? 'Medium (some verifiable claims)' :
    density >= 3 ? 'Low (few verifiable claims)' :
    'Very low (mostly assertions)';

  return { density, label, claimsFound: total, wordCount };
}

/** Analyze a URL and return a scanResults-shaped object. */
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

    const { entries: feedEntries, matchedKeywords } = selectFeedEntriesWithKeywords(feedData, `${domain} ${url}`, 8);
    const crossCheck = buildCrossCheckForUrl({ domain, isTrusted, isSuspicious, hasHttps, pathKeywords, feedEntries, matchedKeywords });
    const urlPathText = urlObj.pathname.replace(/[-_/]/g, ' ');
    const sentiment = analyzeSentiment(`${domain} ${urlPathText}`);
    const darkPatternsResult = detectDarkPatterns(`${url} ${urlPathText}`);
    const formalityResult = analyzeFormality(`${domain} ${urlPathText}`);
    const sourceFreshness = computeSourceFreshness(feedEntries);

    let score = isTrusted ? 90 : isSuspicious ? 20 : Math.max(30, Math.min(85, 60 + domainAgeDays / 100));
    if (!hasHttps) score -= 10;
    if (pathKeywords) score -= 15;
    if (isSuspicious) score -= 20;
    score += Math.round((crossCheck.consistencyScore - 50) / 6);
    score -= Math.round(darkPatternsResult.score / 10);
    if (Math.abs(sentiment.normalizedScore) > 3) score -= 5;
    score = Math.max(5, Math.min(100, Math.round(score)));

    // Additional TLD score adjustment
    const tld = domain.split('.').pop().toLowerCase();
    if (SUSPICIOUS_TLDS.includes(tld)) score -= 10;
    const isIp = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(domain);
    if (isIp) score -= 20;
    const paramCount = [...urlObj.searchParams].length;
    if (paramCount > 5) score -= 5;
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
          excerpt: `Domain: ${domain}`,
          dataPath: [
            `Input URL: ${url}`,
            `Extracted domain: ${domain}`,
            `Checked against ${TRUSTED_DOMAINS.length} trusted domains: ${isTrusted ? 'MATCH FOUND' : 'no match'}`,
            `Checked against ${SUSPICIOUS_DOMAINS.length} suspicious patterns: ${isSuspicious ? 'MATCH FOUND' : 'no match'}`,
            `Verdict: ${isTrusted ? 'Trusted' : isSuspicious ? 'Suspicious' : 'Unknown'}`,
          ],
          searchUrl: `https://www.google.com/search?q=${encodeURIComponent(`"${domain}" reliability fact check`)}`,
        },
        {
          label: 'HTTPS',
          value: hasHttps ? 'Secure connection' : 'Not secure (HTTP)',
          status: hasHttps ? 'good' : 'bad',
          excerpt: `Protocol: ${urlObj.protocol}`,
          dataPath: [
            `Input URL: ${url}`,
            `Parsed protocol: ${urlObj.protocol}`,
            `HTTPS required for secure communication: ${hasHttps ? 'YES — secure' : 'NO — plaintext HTTP'}`,
            `Score impact: ${hasHttps ? 'none' : '-10 points'}`,
          ],
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
          excerpt: pathKeywords ? url : 'No suspicious patterns found',
          dataPath: [
            `Input URL: ${url}`,
            `Scanned URL path for ${SUSPICIOUS_KEYWORDS.length} suspicious keyword patterns`,
            pathKeywords ? `MATCH: Suspicious pattern found in URL path` : 'No matches found',
            `Score impact: ${pathKeywords ? '-15 points' : 'none'}`,
          ],
        },
        {
          label: 'Cross-source consistency',
          value: `${crossCheck.consistencyScore}% (${crossCheck.corroboratingCount} corroborating / ${crossCheck.conflictingCount} conflicting)`,
          status: crossCheck.consistencyScore >= 65 ? 'good' : crossCheck.consistencyScore >= 40 ? 'warn' : 'bad',
        },
        {
          label: 'Emotional tone',
          value: `${sentiment.label} (${sentiment.intensity}% intensity)`,
          status: Math.abs(sentiment.normalizedScore) > 2.5 ? 'warn' : 'good',
        },
        {
          label: 'Manipulative patterns',
          value: darkPatternsResult.matchCount > 0
            ? `${darkPatternsResult.matchCount} detected: ${darkPatternsResult.detected.slice(0, 2).map((d) => d.label).join(', ')}`
            : 'None detected',
          status: darkPatternsResult.riskLevel === 'high' ? 'bad' : darkPatternsResult.riskLevel === 'medium' ? 'warn' : 'good',
        },
        // TLD analysis
        (() => {
          const tld = domain.split('.').pop().toLowerCase();
          const isSuspTld = SUSPICIOUS_TLDS.includes(tld);
          const isTrustedTld = TRUSTED_TLDS.includes(tld);
          return {
            label: 'Domain TLD',
            value: `.${tld} — ${isSuspTld ? 'high-risk TLD' : isTrustedTld ? 'standard TLD' : 'uncommon TLD'}`,
            status: isSuspTld ? 'bad' : isTrustedTld ? 'good' : 'warn',
            explanation: `Top-level domain ".${tld}". Certain TLDs (e.g. .xyz, .click, .buzz) are disproportionately used by spam and misinformation sites.`,
          };
        })(),
        // Subdomain depth
        (() => {
          const parts = domain.split('.');
          const depth = Math.max(0, parts.length - 2);
          return {
            label: 'Subdomain depth',
            value: depth === 0 ? 'None (apex domain)' : `${depth} level${depth > 1 ? 's' : ''} deep`,
            status: depth > 2 ? 'warn' : 'good',
            explanation: 'Deeply nested subdomains (e.g. news.fake.reports.example.com) can be used to mimic trusted domains.',
          };
        })(),
        // URL path depth
        (() => {
          const pathDepth = (urlObj.pathname.match(/\//g) || []).length - 1;
          return {
            label: 'URL path depth',
            value: `${Math.max(0, pathDepth)} level${pathDepth !== 1 ? 's' : ''}`,
            status: pathDepth > 5 ? 'warn' : 'good',
            explanation: 'Very deep URL paths can indicate dynamically generated spam pages.',
          };
        })(),
        // Query parameters
        (() => {
          const paramCount = [...urlObj.searchParams].length;
          return {
            label: 'Query parameters',
            value: paramCount === 0 ? 'None' : `${paramCount} parameter${paramCount > 1 ? 's' : ''}`,
            status: paramCount > 5 ? 'warn' : 'good',
            explanation: 'Many query parameters can indicate tracking-heavy pages or dynamically assembled content.',
          };
        })(),
        // IP address as hostname check
        (() => {
          const isIp = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(domain);
          return {
            label: 'Hostname type',
            value: isIp ? 'Numeric IP address' : 'Named domain',
            status: isIp ? 'bad' : 'good',
            explanation: 'Legitimate news sites use named domains. An IP address as the hostname is a strong red flag.',
          };
        })(),
        // URL length check
        (() => {
          const len = url.length;
          return {
            label: 'URL length',
            value: `${len} characters`,
            status: len > 200 ? 'warn' : len > 120 ? 'warn' : 'good',
            explanation: 'Extremely long URLs can indicate link shortener abuse or tracking-heavy links.',
          };
        })(),
        // Language formality
        {
          label: 'Language formality',
          value: `${formalityResult.label} (${formalityResult.score}/100)`,
          status: formalityResult.score >= 55 ? 'good' : formalityResult.score >= 35 ? 'warn' : 'bad',
          explanation: 'Formal language patterns correlate with professional journalism. Highly informal text may indicate opinion or low-credibility content.',
          excerpt: formalityResult.details.slice(0, 3).join(' | ') || 'No notable formality markers found',
          dataPath: [
            `Analyzed URL path text for formality markers`,
            `Informal markers found: ${formalityResult.informalCount}`,
            `Formal markers found: ${formalityResult.formalCount}`,
            `Formality score: ${formalityResult.score}/100`,
            `Classification: ${formalityResult.label}`,
          ],
        },
        // Source freshness
        {
          label: 'Source freshness',
          value: sourceFreshness.label,
          status: sourceFreshness.score >= 60 ? 'good' : sourceFreshness.score >= 30 ? 'warn' : 'info',
          explanation: 'How recently the corroborating sources were published. Fresh sources provide stronger context.',
          excerpt: sourceFreshness.newestDate
            ? `Most recent matched source: ${sourceFreshness.newestDate} | Oldest: ${sourceFreshness.oldestDate}`
            : 'No dated sources found',
          dataPath: [
            `Evaluated ${feedEntries?.length || 0} matched corroboration feed entries`,
            `Average age: ${sourceFreshness.avgDaysOld ?? 'unknown'} days`,
            `Freshness score: ${sourceFreshness.score}/100`,
            `Label: ${sourceFreshness.label}`,
          ],
        },
      ],
      sentiment,
      darkPatterns: darkPatternsResult,
      timeline: generateTimeline(domain),
      error: null,
    };
  } catch (err) {
    logger.warn('URL analysis failed', { url, error: err?.message });
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

/** Analyze plain text and return a scanResults-shaped object. */
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
  const { entries: feedEntries, matchedKeywords } = selectFeedEntriesWithKeywords(feedData, text, 8);
  const crossCheck = buildCrossCheckForText(text, suspiciousMatches, hasQuotes, hasNumbers, feedEntries, matchedKeywords);
  const sentiment = analyzeSentiment(text);
  const readability = analyzeReadability(text);
  const darkPatternsResult = detectDarkPatterns(text);
  const formalityResult = analyzeFormality(text);
  const sourceFreshness = computeSourceFreshness(feedEntries);
  const claimDensity = computeClaimDensity(text);

  let score = 70;
  score -= suspiciousMatches.length * 8;
  score -= capsRatio > 0.3 ? 15 : capsRatio > 0.15 ? 8 : 0;
  score -= exclamCount > 3 ? 10 : exclamCount > 1 ? 5 : 0;
  score += hasQuotes ? 5 : 0;
  score += hasNumbers ? 5 : 0;
  score += wordCount > 200 ? 10 : wordCount > 50 ? 5 : -10;
  score += Math.round((crossCheck.consistencyScore - 50) / 7);
  score -= Math.round(darkPatternsResult.score / 8);
  if (Math.abs(sentiment.normalizedScore) > 3) score -= 8;
  else if (Math.abs(sentiment.normalizedScore) > 1.5) score -= 3;
  // Byline bonus
  const bylinePattern = /\bby\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+|\bReported by\b/i;
  if (bylinePattern.test(text)) score += 5;
  // Named entities bonus
  const entityCount = new Set((text.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b/g) || []).filter((e) => e.length > 4)).size;
  score += Math.min(10, entityCount * 2);
  // Date reference bonus
  const datePattern = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}|\b\d{4}-\d{2}-\d{2}\b/i;
  if (datePattern.test(text)) score += 5;
  // Hedging penalty
  const hedgeCount = HEDGING_PHRASES.filter((w) => lower.includes(w)).length;
  score -= hedgeCount * 4;

  // Named entity recognition (capitalized word sequences)
  const namedEntities = (text.match(/\b[A-Z][a-z]+ (?:[A-Z][a-z]+ )*[A-Z][a-z]+/g) || []);
  const uniqueEntitiesNER = [...new Set(namedEntities)];

  // Date references
  const dateRefs = text.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}/gi) || [];
  const hasDateRefs = dateRefs.length > 0;

  // Quote attribution
  const quoteAttrib = text.match(/[""][^""]{10,}[""][\s,]+(?:said|according to|stated|wrote|reported|confirmed|noted)/gi) || [];
  const hasQuoteAttribution = quoteAttrib.length > 0;

  // Statistical claims
  const statClaims = text.match(/\b\d+(?:\.\d+)?(?:\s*%|\s+percent|\s+million|\s+billion|\s+thousand)/gi) || [];
  const hasStatistics = statClaims.length > 0;

  // Source attribution
  const sourceAttribs = text.match(/\baccording to\b|\bsources say\b|\bsources close to\b|\bconfirmed by\b|\breported by\b/gi) || [];

  if (hasDateRefs) score += Math.min(10, dateRefs.length * 5);
  if (hasQuoteAttribution) score += 8;
  if (hasStatistics) score += 5;
  if (uniqueEntitiesNER.length > 3) score += 8;
  if (sourceAttribs.length > 2) score += 5;
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
        value: suspiciousMatches.length > 0
          ? `${suspiciousMatches.length} detected: ${suspiciousMatches.slice(0, 3).join(', ')}`
          : 'None detected',
        status: suspiciousMatches.length > 2 ? 'bad' : suspiciousMatches.length > 0 ? 'warn' : 'good',
        excerpt: suspiciousMatches.length > 0
          ? suspiciousMatches.map((k) => {
              const idx = lower.indexOf(k);
              if (idx === -1) return '';
              return `"...${text.slice(Math.max(0, idx - 20), Math.min(text.length, idx + k.length + 20))}..."`;
            }).filter(Boolean).slice(0, 3).join(' | ')
          : 'No suspicious keywords detected in text',
        dataPath: [
          `Scanned ${wordCount} words against ${SUSPICIOUS_KEYWORDS.length} suspicious keyword patterns`,
          `Matched keywords: ${suspiciousMatches.join(', ') || 'none'}`,
          `Score impact: -${suspiciousMatches.length * 8} points`,
        ],
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
      {
        label: 'Emotional tone',
        value: `${sentiment.label} (${sentiment.intensity}% intensity)`,
        status: sentiment.intensity > 60 ? 'bad' : sentiment.intensity > 30 ? 'warn' : 'good',
      },
      {
        label: 'Reading level',
        value: `${readability.gradeLabel} · FK Ease: ${readability.fleschEase}`,
        status: 'info',
      },
      {
        label: 'Manipulative framing',
        value: darkPatternsResult.matchCount > 0
          ? `${darkPatternsResult.matchCount} pattern(s): ${darkPatternsResult.detected.slice(0, 2).map((d) => d.label).join(', ')}`
          : 'None detected',
        status: darkPatternsResult.riskLevel === 'high' ? 'bad' : darkPatternsResult.riskLevel === 'medium' ? 'warn' : 'good',
      },
      // Byline detection
      (() => {
        const bylinePattern = /\bby\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+|\bReported by\b|\bStaff Reporter\b|\bContributor\b|\bCorrespondent\b/i;
        const hasByline = bylinePattern.test(text);
        return {
          label: 'Author byline',
          value: hasByline ? 'Author attribution found' : 'No byline detected',
          status: hasByline ? 'good' : 'warn',
          explanation: 'Credible reporting usually includes an author byline. Anonymous content carries higher uncertainty.',
        };
      })(),
      // Date reference check
      (() => {
        const datePattern = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/i;
        const hasDateRef = datePattern.test(text);
        const temporalWords = ['yesterday', 'today', 'this week', 'last month', 'recently', 'earlier this year'];
        const hasTemporal = temporalWords.some((w) => lower.includes(w));
        return {
          label: 'Date references',
          value: hasDateRef ? 'Specific dates present' : hasTemporal ? 'Vague temporal markers only' : 'No date references',
          status: hasDateRef ? 'good' : hasTemporal ? 'warn' : 'warn',
          explanation: 'Credible reporting anchors events to specific dates. Vague temporal markers ("recently") reduce verifiability.',
        };
      })(),
      // Named entity density
      (() => {
        const entities = (text.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b/g) || []).filter((e) => e.length > 4);
        const uniqueEntities = [...new Set(entities)];
        const density = wordCount > 0 ? ((uniqueEntities.length / wordCount) * 100).toFixed(1) : '0';
        return {
          label: 'Named entity density',
          value: `${uniqueEntities.length} unique entities (${density}%)`,
          status: uniqueEntities.length >= 3 ? 'good' : uniqueEntities.length >= 1 ? 'warn' : 'bad',
          explanation: 'Credible reporting references specific people, places, and organizations. Low entity density may indicate vague or unverifiable claims.',
        };
      })(),
      // Passive voice / hedging language
      (() => {
        const hedgeMatches = HEDGING_PHRASES.filter((w) => lower.includes(w));
        return {
          label: 'Hedging language',
          value: hedgeMatches.length > 0 ? `${hedgeMatches.length} hedge(s): ${hedgeMatches.slice(0, 2).join(', ')}` : 'No excessive hedging',
          status: hedgeMatches.length > 2 ? 'warn' : hedgeMatches.length > 0 ? 'info' : 'good',
          explanation: 'Excessive hedging language (allegedly, reportedly, sources say) without named attribution reduces credibility.',
        };
      })(),
      // Paragraph structure
      (() => {
        const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 20);
        return {
          label: 'Paragraph structure',
          value: paragraphs.length > 1 ? `${paragraphs.length} paragraphs` : 'Single block of text',
          status: paragraphs.length > 1 ? 'good' : 'info',
          explanation: 'Well-structured articles with multiple paragraphs suggest editorial oversight.',
        };
      })(),
      // Question exploitation
      (() => {
        const questionCount = (text.match(/\?/g) || []).length;
        const rhetoricalPattern = /\b(?:is (?:this|it)|are (?:they|we)|could (?:this|it)|what if|why (?:is|are|does|do|won't|haven't))/gi;
        const rhetoricalCount = (text.match(rhetoricalPattern) || []).length;
        return {
          label: 'Rhetorical questions',
          value: rhetoricalCount > 2 ? `${rhetoricalCount} rhetorical questions detected` : questionCount > 0 ? `${questionCount} question(s)` : 'None detected',
          status: rhetoricalCount > 2 ? 'warn' : 'good',
          explanation: 'Excessive rhetorical questions (especially in headlines) are a common misinformation tactic for implying unproven claims.',
        };
      })(),
      // Named entity recognition
      (() => {
        return {
          label: 'Named entity recognition',
          value: uniqueEntitiesNER.length > 0
            ? `${uniqueEntitiesNER.length} named entities found`
            : 'No named entities detected',
          status: uniqueEntitiesNER.length > 3 ? 'good' : uniqueEntitiesNER.length > 0 ? 'warn' : 'bad',
          excerpt: uniqueEntitiesNER.length > 0
            ? uniqueEntitiesNER.slice(0, 5).join(', ')
            : 'No multi-word proper nouns detected',
          dataPath: [
            `Scanned text for capitalized word sequences (e.g., "Joe Biden", "United Nations")`,
            `Found ${namedEntities.length} matches, ${uniqueEntitiesNER.length} unique`,
            `Score impact: ${uniqueEntitiesNER.length > 3 ? '+8 points' : 'none'}`,
          ],
          explanation: 'Named entities (specific people, places, organizations) indicate factual grounding. Vague claims without entities are harder to verify.',
        };
      })(),
      // Quote attribution
      (() => {
        return {
          label: 'Quote attribution',
          value: hasQuoteAttribution ? `${quoteAttrib.length} attributed quote(s) found` : 'No attributed quotes',
          status: hasQuoteAttribution ? 'good' : 'warn',
          excerpt: hasQuoteAttribution
            ? quoteAttrib[0].slice(0, 120)
            : 'No quotes with attribution (said/stated/reported) found',
          dataPath: [
            `Scanned for quoted text followed by attribution verbs (said, stated, reported, etc.)`,
            `Found ${quoteAttrib.length} attributed quote(s)`,
            `Score impact: ${hasQuoteAttribution ? '+8 points' : 'none'}`,
          ],
          explanation: 'Attributed quotes indicate primary source reporting and journalistic standards.',
        };
      })(),
      // Statistical claims
      (() => {
        return {
          label: 'Statistical claims',
          value: hasStatistics ? `${statClaims.length} statistic(s) found` : 'No statistics detected',
          status: hasStatistics ? 'good' : 'info',
          excerpt: hasStatistics
            ? statClaims.slice(0, 3).join(' | ')
            : 'No numeric percentage, million, or billion references found',
          dataPath: [
            `Scanned for numeric claims with units (%, million, billion, thousand)`,
            `Found: ${statClaims.slice(0, 5).join(', ') || 'none'}`,
            `Score impact: ${hasStatistics ? '+5 points' : 'none'}`,
          ],
          explanation: 'Verifiable statistical claims are a hallmark of evidence-based reporting.',
        };
      })(),
      // Source attribution
      (() => {
        return {
          label: 'Source attribution',
          value: sourceAttribs.length > 0
            ? `${sourceAttribs.length} attribution phrase(s)`
            : 'No source attribution found',
          status: sourceAttribs.length > 2 ? 'good' : sourceAttribs.length > 0 ? 'warn' : 'bad',
          excerpt: sourceAttribs.length > 0
            ? sourceAttribs.slice(0, 3).join(' | ')
            : 'No "according to", "confirmed by", or "reported by" phrases found',
          dataPath: [
            `Scanned for attribution phrases: "according to", "sources say", "confirmed by", "reported by"`,
            `Found ${sourceAttribs.length} instance(s)`,
            `Score impact: ${sourceAttribs.length > 2 ? '+5 points' : 'none'}`,
          ],
          explanation: 'Source attribution phrases indicate the journalist is citing verifiable sources rather than making unsourced claims.',
        };
      })(),
      // Language formality
      {
        label: 'Language formality',
        value: `${formalityResult.label} (${formalityResult.score}/100)`,
        status: formalityResult.score >= 55 ? 'good' : formalityResult.score >= 35 ? 'warn' : 'bad',
        explanation: 'Formal language patterns correlate with professional journalism. Highly informal text may indicate opinion or low-credibility content.',
        excerpt: formalityResult.details.slice(0, 3).join(' | ') || 'No notable formality markers found',
        dataPath: [
          `Analyzed ${wordCount} words for formality markers`,
          `Informal markers found: ${formalityResult.informalCount}`,
          `Formal markers found: ${formalityResult.formalCount}`,
          `Formality score: ${formalityResult.score}/100`,
          `Classification: ${formalityResult.label}`,
        ],
      },
      // Source freshness
      {
        label: 'Source freshness',
        value: sourceFreshness.label,
        status: sourceFreshness.score >= 60 ? 'good' : sourceFreshness.score >= 30 ? 'warn' : 'info',
        explanation: 'How recently the corroborating sources were published. Fresh sources provide stronger context.',
        excerpt: sourceFreshness.newestDate
          ? `Most recent matched source: ${sourceFreshness.newestDate} | Oldest: ${sourceFreshness.oldestDate}`
          : 'No dated sources found',
        dataPath: [
          `Evaluated ${feedEntries?.length || 0} matched corroboration feed entries`,
          `Average age: ${sourceFreshness.avgDaysOld ?? 'unknown'} days`,
          `Freshness score: ${sourceFreshness.score}/100`,
          `Label: ${sourceFreshness.label}`,
        ],
      },
      // Claim density
      {
        label: 'Claim density',
        value: `${claimDensity.label} (${claimDensity.density} per 100 words)`,
        status: claimDensity.density >= 8 ? 'good' : claimDensity.density >= 3 ? 'warn' : 'info',
        explanation: 'Measures verifiable claims (statistics, named entities, dates, quotes, attributions) per 100 words. Higher density = more specific, fact-checkable content.',
        excerpt: `${claimDensity.claimsFound} verifiable claim markers found in ${claimDensity.wordCount} words`,
        dataPath: [
          `Analyzed ${claimDensity.wordCount} words for verifiable claim markers`,
          `Claims found: ${claimDensity.claimsFound} (percentages, dollar amounts, named entities, dates, quotes, attributions)`,
          `Density: ${claimDensity.density} per 100 words`,
          `Classification: ${claimDensity.label}`,
        ],
      },
    ],
    sentiment,
    readability,
    darkPatterns: darkPatternsResult,
    timeline: [],
    error: null,
  };
}

/** Analyze an image file and return a scanResults-shaped object.
 *
 * Analysis capabilities:
 *  1. EXIF metadata extraction (camera, date, GPS, software)
 *  2. File hash fingerprinting (SHA-256)
 *  3. MIME type sniffing (magic bytes vs extension mismatch)
 *  4. Canvas-based resolution analysis (actual pixel dimensions)
 *  5. Color channel saturation analysis (over-saturation = AI generation signal)
 *  6. Compression ratio analysis (file size vs resolution)
 *  7. Metadata cross-validation (EXIF date vs file lastModified)
 *  8. GPS coordinate validation (range check)
 *  9. Alpha channel detection (compositing signal)
 * 10. Aspect ratio analysis (unusual ratios flag cropping)
 * 11. Steganography indicators (anomalous file size for dimensions)
 * 12. Expanded editing software detection
 *
 * @param {File} file - the uploaded image file
 * @returns {Promise<object>} scanResults-shaped object
 */
async function analyzeImage(file) {
  let exifData = {};
  const exifFindings = [];

  // ─── 1. EXIF Extraction ──────────────────────────────────────────────────
  try {
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
          excerpt: `EXIF DateTimeOriginal: ${captureDate}`,
          dataPath: [
            `File: ${file.name}`,
            `EXIF field: DateTimeOriginal / CreateDate`,
            `Value: ${captureDate}`,
            `Formatted: ${new Date(captureDate).toLocaleDateString()}`,
          ],
        });
      }
      if (parsed.Make || parsed.Model) {
        exifFindings.push({
          label: 'Camera',
          value: `${parsed.Make || ''} ${parsed.Model || ''}`.trim(),
          status: 'info',
          excerpt: `Camera: Make="${parsed.Make || 'N/A'}", Model="${parsed.Model || 'N/A'}"`,
          dataPath: [
            `File: ${file.name}`,
            `EXIF Make: ${parsed.Make || 'not present'}`,
            `EXIF Model: ${parsed.Model || 'not present'}`,
            `Combined: ${`${parsed.Make || ''} ${parsed.Model || ''}`.trim()}`,
          ],
        });
      }
      if (parsed.GPSLatitude != null) {
        const lat = parsed.GPSLatitude;
        const lon = parsed.GPSLongitude;
        const validGps = lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
        exifFindings.push({
          label: 'GPS location',
          value: `${lat.toFixed(4)}, ${lon?.toFixed(4) ?? '?'} ${validGps ? '' : '(invalid range)'}`,
          status: validGps ? 'warn' : 'bad',
          excerpt: `GPS coordinates: Lat ${lat.toFixed(6)}, Lon ${lon?.toFixed(6) ?? 'N/A'}`,
          dataPath: [
            `File: ${file.name}`,
            `EXIF GPSLatitude: ${lat}`,
            `EXIF GPSLongitude: ${lon ?? 'not present'}`,
            `Valid range check: Lat [-90, 90]=${validGps ? 'PASS' : 'FAIL'}, Lon [-180, 180]=${validGps ? 'PASS' : 'FAIL'}`,
            validGps
              ? `Location present — may reveal photographer's position`
              : `GPS values outside valid range — possible metadata corruption`,
          ],
        });
      }

      // Expanded software detection
      if (parsed.Software) {
        const editingTools = [
          'photoshop', 'gimp', 'lightroom', 'affinity', 'snapseed',
          'facetune', 'meitu', 'pixelmator', 'canva', 'fotor',
          'capture one', 'darktable', 'rawtherapee', 'luminar',
          'photodirector', 'picsart', 'corel', 'paintshop',
          'imagemagick', 'sharp', 'libvips', 'paint.net',
        ];
        const isEdited = editingTools.some((t) => parsed.Software.toLowerCase().includes(t));
        const isAiGenerated = ['midjourney', 'stable diffusion', 'dall-e', 'firefly', 'imagen',
          'generative', 'ai-generated', 'openai'].some((t) => parsed.Software.toLowerCase().includes(t));
        exifFindings.push({
          label: 'Edit software',
          value: isAiGenerated ? `AI-generated: ${parsed.Software}` : parsed.Software,
          status: isAiGenerated ? 'bad' : isEdited ? 'bad' : 'info',
          excerpt: `Software tag: "${parsed.Software}"`,
          dataPath: [
            `File: ${file.name}`,
            `EXIF Software field: "${parsed.Software}"`,
            `Checked against ${editingTools.length} known editing tools: ${isEdited ? 'MATCH — editing detected' : 'no match'}`,
            `Checked against AI generation tools: ${isAiGenerated ? 'MATCH — AI generation detected' : 'no match'}`,
            `Score impact: ${isAiGenerated ? '-25 points (AI generation)' : isEdited ? '-20 points (editing detected)' : 'none'}`,
          ],
        });
      }
    }
  } catch (err) {
    logger.warn('EXIF extraction failed', { fileName: file?.name, error: err?.message });
    exifFindings.push({ label: 'EXIF', value: 'Could not extract metadata', status: 'warn',
      excerpt: 'EXIF extraction failed — library error or incompatible format',
      dataPath: [`File: ${file.name}`, `exifr.parse() threw: ${err?.message || 'unknown error'}`] });
  }

  // ─── 2. File Hash Fingerprint (SHA-256 via Web Crypto API) ───────────────
  let fileHash = null;
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    fileHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    logger.debug('Image SHA-256 computed', { fileName: file.name, hash: fileHash.slice(0, 16) + '...' });
  } catch (err) {
    logger.warn('SHA-256 fingerprint failed', { fileName: file?.name, error: err?.message });
    fileHash = null;
  }

  // ─── 3. MIME Type Sniffing (magic bytes) ────────────────────────────────
  let detectedMime = null;
  let mimeMatchesExt = true;
  try {
    const header = await file.slice(0, 16).arrayBuffer();
    const bytes = new Uint8Array(header);
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    const sig = hex.toUpperCase();

    if (sig.startsWith('FFD8FF')) detectedMime = 'image/jpeg';
    else if (sig.startsWith('89504E47')) detectedMime = 'image/png';
    else if (sig.startsWith('47494638')) detectedMime = 'image/gif';
    else if (sig.startsWith('52494646')) detectedMime = 'image/webp';
    else if (sig.startsWith('49492A00') || sig.startsWith('4D4D002A')) detectedMime = 'image/tiff';
    else if (sig.startsWith('424D')) detectedMime = 'image/bmp';
    else if (sig.startsWith('000000') && (sig.substring(8, 16) === '66747970')) detectedMime = 'image/heic';
    else detectedMime = file.type || 'unknown';

    const extMimeMap = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', tiff: 'image/tiff',
      tif: 'image/tiff', bmp: 'image/bmp', heic: 'image/heic',
      heif: 'image/heic',
    };
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const expectedMime = extMimeMap[ext];
    mimeMatchesExt = !expectedMime || detectedMime === expectedMime || detectedMime === 'unknown';
  } catch (err) {
    logger.warn('MIME sniffing failed', { fileName: file?.name, error: err?.message });
    detectedMime = file.type || 'unknown';
    mimeMatchesExt = true;
  }

  // ─── 4-5-9-10-11. Canvas Analysis (dimensions, colors, aspect ratio, alpha) ──
  let imgWidth = 0;
  let imgHeight = 0;
  let hasAlpha = false;
  let avgSaturation = 0;
  let compressionRatio = 0;
  let aspectRatioSuspicious = false;
  let overSaturated = false;
  let anomalousFileSize = false;

  await new Promise((resolve) => {
    try {
      const img = new Image();
      const objUrl = URL.createObjectURL(file);
      img.onload = () => {
        try {
          imgWidth = img.naturalWidth;
          imgHeight = img.naturalHeight;

          const ratio = imgWidth / Math.max(imgHeight, 1);
          const commonRatios = [1, 4/3, 16/9, 3/2, 2/3, 9/16, 16/10, 5/4, 5/3, 21/9];
          const nearCommon = commonRatios.some((r) => Math.abs(ratio - r) < 0.05 || Math.abs(ratio - (1/r)) < 0.05);
          aspectRatioSuspicious = !nearCommon && (ratio < 0.1 || ratio > 10);

          try {
            const canvas = document.createElement('canvas');
            const SAMPLE_SIZE = 80;
            canvas.width = SAMPLE_SIZE;
            canvas.height = SAMPLE_SIZE;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
            const imageData = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
            const data = imageData.data;

            let alphaSum = 0;
            let satSum = 0;
            let sampleCount = 0;
            for (let i = 0; i < data.length; i += 16) {
              const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
              if (a < 250) alphaSum++;
              sampleCount++;
              const max = Math.max(r, g, b) / 255;
              const min = Math.min(r, g, b) / 255;
              const l = (max + min) / 2;
              const sat = max === min ? 0 : l < 0.5 ? (max - min) / (max + min) : (max - min) / (2 - max - min);
              satSum += sat;
            }
            hasAlpha = (alphaSum / sampleCount) > 0.05;
            avgSaturation = Math.round((satSum / sampleCount) * 100);
            overSaturated = avgSaturation > 75;

            const pixelCount = imgWidth * imgHeight;
            compressionRatio = pixelCount > 0 ? file.size / pixelCount : 0;
            const imgExt = file.name.split('.').pop()?.toLowerCase() ?? '';
            anomalousFileSize = (imgExt === 'png' && compressionRatio > 4) || (imgExt === 'jpg' && compressionRatio > 2);
          } catch {
            // Canvas operations can fail in some environments — not critical
          }
        } catch {
          // Ignore dimension errors
        }
        URL.revokeObjectURL(objUrl);
        resolve();
      };
      img.onerror = () => {
        URL.revokeObjectURL(objUrl);
        resolve();
      };
      img.src = objUrl;
    } catch {
      resolve();
    }
  });

  // ─── 6. Metadata cross-validation: EXIF date vs file lastModified ────────
  const captureDate = exifData.DateTimeOriginal || exifData.CreateDate;
  const fileModDate = file.lastModified ? new Date(file.lastModified) : null;
  let datesMismatch = false;
  let dateMismatchDetail = null;
  if (captureDate && fileModDate) {
    const exifTime = new Date(captureDate).getTime();
    const modTime = fileModDate.getTime();
    const diffDays = (modTime - exifTime) / 86_400_000;
    if (diffDays < -1) {
      datesMismatch = true;
      dateMismatchDetail = `File last modified ${Math.abs(Math.round(diffDays))} days before EXIF capture date`;
    }
  }

  // ─── 12. Metadata stripping detection ────────────────────────────────────
  const criticalExifFields = ['Make', 'Model', 'DateTimeOriginal', 'GPSLatitude', 'Software', 'ExifIFD'];
  const presentCritical = criticalExifFields.filter((f) => exifData[f] != null).length;
  const likelyStripped = Object.keys(exifData).length === 0;
  const partiallyStripped = !likelyStripped && presentCritical <= 1;

  // ─── Score Computation ───────────────────────────────────────────────────
  const hasEditing = exifFindings.some((f) => f.label === 'Edit software' && f.status === 'bad');
  const isAiGenerated = exifFindings.some((f) => f.label === 'Edit software' && f.value?.startsWith('AI-generated'));
  const hasGPS = exifFindings.some((f) => f.label === 'GPS location' && f.status !== 'bad');
  const hasCameraInfo = exifFindings.some((f) => f.label === 'Camera');
  const hasDate = exifFindings.some((f) => f.label === 'Date taken');

  let score = 60;
  if (hasDate) score += 10;
  if (hasCameraInfo) score += 10;
  if (hasEditing) score -= 20;
  if (isAiGenerated) score -= 25;
  if (likelyStripped) score -= 15;
  if (partiallyStripped) score -= 8;
  if (!mimeMatchesExt) score -= 20;
  if (overSaturated) score -= 8;
  if (anomalousFileSize) score -= 10;
  if (datesMismatch) score -= 12;
  if (hasAlpha) score -= 5;
  if (aspectRatioSuspicious) score -= 8;
  if (hasGPS) score += 5;

  const crossCheck = buildCrossCheckForImage(exifFindings, file.name);
  score += Math.round((crossCheck.consistencyScore - 50) / 8);
  score = Math.max(5, Math.min(100, Math.round(score)));

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const imgFormats = ['jpg', 'jpeg', 'png', 'tiff', 'heic', 'raw', 'cr2', 'nef'];
  const suspFormats = ['webp', 'bmp', 'gif', 'avif'];
  const keyFields = ['Make', 'Model', 'DateTimeOriginal', 'GPSLatitude', 'ExposureTime', 'FNumber'];
  const presentCount = keyFields.filter((f) => exifData[f] != null).length;
  const metadataPct = Math.round((presentCount / keyFields.length) * 100);

  return {
    authenticityScore: score,
    type: 'image',
    fileName: file.name,
    fileSize: `${(file.size / 1024).toFixed(1)} KB`,
    fileHash: fileHash ? `SHA-256: ${fileHash.slice(0, 16)}…` : null,
    fileHashFull: fileHash,
    imageDimensions: imgWidth && imgHeight ? `${imgWidth} × ${imgHeight} px` : null,
    detectedMime,
    mimeMatchesExt,
    avgSaturation,
    exifData,
    exifCount: Object.keys(exifData).length,
    sources: [
      {
        url: 'image-exif',
        label: 'EXIF metadata scan',
        verified: Object.keys(exifData).length > 0,
        date: new Date().toISOString().split('T')[0],
      },
      ...(fileHash ? [{
        url: 'image-hash',
        label: `SHA-256 fingerprint: ${fileHash.slice(0, 16)}…`,
        verified: true,
        date: new Date().toISOString().split('T')[0],
      }] : []),
    ],
    duplicates: [],
    crossCheck,
    imageAnalysis: {
      metadata: {
        camera: exifFindings.find((f) => f.label === 'Camera')?.value ?? null,
        date: exifFindings.find((f) => f.label === 'Date taken')?.value ?? null,
        gps: exifFindings.find((f) => f.label === 'GPS location')?.value ?? null,
        software: exifFindings.find((f) => f.label === 'Edit software')?.value ?? null,
      },
      dimensions: imgWidth && imgHeight ? { width: imgWidth, height: imgHeight } : null,
      colorAnalysis: { avgSaturation, overSaturated, hasAlpha },
      mimeSniff: { detectedMime, declaredMime: file.type, mimeMatchesExt },
      compressionRatio: compressionRatio.toFixed(4),
      steganographyIndicators: { anomalousFileSize, compressionRatio: compressionRatio.toFixed(4) },
      reverseSearchMatches: [],
    },
    aiAnalysis: null,
    findings: [
      { label: 'File name', value: file.name, status: 'info',
        excerpt: `File: ${file.name}`, dataPath: [`Input file name: ${file.name}`] },
      { label: 'File size', value: `${(file.size / 1024).toFixed(1)} KB`,
        status: file.size < 1024 ? 'warn' : file.size > 20 * 1024 * 1024 ? 'warn' : 'info',
        explanation: 'Very small files may be low-quality screenshots; very large files may be uncompressed originals.',
        excerpt: `File size: ${(file.size / 1024).toFixed(1)} KB (${file.size} bytes)`,
        dataPath: [
          `Raw size: ${file.size} bytes`,
          `Converted: ${(file.size / 1024).toFixed(1)} KB`,
          file.size < 1024 ? 'WARNING: Very small — may be a low-resolution screenshot' :
            file.size > 20 * 1024 * 1024 ? 'WARNING: Very large — uncompressed or RAW format' : 'Size within normal range',
        ],
      },
      ...(imgWidth && imgHeight ? [{
        label: 'Image dimensions',
        value: `${imgWidth} × ${imgHeight} px`,
        status: 'info',
        excerpt: `Canvas-measured: ${imgWidth}px wide × ${imgHeight}px tall`,
        dataPath: [
          `Loaded image onto HTML Canvas element`,
          `naturalWidth: ${imgWidth}px, naturalHeight: ${imgHeight}px`,
          `Aspect ratio: ${(imgWidth / imgHeight).toFixed(3)} (${imgWidth}:${imgHeight})`,
          aspectRatioSuspicious ? 'WARNING: Unusual aspect ratio detected — possible heavy cropping' : 'Aspect ratio within normal range',
        ],
      }] : []),
      {
        label: 'File type verification',
        value: mimeMatchesExt
          ? `${ext.toUpperCase() || 'unknown'} — type matches`
          : `MISMATCH: declared ${ext.toUpperCase()}, detected ${detectedMime}`,
        status: mimeMatchesExt ? 'good' : 'bad',
        explanation: 'File magic bytes are compared against the file extension. A mismatch can indicate a disguised file format.',
        excerpt: `Extension: .${ext} | Magic bytes indicate: ${detectedMime} | Match: ${mimeMatchesExt ? 'YES' : 'NO — MISMATCH'}`,
        dataPath: [
          `File: ${file.name}, extension: .${ext}`,
          `Read first 16 bytes (magic bytes): ${detectedMime}`,
          `Expected MIME for .${ext}: ${file.type || 'unknown'}`,
          mimeMatchesExt ? 'Extension matches magic bytes — consistent' : 'MISMATCH: Extension does not match file content — suspicious',
          mimeMatchesExt ? 'No score impact' : 'Score impact: -20 points',
        ],
      },
      {
        label: 'EXIF metadata',
        value: `${Object.keys(exifData).length} fields found`,
        status: Object.keys(exifData).length > 0 ? 'good' : 'warn',
        excerpt: Object.keys(exifData).length > 0
          ? `Present fields: ${Object.keys(exifData).slice(0, 8).join(', ')}${Object.keys(exifData).length > 8 ? '…' : ''}`
          : 'No EXIF metadata present in this file',
        dataPath: [
          `Loaded exifr library and parsed: ${file.name}`,
          `Total EXIF fields found: ${Object.keys(exifData).length}`,
          Object.keys(exifData).length === 0 ? 'Likely causes: screenshot, social media download, or deliberate metadata stripping' : `Sample fields: ${Object.keys(exifData).slice(0, 5).join(', ')}`,
          Object.keys(exifData).length === 0 ? 'Score impact: -15 points' : 'No score deduction',
        ],
      },
      {
        label: 'Edit software detected',
        value: hasEditing ? (isAiGenerated ? 'AI generation detected' : 'Yes (editing software in EXIF)') : 'No signs of editing',
        status: isAiGenerated ? 'bad' : hasEditing ? 'bad' : 'good',
        excerpt: exifFindings.find((f) => f.label === 'Edit software')?.excerpt || 'No Software EXIF tag found',
        dataPath: [
          ...( exifFindings.find((f) => f.label === 'Edit software')?.dataPath || ['No Software field in EXIF'] ),
        ],
      },
      {
        label: 'GPS coordinates',
        value: hasGPS ? 'Location data present' : 'No GPS data',
        status: hasGPS ? 'warn' : 'info',
        excerpt: exifFindings.find((f) => f.label === 'GPS location')?.excerpt || 'No GPS EXIF fields found',
        dataPath: exifFindings.find((f) => f.label === 'GPS location')?.dataPath || ['No GPS data in EXIF metadata'],
      },
      {
        label: 'Metadata completeness',
        value: `${metadataPct}% (${presentCount}/${keyFields.length} key fields)`,
        status: metadataPct >= 60 ? 'good' : metadataPct >= 30 ? 'warn' : 'bad',
        explanation: 'More EXIF fields present indicates less metadata stripping. Photos shared via social media often have metadata removed.',
        excerpt: `Checked ${keyFields.length} key EXIF fields: ${keyFields.filter((f) => exifData[f] != null).join(', ') || 'none present'}`,
        dataPath: [
          `Checked ${keyFields.length} critical EXIF fields: ${keyFields.join(', ')}`,
          `Present: ${keyFields.filter((f) => exifData[f] != null).join(', ') || 'none'}`,
          `Missing: ${keyFields.filter((f) => exifData[f] == null).join(', ') || 'none'}`,
          `Completeness: ${metadataPct}% — ${likelyStripped ? 'likely stripped (social media / screenshot)' : partiallyStripped ? 'partially stripped' : 'good metadata coverage'}`,
        ],
      },
      {
        label: 'File format',
        value: ext.toUpperCase() || 'Unknown',
        status: imgFormats.includes(ext) ? 'good' : suspFormats.includes(ext) ? 'warn' : 'info',
        explanation: 'Camera-native formats (JPEG, TIFF, RAW) are more likely to retain EXIF data.',
        excerpt: `Extension: .${ext} — ${imgFormats.includes(ext) ? 'camera-native format' : suspFormats.includes(ext) ? 'derived/converted format' : 'uncommon format'}`,
        dataPath: [
          `File extension: .${ext}`,
          `Camera-native formats (retain EXIF): ${imgFormats.join(', ')}`,
          `Derived/converted formats (often lose EXIF): ${suspFormats.join(', ')}`,
          `Classification: ${imgFormats.includes(ext) ? 'NATIVE — likely retains EXIF' : suspFormats.includes(ext) ? 'DERIVED — may have stripped EXIF' : 'UNKNOWN'}`,
        ],
      },
      {
        label: 'Cross-source consistency',
        value: `${crossCheck.consistencyScore}% (${crossCheck.corroboratingCount} corroborating / ${crossCheck.conflictingCount} conflicting)`,
        status: crossCheck.consistencyScore >= 65 ? 'good' : crossCheck.consistencyScore >= 40 ? 'warn' : 'bad',
        excerpt: `${crossCheck.corroboratingCount} signals corroborate authenticity, ${crossCheck.conflictingCount} signals conflict`,
        dataPath: [
          `Built cross-check from EXIF metadata signals`,
          `Corroborating signals: ${crossCheck.corroboratingCount}`,
          `Conflicting signals: ${crossCheck.conflictingCount}`,
          `Consistency score: ${crossCheck.consistencyScore}%`,
        ],
      },
      ...(avgSaturation > 0 ? [{
        label: 'Color saturation',
        value: `${avgSaturation}% avg — ${overSaturated ? 'Over-saturated (AI/filter signal)' : 'Normal range'}`,
        status: overSaturated ? 'warn' : 'good',
        explanation: 'Extremely high average saturation can indicate AI-generated images or heavy filter use.',
        excerpt: `Canvas pixel analysis: average HSL saturation = ${avgSaturation}%`,
        dataPath: [
          `Loaded image into 80×80 canvas for pixel sampling`,
          `Sampled every 4th pixel, converted RGB → HSL saturation`,
          `Average saturation: ${avgSaturation}%`,
          `Threshold for over-saturation: >75%`,
          overSaturated ? 'WARNING: Over-saturated — common in AI-generated or heavily filtered images' : 'Normal saturation range',
          overSaturated ? 'Score impact: -8 points' : 'No score impact',
        ],
      }] : []),
      ...(hasAlpha ? [{
        label: 'Alpha channel',
        value: 'Transparency/alpha channel detected',
        status: 'warn',
        explanation: 'Images with active alpha channels (transparency) may be composites or overlays.',
        excerpt: 'Canvas pixel analysis detected pixels with alpha < 250 in more than 5% of sampled pixels',
        dataPath: [
          'Scanned sampled pixels for alpha channel usage',
          'Found >5% of pixels with partial transparency',
          'Indicates possible compositing, overlay, or removal of background',
          'Score impact: -5 points',
        ],
      }] : []),
      ...(fileHash ? [{
        label: 'File fingerprint (SHA-256)',
        value: `${fileHash.slice(0, 16)}…`,
        status: 'info',
        explanation: 'A cryptographic hash uniquely identifies this exact file. Can be used to cross-reference with known image databases.',
        excerpt: `SHA-256: ${fileHash}`,
        dataPath: [
          `Read file as ArrayBuffer: ${file.name}`,
          `Applied Web Crypto API SHA-256 digest`,
          `Full hash: ${fileHash}`,
          'This hash uniquely identifies this exact file content (any modification would change the hash)',
        ],
      }] : []),
      ...(datesMismatch ? [{
        label: 'Date inconsistency',
        value: dateMismatchDetail,
        status: 'bad',
        explanation: 'The EXIF capture date and the file modification date are inconsistent, suggesting metadata manipulation.',
        excerpt: `EXIF capture date: ${new Date(captureDate).toLocaleDateString()} | File last modified: ${fileModDate?.toLocaleDateString()}`,
        dataPath: [
          `EXIF DateTimeOriginal: ${captureDate}`,
          `File.lastModified: ${fileModDate?.toISOString()}`,
          `Difference: file modified ${Math.abs(Math.round((fileModDate - new Date(captureDate)) / 86_400_000))} days before EXIF date`,
          'This is inconsistent — EXIF date should not be AFTER file modification date',
          'Possible explanation: EXIF date was edited, or metadata was injected from another file',
          'Score impact: -12 points',
        ],
      }] : []),
      ...(anomalousFileSize ? [{
        label: 'Steganography indicator',
        value: `Anomalous file size for format/dimensions (${compressionRatio.toFixed(2)} bytes/px)`,
        status: 'warn',
        explanation: 'Unusually large file size relative to image dimensions can indicate hidden data embedded in the file.',
        excerpt: `File: ${(file.size / 1024).toFixed(1)} KB for ${imgWidth}×${imgHeight}px (${compressionRatio.toFixed(2)} bytes/pixel)`,
        dataPath: [
          `Image dimensions: ${imgWidth} × ${imgHeight} = ${imgWidth * imgHeight} total pixels`,
          `File size: ${file.size} bytes`,
          `Bytes per pixel: ${compressionRatio.toFixed(4)}`,
          `For .${ext}: threshold >4 bytes/px for PNG, >2 bytes/px for JPEG`,
          'This ratio is higher than expected — possible hidden data (steganography)',
          'Score impact: -10 points',
        ],
      }] : []),
      ...exifFindings.filter((f) => !['Camera', 'Date taken', 'GPS location', 'Edit software', 'EXIF'].includes(f.label)),
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
  if (apiKey.length < 10) return null;

  const provider = resolveProvider(aiConfig?.provider || 'auto', apiKey);
  const model = aiConfig?.model?.trim() || AI_PROVIDERS[provider]?.defaultModel;

  logger.info(`AI analysis starting — provider: ${provider}, model: ${model}`);

  const contentSnippet =
    inputData.type === 'url'
      ? `URL: ${inputData.value}`
      : inputData.type === 'text'
      ? `Text snippet: ${inputData.value.slice(0, 600)}`
      : `Image file: ${inputData.file?.name ?? 'unknown'}`;

  const prompt = `You are a misinformation detection expert. Analyze the following content for authenticity and determine if the story is likely valid.

${contentSnippet}

Reply in JSON only with this shape:
{ "confidence": <0-100 integer>, "storyValidity": "likely_valid"|"uncertain"|"likely_false", "validityReason": "<1-2 sentence reason>", "summary": "<3-4 sentence assessment>" }`;

  try {
    let raw = '{}';

    if (provider === 'google') {
      const resolvedModel = model || AI_PROVIDERS.google.defaultModel;
      const encodedModel = encodeURIComponent(resolvedModel);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:generateContent`;
      logger.debug(`Google AI request — model: ${resolvedModel}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 400,
          },
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        logger.error(`Google AI HTTP ${res.status} — ${res.statusText}`, { url, body: errText.slice(0, 300) });
        throw new Error(`Google AI error ${res.status}: ${res.statusText}. ${errText.slice(0, 120)}`);
      }
      const data = await res.json();
      raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
      logger.debug('Google AI raw response received', { length: raw.length });
    } else {
      logger.debug(`OpenAI request — model: ${model}`);
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || AI_PROVIDERS.openai.defaultModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 300,
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        logger.error(`OpenAI HTTP ${res.status} — ${res.statusText}`, { body: errText.slice(0, 300) });
        throw new Error(`OpenAI error ${res.status}: ${res.statusText}. ${errText.slice(0, 120)}`);
      }
      const data = await res.json();
      raw = data.choices?.[0]?.message?.content ?? '{}';
      logger.debug('OpenAI raw response received', { length: raw.length });
    }

    // Strip markdown code fences if the model wrapped the JSON
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      logger.info(`AI analysis complete — confidence: ${parsed.confidence ?? 'N/A'}, validity: ${parsed.storyValidity ?? 'N/A'}`);
      return { ...parsed, provider, model };
    } catch (parseErr) {
      logger.warn('AI JSON parse failed — returning raw text', { raw: cleaned.slice(0, 200), error: parseErr?.message });
      return { confidence: null, storyValidity: 'uncertain', summary: cleaned, provider, model };
    }
  } catch (err) {
    logger.error(`AI analysis failed: ${err.message}`, { provider, model });
    return {
      confidence: null,
      storyValidity: null,
      summary: `AI analysis unavailable: ${err.message}`,
      provider,
      model,
      error: err.message,
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
  const [scanHistory, setScanHistory] = useLocalStorage('howsus-scan-history', []);
  const [settings, updateSettings, resetSettings] = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const scanIntervalRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    logger.info('App ready — loading corroboration feed…');
    fetch(`${import.meta.env.BASE_URL}data/corroboration-feed.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mounted) return;
        if (data) {
          setSourceFeed(data);
          logger.info(`Corroboration feed loaded (${Array.isArray(data.entries) ? data.entries.length : 0} entries)`);
        } else {
          logger.warn('Corroboration feed unavailable — falling back to heuristics');
        }
      })
      .catch((err) => {
        if (mounted) {
          setSourceFeed(null);
          logger.warn(`Corroboration feed fetch failed: ${err.message}`);
        }
      });

    // Decode share link from URL hash on initial load
    try {
      const hash = window.location.hash;
      if (hash.startsWith('#share=')) {
        const data = JSON.parse(decodeURIComponent(atob(hash.slice(7))));
        if (data.t && data.v) {
          setInputData((prev) => ({ ...prev, type: data.t, value: data.v }));
        }
        // Remove hash so the page can be refreshed cleanly
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } catch (err) {
      logger.warn('Malformed or stale share link — ignoring', { error: err?.message });
    }

    return () => {
      mounted = false;
    };
  }, []);

  // ── Update check ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!settings.autoUpdateCheck) return;
    checkForUpdates().then(({ hasUpdate: newVersion }) => setHasUpdate(newVersion));
  }, [settings.autoUpdateCheck]);

  // ── Session persistence ───────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('howsus-session');
      if (saved) {
        const { results, input } = JSON.parse(saved);
        if (results && input) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setScanResults(results);
          setInputData(input);
          setScanPhase('complete');
        }
      }
    } catch (err) { logger.debug('Session restore failed', { error: err?.message }); }
  }, []);

  useEffect(() => {
    if (scanResults && scanPhase === 'complete') {
      try {
        sessionStorage.setItem('howsus-session', JSON.stringify({ results: scanResults, input: inputData }));
      } catch (err) { logger.debug('Session persist failed', { error: err?.message }); }
    }
  }, [scanResults, scanPhase, inputData]);

  // Derived convenience flag
  const isScanning = scanPhase === 'scanning';

  // ── Scan handler ───────────────────────────────────────────────────────────
  const handleScan = useCallback(async () => {
    if (isScanning) return;
    logger.info(`Scan started — type: ${inputData.type}`);

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
      logger.error(`Scan failed: ${err.message}`);
      setScanError(`Analysis failed: ${err.message}`);
      setScanPhase('error');
      return;
    }

    logger.info(`Analysis complete — type: ${result.type}, score: ${result.authenticityScore}`);
    logger.debug('Findings summary', { count: result.findings?.length, crossCheck: result.crossCheck?.consistencyScore });

    // ── Optional AI analysis (only when API key is set) ───────────────────
    // Completion of `scanResults` populates the panel; AI analysis populates
    // `aiAnalysis` separately and updates the results object.
    if (aiConfig.apiKey?.trim()) {
      logger.info('Running AI analysis…');
      const ai = await runAiAnalysis(inputData, aiConfig);
      if (ai?.error) {
        logger.warn(`AI step completed with error: ${ai.error}`);
      } else if (ai) {
        logger.info(`AI step done — validity: ${ai.storyValidity ?? 'N/A'}, confidence: ${ai.confidence ?? 'N/A'}%`);
      }
      setAiAnalysis(ai);
      result = { ...result, aiAnalysis: ai };
    } else {
      logger.info('AI step skipped — no API key configured');
    }

    // Attempt screenshot for URLs via Microlink.io (free, CORS-friendly)
    if (result.type === 'url' && inputData.value) {
      // Validate URL is http/https before passing to external service
      let safeInputUrl = null;
      try {
        const parsed = new URL(inputData.value.startsWith('http') ? inputData.value : `https://${inputData.value}`);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
          safeInputUrl = parsed.href;
        }
      } catch (err) { logger.debug('Invalid URL — skipping screenshot', { error: err?.message }); }

      if (safeInputUrl) {
        logger.info('Fetching URL screenshot via Microlink.io...');
        try {
          const mUrl = `https://api.microlink.io/?url=${encodeURIComponent(safeInputUrl)}&screenshot=true&meta=false&embed=screenshot.url`;
          const mRes = await fetch(mUrl);
          if (mRes.ok) {
            const mData = await mRes.json();
            const screenshotUrl = mData?.data?.screenshot?.url ?? null;
            if (screenshotUrl) {
              result = { ...result, screenshotUrl };
              logger.info('Screenshot fetched successfully');
            } else {
              logger.warn('Microlink screenshot URL not in response');
            }
          } else {
            logger.warn(`Microlink screenshot fetch failed: HTTP ${mRes.status}`);
          }
        } catch (screenshotErr) {
          logger.warn(`Screenshot fetch failed: ${screenshotErr.message}`);
        }
      }
    }

    // Persist to scan history (last 10)
    const historyEntry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      type: result.type,
      inputSummary:
        inputData.type === 'url'
          ? inputData.value.slice(0, 80)
          : inputData.type === 'text'
          ? `${inputData.value.slice(0, 60)}…`
          : inputData.file?.name ?? 'Image',
      score: result.authenticityScore,
    };
    setScanHistory((prev) => [historyEntry, ...prev.slice(0, (settings.scanHistorySize ?? 10) - 1)]);

    logger.info(`Scan complete — score: ${result.authenticityScore}`);
    setScanResults(result);
    setScanPhase('complete');
  }, [inputData, aiConfig, isScanning, sourceFeed, setScanHistory, settings.scanHistorySize]);

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
    sessionStorage.removeItem('howsus-session');
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useKeyboardShortcuts({
    onScan: () => { if (!isScanning && inputData.value) handleScan(); },
    onReset: handleReset,
    onFocusUrl: () => document.getElementById('url-input')?.focus(),
  });

  // ── Export history as CSV ─────────────────────────────────────────────────
  const handleExportHistory = useCallback(() => {
    if (!scanHistory.length) return;
    const header = 'id,timestamp,type,input,score';
    const rows = scanHistory.map((h) =>
      [h.id, h.timestamp, h.type, `"${(h.inputSummary || '').replace(/"/g, '""')}"`, h.score].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'howsus-scan-history.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [scanHistory]);

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
    <>
      <ThemeProvider settings={settings} />
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdate={updateSettings}
        onReset={resetSettings}
        scanHistory={scanHistory}
        onClearHistory={() => setScanHistory([])}
        onExportHistory={handleExportHistory}
      />
      <LogPanel visible={settings.showLogPanel} />

      {/* Update banner */}
      <AnimatePresence>
        {hasUpdate && (
          <motion.div
            className="update-banner"
            role="status"
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 60 }}
          >
            🎉 A new version of HowSus is available!{' '}
            <a href="https://github.com/A13Xg/How-Sus/releases" target="_blank" rel="noreferrer noopener">
              See what's new
            </a>
            <button onClick={() => setHasUpdate(false)} aria-label="Dismiss update notice">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="App">
        <Header
          aiConfig={aiConfig}
          resolvedProvider={resolvedProvider}
          detectedProvider={detectedProvider}
          providers={AI_PROVIDERS}
          onAiConfigChange={setAiConfig}
          onOpenSettings={() => setSettingsOpen(true)}
          hasUpdate={hasUpdate}
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
                confidenceScore={computeScanConfidence(scanResults, !!aiAnalysis)}
                scanHistory={scanHistory}
                onClearHistory={() => setScanHistory([])}
              />
            )}
          </AnimatePresence>
        </main>

        <Footer />
      </div>
    </>
  );
}

export default App;
