const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

async function checkMeetingSync() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const programName = 'Interactions between fractal geometry, harmonic analysis, and dynamical systems';
    const meetingType = 'Check-in meeting with organizers';

    console.log('Checking meeting sync status...\n');
    console.log(`Program: ${programName}`);
    console.log(`Meeting Type: ${meetingType}\n`);

    // Check in program_meetings (admin's working data)
    console.log('=== ADMIN VIEW (program_meetings) ===');
    const adminMeeting = await pool.query(
      `SELECT date, time, description
       FROM program_meetings
       WHERE program_name = $1 AND type = $2`,
      [programName, meetingType]
    );

    if (adminMeeting.rows.length > 0) {
      console.log('Admin has this meeting:');
      adminMeeting.rows.forEach(m => {
        console.log(`  Date: ${m.date}`);
        console.log(`  Time: ${m.time}`);
        console.log(`  Description: ${m.description?.substring(0, 50)}`);
      });
    } else {
      console.log('❌ Meeting NOT found in admin database');
    }

    // Check in director review (meetings table)
    console.log('\n=== DIRECTOR VIEW (meetings in review) ===');
    const directorReviewId = 'e58c119e-b6dd-41f9-93bd-30251752220e';

    const directorMeeting = await pool.query(
      `SELECT m.date, m.time, m.description, COUNT(a.id) as approval_count
       FROM meetings m
       LEFT JOIN approvals a ON a.meeting_id = m.id
       WHERE m.review_id = $1
         AND m.program_name = $2
         AND m.type = $3
       GROUP BY m.id, m.date, m.time, m.description`,
      [directorReviewId, programName, meetingType]
    );

    if (directorMeeting.rows.length > 0) {
      console.log(`Directors see this meeting (review ${directorReviewId}):`);
      directorMeeting.rows.forEach(m => {
        console.log(`  Date: ${m.date}`);
        console.log(`  Time: ${m.time}`);
        console.log(`  Approvals: ${m.approval_count}`);
        console.log(`  Description: ${m.description?.substring(0, 50)}`);
      });
    } else {
      console.log(`❌ Meeting NOT found in director review ${directorReviewId}`);
    }

    // Check if they match
    if (adminMeeting.rows.length > 0 && directorMeeting.rows.length > 0) {
      const adminTime = adminMeeting.rows[0].time;
      const directorTime = directorMeeting.rows[0].time;
      const adminDate = new Date(adminMeeting.rows[0].date).toISOString().split('T')[0];
      const directorDate = new Date(directorMeeting.rows[0].date).toISOString().split('T')[0];

      console.log('\n=== COMPARISON ===');
      if (adminDate === directorDate && adminTime === directorTime) {
        console.log('✅ Times MATCH - sync is working!');
      } else {
        console.log('❌ Times DO NOT MATCH - sync failed!');
        console.log(`   Admin: ${adminDate} at ${adminTime}`);
        console.log(`   Director: ${directorDate} at ${directorTime}`);
      }
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

checkMeetingSync();
