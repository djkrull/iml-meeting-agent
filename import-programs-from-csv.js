const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const db = new sqlite3.Database('./server/reviews.db');
const CSV_PATH = 'C:\\Users\\chrwah28.KVA\\Downloads\\Verksamhetsplanering 2026-2029.csv';

// Swedish month names
const MONTHS = {
  'januari': 0, 'februari': 1, 'mars': 2, 'april': 3,
  'maj': 4, 'juni': 5, 'juli': 6, 'augusti': 7,
  'september': 8, 'oktober': 9, 'november': 10, 'december': 11
};

function parseDate(dateStr, year) {
  if (!dateStr) return null;

  // Match "15 januari" or "15-17 juni" or "15 januari - 17 juni"
  const singleDate = /^(\d{1,2})\s+(\w+)$/;
  const dateRange = /^(\d{1,2})\s*(?:-|–)\s*(\d{1,2})\s+(\w+)$/;
  const crossMonth = /^(\d{1,2})\s+(\w+)\s*(?:-|–)\s*(\d{1,2})\s+(\w+)$/;

  let match;

  if ((match = dateStr.match(crossMonth))) {
    const day1 = parseInt(match[1]);
    const month1 = MONTHS[match[2].toLowerCase()];
    const day2 = parseInt(match[3]);
    const month2 = MONTHS[match[4].toLowerCase()];
    if (month1 === undefined || month2 === undefined) return null;
    return {
      start: new Date(Date.UTC(year, month1, day1)),
      end: new Date(Date.UTC(year, month2, day2))
    };
  }

  if ((match = dateStr.match(dateRange))) {
    const day1 = parseInt(match[1]);
    const day2 = parseInt(match[2]);
    const month = MONTHS[match[3].toLowerCase()];
    if (month === undefined) return null;
    return {
      start: new Date(Date.UTC(year, month, day1)),
      end: new Date(Date.UTC(year, month, day2))
    };
  }

  if ((match = dateStr.match(singleDate))) {
    const day = parseInt(match[1]);
    const month = MONTHS[match[2].toLowerCase()];
    if (month === undefined) return null;
    const d = new Date(Date.UTC(year, month, day));
    return { start: d, end: d };
  }

  return null;
}

function categorizeProgram(name, dateStr, startDate, endDate) {
  if (!name) return 'Spring Program';

  const lowerName = name.toLowerCase();

  if (lowerName.includes('klein')) return 'Kleindagarna';

  // Count month names in date string to detect cross-month programs
  const monthNames = Object.keys(MONTHS);
  const monthMatches = monthNames.filter(m => dateStr && dateStr.toLowerCase().includes(m));
  const isCrossMonth = monthMatches.length >= 2;

  // Also check duration: Spring/Fall programs are 3+ months; Summer Conferences are ~1 week
  const durationDays = startDate && endDate
    ? Math.round((endDate - startDate) / (1000 * 60 * 60 * 24))
    : 0;
  const isLongProgram = durationDays >= 30;

  if (startDate) {
    const month = startDate.getUTCMonth();

    // Long programs (3+ months) → Spring or Fall
    if (isLongProgram || isCrossMonth) {
      if (month >= 0 && month <= 4) return 'Spring Program';
      if (month >= 7 && month <= 11) return 'Fall Program';
    }

    // Short programs in May-August → Summer Conference
    if (month >= 4 && month <= 7) return 'Summer Conference';
  }

  return 'Summer Conference';
}

