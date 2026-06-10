import { Router } from 'express';
import multer from 'multer';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadToCloudinary } from '../middleware/uploadCloudinary.js';

const router = Router();

const storage = multer.memoryStorage();

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

// Allowed archive types — browsers report several different MIME strings for
// zip/rar/7z, so we also accept by file extension as a fallback.
const ARCHIVE_MIMES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
  'multipart/x-zip',
  'application/vnd.rar',
  'application/x-rar-compressed',
  'application/x-rar',
  'application/x-7z-compressed',
  'application/octet-stream', // some browsers send this for .zip/.rar
]);
const ARCHIVE_EXT = /\.(zip|rar|7z)$/i;

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB (archives can be large)
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype.startsWith('image/') ||
      file.mimetype === 'application/pdf' ||
      ARCHIVE_MIMES.has(file.mimetype) ||
      ARCHIVE_EXT.test(file.originalname || '');
    if (ok) {
      cb(null, true);
    } else {
      cb(new Error('يُسمح بالصور وملفات PDF والملفات المضغوطة (ZIP, RAR) فقط'));
    }
  },
});

// POST /api/team-tasks - Assign a task to a team member
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { team_id, assigned_to, title, description, due_date } = req.body || {};

    if (!team_id || !assigned_to || !title || !title.trim()) {
      return res.status(400).json({ error: 'الفريق والمستخدم المُسند إليه والعنوان مطلوبة' });
    }

    // Accept only an empty string or a strict 24h 'HH:MM' time.
    const due_time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(req.body?.due_time || ''))
      ? req.body.due_time
      : '';

    // Verify user is the leader of the team
    const team = await db.get('SELECT * FROM teams WHERE id = $1 AND leader_id = $2', [team_id, req.user.id]);
    if (!team) {
      return res.status(403).json({ error: 'فقط قائد الفريق يمكنه تعيين المهام' });
    }

    // Verify the assigned user is a member of the team
    const member = await db.get(
      "SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2 AND status = 'accepted'",
      [team_id, assigned_to]
    );

    if (!member) {
      return res.status(404).json({ error: 'المستخدم ليس عضواً في هذا الفريق' });
    }

    const inserted = await db.get(
      'INSERT INTO team_tasks (team_id, assigned_to, assigned_by, title, description, due_date, due_time) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [team_id, assigned_to, req.user.id, title.trim(), description || '', due_date || '', due_time]
    );
    const newTaskId = inserted.id;

    // Mirror the task into the assignee's personal task list/calendar so it
    // shows up under "مهامي والتقويم" too. Linked back via team_task_id.
    const personalDue = /^\d{4}-\d{2}-\d{2}$/.test(String(due_date || '').slice(0, 10))
      ? String(due_date).slice(0, 10)
      : '';
    await db.run(
      `INSERT INTO tasks (user_id, title, notes, due_date, due_time, priority, done, team_task_id)
       VALUES ($1, $2, $3, $4, $5, 'medium', 0, $6)`,
      [assigned_to, title.trim(), description || '', personalDue, due_time, newTaskId]
    );

    // Log contributions for both leader (assigning) and assignee (receiving)
    await incrementContribution(req.user.id); // Leader contribution
    await incrementContribution(assigned_to); // Assignee contribution

    // Create notification for the assigned user
    await db.run(
      'INSERT INTO notifications (user_id, type, message, metadata) VALUES ($1, $2, $3, $4)',
      [
        assigned_to,
        'task_assigned',
        `تم تعيين مهمة جديدة لك: ${title.trim()}`,
        JSON.stringify({ team_id, task_id: newTaskId, task_title: title.trim(), from_user_id: req.user.id }),
      ]
    );

    const task = await db.get('SELECT * FROM team_tasks WHERE id = $1', [newTaskId]);
    return res.json({ task });
  } catch (e) {
    next(e);
  }
});

