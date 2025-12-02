const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

async function cleanupProgramDuplicates() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Cleaning up duplicate programs...\n');

    // Count before
    const beforeCount = await pool.query('SELECT COUNT(*) as count FROM programs');
    console.log(`Programs before cleanup: ${beforeCount.rows[0].count}`);

    // Delete duplicates, keeping only the most recent one for each unique program
    const result = await pool.query(`
      DELETE FROM programs a USING (
        SELECT MAX(id) as id, name, type, year
        FROM programs
        GROUP BY name, type, year
        HAVING COUNT(*) > 1
      ) b
      WHERE a.name = b.name
        AND a.type = b.type
        AND COALESCE(a.year, 0) = COALESCE(b.year, 0)
        AND a.id < b.id
    `);

    console.log(`Deleted ${result.rowCount} duplicate programs`);

    // Count after
    const afterCount = await pool.query('SELECT COUNT(*) as count FROM programs');
    console.log(`Programs after cleanup: ${afterCount.rows[0].count}`);

    // Check remaining duplicates
    const stillDuplicates = await pool.query(`
      SELECT name, type, year, COUNT(*) as count
      FROM programs
      GROUP BY name, type, year
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

cleanupProgramDuplicates();
