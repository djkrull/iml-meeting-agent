const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

async function checkTitleProgram() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Checking for "Title" program and its meetings...\n');

    // Check programs
    const programs = await pool.query(`
      SELECT name, type, year FROM programs WHERE name = 'Title'
    `);

    console.log(`Programs named "Title": ${programs.rows.length}`);
    programs.rows.forEach(p => {
      console.log(`  - ${p.type}, ${p.year}`);
    });

    // Check program_meetings
    const meetings = await pool.query(`
      SELECT type, date, time FROM program_meetings WHERE program_name = 'Title'
    `);

    console.log(`\nMeetings for "Title" program: ${meetings.rows.length}`);
    meetings.rows.forEach(m => {
      console.log(`  - ${m.type}, ${m.date.toISOString().split('T')[0]}, ${m.time}`);
    });

    if (meetings.rows.length > 0) {
      console.log('\n⚠️ These are ORPHAN meetings linked to placeholder "Title" program');
      console.log('Should delete them from director review');
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

checkTitleProgram();
