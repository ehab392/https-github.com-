const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { setAuthCookie, clearAuthCookie } = require('../middleware/auth');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\s-]{7,20}$/;

const publicUser = (u) => ({ id: u.id, username: u.username, email: u.email, phone: u.phone, role: u.role });

// التسجيل
router.post('/register', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const phone = String(req.body.phone || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (username.length < 2 || username.length > 60) return res.status(400).json({ error: 'اسم المستخدم غير صالح' });
    if (!PHONE_RE.test(phone)) return res.status(400).json({ error: 'رقم الهاتف غير صالح' });
    if (!EMAIL_RE.test(email) || email.length > 150) return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
    if (password.length < 8) return res.status(400).json({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' });

    const exists = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'هذا البريد مسجّل مسبقًا' });

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (username, phone, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'user')
       RETURNING id, username, phone, email, role`,
      [username, phone, email, hash]
    );
    setAuthCookie(res, rows[0]);
    res.status(201).json({ user: publicUser(rows[0]) });
  } catch (e) { next(e); }
});

// تسجيل الدخول
router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    // نفس الرسالة في الحالتين حتى لا نكشف وجود البريد
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة' });
    setAuthCookie(res, user);
    res.json({ user: publicUser(user) });
  } catch (e) { next(e); }
});

// تسجيل الخروج
router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// المستخدم الحالي
router.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

module.exports = router;
