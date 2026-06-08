// SEO service — fully local, no external API.
// Computes keyword density, title/description length checks, a simplified
// Arabic readability score, and human-readable suggestions (in Arabic).

import { normalize } from './terminology/normalize.js';

// Arabic stop-words to exclude from keyword ranking.
const STOP_WORDS = new Set(
  ('في من على الى إلى عن مع هذا هذه ذلك تلك التي الذي و او أو ثم قد كان كانت ' +
    'ان أن إن ما لا لم لن هو هي هم هن نحن انت أنت بعد قبل بين كل بعض حيث عند ' +
    'حتى اذا إذا كما لكن او منذ نحو دون غير').split(/\s+/)
);

function tokenize(text) {
  const norm = normalize(text);
  return norm
    .split(/[^\p{Script=Arabic}A-Za-z0-9]+/u)
    .filter((w) => w.length > 1);
}

function sentences(text) {
  return text.split(/[.!؟?\n]+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * @param {string} title
 * @param {string} body
 * @returns {{readability_score, keyword_density, seo_suggestions, error_percentage_words}}
 */
export function analyzeSeo(title, body) {
  const words = tokenize(body);
  const totalWords = words.length;
  const suggestions = [];

  // --- Keyword density (top content words) ---
  const freq = new Map();
  for (const w of words) {
    if (STOP_WORDS.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  const ranked = [...freq.entries()]
    .map(([word, count]) => ({
      word,
      count,
      density: totalWords ? +((count / totalWords) * 100).toFixed(2) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  if (ranked[0] && ranked[0].density > 4) {
    suggestions.push(
      `الكلمة «${ranked[0].word}» مكررة بكثافة ${ranked[0].density}% — حاول التنويع لتجنّب الحشو.`
    );
  }
  if (totalWords < 300) {
    suggestions.push('المقال قصير (أقل من 300 كلمة) — المقالات الأطول عادةً أفضل لمحركات البحث.');
  }

  // --- Title checks ---
  const titleLen = (title || '').trim().length;
  if (titleLen === 0) suggestions.push('أضف عنواناً للمقال.');
  else if (titleLen < 20) suggestions.push('العنوان قصير — يُفضّل بين 20 و60 حرفاً.');
  else if (titleLen > 60) suggestions.push('العنوان طويل (أكثر من 60 حرفاً) قد يُقتطع في نتائج البحث.');

  // Does the title contain the top keyword?
  if (ranked[0] && title && !normalize(title).includes(ranked[0].word)) {
    suggestions.push(`فكّر بإدراج الكلمة المفتاحية «${ranked[0].word}» في العنوان.`);
  }

  // --- Meta description suggestion (first ~155 chars of body) ---
  const metaSuggestion = (body || '').replace(/\s+/g, ' ').trim().slice(0, 155);
  suggestions.push(`اقتراح وصف ميتا (${metaSuggestion.length} حرف): «${metaSuggestion}…»`);

  // --- Simplified Arabic readability ---
  // Lower avg sentence length + lower avg word length => easier to read.
  const sents = sentences(body);
  const avgWordsPerSentence = sents.length ? totalWords / sents.length : 0;
  const avgWordLen = totalWords
    ? words.reduce((s, w) => s + w.length, 0) / totalWords
    : 0;
  // Map to a 0-100 "ease" score (higher = easier). Heuristic, Arabic-tuned-ish.
  let readability = 100 - (avgWordsPerSentence * 1.5 + avgWordLen * 5);
  readability = Math.max(0, Math.min(100, Math.round(readability)));
  if (avgWordsPerSentence > 25) {
    suggestions.push(
      `متوسط طول الجملة ${Math.round(avgWordsPerSentence)} كلمة — جُمل أقصر تحسّن القراءة.`
    );
  }

  return {
    readability_score: readability,
    keyword_density: ranked,
    seo_suggestions: suggestions,
    total_words: totalWords,
  };
}
