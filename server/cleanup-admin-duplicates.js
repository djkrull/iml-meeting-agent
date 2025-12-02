const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

async function cleanupDuplicates() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Cleaning up duplicates in program_meetings table...\n');

    // Count before
    const beforeCount = await pool.query('SELECT COUNT(*) as count FROM program_meetings');
    console.log(`Meetings before cleanup: ${beforeCount.rows[0].count}`);

    // Delete duplicates, keeping only the most recent one for each unique meeting
    const result = await pool.query(`
      DELETE FROM program_meetings a USING (
        SELECT MAX(id) as id, program_name, type, date, time
        FROM program_meetings
        GROUP BY program_name, type, date, time
        HAVING COUNT(*) > 1
      ) b
      WHERE a.program_name = b.program_name
        AND a.type = b.type
        AND a.date = b.date
        AND a.time = b.time
        AND a.id < b.id
    `);

    console.log(`Deleted ${result.rowCount} duplicate meetings`);

    // Count after
    const afterCount = await pool.query('SELECT COUNT(*) as count FROM program_meetings');
    console.log(`Meetings after cleanup: ${afterCount.rows[0].count}`);

    // Check remaining duplicates
    const stillDuplicates = await pool.query(`
      SELECT program_name, type, date, time, COUNT(*) as count
      FROM program_meetings
      GROUP BY program_name, type, date, time
      HAVING COUNT(*) > 1
    `);

    console.log(`\nRemaining duplicates: ${stillDuplicates.rows.length}`);

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

cleanupDuplicates();
