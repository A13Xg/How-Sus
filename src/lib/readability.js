/**
 * readability.js — Flesch-Kincaid reading ease and grade level (client-side).
 *
 * analyzeReadability(text) returns:
 *   { fleschEase, fleschGrade, gradeLabel, syllableCount, sentenceCount, wordCount }
 */

function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  let count = 0;
  let prev = false;
  for (let i = 0; i < w.length; i++) {
    const isVowel = /[aeiouy]/.test(w[i]);
    if (isVowel && !prev) count++;
    prev = isVowel;
  }
  // Trailing silent-e adjustment
  if (w.endsWith('e') && count > 1) count--;
  return Math.max(1, count);
}

export function analyzeReadability(text) {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const wordTokens = text
    .replace(/[^a-zA-Z\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);

  const sentenceCount = Math.max(1, sentences.length);
  const wordCount = Math.max(1, wordTokens.length);
  const syllableCount = wordTokens.reduce((acc, w) => acc + countSyllables(w), 0);

  const wordsPerSentence = wordCount / sentenceCount;
  const syllablesPerWord = syllableCount / wordCount;

  // Flesch Reading Ease (higher = easier)
  const fleschEase = parseFloat(
    Math.max(0, Math.min(100, 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord)).toFixed(1)
  );

  // Flesch-Kincaid Grade Level
  const fleschGrade = parseFloat(
    Math.max(0, (0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59)).toFixed(1)
  );

  let gradeLabel;
  if (fleschEase >= 80) gradeLabel = 'Very Easy (Grade 5)';
  else if (fleschEase >= 70) gradeLabel = 'Easy (Grade 6)';
  else if (fleschEase >= 60) gradeLabel = 'Standard (Grade 7-8)';
  else if (fleschEase >= 50) gradeLabel = 'Fairly Difficult (Grade 10-12)';
  else if (fleschEase >= 30) gradeLabel = 'Difficult (College)';
  else gradeLabel = 'Very Difficult (Professional)';

  return {
    fleschEase,
    fleschGrade,
    gradeLabel,
    syllableCount,
    sentenceCount,
    wordCount,
    wordsPerSentence: parseFloat(wordsPerSentence.toFixed(1)),
    syllablesPerWord: parseFloat(syllablesPerWord.toFixed(2)),
  };
}
