const { Pool } = require('pg');

// Railway PostgreSQL connection
const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

async function checkProduction() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Checking PRODUCTION Railway database...\n');

    // Get all reviews
    const reviews = await pool.query('SELECT * FROM reviews ORDER BY created_at DESC LIMIT 5');
    console.log(`Found ${reviews.rows.length} recent reviews\n`);

    for (const review of reviews.rows) {
      console.log(`Review ID: ${review.id}`);
      console.log(`Created: ${review.created_at}`);
      console.log(`Created By: ${review.created_by}`);

      const meetings = await pool.query('SELECT * FROM meetings WHERE review_id = $1', [review.id]);
      console.log(`  Meetings in this review: ${meetings.rows.length}`);

      const approvals = await pool.query(
        `SELECT a.director_name, a.status, a.timestamp, m.type as meeting_type, m.program_name
         FROM approvals a
         JOIN meetings m ON a.meeting_id = m.id
         WHERE m.review_id = $1
         ORDER BY a.timestamp DESC`,
        [review.id]
      );

      console.log(`  Director Approvals: ${approvals.rows.length}`);

      if (approvals.rows.length > 0) {
        console.log('  ✅ FOUND DIRECTOR RESPONSES:');
        approvals.rows.forEach(a => {
          console.log(`    - ${a.director_name}: ${a.status}`);
          console.log(`      Meeting: ${a.meeting_type} (${a.program_name})`);
          console.log(`      Time: ${a.timestamp}`);
        });
      } else {
        console.log('  ⚠️ No approvals in this review');
      }
      console.log('');
    }

    // Overall stats
    const totalApprovals = await pool.query('SELECT COUNT(*) as count FROM approvals');
    const totalMeetings = await pool.query('SELECT COUNT(*) as count FROM meetings');
    const totalReviews = await pool.query('SELECT COUNT(*) as count FROM reviews');

    console.log('=== PRODUCTION DATABASE SUMMARY ===');
    console.log(`Total Reviews: ${totalReviews.rows[0].count}`);
    console.log(`Total Meetings in Reviews: ${totalMeetings.rows[0].count}`);
    console.log(`Total Director Approvals: ${totalApprovals.rows[0].count}`);

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

checkProduction();
