const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

async function checkAdminMeetings() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Checking admin meetings in Railway database...\n');

    // Check program_meetings table (admin's working data)
    const programMeetings = await pool.query('SELECT COUNT(*) as count FROM program_meetings');
    console.log(`Total meetings in program_meetings (admin): ${programMeetings.rows[0].count}`);

    // Check for duplicates
    const duplicates = await pool.query(`
      SELECT program_name, type, date, time, COUNT(*) as count
      FROM program_meetings
      GROUP BY program_name, type, date, time
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 10
    `);

    console.log(`\nDuplicate groups found: ${duplicates.rows.length}`);
    if (duplicates.rows.length > 0) {
      console.log('\nTop duplicates:');
      duplicates.rows.forEach(d => {
        console.log(`  ${d.count}x - ${d.type} (${d.program_name}) at ${d.date} ${d.time}`);
      });
    }

    // Check reviews table
    const reviews = await pool.query('SELECT COUNT(*) as count FROM reviews');
    console.log(`\nTotal reviews: ${reviews.rows[0].count}`);

    // Check meetings in reviews
    const reviewMeetings = await pool.query('SELECT COUNT(*) as count FROM meetings');
    console.log(`Total meetings in reviews (director view): ${reviewMeetings.rows[0].count}`);

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

checkAdminMeetings();
