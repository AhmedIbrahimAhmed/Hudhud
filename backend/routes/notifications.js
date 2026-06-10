import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/notifications - Get user's notifications
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const notifications = await db.all(
      `
      SELECT * FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `,
      [req.user.id]
    );

    return res.json({ notifications });
  } catch (e) {
    next(e);
  }
});

// PUT /api/notifications/:id/read - Mark notification as read
router.put('/:id/read', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const notification = await db.get(
      'SELECT * FROM notifications WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (!notification) {
      return res.status(404).json({ error: 'الإشعار غير موجود' });
    }

    await db.run('UPDATE notifications SET read = 1 WHERE id = $1', [id]);

    return res.json({ message: 'تم تحديث الإشعار' });
  } catch (e) {
    next(e);
  }
});

// PUT /api/notifications/read-all - Mark all notifications as read
router.put('/read-all', requireAuth, async (req, res, next) => {
  try {
    await db.run('UPDATE notifications SET read = 1 WHERE user_id = $1', [req.user.id]);

    return res.json({ message: 'تم تحديث جميع الإشعارات' });
  } catch (e) {
    next(e);
  }
});

// GET /api/notifications/unread-count - Get count of unread notifications
router.get('/unread-count', requireAuth, async (req, res, next) => {
  try {
    const count = await db.get(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = 0',
      [req.user.id]
    );

    return res.json({ count: Number(count.count) });
  } catch (e) {
    next(e);
  }
});

export default router;
