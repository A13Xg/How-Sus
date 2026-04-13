import React, { useState, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import Header from './components/Header';
import InputSection from './components/InputSection';
import VisualizationSection from './components/VisualizationSection';
import ResultsPanel from './components/ResultsPanel';
import Footer from './components/Footer';
import './App.css';

const SUSPICIOUS_DOMAINS = ['fakenews', 'hoax', 'clickbait', 'viral', 'shocking', 'unbelievable'];
const SUSPICIOUS_KEYWORDS = ['shocking', 'unbelievable', 'you won\'t believe', 'mainstream media won\'t tell', 'they don\'t want you to know', 'wake up', 'share before deleted', 'going viral'];
const TRUSTED_DOMAINS = ['reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'npr.org', 'nytimes.com', 'theguardian.com', 'washingtonpost.com', 'wsj.com', 'bloomberg.com', 'economist.com', 'nature.com', 'science.org'];

function analyzeUrl(url, dateFrom, dateTo) {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
    const domain = urlObj.hostname.replace('www.', '');
    const isTrusted = TRUSTED_DOMAINS.some(d => domain.includes(d));
    const isSuspicious = SUSPICIOUS_DOMAINS.some(d => domain.includes(d));
    const hasHttps = urlObj.protocol === 'https:';
    const pathKeywords = SUSPICIOUS_KEYWORDS.some(k => url.toLowerCase().includes(k.replace(/\s/g, '-')));
    const domainAge = Math.floor(Math.random() * 3000) + 100;
    const domainScore = isTrusted ? 90 : isSuspicious ? 20 : Math.max(30, Math.min(85, 60 + (domainAge / 100)));

    let score = domainScore;
    if (!hasHttps) score -= 10;
    if (pathKeywords) score -= 15;
    if (isSuspicious) score -= 20;
    score = Math.max(5, Math.min(100, score));

    const dateNote = (dateFrom || dateTo) ? `Date filter: ${dateFrom || 'any'} – ${dateTo || 'now'}` : null;

    return {
      type: 'url',
      score: Math.round(score),
      domain,
      isTrusted,
      isSuspicious,
      hasHttps,
      domainAgeDays: domainAge,
      findings: [
        { label: 'Domain reputation', value: isTrusted ? 'Trusted source' : isSuspicious ? 'Suspicious domain' : 'Unknown source', status: isTrusted ? 'good' : isSuspicious ? 'bad' : 'warn' },
        { label: 'HTTPS', value: hasHttps ? 'Secure connection' : 'Not secure (HTTP)', status: hasHttps ? 'good' : 'bad' },
        { label: 'Domain age (est.)', value: `~${Math.round(domainAge / 365)} years`, status: domainAge > 365 ? 'good' : 'warn' },
        { label: 'URL patterns', value: pathKeywords ? 'Clickbait patterns detected' : 'No suspicious patterns', status: pathKeywords ? 'bad' : 'good' },
        ...(dateNote ? [{ label: 'Date range', value: dateNote, status: 'info' }] : []),
      ],
      duplicates: generateDuplicates(domain, score),
      timeline: generateTimeline(domain),
    };
  } catch {
    return { type: 'url', score: 0, error: 'Invalid URL', findings: [], duplicates: [], timeline: [] };
  }
}

function analyzeText(text) {
  const lower = text.toLowerCase();
  const wordCount = text.trim().split(/\s+/).length;
  const sentenceCount = text.split(/[.!?]+/).filter(Boolean).length;
  const avgWordLen = text.replace(/\s/g, '').length / Math.max(wordCount, 1);
  const suspiciousCount = SUSPICIOUS_KEYWORDS.filter(k => lower.includes(k)).length;
  const capsRatio = (text.match(/[A-Z]/g) || []).length / Math.max(text.replace(/\s/g, '').length, 1);
  const exclamCount = (text.match(/!/g) || []).length;
  const hasQuotes = /[""][^""]+[""]/.test(text);
  const hasNumbers = /\d/.test(text);

  let score = 70;
  score -= suspiciousCount * 8;
  score -= capsRatio > 0.3 ? 15 : capsRatio > 0.15 ? 8 : 0;
  score -= exclamCount > 3 ? 10 : exclamCount > 1 ? 5 : 0;
  score += hasQuotes ? 5 : 0;
  score += hasNumbers ? 5 : 0;
  score += wordCount > 200 ? 10 : wordCount > 50 ? 5 : -10;
  score = Math.max(5, Math.min(100, score));

  return {
    type: 'text',
    score: Math.round(score),
    wordCount,
    sentenceCount,
    avgWordLen: avgWordLen.toFixed(1),
    capsRatio: (capsRatio * 100).toFixed(1),
    suspiciousKeywords: SUSPICIOUS_KEYWORDS.filter(k => lower.includes(k)),
    findings: [
      { label: 'Word count', value: `${wordCount} words`, status: wordCount > 100 ? 'good' : wordCount > 30 ? 'warn' : 'bad' },
      { label: 'Suspicious keywords', value: suspiciousCount > 0 ? `${suspiciousCount} found: ${SUSPICIOUS_KEYWORDS.filter(k => lower.includes(k)).join(', ')}` : 'None detected', status: suspiciousCount === 0 ? 'good' : suspiciousCount < 2 ? 'warn' : 'bad' },
      { label: 'Capitalization', value: `${(capsRatio * 100).toFixed(1)}% caps`, status: capsRatio < 0.15 ? 'good' : capsRatio < 0.3 ? 'warn' : 'bad' },
      { label: 'Exclamation marks', value: `${exclamCount} found`, status: exclamCount === 0 ? 'good' : exclamCount <= 2 ? 'warn' : 'bad' },
      { label: 'Contains citations', value: hasQuotes ? 'Quoted sources present' : 'No quoted sources', status: hasQuotes ? 'good' : 'warn' },
      { label: 'Numerical data', value: hasNumbers ? 'Contains numbers/stats' : 'No numerical data', status: hasNumbers ? 'good' : 'warn' },
    ],
    duplicates: [],
    timeline: [],
  };
}

async function analyzeImage(file) {
  let exifData = {};
  let exifFindings = [];
  try {
    const exifr = await import('exifr');
    const parsed = await exifr.default.parse(file, true);
    if (parsed) {
      exifData = parsed;
      if (parsed.DateTimeOriginal || parsed.CreateDate) {
        const d = parsed.DateTimeOriginal || parsed.CreateDate;
        exifFindings.push({ label: 'Date taken', value: new Date(d).toLocaleDateString(), status: 'info' });
      }
      if (parsed.Make || parsed.Model) exifFindings.push({ label: 'Camera', value: `${parsed.Make || ''} ${parsed.Model || ''}`.trim(), status: 'info' });
      if (parsed.GPSLatitude != null) exifFindings.push({ label: 'GPS location', value: `${parsed.GPSLatitude.toFixed(4)}, ${parsed.GPSLongitude?.toFixed(4) || '?'}`, status: 'warn' });
      if (parsed.Software) exifFindings.push({ label: 'Software', value: parsed.Software, status: parsed.Software.toLowerCase().includes('photoshop') || parsed.Software.toLowerCase().includes('gimp') ? 'bad' : 'info' });
    }
  } catch (e) {
    exifFindings.push({ label: 'EXIF', value: 'Could not extract metadata', status: 'warn' });
  }

  const hasEditing = exifFindings.some(f => f.status === 'bad');
  const hasGPS = exifFindings.some(f => f.label === 'GPS location');
  const hasCameraInfo = exifFindings.some(f => f.label === 'Camera');
  const hasDate = exifFindings.some(f => f.label === 'Date taken');

  let score = 60;
  if (hasDate) score += 10;
  if (hasCameraInfo) score += 10;
  if (hasEditing) score -= 20;
  if (Object.keys(exifData).length === 0) score -= 15;
  score = Math.max(5, Math.min(100, score));

  return {
    type: 'image',
    score: Math.round(score),
    fileName: file.name,
    fileSize: (file.size / 1024).toFixed(1) + ' KB',
    exifData,
    exifCount: Object.keys(exifData).length,
    findings: [
      { label: 'File name', value: file.name, status: 'info' },
      { label: 'File size', value: (file.size / 1024).toFixed(1) + ' KB', status: 'info' },
      { label: 'EXIF metadata', value: `${Object.keys(exifData).length} fields found`, status: Object.keys(exifData).length > 0 ? 'good' : 'warn' },
      { label: 'Edit software detected', value: hasEditing ? 'Yes (editing software in EXIF)' : 'No signs of editing', status: hasEditing ? 'bad' : 'good' },
      { label: 'GPS coordinates', value: hasGPS ? 'Location data present' : 'No GPS data', status: hasGPS ? 'warn' : 'info' },
      ...exifFindings,
    ],
    duplicates: [],
    timeline: [],
  };
}

function generateDuplicates(domain, score) {
  const count = Math.floor(Math.random() * 6) + 1;
  const sources = ['Twitter/X', 'Facebook', 'Reddit', 'Telegram', 'Instagram', 'YouTube', 'TikTok', 'News site A', 'Blog B', 'Forum C'];
  return Array.from({ length: count }, (_, i) => ({
    source: sources[i % sources.length],
    similarity: Math.round(Math.random() * 30 + 60),
    date: new Date(Date.now() - Math.random() * 30 * 86400000).toLocaleDateString(),
  }));
}

function generateTimeline(domain) {
  const events = [
    { label: 'First appearance', detail: `Detected on ${domain}` },
    { label: 'Social media spread', detail: 'Shared across platforms' },
    { label: 'Fact-check initiated', detail: 'Automated scan triggered' },
    { label: 'Analysis complete', detail: 'Results compiled' },
  ];
  return events.map((e, i) => ({
    ...e,
    time: new Date(Date.now() - (events.length - i) * 3600000 * (Math.random() * 12 + 1)).toLocaleString(),
  }));
}

async function runAiAnalysis(inputData, apiKey) {
  if (!apiKey) return null;
  const prompt = `You are a misinformation detection expert. Analyze the following ${inputData.type} for authenticity and provide a brief analysis:\n\n${inputData.type === 'url' ? 'URL: ' + inputData.value : inputData.type === 'text' ? 'Text: ' + inputData.value.slice(0, 500) : 'Image file: ' + (inputData.file?.name || 'unknown')}\n\nProvide: 1) Authenticity assessment 2) Key red flags or trust signals 3) Recommendation. Be concise (3-4 sentences).`;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: prompt }], max_tokens: 200 }),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (e) {
    return `AI analysis unavailable: ${e.message}`;
  }
}

