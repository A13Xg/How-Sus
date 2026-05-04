# Developer Guide

## Project Setup

```bash
git clone https://github.com/A13Xg/How-Sus.git
cd How-Sus
npm install
npm run dev        # Development server: http://localhost:5173
npm run build      # Production build: dist/
npm run lint       # ESLint check
npm run preview    # Preview production build
npm run refresh:data  # Refresh corroboration feed
```

## Architecture

HowSus is a React 19 single-page application built with Vite 8.

### State Management

No Redux or Zustand. All state lives in `App.jsx` using React hooks:

| State | Type | Description |
|-------|------|-------------|
| `aiConfig` | object | API key/provider/model — session memory only |
| `inputData` | object | `{ type, value, dateFrom, dateTo, file }` |
| `scanPhase` | string | `'idle'` \| `'scanning'` \| `'complete'` \| `'error'` |
| `scanProgress` | number | 0–100 |
| `scanResults` | object | Full results after scan completes |
| `aiAnalysis` | object | AI response if key was provided |
| `scanError` | string | Top-level error message |
| `sourceFeed` | object | Loaded corroboration feed JSON |
| `scanHistory` | array | Last N scans (localStorage-backed) |

### Analysis Pipeline

`handleScan` in App.jsx orchestrates the full analysis:

1. Reset state
2. Start progress simulation (180ms intervals)
3. Run analysis (`analyzeUrl` / `analyzeText` / `analyzeImage`)
4. Optional AI analysis (`runAiAnalysis`)
5. Optional URL screenshot (Microlink.io)
6. Persist to scan history
7. Set results and complete

### Adding a New Finding

Findings are objects in the `findings` array within each `analyze*` function:

```javascript
{
  label: 'My new finding',        // Display name
  value: 'Result here',           // Measured value
  status: 'good'|'bad'|'warn'|'info',
  explanation: 'What this means', // Optional tooltip text
  excerpt: 'Matched text...',     // Exact evidence text
  dataPath: [                     // Step-by-step trace
    'Step 1: What was checked',
    'Step 2: What was found',
    'Step 3: Score impact',
  ],
  searchUrl: 'https://google.com/...',  // Optional search link
}
```

### Adding a New Library

1. Add to `src/lib/`
2. Export named functions
3. Import in `App.jsx`
4. Call in relevant `analyze*` function
5. Add finding to results

### Logger

```javascript
import logger from './lib/logger.js';

logger.debug('message', { optional: 'data' });
logger.info('message');
logger.warn('message', { error: err.message });
logger.error('message', { context });

// Time an operation:
logger.time('my-operation');
// ... code ...
logger.timeEnd('my-operation');

// Group with timing:
const result = await logger.group('operation-name', async () => {
  // ... async code ...
  return result;
});
```

### Settings

User settings are persisted via `useSettings()` hook from `src/lib/settings.js`:

```javascript
const { settings, updateSetting } = useSettings();
// settings.theme, settings.enableAnimations, settings.scanHistorySize, etc.
```

### Environment Badge

`src/components/EnvironmentBadge.jsx` detects:
- `isLocalhost` — `window.location.hostname === 'localhost'`
- `isGitHubPages` — hostname ends with `.github.io`
- `isStaticHost` — GitHub Pages or other static hosts

Add new feature availability items to the `STATIC_ONLY_FEATURES` array in `EnvironmentBadge.jsx`.

## Adding Trusted Domains

Edit the `TRUSTED_DOMAINS` array and `DOMAIN_TIERS` object in `App.jsx`. Use the tier system:
- Tier 1: Wire services, public broadcasters, fact-checkers, government/academic sources
- Tier 2: Major established outlets

## Feed Refresh

The corroboration feed is at `public/data/corroboration-feed.json`. Format:

```json
{
  "fetched": "2024-01-15T12:00:00Z",
  "entries": [
    {
      "title": "Headline text",
      "snippet": "First few sentences...",
      "url": "https://...",
      "source": "BBC News",
      "date": "2024-01-15",
      "tier": 1
    }
  ]
}
```

Add new RSS sources to `scripts/refresh-corroboration-feed.mjs`.

## Testing

No automated test suite currently. Run lint before submitting PRs:
```bash
npm run lint
```

Manual testing checklist:
- [ ] URL analysis (trusted domain, suspicious domain, IP address, HTTP)
- [ ] Text analysis (long article, short text, suspicious content)
- [ ] Image analysis (JPEG with EXIF, PNG screenshot, WebP)
- [ ] AI analysis (with OpenAI key, with Google key, without key)
- [ ] PDF and HTML export
- [ ] Scan history persistence
- [ ] Share link encoding/decoding
- [ ] Settings panel (theme, history size)
- [ ] Keyboard shortcuts
- [ ] Mobile responsiveness
