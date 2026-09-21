require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { attachUser } = require('./src/middleware/auth');
const { init } = require('./src/seed');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); // خلف Render / Heroku وغيرها

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'https:'],
        'connect-src': ["'self'"],
        'upgrade-insecure-requests': null,
      },
    },
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(attachUser);

// حد للمحاولات على التسجيل/الدخول (حماية من التخمين)
app.use(
  '/api/auth/login',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'محاولات كثيرة، حاول بعد قليل' } })
);
app.use(
  '/api/auth/register',
  rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: { error: 'محاولات كثيرة، حاول لاحقًا' } })
);

// ---------- API ----------
app.get('/api/config', (_req, res) => {
  res.json({
    currency: process.env.CURRENCY || 'ر.س',
    whatsapp: (process.env.WHATSAPP_NUMBER || '').replace(/\D/g, ''),
  });
});
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/products', require('./src/routes/products'));
app.use('/api/orders', require('./src/routes/orders'));
app.use('/api/admin', require('./src/routes/admin'));

// ---------- صفحة الأدمن (محمية على السيرفر) ----------
app.get('/admin', (req, res) => {
  if (!req.user) return res.redirect('/login.html?next=/admin');
  if (req.user.role !== 'admin') return res.status(403).send('هذه الصفحة للأدمن فقط');
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// ---------- الملفات الثابتة ----------
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.use('/api', (_req, res) => res.status(404).json({ error: 'غير موجود' }));

// معالج الأخطاء
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'حدث خطأ في الخادم' });
});

init()
  .then(() => app.listen(PORT, () => console.log(`✔ المتجر يعمل على المنفذ ${PORT}`)))
  .catch((e) => {
    console.error('فشل الاتصال بقاعدة البيانات:', e.message);
    process.exit(1);
  });
