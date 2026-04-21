const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    console.log('\n🚨 CLEAN RESET — deleting all program_meetings and duplicate programs\n');

    // NOTE: approvals table references 'meetings' (review-specific), NOT 'program_meetings'.
    // So clearing program_meetings is safe — director approvals are preserved.
    const approvals = await pool.query('SELECT COUNT(*) FROM approvals');
    console.log(`Approvals in DB (on 'meetings' table, unaffected by this reset): ${approvals.rows[0].count}`);

    // Delete all program_meetings
    const m = await pool.query('DELETE FROM program_meetings');
    console.log(`  ✅ Deleted ${m.rowCount} meetings`);

    // Delete duplicate programs (keep lowest id per name+year+type)
    const dp = await pool.query(`
      DELETE FROM programs a USING programs b
      WHERE a.id > b.id
        AND a.name = b.name
        AND a.type = b.type
        AND COALESCE(a.year, 0) = COALESCE(b.year, 0)
    `);
    console.log(`  ✅ Deleted ${dp.rowCount} duplicate programs (same name/type/year)`);

    // Also delete programs where name appears multiple times with slight variations
    // (e.g. EWM-EMS with different organizer whitespace)
    const byName = await pool.query(`
      SELECT name, COUNT(*) as c FROM programs GROUP BY name HAVING COUNT(*) > 1
    `);
    for (const row of byName.rows) {
      const del = await pool.query(`
        DELETE FROM programs a USING programs b
        WHERE a.id > b.id AND a.name = $1
      `, [row.name]);
      console.log(`  ✅ Deleted ${del.rowCount} more duplicate(s) of "${row.name}"`);
    }

    console.log('\n✅ Reset complete. Now run: node import-to-production.js');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

main();
