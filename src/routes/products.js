const express = require('express');
const pool = require('../db');

const router = express.Router();

// الأعمدة المُرجَعة (الأرقام تُحوَّل من NUMERIC إلى float)
const COLUMNS = `id, type, name, price::float AS price, old_price::float AS old_price,
                 images, variants, is_best_seller, out_of_stock, created_at`;

// شرط "العروض": خصم على العطر أو على أحد أحجام البخور
const OFFER_SQL = `(
  (old_price IS NOT NULL AND price IS NOT NULL AND old_price > price)
  OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(variants) v
    WHERE v->>'old_price' IS NOT NULL
      AND (v->>'old_price')::numeric > (v->>'price')::numeric
  )
)`;

// GET /api/products?category=all|incense|perfume|bestsellers|offers&q=كلمة
router.get('/', async (req, res, next) => {
  try {
    const category = String(req.query.category || 'all');
    const q = String(req.query.q || '').trim().slice(0, 60);
    const where = [];
    const params = [];

    if (category === 'incense') where.push("type = 'incense'");
    else if (category === 'perfume') where.push("type = 'perfume'");
    else if (category === 'bestsellers') where.push('is_best_seller = TRUE');
    else if (category === 'offers') where.push(OFFER_SQL);

    if (q) {
      params.push(`%${q.replace(/[%_\\]/g, '\\$&')}%`);
      const parts = [`name ILIKE $${params.length}`];
      // البحث بالنوع: "بخور" أو "عطر"
      if (/بخور|bakhoor|incense/i.test(q)) parts.push("type = 'incense'");
      if (/عطر|عطور|perfume/i.test(q)) parts.push("type = 'perfume'");
      where.push(`(${parts.join(' OR ')})`);
    }

    const sql = `SELECT ${COLUMNS} FROM products
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY created_at DESC, id DESC`;
    const { rows } = await pool.query(sql, params);
    res.json({ products: rows });
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.COLUMNS = COLUMNS;
