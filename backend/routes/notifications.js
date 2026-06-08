import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/notifications - Get user's notifications
router.get('/', requireAuth, (req, res) => {
  const notifications = db
    .prepare(`
      SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `)
    .all(req.user.id);

  return res.json({ notifications });
});

// PUT /api/notifications/:id/read - Mark notification as read
router.put('/:id/read', requireAuth, (req, res) => {
  const { id } = req.params;

  const notification = db
    .prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?')
    .get(id, req.user.id);

  if (!notification) {
    return res.status(404).json({ error: 'الإشعار غير موجود' });
  }

  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);

  return res.json({ message: 'تم تحديث الإشعار' });
});

// PUT /api/notifications/read-all - Mark all notifications as read
router.put('/read-all', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);

  return res.json({ message: 'تم تحديث جميع الإشعارات' });
});

// GET /api/notifications/unread-count - Get count of unread notifications
router.get('/unread-count', requireAuth, (req, res) => {
  const count = db
    .prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0')
    .get(req.user.id);

  return res.json({ count: count.count });
});

export default router;
