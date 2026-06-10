// Framework-agnostic helpers for drawing Arabic text in jsPDF.
//
// IMPORTANT: jsPDF v3 already performs Arabic shaping (contextual letter-
// joining) AND the Unicode bidi algorithm internally when it draws text with an
// embedded Unicode TTF font. So we must NOT pre-shape or pre-reorder the text —
// an earlier version did (arabic-reshaper + bidi-js) and that double-processing
// produced reversed, broken output. We only need to:
//   1. Embed a TTF that actually contains the glyphs we use — Amiri covers
//      Arabic (incl. presentation forms), Latin, digits, %, parentheses and
//      guillemets. (Noto Naskh Arabic lacked Latin/%/parentheses, so those
//      characters were silently dropped.)
//   2. Replace the few characters Amiri does NOT have (arrows) with a covered
//      fallback so they don't silently disappear.
// Text is then drawn right-aligned at the right margin for an RTL layout.

import { AMIRI_REGULAR } from '../assets/fonts/amiri.js';

// Characters the embedded font lacks, mapped to a covered fallback so they are
// never silently dropped. Arrows (used as "replaced by" separators) -> em dash.
const FALLBACKS = [[/[←-⇿⟰-⟿⬀-⯿]/g, '—']];

// Strip stray Unicode bidi control characters (marks, embeddings, overrides,
// isolates) that may sneak in from sources like Intl date formatting — they
// would fight the RTL isolate we add and corrupt the line. We control direction
// ourselves via the isolate in shapeArabic.
const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩]/g;

// Apply the bidi-control strip + unsupported-character fallbacks (no direction
// marks) — used for width measurement during wrapping.
function sanitize(text) {
  if (text === null || text === undefined) return '';
  let s = String(text).replace(BIDI_CONTROLS, '');
  for (const [re, rep] of FALLBACKS) s = s.replace(re, rep);
  return s;
}

// Prepare a line for drawing: sanitize unsupported chars + strip stray bidi
// controls. (Named shapeArabic for backward compatibility with callers; jsPDF
// does the actual Arabic shaping/bidi at draw time.)
export function shapeArabic(text) {
  return sanitize(text);
}

// Registers the embedded Amiri font on a jsPDF document and selects it. The
// same face is registered for 'bold' so callers using doc.setFont('Amiri',
// 'bold') are valid; weight hierarchy is conveyed via size/color in the export.
export function registerArabicFont(doc) {
  doc.addFileToVFS('Amiri-Regular.ttf', AMIRI_REGULAR);
  doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
  doc.addFont('Amiri-Regular.ttf', 'Amiri', 'bold');
  doc.setFont('Amiri', 'normal');
  return 'Amiri';
}

// Greedily wraps text to fit `maxWidth`, fitting whole words (split on
// whitespace). Width is measured with the currently-selected font, so callers
// must setFont/setFontSize before calling. Returns an array of lines; the
// caller draws each via `doc.text(shapeArabic(line), x, y, { align: 'right' })`.
export function wrapArabic(doc, logicalText, maxWidth) {
  const text = sanitize(logicalText);
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (doc.getTextWidth(candidate) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}
