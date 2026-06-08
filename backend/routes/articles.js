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
router.post('/', requireAuth, (req, res) => {
  const { title, body, cleaned_text, result, chat } = req.body || {};
  const info = db
    .prepare(
      `INSERT INTO articles (user_id, title, body, cleaned_text, result_json, chat_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user.id,
      title || '',
      body || '',
      cleaned_text || '',
      JSON.stringify(result || {}),
      JSON.stringify(Array.isArray(chat) ? chat : [])
    );
  const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(info.lastInsertRowid);
  return res.json({ article: row });
});

// PUT /api/articles/:id  { title, body, cleaned_text, result, chat }  -> update (autosave)
router.put('/:id', requireAuth, (req, res) => {
  const { title, body, cleaned_text, result, chat } = req.body || {};
  const existing = db
    .prepare('SELECT id FROM articles WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'المسودة غير موجودة' });
  db.prepare(
    `UPDATE articles
     SET title = ?, body = ?, cleaned_text = ?, result_json = ?, chat_json = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(
    title || '',
    body || '',
    cleaned_text || '',
    JSON.stringify(result || {}),
    JSON.stringify(Array.isArray(chat) ? chat : []),
    req.params.id,
    req.user.id
  );
  const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  return res.json({ article: row });
});

// GET /api/articles  -> list (latest first)
router.get('/', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, title, substr(body,1,120) AS preview, created_at, updated_at
       FROM articles WHERE user_id = ? ORDER BY updated_at DESC, id DESC`
    )
    .all(req.user.id);
  return res.json({ articles: rows });
});

// GET /api/articles/:id
router.get('/:id', requireAuth, (req, res) => {
  const row = db
    .prepare('SELECT * FROM articles WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'المقال غير موجود' });
  return res.json({ article: row });
});

// DELETE /api/articles/:id
router.delete('/:id', requireAuth, (req, res) => {
  const existing = db
    .prepare('SELECT id FROM articles WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'المسودة غير موجودة' });
  const info = db
    .prepare('DELETE FROM articles WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'المسودة غير موجودة' });
  return res.json({ ok: true });
});

export default router;
