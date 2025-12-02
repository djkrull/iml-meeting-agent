const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

async function cleanupTitlePrograms() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Checking for "Title" placeholder programs...\n');

    // Find programs with "Title" as name
    const titlePrograms = await pool.query(`
      SELECT name, type, year, organizer
      FROM programs
      WHERE name = 'Title'
    `);

    console.log(`Found ${titlePrograms.rows.length} programs with "Title" placeholder`);
    titlePrograms.rows.forEach(p => {
      console.log(`  - Type: ${p.type}, Year: ${p.year}, Organizer: ${p.organizer}`);
    });

    if (titlePrograms.rows.length > 0) {
      console.log('\nDeleting placeholder programs...');

      const result = await pool.query(`
        DELETE FROM programs WHERE name = 'Title'
      `);

      console.log(`✅ Deleted ${result.rowCount} placeholder programs`);
    }

    // Also check meetings associated with "Title" programs
    const titleMeetings = await pool.query(`
      SELECT COUNT(*) as count
      FROM program_meetings
      WHERE program_name = 'Title'
    `);

    console.log(`\nMeetings linked to "Title" programs: ${titleMeetings.rows[0].count}`);

    if (titleMeetings.rows[0].count > 0) {
      console.log('Deleting meetings linked to placeholder programs...');

      const meetingResult = await pool.query(`
        DELETE FROM program_meetings WHERE program_name = 'Title'
      `);

      console.log(`✅ Deleted ${meetingResult.rowCount} meetings linked to placeholders`);
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

cleanupTitlePrograms();
