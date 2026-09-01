// Golden parity test: the config-driven rule engine (src/utils/meetingRuleEngine)
// seeded from server/defaultSettings must produce IDENTICAL meeting dates to the
// reference logic below, for every non-weekly rule. Run: node test-rule-parity.js
//
// The reference logic is the historical hardcoded calculateMeetingDate. Two rules
// have since diverged from history by an explicit IML policy decision (2026-08,
// Sofie Upmark) — see the EXPECTED table. Everything else must still match the
// original hardcoded dates exactly.
const { Pool } = require('pg');
const { resolveMeetingDate } = require('./src/utils/meetingRuleEngine');
const { buildDefaultConfig } = require('./server/defaultSettings');

// --- replica of the OLD hardcoded calculateMeetingDate (verbatim behavior) ----
function oldCalc(startDate, endDate, leadTime, weekday, programType) {
  if (!startDate) return null;
  if (leadTime === 'end') {
    if (programType === 'Spring Program' || programType === 'Fall Program') {
      if (!endDate) return null;
      let evalDate = new Date(endDate);
      const endDay = evalDate.getDay();
      if (endDay === 5) return evalDate;
      else if (endDay === 6) evalDate.setDate(evalDate.getDate() - 1);
      else { const sub = endDay === 0 ? 2 : (endDay + 2); evalDate.setDate(evalDate.getDate() - sub); }
      return evalDate;
    }
  }
  let t = new Date(startDate.getTime());
  t.setDate(t.getDate() + leadTime);
  if (weekday !== undefined) {
    const cur = t.getDay();
    if (cur !== weekday) {
      let add = weekday - cur;
      if (add <= 0) add += 7;
      t.setDate(t.getDate() + add);
    }
  }
  return t;
}

// Reference for rules whose POLICY has moved them off the day-offset form.
// Kept separate from oldCalc so the historical replica above stays verbatim.
function policyCalc(startDate, { leadMonths, wd, snap }) {
  const t = new Date(startDate.getTime());
  t.setMonth(t.getMonth() + leadMonths);
  const step = snap === 'onOrBefore' ? -1 : 1;
  let guard = 0;
  while (t.getDay() !== wd && guard++ < 14) t.setDate(t.getDate() + step);
  return t;
}

// Expected leadTime/weekday by rule name. Unless flagged `policy`, these are the
// historical hardcoded values and must never drift.
const OLD = {
  'Introduction Meeting': { lead: -540, wd: 5, introGate: true },
  // POLICY 2026-09: moved from 180 days before start to 3 months before,
  // snapped on or before Friday. The 180-day form matched neither the working-
  // process document nor the dates communicated to organizers.
  'Check-in meeting with organizers': { leadMonths: -3, wd: 5, snap: 'onOrBefore', policy: '2026-09 three months before start' },
  'Check-in meeting junior fellows': { leadMonths: -3, wd: 5, snap: 'onOrBefore', policy: '2026-09 three months before start' },
  // POLICY 2026-08: moved from "Friday BEFORE start" (lead -5) to the first
  // Friday AFTER start. Verified against Fall 2026 (start Wed 2 Sep → Fri 4 Sep).
  'Onboarding meeting': { lead: 1, wd: 5, policy: '2026-08 first Friday after start' },
  // POLICY 2026-08: moved from "exactly on start" (lead 0, no weekday) to the
  // first Tuesday AFTER start, tied to the first seminar.
  // Verified against Fall 2026 (start Wed 2 Sep → Tue 8 Sep).
  'Program Start Meeting': { lead: 1, wd: 2, policy: '2026-08 first Tuesday after start' },
  'Mid-term meeting': { lead: 42, wd: 5 },
  'Evaluation meeting/lunch': { lead: 'end', wd: 5 },
  'Meeting with organizer and B&P': { lead: -120, wd: 5 },
  'Check-in meeting with Organizer': { lead: -45, wd: 5 },
  'Introduction Meeting - Group 1': { lead: -240, wd: 5 },
  'Introduction Meeting - Group 2': { lead: -240, wd: 5 },
  'Check-in Meeting - Group 1': { lead: -90, wd: 5 },
  'Check-in Meeting - Group 2': { lead: -90, wd: 5 },
  'Weekly Onboarding meeting light': { weekly: true, wd: 1 },
  'Weekly Welcome Meeting': { weekly: true, wd: 1 },
};

