const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

async function findFebruaryMeetings() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const reviewId = 'e58c119e-b6dd-41f9-93bd-30251752220e';

    console.log('Finding all meetings in February 2026 in director review...\n');

    const februaryMeetings = await pool.query(`
      SELECT id, program_name, type, date, time, description
      FROM meetings
      WHERE review_id = $1
        AND date >= '2026-02-01'
        AND date < '2026-03-01'
      ORDER BY date, time
    `, [reviewId]);

    console.log(`Found ${februaryMeetings.rows.length} meetings in February 2026:\n`);

    for (const meeting of februaryMeetings.rows) {
      console.log(`Meeting ID: ${meeting.id}`);
      console.log(`  Type: "${meeting.type}"`);
      console.log(`  Program: "${meeting.program_name}"`);
      console.log(`  Date: ${meeting.date.toISOString().split('T')[0]}`);
      console.log(`  Time: ${meeting.time}`);

      // Check if exists in admin
      const adminCheck = await pool.query(`
        SELECT COUNT(*) as count
        FROM program_meetings
        WHERE program_name = $1
          AND type = $2
          AND date::date = $3::date
      `, [meeting.program_name, meeting.type, meeting.date]);

      if (adminCheck.rows[0].count === 0) {
        console.log(`  ⚠️ ORPHAN - Not in admin database!`);
      } else {
        console.log(`  ✅ Exists in admin`);
      }
      console.log('');
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

findFebruaryMeetings();
