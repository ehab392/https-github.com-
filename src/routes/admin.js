const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { upload, saveImage } = require('../upload');
const { COLUMNS } = require('./products');

const router = express.Router();
router.use(requireAdmin); // كل مسارات هذا الملف للأدمن فقط

const ORDER_STATUSES = ['new', 'confirmed', 'shipped', 'done', 'cancelled'];

// ---------- أدوات التحقق ----------
const num = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const cleanUrl = (u) => {
  const s = String(u || '').trim();
  return s && s.length < 500 && (s.startsWith('/uploads/') || /^https:\/\//.test(s)) ? s : '';
};

/** يتحقق من بيانات المنتج ويرجعها بصيغة جاهزة للحفظ */
function normalizeProduct(body) {
  const type = body.type;
  const name = String(body.name || '').trim();
  if (!['incense', 'perfume'].includes(type)) throw new Error('نوع المنتج غير صالح');
  if (!name || name.length > 150) throw new Error('اسم المنتج مطلوب');

  if (type === 'perfume') {
    const price = num(body.price);
    let oldPrice = num(body.old_price);
    if (!(price > 0)) throw new Error('سعر العطر غير صالح');
    if (Number.isNaN(oldPrice) || (oldPrice !== null && oldPrice <= price)) oldPrice = null;
    const images = (Array.isArray(body.images) ? body.images : []).map(cleanUrl).filter(Boolean).slice(0, 10);
    return { type, name, price, old_price: oldPrice, images, variants: [] };
  }

  const variants = (Array.isArray(body.variants) ? body.variants : []).slice(0, 20).map((v) => {
    const size = String(v.size || '').trim();
    const price = num(v.price);
    let oldPrice = num(v.old_price);
    if (!size || size.length > 60) throw new Error('اسم الحجم مطلوب لكل متغير');
    if (!(price > 0)) throw new Error(`سعر الحجم "${size}" غير صالح`);
    if (Number.isNaN(oldPrice) || (oldPrice !== null && oldPrice <= price)) oldPrice = null;
    return { size, price, old_price: oldPrice, image: cleanUrl(v.image) };
  });
  if (!variants.length) throw new Error('أضف حجمًا واحدًا على الأقل');
  return { type, name, price: null, old_price: null, images: [], variants };
}

// ---------- رفع صورة ----------
router.post('/upload', (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'فشل رفع الصورة' });
    if (!req.file) return res.status(400).json({ error: 'لم يتم اختيار صورة' });
    try {
      res.json({ url: await saveImage(req.file) });
    } catch (e) {
      console.error('Upload error:', e.message);
      res.status(500).json({ error: 'تعذّر حفظ الصورة' });
    }
  });
});

// ---------- المنتجات ----------
router.get('/products', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT ${COLUMNS} FROM products ORDER BY created_at DESC, id DESC`);
    res.json({ products: rows });
  } catch (e) { next(e); }
});

router.post('/products', async (req, res, next) => {
  try {
    let p;
    try { p = normalizeProduct(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }
    const { rows } = await pool.query(
      `INSERT INTO products (type, name, price, old_price, images, variants)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb) RETURNING id`,
      [p.type, p.name, p.price, p.old_price, JSON.stringify(p.images), JSON.stringify(p.variants)]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (e) { next(e); }
});

router.put('/products/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    let p;
    try { p = normalizeProduct(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }
    const { rowCount } = await pool.query(
      `UPDATE products SET type=$1, name=$2, price=$3, old_price=$4, images=$5::jsonb, variants=$6::jsonb
       WHERE id=$7`,
      [p.type, p.name, p.price, p.old_price, JSON.stringify(p.images), JSON.stringify(p.variants), id]
    );
    if (!rowCount) return res.status(404).json({ error: 'المنتج غير موجود' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.patch('/products/:id/bestseller', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const value = req.body.value === true;
    const { rowCount } = await pool.query('UPDATE products SET is_best_seller=$1 WHERE id=$2', [value, id]);
    if (!rowCount) return res.status(404).json({ error: 'المنتج غير موجود' });
    res.json({ ok: true, is_best_seller: value });
  } catch (e) { next(e); }
});

router.delete('/products/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM products WHERE id=$1', [parseInt(req.params.id, 10)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- الطلبات ----------
router.get('/orders', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, customer_name, phone, items, total::float AS total, status, created_at
       FROM orders ORDER BY created_at DESC LIMIT 200`
    );
    res.json({ orders: rows });
  } catch (e) { next(e); }
});

router.patch('/orders/:id/status', async (req, res, next) => {
  try {
    const status = String(req.body.status || '');
    if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'حالة غير صالحة' });
    await pool.query('UPDATE orders SET status=$1 WHERE id=$2', [status, parseInt(req.params.id, 10)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
