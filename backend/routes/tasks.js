import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const PRIORITIES = new Set(['low', 'medium', 'high']);

// Helper function to increment user contribution for a date
function incrementContribution(userId, date = null) {
  const today = date || new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const existing = db.prepare('SELECT id, count FROM contributions WHERE user_id = ? AND date = ?').get(userId, today);
  if (existing) {
    db.prepare('UPDATE contributions SET count = count + 1, updated_at = datetime(\'now\') WHERE id = ?').run(existing.id);
  } else {
    db.prepare('INSERT INTO contributions (user_id, date, count, updated_at) VALUES (?, ?, 1, datetime(\'now\'))').run(userId, today);
  }
}

// Normalize and validate the writable fields shared by create/update.
function sanitize(body) {
  const title = String(body?.title ?? '').trim();
  const notes = String(body?.notes ?? '').trim();
  let due_date = String(body?.due_date ?? '').trim();
  // Accept only an empty string or a strict 'YYYY-MM-DD' day.
  if (due_date && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) due_date = '';
  let due_time = String(body?.due_time ?? '').trim();
  // Accept only an empty string or a strict 24h 'HH:MM' time.
  if (due_time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(due_time)) due_time = '';
  const priority = PRIORITIES.has(body?.priority) ? body.priority : 'medium';
  const done = body?.done ? 1 : 0;
  return { title, notes, due_date, due_time, priority, done };
}

// GET /api/tasks            -> all of the user's tasks (newest activity first)
// GET /api/tasks?date=YYYY-MM-DD  -> only tasks on that day
router.get('/', requireAuth, (req, res) => {
  const { date } = req.query;
  let rows;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    rows = db
      .prepare(
        `SELECT * FROM tasks WHERE user_id = ? AND due_date = ?
         ORDER BY done ASC, (due_time = '') ASC, due_time ASC, id DESC`
      )
      .all(req.user.id, date);
  } else {
    rows = db
      .prepare(
        `SELECT * FROM tasks WHERE user_id = ?
         ORDER BY done ASC, due_date DESC, (due_time = '') ASC, due_time ASC, id DESC`
      )
      .all(req.user.id);
  }
  return res.json({ tasks: rows });
});

// POST /api/tasks  { title, notes, due_date, priority, done }  -> create
router.post('/', requireAuth, (req, res) => {
  const t = sanitize(req.body);
  if (!t.title) return res.status(400).json({ error: 'عنوان المهمة مطلوب' });
  const info = db
    .prepare(
      `INSERT INTO tasks (user_id, title, notes, due_date, due_time, priority, done)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.user.id, t.title, t.notes, t.due_date, t.due_time, t.priority, t.done);
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid);
  incrementContribution(req.user.id);
  return res.json({ task: row });
});

// PUT /api/tasks/:id  -> full update (title/notes/due_date/priority/done)
router.put('/:id', requireAuth, (req, res) => {
  const existing = db
    .prepare('SELECT id, team_task_id FROM tasks WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'المهمة غير موجودة' });
  if (existing.team_task_id) {
    return res.status(403).json({ error: 'مهمة فريق — تُدار من صفحة الفريق ولا يمكن تعديلها هنا' });
  }

  const t = sanitize(req.body);
  if (!t.title) return res.status(400).json({ error: 'عنوان المهمة مطلوب' });
  db.prepare(
    `UPDATE tasks
     SET title = ?, notes = ?, due_date = ?, due_time = ?, priority = ?, done = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(t.title, t.notes, t.due_date, t.due_time, t.priority, t.done, req.params.id, req.user.id);
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  incrementContribution(req.user.id);
  return res.json({ task: row });
});

// PATCH /api/tasks/:id/toggle  -> flip the done flag (quick checkbox action)
router.patch('/:id/toggle', requireAuth, (req, res) => {
  const row = db
    .prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'المهمة غير موجودة' });
  if (row.team_task_id) {
    return res.status(403).json({ error: 'مهمة فريق — تُدار من صفحة الفريق' });
  }
  db.prepare(
    "UPDATE tasks SET done = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(row.done ? 0 : 1, row.id);
  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(row.id);
  incrementContribution(req.user.id);
  return res.json({ task: updated });
});

// DELETE /api/tasks/:id
router.delete('/:id', requireAuth, (req, res) => {
  const existing = db
    .prepare('SELECT id, team_task_id FROM tasks WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'المهمة غير موجودة' });
  if (existing.team_task_id) {
    return res.status(403).json({ error: 'مهمة فريق — تُدار من صفحة الفريق' });
  }
  db.prepare('DELETE FROM tasks WHERE id = ?').run(existing.id);
  incrementContribution(req.user.id);
  return res.json({ ok: true });
});

export default router;
