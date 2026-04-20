const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway',
  ssl: { rejectUnauthorized: false }
});

async function validate() {
  try {
    console.log('\n🔍 PRODUCTION DATABASE VALIDATION\n');
    console.log('='.repeat(60));

    // 1. Total programs + meetings
    const progCount = await pool.query('SELECT COUNT(*) FROM programs');
    const meetCount = await pool.query('SELECT COUNT(*) FROM program_meetings');
    console.log(`\n📊 TOTALS:`);
    console.log(`  Programs: ${progCount.rows[0].count}`);
    console.log(`  Meetings: ${meetCount.rows[0].count}`);

    // 2. Programs by year/type
    console.log('\n📋 PROGRAMS BY YEAR/TYPE:');
    const byYT = await pool.query(`
      SELECT year, type, COUNT(*) as c
      FROM programs
      GROUP BY year, type
      ORDER BY year, type
    `);
    byYT.rows.forEach(r => {
      console.log(`  ${r.year} ${r.type}: ${r.c}`);
    });

    // 3. Duplicate Spring/Fall per year (business rule violation)
    console.log('\n⚠️  BUSINESS RULE CHECK (max 1 Spring/Fall per year):');
    const dups = await pool.query(`
      SELECT year, type, COUNT(*) as c, STRING_AGG(name, ' | ') as names
      FROM programs
      WHERE type IN ('Spring Program', 'Fall Program')
      GROUP BY year, type
      HAVING COUNT(*) > 1
    `);
    if (dups.rows.length === 0) {
      console.log('  ✅ No duplicates');
    } else {
      dups.rows.forEach(r => {
        console.log(`  ❌ ${r.year} ${r.type}: ${r.c} entries`);
        console.log(`     → ${r.names}`);
      });
    }

    // 4. Placeholder programs
    console.log('\n🧹 PLACEHOLDER PROGRAMS:');
    const placeholders = await pool.query(`
      SELECT name, type, year, organizer
      FROM programs
      WHERE name IN ('Title', 'TBD', 'Untitled', 'Unnamed Program')
         OR LOWER(name) LIKE '%minneshögtid%'
    `);
    if (placeholders.rows.length === 0) {
      console.log('  ✅ None found');
    } else {
      placeholders.rows.forEach(p => {
        console.log(`  ❌ ${p.name} (${p.type} ${p.year})`);
      });
    }

    // 5. Time conflicts
    console.log('\n⏰ TIME CONFLICTS (same date + time):');
    const conflicts = await pool.query(`
      SELECT
        TO_CHAR(date, 'YYYY-MM-DD') as d, time, COUNT(*) as c,
        STRING_AGG(type || ' (' || program_name || ')', ' | ') as meetings
      FROM program_meetings
      WHERE date >= CURRENT_DATE
      GROUP BY date, time
      HAVING COUNT(*) > 1
      ORDER BY date, time
    `);
    if (conflicts.rows.length === 0) {
      console.log('  ✅ No conflicts');
    } else {
      conflicts.rows.forEach(c => {
        console.log(`  ❌ ${c.d} @ ${c.time}: ${c.c} meetings`);
        console.log(`     ${c.meetings}`);
      });
    }

    // 6. Expected programs check
    console.log('\n✅ EXPECTED PROGRAMS CHECK:');
    const expected = [
      { year: 2027, name: 'Quantum Fields, Probability, and Geometry', type: 'Spring Program' },
      { year: 2027, name: 'Triangulated Categories', type: 'Fall Program' },
      { year: 2028, name: 'Subelliptic and Magnetic Operators and Their Interactions', type: 'Spring Program' },
      { year: 2028, name: 'Frontiers in Optimal Control: Geometry, Complexity, and Learning', type: 'Fall Program' },
      { year: 2029, name: 'Algebraic K-theory in infinite dimensions', type: 'Spring Program' },
      { year: 2027, name: 'AI for Mathematics', type: 'Summer Conference' },
      { year: 2027, name: 'Mathematics of Efficient AI with Scientific Applications', type: 'Summer Conference' },
      { year: 2027, name: 'Microlocal Analysis and Curved Spacetimes', type: 'Summer Conference' }
    ];

    for (const e of expected) {
      const r = await pool.query(
        'SELECT type FROM programs WHERE name = $1 AND year = $2',
        [e.name, e.year]
      );
      if (r.rows.length === 0) {
        console.log(`  ❌ MISSING: ${e.name} (${e.year})`);
      } else if (r.rows[0].type !== e.type) {
        console.log(`  ⚠️  WRONG TYPE: ${e.name} (${e.year}) — is "${r.rows[0].type}", should be "${e.type}"`);
      } else {
        console.log(`  ✅ ${e.name} (${e.year}) → ${e.type}`);
      }
    }

    // 7. Meetings per year summary
    console.log('\n📅 MEETINGS PER YEAR:');
    const meetByYear = await pool.query(`
      SELECT EXTRACT(YEAR FROM date)::int as year, COUNT(*) as c
      FROM program_meetings
      GROUP BY year
      ORDER BY year
    `);
    meetByYear.rows.forEach(r => {
      console.log(`  ${r.year}: ${r.c} meetings`);
    });

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

validate();
