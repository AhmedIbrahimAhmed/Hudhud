import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { processArticle } from '../services/processArticle.js';

const router = Router();

// POST /api/articles/process  { title, body }  -> { corrections, stats, notices }
router.post('/process', requireAuth, async (req, res) => {
  const { title, body } = req.body || {};
  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'نص المقال فارغ' });
  }
  try {
    const result = await processArticle(title || '', String(body));
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/articles  { title, body, cleaned_text, result, chat }  -> save
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { title, body, cleaned_text, result, chat } = req.body || {};
    const inserted = await db.get(
      `INSERT INTO articles (user_id, title, body, cleaned_text, result_json, chat_json)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        req.user.id,
        title || '',
        body || '',
        cleaned_text || '',
        JSON.stringify(result || {}),
        JSON.stringify(Array.isArray(chat) ? chat : []),
      ]
    );
    const row = await db.get('SELECT * FROM articles WHERE id = $1', [inserted.id]);
    return res.json({ article: row });
  } catch (e) {
    next(e);
  }
});

// PUT /api/articles/:id  { title, body, cleaned_text, result, chat }  -> update (autosave)
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { title, body, cleaned_text, result, chat } = req.body || {};
    const existing = await db.get(
      'SELECT id FROM articles WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: 'المسودة غير موجودة' });
    await db.run(
      `UPDATE articles
       SET title = $1, body = $2, cleaned_text = $3, result_json = $4, chat_json = $5, updated_at = now()
       WHERE id = $6 AND user_id = $7`,
      [
        title || '',
        body || '',
        cleaned_text || '',
        JSON.stringify(result || {}),
        JSON.stringify(Array.isArray(chat) ? chat : []),
        req.params.id,
        req.user.id,
      ]
    );
    const row = await db.get('SELECT * FROM articles WHERE id = $1', [req.params.id]);
    return res.json({ article: row });
  } catch (e) {
    next(e);
  }
});

// GET /api/articles  -> list (latest first)
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const rows = await db.all(
      `SELECT id, title, substr(body,1,120) AS preview, created_at, updated_at
       FROM articles WHERE user_id = $1 ORDER BY updated_at DESC, id DESC`,
      [req.user.id]
    );
    return res.json({ articles: rows });
  } catch (e) {
    next(e);
  }
});

// GET /api/articles/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const row = await db.get(
      'SELECT * FROM articles WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!row) return res.status(404).json({ error: 'المقال غير موجود' });
    return res.json({ article: row });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/articles/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await db.get(
      'SELECT id FROM articles WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: 'المسودة غير موجودة' });
    const info = await db.run(
      'DELETE FROM articles WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (info.changes === 0) return res.status(404).json({ error: 'المسودة غير موجودة' });
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
