import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { transcribe, transcribeEnabled } from '../services/transcribeService.js';

const router = Router();

// Audio is held in memory and streamed straight to Deepgram (not saved to disk).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

// POST /api/transcribe  (multipart, field "audio")  -> { transcript }
router.post('/', requireAuth, upload.single('audio'), async (req, res) => {
  if (!transcribeEnabled()) {
    return res.status(503).json({ error: 'ميزة التفريغ الصوتي معطّلة (DEEPGRAM_API_KEY غير مُعد)' });
  }
  if (!req.file) return res.status(400).json({ error: 'لم يتم استلام أي تسجيل صوتي' });
  try {
    const transcript = await transcribe(req.file.buffer, req.file.mimetype);
    return res.json({ transcript });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
});

export default router;
