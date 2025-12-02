const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

async function findOrphanMeeting() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const reviewId = 'e58c119e-b6dd-41f9-93bd-30251752220e';
    const meetingType = 'Introduction Meeting';
    const targetDate = '2026-02-06'; // February 6

    console.log('Searching for orphan meeting...\n');
    console.log(`Type: ${meetingType}`);
    console.log(`Date: ${targetDate}`);
    console.log(`Review: ${reviewId}\n`);

    // Check if meeting exists in director review
    console.log('=== DIRECTOR REVIEW (meetings table) ===');
    const directorMeeting = await pool.query(`
      SELECT id, program_name, type, date, time, description, program_type
      FROM meetings
      WHERE review_id = $1
        AND type = $2
        AND date::date = $3::date
    `, [reviewId, meetingType, targetDate]);

    if (directorMeeting.rows.length > 0) {
      console.log(`✅ Found in director review:`);
      directorMeeting.rows.forEach(m => {
        console.log(`  ID: ${m.id}`);
        console.log(`  Program: ${m.program_name}`);
        console.log(`  Type: ${m.program_type}`);
        console.log(`  Date: ${m.date}`);
        console.log(`  Time: ${m.time}`);
        console.log(`  Description: ${m.description}`);
      });

      const programName = directorMeeting.rows[0].program_name;

      // Check if same meeting exists in admin
      console.log('\n=== ADMIN DATABASE (program_meetings table) ===');
      const adminMeeting = await pool.query(`
        SELECT program_name, type, date, time
        FROM program_meetings
        WHERE program_name = $1
          AND type = $2
          AND date::date = $3::date
      `, [programName, meetingType, targetDate]);

      if (adminMeeting.rows.length > 0) {
        console.log(`✅ Also exists in admin database`);
        console.log(`  This is NOT an orphan - might be a display issue`);
      } else {
        console.log(`❌ NOT in admin database`);
        console.log(`  This is an ORPHAN meeting - exists only in director review`);
        console.log(`  Likely was deleted from admin after sharing to directors`);

        console.log(`\n=== SOLUTION ===`);
        console.log(`Would you like to:`);
        console.log(`1. Delete this orphan meeting from director review?`);
        console.log(`2. Keep it (directors will continue to see it)?`);
      }

    } else {
      console.log(`❌ Meeting NOT found in director review`);
      console.log(`  Check the date/type - might be spelled differently`);
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

findOrphanMeeting();
