# Getting Started

## Using the Live App

Visit **https://a13xg.github.io/How-Sus/** — no installation required.

## Three Analysis Modes

### 🔗 URL Analysis
Paste any URL to analyze the domain, URL patterns, and metadata.

**Best for:** News articles, blog posts, social media links

**What it checks:**
- Domain reputation (43 trusted domains including Reuters, AP, BBC, government sites, universities)
- HTTPS/TLS security
- Top-level domain (TLD) risk assessment
- URL path keyword patterns
- Subdomain depth and structure
- Cross-source consistency with Tier 1/2 corroboration sources

### 📝 Text Analysis
Paste any text — article body, social media post, email forward.

**Best for:** Articles without URLs, forwarded messages, suspicious text

**What it checks:**
- 39 suspicious keyword patterns (urgency, conspiracy, suppression narratives)
- Capital letter ratio (ALL CAPS = sensationalism signal)
- Exclamation mark density
- Sentiment scoring (AFINN-165)
- Named entity recognition (people, organizations, places)
- Claim density (verifiable claims per 100 words)
- Source attribution patterns
- Language formality score
- Readability grade level (Flesch-Kincaid)
- Dark pattern detection (6 categories)

### 🖼 Image Analysis
Upload an image to analyze its metadata and forensic signals.

**Best for:** Viral photos, screenshots, news images

**What it checks:**
- 12-point forensic pipeline (see [Image Analysis Guide](Image-Analysis-Guide))

## Reading Your Score

The **Authenticity Score** (0–100) is your headline result:

| Score | Label | Meaning |
|-------|-------|---------|
| 70–100 | 🟢 Likely Authentic | Strong positive signals |
| 40–69 | 🟡 Uncertain | Mixed or insufficient signals |
| 0–39 | 🔴 Likely False | Strong negative signals |

> **Important:** This is a heuristic score, not a verdict. Always apply human judgment and consult primary sources.

The **Signal Confidence** badge shows how much supporting evidence was gathered. High score + high confidence = strongest result.
