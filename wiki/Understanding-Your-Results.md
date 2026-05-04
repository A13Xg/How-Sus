# Understanding Your Results

## The Authenticity Score

The **Authenticity Score** (0–100 gauge at the top) represents the overall confidence in content authenticity.

Click the **"Details"** button next to the score to see exactly which factors contributed to it.

### Score Factors by Analysis Type

**URL Analysis** — what raises the score:
- Recognized trusted domain (Reuters, BBC, AP, government sites, etc.)
- HTTPS protocol
- Older estimated domain age
- No suspicious keyword patterns in the URL
- High cross-source consistency

**URL Analysis** — what lowers the score:
- No HTTPS (HTTP only)
- Suspicious domain name patterns
- Risky TLD (e.g., .xyz, .tk, .ml)
- IP address as hostname
- Clickbait URL path keywords
- Many URL query parameters

**Text Analysis** — what raises the score:
- Longer, more detailed text (>200 words)
- Proper quote attribution
- Named entities (specific people, places, organizations)
- Statistical claims with numbers
- Multiple source attributions
- Formal language style

**Text Analysis** — what lowers the score:
- Suspicious/manipulative keywords
- Excessive capital letters
- Multiple exclamation marks
- Hedging language without verification
- Very short text

**Image Analysis** — what raises the score:
- Camera make/model in EXIF (indicates original photo)
- Capture date in EXIF
- GPS coordinates present (indicates unmanipulated original)

**Image Analysis** — what lowers the score:
- Editing software detected (Photoshop, GIMP, etc.)
- AI generation tool detected
- No EXIF metadata (stripped — common in social media)
- File type mismatch (extension ≠ magic bytes)
- Over-saturated colors (AI/filter signal)
- Steganography indicators (hidden data)
- Date inconsistency (EXIF vs file modification)
- Alpha channel detected (compositing signal)

## Signal Confidence Badge

The **Signal Confidence** badge shows how much evidence was gathered to support the authenticity score.

| Confidence | Meaning |
|-----------|---------|
| 75–100 | Strong evidence — high confidence in the score |
| 50–74 | Moderate evidence — score is reasonably reliable |
| 25–49 | Limited evidence — score should be treated with caution |
| 0–24 | Minimal evidence — insufficient data |

The badge also shows "Strong/Moderate/Limited evidence" as a text label.

## Findings Grid

Each finding row shows:
- **Label** — what was checked
- **Value** — the measured result
- **Status icon** — ✓ Good, ✗ Bad, ⚠ Warning, ℹ Info

**Click any finding** to open a detail modal showing:
1. The current measured value
2. An explanation of what this means
3. **"📍 Evidence / Matched Content"** — the exact text or data that triggered this finding
4. **"🔗 How this was determined"** — a numbered step-by-step data path trace

This gives you full transparency into how every score was computed.

## Cross-Source Consistency

The cross-source section shows:
- **Corroborating sources** — signals supporting authenticity
- **Conflicting sources** — signals raising concerns
- Each source shows: confidence %, evidence bullets, tier badge, "Search this claim" link

**Tier system:**
- **Tier 1** (weight 1.0): Wire services and public broadcasters (Reuters, AP, BBC, NPR, PolitiFact, Snopes)
- **Tier 2** (weight 0.75): Major established outlets (Guardian, NYT, WaPo, Bloomberg, WSJ)
- **Tier 3** (weight 0.5): Unknown/aggregator sources

## Dark Patterns

If manipulative framing tactics are detected, they appear in the **Dark Patterns** panel. Each detection shows:
- The pattern label and category (urgency/fear/tribalism/conspiracy/sensational/clickbait)
- The matched text excerpt
- An educational tip explaining the manipulation tactic

Categories:
- **Urgency** — "Share before deleted!", "Must read now!"
- **Fear** — "Scientists warn…", "Danger!"
- **Tribalism** — "Wake up, sheeple", "The elites"
- **Conspiracy** — "Cover-up", "Deep state", "They don't want you to know"
- **Sensational** — "Shocking!", "Bombshell!"
- **Clickbait** — "You won't believe…", "This changes everything"

## Source Freshness

Shows how recently the matched corroboration feed sources were published:
- **Very fresh (< 1 day)** — 100/100
- **Recent (< 1 week)** — ~90/100
- **Moderate (< 1 month)** — ~50-80/100
- **Stale (> 3 months)** — 0-30/100

## Claim Density (Text analysis)

Measures verifiable claims per 100 words:
- **High (≥15/100 words)** — very specific, professional journalism quality
- **Medium (8-14/100 words)** — some verifiable content
- **Low (3-7/100 words)** — mostly assertions
- **Very low (<3/100 words)** — nearly all unverified claims
