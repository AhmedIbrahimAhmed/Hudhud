import { Router } from 'express';
import multer from 'multer';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadToCloudinary } from '../middleware/uploadCloudinary.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

// The user's single team (leader is stored as an accepted member too).
function getUserTeamId(userId) {
  const m = db
    .prepare("SELECT team_id FROM team_members WHERE user_id = ? AND status = 'accepted'")
    .get(userId);
  return m?.team_id || null;
}

const MESSAGE_SELECT = `
  SELECT m.id, m.body, m.file_url, m.file_name, m.file_type, m.created_at,
         m.sender_id, u.display_name, u.email, u.avatar_path
  FROM team_messages m
  JOIN users u ON u.id = m.sender_id
`;

// GET /api/team-messages - messages for the current user's team
router.get('/', requireAuth, (req, res) => {
  const teamId = getUserTeamId(req.user.id);
  if (!teamId) return res.json({ team: null, messages: [] });

  const team = db.prepare('SELECT id, name FROM teams WHERE id = ?').get(teamId);
  const messages = db
    .prepare(`${MESSAGE_SELECT} WHERE m.team_id = ? ORDER BY m.id ASC LIMIT 300`)
    .all(teamId);

  return res.json({ team, messages });
});

// GET /api/team-messages/unread-count - get unread message count for current user
router.get('/unread-count', requireAuth, (req, res) => {
  const teamId = getUserTeamId(req.user.id);
  if (!teamId) return res.json({ count: 0 });

  const count = db
    .prepare(`
      SELECT COUNT(*) as c
      FROM team_messages m
      WHERE m.team_id = ?
        AND m.sender_id != ?
        AND NOT EXISTS (
          SELECT 1 FROM team_message_reads r
          WHERE r.message_id = m.id AND r.user_id = ?
        )
    `)
    .get(teamId, req.user.id, req.user.id);

  return res.json({ count: count.c || 0 });
});

// POST /api/team-messages/mark-read - mark all messages as read for current user
router.post('/mark-read', requireAuth, (req, res) => {
  const teamId = getUserTeamId(req.user.id);
  if (!teamId) return res.json({ ok: true });

  // Get all unread messages for this user
  const unreadMessages = db
    .prepare(`
      SELECT m.id
      FROM team_messages m
      WHERE m.team_id = ?
        AND m.sender_id != ?
        AND NOT EXISTS (
          SELECT 1 FROM team_message_reads r
          WHERE r.message_id = m.id AND r.user_id = ?
        )
    `)
    .all(teamId, req.user.id, req.user.id);

  // Mark each as read
  unreadMessages.forEach(msg => {
    db.prepare(
      'INSERT OR IGNORE INTO team_message_reads (message_id, user_id, read_at) VALUES (?, ?, datetime(\'now\'))'
    ).run(msg.id, req.user.id);
  });

  return res.json({ ok: true, marked: unreadMessages.length });
});

// POST /api/team-messages - send a message (text and/or attachment)
router.post('/', requireAuth, (req, res) => {
  const teamId = getUserTeamId(req.user.id);
  if (!teamId) return res.status(403).json({ error: 'لست عضواً في أي فريق' });

  const { body, file_url, file_name, file_type } = req.body || {};
  const text = (body || '').trim();
  if (!text && !file_url) {
    return res.status(400).json({ error: 'الرسالة فارغة' });
  }

  const info = db
    .prepare(
      'INSERT INTO team_messages (team_id, sender_id, body, file_url, file_name, file_type) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(teamId, req.user.id, text, file_url || null, file_name || null, file_type || null);

  const message = db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(info.lastInsertRowid);
  return res.json({ message });
});

// POST /api/team-messages/upload - upload an attachment to Cloudinary
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'لم يتم اختيار ملف' });
    const result = await uploadToCloudinary(req.file.buffer, 'team-chat');
    return res.json({
      url: result.secure_url,
      name: req.file.originalname,
      type: req.file.mimetype,
    });
  } catch (e) {
    console.error('Team chat upload error:', e);
    return res.status(500).json({ error: e.message || 'فشل رفع الملف' });
  }
});

// GET /api/team-messages/:id/download - stream an attachment back with its
// original filename (Cloudinary stores it under a random public_id, so a direct
// link downloads with a meaningless name and no extension).
router.get('/:id/download', requireAuth, async (req, res) => {
  const teamId = getUserTeamId(req.user.id);
  if (!teamId) return res.status(403).json({ error: 'لست عضواً في أي فريق' });

  const msg = db
    .prepare('SELECT file_url, file_name, file_type FROM team_messages WHERE id = ? AND team_id = ?')
    .get(req.params.id, teamId);
  if (!msg || !msg.file_url) return res.status(404).json({ error: 'الملف غير موجود' });

  try {
    const upstream = await fetch(msg.file_url);
    if (!upstream.ok) return res.status(502).json({ error: 'تعذّر جلب الملف' });

    const name = msg.file_name || 'file';
    res.setHeader('Content-Type', msg.file_type || upstream.headers.get('content-type') || 'application/octet-stream');
    // RFC 5987 encoding so non-ASCII (Arabic) filenames survive.
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch (e) {
    console.error('Attachment download error:', e);
    return res.status(500).json({ error: 'تعذّر تنزيل الملف' });
  }
});

export default router;
