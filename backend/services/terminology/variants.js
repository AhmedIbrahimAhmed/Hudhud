// Layer 2 — offline morphological variant expansion.
//
// Arabic glues clitics onto the front of words (و، ف، ب، ك، ل، ال ...). A naive
// exact match for "الجيش الإسرائيلي" would miss "والجيش الإسرائيلي". Instead of a
// full morphological analyzer, we expand each canonical term into the realistic
// set of cliticized surface forms and feed them ALL to the matcher.
//
// We only prefix the FIRST word of a multi-word term (clitics attach to the
// start of the phrase), which keeps the variant set small and precise.

import { normalize } from './normalize.js';

// Single-letter proclitics that can attach to a noun/phrase start.
const PREFIXES = ['و', 'ف', 'ب', 'ك', 'ل'];

/**
 * Build the set of normalized surface variants for a canonical term.
 * Each variant maps back to the same canonical entry.
 * @param {string} canonical
 * @returns {string[]} unique normalized variant strings
 */
export function expandVariants(canonical) {
  const base = normalize(canonical).trim();
  if (!base) return [];

  const variants = new Set();
  variants.add(base);

  const startsWithAl = base.startsWith('ال');

  for (const p of PREFIXES) {
    // و + الجيش  => والجيش
    variants.add(p + base);
    // ل + الجيش  => للجيش  (lam + al => ل + ل, the alef of ال elides)
    if (p === 'ل' && startsWithAl) {
      variants.add('لل' + base.slice(2));
    }
  }

  return [...variants];
}

/**
 * Build a flat list of { pattern, termIndex } for every term's every variant,
 * so the matcher can map a hit back to the originating term.
 * @param {Array<{canonical:string}>} terms
 */
export function buildPatternIndex(terms) {
  const patterns = [];
  terms.forEach((term, termIndex) => {
    for (const variant of expandVariants(term.canonical)) {
      patterns.push({ pattern: variant, termIndex });
    }
  });
  return patterns;
}
