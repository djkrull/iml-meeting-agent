const { Pool } = require('pg');
const fs = require('fs');

const DATABASE_URL = 'postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway';
const CSV_PATH = 'C:\\Users\\chrwah28.KVA\\Downloads\\Verksamhetsplanering 2026-2029.csv';

const MONTHS = {
  'januari': 0, 'februari': 1, 'mars': 2, 'april': 3,
  'maj': 4, 'juni': 5, 'juli': 6, 'augusti': 7,
  'september': 8, 'oktober': 9, 'november': 10, 'december': 11
};

// Parse dates in LOCAL (Swedish/CET) time — matches the frontend's convention.
// Using new Date(year, month, day) creates a date at local midnight.
function parseDate(dateStr, year) {
  if (!dateStr) return null;
  const crossMonth = /^(\d{1,2})\s+(\w+)\s*[-–]\s*(\d{1,2})\s+(\w+)$/;
  const dateRange = /^(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(\w+)$/;
  const singleDate = /^(\d{1,2})\s+(\w+)$/;

  let m;
  if ((m = dateStr.match(crossMonth))) {
    const m1 = MONTHS[m[2].toLowerCase()], m2 = MONTHS[m[4].toLowerCase()];
    if (m1 === undefined || m2 === undefined) return null;
    return { start: new Date(year, m1, +m[1]), end: new Date(year, m2, +m[3]) };
  }
  if ((m = dateStr.match(dateRange))) {
    const mo = MONTHS[m[3].toLowerCase()];
    if (mo === undefined) return null;
    return { start: new Date(year, mo, +m[1]), end: new Date(year, mo, +m[2]) };
  }
  if ((m = dateStr.match(singleDate))) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo === undefined) return null;
    const d = new Date(year, mo, +m[1]);
    return { start: d, end: d };
  }
  return null;
}

function categorize(name, dateStr, start, end) {
  if (!name) return 'Spring Program';
  const lower = name.toLowerCase();
  if (lower.includes('klein')) return 'Kleindagarna';

  const monthNames = Object.keys(MONTHS);
  const matches = monthNames.filter(mm => dateStr && dateStr.toLowerCase().includes(mm));
  const isCrossMonth = matches.length >= 2;
  const durDays = start && end ? Math.round((end - start) / 86400000) : 0;
  const isLong = durDays >= 30;

  if (start) {
    const mo = start.getMonth();
    if (isLong || isCrossMonth) {
      if (mo >= 0 && mo <= 4) return 'Spring Program';
      if (mo >= 7 && mo <= 11) return 'Fall Program';
    }
    if (mo >= 4 && mo <= 7) return 'Summer Conference';
  }
  return 'Summer Conference';
}

function parseCSV(text) {
  const lines = text.split('\n');
  const rows = [];
  let cur = '', inQ = false;
  for (const line of lines) {
    for (const c of line) if (c === '"') inQ = !inQ;
    cur += (cur ? '\n' : '') + line;
    if (!inQ) { rows.push(cur); cur = ''; }
  }
  return rows.map(row => {
    const fields = [];
    let f = '', q = false;
    for (const c of row) {
      if (c === '"') q = !q;
      else if (c === ';' && !q) { fields.push(f.trim()); f = ''; }
      else f += c;
    }
    fields.push(f.trim());
    return fields;
  });
}

// Meeting type definitions (mirror of frontend)
const springFallMeetings = [
  { name: 'Introduction Meeting', leadTime: -540, weekday: 5, time: '10:00', participants: ['Program Organizers', 'Directors', 'Admin Coordinator'], duration: 30, description: 'Initial program planning and expectations' },
  { name: 'Check-in meeting with organizers', leadTime: -180, weekday: 5, time: '14:00', participants: ['Program Organizers', 'Admin Team', 'Directors'], duration: 30, description: 'Review preparations and logistics' },
  { name: 'Check-in meeting junior fellows', leadTime: -180, weekday: 5, time: '14:30', participants: ['Junior Fellows', 'Admin Team', 'Directors'], duration: 30, description: 'Junior fellow orientation and support' },
  { name: 'Onboarding meeting', leadTime: -6, weekday: 5, time: '14:00', participants: ['Admin Team', 'Organizers', 'Directors'], duration: 30, description: 'Practical information and house rules' },
  { name: 'Program Start Meeting', leadTime: 0, time: '09:00', participants: ['Program Organizers', 'All Participants', 'Directors'], duration: 30, description: 'Official program kickoff' },
  { name: 'Mid-term meeting', leadTime: 45, weekday: 5, time: '14:00', participants: ['Program Organizers', 'Admin Team', 'Directors'], duration: 30, description: 'Progress check and adjustments' },
  { name: 'Evaluation meeting/lunch', leadTime: 'end', time: '12:00', participants: ['Program Organizers', 'Directors'], duration: 90, description: 'Program evaluation and feedback' }
];

