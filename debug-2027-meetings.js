const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./server/reviews.db');

console.log('\n📅 2027 MEETINGS ANALYSIS\n');

db.all(`
  SELECT
    type,
    program_name,
    COUNT(*) as count,
    MIN(strftime('%Y-%m-%d', date)) as first_date,
    MAX(strftime('%Y-%m-%d', date)) as last_date
  FROM meetings
  WHERE strftime('%Y', date) = '2027'
  GROUP BY type, program_name
  ORDER BY program_name, type
`, (err, rows) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }

  if (rows.length === 0) {
    console.log('❌ NO 2027 MEETINGS FOUND\n');
    db.close();
    return;
  }

  const byType = {};
  rows.forEach(r => {
    if (!byType[r.type]) byType[r.type] = [];
    byType[r.type].push(r);
  });

  console.log(`Found ${rows.length} meeting records for 2027\n`);
  console.log('BY TYPE:\n');
  Object.keys(byType).sort().forEach(type => {
    console.log(`${type}:`);
    byType[type].forEach(r => {
      console.log(`  • ${r.program_name}: ${r.count} meetings (${r.first_date} → ${r.last_date})`);
    });
    console.log('');
  });

  // Check for missing patterns
  console.log('\n⚠️  EXPECTED PATTERNS:\n');

  db.all(`
    SELECT DISTINCT program_name FROM meetings WHERE strftime('%Y', date) = '2026'
  `, (err2, programs2026) => {
    if (err2) {
      db.close();
      return;
    }

    console.log('Programs with 2026 meetings:');
    programs2026.forEach(p => {
      console.log(`  • ${p.program_name}`);
    });

    console.log('\n\nWIKLY MEETINGS CHECK (should exist for EACH program):\n');

    db.all(`
      SELECT DISTINCT program_name
      FROM meetings
      WHERE strftime('%Y', date) = '2027'
        AND (type LIKE '%Weekly%' OR type LIKE '%Welcome%')
    `, (err3, weekly2027) => {
      const weekly2027Names = weekly2027 ? weekly2027.map(w => w.program_name) : [];

      console.log('Programs WITH Weekly/Welcome meetings in 2027:');
      if (weekly2027Names.length === 0) {
        console.log('  ❌ NONE\n');
      } else {
        weekly2027Names.forEach(p => console.log(`  • ${p}`));
        console.log('');
      }

      console.log('Programs WITHOUT Weekly/Welcome meetings in 2027:');
      const missing = programs2026.filter(p => !weekly2027Names.includes(p.program_name));
      if (missing.length === 0) {
        console.log('  ✅ All have them');
      } else {
        missing.forEach(p => console.log(`  ❌ ${p.program_name}`));
      }

      db.close();
    });
  });
});
