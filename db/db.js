const { Pool } = require('pg');
require('dotenv').config();


console.log('DB URL:', process.env.DATABASE_URL); // ← add this to see what it's reading

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ DB connection error:', err.message);
  } else {
    console.log('✅ PostgreSQL connected successfully');
    release();
  }
});

module.exports = pool;