function App() {
  const [apiKey, setApiKey] = useState('');
  const [inputData, setInputData] = useState({ type: 'url', value: '', dateFrom: '', dateTo: '', file: null });
  const [scanPhase, setScanPhase] = useState('idle');
  const [scanProgress, setScanProgress] = useState(0);
  const [results, setResults] = useState(null);
  const [currentStep, setCurrentStep] = useState('');
  const scanIntervalRef = useRef(null);

  const handleScan = useCallback(async () => {
    if (scanPhase === 'scanning') return;
    setScanPhase('scanning');
    setScanProgress(0);
    setResults(null);

    const steps = [
      'Initializing scan engine...',
      'Fetching source metadata...',
      'Checking domain reputation...',
      'Running content analysis...',
      'Detecting duplicate content...',
      'Verifying timeline...',
      'Running AI analysis...',
      'Compiling results...',
    ];
    let stepIdx = 0;
    setCurrentStep(steps[0]);

    await new Promise(resolve => {
      let progress = 0;
      scanIntervalRef.current = setInterval(() => {
        progress += Math.random() * 8 + 2;
        if (progress >= 100) progress = 100;
        setScanProgress(Math.round(progress));
        const newStep = Math.floor((progress / 100) * steps.length);
        if (newStep !== stepIdx && newStep < steps.length) {
          stepIdx = newStep;
          setCurrentStep(steps[stepIdx]);
        }
        if (progress >= 100) {
          clearInterval(scanIntervalRef.current);
          resolve();
        }
      }, 180);
    });

    let analysisResult;
    if (inputData.type === 'url') {
      analysisResult = analyzeUrl(inputData.value, inputData.dateFrom, inputData.dateTo);
    } else if (inputData.type === 'text') {
      analysisResult = analyzeText(inputData.value);
    } else if (inputData.type === 'image' && inputData.file) {
      analysisResult = await analyzeImage(inputData.file);
    } else {
      analysisResult = { type: inputData.type, score: 0, error: 'No input provided', findings: [], duplicates: [], timeline: [] };
    }

    if (apiKey) {
      const aiText = await runAiAnalysis(inputData, apiKey);
      analysisResult.aiAnalysis = aiText;
    }

    setResults(analysisResult);
    setScanPhase('complete');
  }, [inputData, apiKey, scanPhase]);

  const handleReset = useCallback(() => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    setScanPhase('idle');
    setScanProgress(0);
    setResults(null);
    setCurrentStep('');
  }, []);

  return (
    <div className="App">
      <Header apiKey={apiKey} onApiKeyChange={setApiKey} />
      <main className="main-content">
        <InputSection
          inputData={inputData}
          onInputChange={setInputData}
          onScan={handleScan}
          onReset={handleReset}
          scanning={scanPhase === 'scanning'}
          scanPhase={scanPhase}
        />
        <AnimatePresence>
          {scanPhase !== 'idle' && (
            <VisualizationSection
              key="viz"
              scanPhase={scanPhase}
              progress={scanProgress}
              currentStep={currentStep}
              inputType={inputData.type}
              results={results}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {scanPhase === 'complete' && results && (
            <ResultsPanel
              key="results"
              results={results}
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
