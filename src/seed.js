require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./db');

/** إنشاء الجداول + حساب الأدمن الافتراضي */
async function init() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(sql);

  const { rows } = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (rows.length) return;

  const email = (process.env.ADMIN_EMAIL || 'admin@hujjat-batool.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@12345';
  const name = process.env.ADMIN_NAME || 'مدير المتجر';
  const phone = process.env.ADMIN_PHONE || '0500000000';
  const hash = await bcrypt.hash(password, 12);

  await pool.query(
    `INSERT INTO users (username, phone, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'admin')
     ON CONFLICT (email) DO UPDATE SET role = 'admin'`,
    [name, phone, email, hash]
  );
  console.log(`✔ تم إنشاء حساب الأدمن: ${email}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('⚠ تستخدم كلمة المرور الافتراضية Admin@12345 — غيّرها فورًا عبر ADMIN_PASSWORD');
  }
}

module.exports = { init };

// تشغيل مباشر: npm run seed
if (require.main === module) {
  init()
    .then(() => { console.log('✔ اكتملت التهيئة'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
