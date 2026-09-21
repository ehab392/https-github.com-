const express = require('express');
const pool = require('../db');

const router = express.Router();
const PHONE_RE = /^[0-9+\s-]{7,20}$/;

// POST /api/orders
// الجسم: { customer_name, phone, items: [{ product_id, variant_index, quantity }] }
// الأسعار تُحسب من قاعدة البيانات (لا نثق بالأسعار القادمة من المتصفح)
router.post('/', async (req, res, next) => {
  try {
    const customer = String(req.body.customer_name || '').trim();
    const phone = String(req.body.phone || '').trim();
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];

    if (customer.length < 2 || customer.length > 100) return res.status(400).json({ error: 'اسم العميل مطلوب' });
    if (!PHONE_RE.test(phone)) return res.status(400).json({ error: 'رقم الهاتف غير صالح' });
    if (!rawItems.length || rawItems.length > 50) return res.status(400).json({ error: 'السلة فارغة' });

    const ids = [...new Set(rawItems.map((i) => parseInt(i.product_id, 10)).filter(Number.isInteger))];
    if (!ids.length) return res.status(400).json({ error: 'منتجات غير صالحة' });
    const { rows } = await pool.query(
      'SELECT id, type, name, price::float AS price, variants FROM products WHERE id = ANY($1::int[])',
      [ids]
    );
    const byId = new Map(rows.map((p) => [p.id, p]));

    const items = [];
    let total = 0;
    for (const raw of rawItems) {
      const p = byId.get(parseInt(raw.product_id, 10));
      const quantity = parseInt(raw.quantity, 10);
      if (!p) return res.status(400).json({ error: 'أحد المنتجات لم يعد متوفرًا' });
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return res.status(400).json({ error: 'كمية غير صالحة' });
      }
      let name = p.name;
      let price = p.price;
      if (p.type === 'incense') {
        const v = p.variants[parseInt(raw.variant_index, 10)];
        if (!v) return res.status(400).json({ error: 'حجم غير صالح' });
        name = `${p.name} - ${v.size}`;
        price = Number(v.price);
      }
      items.push({ name, quantity, price });
      total += price * quantity;
    }
    total = Math.round(total * 100) / 100;

    const ins = await pool.query(
      `INSERT INTO orders (user_id, customer_name, phone, items, total)
       VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING id`,
      [req.user ? req.user.id : null, customer, phone, JSON.stringify(items), total]
    );
    res.status(201).json({ order_id: ins.rows[0].id, total });
  } catch (e) { next(e); }
});

module.exports = router;
