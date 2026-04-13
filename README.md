# HowSus — News & Media Authenticity Analyzer

A fully client-side React web app for analyzing the authenticity of news articles, social media posts, and images. No data ever leaves your browser.

## Features

- **URL Analysis** — checks domain reputation, HTTPS, domain age, and clickbait URL patterns
- **Text Analysis** — detects suspicious keywords, excessive capitalization, exclamation marks, and citation quality
- **Image Analysis** — extracts and evaluates EXIF metadata (camera, GPS, date, editing software)
- **Animated Scan Visualization** — real-time progress bar, step indicators, and a canvas network graph showing duplicate sources
- **Verification Timeline** — shows the spread history of a piece of content
- **PDF & HTML Export** — download a full analysis report
- **Optional AI Analysis** — paste your OpenAI API key for a GPT-powered authenticity assessment (key stored in memory only)

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

## Disclaimer

This tool provides **heuristic analysis only** and should not be used as the sole basis for determining the authenticity of news or media.
