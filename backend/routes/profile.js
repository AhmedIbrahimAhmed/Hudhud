import { Router } from 'express';
import multer from 'multer';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { publicUser } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadDir = join(__dirname, '..', 'uploads');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase() || '.png';
    cb(null, `avatar_${req.user.id}_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('يُسمح بالصور فقط'));
  },
});

const router = Router();

// PUT /api/profile  { display_name, bio }
router.put('/', requireAuth, (req, res) => {
  const { display_name, bio } = req.body || {};
  db.prepare('UPDATE users SET display_name = ?, bio = ? WHERE id = ?').run(
    display_name ?? '',
    bio ?? '',
    req.user.id
  );
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  return res.json({ user: publicUser(user) });
});

// POST /api/profile/avatar  (multipart, field "avatar")
router.post('/avatar', requireAuth, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لم يتم رفع أي ملف' });
  const publicPath = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(publicPath, req.user.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  return res.json({ user: publicUser(user) });
});

// GET /api/profile/contributions
router.get('/contributions', requireAuth, (req, res) => {
  const rows = db.prepare(
    'SELECT date, count FROM contributions WHERE user_id = ? ORDER BY date ASC'
  ).all(req.user.id);
  return res.json({ contributions: rows });
});

export default router;
