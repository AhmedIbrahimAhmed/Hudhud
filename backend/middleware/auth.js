import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Single source of truth for token lifetime (12 hours).
export const TOKEN_TTL = '12h';

// Sign a JWT for a user. Payload kept minimal & stable (id, email) so existing
// routes that read req.user.id / req.user.email keep working.
export function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: TOKEN_TTL });
}

// Express middleware: requires a valid "Authorization: Bearer <token>" header.
// Returns clean Arabic 401 JSON on missing/invalid/expired tokens. Expired
// tokens get an `expired: true` flag so the frontend can react specifically.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'مطلوب تسجيل الدخول' });
  }
  try {
    const payload = jwt.verify(token, SECRET);
    // Attach a normalized user object; id is always present and consistent.
    req.user = { id: payload.id, email: payload.email };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res
        .status(401)
        .json({ error: 'انتهت صلاحية الجلسة، الرجاء تسجيل الدخول من جديد', expired: true });
    }
    return res.status(401).json({ error: 'جلسة غير صالحة، الرجاء تسجيل الدخول من جديد' });
  }
}
