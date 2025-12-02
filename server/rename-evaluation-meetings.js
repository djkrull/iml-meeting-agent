const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';

async function renameEvaluationMeetings() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Updating Evaluation meetings...\n');

    // Update in program_meetings (admin database)
    console.log('=== PROGRAM_MEETINGS (Admin) ===');

    const adminCount = await pool.query(`
      SELECT COUNT(*) as count
      FROM program_meetings
      WHERE type = 'Evaluation meeting'
        AND (program_type = 'Spring Program' OR program_type = 'Fall Program')
    `);

    console.log(`Found ${adminCount.rows[0].count} Evaluation meetings in Spring/Fall programs`);

    // Rename to "Evaluation meeting/lunch"
    const adminResult = await pool.query(`
      UPDATE program_meetings
      SET type = 'Evaluation meeting/lunch'
      WHERE type = 'Evaluation meeting'
        AND (program_type = 'Spring Program' OR program_type = 'Fall Program')
    `);

    console.log(`✅ Renamed ${adminResult.rowCount} meetings to "Evaluation meeting/lunch"`);

    // Update in meetings table (director reviews)
    console.log('\n=== MEETINGS (Director Reviews) ===');

    const reviewCount = await pool.query(`
      SELECT COUNT(*) as count
      FROM meetings
      WHERE type = 'Evaluation meeting'
        AND (program_type = 'Spring Program' OR program_type = 'Fall Program')
    `);

    console.log(`Found ${reviewCount.rows[0].count} Evaluation meetings in director reviews`);

    const reviewResult = await pool.query(`
      UPDATE meetings
      SET type = 'Evaluation meeting/lunch'
      WHERE type = 'Evaluation meeting'
        AND (program_type = 'Spring Program' OR program_type = 'Fall Program')
    `);

    console.log(`✅ Renamed ${reviewResult.rowCount} meetings in director reviews`);

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

renameEvaluationMeetings();
