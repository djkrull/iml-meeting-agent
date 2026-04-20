const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

async function checkEvalDates() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const reviewId = 'e58c119e-b6dd-41f9-93bd-30251752220e';

    console.log('Checking Evaluation meeting dates in director review...\n');

    const meetings = await pool.query(`
      SELECT program_name, date, time, duration
      FROM meetings
      WHERE review_id = $1
        AND type = 'Evaluation meeting/lunch'
      ORDER BY date
    `, [reviewId]);

    console.log(`Found ${meetings.rows.length} Evaluation meetings:\n`);

    meetings.rows.forEach(m => {
      const date = new Date(m.date);
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayOfWeek = dayNames[date.getDay()];

      console.log(`Program: ${m.program_name}`);
      console.log(`  Date: ${date.toISOString().split('T')[0]} (${dayOfWeek})`);
      console.log(`  Time: ${m.time}`);
      console.log(`  Duration: ${m.duration} min`);

      if (dayOfWeek !== 'Friday') {
        console.log(`  ⚠️ WARNING: Not a Friday!`);
      }
      console.log('');
    });

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

checkEvalDates();
