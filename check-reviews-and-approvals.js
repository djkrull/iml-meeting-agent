const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./server/reviews.db');

console.log('\n📋 REVIEWS IN DATABASE:\n');

db.all('SELECT * FROM reviews', (err, reviews) => {
  if (err) {
    console.error('Error:', err);
  } else if (reviews.length === 0) {
    console.log('❌ No reviews found in database');
  } else {
    console.log(`Found ${reviews.length} reviews:\n`);
    reviews.forEach(r => {
      console.log(`  Review ID: ${r.id}`);
      console.log(`  Created: ${r.created_at}`);
      console.log(`  Status: ${r.status}`);
      console.log('');
    });
  }

  // Check meetings with review_id
  console.log('\n📊 MEETINGS LINKED TO REVIEWS:\n');

  db.all(`
    SELECT
      m.id,
      m.type,
      m.program_name,
      m.review_id,
      strftime('%Y-%m-%d', m.date) as date,
      m.time,
      COUNT(a.id) as approval_count
    FROM meetings m
    LEFT JOIN approvals a ON m.id = a.meeting_id
    WHERE m.review_id IS NOT NULL
    GROUP BY m.id
  `, (err2, rows) => {
    if (err2) {
      console.error('Error:', err2);
    } else if (rows.length === 0) {
      console.log('❌ No meetings linked to reviews');
    } else {
      console.log(`Found ${rows.length} meetings with reviews:\n`);
      rows.forEach(r => {
        console.log(`  ${r.date} - ${r.type} (${r.program_name})`);
        console.log(`    Review ID: ${r.review_id}`);
        console.log(`    Approvals: ${r.approval_count}`);
        console.log('');
      });
    }

    // Check all approvals
    console.log('\n🔍 ALL APPROVALS IN TABLE:\n');

    db.all(`
      SELECT
        a.id,
        a.meeting_id,
        a.director_name,
        a.status,
        m.type,
        m.program_name,
        strftime('%Y-%m-%d', m.date) as date
      FROM approvals a
      LEFT JOIN meetings m ON a.meeting_id = m.id
      ORDER BY a.timestamp DESC
    `, (err3, approvals) => {
      if (err3) {
        console.error('Error:', err3);
      } else if (approvals.length === 0) {
        console.log('❌ No approvals in database');
      } else {
        console.log(`Found ${approvals.length} approvals:\n`);
        approvals.forEach(a => {
          console.log(`  Approval #${a.id} (meeting #${a.meeting_id})`);
          console.log(`    ${a.date} - ${a.type} (${a.program_name})`);
          console.log(`    ${a.director_name}: ${a.status}`);
          console.log('');
        });
      }

      db.close();
    });
  });
});
