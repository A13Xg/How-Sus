# HowSus — News & Media Authenticity Analyzer

A fully **client-side** React web app for analysing the authenticity of news articles, social media posts, and images. No data ever leaves your browser — works entirely within GitHub Pages.

---

## Features

| Feature | Description |
|---|---|
| **URL Analysis** | Checks domain reputation, HTTPS, estimated domain age, and clickbait URL patterns |
| **Text Analysis** | Detects suspicious keywords, excessive capitalisation, exclamation marks, and citation quality |
| **Image Analysis** | Extracts and evaluates EXIF metadata (camera, GPS, date, editing software) |
| **Animated Scan Visualisation** | Real-time progress bar, step indicators, and a canvas network graph showing duplicate sources |
| **Verification Timeline** | Shows the spread history of a piece of content |
| **PDF & HTML Export** | Download a full analysis report locally — no server involved |
| **Optional AI Analysis** | Paste an OpenAI or Google API key (auto-detected provider, session memory only — never stored) |
| **Cross-Source Consistency** | Compares corroborating vs conflicting source signals; tier-weighted (wire services > major outlets > unknown) |
| **Signal Confidence Badge** | Shows how many supporting evidence signals backed the authenticity score |
| **Dark Patterns Panel** | Lists manipulative framing tactics found (urgency, fear, tribalism, conspiracy, sensationalism, clickbait) with tips |
| **Sentiment Word Chips** | Highlights positive and negative vocabulary matched by AFINN scoring |
| **Readability Visualisation** | Flesch Reading Ease bar + sentence/word/syllable stats (text scans only) |
| **Scan History** | Last 10 scan results persisted in localStorage with score colour coding |
| **"How to Read This Report" Glossary** | Collapsible panel explaining every metric to first-time users |
| **Share Link** | Base64-encoded URL hash for sharing a scan query |
| **Static Feed Refresh via GitHub Actions** | Scheduled workflow updates a curated corroboration feed JSON in-repo |

---

## Tech Stack

| Package | Purpose |
|---|---|
| [React 19](https://react.dev/) + [Vite 8](https://vite.dev/) | UI framework and build tool |
| [Framer Motion](https://www.framer.com/motion/) | Animations and transitions |
| [jsPDF](https://artskydj.github.io/jsPDF/) | PDF report export |
| [exifr](https://mutiny.cz/exifr/) | EXIF metadata extraction (lazy-loaded) |

---

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for production

```bash
npm run build
```

Output is placed in `dist/`. The `"homepage": "."` setting in `package.json` makes asset paths relative, which is required for GitHub Pages sub-directory deployments.

---

## Project Structure

```
src/
├── main.jsx                  # App entry point (StrictMode + ErrorBoundary)
├── App.jsx                   # Root component — state, scan pipeline, analysis helpers
├── App.css                   # Layout and global scan error banner
├── index.css                 # CSS variables, reset, shared styles
│
├── components/
│   ├── ErrorBoundary.jsx     # Class-based error boundary (prevents blank page on crashes)
│   ├── Header.jsx            # Sticky top bar with session-only AI key modal
│   ├── InputSection.jsx      # URL / Text / Image tabbed input panel
│   ├── VisualizationSection.jsx # Real-time scan progress visualisation
│   ├── ResultsPanel.jsx      # Final results: score, findings, new feature panels
│   ├── NetworkGraph.jsx      # Canvas duplicate-source network (lazy-loaded)
│   ├── TimelineGraph.jsx     # SVG verification timeline (lazy-loaded)
│   ├── AnimatedProgressBar.jsx # Reusable animated bar (used throughout)
│   └── ExpandablePanel.jsx   # Collapsible section wrapper
│
└── lib/
    ├── sentiment.js          # AFINN-165 client-side sentiment scoring
    ├── readability.js        # Flesch-Kincaid reading ease and grade level
    ├── darkPatterns.js       # Regex-based manipulative-framing detector
    └── useLocalStorage.js    # Persistent React state backed by localStorage

public/
└── data/
    └── corroboration-feed.json  # Static feed refreshed by GitHub Actions

scripts/
└── refresh-corroboration-feed.mjs  # Node.js script for data refresh
```

---

## GitHub Pages-Only Architecture

This project is designed to run **without any custom backend service**.

| Layer | Technology |
|---|---|
| Runtime | Static files served by GitHub Pages |
| Logic | Browser-side React (client-only) |
| AI calls | Directly to OpenAI / Google APIs using the user's own session key |
| Data refresh | GitHub Actions writes static JSON committed to `public/data/` |
| Report export | `jsPDF` and Blob URLs — no server required |
| Scan history | `localStorage` — browser-only, no network |

### Capabilities within this scope

- Heuristic URL / text / image analysis in-browser
- Client-side sentiment scoring, readability analysis, and dark-pattern detection
- Optional AI augmentation via user-supplied API key (OpenAI or Google)
- Scheduled data ingestion using GitHub Actions committed as static JSON
- Static report export (PDF / HTML)
- Explainability overlays and metric drilldowns

### Not possible without a backend

- Secure server-side secret storage for third-party APIs
- Private API access requiring hidden credentials
- Low-latency heavy NLP or vector search over large corpora on demand
- Real-time webhook ingestion or streaming pipelines

---

## Static Data Refresh

To refresh the corroboration feed locally:

```bash
npm run refresh:data
```

This writes `public/data/corroboration-feed.json`.

The workflow `.github/workflows/refresh-data.yml` runs on schedule and can be triggered manually from the GitHub Actions tab.

---

## Key Algorithms

### Authenticity Score (0–100)
A weighted heuristic that combines:
- Domain reputation (trusted list, HTTPS, suspicious keywords)
- Content signals (capitalisation, suspicious vocabulary, quotes, numbers)
- Cross-source consistency (tier-weighted corroborating vs conflicting signals)
- Dark pattern penalty (manipulative framing reduces the score)
- Emotional tone penalty (extreme sentiment reduces the score)
- EXIF metadata quality (image scans)

### Signal Confidence (0–100)
Indicates how much supporting evidence was gathered:
- Findings breadth (more analysis dimensions = higher confidence)
- Tier-1 source count (wire services / public broadcasters)
- Curated feed keyword overlap
- AI analysis flag
- EXIF richness (image scans)

### Cross-Source Consistency Score
Tier-weighted ratio: `corroboratingWeight / totalWeight × 100`
- Tier 1 (Reuters, AP, BBC, NPR, PBS, Nature, Science) → weight 1.0
- Tier 2 (Guardian, NYT, WaPo, Bloomberg, WSJ, Economist, DW) → weight 0.75
- Tier 3 (unknown / aggregator) → weight 0.5

---

## Disclaimer

This tool provides **heuristic analysis only** and should not be used as the sole basis for determining the authenticity of news or media. All analysis happens locally in your browser. No content you submit is sent to any server other than the optional AI provider you explicitly configure.