function parseCSV(csvText) {
  const programs = [];
  const lines = csvText.split('\n');

  let currentRow = '';
  let inQuotes = false;
  const rows = [];

  // Handle multi-line quoted fields
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const char of line) {
      if (char === '"') inQuotes = !inQuotes;
    }
    currentRow += (currentRow ? '\n' : '') + line;
    if (!inQuotes) {
      rows.push(currentRow);
      currentRow = '';
    }
  }

  // Skip header
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row.trim()) continue;

    // Parse semicolon-separated with quoted fields
    const fields = [];
    let field = '';
    let inQ = false;

    for (const c of row) {
      if (c === '"') {
        inQ = !inQ;
      } else if (c === ';' && !inQ) {
        fields.push(field.trim());
        field = '';
      } else {
        field += c;
      }
    }
    fields.push(field.trim());

    const year = parseInt(fields[0]);
    const dateStr = fields[1];
    const name = fields[2];
    const organizer = (fields[3] || '').replace(/\n/g, ' / ').replace(/\s+/g, ' ').trim();
    const confirmed = fields[5];

    if (!year || !name || !dateStr) continue;

    // Skip board meetings and similar
    const excluded = ['styrelsemöte', 'prefektmöte', 'board meeting', 'acta editorial', 'minneshögtid'];
    if (excluded.some(e => name.toLowerCase().includes(e))) continue;

    // Skip placeholder entries
    if (name === 'Title' || name === 'TBD') continue;

    const dates = parseDate(dateStr, year);
    if (!dates) {
      console.log(`  ⚠️  Could not parse date: "${dateStr}" for ${name}`);
      continue;
    }

    const type = categorizeProgram(name, dateStr, dates.start, dates.end);

    programs.push({
      year,
      name,
      type,
      startDate: dates.start,
      endDate: dates.end,
      organizer: organizer || 'Unknown',
      status: confirmed === 'JA' ? 'Confirmed' : 'Planned'
    });
  }

  return programs;
}

// Main import
const csvText = fs.readFileSync(CSV_PATH, 'latin1');
const programs = parseCSV(csvText);

console.log(`\n📊 Parsed ${programs.length} programs from CSV\n`);

// Filter: only 2026+ and not ended
const today = new Date();
today.setHours(0, 0, 0, 0);

const futureOrOngoing = programs.filter(p =>
  p.year >= 2026 && (!p.endDate || p.endDate >= today)
);

console.log(`Keeping ${futureOrOngoing.length} programs (2026+, not ended):\n`);

// Group by year and type
const byYear = {};
futureOrOngoing.forEach(p => {
  if (!byYear[p.year]) byYear[p.year] = {};
  if (!byYear[p.year][p.type]) byYear[p.year][p.type] = [];
  byYear[p.year][p.type].push(p);
});

Object.keys(byYear).sort().forEach(year => {
  console.log(`\n${year}:`);
  Object.keys(byYear[year]).sort().forEach(type => {
    console.log(`  ${type}: ${byYear[year][type].length} programs`);
    byYear[year][type].forEach(p => {
      const start = p.startDate.toISOString().substring(0, 10);
      const end = p.endDate.toISOString().substring(0, 10);
      console.log(`    • ${p.name} (${start} → ${end})`);
    });
  });
});

// DRY RUN - just show what would be imported
console.log('\n\n🔍 DRY RUN - no database changes made');
console.log('Run with --execute flag to actually import\n');

if (process.argv.includes('--execute')) {
  console.log('\n💾 INSERTING INTO DATABASE...\n');

  db.serialize(() => {
    db.run('DELETE FROM programs', (err) => {
      if (err) console.error('Error deleting:', err);
      else console.log('✅ Cleared existing programs');
    });

    const stmt = db.prepare(`
      INSERT INTO programs (program_id, name, type, start_date, end_date, organizer, status, year, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();

    futureOrOngoing.forEach((p, idx) => {
      stmt.run(
        idx + 1,
        p.name,
        p.type,
        p.startDate.toISOString(),
        p.endDate ? p.endDate.toISOString() : null,
        p.organizer,
        p.status,
        p.year,
        now,
        now
      );
    });

    stmt.finalize((err) => {
      if (err) console.error('Error finalizing:', err);
      else console.log(`✅ Inserted ${futureOrOngoing.length} programs into database`);
      db.close();
    });
  });
} else {
  db.close();
}
