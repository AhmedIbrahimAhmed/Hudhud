import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();

const BCRYPT_ROUNDS = 10;

// Shape of the user object exposed to the client (never includes password_hash).
function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    display_name: u.display_name,
    bio: u.bio,
    avatar_path: u.avatar_path,
  };
}

// Hash a plaintext password consistently across handlers.
function hashPassword(plain) {
  return bcrypt.hashSync(String(plain), BCRYPT_ROUNDS);
}

// Compare a plaintext password against a stored hash.
function verifyPassword(plain, hash) {
  return bcrypt.compareSync(String(plain ?? ''), hash);
}

// The standard auth payload returned to the client on login/register: a fresh
// token plus the public user shape. Centralizes token signing + response shape.
function authPayload(user) {
  return { token: signToken(user), user: publicUser(user) };
}

// POST /api/auth/register  { email, password, display_name }
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, display_name } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }
    const existing = await db.get('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) return res.status(409).json({ error: 'هذا البريد مسجّل مسبقاً' });

    const hash = hashPassword(password);
    const inserted = await db.get(
      'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id',
      [email, hash, display_name || email.split('@')[0]]
    );
    const user = await db.get('SELECT * FROM users WHERE id = $1', [inserted.id]);

    return res.json(authPayload(user));
  } catch (e) {
    next(e);
  }
});

// POST /api/auth/login  { email, password }
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const user = await db.get('SELECT * FROM users WHERE email = $1', [email]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'بريد إلكتروني أو كلمة مرور غير صحيحة' });
    }
    return res.json(authPayload(user));
  } catch (e) {
    next(e);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await db.get('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    return res.json({ user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

// POST /api/auth/change-password  { currentPassword, newPassword }
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'كلمة المرور الحالية والجديدة مطلوبتان' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' });
    }

    const user = await db.get('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    if (!verifyPassword(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    }

    const newHash = hashPassword(newPassword);
    await db.run('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);

    return res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (e) {
    next(e);
  }
});

export default router;
export { publicUser };
