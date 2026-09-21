const jwt = require('jsonwebtoken');
const pool = require('../db');

const COOKIE = 'token';
const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 أيام

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET مطلوب (16 حرفًا على الأقل)');
    }
    return 'dev-only-secret-change-me';
  }
  return s;
}

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, secret(), { expiresIn: '7d' });
}

function setAuthCookie(res, user) {
  res.cookie(COOKIE, signToken(user), {
    httpOnly: true,                                   // لا يقرأه JavaScript
    sameSite: 'lax',                                  // حماية من CSRF
    secure: process.env.NODE_ENV === 'production',    // HTTPS فقط في الإنتاج
    maxAge: MAX_AGE,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE);
}

/** يقرأ المستخدم إن وُجد (لا يرفض الزوار) */
async function attachUser(req, _res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, secret());
    const { rows } = await pool.query(
      'SELECT id, username, phone, email, role FROM users WHERE id = $1',
      [payload.id]
    );
    if (rows[0]) req.user = rows[0];
  } catch (_) { /* توكن غير صالح: نتجاهله */ }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'يجب تسجيل الدخول أولًا' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'يجب تسجيل الدخول أولًا' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'هذه الصفحة للأدمن فقط' });
  next();
}

module.exports = { attachUser, requireAuth, requireAdmin, setAuthCookie, clearAuthCookie };
