const fs = require('fs');
const { Pool } = require('pg');
const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
const conn = match ? match[1] : '';
const pool = new Pool({ connectionString: conn });

async function run() {
  const res = await pool.query(`
    SELECT key, LENGTH(value) as len FROM conference_configs
  `);
  console.table(res.rows);
  await pool.end();
}

run().catch(console.error);
