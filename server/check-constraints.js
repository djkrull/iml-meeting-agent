const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

async function checkConstraints() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Checking constraints and indexes...\n');

    // Check indexes on programs
    const programIndexes = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'programs'
    `);

    console.log('=== PROGRAMS TABLE INDEXES ===');
    programIndexes.rows.forEach(idx => {
      console.log(`Index: ${idx.indexname}`);
      console.log(`Definition: ${idx.indexdef}`);
      console.log('');
    });

    // Check indexes on program_meetings
    const meetingIndexes = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'program_meetings'
    `);

    console.log('=== PROGRAM_MEETINGS TABLE INDEXES ===');
    meetingIndexes.rows.forEach(idx => {
      console.log(`Index: ${idx.indexname}`);
      console.log(`Definition: ${idx.indexdef}`);
      console.log('');
    });

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

checkConstraints();
