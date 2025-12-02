const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

async function deleteTitleMeetingsFromReview() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const reviewId = 'e58c119e-b6dd-41f9-93bd-30251752220e';

    console.log('Deleting orphan "Title" meetings from director review...\n');

    // Find meetings for "Title" program in review
    const titleMeetings = await pool.query(`
      SELECT id, type, date, time
      FROM meetings
      WHERE review_id = $1 AND program_name = 'Title'
    `, [reviewId]);

    console.log(`Found ${titleMeetings.rows.length} orphan meetings:`);
    titleMeetings.rows.forEach(m => {
      console.log(`  - ${m.type}, ${m.date.toISOString().split('T')[0]}, ${m.time}`);
    });

    if (titleMeetings.rows.length > 0) {
      // Delete approvals first
      const meetingIds = titleMeetings.rows.map(m => m.id);
      const approvalsResult = await pool.query(`
        DELETE FROM approvals
        WHERE meeting_id = ANY($1)
      `, [meetingIds]);

      console.log(`\nDeleted ${approvalsResult.rowCount} approvals`);

      // Delete meetings
      const meetingsResult = await pool.query(`
        DELETE FROM meetings
        WHERE review_id = $1 AND program_name = 'Title'
      `, [reviewId]);

      console.log(`✅ Deleted ${meetingsResult.rowCount} orphan meetings from director review`);
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

deleteTitleMeetingsFromReview();
