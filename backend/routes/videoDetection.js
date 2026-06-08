import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB for videos
});

// POST /api/defence/video/detection
//   multipart field "video" OR JSON body with "url"
//   -> forwards to Scam.ai API and returns result
router.post('/video/detection', requireAuth, upload.single('video'), async (req, res) => {
  try {
    const { url } = req.body || {};

    if (!req.file && !url) {
      return res.status(400).json({ error: 'ارفع فيديو أو أدخل رابط الفيديو' });
    }

    const apiKey = process.env.SCAMAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'SCAMAI_API_KEY غير مُعد في الخادم' });
    }

    let videoBuffer;
    let videoMimeType;
    let videoFilename;

    if (req.file) {
      videoBuffer = req.file.buffer;
      videoMimeType = req.file.mimetype;
      videoFilename = req.file.originalname;
    } else if (url) {
      // Download video from URL first
      try {
        const videoResponse = await fetch(url);
        if (!videoResponse.ok) {
          return res.status(400).json({ error: 'فشل تحميل الفيديو من الرابط المقدم' });
        }
        videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
        videoMimeType = videoResponse.headers.get('content-type') || 'video/mp4';
        videoFilename = 'video.mp4';
      } catch (e) {
        return res.status(400).json({ error: 'فشل تحميل الفيديو من الرابط المقدم' });
      }
    }

    // Create FormData to send to Scam.ai
    const formData = new FormData();
    formData.append('video', new Blob([videoBuffer], { type: videoMimeType }), videoFilename);

    // Forward to Scam.ai API
    const endpoint = process.env.SCAMAI_API_URL || 'https://api.scam.ai/api/defence/video/detection';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `فشل الاتصال بخدمة الكشف: ${errorText}` });
    }

    const result = await response.json();
    return res.json(result);
  } catch (e) {
    console.error('Video detection error:', e);
    return res.status(500).json({ error: e.message || 'خطأ في معالجة الفيديو' });
  }
});

export default router;
