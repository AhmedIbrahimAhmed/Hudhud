import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listFreeModels, chat, openRouterEnabled } from '../services/openRouterService.js';
import { geminiChat, geminiEnabled, GEMINI_CHAT_ID } from '../services/geminiService.js';

const router = Router();

// Gemini appears as a reliable, always-available option at the top of the list.
const GEMINI_OPTION = { id: GEMINI_CHAT_ID, name: 'Gemini Flash-Lite (Google) — موثوق' };

// GET /api/chat/models  -> Gemini (if enabled) + free OpenRouter models
router.get('/models', requireAuth, async (_req, res) => {
  const models = [];
  if (geminiEnabled()) models.push(GEMINI_OPTION);

  if (!openRouterEnabled()) {
    const notice = models.length
      ? 'النماذج المجانية المتعددة معطّلة (OPENROUTER_API_KEY غير مُعد).'
      : 'صندوق المحادثة معطّل — لا يوجد أي مفتاح.';
    return res.json({ models, notice });
  }
  try {
    const free = await listFreeModels();
    return res.json({ models: [...models, ...free] });
  } catch (e) {
    // Still return Gemini even if OpenRouter listing fails.
    return res.json({ models, notice: `تعذّر جلب نماذج OpenRouter: ${e.message}` });
  }
});

// POST /api/chat  { model, messages: [{role, content}] }  -> { reply }
router.post('/', requireAuth, async (req, res) => {
  const { model, messages } = req.body || {};
  if (!model) return res.status(400).json({ error: 'اختر نموذجاً أولاً' });
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'لا توجد رسالة' });
  }
  // Only forward valid conversation roles upstream.
  const clean = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'system'))
    .map((m) => ({ role: m.role, content: String(m.content || '') }));

  try {
    const reply =
      model === GEMINI_CHAT_ID ? await geminiChat(clean) : await chat(model, clean);
    return res.json({ reply });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
});

export default router;
