const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

async function checkPrograms() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Checking PROGRAMS table...\n');

    // Count total programs
    const countResult = await pool.query('SELECT COUNT(*) as count FROM programs');
    console.log(`Total programs: ${countResult.rows[0].count}`);

    // Check for duplicates
    const duplicates = await pool.query(`
      SELECT name, type, year, COUNT(*) as count
      FROM programs
      GROUP BY name, type, year
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 10
    `);

    console.log(`\nDuplicate program groups: ${duplicates.rows.length}`);
    if (duplicates.rows.length > 0) {
      console.log('\nTop duplicates:');
      duplicates.rows.forEach(d => {
        console.log(`  ${d.count}x - ${d.name} (${d.type}, ${d.year})`);
      });
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

checkPrograms();
