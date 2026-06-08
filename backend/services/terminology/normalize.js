// Layer 1 — Arabic normalization with offset tracking.
//
// We normalize text so the matcher sees canonical forms (no diacritics,
// unified alef/ya, no tatweel), but we KEEP a map from each character in the
// normalized string back to its index in the ORIGINAL string. That lets us
// report match positions against the text the user actually typed.

const DIACRITICS = /[ً-ْٰـ]/; // tashkeel + superscript alef + tatweel

// Characters we fold to a single canonical form.
function foldChar(ch) {
  switch (ch) {
    case 'أ': // أ
    case 'إ': // إ
    case 'آ': // آ
    case 'ٱ': // ٱ
      return 'ا'; // ا
    case 'ى': // ى
      return 'ي'; // ي
    default:
      return ch;
  }
}

/**
 * @param {string} original
 * @returns {{ normalized: string, map: number[] }}
 *   `map[i]` = index in `original` of the i-th char of `normalized`.
 */
export function normalizeWithMap(original) {
  // NFC keeps composed forms; we strip combining marks explicitly below.
  const src = original.normalize('NFC');
  let normalized = '';
  const map = [];
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (DIACRITICS.test(ch)) continue; // drop, but original index is skipped
    const folded = foldChar(ch);
    normalized += folded;
    map.push(i);
  }
  return { normalized, map };
}

/** Plain normalization (no map) — used to normalize term patterns. */
export function normalize(text) {
  return normalizeWithMap(text).normalized;
}

/** Is the char at originalIndex an Arabic-script letter? (for word boundaries) */
const ARABIC_LETTER = /\p{Script=Arabic}/u;
export function isArabicLetter(ch) {
  return !!ch && ARABIC_LETTER.test(ch);
}
