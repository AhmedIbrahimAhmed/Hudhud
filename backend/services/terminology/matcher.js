// Layer 3 — multi-pattern matching with Aho-Corasick, mapped back to the
// original text, with Arabic word-boundary enforcement and leftmost-longest
// overlap resolution.

import AhoCorasick from 'modern-ahocorasick';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWithMap, isArabicLetter } from './normalize.js';
import { buildPatternIndex } from './variants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load terms once at module init.
const TERMS = JSON.parse(readFileSync(join(__dirname, 'terms.json'), 'utf8'));

// Build the pattern → term mapping and the automaton once.
const patternIndex = buildPatternIndex(TERMS);
const patternToTerm = new Map();
for (const { pattern, termIndex } of patternIndex) {
  if (!patternToTerm.has(pattern)) patternToTerm.set(pattern, termIndex);
}
const ac = new AhoCorasick([...patternToTerm.keys()]);

/**
 * Detect terminology hits in `text`.
 * @param {string} text  the original article body
 * @returns {Array<{original, suggested, explanation, category, start, end}>}
 *   start/end are character offsets into the ORIGINAL text (end exclusive).
 */
export function detectTerms(text) {
  if (!text) return [];
  const { normalized, map } = normalizeWithMap(text);

  // search() returns [endIndex, matchedKeywords[]] with endIndex = last char.
  const raw = [];
  for (const [endIndex, words] of ac.search(normalized)) {
    for (const word of words) {
      const startIndex = endIndex - word.length + 1;
      if (startIndex < 0) continue;

      // Word-boundary check on the normalized neighbours.
      const before = normalized[startIndex - 1];
      const after = normalized[endIndex + 1];
      if (isArabicLetter(before) || isArabicLetter(after)) continue;

      const termIndex = patternToTerm.get(word);
      if (termIndex == null) continue;

      // Map normalized indices back to original-text indices.
      const origStart = map[startIndex];
      const origEnd = map[endIndex] + 1; // exclusive
      raw.push({ origStart, origEnd, length: word.length, termIndex });
    }
  }

  // Leftmost-longest: sort by start asc, then by length desc, greedily keep
  // non-overlapping matches.
  raw.sort((a, b) => a.origStart - b.origStart || b.length - a.length);
  const chosen = [];
  let lastEnd = -1;
  for (const m of raw) {
    if (m.origStart < lastEnd) continue; // overlaps a longer/earlier pick
    chosen.push(m);
    lastEnd = m.origEnd;
  }

  return chosen.map((m) => {
    const term = TERMS[m.termIndex];
    return {
      original: text.slice(m.origStart, m.origEnd),
      suggested: term.replacement,
      explanation: term.explanation,
      category: term.category,
      start: m.origStart,
      end: m.origEnd,
    };
  });
}

export { TERMS };
