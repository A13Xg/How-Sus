/**
 * formalityAnalyzer.js - Analyzes text for linguistic formality vs. informality.
 *
 * Formal language patterns are associated with professional journalism.
 * Informal/colloquial language correlates with opinion pieces and lower-credibility content.
 *
 * Features:
 * - Detects informal markers (slang, contractions, first-person, exclamations)
 * - Detects formal markers (passive voice, technical terminology, citation patterns)
 * - Returns a formality score 0-100 and label
 */

// Informal language markers
const INFORMAL_MARKERS = [
  // Contractions
  /\b(?:don't|can't|won't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|doesn't|didn't|wouldn't|couldn't|shouldn't|I'm|you're|they're|we're|it's|that's|there's|here's|what's|who's)\b/gi,
];

const INFORMAL_PATTERNS = [
  /\b(gonna|wanna|gotta|kinda|sorta|lotsa|dunno|ya know|y'all|ain't|nah|yep|yup|nope|yeah|ok|okay|lol|omg|wtf|smh|imo|imho|tbh|fyi|asap)\b/gi,
  /\b(stuff|things|stuff like that|you know|kind of|sort of|like totally|super|mega|ultra|wicked)\b/gi,
  /!!+/g,    // Multiple exclamation marks
  /\?!\??/g, // ?! patterns
];

// Formal language markers
const FORMAL_PATTERNS = [
  /\b(furthermore|moreover|consequently|nevertheless|notwithstanding|pursuant|therein|herein|aforementioned|subsequent|preceding|incumbent)\b/gi,
  /\b(according to|as stated by|per|citing|referenced|documented|published|reported|confirmed|verified|substantiated)\b/gi,
  /\b(analysis|examination|investigation|assessment|evaluation|determination|methodology|framework|criteria)\b/gi,
  /\b(percent|percentage|million|billion|thousand|approximately|estimated|roughly|approximately)\b/gi,
];

// First-person singular (informal in journalism)
const FIRST_PERSON = /\b(I |I'm |I've |I'll |I'd |my |me |myself )\b/g;

/**
 * analyzeFormality - computes a formality score for the given text.
 *
 * @param {string} text - the text to analyze
 * @returns {{ score: number, label: string, informalCount: number, formalCount: number, details: string[] }}
 */
export function analyzeFormality(text) {
  if (!text || text.trim().length < 20) {
    return { score: 50, label: 'Neutral', informalCount: 0, formalCount: 0, details: [] };
  }

  let informalCount = 0;
  let formalCount = 0;
  const details = [];

  // Count contractions
  const contractions = INFORMAL_MARKERS.flatMap((re) => (text.match(new RegExp(re.source, 'gi')) || []));
  informalCount += contractions.length;
  if (contractions.length > 0) {
    details.push(`Contractions: ${Math.min(contractions.length, 5)} found (${contractions.slice(0, 3).join(', ')})`);
  }

  // Count informal patterns
  for (const pattern of INFORMAL_PATTERNS) {
    const m = text.match(new RegExp(pattern.source, 'gi')) || [];
    informalCount += m.length;
    if (m.length > 0) details.push(`Informal terms: ${m.slice(0, 3).join(', ')}`);
  }

  // First-person usage
  const firstPersonMatches = (text.match(FIRST_PERSON) || []).length;
  informalCount += Math.round(firstPersonMatches / 2); // partial weight
  if (firstPersonMatches > 0) details.push(`First-person pronouns: ${firstPersonMatches}`);

  // Count formal patterns
  for (const pattern of FORMAL_PATTERNS) {
    const m = text.match(new RegExp(pattern.source, 'gi')) || [];
    formalCount += m.length;
    if (m.length > 0) details.push(`Formal marker: ${m.slice(0, 2).join(', ')}`);
  }

  // Score: 0 = very informal, 100 = very formal
  const total = Math.max(informalCount + formalCount, 1);
  const formalRatio = formalCount / total;
  // Sigmoid-like curve: remap [0,1] → [0,100]
  const rawScore = 30 + (formalRatio * 70) - Math.min(informalCount * 3, 30);
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  const label =
    score >= 75 ? 'Formal' :
    score >= 55 ? 'Mostly formal' :
    score >= 40 ? 'Mixed' :
    score >= 25 ? 'Mostly informal' :
    'Informal';

  return { score, label, informalCount, formalCount, details };
}