function oldIntroLead(type, year) {
  if (type === 'Fall Program' && year >= 2028) return -600;
  if (type === 'Spring Program' && year >= 2029) return -600;
  return -540;
}

const fmt = d => d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : 'null';

const config = buildDefaultConfig();
let checks = 0, mismatches = 0;

function checkProgram(p) {
  const rules = config.meetingRules[p.type] || [];
  rules.forEach(rule => {
    const old = OLD[rule.name];
    if (!old) { console.log(`  ?? no OLD mapping for "${rule.name}"`); return; }
    if (old.weekly) {
      // weekly: only the weekday matters (recurring loop is unchanged)
      checks++;
      if (rule.placement.weekday !== old.wd) {
        mismatches++;
        console.log(`  MISMATCH weekday ${p.type}/${rule.name}: new ${rule.placement.weekday} vs old ${old.wd}`);
      }
      return;
    }
    const lead = old.introGate ? oldIntroLead(p.type, p.year) : old.lead;
    const oldDate = old.leadMonths !== undefined
      ? policyCalc(p.start, old)
      : oldCalc(p.start, p.end, lead, old.wd, p.type);
    const newDate = resolveMeetingDate(rule, p.start, p.end, p.year);
    checks++;
    if (fmt(oldDate) !== fmt(newDate)) {
      mismatches++;
      console.log(`  MISMATCH ${p.type} ${p.year} / ${rule.name}: old ${fmt(oldDate)} vs new ${fmt(newDate)}`);
    }
  });
}

async function run() {
  // 1) synthetic programs across years + start weekdays (exercise year override + snaps)
  console.log('=== Synthetic programs ===');
  const synth = [];
  for (const type of ['Spring Program', 'Fall Program', 'Kleindagarna', 'Summer Conference']) {
    for (let year = 2026; year <= 2030; year++) {
      for (let dom = 1; dom <= 7; dom++) { // vary start weekday
        synth.push({ type, year, start: new Date(year, 1, dom), end: new Date(year, 4, 21) });
      }
    }
  }
  synth.forEach(checkProgram);
  console.log(`  ${checks} checks so far, ${mismatches} mismatches`);

  // 2) real production programs (optional). The connection string MUST come from
  // the environment — never hardcode credentials in source.
  console.log('\n=== Real production programs ===');
  const dbUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('  (skipped — set DATABASE_PUBLIC_URL to also verify against real programs)');
  } else {
    const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    try {
      const r = await pool.query(`
        SELECT name, type, year,
          TO_CHAR(start_date AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Stockholm','YYYY-MM-DD') s,
          TO_CHAR(end_date   AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Stockholm','YYYY-MM-DD') e
        FROM programs ORDER BY start_date`);
      r.rows.forEach(row => {
        const [sy,sm,sd] = row.s.split('-').map(Number);
        const start = new Date(sy, sm-1, sd);
        let end = null;
        if (row.e) { const [ey,em,ed] = row.e.split('-').map(Number); end = new Date(ey, em-1, ed); }
        checkProgram({ type: row.type, year: row.year || sy, start, end });
      });
      console.log(`  checked ${r.rows.length} real programs`);
    } finally { await pool.end(); }
  }

  console.log(`\n=== RESULT: ${checks} checks, ${mismatches} mismatches ===`);
  console.log(mismatches === 0 ? 'PARITY OK — config engine reproduces historical dates exactly.' : 'PARITY FAILED');
  process.exit(mismatches === 0 ? 0 : 1);
}

run().catch(e => { console.error(e); process.exit(1); });
