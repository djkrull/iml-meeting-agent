const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

async function checkDateFormat() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const reviewId = 'e58c119e-b6dd-41f9-93bd-30251752220e';

    console.log('Checking how dates are stored and returned for Operator Algebras...\n');

    const meeting = await pool.query(`
      SELECT
        program_name,
        type,
        date,
        to_char(date, 'YYYY-MM-DD') as date_string,
        to_char(date, 'YYYY-MM-DD HH24:MI:SS TZ') as date_full,
        extract(dow from date) as day_of_week
      FROM meetings
      WHERE review_id = $1
        AND program_name = 'Operator Algebras and Quantum Information'
        AND type = 'Evaluation meeting/lunch'
      LIMIT 1
    `, [reviewId]);

    if (meeting.rows.length > 0) {
      const m = meeting.rows[0];
      console.log('Program:', m.program_name);
      console.log('Type:', m.type);
      console.log('Date object:', m.date);
      console.log('Date as string:', m.date_string);
      console.log('Date full:', m.date_full);
      console.log('Day of week:', m.day_of_week, '(5 = Friday)');
      console.log('');
      console.log('JavaScript will receive:', JSON.stringify(m.date));
      console.log('');

      const jsDate = new Date(m.date);
      console.log('JavaScript Date object:', jsDate);
      console.log('JavaScript day:', jsDate.getDay(), '(5 = Friday)');
      console.log('JavaScript toISOString():', jsDate.toISOString());
      console.log('JavaScript toLocaleDateString(sv-SE):', jsDate.toLocaleDateString('sv-SE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

checkDateFormat();
