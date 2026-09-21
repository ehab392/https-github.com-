const { Pool } = require('pg');

const url = process.env.DATABASE_URL || '';
const isLocal = /localhost|127\.0\.0\.1/.test(url);

const pool = new Pool({
  connectionString: url,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 10,
});

pool.on('error', (err) => console.error('Database error:', err.message));

module.exports = pool;
