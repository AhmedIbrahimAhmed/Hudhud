import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import {
  uploadToHost,
  reverseSearch,
  aiDetect,
  reverseEnabled,
  aiDetectEnabled,
} from '../services/imageForensicsService.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

// POST /api/image/analyze
//   multipart field "image"  OR  json { url }
//   -> { imageUrl, reverse, ai, notices }
router.post('/analyze', requireAuth, upload.single('image'), async (req, res) => {
  const notices = [];
  let imageUrl = req.body?.url?.trim();

  try {
    // Obtain a public URL — host the uploaded file, or use the provided URL.
    if (req.file) {
      imageUrl = await uploadToHost(req.file.buffer, req.file.originalname, req.file.mimetype);
    }
    if (!imageUrl) {
      return res.status(400).json({ error: 'ارفع صورة أو الصق رابط صورة' });
    }

    // Run both checks in parallel; each degrades independently.
    const [reverse, ai] = await Promise.all([
      reverseEnabled()
        ? reverseSearch(imageUrl).catch((e) => {
            notices.push(e.message);
            return null;
          })
        : Promise.resolve(notices.push('البحث العكسي معطّل (SERPER_API_KEY غير مُعد)') && null),
      aiDetectEnabled()
        ? aiDetect({
            url: req.file ? undefined : imageUrl, // Only pass URL if no file uploaded
            buffer: req.file?.buffer,
            filename: req.file?.originalname,
            mimetype: req.file?.mimetype,
          }).catch((e) => {
            notices.push(e.message);
            return null;
          })
        : Promise.resolve(notices.push('كشف الذكاء الاصطناعي معطّل') && null),
    ]);

    return res.json({ imageUrl, reverse, ai, notices });
  } catch (e) {
    console.error('Image analysis error:', e);
    return res.status(500).json({ error: e.message });
  }
});

export default router;
