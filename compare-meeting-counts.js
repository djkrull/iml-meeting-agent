const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./server/reviews.db');

db.all(`
  SELECT
    strftime('%Y', date) as year,
    COUNT(*) as total_meetings,
    COUNT(DISTINCT program_name) as programs,
    COUNT(DISTINCT type) as meeting_types
  FROM meetings
  WHERE strftime('%Y', date) IN ('2026', '2027')
  GROUP BY year
  ORDER BY year
`, (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('\n📊 MEETING COUNTS COMPARISON:\n');
    rows.forEach(r => {
      console.log(`${r.year}: ${r.total_meetings} meetings | ${r.programs} programs | ${r.meeting_types} meeting types`);
    });

    // Check weekly meetings specifically
    console.log('\n\n📌 WEEKLY MEETINGS:\n');
    db.all(`
      SELECT
        strftime('%Y', date) as year,
        COUNT(*) as count
      FROM meetings
      WHERE type LIKE '%Weekly%' OR type LIKE '%Welcome%'
      GROUP BY year
      ORDER BY year
    `, (err2, weeklyRows) => {
      if (err2) {
        console.error('Error:', err2);
      } else {
        weeklyRows.forEach(r => {
          console.log(`${r.year}: ${r.count} weekly/welcome meetings`);
        });
      }

      db.close();
    });
  }
});
