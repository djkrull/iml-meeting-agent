const { dbHelpers } = require('./db');

async function check() {
  try {
    // Get all reviews
    const db = require('./db').db;
    const pool = require('./db').pool;
    const USE_POSTGRES = process.env.DATABASE_URL ? true : false;

    console.log('Checking for director approvals...\n');

    if (USE_POSTGRES) {
      // Check PostgreSQL
      const reviews = await pool.query('SELECT * FROM reviews ORDER BY created_at DESC LIMIT 5');
      console.log(`Found ${reviews.rows.length} recent reviews\n`);

      for (const review of reviews.rows) {
        console.log(`Review ID: ${review.id}`);
        console.log(`Created: ${review.created_at}`);

        const meetings = await pool.query('SELECT * FROM meetings WHERE review_id = $1', [review.id]);
        console.log(`  Meetings: ${meetings.rows.length}`);

        const approvals = await pool.query(
          'SELECT a.*, m.type as meeting_type FROM approvals a JOIN meetings m ON a.meeting_id = m.id WHERE m.review_id = $1',
          [review.id]
        );
        console.log(`  Approvals: ${approvals.rows.length}`);

        if (approvals.rows.length > 0) {
          console.log('  Director responses:');
          approvals.rows.forEach(a => {
            console.log(`    - ${a.director_name}: ${a.status} (${a.meeting_type})`);
          });
        }
        console.log('');
      }
    } else {
      // Check SQLite
      db.all('SELECT * FROM reviews ORDER BY created_at DESC LIMIT 5', (err, reviews) => {
        if (err) {
          console.error('Error:', err);
          process.exit(1);
        }

        console.log(`Found ${reviews.length} recent reviews\n`);

        let processed = 0;
        reviews.forEach(review => {
          console.log(`Review ID: ${review.id}`);
          console.log(`Created: ${review.created_at}`);

          db.all('SELECT * FROM meetings WHERE review_id = ?', [review.id], (err, meetings) => {
            if (err) return;
            console.log(`  Meetings: ${meetings.length}`);

            db.all(
              'SELECT a.*, m.type as meeting_type FROM approvals a JOIN meetings m ON a.meeting_id = m.id WHERE m.review_id = ?',
              [review.id],
              (err, approvals) => {
                if (err) return;
                console.log(`  Approvals: ${approvals.length}`);

                if (approvals.length > 0) {
                  console.log('  Director responses:');
                  approvals.forEach(a => {
                    console.log(`    - ${a.director_name}: ${a.status} (${a.meeting_type})`);
                  });
                }
                console.log('');

                processed++;
                if (processed === reviews.length) {
                  process.exit(0);
                }
              }
            );
          });
        });
      });
    }

    if (USE_POSTGRES) {
      await pool.end();
      process.exit(0);
    }
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

check();
