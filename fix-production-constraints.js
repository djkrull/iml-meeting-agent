const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    console.log('\n🔧 FIXING PRODUCTION CONSTRAINTS\n');

    // Drop old indexes if they exist (they're not constraints)
    console.log('Checking existing indexes/constraints...');
    const existing = await pool.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename IN ('programs', 'program_meetings')
        AND indexname LIKE '%unique%'
    `);
    console.log('Existing indexes:', existing.rows.map(r => r.indexname));

    const constraints = await pool.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid IN ('programs'::regclass, 'program_meetings'::regclass)
    `);
    console.log('Existing constraints:', constraints.rows.map(r => r.conname));

    // Remove duplicate rows before creating unique constraint
    console.log('\n🧹 Removing duplicate programs (keeping oldest)...');
    const dupsPrograms = await pool.query(`
      DELETE FROM programs a USING programs b
      WHERE a.id > b.id
        AND a.name = b.name
        AND a.type = b.type
        AND COALESCE(a.year, 0) = COALESCE(b.year, 0)
    `);
    console.log(`  Removed ${dupsPrograms.rowCount} duplicate programs`);

    console.log('\n🧹 Removing duplicate meetings (keeping oldest)...');
    const dupsMeet = await pool.query(`
      DELETE FROM program_meetings a USING program_meetings b
      WHERE a.id > b.id
        AND a.program_name = b.program_name
        AND a.type = b.type
        AND a.date = b.date
        AND a.time = b.time
    `);
    console.log(`  Removed ${dupsMeet.rowCount} duplicate meetings`);

    // Drop old indexes
    await pool.query(`DROP INDEX IF EXISTS programs_unique_idx`);
    await pool.query(`DROP INDEX IF EXISTS program_meetings_unique_idx`);

    // Add PROPER CONSTRAINTS
    console.log('\n➕ Adding unique constraints...');
    await pool.query(`
      ALTER TABLE programs
      ADD CONSTRAINT programs_unique_idx UNIQUE (name, type, year)
    `);
    console.log('  ✅ programs_unique_idx constraint added');

    await pool.query(`
      ALTER TABLE program_meetings
      ADD CONSTRAINT program_meetings_unique_idx UNIQUE (program_name, type, date, time)
    `);
    console.log('  ✅ program_meetings_unique_idx constraint added');

    console.log('\n✅ CONSTRAINTS FIXED');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

main();
