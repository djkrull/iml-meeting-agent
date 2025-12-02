const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

async function removeAdminFromEvaluation() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Removing Admin Team from Evaluation meeting/lunch participants...\n');

    // Update program_meetings (admin database)
    console.log('=== PROGRAM_MEETINGS (Admin) ===');

    const adminMeetings = await pool.query(`
      SELECT id, participants
      FROM program_meetings
      WHERE type = 'Evaluation meeting/lunch'
        AND (program_type = 'Spring Program' OR program_type = 'Fall Program')
    `);

    console.log(`Found ${adminMeetings.rows.length} Evaluation meeting/lunch entries`);

    let adminUpdated = 0;
    for (const meeting of adminMeetings.rows) {
      const participants = typeof meeting.participants === 'string'
        ? JSON.parse(meeting.participants)
        : meeting.participants;

      // Remove "Admin Team" from participants
      const newParticipants = participants.filter(p => p !== 'Admin Team');

      if (newParticipants.length !== participants.length) {
        await pool.query(
          'UPDATE program_meetings SET participants = $1 WHERE id = $2',
          [JSON.stringify(newParticipants), meeting.id]
        );
        adminUpdated++;
        console.log(`  Updated meeting ${meeting.id}: ${participants.join(', ')} → ${newParticipants.join(', ')}`);
      }
    }

    console.log(`✅ Updated ${adminUpdated} meetings in admin database`);

    // Update meetings table (director reviews)
    console.log('\n=== MEETINGS (Director Reviews) ===');

    const reviewMeetings = await pool.query(`
      SELECT id, participants
      FROM meetings
      WHERE type = 'Evaluation meeting/lunch'
        AND (program_type = 'Spring Program' OR program_type = 'Fall Program')
    `);

    console.log(`Found ${reviewMeetings.rows.length} Evaluation meeting/lunch entries in reviews`);

    let reviewUpdated = 0;
    for (const meeting of reviewMeetings.rows) {
      const participants = typeof meeting.participants === 'string'
        ? JSON.parse(meeting.participants)
        : meeting.participants;

      // Remove "Admin Team" from participants
      const newParticipants = participants.filter(p => p !== 'Admin Team');

      if (newParticipants.length !== participants.length) {
        await pool.query(
          'UPDATE meetings SET participants = $1 WHERE id = $2',
          [JSON.stringify(newParticipants), meeting.id]
        );
        reviewUpdated++;
      }
    }

    console.log(`✅ Updated ${reviewUpdated} meetings in director reviews`);

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

removeAdminFromEvaluation();
