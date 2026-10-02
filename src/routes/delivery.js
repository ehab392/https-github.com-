const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/delivery - قائمة مناطق التوصيل (عامة، لصفحة الدفع)
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, city, price::float AS price FROM delivery_zones ORDER BY city ASC'
    );
    res.json({ zones: rows });
  } catch (e) { next(e); }
});

module.exports = router;
