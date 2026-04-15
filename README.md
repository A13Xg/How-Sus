# HowSus — News & Media Authenticity Analyzer

A fully client-side React web app for analyzing the authenticity of news articles, social media posts, and images. No data ever leaves your browser.

## Features

- **URL Analysis** — checks domain reputation, HTTPS, domain age, and clickbait URL patterns
- **Text Analysis** — detects suspicious keywords, excessive capitalization, exclamation marks, and citation quality
- **Image Analysis** — extracts and evaluates EXIF metadata (camera, GPS, date, editing software)
- **Animated Scan Visualization** — real-time progress bar, step indicators, and a canvas network graph showing duplicate sources
- **Verification Timeline** — shows the spread history of a piece of content
- **PDF & HTML Export** — download a full analysis report
- **Optional AI Analysis** — paste an OpenAI or Google API key (auto-detected provider, session memory only)
- **Cross-Source Consistency** — compares corroborating vs conflicting source signals and surfaces an explainable consistency score
- **Static Feed Refresh via GitHub Actions** — scheduled workflow updates a curated corroboration feed JSON in-repo

## Tech Stack

- [React](https://react.dev/) + [Vite](https://vite.dev/)
- [Framer Motion](https://www.framer.com/motion/) — animations
- [jsPDF](https://artskydj.github.io/jsPDF/) — PDF export
- [exifr](https://mutiny.cz/exifr/) — EXIF metadata extraction

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Build

```bash
npm run build
```

Output is placed in `dist/`. The `"homepage": "."` setting in `package.json` makes it compatible with GitHub Pages.

## GitHub Pages-Only Architecture

This project is designed to run without any custom backend service.

- Runtime: static files served by GitHub Pages
- Data and logic: browser-side only (React app)
- Background processing: GitHub Actions workflows only
- Optional external APIs: called directly from browser with user-provided key (never persisted)

### What is possible in this scope

- Heuristic URL/text/image analysis in-browser
- Client-side AI calls to OpenAI or Google Gemma models
- Scheduled data ingestion using GitHub Actions, committed as static JSON under `public/data/`
- Static report export (PDF/HTML)
- Explainability overlays and metric drilldowns

### What is not possible without a backend

- Secure server-side secret storage for third-party APIs
- Private API access that requires hidden credentials
- Low-latency heavy NLP or vector search over large corpora on demand
- Real-time webhook ingestion or streaming pipelines

## Static Data Refresh

To refresh corroboration feed data locally:

```bash
npm run refresh:data
```

This writes `public/data/corroboration-feed.json`.

The workflow `.github/workflows/refresh-data.yml` runs on schedule and can be triggered manually.

## Disclaimer

This tool provides **heuristic analysis only** and should not be used as the sole basis for determining the authenticity of news or media.
