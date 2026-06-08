// Gemini service — itemized Arabic grammar/spelling correction.
//
// We ask Gemini to return a JSON list of individual corrections (not a rewritten
// blob) so the frontend can show each one with an explanation and let the user
// approve or reject it.

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export function geminiEnabled() {
  return !!process.env.GEMINI_API_KEY;
}

const SYSTEM_INSTRUCTION = `أنت مدقّق لغوي عربي محترف. مهمتك تصحيح الأخطاء النحوية والإملائية فقط مع الحفاظ على المعنى الأصلي والأسلوب.
أعد النتيجة حصراً بصيغة JSON صالحة بالشكل التالي دون أي نص إضافي:
{"corrections":[{"original":"النص الخاطئ كما ورد","corrected":"النص المصحّح","explanation":"شرح موجز بالعربية لسبب التصحيح","category":"نحوي" أو "إملائي"}]}
- "original" يجب أن يكون مقتطفاً حرفياً موجوداً في النص المُدخل (لتحديد موضعه).
- لا تُدرج تغييرات أسلوبية أو سياسية، فقط نحو وإملاء.
- إذا لم تجد أخطاء، أعد {"corrections":[]}.`;

/**
 * @param {string} text
 * @returns {Promise<Array<{original,corrected,explanation,category}>>}
 */