// GET /api/team-tasks/team/:teamId - Get all tasks for a team
router.get('/team/:teamId', requireAuth, async (req, res, next) => {
  try {
    const { teamId } = req.params;

    // Verify user is a member of the team
    const membership = await db.get(
      "SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2 AND status = 'accepted'",
      [teamId, req.user.id]
    );

    if (!membership) {
      return res.status(403).json({ error: 'غير مصرح' });
    }

    const tasks = await db.all(
      `
      SELECT tt.*,
             u1.display_name as assigned_to_name,
             u2.display_name as assigned_by_name
      FROM team_tasks tt
      INNER JOIN users u1 ON tt.assigned_to = u1.id
      INNER JOIN users u2 ON tt.assigned_by = u2.id
      WHERE tt.team_id = $1
      ORDER BY tt.created_at DESC
    `,
      [teamId]
    );

    return res.json({ tasks });
  } catch (e) {
    next(e);
  }
});

// GET /api/team-tasks/my - Get tasks assigned to current user
router.get('/my', requireAuth, async (req, res, next) => {
  try {
    const tasks = await db.all(
      `
      SELECT tt.*, t.name as team_name, u.display_name as assigned_by_name
      FROM team_tasks tt
      INNER JOIN teams t ON tt.team_id = t.id
      INNER JOIN users u ON tt.assigned_by = u.id
      WHERE tt.assigned_to = $1
      ORDER BY tt.created_at DESC
    `,
      [req.user.id]
    );

    return res.json({ tasks });
  } catch (e) {
    next(e);
  }
});

// PUT /api/team-tasks/:id/complete - Mark task as complete with file upload
router.put('/:id/complete', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { file_url, file_name, file_type } = req.body || {};

    const task = await db.get(
      'SELECT * FROM team_tasks WHERE id = $1 AND assigned_to = $2',
      [id, req.user.id]
    );

    if (!task) {
      return res.status(404).json({ error: 'المهمة غير موجودة أو غير مخصصة لك' });
    }

    if (task.status === 'completed') {
      return res.status(400).json({ error: 'المهمة مكتملة بالفعل' });
    }

    await db.run(
      'UPDATE team_tasks SET status = $1, file_url = $2, file_name = $3, file_type = $4, updated_at = $5 WHERE id = $6',
      ['completed', file_url || null, file_name || null, file_type || null, new Date().toISOString(), id]
    );

    // Keep the mirrored personal task in sync.
    await db.run("UPDATE tasks SET done = 1, updated_at = now() WHERE team_task_id = $1", [id]);

    // Log contribution for completing the task
    await incrementContribution(req.user.id);

    // Notify the task assigner (leader)
    await db.run(
      'INSERT INTO notifications (user_id, type, message, metadata) VALUES ($1, $2, $3, $4)',
      [
        task.assigned_by,
        'task_completed',
        `أكمل ${req.user.display_name || req.user.email} المهمة: ${task.title}`,
        JSON.stringify({ team_id: task.team_id, task_id: id, task_title: task.title, completed_by: req.user.id }),
      ]
    );

    const updatedTask = await db.get('SELECT * FROM team_tasks WHERE id = $1', [id]);
    return res.json({ task: updatedTask });
  } catch (e) {
    next(e);
  }
});

// PUT /api/team-tasks/:id - Update task status and comments (assigned member only)
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, comments } = req.body || {};

    const task = await db.get('SELECT * FROM team_tasks WHERE id = $1', [id]);
    if (!task) {
      return res.status(404).json({ error: 'المهمة غير موجودة' });
    }

    // Only the assigned member can update task status and comments
    if (task.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'فقط العضو المُسند إليه المهمة يمكنه تحديثها' });
    }

    const newStatus = status || task.status;
    await db.run(
      'UPDATE team_tasks SET status = $1, comments = $2, updated_at = $3 WHERE id = $4',
      [newStatus, comments || '', new Date().toISOString(), id]
    );

    // Keep the mirrored personal task's done flag in sync with the status.
    await db.run("UPDATE tasks SET done = $1, updated_at = $2 WHERE team_task_id = $3", [
      newStatus === 'completed' ? 1 : 0,
      new Date().toISOString(),
      id,
    ]);

    // Log contribution for updating task status/comments
    await incrementContribution(req.user.id);

    return res.json({ message: 'تم تحديث المهمة' });
  } catch (e) {
    next(e);
  }
});

