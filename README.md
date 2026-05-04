# HowSus — News & Media Authenticity Analyzer

> A fully client-side, browser-based tool to analyze the authenticity of news articles, URLs, and images. Runs entirely on GitHub Pages with no backend or server required.

[![GitHub Pages](https://img.shields.io/badge/Live%20App-GitHub%20Pages-blue)](https://a13xg.github.io/How-Sus/)
[![License](https://img.shields.io/github/license/A13Xg/How-Sus)](LICENSE)

---

## What It Does

HowSus analyzes news content using multiple heuristic engines running entirely in your browser:

- **URL Analysis** — domain reputation, HTTPS verification, TLD risk assessment, subdomain depth, URL patterns, query parameter analysis
- **Text Analysis** — suspicious keyword detection, caps ratio, sentiment scoring, readability, dark patterns, named entities, claim density, language formality, source attribution
- **Image Analysis** — 12-point forensic pipeline: EXIF extraction, SHA-256 fingerprinting, MIME type sniffing, canvas pixel analysis, color saturation, compression ratio, date cross-validation, GPS validation, alpha channel detection, steganography indicators, editing software fingerprint, metadata completeness
- **AI Analysis** — optional, using your own OpenAI or Google Gemini API key (processed in your browser, not stored)
- **Cross-Source Verification** — tier-weighted corroboration system with 28+ trusted sources
- **Transparent Results** — every finding shows the exact text excerpt that triggered it and a full data-path trace

---

## Features

| Feature | Description |
|---------|-------------|
| 🌐 URL Analysis | Domain reputation (43 trusted domains), HTTPS, TLD risk, URL patterns, query params |
| 📝 Text Analysis | 39 suspicious keywords, CAPS detection, sentiment (AFINN-165), readability (Flesch-Kincaid), dark patterns, named entity recognition, claim density, formality scoring |
| 🖼 Image Analysis | 12-point forensic pipeline — EXIF, SHA-256, MIME sniff, canvas analysis, saturation, steganography |
| 🤖 AI Analysis | OpenAI (GPT-4o-mini) and Google Gemini integration — optional, browser-only |
| 🔍 Cross-Source Consistency | Tier-weighted (Tier 1: wire services, Tier 2: major outlets) with 12+ sources |
| 📊 Source Freshness | Scores how recently corroborating sources were published |
| ✍️ Claim Density | Measures verifiable claims per 100 words (journalism quality indicator) |
| 📐 Language Formality | Formal vs. informal language analysis (professional journalism indicator) |
| 🎯 Signal Confidence | Overall evidence quality score based on findings breadth, tier-1 sources, AI confirmation |
| 🔎 Transparent Data Path | Click any finding to see the exact evidence and step-by-step determination |
| ⚠️ Dark Patterns | 6-category manipulative framing detector |
| 💬 Sentiment Analysis | AFINN-165 scoring with word-level highlighting |
| 📖 Readability | Flesch Reading Ease + grade level (text analysis) |
| 🕰 Scan History | Last 10 scans in localStorage |
| 📤 PDF & HTML Export | Full report download with data paths |
| 🔗 Share Link | Base64-encoded URL hash for sharing scans |
| 🌐 Environment Indicator | Shows which features are unavailable in static/GitHub Pages environment |

---

## Getting Started

### Prerequisites
- Node.js 18+ and npm

### Local Development

```bash
git clone https://github.com/A13Xg/How-Sus.git
cd How-Sus
npm install
npm run dev          # http://localhost:5173
```

### Production Build

```bash
npm run build        # outputs to dist/
npm run preview      # preview the production build
```

### Data Refresh

```bash
npm run refresh:data  # fetches latest headlines from BBC, NPR, PBS, Reuters, DW
```

---

## Architecture

HowSus is a fully static single-page application. No backend, no server — all analysis happens in your browser.

```
┌─────────────────────────────────────────────────────┐
│                  Browser (React 19)                   │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │                  App.jsx (root)                 │  │
│  │  State: aiConfig, inputData, scanResults, ...   │  │
│  └──────────┬───────────────────────────────────┘  │  │
│             │                                       │
│  ┌──────────▼──────────┐  ┌──────────────────────┐ │
│  │   Analysis Pipeline  │  │   UI Components      │ │
│  │  analyzeUrl()        │  │   ResultsPanel       │ │
│  │  analyzeText()       │  │   InputSection       │ │
│  │  analyzeImage()      │  │   VisualizationSection│ │
│  └──────────┬──────────┘  │   NetworkGraph       │ │
│             │              │   TimelineGraph      │ │
│  ┌──────────▼──────────┐  └──────────────────────┘ │
│  │   Analysis Libraries │                           │
│  │  sentiment.js        │  ┌──────────────────────┐ │
│  │  readability.js      │  │   External (optional) │ │
│  │  darkPatterns.js     │  │  OpenAI API           │ │
│  │  formalityAnalyzer.js│  │  Google Gemini API    │ │
│  │  logger.js           │  │  Microlink.io         │ │
│  └──────────┬──────────┘  └──────────────────────┘ │
│             │                                       │
│  ┌──────────▼──────────┐                            │
│  │   Static Data        │                            │
│  │  corroboration-feed  │                            │
│  │  .json (BBC,Reuters, │                            │
│  │  NPR, PBS, DW)       │                            │
│  └─────────────────────┘                            │
└─────────────────────────────────────────────────────┘
         │ GitHub Actions refreshes feed daily
         ▼
    GitHub Pages (static hosting)
```

### GitHub Pages Constraints

| Capability | Status | Notes |
|-----------|--------|-------|
| URL/text/image analysis | ✅ Available | Fully client-side heuristics |
| EXIF extraction | ✅ Available | Via `exifr` library (lazy-loaded) |
| AI analysis | ✅ Available | User-supplied API key, browser-only |
| Scan history | ✅ Available | localStorage |
| Feed refresh | ✅ Available | GitHub Actions scheduled job |
| Reverse image search | ❌ Unavailable | Requires server-side proxy |
| Real-time fact-check API | ❌ Unavailable | Requires server-side secret management |
| Domain WHOIS lookup | ❌ Unavailable | CORS-blocked from browser |

The **Environment Badge** in the app header visually indicates which features are available in your current runtime environment (GitHub Pages vs. local dev). Hover over the `?` for details.

---

## Project Structure

```
How-Sus/
├── index.html                          # App shell with loading screen
├── vite.config.js                      # Vite build config
├── package.json
├── public/
│   ├── favicon.svg
│   └── data/
│       └── corroboration-feed.json     # Curated news headlines (auto-refreshed)
├── scripts/
│   └── refresh-corroboration-feed.mjs # Feed refresh script (GitHub Actions)
└── src/
    ├── main.jsx                        # React entry point + ErrorBoundary
    ├── App.jsx                         # Root component + analysis pipeline
    ├── App.css
    ├── index.css
    ├── components/
    │   ├── Header.jsx/css              # Title bar + AI config
    │   ├── InputSection.jsx/css        # URL/Text/Image input tabs
    │   ├── ResultsPanel.jsx/css        # Results display (score, findings, cross-check)
    │   ├── VisualizationSection.jsx/css# Scan progress animation
    │   ├── NetworkGraph.jsx/css        # Source network visualization
    │   ├── TimelineGraph.jsx/css       # Verification timeline
    │   ├── EnvironmentBadge.jsx/css    # Runtime feature indicator  [NEW]
    │   ├── LogPanel.jsx/css            # Developer log terminal
    │   ├── SettingsPanel.jsx/css       # User preferences
    │   ├── ExpandablePanel.jsx/css     # Collapsible section wrapper
    │   ├── AnimatedProgressBar.jsx/css # Progress bar
    │   ├── Footer.jsx/css
    │   ├── ErrorBoundary.jsx/css       # React error boundary
    │   └── ThemeProvider.jsx           # Dark/light/high-contrast theme
    └── lib/
        ├── sentiment.js                # AFINN-165 sentiment scoring
        ├── readability.js              # Flesch-Kincaid readability
        ├── darkPatterns.js             # Manipulative framing detection
        ├── formalityAnalyzer.js        # Language formality scoring  [NEW]
        ├── logger.js                   # Circular-buffer logger
        ├── settings.js                 # User settings (localStorage)
        ├── updateChecker.js            # GitHub commit update checker
        ├── useLocalStorage.js          # localStorage React hook
        └── useKeyboardShortcuts.js     # Keyboard shortcuts
```

---

## Analysis Algorithms

### Authenticity Score (0–100)

A weighted combination of heuristic signals:

**URL Analysis:**
- Base: 90 (trusted domain), 20 (suspicious domain), or 60 + (domain age / 100)
- Adjustments: -10 (no HTTPS), -15 (clickbait URL patterns), -20 (suspicious domain), -10 (risky TLD), -20 (IP address hostname)
- Bonuses from: cross-source consistency, language formality, source freshness

**Text Analysis:**
- Base: 70
- Deductions: -8 per suspicious keyword, -15 (excessive caps), -10 (exclamation spam), -4 per hedging phrase
- Bonuses: +5 (quotes), +5 (numbers), +10 (>200 words), +8 (proper quote attribution), +5 (statistics), +8 (named entities), +5 (source attributions)

**Image Analysis:**
- Base: 60
- Bonuses: +10 (date in EXIF), +10 (camera info), +5 (GPS coordinates)
- Deductions: -20 (editing software), -25 (AI generation detected), -15 (no EXIF), -20 (MIME mismatch), -8 (over-saturated colors), -10 (steganography indicator), -12 (date inconsistency), -5 (alpha channel compositing)

### Signal Confidence (0–100)

Measures how much supporting evidence was gathered:
- +25 (baseline)
- +up to 20 (findings breadth)
- +up to 12 (tier-1 corroborating sources × 4)
- +up to 8 (feed keyword matches × 2)
- +up to 10 (corroboration ratio)
- +15 (AI analysis confirmation)
- +up to 10 (image EXIF richness)

### Cross-Source Consistency Score

Tier-weighted corroboration system:
- **Tier 1 (weight 1.0):** Reuters, AP, BBC, NPR, PBS, PolitiFact, Snopes, FactCheck.org, ABC Australia, Nature, Science
- **Tier 2 (weight 0.75):** The Guardian, NYT, WaPo, Bloomberg, WSJ, Economist, DW, CNN, NBC, CBS, USA Today, The Atlantic, New Yorker
- Score = `(Tier-weighted corroborating count / Total tier-weighted count) × 100`

### Image Forensic Pipeline

12-point analysis:
1. **EXIF Extraction** — camera make/model, capture date, GPS, software
2. **SHA-256 Fingerprint** — unique file identifier via Web Crypto API
3. **MIME Sniffing** — magic bytes vs. file extension mismatch detection
4. **Canvas Dimensions** — actual pixel resolution via HTML Canvas
5. **Color Saturation** — RGB→HSL sampling; >75% avg = AI/filter signal
6. **Compression Ratio** — bytes/pixel; anomalous values flag steganography
7. **Metadata Date Cross-validation** — EXIF date vs. file.lastModified
8. **GPS Validation** — range check (lat ±90°, lon ±180°)
9. **Alpha Channel Detection** — transparency = possible compositing
10. **Aspect Ratio Analysis** — unusual ratios flag heavy cropping
11. **Steganography Indicators** — file size anomaly for format/dimensions
12. **Software Fingerprint** — 22 editing tools + AI generators (MidJourney, DALL-E, Stable Diffusion, etc.)

---

## Optional AI Analysis

Add your OpenAI or Google Gemini API key in the header to unlock AI-powered analysis:

- **OpenAI:** Key starts with `sk-...` — uses `gpt-4o-mini` by default
- **Google Gemini:** Key starts with `AIza...` — uses `gemini-1.5-flash` by default
- Provider is auto-detected from key format
- Keys are stored **only in browser session memory** (never localStorage, never sent to our servers)
- AI is sent only the URL, first 600 characters of text, or image file name

---

## Static Data Refresh

The corroboration feed is refreshed daily via GitHub Actions:

```yaml
# .github/workflows/refresh-data.yml
# Runs: scripts/refresh-corroboration-feed.mjs
# Sources: Reuters, BBC, NPR, PBS, Deutsche Welle RSS feeds
# Output: public/data/corroboration-feed.json
```

To refresh manually:
```bash
npm run refresh:data
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|---------|--------|
| `Shift + Enter` | Start scan |
| `Escape` | Reset / dismiss modal |
| `Ctrl + K` | Focus URL input |

---

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| React 19 | UI framework |
| Vite 8 | Build tool |
| Framer Motion | Animations |
| jsPDF | PDF export |
| exifr | EXIF extraction (lazy-loaded) |
| Web Crypto API | SHA-256 fingerprinting (built-in) |
| HTML Canvas API | Pixel analysis (built-in) |

---

## Limitations & Disclaimer

- **Heuristic analysis only** — not a substitute for professional fact-checking
- **No real-time data** — corroboration feed is refreshed daily, not live
- **No backend verification** — domain age, WHOIS, and reverse image search are unavailable in static hosting
- **AI is optional** — quality of AI analysis depends on model and content type
- **Images analyzed locally** — no image data is sent anywhere unless AI analysis is enabled
- All analysis is done in your browser. Content is never sent to HowSus servers (there are none).

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -m 'feat: add my feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Open a Pull Request

Please run `npm run lint` before submitting.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

