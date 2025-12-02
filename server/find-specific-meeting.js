const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

async function findMeeting() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Looking for "Check-in meeting with organizers" in Railway database...\n');

    // Get the review ID being used
    const reviews = await pool.query('SELECT * FROM reviews ORDER BY created_at DESC LIMIT 3');

    for (const review of reviews.rows) {
      console.log(`\nReview ID: ${review.id}`);
      console.log(`Created: ${review.created_at}`);

      // Look for meetings with "check-in" in the name
      const meetings = await pool.query(
        `SELECT id, program_name, type, date, time, description
         FROM meetings
         WHERE review_id = $1
         AND (LOWER(type) LIKE '%check-in%' OR LOWER(type) LIKE '%organizer%')
         ORDER BY date, time`,
        [review.id]
      );

      if (meetings.rows.length > 0) {
        console.log(`  Found ${meetings.rows.length} matching meetings:`);
        meetings.rows.forEach(m => {
          console.log(`\n    Meeting ID: ${m.id}`);
          console.log(`    Type: "${m.type}"`);
          console.log(`    Program: "${m.program_name}"`);
          console.log(`    Date: ${m.date}`);
          console.log(`    Time: ${m.time}`);
          console.log(`    Description: ${m.description?.substring(0, 50)}...`);
        });
      } else {
        console.log('  No check-in meetings found in this review');
      }
    }

    // Also check admin database (program_meetings table)
    console.log('\n\n=== ADMIN DATABASE (program_meetings) ===');
    const adminMeetings = await pool.query(
      `SELECT meeting_id, program_name, type, date, time
       FROM program_meetings
       WHERE LOWER(type) LIKE '%check-in%' AND LOWER(type) LIKE '%organizer%'
       ORDER BY date, time`
    );

    console.log(`Found ${adminMeetings.rows.length} matching meetings in admin:`);
    adminMeetings.rows.forEach(m => {
      console.log(`\n  Meeting ID: ${m.meeting_id}`);
      console.log(`  Type: "${m.type}"`);
      console.log(`  Program: "${m.program_name}"`);
      console.log(`  Date: ${m.date}`);
      console.log(`  Time: ${m.time}`);
    });

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

findMeeting();