export async function correctArabic(text) {
  if (!geminiEnabled()) return [];
  const model = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
  const url = `${API_BASE}/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed?.corrections) ? parsed.corrections : [];
  // Keep only well-formed, applicable items.
  return list
    .filter((c) => c && c.original && c.corrected && c.original !== c.corrected)
    .map((c) => ({
      original: String(c.original),
      corrected: String(c.corrected),
      explanation: String(c.explanation || 'تصحيح لغوي'),
      category: c.category === 'إملائي' ? 'إملائي' : 'نحوي',
    }));
}

const ANALYZE_INSTRUCTION = `أنت مساعد تحرير صحفي عربي. ستحصل على عنوان ونص مقال. حلّلهما وأعد JSON صالحاً فقط دون أي نص إضافي بالشكل:
{
  "corrections": [
    {"field": "title" أو "body", "original": "المقطع الخاطئ كما ورد حرفياً", "corrected": "المقطع المصحّح", "explanation": "شرح موجز بالعربية", "category": "نحوي" أو "إملائي"}
  ],
  "moderation": {
    "shocking": رقم 0-100,
    "inappropriate": رقم 0-100,
    "shocking_reason": "سبب موجز بالعربية لتقييم المحتوى الصادم",
    "inappropriate_reason": "سبب موجز بالعربية لتقييم المحتوى المخل"
  }
}
قواعد:
- corrections: أخطاء نحوية وإملائية فقط (لا تغييرات سياسية أو أسلوبية). "original" يجب أن يكون مقتطفاً حرفياً موجوداً في العنوان أو النص لتحديد موضعه، مع تحديد الحقل الصحيح في "field".
- shocking = نسبة المحتوى الصادم/العنيف/المصوّر بشكل دموي. inappropriate = نسبة المحتوى المخل (كراهية، تحرّش، جنسي، إيذاء). اذكر سبباً موجزاً وواقعياً لكل تقييم.
- إن لم توجد أخطاء أعد "corrections": [].`;

/**
 * Single combined Gemini call: grammar/spelling corrections (title + body) AND
 * content moderation with reasons. Replaces multiple separate calls.
 * @returns {Promise<{corrections:Array, moderation:object}>}
 */
export async function analyzeArticle(title, body) {
  if (!geminiEnabled()) return { corrections: [], moderation: null };
  const model = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
  const url = `${API_BASE}/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const userText = `العنوان: ${title || '(فارغ)'}\n\nالنص: ${body || '(فارغ)'}`;
  const reqBody = {
    systemInstruction: { parts: [{ text: ANALYZE_INSTRUCTION }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini error ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  let parsed;
  try {
    parsed = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
  } catch {
    return { corrections: [], moderation: null };
  }

  const corrections = (Array.isArray(parsed?.corrections) ? parsed.corrections : [])
    .filter((c) => c && c.original && c.corrected && c.original !== c.corrected)
    .map((c) => ({
      field: c.field === 'title' ? 'title' : 'body',
      original: String(c.original),
      corrected: String(c.corrected),
      explanation: String(c.explanation || 'تصحيح لغوي'),
      category: c.category === 'إملائي' ? 'إملائي' : 'نحوي',
    }));

  let moderation = null;
  if (parsed?.moderation) {
    const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
    moderation = {
      shocking: clamp(parsed.moderation.shocking),
      inappropriate: clamp(parsed.moderation.inappropriate),
      shocking_reason: String(parsed.moderation.shocking_reason || ''),
      inappropriate_reason: String(parsed.moderation.inappropriate_reason || ''),
    };
  }

  return { corrections, moderation };
}

/**
 * Dedicated moderation call with reasons AND fixable issues (suggested edits for
 * shocking/inappropriate passages).
 * @returns {Promise<{shocking, inappropriate, shocking_reason, inappropriate_reason, issues:Array}|null>}
 */
export async function geminiModerate(title, body) {
  if (!geminiEnabled()) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
  const url = `${API_BASE}/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const instruction = `قيّم العنوان والنص للنشر الصحفي وأعد JSON فقط بالشكل:
{
  "shocking": رقم 0-100,
  "inappropriate": رقم 0-100,
  "shocking_reason": "سبب موجز بالعربية",
  "inappropriate_reason": "سبب موجز بالعربية",
  "issues": [
    {"field": "title" أو "body", "original": "المقطع المخالف كما ورد حرفياً", "corrected": "بديل لائق مقترح (أو اتركه فارغاً للحذف)", "explanation": "سبب التعديل بالعربية", "category": "محتوى مخل" أو "محتوى صادم"}
  ]
}
- shocking = نسبة المحتوى الصادم/العنيف/المصوّر بشكل دموي. inappropriate = نسبة المحتوى المخل (كراهية، تحرّش، جنسي، ألفاظ بذيئة، إيذاء).
- issues = المقاطع التي يُفضّل تعديلها أو حذفها، مع اقتراح بديل لائق للنشر. "original" يجب أن يكون مقتطفاً حرفياً من العنوان أو النص لتحديد موضعه.
- إن لم توجد مخالفات أعد "issues": []. أعد JSON فقط.`;

  const userText = `العنوان: ${title || '(فارغ)'}\n\nالنص: ${body || '(فارغ)'}`;
  const reqBody = {
    systemInstruction: { parts: [{ text: instruction }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody),
  });
  if (!res.ok) throw new Error(`Gemini moderation error ${res.status}`);
  const data = await res.json();
  try {
    const parsed = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
    const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
    const issues = (Array.isArray(parsed.issues) ? parsed.issues : [])
      .filter((i) => i && i.original)
      .map((i) => ({
        field: i.field === 'title' ? 'title' : 'body',
        original: String(i.original),
        corrected: String(i.corrected ?? ''),
        explanation: String(i.explanation || 'محتوى يُفضّل تعديله قبل النشر'),
        category: i.category === 'محتوى صادم' ? 'محتوى صادم' : 'محتوى مخل',
      }));
    return {
      shocking: clamp(parsed.shocking),
      inappropriate: clamp(parsed.inappropriate),
      shocking_reason: String(parsed.shocking_reason || ''),
      inappropriate_reason: String(parsed.inappropriate_reason || ''),
      issues,
    };
  } catch {
    return { shocking: 0, inappropriate: 0, shocking_reason: '', inappropriate_reason: '', issues: [] };
  }
}

// The synthetic model id used in the chat dropdown for Gemini.
export const GEMINI_CHAT_ID = 'gemini:flash-lite';

/**
 * Chat with Gemini. Reliable fallback when free OpenRouter models are busy.
 * @param {Array<{role, content}>} messages  roles: user | assistant | system
 * @returns {Promise<string>}
 */
export async function geminiChat(messages) {
  if (!geminiEnabled()) throw new Error('GEMINI_API_KEY غير مُعد');
  const model = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
  const url = `${API_BASE}/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  // Gemini uses role "model" for the assistant; system goes to systemInstruction.
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const contents = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content || '') }],
    }));

  const body = {
    contents,
    generationConfig: { temperature: 0.7 },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini chat error ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
