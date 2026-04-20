const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

async function checkInteractionsDate() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const reviewId = 'e58c119e-b6dd-41f9-93bd-30251752220e';
    const programName = 'Interactions between fractal geometry, harmonic analysis, and dynamical systems';

    console.log('Checking Evaluation meeting for Interactions program...\n');

    const meeting = await pool.query(`
      SELECT
        date,
        to_char(date, 'YYYY-MM-DD HH24:MI:SS TZ') as date_full,
        extract(dow from date) as day_of_week
      FROM meetings
      WHERE review_id = $1
        AND program_name = $2
        AND type = 'Evaluation meeting/lunch'
    `, [reviewId, programName]);

    if (meeting.rows.length > 0) {
      const m = meeting.rows[0];
      console.log('Stored in database:');
      console.log('  Raw date:', m.date);
      console.log('  Formatted:', m.date_full);
      console.log('  Day of week:', m.day_of_week, '(5 = Friday, 6 = Saturday)');
      console.log('');

      const jsDate = new Date(m.date);
      console.log('JavaScript receives:', jsDate.toISOString());
      console.log('');

      // Swedish timezone
      console.log('Displayed in Swedish timezone:');
      console.log('  Date:', jsDate.toLocaleDateString('sv-SE'));
      console.log('  Day:', jsDate.toLocaleDateString('sv-SE', { weekday: 'long' }));
      console.log('  Full:', jsDate.toLocaleDateString('sv-SE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

checkInteractionsDate();
