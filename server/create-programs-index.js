const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

async function createProgramsIndex() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Creating unique index on programs table...\n');

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS programs_unique_idx
      ON programs (name, type, COALESCE(year, 0))
    `);

    console.log('✅ Index created successfully!');

    // Verify it exists
    const result = await pool.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'programs' AND indexname = 'programs_unique_idx'
    `);

    if (result.rows.length > 0) {
      console.log('✅ Verified: programs_unique_idx exists');
    } else {
      console.log('❌ Index not found after creation');
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

createProgramsIndex();
