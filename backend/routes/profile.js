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
router.put('/', requireAuth, async (req, res, next) => {
  try {
    const { display_name, bio } = req.body || {};
    await db.run('UPDATE users SET display_name = $1, bio = $2 WHERE id = $3', [
      display_name ?? '',
      bio ?? '',
      req.user.id,
    ]);
    const user = await db.get('SELECT * FROM users WHERE id = $1', [req.user.id]);
    return res.json({ user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

// POST /api/profile/avatar  (multipart, field "avatar")
router.post('/avatar', requireAuth, upload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'لم يتم رفع أي ملف' });
    const publicPath = `/uploads/${req.file.filename}`;
    await db.run('UPDATE users SET avatar_path = $1 WHERE id = $2', [publicPath, req.user.id]);
    const user = await db.get('SELECT * FROM users WHERE id = $1', [req.user.id]);
    return res.json({ user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

// GET /api/profile/contributions
router.get('/contributions', requireAuth, async (req, res, next) => {
  try {
    const rows = await db.all(
      'SELECT date, count FROM contributions WHERE user_id = $1 ORDER BY date ASC',
      [req.user.id]
    );
    return res.json({ contributions: rows });
  } catch (e) {
    next(e);
  }
});

export default router;
