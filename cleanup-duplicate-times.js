const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    console.log('\n🔍 FINDING DUPLICATES (same program + type + date, different times)\n');

    const dups = await pool.query(`
      SELECT
        program_name, type, TO_CHAR(date, 'YYYY-MM-DD') as d,
        COUNT(*) as c,
        STRING_AGG(time || ' (id=' || id || ')', ', ' ORDER BY time) as times
      FROM program_meetings
      GROUP BY program_name, type, date
      HAVING COUNT(*) > 1
      ORDER BY date, program_name
    `);

    if (dups.rows.length === 0) {
      console.log('  ✅ No duplicates found');
      await pool.end();
      return;
    }

    console.log(`Found ${dups.rows.length} duplicate group(s):\n`);
    dups.rows.forEach(d => {
      console.log(`  ${d.d} - ${d.type} (${d.program_name})`);
      console.log(`    Times: ${d.times}`);
    });

    // Strategy: For each duplicate group, keep the one with highest id
    // (my import script ran LATER, so its rows have higher ids and the
    // cyclically-inherited times 14:00/14:30)
    console.log('\n🧹 Removing older duplicates (keeping highest id = latest inserted)...\n');

    const result = await pool.query(`
      DELETE FROM program_meetings a USING program_meetings b
      WHERE a.id < b.id
        AND a.program_name = b.program_name
        AND a.type = b.type
        AND a.date = b.date
    `);

    console.log(`  ✅ Removed ${result.rowCount} duplicate meeting(s)`);

    // Verify
    const after = await pool.query(`
      SELECT COUNT(*) as c FROM program_meetings
    `);
    console.log(`\n📊 Total meetings now: ${after.rows[0].c}`);

    // Re-check duplicates
    const stillDups = await pool.query(`
      SELECT program_name, type, date, COUNT(*) as c
      FROM program_meetings
      GROUP BY program_name, type, date
      HAVING COUNT(*) > 1
    `);
    console.log(`Remaining duplicates: ${stillDups.rows.length}`);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

main();
