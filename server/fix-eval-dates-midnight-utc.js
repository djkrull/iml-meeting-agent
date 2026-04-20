const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

function getLastFridayBeforeDate(endDate) {
  const date = new Date(endDate);
  const dayOfWeek = date.getDay();

  if (dayOfWeek === 5) {
    return date;
  } else if (dayOfWeek === 6) {
    date.setDate(date.getDate() - 1);
  } else {
    const daysBack = dayOfWeek === 0 ? 2 : (dayOfWeek + 2);
    date.setDate(date.getDate() - daysBack);
  }

  // Set to midnight UTC to avoid timezone issues
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0));
}

async function fixEvalDatesMidnightUTC() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Fixing Evaluation meeting dates to midnight UTC (prevents timezone shift)...\n');

    const programs = await pool.query(`
      SELECT DISTINCT p.name, p.type, p.end_date, p.year
      FROM programs p
      WHERE (p.type = 'Spring Program' OR p.type = 'Fall Program')
        AND p.end_date IS NOT NULL
      ORDER BY p.name, p.year
    `);

    console.log(`Found ${programs.rows.length} Spring/Fall programs\n`);

    let adminUpdated = 0;
    let reviewUpdated = 0;

    for (const program of programs.rows) {
      const lastFriday = getLastFridayBeforeDate(program.end_date);

      console.log(`Program: ${program.name}`);
      console.log(`  Last Friday (midnight UTC): ${lastFriday.toISOString()}`);

      // Update in program_meetings
      const adminResult = await pool.query(`
        UPDATE program_meetings
        SET date = $1
        WHERE program_name = $2
          AND type = 'Evaluation meeting/lunch'
      `, [lastFriday, program.name]);

      if (adminResult.rowCount > 0) {
        console.log(`  ✅ Updated ${adminResult.rowCount} in admin`);
        adminUpdated += adminResult.rowCount;
      }

      // Update in meetings (director reviews)
      const reviewResult = await pool.query(`
        UPDATE meetings
        SET date = $1
        WHERE program_name = $2
          AND type = 'Evaluation meeting/lunch'
      `, [lastFriday, program.name]);

      if (reviewResult.rowCount > 0) {
        console.log(`  ✅ Updated ${reviewResult.rowCount} in reviews`);
        reviewUpdated += reviewResult.rowCount;
      }
    }

    console.log('\n=== SUMMARY ===');
    console.log(`Admin: ${adminUpdated}, Reviews: ${reviewUpdated}`);
    console.log('All dates now stored at midnight UTC - no timezone shift issues!');

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

fixEvalDatesMidnightUTC();
