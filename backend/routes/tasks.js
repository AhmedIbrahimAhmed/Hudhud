import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const PRIORITIES = new Set(['low', 'medium', 'high']);

// Helper function to increment user contribution for a date
async function incrementContribution(userId, date = null) {
  const today = date || new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const existing = await db.get(
    'SELECT id, count FROM contributions WHERE user_id = $1 AND date = $2',
    [userId, today]
  );
  if (existing) {
    await db.run(
      'UPDATE contributions SET count = count + 1, updated_at = now() WHERE id = $1',
      [existing.id]
    );
  } else {
    await db.run(
      'INSERT INTO contributions (user_id, date, count, updated_at) VALUES ($1, $2, 1, now())',
      [userId, today]
    );
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
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { date } = req.query;
    let rows;
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      rows = await db.all(
        `SELECT * FROM tasks WHERE user_id = $1 AND due_date = $2
         ORDER BY done ASC, (due_time = '') ASC, due_time ASC, id DESC`,
        [req.user.id, date]
      );
    } else {
      rows = await db.all(
        `SELECT * FROM tasks WHERE user_id = $1
         ORDER BY done ASC, due_date DESC, (due_time = '') ASC, due_time ASC, id DESC`,
        [req.user.id]
      );
    }
    return res.json({ tasks: rows });
  } catch (e) {
    next(e);
  }
});

// POST /api/tasks  { title, notes, due_date, priority, done }  -> create
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const t = sanitize(req.body);
    if (!t.title) return res.status(400).json({ error: 'عنوان المهمة مطلوب' });
    const inserted = await db.get(
      `INSERT INTO tasks (user_id, title, notes, due_date, due_time, priority, done)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [req.user.id, t.title, t.notes, t.due_date, t.due_time, t.priority, t.done]
    );
    const row = await db.get('SELECT * FROM tasks WHERE id = $1', [inserted.id]);
    await incrementContribution(req.user.id);
    return res.json({ task: row });
  } catch (e) {
    next(e);
  }
});

// PUT /api/tasks/:id  -> full update (title/notes/due_date/priority/done)
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await db.get(
      'SELECT id, team_task_id FROM tasks WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: 'المهمة غير موجودة' });
    if (existing.team_task_id) {
      return res.status(403).json({ error: 'مهمة فريق — تُدار من صفحة الفريق ولا يمكن تعديلها هنا' });
    }

    const t = sanitize(req.body);
    if (!t.title) return res.status(400).json({ error: 'عنوان المهمة مطلوب' });
    await db.run(
      `UPDATE tasks
       SET title = $1, notes = $2, due_date = $3, due_time = $4, priority = $5, done = $6, updated_at = now()
       WHERE id = $7 AND user_id = $8`,
      [t.title, t.notes, t.due_date, t.due_time, t.priority, t.done, req.params.id, req.user.id]
    );
    const row = await db.get('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    await incrementContribution(req.user.id);
    return res.json({ task: row });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/tasks/:id/toggle  -> flip the done flag (quick checkbox action)
router.patch('/:id/toggle', requireAuth, async (req, res, next) => {
  try {
    const row = await db.get(
      'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!row) return res.status(404).json({ error: 'المهمة غير موجودة' });
    if (row.team_task_id) {
      return res.status(403).json({ error: 'مهمة فريق — تُدار من صفحة الفريق' });
    }
    await db.run(
      'UPDATE tasks SET done = $1, updated_at = now() WHERE id = $2',
      [row.done ? 0 : 1, row.id]
    );
    const updated = await db.get('SELECT * FROM tasks WHERE id = $1', [row.id]);
    await incrementContribution(req.user.id);
    return res.json({ task: updated });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await db.get(
      'SELECT id, team_task_id FROM tasks WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: 'المهمة غير موجودة' });
    if (existing.team_task_id) {
      return res.status(403).json({ error: 'مهمة فريق — تُدار من صفحة الفريق' });
    }
    await db.run('DELETE FROM tasks WHERE id = $1', [existing.id]);
    await incrementContribution(req.user.id);
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
