const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./server/reviews.db');

console.log('\n🔍 DEBUGGING SUMMER 2027 MEETINGS\n');

// Check all Summer Conference meetings
db.all(`
  SELECT
    strftime('%Y-%m-%d', date) as date,
    time,
    type,
    program_name,
    program_year
  FROM meetings
  WHERE program_type = 'Summer Conference'
  ORDER BY date
`, (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log(`Total Summer Conference meetings: ${rows.length}\n`);

    const by2026 = rows.filter(r => r.program_year === 2026).length;
    const by2027 = rows.filter(r => r.program_year === 2027).length;

    console.log(`2026: ${by2026} meetings`);
    console.log(`2027: ${by2027} meetings\n`);

    if (by2027 > 0) {
      console.log('2027 SUMMER CONFERENCES:');
      rows.filter(r => r.program_year === 2027).forEach(m => {
        console.log(`  ${m.date} @ ${m.time} - ${m.type}`);
      });
    } else {
      console.log('❌ NO 2027 SUMMER CONFERENCE MEETINGS FOUND!');
      console.log('\n2026 MEETINGS (for reference):');
      rows.filter(r => r.program_year === 2026).forEach(m => {
        console.log(`  ${m.date} @ ${m.time} - ${m.type}`);
      });
    }
  }

  db.close();
});
