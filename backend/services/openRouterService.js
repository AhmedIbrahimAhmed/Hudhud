// OpenRouter service — powers the multi-model chat box.
//
// One API key exposes many models. We expose the FREE ones (id ending in
// ":free") to the dropdown, and proxy chat completions to the selected model.

const BASE = 'https://openrouter.ai/api/v1';

export function openRouterEnabled() {
  return !!process.env.OPENROUTER_API_KEY;
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    // Optional attribution headers recommended by OpenRouter.
    'HTTP-Referer': 'http://localhost',
    'X-Title': 'Hudhud Toolkit',
  };
}

/**
 * List free models for the dropdown.
 * @returns {Promise<Array<{id, name}>>}
 */
export async function listFreeModels() {
  if (!openRouterEnabled()) return [];
  const res = await fetch(`${BASE}/models`, { headers: headers() });
  if (!res.ok) throw new Error(`OpenRouter models error ${res.status}`);
  const data = await res.json();
  const models = Array.isArray(data?.data) ? data.data : [];
  return models
    .filter((m) => typeof m.id === 'string' && m.id.endsWith(':free'))
    .map((m) => ({ id: m.id, name: m.name || m.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Send a chat completion to the chosen model.
 * @param {string} model  an OpenRouter model id
 * @param {Array<{role, content}>} messages
 * @returns {Promise<string>} assistant reply text
 */
export async function chat(model, messages) {
  if (!openRouterEnabled()) throw new Error('OPENROUTER_API_KEY غير مُعد');
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 429) {
      // Free models share an upstream pool that throttles frequently.
      let retry = '';
      try {
        const meta = JSON.parse(detail)?.error?.metadata;
        if (meta?.retry_after_seconds) retry = ` (أعد المحاولة بعد ~${Math.ceil(meta.retry_after_seconds)} ثانية)`;
      } catch {
        /* ignore parse errors */
      }
      throw new Error(
        `النموذج المجاني مزدحم حالياً${retry}. جرّب نموذجاً آخر من القائمة أو انتظر قليلاً.`
      );
    }
    throw new Error(`OpenRouter chat error ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}
