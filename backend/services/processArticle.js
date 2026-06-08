// Orchestrates the full article-processing pipeline and returns the unified
// shape the frontend expects: { corrections[], stats }.
//
// Each concern gets its OWN focused AI call for best quality:
//   - grammar/spelling for the TITLE  (Gemini)
//   - grammar/spelling for the BODY   (Gemini)
//   - moderation with reasons         (OpenAI, then Gemini fallback)
// Terminology and SEO are computed LOCALLY (no AI) — deterministic, free,
// private, and the terminology list is a controlled style guide.
//
// Each correction is a SUGGESTION (status "pending"); nothing is auto-applied.

import { randomUUID } from 'node:crypto';
import { correctArabic, geminiEnabled, geminiModerate } from './geminiService.js';
import { detectTerms } from './terminology/matcher.js';
import { moderate, moderationEnabled } from './moderationService.js';
import { analyzeSeo } from './seoService.js';

// Locate every occurrence of `needle` in `text`, returning [start,end] spans.
function findSpans(text, needle) {
  const spans = [];
  if (!needle) return spans;
  let from = 0;
  while (true) {
    const idx = text.indexOf(needle, from);
    if (idx === -1) break;
    spans.push([idx, idx + needle.length]);
    from = idx + needle.length;
  }
  return spans;
}

// Run terminology + a focused grammar call on one field. Returns an error
// message if the grammar call failed, else null.
async function checkField(field, text, corrections) {
  if (!text) return null;

  // Terminology (local, always available) — hits already carry offsets.
  for (const t of detectTerms(text)) {
    corrections.push({
      id: randomUUID(),
      field,
      original: t.original,
      corrected: t.suggested,
      explanation: t.explanation,
      category: t.category,
      start: t.start,
      end: t.end,
      status: 'pending',
    });
  }

  // Grammar/spelling — a dedicated, focused Gemini call for this field.
  if (geminiEnabled()) {
    try {
      const used = new Set();
      for (const c of await correctArabic(text)) {
        const span = findSpans(text, c.original).find(([s, e]) => !used.has(`${s}:${e}`));
        if (!span) continue;
        used.add(`${span[0]}:${span[1]}`);
        corrections.push({
          id: randomUUID(),
          field,
          original: c.original,
          corrected: c.corrected,
          explanation: c.explanation,
          category: c.category,
          start: span[0],
          end: span[1],
          status: 'pending',
        });
      }
    } catch (e) {
      return e.message;
    }
  }
  return null;
}

export async function processArticle(title, body) {
  const bodyText = body || '';
  const titleText = (title || '').trim();
  const notices = [];
  const corrections = [];

  // 1 + 2) Focused per-field checks (terminology + grammar).
  const bodyErr = await checkField('body', bodyText, corrections);
  const titleErr = await checkField('title', titleText, corrections);
  const grammarErr = bodyErr || titleErr;
  if (grammarErr) notices.push(`تعذّر التدقيق اللغوي: ${grammarErr}`);
  if (!geminiEnabled()) notices.push('التدقيق اللغوي معطّل (GEMINI_API_KEY غير مُعد).');

  // 3) Moderation — a dedicated Gemini call returning scores, reasons, AND
  // fixable issues (suggested edits for shocking/inappropriate passages).
  let shocking = 0;
  let inappropriate = 0;
  let shockingReason = '';
  let inappropriateReason = '';
  let moderated = false;

  if (geminiEnabled()) {
    try {
      const g = await geminiModerate(titleText, bodyText);
      if (g) {
        shocking = g.shocking;
        inappropriate = g.inappropriate;
        shockingReason = g.shocking_reason;
        inappropriateReason = g.inappropriate_reason;
        moderated = true;

        // Turn each flagged passage into an accept/reject suggestion.
        const used = { title: new Set(), body: new Set() };
        for (const issue of g.issues) {
          const source = issue.field === 'title' ? titleText : bodyText;
          const span = findSpans(source, issue.original).find(
            ([s, e]) => !used[issue.field].has(`${s}:${e}`)
          );
          if (!span) continue;
          used[issue.field].add(`${span[0]}:${span[1]}`);
          corrections.push({
            id: randomUUID(),
            field: issue.field,
            original: issue.original,
            corrected: issue.corrected,
            explanation: issue.explanation,
            category: issue.category, // "محتوى مخل" | "محتوى صادم"
            start: span[0],
            end: span[1],
            status: 'pending',
          });
        }
      }
    } catch {
      /* moderation unavailable */
    }
  } else if (moderationEnabled()) {
    // Fallback: OpenAI scores only (no issues).
    try {
      const m = await moderate(`${titleText}\n${bodyText}`);
      if (m) {
        shocking = m.shocking;
        inappropriate = m.inappropriate;
        moderated = true;
      }
    } catch {
      /* ignore */
    }
  }
  if (!moderated) {
    notices.push('فحص المحتوى الصادم/المخل غير متاح حالياً — تم تخطّيه.');
  }

  // 4) SEO + readability (local).
  const seo = analyzeSeo(title, bodyText);

  const errorPct = seo.total_words
    ? Math.min(100, Math.round((corrections.length / seo.total_words) * 100))
    : 0;

  const fieldOrder = { title: 0, body: 1 };
  corrections.sort(
    (a, b) => fieldOrder[a.field] - fieldOrder[b.field] || a.start - b.start
  );

  return {
    corrections,
    stats: {
      shocking_content_percentage: shocking,
      inappropriate_content_percentage: inappropriate,
      shocking_reason: shockingReason,
      inappropriate_reason: inappropriateReason,
      error_percentage: errorPct,
      readability_score: seo.readability_score,
      keyword_density: seo.keyword_density,
      seo_suggestions: seo.seo_suggestions,
      total_corrections: corrections.length,
      total_words: seo.total_words,
    },
    notices,
  };
}
