const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./server/reviews.db');

db.all(`
  SELECT
    name,
    year,
    strftime('%Y-%m-%d', start_date) as start_date,
    strftime('%Y-%m-%d', end_date) as end_date
  FROM programs
  ORDER BY year DESC, start_date
`, (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('\n📋 PROGRAM DATES:\n');

    const by2027 = rows.filter(r => r.year === 2027);
    const by2026 = rows.filter(r => r.year === 2026);

    console.log(`2027 PROGRAMS (${by2027.length}):\n`);
    by2027.forEach(p => {
      console.log(`  ${p.name}`);
      console.log(`    ${p.start_date} → ${p.end_date}\n`);
    });

    console.log(`\n2026 PROGRAMS (${by2026.length}):\n`);
    by2026.forEach(p => {
      console.log(`  ${p.name}`);
      console.log(`    ${p.start_date} → ${p.end_date}\n`);
    });
  }

  db.close();
});
