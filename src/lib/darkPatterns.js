/**
 * darkPatterns.js — Detects manipulative framing in headlines and text.
 * 
 * Categories:
 *  - urgency      : manufactured time pressure / virality bait
 *  - fear         : fear appeals / threat framing
 *  - tribalism    : in-group vs out-group framing
 *  - conspiracy   : hidden-actor or suppression narrative
 *  - sensational  : extreme emotional inflation
 *  - clickbait    : curiosity gaps / over-promising
 *
 * detectDarkPatterns(text) → { detected: [{category, label, match, tip}], score, riskLevel }
 * score:     0-100 manipulation risk
 * riskLevel: 'low' | 'medium' | 'high'
 */

const PATTERNS = [
  // ── Urgency ──────────────────────────────────────────────────────────────
  { category: 'urgency', label: 'Delete before seen', re: /share before (deleted?|removed?|banned?)/i, tip: 'Content that claims to be at risk of removal is often a virality tactic.' },
  { category: 'urgency', label: 'Going viral urgency', re: /going viral/i, tip: 'Viral framing is used to manufacture urgency and bypass critical reading.' },
  { category: 'urgency', label: 'Breaking exclusive', re: /\bbreaking[: ].{0,40}exclusive\b/i, tip: '"Breaking exclusive" combinations are common attention-hijacking patterns.' },
  { category: 'urgency', label: 'Act now / limited time', re: /\b(act now|limited time|before it'?s too late|don'?t wait)\b/i, tip: 'Artificial urgency shortcuts careful evaluation.' },
  // ── Fear ─────────────────────────────────────────────────────────────────
  { category: 'fear', label: 'Scientists warn', re: /scientists? warn/i, tip: 'Vague expert attribution without citation is a common fear-framing device.' },
  { category: 'fear', label: 'Hidden danger', re: /\b(hidden danger|silent killer|deadly secret)\b/i, tip: 'Hidden threat framing triggers anxiety before evidence is evaluated.' },
  { category: 'fear', label: 'Your [X] is at risk', re: /your .{0,20} (is |are )?at risk/i, tip: 'Personalised threat framing is a common misinformation amplification device.' },
  { category: 'fear', label: 'End of [X]', re: /\bend of (the world|democracy|freedom|america|western civilization)\b/i, tip: 'Catastrophising about civilisational collapse is a radicalization funnel pattern.' },
  // ── Tribalism ────────────────────────────────────────────────────────────
  { category: 'tribalism', label: 'Mainstream media attack', re: /\b(mainstream media|msm|lamestream)\b/i, tip: 'Attacking "mainstream media" as a monolith is a tactic to pre-discredit fact-checking.' },
  { category: 'tribalism', label: 'Deep state framing', re: /\bdeep state\b/i, tip: 'Deep-state framing attributes events to a shadowy unelected power, a classic conspiracy trope.' },
  { category: 'tribalism', label: 'Us vs. them', re: /\b(they want|they don'?t want you|elites (want|don'?t want)|globalists?)\b/i, tip: 'Powerful unnamed "they" framing manufactures group solidarity against a vague enemy.' },
  { category: 'tribalism', label: 'Sheeple framing', re: /\b(sheeple|wake up sheep|sleeping masses|brainwashed)\b/i, tip: 'Framing non-believers as naive sheep is a recruitment pattern for conspiratorial communities.' },
  // ── Conspiracy ───────────────────────────────────────────────────────────
  { category: 'conspiracy', label: 'They don\'t want you to know', re: /they don'?t want (you|us) to know/i, tip: 'Suppression framing implies hidden truth without evidence of suppression.' },
  { category: 'conspiracy', label: 'Cover-up narrative', re: /\b(cover[ -]?up|cover(ing)? (it )?up|suppressed (truth|data|report))\b/i, tip: 'Cover-up claims require independent corroboration before acceptance.' },
  { category: 'conspiracy', label: 'False flag claim', re: /\bfalse[ -]flag\b/i, tip: 'False flag claims reframe established events using unverified counter-narratives.' },
  { category: 'conspiracy', label: 'New World Order', re: /\b(new world order|nwo|illuminati|reset agenda)\b/i, tip: 'Named conspiracy groups indicate content from known misinformation ecosystems.' },
  // ── Sensational ──────────────────────────────────────────────────────────
  { category: 'sensational', label: 'Unbelievable claim', re: /\b(unbelievable|mind[ -]?blowing|jaw[ -]?dropping|you won'?t believe)\b/i, tip: 'Emotional superlatives substitute for factual credibility.' },
  { category: 'sensational', label: 'Shocking reveal', re: /\b(shocking(ly)?|bombshell|explosive revelation)\b/i, tip: '"Shocking" framing heightens emotional arousal to reduce analytical processing.' },
  { category: 'sensational', label: 'Destroys / obliterates', re: /\b(destroys?|obliterates?|annihilates?|dismantles?) (argument|narrative|claim|debate)\b/i, tip: 'Hyperbolic debate language is click optimised rather than informative.' },
  // ── Clickbait ────────────────────────────────────────────────────────────
  { category: 'clickbait', label: 'Curiosity gap', re: /\b(what (they|he|she|doctors|experts) (won'?t|didn'?t) tell|the (one|secret) (trick|reason|thing)|this is why)\b/i, tip: 'Curiosity gaps withhold key information to compel clicks rather than inform.' },
  { category: 'clickbait', label: 'Number bait', re: /\b\d+ (reasons?|things?|ways?|facts?) (you|that|about|why)\b/i, tip: 'Numbered lists are a structural clickbait pattern used to fragment information.' },
  { category: 'clickbait', label: 'Impossible question headline', re: /\b(is .{5,40}\? find out|can you believe|guess what happened)\b/i, tip: 'Rhetorical question headlines are designed to generate emotional responses over informational ones.' },
];

export function detectDarkPatterns(text) {
  if (!text || text.length < 8) {
    return { detected: [], matchCount: 0, score: 0, riskLevel: 'low' };
  }

  const detected = [];
  const seenLabels = new Set();

  for (const p of PATTERNS) {
    const match = text.match(p.re);
    if (match && !seenLabels.has(p.label)) {
      seenLabels.add(p.label);
      detected.push({
        category: p.category,
        label: p.label,
        match: match[0].slice(0, 60),
        tip: p.tip,
      });
    }
  }

  // Each pattern hit contributes to a risk score, caps at 100
  const categoryWeights = { urgency: 15, fear: 18, tribalism: 20, conspiracy: 25, sensational: 12, clickbait: 10 };
  const raw = detected.reduce((acc, d) => acc + (categoryWeights[d.category] || 10), 0);
  const score = Math.min(100, raw);

  const riskLevel = score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low';

  return { detected, matchCount: detected.length, score, riskLevel };
}