const summerConferenceMeetings = [
  { name: 'Weekly Onboarding meeting light', leadTime: 0, recurring: 'weekly', weekday: 1, time: '09:30', participants: ['Organizers', 'Admin Team'], duration: 30, description: 'Weekly orientation for new participants' },
  { name: 'Weekly Welcome Meeting', leadTime: 0, recurring: 'weekly', weekday: 1, time: '10:00', participants: ['All Conference Participants'], duration: 15, description: 'Weekly welcome and updates' }
];

function calcMeetingDate(startDate, endDate, leadTime, weekday, programType) {
  if (!startDate) return null;
  if (leadTime === 'end') {
    if (programType === 'Spring Program' || programType === 'Fall Program') {
      if (!endDate) return null;
      let d = new Date(endDate);
      const dow = d.getDay();
      if (dow === 5) return d;
      if (dow === 6) { d.setDate(d.getDate() - 1); return d; }
      d.setDate(d.getDate() - (dow === 0 ? 2 : dow + 2));
      return d;
    }
  }
  const d = new Date(startDate.getTime());
  d.setDate(d.getDate() + leadTime);
  if (weekday !== undefined) {
    const cur = d.getDay();
    if (cur !== weekday) {
      let add = weekday - cur;
      if (add <= 0) add += 7;
      d.setDate(d.getDate() + add);
    }
  }
  return d;
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    console.log('\n📦 IMPORTING MISSING PROGRAMS TO PRODUCTION\n');

    const csv = fs.readFileSync(CSV_PATH, 'latin1');
    const rows = parseCSV(csv);

    const programs = [];
    for (let i = 1; i < rows.length; i++) {
      const f = rows[i];
      if (!f[0] || !f[2]) continue;
      const year = parseInt(f[0]);
      const dateStr = f[1];
      const name = f[2];
      const organizer = (f[3] || 'Unknown').replace(/\n/g, ' / ').replace(/\s+/g, ' ').trim();

      if (!year || year < 2026) continue;
      const excluded = ['styrelsemöte', 'prefektmöte', 'board meeting', 'acta editorial', 'minneshögtid'];
      if (excluded.some(e => name.toLowerCase().includes(e))) continue;
      if (['Title', 'TBD', 'Unnamed Program'].includes(name)) continue;

      const dates = parseDate(dateStr, year);
      if (!dates) continue;

      const type = categorize(name, dateStr, dates.start, dates.end);
      programs.push({ year, name, type, startDate: dates.start, endDate: dates.end, organizer });
    }

    // Enforce max 1 Spring/Fall per year (keep longest)
    ['Spring Program', 'Fall Program'].forEach(mt => {
      const byYear = {};
      programs.forEach((p, idx) => {
        if (p.type !== mt) return;
        if (!byYear[p.year]) byYear[p.year] = [];
        byYear[p.year].push({ p, idx });
      });
      Object.values(byYear).forEach(list => {
        if (list.length > 1) {
          list.sort((a, b) => (b.p.endDate - b.p.startDate) - (a.p.endDate - a.p.startDate));
          list.slice(1).forEach(({ p, idx }) => {
            console.log(`  Reclassifying "${p.name}" (${p.year}) from ${mt} to Summer Conference`);
            programs[idx].type = 'Summer Conference';
          });
        }
      });
    });

    const now = new Date().toISOString();

    console.log(`\nInserting ${programs.length} programs (skip if exists)...`);
    let progInserted = 0, progSkipped = 0;
    for (let i = 0; i < programs.length; i++) {
      const p = programs[i];
      try {
        const r = await pool.query(
          `INSERT INTO programs (program_id, name, type, start_date, end_date, organizer, status, year, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT ON CONSTRAINT programs_unique_idx DO NOTHING
           RETURNING id`,
          [i + 1, p.name, p.type, p.startDate.toISOString(), p.endDate?.toISOString(), p.organizer, 'Confirmed', p.year, now, now]
        );
        if (r.rows.length > 0) progInserted++;
        else progSkipped++;
      } catch (err) {
        console.error(`  Error on ${p.name}:`, err.message);
      }
    }
    console.log(`  ✅ ${progInserted} inserted, ${progSkipped} already existed`);

    // Generate meetings for all programs
    console.log(`\nGenerating and inserting meetings...`);
    const meetings = [];
    let meetingId = 1;
    const sharedKeys = new Set();

    programs.forEach(program => {
      const defs = program.type === 'Summer Conference' ? summerConferenceMeetings
                 : (program.type === 'Spring Program' || program.type === 'Fall Program') ? springFallMeetings
                 : [];

      defs.forEach(mt => {
        if (mt.recurring === 'weekly' && program.endDate) {
          // Weekly meetings
          const maxWeeks = program.type === 'Summer Conference' ? 2 : 52;
          let cur = new Date(program.startDate);
          let wc = 0;
          while (cur <= program.endDate && wc < maxWeeks) {
            if (cur.getDay() === mt.weekday) {
              meetings.push({
                id: meetingId++, programId: program.year * 100 + programs.indexOf(program),
                programName: program.name, programType: program.type,
                programYear: program.year, programOrganizer: program.organizer,
                type: mt.name, date: new Date(cur), time: mt.time,
                duration: mt.duration, participants: mt.participants,
                description: mt.description
              });
              wc++;
            }
            cur.setDate(cur.getDate() + 1);
          }
        } else if (!mt.recurring) {
          const d = calcMeetingDate(program.startDate, program.endDate, mt.leadTime, mt.weekday, program.type);
          if (d) {
            meetings.push({
              id: meetingId++, programId: program.year * 100 + programs.indexOf(program),
              programName: program.name, programType: program.type,
              programYear: program.year, programOrganizer: program.organizer,
              type: mt.name, date: d, time: mt.time,
              duration: mt.duration, participants: mt.participants,
              description: mt.description
            });
          }
        }
      });
    });

    // Filter to future meetings
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const future = meetings.filter(m => m.date >= today);

    console.log(`  Generated ${future.length} future meetings`);

    let meetInserted = 0, meetSkipped = 0;
    for (const m of future) {
      try {
        const r = await pool.query(
          `INSERT INTO program_meetings (meeting_id, program_id, program_name, program_type, program_year, program_organizer, type, date, time, duration, participants, description, status, approved, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT ON CONSTRAINT program_meetings_unique_idx DO NOTHING
           RETURNING id`,
          [m.id, m.programId, m.programName, m.programType, m.programYear, m.programOrganizer,
           m.type, m.date.toISOString(), m.time, m.duration, JSON.stringify(m.participants),
           m.description, 'pending', false, now, now]
        );
        if (r.rows.length > 0) meetInserted++;
        else meetSkipped++;
      } catch (err) {
        console.error(`  Error on ${m.type} (${m.programName}):`, err.message);
      }
    }
    console.log(`  ✅ ${meetInserted} meetings inserted, ${meetSkipped} already existed`);

    // Delete Specialkonferens
    const del = await pool.query(`DELETE FROM program_meetings WHERE program_name = 'Specialkonferens'`);
    const del2 = await pool.query(`DELETE FROM programs WHERE name = 'Specialkonferens'`);
    console.log(`\n🗑️  Deleted ${del2.rowCount} Specialkonferens program(s) and ${del.rowCount} meetings`);

    console.log('\n✅ DONE');
  } catch (err) {
    console.error('FATAL:', err);
  } finally {
    await pool.end();
  }
}

main();
