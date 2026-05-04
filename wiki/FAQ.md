# Frequently Asked Questions

## General

**Q: Is HowSus free to use?**
A: Yes. The app is free and open source. Optional AI analysis requires your own API key.

**Q: Does HowSus send my content to a server?**
A: No. All analysis runs in your browser. The only exceptions are optional AI analysis (your key, to OpenAI/Google) and the update checker (to GitHub API).

**Q: How accurate is the score?**
A: The score is heuristic — it uses rule-based signals, not human fact-checking or machine learning. It should be treated as a screening tool, not a verdict. High confidence scores with strong corroboration are more reliable.

**Q: Why is my trusted news site getting a low score?**
A: The URL analysis only checks the domain, not the actual content. Possible causes:
- The domain isn't in our trusted list yet (we have 43 — submit an issue to add more)
- The URL has clickbait-sounding keywords in the path
- The domain is new (< 1 year estimated)

## Features

**Q: Why can't HowSus do reverse image search?**
A: Reverse image search APIs (like Google Vision or TinEye) require server-side API keys for security. HowSus is a static app with no backend. The Environment Badge in the header explains which features are unavailable.

**Q: What's the difference between Authenticity Score and Signal Confidence?**
A:
- **Authenticity Score** answers: "Is this content trustworthy?"
- **Signal Confidence** answers: "How sure are we about the authenticity score?"

A low score WITH high confidence = reliably suspicious. A low score with low confidence = insufficient data.

**Q: Why does Image Analysis show "Could not extract metadata"?**
A: EXIF extraction can fail when:
- The image has no EXIF data (screenshots, social media downloads)
- The file format is not supported by exifr
- The image file is corrupt

**Q: What is a "dark pattern"?**
A: Dark patterns in journalism are manipulative writing tactics that bypass critical thinking. Examples include manufactured urgency ("Share before deleted!"), fear appeals ("Danger to your family!"), and tribalist framing ("Wake up, sheeple"). HowSus detects 6 categories.

## Technical

**Q: Why does the app sometimes take a long time to analyze?**
A: Image analysis with EXIF extraction and canvas operations can take 1-3 seconds. AI analysis time depends on your API provider's response time.

**Q: Can I use HowSus offline?**
A: The core analysis works offline. The corroboration feed (pre-loaded on app start), AI analysis (requires internet), and update checking (requires internet) do not.

**Q: How is the corroboration feed updated?**
A: A GitHub Actions job runs on schedule and fetches headlines from Reuters, BBC, NPR, PBS, and Deutsche Welle RSS feeds. The result is committed to `public/data/corroboration-feed.json`. You can refresh it locally with `npm run refresh:data`.

**Q: What keyboard shortcuts are available?**
A: See [Keyboard Shortcuts](Keyboard-Shortcuts).
