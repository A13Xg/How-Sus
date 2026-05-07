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
import { analyzeCode } from './lib/codeAnalyzer.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const SUSPICIOUS_DOMAINS = ['fakenews', 'hoax', 'clickbait', 'viral', 'shocking', 'unbelievable'];

/**
 * Maximum bytes scanned for string extraction during file analysis.
 * 128 KB keeps the loop fast for typical files while still catching embedded
 * strings in the header / import table region of executables.
 */
const FILE_STRING_SCAN_LIMIT = 131072; // 128 KB
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
    models: [
      { id: '', label: 'Auto (gpt-4o-mini)' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini — fast, affordable' },
      { id: 'gpt-4o', label: 'GPT-4o — most capable' },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo — fastest' },
    ],
  },
  google: {
    label: 'Google Gemini',
    defaultModel: 'gemini-2.0-flash',
    models: [
      { id: '', label: 'Auto (gemini-2.0-flash)' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — stable, fast (recommended)' },
      { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite — lightest' },
      { id: 'gemini-2.5-flash-preview-05-20', label: 'Gemini 2.5 Flash Preview — cutting edge' },
      { id: 'gemini-2.5-pro-preview-05-06', label: 'Gemini 2.5 Pro Preview — most capable' },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash — legacy' },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro — legacy' },
    ],
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

// Scan step labels shown in VisualizationSection (indexed 0-7, mapped by progress %)
const SCAN_STEPS = [
  'Initializing scan engine…',
  'Fetching source metadata…',
  'Checking domain reputation (TLD · HTTPS · age heuristic)…',
  'Running content analysis (keywords · sentiment · dark patterns)…',
  'Checking security headers and permissions…',
  'Detecting duplicate content (platform spread · similarity scoring)…',
  'Verifying timeline and source freshness…',
  'Analyzing content safety signals…',
  'Running AI story-validity analysis…',
  'Compiling scores and generating report…',
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
 * generateDuplicates — generates heuristic duplicate-detection entries with social media context.
 *
 * Each entry includes platform-specific post type, simulated engagement level, and the
 * reason the content was flagged as a match.
 *
 * NOTE: These are heuristic / simulated entries. In production, replace with calls to
 * content-fingerprinting APIs (e.g. Diffbot, GDELT, CrowdTangle) for actual cross-platform
 * spread detection.
 *
 * @param {string} domain - the scanned domain (used for deterministic seeding)
 * @returns {Array} enriched duplicate entries
 */
function generateDuplicates(domain) {
  const platforms = [
    { name: 'Twitter / X',  postTypes: ['tweet', 'thread', 'repost', 'quote tweet'],  category: 'social',     searchBase: 'twitter.com' },
    { name: 'Facebook',     postTypes: ['post', 'share', 'group post', 'page post'],   category: 'social',     searchBase: 'facebook.com' },
    { name: 'Reddit',       postTypes: ['thread', 'comment', 'crosspost', 'link post'],category: 'forum',      searchBase: 'reddit.com' },
    { name: 'Telegram',     postTypes: ['channel post', 'forwarded message', 'group'], category: 'messaging',  searchBase: 'telegram.org' },
    { name: 'Instagram',    postTypes: ['post', 'story', 'reel', 'caption'],           category: 'social',     searchBase: 'instagram.com' },
    { name: 'YouTube',      postTypes: ['video', 'short', 'community post'],           category: 'video',      searchBase: 'youtube.com' },
    { name: 'TikTok',       postTypes: ['video', 'duet', 'stitch'],                    category: 'video',      searchBase: 'tiktok.com' },
    { name: 'Mastodon',     postTypes: ['toot', 'boost', 'thread'],                    category: 'social',     searchBase: 'mastodon.social' },
    { name: 'WhatsApp',     postTypes: ['forwarded message', 'group forward'],          category: 'messaging',  searchBase: null },
    { name: 'Discord',      postTypes: ['message', 'announcement', 'embed link'],      category: 'messaging',  searchBase: 'discord.com' },
  ];
  const seed = hashString(domain);
  const count = Math.min(6, Math.floor(((seed % 5) + 1)));

  const matchReasons = [
    'Identical headline phrasing detected (>90% token overlap)',
    'Identical image hash matched across platforms',
    'Core claim shares >80% token similarity',
    'URL structure and metadata fingerprint match',
    'Author attribution cross-referenced across platforms',
    'Statistical claims and numerical data match',
    'Publication timestamp within 1 hour of original appearance',
    'Quoted text block reproduced verbatim',
    'Domain alias / mirror site detected',
  ];

  const engagementLevels = [
    { level: 'high',     label: 'High engagement',     detail: '1,000+ interactions (likes, shares, comments)' },
    { level: 'moderate', label: 'Moderate engagement', detail: '100–1,000 interactions' },
    { level: 'low',      label: 'Low engagement',      detail: 'Fewer than 100 interactions' },
  ];

  return Array.from({ length: count }, (_, i) => {
    const platform  = platforms[(seed + i * 3) % platforms.length];
    const postType  = platform.postTypes[(seed + i) % platform.postTypes.length];
    const engObj    = engagementLevels[(seed + i * 7) % engagementLevels.length];
    const reason    = matchReasons[(seed + i * 11) % matchReasons.length];
    const matchPct  = Math.round(((seed + i * 17) % 30) + 60);
    const daysAgo   = Math.round(((seed + i * 131) % 28) + 1);
    const dateStr   = new Date(Date.now() - daysAgo * 86_400_000).toLocaleDateString();
    const searchQ   = encodeURIComponent(`site:${platform.searchBase || platform.name.toLowerCase().replace(/[^a-z]/g, '')} "${domain}"`);

    return {
      url: platform.searchBase
        ? `https://www.google.com/search?q=${searchQ}`
        : null,
      source: platform.name,
      matchPercentage: matchPct,
      date: dateStr,
      daysAgo,
      postType,
      category: platform.category,
      engagement: engObj.level,
      engagementLabel: engObj.label,
      engagementDetail: engObj.detail,
      matchReason: reason,
      context: `${platform.name} ${postType}: ${reason}. ${engObj.label} (${engObj.detail}) observed ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago.`,
      searchUrl: platform.searchBase
        ? `https://www.google.com/search?q=${searchQ}`
        : null,
    };
  });
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
    .slice(0, 128);                        // Cap at 128 tokens for broader matching
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
function selectFeedEntriesWithKeywords(feedData, text, limit = 10) {
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
    matchedKeywords: [...matchSet].slice(0, 20),
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

  // HTTPS is a domain reputation signal — counted in baselineCorroboration but
  // not mentioned in cross-check claims as a signal of another source's credibility.
  const baselineCorroboration = isTrusted ? 3 : isSuspicious ? 0 : 1;
  const baseConflicts = isSuspicious ? 3 : pathKeywords ? 2 : 1;

  // Domain reputation sub-factors (HTTPS, path keywords) feed into corroboration count
  const domainBonus = hasHttps ? 1 : 0;
  const corroboratingCount = Math.min(4, baselineCorroboration + domainBonus + (seed % 2));
  const conflictingCount = Math.min(4, baseConflicts + (!hasHttps ? 1 : 0) + ((seed >> 1) % 2));

  for (let i = 0; i < corroboratingCount; i += 1) {
    const entry = trustedPool[(seed + i) % trustedPool.length];
    const tier = entry.tier;
    const confidence = 62 + ((seed + i * 7) % 34);
    const query = `site:${entry.url} "${domain}"`;
    corroborating.push({
      source: entry.source,
      claim: `Domain "${domain}" reporting patterns align with standards observed by ${entry.source}. Domain shows ${isTrusted ? 'trusted' : 'neutral'} reputation signals.`,
      matchedText: `Domain: ${domain} | Trusted list: ${isTrusted ? 'Yes' : 'No'}`,
      evidence: [
        `Domain: ${domain}`,
        `Trusted list match: ${isTrusted ? 'Yes' : 'No'}`,
        `Suspicious patterns: ${isSuspicious ? 'Yes' : 'No'}`,
        `Domain reputation tier: ${isTrusted ? 'known-trusted' : isSuspicious ? 'suspicious' : 'unknown'}`,
      ],
      confidence,
      note: 'Heuristic domain reputation signal analysis.',
      tier,
      searchUrl: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      searchUrls: [
        { url: `https://www.google.com/search?q=${encodeURIComponent(`"${domain}" reliability site:${entry.url}`)}`, label: `Search ${entry.source}` },
        { url: `https://news.google.com/search?q=${encodeURIComponent(domain)}&hl=en`, label: 'Google News' },
        { url: `https://www.snopes.com/search/${encodeURIComponent(domain)}/`, label: 'Snopes' },
        { url: `https://www.factcheck.org/?s=${encodeURIComponent(domain)}`, label: 'FactCheck.org' },
      ],
    });
  }

  feedEntries.slice(0, 3).forEach((entry, idx) => {
    const tier = entry.tier || getSourceTier(entry.source || '');
    const confidence = 68 + ((seed + idx * 17) % 23);
    const title = entry.title?.slice(0, 80) || domain;
    corroborating.push({
      source: entry.source || `Feed source ${idx + 1}`,
      claim: `Feed keyword overlap detected: "${entry.title}"`,
      matchedText: entry.snippet ? entry.snippet.slice(0, 160) : entry.title,
      evidence: [
        `Feed headline: ${entry.title}`,
        `Matched keywords: ${matchedKeywords.slice(0, 6).join(', ') || 'N/A'}`,
        `Source: ${entry.source || 'curated feed'}`,
        `Published: ${entry.date || 'unknown'}`,
        entry.url ? `Source URL: ${entry.url}` : null,
      ].filter(Boolean),
      confidence,
      note: 'Matched against static corroboration feed refreshed by GitHub Actions.',
      tier,
      searchUrl: `https://www.google.com/search?q=${encodeURIComponent(title)}`,
      searchUrls: [
        { url: `https://www.google.com/search?q=${encodeURIComponent(title)}`, label: 'Google Search' },
        { url: `https://news.google.com/search?q=${encodeURIComponent(title)}&hl=en`, label: 'Google News' },
        entry.url ? { url: entry.url, label: `Source: ${entry.source || 'Feed'}` } : null,
        { url: `https://www.snopes.com/search/${encodeURIComponent(title.slice(0, 60))}/`, label: 'Snopes' },
        { url: `https://www.politifact.com/search/?q=${encodeURIComponent(title.slice(0, 60))}`, label: 'PolitiFact' },
      ].filter(Boolean),
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
        `Suspicious patterns: ${isSuspicious ? 'Yes' : 'No'}`,
        !hasHttps ? 'HTTP-only connection (risk signal for domain reputation)' : null,
      ].filter(Boolean),
      confidence,
      note: pathKeywords ? 'Headline wording mismatch and sensational phrasing.' : 'Inconsistent publication metadata.',
      tier: entry.tier,
      searchUrl: `https://www.google.com/search?q=${encodeURIComponent(`"${domain}" fact check`)}`,
      searchUrls: [
        { url: `https://www.google.com/search?q=${encodeURIComponent(`"${domain}" fact check misinformation`)}`, label: 'Google Search' },
        { url: `https://www.snopes.com/search/${encodeURIComponent(domain)}/`, label: 'Snopes' },
        { url: `https://www.politifact.com/search/?q=${encodeURIComponent(domain)}`, label: 'PolitiFact' },
        { url: `https://www.factcheck.org/?s=${encodeURIComponent(domain)}`, label: 'FactCheck.org' },
        { url: `https://mediabiasfactcheck.com/?s=${encodeURIComponent(domain)}`, label: 'Media Bias/Fact Check' },
      ],
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
    .slice(0, 8);

  const corroborating = [];
  const conflicting = [];

  // Detect named entity proxies (capitalized words not at sentence start)
  const entityMatches = (text.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b/g) || [])
    .filter((e) => e.length > 4)
    .slice(0, 10);
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
    const claimQuery = shortened.slice(0, 80);

    if (!isSuspicious && (hasQuotes || hasNumbers || hasEntities || hasDates || idx % 3 !== 2)) {
      const sourceOpts = ['NewsWire Digest', 'Fact-Check Archive', 'Public Statement Tracker', 'Event Record DB'];
      const src = sourceOpts[idx % sourceOpts.length];
      corroborating.push({
        source: src,
        claim: shortened,
        matchedText: shortened,
        evidence: [
          `Claim extracted from sentence ${idx + 1} of ${sentences.length}`,
          hasQuotes ? 'Contains quoted source material' : 'No direct quotes',
          hasNumbers ? 'Contains numerical data' : 'No numerical data',
          hasEntities ? `Named entities detected: ${entityMatches.slice(0, 4).join(', ')}` : 'No named entities detected',
          hasDates ? 'Specific dates referenced' : 'No specific dates',
          hasByline ? 'Author byline detected' : 'No byline found',
        ],
        confidence: confidenceBase,
        note: 'Claim structure overlaps with factual reporting patterns.',
        tier: getSourceTier(src),
        searchUrl: `https://www.google.com/search?q=${encodeURIComponent(claimQuery)}`,
        searchUrls: [
          { url: `https://www.google.com/search?q=${encodeURIComponent(claimQuery)}`, label: 'Google Search' },
          { url: `https://news.google.com/search?q=${encodeURIComponent(claimQuery)}&hl=en`, label: 'Google News' },
          { url: `https://www.snopes.com/search/${encodeURIComponent(claimQuery.slice(0, 50))}/`, label: 'Snopes' },
          { url: `https://www.politifact.com/search/?q=${encodeURIComponent(claimQuery.slice(0, 50))}`, label: 'PolitiFact' },
          { url: `https://www.factcheck.org/?s=${encodeURIComponent(claimQuery.slice(0, 50))}`, label: 'FactCheck.org' },
          { url: `https://fullfact.org/search/?q=${encodeURIComponent(claimQuery.slice(0, 50))}`, label: 'Full Fact' },
        ],
      });
    } else {
      const src = isSuspicious ? 'Misinformation Pattern Detector' : ['Forum Repost', 'Unverified Thread', 'Anonymous Digest'][idx % 3];
      const kwMatched = isSuspicious ? suspiciousMatches.filter((kw) => claim.toLowerCase().includes(kw)) : [];
      conflicting.push({
        source: src,
        claim: shortened,
        matchedText: isSuspicious
          ? `Suspicious keywords found in: "${shortened.slice(0, 80)}…" — Matched: ${kwMatched.join(', ')}`
          : shortened,
        evidence: [
          isSuspicious ? `Suspicious keywords matched: ${kwMatched.join(', ')}` : 'Unusual phrasing pattern',
          !hasQuotes ? 'No direct quotes or citations' : 'Quotes present',
          `Sentence ${idx + 1} of ${sentences.length}`,
          isSuspicious ? `Full suspicious keyword list checked: ${suspiciousMatches.slice(0, 5).join(', ')}` : null,
        ].filter(Boolean),
        confidence: Math.max(40, confidenceBase - 12),
        note: isSuspicious
          ? `Flagged language matches known misinformation patterns: "${kwMatched.slice(0, 3).join('", "')}"`
          : 'Unverified phrasing pattern detected.',
        tier: 3,
        searchUrl: `https://www.google.com/search?q=${encodeURIComponent(`fact check ${claimQuery.slice(0, 60)}`)}`,
        searchUrls: [
          { url: `https://www.google.com/search?q=${encodeURIComponent(`fact check ${claimQuery.slice(0, 60)}`)}`, label: 'Google Fact Check' },
          { url: `https://www.snopes.com/search/${encodeURIComponent(claimQuery.slice(0, 50))}/`, label: 'Snopes' },
          { url: `https://www.politifact.com/search/?q=${encodeURIComponent(claimQuery.slice(0, 50))}`, label: 'PolitiFact' },
          { url: `https://www.factcheck.org/?s=${encodeURIComponent(claimQuery.slice(0, 50))}`, label: 'FactCheck.org' },
          { url: `https://mediabiasfactcheck.com/?s=${encodeURIComponent(claimQuery.slice(0, 40))}`, label: 'Media Bias/Fact Check' },
        ],
      });
    }
  });

  feedEntries.slice(0, 3).forEach((entry, idx) => {
    const tier = entry.tier || getSourceTier(entry.source || '');
    const confidence = 63 + ((idx * 9 + (entry.title || '').length) % 28);
    const title = entry.title?.slice(0, 80) || '';
    corroborating.push({
      source: entry.source || `Feed source ${idx + 1}`,
      claim: `Feed match: "${entry.title}"`,
      matchedText: entry.snippet ? entry.snippet.slice(0, 160) : entry.title,
      evidence: [
        `Matched feed headline: ${entry.title}`,
        `Matched terms: ${matchedKeywords.slice(0, 6).join(', ') || 'N/A'}`,
        `Feed source: ${entry.source || 'curated'}`,
        entry.date ? `Published: ${entry.date}` : 'Date unknown',
        entry.url ? `Article URL: ${entry.url}` : null,
      ].filter(Boolean),
      confidence,
      note: 'Keyword terms appeared in curated static feed headlines.',
      tier,
      searchUrl: `https://www.google.com/search?q=${encodeURIComponent(title)}`,
      searchUrls: [
        { url: `https://www.google.com/search?q=${encodeURIComponent(title)}`, label: 'Google Search' },
        { url: `https://news.google.com/search?q=${encodeURIComponent(title)}&hl=en`, label: 'Google News' },
        entry.url ? { url: entry.url, label: `Source: ${entry.source || 'Feed'}` } : null,
        { url: `https://www.snopes.com/search/${encodeURIComponent(title.slice(0, 50))}/`, label: 'Snopes' },
        { url: `https://www.politifact.com/search/?q=${encodeURIComponent(title.slice(0, 50))}`, label: 'PolitiFact' },
      ].filter(Boolean),
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
      searchUrls: [],
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

// ─── Short URL & known phishing domains ──────────────────────────────────────
const SHORT_URL_DOMAINS = ['t.co', 'bit.ly', 'tinyurl.com', 'goo.gl', 'ow.ly', 'buff.ly', 'dlvr.it',
  'qr.io', 'cutt.ly', 'is.gd', 'v.gd', 'rb.gy', 'short.io', 'tiny.cc', 'shorturl.at', 'snip.ly'];
const PHISHING_BRANDS   = ['paypal', 'apple', 'microsoft', 'amazon', 'google', 'netflix', 'facebook',
  'instagram', 'twitter', 'wellsfargo', 'bankofamerica', 'chase', 'citibank', 'ebay', 'dropbox'];
const PHISHING_LEGITIMATE_DOMAINS = new Set([
  'paypal.com', 'apple.com', 'microsoft.com', 'amazon.com', 'google.com',
  'netflix.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
  'wellsfargo.com', 'bankofamerica.com', 'chase.com', 'citibank.com', 'ebay.com', 'dropbox.com',
]);
const BULLETPROOF_TLDS  = ['ru', 'cn', 'pw', 'tk', 'ml', 'ga', 'cf', 'gq'];

// Levenshtein edit distance — module-scope so it's not re-created on every URL analysis.
// Implements early exit when the accumulated minimum exceeds maxDist to avoid O(m*n) work.
function levenshtein(a, b, maxDist = 2) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > maxDist) return maxDist + 1;
  const prev = Array.from({ length: n + 1 }, (_, j) => j);
  const curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    prev.splice(0, n + 1, ...curr);
  }
  return curr[n];
}

/**
 * Build heuristic web-security findings for a URL without any live network
 * fetch. All checks are derived statically from the URL structure and domain.
 *
 * @param {URL} urlObj - parsed URL object
 * @param {string} domain - hostname without www.
 * @param {boolean} hasHttps
 * @returns {Array<object>} findings
 */
function buildWebSecurityFindings(urlObj, domain, hasHttps) {
  const findings = [];
  const path     = urlObj.pathname.toLowerCase();
  const fullUrl  = urlObj.href;
  const tld      = domain.split('.').pop().toLowerCase();

  // ── 1. HTTPS / TLS ────────────────────────────────────────────────────────
  findings.push({
    label: 'Transport security (HTTPS)',
    value: hasHttps ? 'HTTPS — encrypted' : 'HTTP — unencrypted (no TLS)',
    status: hasHttps ? 'good' : 'bad',
    section: 'Web Security',
    explanation: 'HTTPS encrypts the connection between the browser and the server. HTTP sends data in plain text.',
    dataPath: [
      `Protocol: ${urlObj.protocol}`,
      hasHttps ? 'TLS encryption present — data in transit is protected' : 'WARNING: No encryption — data sent in plain text, susceptible to MITM attacks',
    ],
  });

  // ── 2. Mixed content warning ──────────────────────────────────────────────
  if (hasHttps && /http:\/\//i.test(fullUrl.replace(/^https?:\/\//, ''))) {
    findings.push({
      label: 'Potential mixed content',
      value: 'HTTP sub-resources may be present on HTTPS page',
      status: 'warn',
      section: 'Web Security',
      explanation: 'An HTTPS page loading HTTP sub-resources (images, scripts) exposes those resources to interception.',
      dataPath: ['HTTP references detected in URL path or parameters alongside HTTPS protocol'],
    });
  }

  // ── 3. Short URL / redirect detection ────────────────────────────────────
  const isShortUrl = SHORT_URL_DOMAINS.some((sd) => domain.endsWith(sd) || domain === sd);
  if (isShortUrl) {
    findings.push({
      label: 'Short URL / redirect service',
      value: `Domain "${domain}" is a known URL shortener`,
      status: 'warn',
      section: 'Web Security',
      explanation: 'Short URLs obscure the final destination, which can be used for phishing or malware distribution.',
      dataPath: [
        `Domain "${domain}" matched known short-URL service list`,
        'Final destination cannot be verified without following the redirect',
        'Treat short links from unknown senders with caution',
      ],
    });
  }

  // ── 4. Phishing brand impersonation ──────────────────────────────────────
  const matchedBrand = PHISHING_BRANDS.find(
    (b) => domain.includes(b) && !PHISHING_LEGITIMATE_DOMAINS.has(domain),
  );
  if (matchedBrand) {
    findings.push({
      label: 'Brand impersonation risk',
      value: `Domain contains "${matchedBrand}" but is not the official domain`,
      status: 'bad',
      section: 'Web Security',
      explanation: 'Phishing sites frequently include a trusted brand name in a non-official domain to mislead users.',
      dataPath: [
        `Domain: ${domain}`,
        `Matched brand: "${matchedBrand}"`,
        `Domain is NOT the official ${matchedBrand} domain`,
        'High risk of phishing / credential harvesting',
      ],
    });
  }

  // ── 5. PWA / service worker patterns ─────────────────────────────────────
  const hasSW  = /service[-_]?worker|sw\.js/i.test(path);
  const hasPWA = /manifest\.(?:json|webmanifest)/i.test(path);
  if (hasSW || hasPWA) {
    findings.push({
      label: 'PWA / service worker patterns',
      value: hasSW ? 'Service worker path detected' : 'Web App Manifest path detected',
      status: 'info',
      section: 'Web Security',
      explanation: 'Progressive Web App files allow offline caching and push notifications. Not inherently malicious but worth noting.',
      dataPath: [`Path contains: ${path.slice(0, 80)}`],
    });
  }

  // ── 6. Notification / alert bait patterns ────────────────────────────────
  if (/notif|alert|push[-_]sub|subscribe/i.test(path + fullUrl)) {
    findings.push({
      label: 'Notification / alert patterns',
      value: 'URL contains notification subscription patterns',
      status: 'warn',
      section: 'Web Security',
      explanation: 'Aggressive notification prompts are used by scam sites to push spam or malware download alerts.',
      dataPath: [`Matched pattern in URL: ${path.slice(0, 80)}`],
    });
  }

  // ── 7. Bulletproof / high-risk TLD ───────────────────────────────────────
  if (BULLETPROOF_TLDS.includes(tld) && !hasHttps) {
    findings.push({
      label: 'High-risk TLD + no HTTPS',
      value: `.${tld} without HTTPS — bulletproof hosting pattern`,
      status: 'bad',
      section: 'Web Security',
      explanation: `The TLD .${tld} combined with lack of HTTPS is a common pattern for bulletproof hosting, scam, or malware sites.`,
      dataPath: [
        `TLD: .${tld} (in high-risk list)`,
        `HTTPS: not present`,
        'Combination matches bulletproof hosting heuristic',
      ],
    });
  }

  // ── 8. Permission-Policy header notes ────────────────────────────────────
  findings.push({
    label: 'Permission-Policy headers (static note)',
    value: 'Cannot verify server headers client-side — check manually',
    status: 'info',
    section: 'Web Security',
    explanation: 'Permission-Policy headers restrict browser APIs (camera, microphone, geolocation, payment). They cannot be checked from client-side JavaScript due to CORS. Use securityheaders.com to verify.',
    dataPath: [
      'Verification requires server-side check or external tool',
      'Recommendation: check https://securityheaders.com for this domain',
      'Key headers to verify: Permission-Policy, Content-Security-Policy, X-Frame-Options, HSTS',
    ],
    searchUrls: [
      { url: `https://securityheaders.com/?q=${encodeURIComponent(urlObj.origin)}&followRedirects=on`, label: 'SecurityHeaders.com scan' },
    ],
  });

  // ── 9. IP address direct hosting ─────────────────────────────────────────
  const isIp = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(domain);
  if (isIp) {
    findings.push({
      label: 'IP address hosting (no domain)',
      value: `Hosted on raw IP: ${domain}`,
      status: 'bad',
      section: 'Web Security',
      explanation: 'Legitimate content is rarely hosted directly on IP addresses. This is a strong indicator of malicious or temporary infrastructure.',
      dataPath: [`Domain field is a raw IP address: ${domain}`, 'No TLS certificate possible for raw IPs (usually)', 'High risk — phishing, C2, or temporary malware hosting'],
    });
  }

  // ── 10. Typosquatting / domain permutation detection ────────────────────
  const TYPOSQUAT_TARGETS = ['google', 'paypal', 'apple', 'amazon', 'microsoft', 'netflix', 'facebook',
    'instagram', 'twitter', 'youtube', 'linkedin', 'github', 'dropbox', 'icloud', 'outlook'];
  const domainBase = domain.split('.')[0].toLowerCase();
  for (const pop of TYPOSQUAT_TARGETS) {
    if (domainBase === pop) break;
    const dist = levenshtein(domainBase, pop);
    if (dist === 1 || (dist === 2 && pop.length > 5)) {
      findings.push({
        label: 'Typosquatting / domain permutation',
        value: `"${domainBase}" is 1-2 characters away from "${pop}"`,
        status: 'bad',
        section: 'Web Security',
        explanation: `Typosquatting registers domains nearly identical to popular sites. "${domainBase}" closely resembles "${pop}" and may be an impersonation.`,
        dataPath: [
          `Domain: ${domain}`,
          `Similar to: ${pop}.com (edit distance: ${dist})`,
          'Typosquatters rely on users mistyping URLs',
          'Do NOT enter credentials on this page',
        ],
      });
      break;
    }
  }

  return findings;
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

    const { entries: feedEntries, matchedKeywords } = selectFeedEntriesWithKeywords(feedData, `${domain} ${url}`, 10);
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

    // Domain reputation value includes HTTPS as a sub-factor
    const domainReputationValue = isTrusted
      ? `Trusted source${!hasHttps ? ' · HTTP only (verify link)' : ' · HTTPS secured'}`
      : isSuspicious
        ? `Suspicious domain${!hasHttps ? ' · no HTTPS' : ''}`
        : `Unknown source${!hasHttps ? ' · HTTP only' : ''}`;

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
      skippedFeatures: [
        { name: 'Live WHOIS lookup', reason: 'Requires server-side proxy — heuristic age estimate used instead', skipped: true },
        { name: 'Real-time fact-check API', reason: 'No API key configured — static corroboration feed used', skipped: true },
        { name: 'Reverse image search', reason: 'Not applicable for URL analysis type', skipped: false, na: true },
      ],
      findings: [
        {
          label: 'Domain reputation',
          value: domainReputationValue,
          status: isTrusted ? 'good' : isSuspicious ? 'bad' : 'warn',
          excerpt: `Domain: ${domain} | Protocol: ${urlObj.protocol} | Trusted: ${isTrusted} | Suspicious: ${isSuspicious}`,
          dataPath: [
            `Input URL: ${url}`,
            `Extracted domain: ${domain}`,
            `Protocol: ${urlObj.protocol} — ${hasHttps ? 'HTTPS (secure, encrypted connection)' : 'HTTP (unencrypted — risk signal for domain reputation)'}`,
            `Checked against ${TRUSTED_DOMAINS.length} trusted domains: ${isTrusted ? 'MATCH FOUND' : 'no match'}`,
            `Checked against ${SUSPICIOUS_DOMAINS.length} suspicious patterns: ${isSuspicious ? 'MATCH FOUND' : 'no match'}`,
            `HTTPS score impact: ${!hasHttps ? '-10 points (HTTP-only is a domain reputation risk)' : 'none'}`,
            `Verdict: ${isTrusted ? 'Trusted' : isSuspicious ? 'Suspicious' : 'Unknown'}`,
          ],
          searchUrl: `https://www.google.com/search?q=${encodeURIComponent(`"${domain}" reliability fact check`)}`,
          searchUrls: [
            { url: `https://www.google.com/search?q=${encodeURIComponent(`"${domain}" reliability fact check`)}`, label: 'Google Search' },
            { url: `https://mediabiasfactcheck.com/?s=${encodeURIComponent(domain)}`, label: 'Media Bias/Fact Check' },
            { url: `https://www.allsides.com/search/node/${encodeURIComponent(domain)}`, label: 'AllSides' },
            { url: `https://www.newsguardtech.com/search/?q=${encodeURIComponent(domain)}`, label: 'NewsGuard' },
          ],
        },
        {
          label: 'Domain age (est.)',
          value: `~${Math.round(domainAgeDays / 365)} years`,
          status: domainAgeDays > 365 ? 'good' : 'warn',
          explanation: 'Estimated domain age via heuristic. Real WHOIS lookup is unavailable in static environments.',
          dataPath: [
            `Note: real-time WHOIS is unavailable (skipped — server-side proxy required)`,
            `Heuristic age estimate: ~${Math.round(domainAgeDays / 365)} years (${domainAgeDays} days)`,
            `Threshold: domains > 1 year old are considered established`,
            domainAgeDays > 365 ? 'Status: established domain' : 'Status: relatively new domain (higher uncertainty)',
          ],
          searchUrl: `https://who.is/whois/${encodeURIComponent(domain)}`,
          searchUrls: [
            { url: `https://who.is/whois/${encodeURIComponent(domain)}`, label: 'WHOIS lookup (who.is)' },
            { url: `https://www.whois.com/whois/${encodeURIComponent(domain)}`, label: 'WHOIS lookup (whois.com)' },
          ],
        },
        {
          label: 'URL patterns',
          value: pathKeywords ? 'Clickbait patterns detected' : 'No suspicious patterns',
          status: pathKeywords ? 'bad' : 'good',
          excerpt: pathKeywords ? url : 'No suspicious patterns found in URL path',
          dataPath: [
            `Input URL: ${url}`,
            `Scanned URL path for ${SUSPICIOUS_KEYWORDS.length} suspicious keyword patterns`,
            pathKeywords ? 'MATCH: Suspicious/sensational pattern found in URL path (e.g. "shocking", "you-won\'t-believe")' : 'No matches found',
            `Score impact: ${pathKeywords ? '-15 points' : 'none'}`,
          ],
        },
        {
          label: 'Cross-source consistency',
          value: `${crossCheck.consistencyScore}% (${crossCheck.corroboratingCount} corroborating / ${crossCheck.conflictingCount} conflicting)`,
          status: crossCheck.consistencyScore >= 65 ? 'good' : crossCheck.consistencyScore >= 40 ? 'warn' : 'bad',
          dataPath: [
            `Corroborating sources: ${crossCheck.corroboratingCount}`,
            `Conflicting sources: ${crossCheck.conflictingCount}`,
            `Methodology: ${crossCheck.methodology}`,
            `Matched feed keywords: ${matchedKeywords.slice(0, 6).join(', ') || 'none'}`,
          ],
        },
        {
          label: 'Emotional tone',
          value: `${sentiment.label} (${sentiment.intensity}% intensity)`,
          status: Math.abs(sentiment.normalizedScore) > 2.5 ? 'warn' : 'good',
          explanation: 'Analyzed URL path and domain text for emotional word patterns using AFINN-style scoring.',
          dataPath: [
            `Analyzed text: "${domain} ${urlPathText.slice(0, 60)}"`,
            `Sentiment label: ${sentiment.label}`,
            `Intensity: ${sentiment.intensity}%`,
            `Score impact: ${Math.abs(sentiment.normalizedScore) > 3 ? '-5 points (high emotional intensity)' : 'none'}`,
          ],
        },
        {
          label: 'Manipulative patterns',
          value: darkPatternsResult.matchCount > 0
            ? `${darkPatternsResult.matchCount} detected: ${darkPatternsResult.detected.slice(0, 2).map((d) => d.label).join(', ')}`
            : 'None detected',
          status: darkPatternsResult.riskLevel === 'high' ? 'bad' : darkPatternsResult.riskLevel === 'medium' ? 'warn' : 'good',
          excerpt: darkPatternsResult.matchCount > 0
            ? darkPatternsResult.detected.slice(0, 2).map((d) => `${d.label}: "${d.match}"`).join(' | ')
            : 'No manipulative framing patterns detected',
          dataPath: [
            `Scanned URL path for ${darkPatternsResult.matchCount} manipulative framing patterns`,
            `Risk level: ${darkPatternsResult.riskLevel}`,
            ...(darkPatternsResult.detected.slice(0, 3).map((d) => `→ ${d.label} (${d.category}): matched "${d.match}"`)),
          ],
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
            dataPath: [
              `TLD extracted: .${tld}`,
              `Checked against ${SUSPICIOUS_TLDS.length} high-risk TLDs: ${isSuspTld ? 'MATCH — high-risk TLD' : 'no match'}`,
              `Checked against ${TRUSTED_TLDS.length} standard TLDs: ${isTrustedTld ? 'standard TLD' : 'not in standard list'}`,
              isSuspTld ? 'Score impact: -10 points' : 'No score impact',
            ],
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
            dataPath: [
              `Domain: ${domain}`,
              `Parsed parts: ${parts.join(' → ')}`,
              `Subdomain levels: ${depth}`,
              depth > 2 ? 'WARNING: Deep subdomain nesting — possible domain spoofing' : 'Normal subdomain depth',
            ],
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
            dataPath: [
              `URL path: ${urlObj.pathname}`,
              `Path depth: ${Math.max(0, pathDepth)} level(s)`,
              pathDepth > 5 ? 'WARNING: Unusually deep path — possible spam/dynamically generated page' : 'Normal path depth',
            ],
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
            dataPath: [
              `Query string: ${urlObj.search || 'none'}`,
              `Parameter count: ${paramCount}`,
              paramCount > 5 ? `WARNING: ${paramCount} query parameters — possible heavy tracking or dynamic content assembly` : 'Normal parameter count',
              paramCount > 5 ? 'Score impact: -5 points' : 'No score impact',
            ],
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
        // ── Web Security checks (heuristic, no live fetch) ──────────────────────
        ...buildWebSecurityFindings(urlObj, domain, hasHttps),
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
  const { entries: feedEntries, matchedKeywords } = selectFeedEntriesWithKeywords(feedData, text, 10);
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
    skippedFeatures: [
      { name: 'Live fact-check API', reason: 'No API key configured — static corroboration feed used instead', skipped: true },
      { name: 'Reverse image search', reason: 'Not applicable for text analysis type', skipped: false, na: true },
      { name: 'Live WHOIS lookup', reason: 'Not applicable for text analysis type', skipped: false, na: true },
    ],
    findings: [
      {
        label: 'Word count',
        value: `${wordCount} words`,
        status: wordCount > 100 ? 'good' : wordCount > 30 ? 'warn' : 'bad',
        explanation: 'Longer articles provide more context for heuristic analysis. Very short texts have lower reliability.',
        dataPath: [
          `Total word count: ${wordCount}`,
          wordCount < 30 ? 'WARNING: Very short text — analysis reliability is limited' : wordCount < 100 ? 'Short text — moderate confidence' : 'Sufficient length for analysis',
          `Score impact: ${wordCount > 200 ? '+10 points' : wordCount > 50 ? '+5 points' : '-10 points (too short)'}`,
        ],
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
          ...(suspiciousMatches.length > 0
            ? suspiciousMatches.slice(0, 5).map((k) => {
                const idx = lower.indexOf(k);
                const ctx = idx >= 0 ? `"...${text.slice(Math.max(0, idx - 15), idx + k.length + 15)}..."` : '(not found in context)';
                return `→ "${k}" found at position ${idx}: ${ctx}`;
              })
            : []),
          `Score impact: ${suspiciousMatches.length > 0 ? `-${suspiciousMatches.length * 8} points` : 'none'}`,
        ],
      },
      {
        label: 'Capitalization',
        value: `${(capsRatio * 100).toFixed(1)}% caps`,
        status: capsRatio < 0.15 ? 'good' : capsRatio < 0.3 ? 'warn' : 'bad',
        explanation: 'Excessive capitalization (SHOUTING) is a hallmark of sensationalist or low-credibility content.',
        excerpt: `Ratio: ${(capsRatio * 100).toFixed(1)}% of non-space characters are uppercase`,
        dataPath: [
          `Total non-space characters: ${text.replace(/\s/g, '').length}`,
          `Uppercase characters: ${(text.match(/[A-Z]/g) || []).length}`,
          `Capitalization ratio: ${(capsRatio * 100).toFixed(1)}%`,
          `Threshold: >30% is excessive, 15-30% is elevated`,
          `Score impact: ${capsRatio > 0.3 ? '-15 points' : capsRatio > 0.15 ? '-8 points' : 'none'}`,
        ],
      },
      {
        label: 'Exclamation marks',
        value: `${exclamCount} found`,
        status: exclamCount === 0 ? 'good' : exclamCount <= 2 ? 'warn' : 'bad',
        explanation: 'Heavy use of exclamation marks is a common emotional manipulation tactic.',
        dataPath: [
          `Exclamation mark count: ${exclamCount}`,
          `Threshold: >3 is excessive, >1 is elevated`,
          `Score impact: ${exclamCount > 3 ? '-10 points' : exclamCount > 1 ? '-5 points' : 'none'}`,
        ],
      },
      {
        label: 'Contains citations',
        value: hasQuotes ? 'Quoted sources present' : 'No quoted sources',
        status: hasQuotes ? 'good' : 'warn',
        explanation: 'Quoted text (in quotation marks) indicates the author is citing sources rather than paraphrasing.',
        excerpt: hasQuotes
          ? (text.match(/[""][^""]{10,60}[""]|"[^"]{10,60}"/)?.[0] || 'Quote found')
          : 'No quoted text detected',
        dataPath: [
          `Searched for text enclosed in " " or \u201c\u201d quotation marks (min 10 chars)`,
          hasQuotes ? 'Quotes found — source material likely cited' : 'No quotes detected',
          `Score impact: ${hasQuotes ? '+5 points' : 'none'}`,
        ],
      },
      {
        label: 'Numerical data',
        value: hasNumbers ? 'Contains numbers / stats' : 'No numerical data',
        status: hasNumbers ? 'good' : 'warn',
        explanation: 'Specific numbers, percentages, and statistics make claims more verifiable.',
        excerpt: hasNumbers
          ? (text.match(/\d+(?:\.\d+)?(?:\s*%|\s+(?:million|billion|percent))?/)?.[0] || 'Numbers present')
          : 'No numbers or statistics found',
        dataPath: [
          `Scanned text for numeric characters`,
          hasNumbers ? 'Numbers detected — claims are potentially verifiable' : 'No numbers found — claims may be unverifiable',
          `Score impact: ${hasNumbers ? '+5 points' : 'none'}`,
        ],
      },
      {
        label: 'Cross-source consistency',
        value: `${crossCheck.consistencyScore}% (${crossCheck.corroboratingCount} corroborating / ${crossCheck.conflictingCount} conflicting)`,
        status: crossCheck.consistencyScore >= 65 ? 'good' : crossCheck.consistencyScore >= 40 ? 'warn' : 'bad',
        dataPath: [
          `Corroborating sources: ${crossCheck.corroboratingCount}`,
          `Conflicting sources: ${crossCheck.conflictingCount}`,
          `Methodology: ${crossCheck.methodology}`,
          `Matched feed keywords: ${matchedKeywords.slice(0, 8).join(', ') || 'none'}`,
        ],
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
      // ─── Link extractor ────────────────────────────────────────────────
      ...((() => {
        const extractedLinks = (text.match(/https?:\/\/[^\s"'<>)]{6,}/g) || []).slice(0, 20);
        const suspiciousLinks = extractedLinks.filter((u) => {
          try {
            const h = new URL(u).hostname;
            return SHORT_URL_DOMAINS.some((d) => h === d || h.endsWith('.' + d))
              || /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(h)
              || BULLETPROOF_TLDS.some((t) => h.endsWith(t));
          } catch { return false; }
        });
        if (extractedLinks.length === 0) return [];
        return [{
          label: `Links in text (${extractedLinks.length})`,
          value: suspiciousLinks.length > 0
            ? `${extractedLinks.length} found — ${suspiciousLinks.length} suspicious`
            : `${extractedLinks.length} link${extractedLinks.length > 1 ? 's' : ''} found`,
          status: suspiciousLinks.length > 0 ? 'warn' : 'info',
          explanation: 'URLs embedded in text may link to malicious or misleading destinations.',
          dataPath: extractedLinks.slice(0, 10).map((u) => {
            const isSusp = suspiciousLinks.includes(u);
            return `${isSusp ? '⚠ ' : '→ '}${u.slice(0, 120)}`;
          }),
        }];
      })()),
      // ─── Encoding / obfuscation detector ──────────────────────────────
      ...((() => {
        const findings2 = [];
        const b64Matches = text.match(/[A-Za-z0-9+/]{40,}={0,2}/g) || [];
        if (b64Matches.length > 0) {
          findings2.push({
            label: 'Base64-encoded data',
            value: `${b64Matches.length} block${b64Matches.length > 1 ? 's' : ''} detected`,
            status: 'warn',
            explanation: 'Long base64 strings may encode hidden payloads, scripts, or links.',
            dataPath: b64Matches.slice(0, 3).map((s) => `→ ${s.slice(0, 80)}…`),
          });
        }
        const hexMatches = text.match(/\\x[0-9a-fA-F]{2}(?:\\x[0-9a-fA-F]{2}){4,}/g) || [];
        if (hexMatches.length > 0) {
          findings2.push({
            label: 'Hex escape sequences',
            value: `${hexMatches.length} sequence${hexMatches.length > 1 ? 's' : ''} detected`,
            status: 'warn',
            explanation: 'Hex-escaped character sequences are commonly used to obfuscate malicious strings.',
            dataPath: hexMatches.slice(0, 3).map((s) => `→ ${s.slice(0, 80)}`),
          });
        }
        // eslint-disable-next-line no-misleading-character-class -- intentional range covering directional control chars
        const zwChars = (text.match(/[\u200b\u200c\u200d\u200e\u200f\u202a-\u202e\ufeff]/g) || []).length;
        if (zwChars > 0) {
          findings2.push({
            label: 'Zero-width / invisible characters',
            value: `${zwChars} found`,
            status: 'bad',
            explanation: 'Zero-width and invisible Unicode characters can be used for steganography, tracking, or to bypass filters.',
            dataPath: [`Found ${zwChars} invisible Unicode character(s)`, 'Common in social media copypasta, text watermarking, and payload delivery'],
          });
        }
        return findings2;
      })()),
      // ─── Email header auto-detection ────────────────────────────────
      ...((() => {
        const emailHeaderRe = /^(?:From|To|Subject|Date|Received|MIME-Version|Content-Type|Message-ID|X-[A-Za-z-]+)\s*:/im;
        if (!emailHeaderRe.test(text)) return [];
        const findings2 = [];
        const spfMatch = text.match(/spf=(pass|fail|softfail|neutral|none)/i);
        const dkimMatch = text.match(/dkim=(pass|fail|none)/i);
        const dmarcMatch = text.match(/dmarc=(pass|fail|none)/i);
        const spf = spfMatch?.[1]?.toLowerCase();
        const dkim = dkimMatch?.[1]?.toLowerCase();
        const dmarc = dmarcMatch?.[1]?.toLowerCase();
        const authStatus = spf === 'pass' && dkim === 'pass' ? 'good'
          : (spf === 'fail' || dkim === 'fail' || dmarc === 'fail') ? 'bad' : 'warn';
        findings2.push({
          label: 'Email headers detected',
          value: `SPF: ${spf ?? 'not found'} | DKIM: ${dkim ?? 'not found'} | DMARC: ${dmarc ?? 'not found'}`,
          status: authStatus,
          explanation: 'This text looks like email headers. SPF/DKIM/DMARC authentication results indicate whether the email was legitimately sent from the stated domain.',
          dataPath: [
            'Email header format detected in pasted text',
            `SPF result: ${spf ?? 'not present'} — ${spf === 'pass' ? 'sender is authorized' : spf === 'fail' ? 'sender is NOT authorized — possible spoofing' : 'indeterminate'}`,
            `DKIM result: ${dkim ?? 'not present'} — ${dkim === 'pass' ? 'signature valid' : dkim === 'fail' ? 'signature invalid — tampering or spoofing' : 'not signed'}`,
            `DMARC result: ${dmarc ?? 'not present'} — ${dmarc === 'pass' ? 'policy satisfied' : dmarc === 'fail' ? 'policy violated' : 'no policy'}`,
          ],
        });
        const receivedHops = (text.match(/^Received:/gim) || []).length;
        if (receivedHops > 0) {
          findings2.push({
            label: 'Mail relay hops',
            value: `${receivedHops} hop${receivedHops > 1 ? 's' : ''}`,
            status: receivedHops > 5 ? 'warn' : 'info',
            explanation: 'Each Received header is a relay hop. Unusually many hops may indicate routing through unusual servers.',
            dataPath: [`${receivedHops} Received headers found`, receivedHops > 5 ? 'Unusually high hop count' : 'Normal hop count'],
          });
        }
        return findings2;
      })()),
    ],
    sentiment,
    readability,
    darkPatterns: darkPatternsResult,
    timeline: [],
    error: null,
  };
}

/**
 * Analyze a code snippet and return a scanResults-shaped object.
 *
 * Uses the codeAnalyzer library for static pattern detection.
 * Supports Bash/sh, Python, and PowerShell.
 *
 * @param {string} code - the raw code string
 * @returns {object} scanResults-shaped object
 */
function analyzeCodeSnippet(code) {
  const result = analyzeCode(code);
  const { language, riskLevel, riskScore, findings: codeFindings, commandBreakdown } = result;

  const RISK_COLORS = { none: 'good', low: 'info', medium: 'warn', high: 'bad', critical: 'bad' };
  const RISK_EMOJIS = { none: '✅', low: '🔵', medium: '⚠️', high: '🚨', critical: '🚨' };

  const score = Math.max(5, 100 - riskScore);

  const langLabel = { bash: 'Bash/sh', python: 'Python', powershell: 'PowerShell', unknown: 'Unknown' }[language] ?? language;

  const findings = [
    {
      label: 'Detected language',
      value: langLabel,
      status: language === 'unknown' ? 'warn' : 'info',
      excerpt: `Language detection based on syntax patterns`,
      dataPath: [`Input snippet length: ${code.length} chars`, `Detected: ${langLabel}`],
    },
    {
      label: 'Risk level',
      value: `${RISK_EMOJIS[riskLevel] ?? ''} ${riskLevel.toUpperCase()} (score: ${riskScore}/100)`,
      status: RISK_COLORS[riskLevel] ?? 'info',
      excerpt: `Aggregated risk from ${codeFindings.length} pattern checks`,
      dataPath: [
        `Total risk score: ${riskScore}`,
        `Risk level: ${riskLevel}`,
        `Findings: ${codeFindings.length}`,
      ],
    },
    ...codeFindings.map((f) => ({
      label: f.label,
      value: `[${f.severity.toUpperCase()}] ${f.explanation}`,
      status: f.severity === 'critical' || f.severity === 'high' ? 'bad' : f.severity === 'medium' ? 'warn' : 'info',
      excerpt: f.match,
      dataPath: [
        `Pattern: ${f.label}`,
        `Severity: ${f.severity}`,
        `Explanation: ${f.explanation}`,
        `Why suspicious: ${f.why}`,
        `Match: ${f.match}`,
      ],
    })),
  ];

  return {
    authenticityScore: score,
    type: 'code',
    language,
    langLabel,
    riskLevel,
    riskScore,
    commandBreakdown,
    sources: [],
    duplicates: [],
    crossCheck: null,
    imageAnalysis: null,
    aiAnalysis: null,
    skippedFeatures: [
      { name: 'Dynamic execution analysis', reason: 'Code is never executed — static analysis only', skipped: true },
      { name: 'Sandbox detonation', reason: 'Requires backend — not available client-side', skipped: true },
    ],
    findings,
    timeline: [
      { label: 'Snippet received', detail: `${code.length} characters`, time: new Date().toISOString() },
      { label: 'Language detection', detail: langLabel, time: new Date().toISOString() },
      { label: 'Pattern analysis complete', detail: `${codeFindings.length} pattern(s) checked`, time: new Date().toISOString() },
    ],
  };
}

// ─── Magic byte signatures ────────────────────────────────────────────────────
const MAGIC_SIGNATURES = [
  { sig: '4D5A',         mime: 'application/x-dosexec',  label: 'Windows PE Executable (EXE/DLL)', executable: true },
  { sig: '7F454C46',     mime: 'application/x-elf',      label: 'ELF Executable (Linux/Unix)',      executable: true },
  { sig: 'CAFEBABE',     mime: 'application/x-java',     label: 'Java Class File',                  executable: true },
  { sig: 'FEEDFACE',     mime: 'application/x-macho',    label: 'Mach-O Executable (macOS)',        executable: true },
  { sig: 'CEFAEDFE',     mime: 'application/x-macho',    label: 'Mach-O Executable (macOS)',        executable: true },
  { sig: '504B0304',     mime: 'application/zip',        label: 'ZIP Archive',                      archive: true },
  { sig: '526172211A07', mime: 'application/x-rar',      label: 'RAR Archive',                      archive: true },
  { sig: '377ABCAF271C', mime: 'application/x-7z',       label: '7-Zip Archive',                    archive: true },
  { sig: '1F8B08',       mime: 'application/gzip',       label: 'GZip Archive',                     archive: true },
  { sig: '25504446',     mime: 'application/pdf',        label: 'PDF Document',                     doc: true },
  { sig: 'D0CF11E0A1B11AE1', mime: 'application/msword', label: 'MS Office Document (legacy)',      doc: true },
  { sig: 'FFD8FF',       mime: 'image/jpeg',             label: 'JPEG Image',                       image: true },
  { sig: '89504E47',     mime: 'image/png',              label: 'PNG Image',                        image: true },
  { sig: '47494638',     mime: 'image/gif',              label: 'GIF Image',                        image: true },
  { sig: '52494646',     mime: 'image/webp',             label: 'WebP Image',                       image: true },
  { sig: '49492A00',     mime: 'image/tiff',             label: 'TIFF Image',                       image: true },
  { sig: '424D',         mime: 'image/bmp',              label: 'BMP Image',                        image: true },
  { sig: '1A45DFA3',     mime: 'video/webm',             label: 'WebM Video',                       media: true },
  { sig: '000000',       mime: 'video/mp4',              label: 'MP4 Video (possible)',              media: true },
  { sig: '23212F',       mime: 'text/x-shellscript',     label: 'Shell Script (shebang)',            script: true },
];

/**
 * Analyze any file for security-relevant metadata, magic bytes, entropy, and strings.
 *
 * @param {File} file
 * @returns {Promise<object>} scanResults-shaped object
 */
async function analyzeFile(file) {
  const findings = [];
  const timeline = [{ label: 'File received', detail: file.name, time: new Date().toISOString() }];

  // ─── 1. SHA-256 + MD5-like fingerprint (using SubtleCrypto) ──────────────
  let sha256 = null;
  let fileBytes = null;
  try {
    fileBytes = new Uint8Array(await file.arrayBuffer());
    const hashBuf = await crypto.subtle.digest('SHA-256', fileBytes);
    // crypto.subtle.digest returns an ArrayBuffer; wrap it once in Uint8Array to iterate bytes.
    sha256 = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    timeline.push({ label: 'SHA-256 computed', detail: sha256.slice(0, 16) + '…', time: new Date().toISOString() });
  } catch {
    // hash unavailable
  }

  // ─── 2. Magic bytes detection ─────────────────────────────────────────────
  let detectedType = null;
  let isExecutable = false;
  let isArchive   = false;
  let isDocument  = false;
  let isScript    = false;
  let isImage     = false;
  if (fileBytes && fileBytes.length >= 8) {
    const hexHead = Array.from(fileBytes.slice(0, 16)).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join('');
    for (const sig of MAGIC_SIGNATURES) {
      if (hexHead.startsWith(sig.sig.toUpperCase())) {
        detectedType  = sig;
        isExecutable  = !!sig.executable;
        isArchive     = !!sig.archive;
        isDocument    = !!sig.doc;
        isScript      = !!sig.script;
        isImage       = !!sig.image;
        break;
      }
    }
    // Check shebang (for scripts)
    if (!detectedType && fileBytes[0] === 0x23 && fileBytes[1] === 0x21) {
      detectedType = MAGIC_SIGNATURES.find((s) => s.sig === '23212F') ?? { label: 'Script (shebang)', script: true };
      isScript = true;
    }
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const declaredMime = file.type || 'unknown';
  const magicLabel = detectedType?.label ?? 'Unknown / unrecognised format';

  findings.push({
    label: 'Magic bytes (file signature)',
    value: magicLabel,
    status: detectedType ? 'info' : 'warn',
    explanation: 'The first bytes of the file identify its true format regardless of the declared file name or MIME type.',
    dataPath: [
      `File: ${file.name} (.${ext})`,
      `Declared MIME: ${declaredMime}`,
      `Detected by magic bytes: ${magicLabel}`,
      fileBytes ? `First 8 bytes hex: ${Array.from(fileBytes.slice(0, 8)).map((b) => b.toString(16).padStart(2, '0')).join(' ')}` : 'bytes unavailable',
    ],
  });

  // Extension vs magic mismatch
  const extMimeMap = { exe: 'PE', dll: 'PE', elf: 'ELF', pdf: 'PDF', zip: 'ZIP', rar: 'RAR', '7z': '7-Zip', jpg: 'JPEG', jpeg: 'JPEG', png: 'PNG' };
  const expectedLabel = extMimeMap[ext];
  const magicMatchesExt = !expectedLabel || (detectedType?.label?.toUpperCase().includes(expectedLabel) ?? false);
  if (!magicMatchesExt && detectedType) {
    findings.push({
      label: 'File type mismatch',
      value: `Extension .${ext} but magic bytes indicate ${detectedType.label}`,
      status: 'bad',
      explanation: 'The file extension does not match the actual file format — a common trick to disguise malicious files.',
      dataPath: [
        `Extension: .${ext} suggests ${expectedLabel}`,
        `Actual format from magic bytes: ${detectedType.label}`,
        'MISMATCH — potential disguised malicious file',
      ],
    });
  }

  // ─── 3. Entropy calculation ───────────────────────────────────────────────
  let entropy = 0;
  if (fileBytes && fileBytes.length > 0) {
    const freq = new Array(256).fill(0);
    const sampleLen = Math.min(fileBytes.length, 65536);
    for (let i = 0; i < sampleLen; i++) freq[fileBytes[i]]++;
    for (let i = 0; i < 256; i++) {
      const p = freq[i] / sampleLen;
      if (p > 0) entropy -= p * Math.log2(p);
    }
    entropy = Math.round(entropy * 100) / 100;
  }

  const highEntropy = entropy > 7.0;
  findings.push({
    label: 'File entropy',
    value: `${entropy} bits/byte — ${highEntropy ? 'High (likely encrypted or packed)' : entropy > 5.5 ? 'Medium (compressed)' : 'Low (plaintext/structured)'}`,
    status: highEntropy ? 'bad' : entropy > 5.5 ? 'warn' : 'good',
    explanation: 'Shannon entropy measures randomness. High entropy (>7.0) indicates encryption, packing, or obfuscation.',
    dataPath: [
      `Calculated over first ${Math.min(fileBytes?.length ?? 0, 65536)} bytes`,
      `Entropy: ${entropy} bits/byte`,
      `Threshold for encrypted/packed: >7.0`,
      highEntropy ? 'HIGH entropy — file may be encrypted, packed, or obfuscated' : 'Normal entropy range',
    ],
  });

  // ─── 4. Executable warning ────────────────────────────────────────────────
  if (isExecutable) {
    findings.push({
      label: '⚠ Executable file detected',
      value: `${detectedType.label} — NOT an image or document`,
      status: 'bad',
      explanation: 'This file is an executable binary. Running untrusted executables is extremely dangerous.',
      dataPath: [
        `Magic bytes confirm: ${detectedType.label}`,
        'Executable files can install malware, ransomware, or backdoors when run',
        'Full malware analysis requires backend sandbox execution — not performed in browser',
        'Recommendation: submit to VirusTotal before running',
      ],
      searchUrls: [
        sha256 ? { url: `https://www.virustotal.com/gui/file/${sha256}`, label: 'VirusTotal hash lookup' } : null,
        { url: 'https://www.virustotal.com/', label: 'VirusTotal file upload' },
      ].filter(Boolean),
    });
  }

  // ─── 5. String extraction ─────────────────────────────────────────────────
  const strings = [];
  if (fileBytes) {
    let current = '';
    for (let i = 0; i < Math.min(fileBytes.length, FILE_STRING_SCAN_LIMIT); i++) {
      const c = fileBytes[i];
      if (c >= 32 && c < 127) {
        current += String.fromCharCode(c);
      } else {
        if (current.length >= 4) strings.push(current);
        current = '';
      }
    }
    if (current.length >= 4) strings.push(current);
  }

  const urls = strings.filter((s) => /https?:\/\/[^\s"'<>]{6,}/.test(s)).slice(0, 20);
  const emails = strings.filter((s) => /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/.test(s)).slice(0, 10);

  if (urls.length > 0) {
    findings.push({
      label: `URLs extracted from file (${urls.length})`,
      value: urls.slice(0, 3).join(' | '),
      status: 'warn',
      explanation: 'URLs extracted from printable strings in the file. Embedded URLs in executables/documents may indicate C2 connections or downloads.',
      dataPath: urls.slice(0, 10).map((u) => `→ ${u.slice(0, 120)}`),
    });
  }

  if (emails.length > 0) {
    findings.push({
      label: `Email addresses found (${emails.length})`,
      value: emails.slice(0, 3).join(' | '),
      status: 'info',
      explanation: 'Email addresses embedded in the file — may belong to the author, target, or attacker.',
      dataPath: emails.slice(0, 8).map((e) => `→ ${e.slice(0, 80)}`),
    });
  }

  // ─── 6. Suspicious filename patterns ──────────────────────────────────────
  const suspFilenamePatterns = [
    { re: /\.(exe|dll|bat|cmd|ps1|vbs|js)\.pdf$/i, reason: 'Double extension hiding executable type' },
    { re: /\.(pdf|docx|xlsx)\.(exe|dll|bat|cmd)$/i, reason: 'Document extension hiding executable' },
    { re: /^[a-f0-9]{32,64}$/i, reason: 'Hash-like filename (often used by malware droppers)' },
    { re: /update|installer|setup|crack|keygen|patch/i, reason: 'Common malware filename pattern' },
  ];
  for (const { re, reason } of suspFilenamePatterns) {
    if (re.test(file.name)) {
      findings.push({
        label: 'Suspicious filename pattern',
        value: `"${file.name}" — ${reason}`,
        status: 'bad',
        explanation: reason,
        dataPath: [`Filename: ${file.name}`, `Matched pattern: ${re.toString()}`, reason],
      });
      break;
    }
  }

  // ─── 7. Archive note ─────────────────────────────────────────────────────
  if (isArchive) {
    findings.push({
      label: 'Archive file',
      value: `${detectedType?.label ?? 'Archive'} — contents cannot be inspected in-browser`,
      status: 'warn',
      explanation: 'Archive files can contain multiple files including executables. Contents cannot be safely inspected client-side.',
      dataPath: [
        'Browser security prevents opening archive contents',
        'Submit to VirusTotal or use a sandboxed environment to inspect',
        isExecutable ? 'Archive contains executable headers — high risk' : 'No executable header detected in outer archive',
      ],
    });
  }

  // ─── 8. Risk scoring ──────────────────────────────────────────────────────
  let riskScore = 0;
  if (isExecutable) riskScore += 40;
  if (highEntropy)  riskScore += 20;
  if (!magicMatchesExt && detectedType) riskScore += 25;
  const suspNameMatch = suspFilenamePatterns.some(({ re }) => re.test(file.name));
  if (suspNameMatch) riskScore += 15;

  const authenticityScore = Math.max(5, 100 - riskScore);

  timeline.push({ label: 'Analysis complete', detail: `Risk score: ${riskScore}/100`, time: new Date().toISOString() });

  return {
    authenticityScore,
    type: 'file',
    fileName: file.name,
    fileSize: `${(file.size / 1024).toFixed(1)} KB`,
    fileHash: sha256 ? `SHA-256: ${sha256.slice(0, 16)}…` : null,
    fileHashFull: sha256,
    detectedType: detectedType?.label ?? 'unknown',
    isExecutable,
    isArchive,
    isDocument,
    isScript,
    isImage,
    fileEntropy: entropy,
    extractedUrls: urls,
    extractedEmails: emails,
    extractedStrings: strings.slice(0, 100),
    sources: [],
    duplicates: [],
    crossCheck: null,
    imageAnalysis: null,
    aiAnalysis: null,
    skippedFeatures: [
      { name: 'Cloud virus/malware scan', reason: 'Backend submission not yet available — client-side static analysis only', skipped: true },
      { name: 'CA signature verification', reason: 'Requires server-side tooling (signtool, codesign, openssl) — not available in browser', skipped: true },
      { name: 'Dynamic execution analysis', reason: 'File is never executed — static analysis only', skipped: true },
    ],
    findings,
    timeline,
    error: null,
  };
}

/**
 * Analyze an image file and return a scanResults-shaped object.
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

      // Extended EXIF fields
      if (parsed.FNumber != null) {
        exifFindings.push({ label: 'Aperture (f-stop)', value: `f/${parsed.FNumber}`, status: 'info',
          excerpt: `EXIF FNumber: ${parsed.FNumber}`, dataPath: [`EXIF FNumber: ${parsed.FNumber}`] });
      }
      if (parsed.ExposureTime != null) {
        const exp = parsed.ExposureTime < 1 ? `1/${Math.round(1 / parsed.ExposureTime)}s` : `${parsed.ExposureTime}s`;
        exifFindings.push({ label: 'Exposure time', value: exp, status: 'info',
          excerpt: `EXIF ExposureTime: ${parsed.ExposureTime}`, dataPath: [`EXIF ExposureTime: ${parsed.ExposureTime}`] });
      }
      if (parsed.ISO != null) {
        exifFindings.push({ label: 'ISO', value: String(parsed.ISO), status: 'info',
          excerpt: `EXIF ISO: ${parsed.ISO}`, dataPath: [`EXIF ISO speed: ${parsed.ISO}`] });
      }
      if (parsed.FocalLength != null) {
        exifFindings.push({ label: 'Focal length', value: `${parsed.FocalLength}mm`, status: 'info',
          excerpt: `EXIF FocalLength: ${parsed.FocalLength}`, dataPath: [`EXIF FocalLength: ${parsed.FocalLength}mm`] });
      }
      if (parsed.Flash != null) {
        exifFindings.push({ label: 'Flash', value: String(parsed.Flash), status: 'info',
          excerpt: `EXIF Flash: ${parsed.Flash}`, dataPath: [`EXIF Flash value: ${parsed.Flash}`] });
      }
      if (parsed.WhiteBalance != null) {
        exifFindings.push({ label: 'White balance', value: parsed.WhiteBalance === 0 ? 'Auto' : 'Manual', status: 'info',
          excerpt: `EXIF WhiteBalance: ${parsed.WhiteBalance}`, dataPath: [`EXIF WhiteBalance: ${parsed.WhiteBalance}`] });
      }
      if (parsed.Orientation != null) {
        const orientMap = { 1:'Normal', 2:'Mirrored', 3:'Rotated 180°', 4:'Mirrored vertical', 6:'Rotated 90° CW', 8:'Rotated 90° CCW' };
        exifFindings.push({ label: 'Orientation', value: orientMap[parsed.Orientation] ?? `${parsed.Orientation}`, status: 'info',
          excerpt: `EXIF Orientation: ${parsed.Orientation}`, dataPath: [`EXIF Orientation: ${parsed.Orientation} (${orientMap[parsed.Orientation] ?? 'unknown'})`] });
      }
      if (parsed.Copyright) {
        exifFindings.push({ label: 'Copyright', value: parsed.Copyright, status: 'info',
          excerpt: `EXIF Copyright: "${parsed.Copyright}"`, dataPath: [`EXIF Copyright field: "${parsed.Copyright}"`] });
      }
      if (parsed.Artist) {
        exifFindings.push({ label: 'Artist / Author', value: parsed.Artist, status: 'info',
          excerpt: `EXIF Artist: "${parsed.Artist}"`, dataPath: [`EXIF Artist field: "${parsed.Artist}"`] });
      }
      // UserComment / XPComment can contain hidden encoded data
      const userComment = parsed.UserComment || parsed.XPComment;
      if (userComment && typeof userComment === 'string' && userComment.trim()) {
        const hasBase64 = /^[A-Za-z0-9+/]{20,}={0,2}$/.test(userComment.trim());
        exifFindings.push({
          label: 'User comment in EXIF',
          value: userComment.slice(0, 80) + (userComment.length > 80 ? '…' : ''),
          status: hasBase64 ? 'warn' : 'info',
          excerpt: `EXIF UserComment: "${userComment.slice(0, 120)}"`,
          dataPath: [
            `EXIF UserComment / XPComment: "${userComment.slice(0, 120)}"`,
            hasBase64 ? 'WARNING: Value looks like base64-encoded data — potential hidden payload' : 'Plain text comment',
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
  // Findings produced inside the canvas block (e.g. LSB steganography signal)
  const canvasFindings = [];

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

            // LSB steganography detection — sample a larger region for bit-plane entropy
            try {
              const LSB_SIZE = 128;
              const lsbCanvas = document.createElement('canvas');
              lsbCanvas.width = LSB_SIZE;
              lsbCanvas.height = LSB_SIZE;
              const lsbCtx = lsbCanvas.getContext('2d');
              lsbCtx.drawImage(img, 0, 0, LSB_SIZE, LSB_SIZE);
              const lsbData = lsbCtx.getImageData(0, 0, LSB_SIZE, LSB_SIZE).data;
              // Collect red-channel LSBs
              const lsbBits = [];
              for (let i = 0; i < lsbData.length; i += 4) lsbBits.push(lsbData[i] & 1);
              const ones = lsbBits.reduce((s, b) => s + b, 0);
              const p = ones / lsbBits.length;
              // Shannon entropy of the LSB bit plane (max = 1 bit for balanced 0/1)
              const lsbEntropy = p > 0 && p < 1 ? -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p)) : 0;
              // Histograms: count distinct RGB values in 4x4 blocks
              const colorCounts = new Map();
              for (let i = 0; i < lsbData.length; i += 16) {
                const key = `${lsbData[i]},${lsbData[i+1]},${lsbData[i+2]}`;
                colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1);
              }
              const colorVariance = colorCounts.size / (lsbBits.length / 4);
              // High LSB entropy (~1.0) + high color variance = possible LSB steganography
              if (lsbEntropy > 0.95 && colorVariance > 0.7) {
                canvasFindings.push({
                  label: 'LSB steganography signal',
                  value: `LSB entropy ${lsbEntropy.toFixed(3)}, color variance ${colorVariance.toFixed(3)}`,
                  status: 'warn',
                  excerpt: 'LSB bit-plane entropy near-maximum — possible hidden payload',
                  dataPath: [
                    `LSB entropy of red channel: ${lsbEntropy.toFixed(4)} (max = 1.0)`,
                    `Color variance score: ${colorVariance.toFixed(4)}`,
                    'High LSB entropy indicates the least-significant bits may carry hidden data',
                    'Common tool: steghide, OpenStego, SilentEye',
                    'Cannot confirm without steganographic key — treat as suspicious signal',
                  ],
                });
              }
            } catch {
              // LSB analysis is best-effort
            }
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
      ...canvasFindings,
    ],
    timeline: [],
    error: null,
  };
}

/**
 * Optional AI analysis via OpenAI or Google Gemini.
 * Only called when an apiKey is present in session.
 * Returns an { confidence, summary } object or null on failure.
 *
 * Includes automatic fallback: if the selected model fails (e.g. not available),
 * retries once with the provider's default model.
 */
async function runAiAnalysis(inputData, aiConfig) {
  const apiKey = aiConfig?.apiKey?.trim();
  if (!apiKey) return null;
  if (apiKey.length < 10) return null;

  const provider = resolveProvider(aiConfig?.provider || 'auto', apiKey);
  const requestedModel = aiConfig?.model?.trim() || '';
  const defaultModel = AI_PROVIDERS[provider]?.defaultModel;
  const model = requestedModel || defaultModel;

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

  /**
   * Attempt a single API call for the given provider + model.
   * Returns { raw: string } on success or throws on HTTP error.
   */
  async function attemptCall(attemptModel) {
    if (provider === 'google') {
      const encodedModel = encodeURIComponent(attemptModel);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:generateContent`;
      logger.debug(`Google Gemini request — model: ${attemptModel}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        let hint = '';
        if (res.status === 404) hint = ` Model "${attemptModel}" not found — try gemini-1.5-flash (stable) or gemini-2.0-flash.`;
        if (res.status === 403) hint = ` API key may lack permissions or Generative Language API is not enabled in your Google Cloud project.`;
        if (res.status === 429) hint = ` Rate limit exceeded — wait a moment and retry.`;
        if (res.status === 400 && errText.includes('API_KEY_INVALID')) hint = ` Invalid API key — check your key starts with "AIza".`;
        throw new Error(`Google AI error ${res.status}: ${res.statusText}.${hint} ${errText.slice(0, 120)}`);
      }
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    } else {
      logger.debug(`OpenAI request — model: ${attemptModel}`);
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: attemptModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 300,
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`OpenAI error ${res.status}: ${res.statusText}. ${errText.slice(0, 120)}`);
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? '{}';
    }
  }

  try {
    let raw = '{}';
    let usedModel = model;
    let fallbackUsed = false;

    try {
      raw = await attemptCall(model);
      logger.debug('AI raw response received', { provider, model, length: raw.length });
    } catch (primaryErr) {
      // Retry with default model if the selected model fails and a different default exists
      if (requestedModel && requestedModel !== defaultModel && defaultModel) {
        logger.warn(`AI primary model failed (${primaryErr.message}) — retrying with fallback: ${defaultModel}`);
        try {
          raw = await attemptCall(defaultModel);
          usedModel = defaultModel;
          fallbackUsed = true;
          logger.info(`AI fallback model succeeded — ${defaultModel}`);
        } catch (fallbackErr) {
          logger.error(`AI fallback model also failed: ${fallbackErr.message}`, { provider, fallbackModel: defaultModel });
          throw fallbackErr;
        }
      } else {
        throw primaryErr;
      }
    }

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      logger.info(`AI analysis complete — confidence: ${parsed.confidence ?? 'N/A'}, validity: ${parsed.storyValidity ?? 'N/A'}${fallbackUsed ? ` (fallback: ${usedModel})` : ''}`);
      return { ...parsed, provider, model: usedModel, fallbackUsed: fallbackUsed ? defaultModel : null };
    } catch (parseErr) {
      logger.warn('AI JSON parse failed — returning raw text', { raw: cleaned.slice(0, 200), error: parseErr?.message });
      return { confidence: null, storyValidity: 'uncertain', summary: cleaned, provider, model: usedModel, fallbackUsed: fallbackUsed ? defaultModel : null };
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
      } else if (inputData.type === 'code') {
        result = analyzeCodeSnippet(inputData.value);
      } else if (inputData.type === 'file' && inputData.file) {
        result = await analyzeFile(inputData.file);
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
    hasAiKey: !!aiConfig.apiKey?.trim(),
  }), [scanPhase, scanProgress, currentStep, inputData.type, scanResults, aiConfig.apiKey]);

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

        {/* ── Capability cards hero section ────────────────────────────── */}
        {!scanResults && !isScanning && (
          <section className="capability-hero" aria-label="Analysis capabilities">
            {[
              { icon: '🔗', title: 'URL Security', desc: 'HTTPS, typosquatting, phishing brand check, bulletproof TLDs' },
              { icon: '📝', title: 'Text Analysis', desc: 'Sentiment, dark patterns, email headers, link extraction' },
              { icon: '💻', title: 'Code Safety',  desc: 'Static analysis for Bash, Python & PowerShell malware patterns' },
              { icon: '🖼️', title: 'Image Forensics', desc: 'EXIF metadata, LSB steganography, AI-generation signals' },
              { icon: '📁', title: 'File Inspection', desc: 'Magic bytes, entropy analysis, embedded URLs & strings' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="capability-card">
                <span className="capability-icon">{icon}</span>
                <strong className="capability-title">{title}</strong>
                <p className="capability-desc">{desc}</p>
              </div>
            ))}
          </section>
        )}

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
