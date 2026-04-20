const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./server/reviews.db');

// Check approvals table schema
db.all("PRAGMA table_info(approvals)", (err, cols) => {
  if (err) {
    console.error('Error getting approvals schema:', err);
  } else {
    console.log('\n📋 APPROVALS TABLE SCHEMA:\n');
    cols.forEach(col => {
      console.log(`  ${col.name}: ${col.type}${col.notnull ? ' (NOT NULL)' : ''}`);
    });
  }

  // Now get director responses for meetings after summer 2026
  console.log('\n\n🔍 DIRECTOR RESPONSES FOR MEETINGS AFTER 2026-06-30:\n');

  db.all(`
    SELECT
      m.type,
      m.program_name,
      strftime('%Y-%m-%d', m.date) as meeting_date,
      COUNT(a.id) as response_count,
      GROUP_CONCAT(a.director_name, ', ') as directors
    FROM meetings m
    LEFT JOIN approvals a ON m.id = a.meeting_id
    WHERE m.date > '2026-06-30'
    GROUP BY m.id
    HAVING response_count > 0
    ORDER BY m.date
  `, (err, rows) => {
    if (err) {
      console.error('Error:', err);
    } else if (rows && rows.length > 0) {
      console.log(`Found ${rows.length} meetings with director responses:\n`);
      rows.forEach(r => {
        console.log(`${r.meeting_date} - ${r.type} (${r.program_name})`);
        console.log(`  Directors responded: ${r.response_count}\n`);
      });
    } else {
      console.log('✅ NO director responses found for meetings after 2026-06-30');
    }

    db.close();
  });
});
