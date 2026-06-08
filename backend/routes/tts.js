import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { synthesize, listArabicVoices } from '../services/ttsService.js';

const router = Router();

// GET /api/tts/voices  -> curated Arabic neural voices
router.get('/voices', requireAuth, (_req, res) => {
  res.json({ voices: listArabicVoices() });
});

// POST /api/tts  { text, voice }  -> mp3 audio
router.post('/', requireAuth, async (req, res) => {
  const { text, voice, rate } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'النص فارغ' });
  }
  try {
    const audio = await synthesize(String(text), voice, rate);
    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Disposition', 'inline; filename="speech.mp3"');
    return res.send(audio);
  } catch (e) {
    return res.status(502).json({ error: `تعذّر توليد الصوت: ${e.message}` });
  }
});

export default router;
