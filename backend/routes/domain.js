import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { checkUrl, extractUrls } from '../services/domainSafetyService.js';

const router = Router();

// POST /api/domain/check  { input }  -> { results: [...] }
// `input` may be a single URL or free text containing links.
router.post('/check', requireAuth, async (req, res) => {
  const { input } = req.body || {};
  if (!input || !String(input).trim()) {
    return res.status(400).json({ error: 'أدخل رابطاً أو نصاً يحتوي على روابط' });
  }
  // Extract links; if none look like URLs, treat the whole input as one.
  let urls = extractUrls(input, 10);
  if (urls.length === 0) urls = [String(input).trim()];

  try {
    const results = await Promise.all(urls.map((u) => checkUrl(u)));
    return res.json({ results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
