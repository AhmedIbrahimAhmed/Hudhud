// Moderation service — OpenAI omni-moderation (free endpoint).
// Returns 0-1 scores per category; we fold them into "shocking" and
// "inappropriate" percentages for the report.

const URL = 'https://api.openai.com/v1/moderations';

export function moderationEnabled() {
  return !!process.env.OPENAI_API_KEY;
}

// Categories we treat as "shocking" (graphic/violent) vs "inappropriate".
const SHOCKING = ['violence', 'violence/graphic'];
const INAPPROPRIATE = [
  'harassment',
  'harassment/threatening',
  'hate',
  'hate/threatening',
  'sexual',
  'sexual/minors',
  'self-harm',
  'self-harm/intent',
  'self-harm/instructions',
];

function maxScore(scores, keys) {
  let m = 0;
  for (const k of keys) {
    const v = scores?.[k];
    if (typeof v === 'number' && v > m) m = v;
  }
  return m;
}

/**
 * @param {string} text
 * @returns {Promise<{shocking:number, inappropriate:number, raw:object}|null>}
 *   percentages are 0-100; null if disabled.
 */
export async function moderate(text) {
  if (!moderationEnabled()) return null;
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
  });
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error('حساب OpenAI تجاوز حد الطلبات مؤقتاً — تم تخطّي فحص المحتوى هذه المرة.');
    }
    throw new Error(`فحص المحتوى غير متاح حالياً (رمز ${res.status}).`);
  }
  const data = await res.json();
  const scores = data?.results?.[0]?.category_scores || {};
  return {
    shocking: Math.round(maxScore(scores, SHOCKING) * 100),
    inappropriate: Math.round(maxScore(scores, INAPPROPRIATE) * 100),
    raw: scores,
  };
}
