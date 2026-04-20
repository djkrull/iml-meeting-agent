const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./server/reviews.db');

db.all(`
  SELECT
    strftime('%Y-%m-%d', date) as date,
    time,
    type,
    program_name,
    participants
  FROM meetings
  WHERE strftime('%Y', date) = '2026'
    AND strftime('%m', date) = '03'
  ORDER BY date, time
`, (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else if (rows && rows.length > 0) {
    console.log('\n📅 Möten i mars 2026:\n');
    rows.forEach(r => {
      console.log(`${r.date} at ${r.time}`);
      console.log(`  Type: ${r.type}`);
      console.log(`  Program: ${r.program_name}`);
      console.log('');
    });
  } else {
    console.log('Inga möten hittades i mars 2026');
  }
  db.close();
});