// PUT /api/team-tasks/:id/details - Edit task fields (leader only)
router.put('/:id/details', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const task = await db.get(
      'SELECT tt.*, t.leader_id FROM team_tasks tt INNER JOIN teams t ON tt.team_id = t.id WHERE tt.id = $1',
      [id]
    );
    if (!task) {
      return res.status(404).json({ error: 'المهمة غير موجودة' });
    }
    if (task.leader_id !== req.user.id) {
      return res.status(403).json({ error: 'فقط قائد الفريق يمكنه تعديل المهمة' });
    }

    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'عنوان المهمة مطلوب' });
    const description = String(req.body?.description || '');
    const due_date = String(req.body?.due_date || '');
    const due_time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(req.body?.due_time || ''))
      ? req.body.due_time
      : '';

    await db.run(
      'UPDATE team_tasks SET title = $1, description = $2, due_date = $3, due_time = $4, updated_at = $5 WHERE id = $6',
      [title, description, due_date, due_time, new Date().toISOString(), id]
    );

    // Keep the mirrored personal task in sync.
    const personalDue = /^\d{4}-\d{2}-\d{2}$/.test(String(due_date).slice(0, 10))
      ? String(due_date).slice(0, 10)
      : '';
    await db.run(
      "UPDATE tasks SET title = $1, notes = $2, due_date = $3, due_time = $4, updated_at = now() WHERE team_task_id = $5",
      [title, description, personalDue, due_time, id]
    );

    // Log contribution for editing task details
    await incrementContribution(req.user.id);

    const updated = await db.get('SELECT * FROM team_tasks WHERE id = $1', [id]);
    return res.json({ task: updated });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/team-tasks/:id - Delete a task (leader only)
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const task = await db.get(
      'SELECT tt.*, t.leader_id FROM team_tasks tt INNER JOIN teams t ON tt.team_id = t.id WHERE tt.id = $1',
      [id]
    );

    if (!task) {
      return res.status(404).json({ error: 'المهمة غير موجودة' });
    }

    if (task.leader_id !== req.user.id) {
      return res.status(403).json({ error: 'فقط قائد الفريق يمكنه حذف المهام' });
    }

    const info = await db.run('DELETE FROM team_tasks WHERE id = $1', [id]);

    if (info.changes === 0) {
      return res.status(404).json({ error: 'المهمة غير موجودة' });
    }

    // Log contribution for deleting the task
    await incrementContribution(req.user.id);

    // Remove the mirrored personal task as well.
    await db.run('DELETE FROM tasks WHERE team_task_id = $1', [id]);

    return res.json({ message: 'تم حذف المهمة بنجاح' });
  } catch (e) {
    next(e);
  }
});

// POST /api/team-tasks/upload - Upload file to Cloudinary
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'لم يتم رفع أي ملف' });
  }

  try {
    const result = await uploadToCloudinary(req.file.buffer);
    return res.json({
      url: result.secure_url,
      public_id: result.public_id,
      name: req.file.originalname,
      type: req.file.mimetype,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'فشل رفع الملف' });
  }
});

// GET /api/team-tasks/:id/download - stream a task attachment with its original
// filename (Cloudinary serves it under a random public_id, so a direct link
// downloads with a meaningless name and no extension).
router.get('/:id/download', requireAuth, async (req, res) => {
  const task = await db.get('SELECT * FROM team_tasks WHERE id = $1', [req.params.id]);
  if (!task || !task.file_url) {
    return res.status(404).json({ error: 'الملف غير موجود' });
  }

  // Only members of the task's team may download the attachment.
  const membership = await db.get(
    "SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2 AND status = 'accepted'",
    [task.team_id, req.user.id]
  );
  if (!membership) {
    return res.status(403).json({ error: 'غير مصرح' });
  }

  try {
    const upstream = await fetch(task.file_url);
    if (!upstream.ok) return res.status(502).json({ error: 'تعذّر جلب الملف' });

    const name = task.file_name || 'file';
    res.setHeader('Content-Type', task.file_type || upstream.headers.get('content-type') || 'application/octet-stream');
    // RFC 5987 encoding so non-ASCII (Arabic) filenames survive.
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch (e) {
    console.error('Task attachment download error:', e);
    return res.status(500).json({ error: 'تعذّر تنزيل الملف' });
  }
});

export default router;
