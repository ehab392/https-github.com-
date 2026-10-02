const express = require('express');
const pool = require('../db');

const router = express.Router();

/** يحسب قيمة الخصم من صف الكوبون ومجموع الطلب، ولا يسمح بخصم أكبر من المجموع */
function computeDiscount(coupon, subtotal) {
  const value =
    coupon.discount_type === 'percent'
      ? (subtotal * Number(coupon.discount_value)) / 100
      : Number(coupon.discount_value);
  return Math.min(Math.round(value * 100) / 100, subtotal);
}

// POST /api/coupons/validate  { code, subtotal }
router.post('/validate', async (req, res, next) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    const subtotal = Number(req.body.subtotal);
    if (!code) return res.status(400).json({ error: 'أدخل كود الخصم' });
    if (!Number.isFinite(subtotal) || subtotal <= 0) return res.status(400).json({ error: 'سلة غير صالحة' });

    const { rows } = await pool.query(
      'SELECT * FROM coupons WHERE UPPER(code) = $1 AND active = TRUE',
      [code]
    );
    const coupon = rows[0];
    if (!coupon) return res.status(404).json({ error: 'كود الخصم غير صحيح' });
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return res.status(400).json({ error: 'انتهت صلاحية كود الخصم' });
    }
    if (subtotal < Number(coupon.min_order)) {
      return res.status(400).json({ error: `الحد الأدنى لاستخدام هذا الكود ${coupon.min_order}` });
    }

    const discount = computeDiscount(coupon, subtotal);
    res.json({ code: coupon.code, discount, discount_type: coupon.discount_type, discount_value: Number(coupon.discount_value) });
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.computeDiscount = computeDiscount;
