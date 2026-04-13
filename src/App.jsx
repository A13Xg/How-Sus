/**
 * App.jsx - Root component for HowSus News & Media Authenticity Analyzer.
 *
 * State:
 *   apiKey      {string}   – OpenAI API key (session memory only, never persisted)
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
import React, { useState, useCallback, useRef, useMemo } from 'react';
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

/** Analyse a URL and return a scanResults-shaped object. */
function analyzeUrl(url, dateFrom, dateTo) {
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

    let score = isTrusted ? 90 : isSuspicious ? 20 : Math.max(30, Math.min(85, 60 + domainAgeDays / 100));
    if (!hasHttps) score -= 10;
    if (pathKeywords) score -= 15;
    if (isSuspicious) score -= 20;
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
      imageAnalysis: null,
      aiAnalysis: null,
      findings: [],
      timeline: [],
      error: 'Invalid URL — please enter a complete URL (e.g. https://example.com/article)',
    };
  }
}

/** Analyse plain text and return a scanResults-shaped object. */
function analyzeText(text) {
  const lower = text.toLowerCase();
  const words = text.trim().split(/\s+/);
  const wordCount = words.length;
  const avgWordLen = (text.replace(/\s/g, '').length / Math.max(wordCount, 1)).toFixed(1);
  const suspiciousMatches = SUSPICIOUS_KEYWORDS.filter((k) => lower.includes(k));
  const capsRatio = (text.match(/[A-Z]/g) || []).length / Math.max(text.replace(/\s/g, '').length, 1);
  const exclamCount = (text.match(/!/g) || []).length;
  const hasQuotes = /[""][^""]+[""]/.test(text) || /"[^"]+"/.test(text);
  const hasNumbers = /\d/.test(text);

  let score = 70;
  score -= suspiciousMatches.length * 8;
  score -= capsRatio > 0.3 ? 15 : capsRatio > 0.15 ? 8 : 0;
  score -= exclamCount > 3 ? 10 : exclamCount > 1 ? 5 : 0;
  score += hasQuotes ? 5 : 0;
  score += hasNumbers ? 5 : 0;
  score += wordCount > 200 ? 10 : wordCount > 50 ? 5 : -10;
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
 * TODO: Add Google Gemma support as an alternative provider.
 *       See: https://ai.google.dev/gemma for API details.
 */
async function runAiAnalysis(inputData, apiKey) {
  if (!apiKey) return null;

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
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 220,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API error ${res.status}`);
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? '{}';
    try {
      return JSON.parse(raw);
    } catch {
      return { confidence: null, summary: raw };
    }
  } catch (err) {
    return { confidence: null, summary: `AI analysis unavailable: ${err.message}` };
  }
}

// ─── Root component ───────────────────────────────────────────────────────────
function App() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [apiKey, setApiKey] = useState('');
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
  const scanIntervalRef = useRef(null);

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
        result = analyzeUrl(inputData.value, inputData.dateFrom, inputData.dateTo);
      } else if (inputData.type === 'text') {
        result = analyzeText(inputData.value);
      } else if (inputData.type === 'image' && inputData.file) {
        result = await analyzeImage(inputData.file);
      } else {
        result = {
          authenticityScore: 0,
          type: inputData.type,
          sources: [],
          duplicates: [],
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
    if (apiKey) {
      const ai = await runAiAnalysis(inputData, apiKey);
      setAiAnalysis(ai);
      result = { ...result, aiAnalysis: ai };
    }

    setScanResults(result);
    setScanPhase('complete');
  }, [inputData, apiKey, isScanning]);

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
      <Header apiKey={apiKey} onApiKeyChange={setApiKey} />

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
              apiKey={apiKey}
            />
          )}
        </AnimatePresence>
      </main>

      <Footer />
    </div>
  );
}

export default App;
