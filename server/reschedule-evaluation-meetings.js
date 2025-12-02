const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

function getLastFridayBeforeDate(endDate) {
  const date = new Date(endDate);
  const dayOfWeek = date.getDay();

  // Friday is 5
  if (dayOfWeek === 5) {
    // Already Friday
    return date;
  } else if (dayOfWeek === 6) {
    // Saturday - go back 1 day
    date.setDate(date.getDate() - 1);
  } else {
    // Sunday (0) through Thursday (4)
    const daysBack = dayOfWeek === 0 ? 2 : (dayOfWeek + 2);
    date.setDate(date.getDate() - daysBack);
  }

  return date;
}

async function rescheduleEvaluationMeetings() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Rescheduling Evaluation meeting/lunch to last Friday before program end...\n');

    // Get all programs with their end dates
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
      const formattedDate = lastFriday.toISOString().split('T')[0];

      console.log(`Program: ${program.name} (${program.type}, ${program.year})`);
      console.log(`  End date: ${program.end_date.toISOString().split('T')[0]}`);
      console.log(`  Last Friday: ${formattedDate}`);

      // Update in program_meetings (admin)
      const adminResult = await pool.query(`
        UPDATE program_meetings
        SET date = $1, time = '12:00', duration = 90
        WHERE program_name = $2
          AND type = 'Evaluation meeting/lunch'
          AND (program_type = 'Spring Program' OR program_type = 'Fall Program')
      `, [lastFriday, program.name]);

      if (adminResult.rowCount > 0) {
        console.log(`  ✅ Updated ${adminResult.rowCount} meeting(s) in admin`);
        adminUpdated += adminResult.rowCount;
      }

      // Update in meetings (director reviews)
      const reviewResult = await pool.query(`
        UPDATE meetings
        SET date = $1, time = '12:00', duration = 90
        WHERE program_name = $2
          AND type = 'Evaluation meeting/lunch'
          AND (program_type = 'Spring Program' OR program_type = 'Fall Program')
      `, [lastFriday, program.name]);

      if (reviewResult.rowCount > 0) {
        console.log(`  ✅ Updated ${reviewResult.rowCount} meeting(s) in director reviews`);
        reviewUpdated += reviewResult.rowCount;
      }

      console.log('');
    }

    console.log('=== SUMMARY ===');
    console.log(`Admin meetings updated: ${adminUpdated}`);
    console.log(`Director review meetings updated: ${reviewUpdated}`);

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

rescheduleEvaluationMeetings();
