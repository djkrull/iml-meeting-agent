// Reception Lunch (admin meeting 2026-10-09, item 2d): the first seminar day
// after program start — the Tuesday by default, the Monday when the week after
// start is a workshop week — and only for programs starting from 2026-10-09.
// Run: node test-reception-lunch.js
const { resolveMeetingDate, ruleAppliesToProgram } = require('./src/utils/meetingRuleEngine');
const { buildDefaultConfig } = require('./server/defaultSettings');
const { createIsBlocked } = require('./src/utils/swedishHolidays');

const fmt = d => d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : 'null';
let failures = 0;
function eq(label, got, want) {
  if (got !== want) { failures++; console.log(`  FAIL ${label}: got ${got}, want ${want}`); }
  else console.log(`  ok   ${label}: ${got}`);
}

const config = buildDefaultConfig();
for (const type of ['Spring Program', 'Fall Program']) {
  const rule = config.meetingRules[type].find(r => r.name === 'Reception Lunch');
  if (!rule) { failures++; console.log(`  FAIL ${type}: no Reception Lunch rule`); continue; }
  eq(`${type} time`, `${rule.time}+${rule.duration}`, '12:00+60');
  eq(`${type} participants`, rule.participants.join(','), 'Directors');
  eq(`${type} requiresDirectors`, rule.requiresDirectors, true);
}

const rule = config.meetingRules['Fall Program'].find(r => r.name === 'Reception Lunch');
const programStart = config.meetingRules['Fall Program'].find(r => r.name === 'Program Start Meeting');
const isBlocked = createIsBlocked([]);
const at = (y, m, d) => new Date(y, m - 1, d);

console.log('Default: first Tuesday after start (same day as Program Start)');
// Fall 2026 started Wed 2 Sep → Tue 8 Sep.
eq('start Wed 2026-09-02', fmt(resolveMeetingDate(rule, at(2026, 9, 2), at(2026, 12, 11), 2026, { isBlocked })), '2026-09-08');
eq('Program Start same day', fmt(resolveMeetingDate(programStart, at(2026, 9, 2), at(2026, 12, 11), 2026, { isBlocked })), '2026-09-08');
// A program starting ON a Tuesday gets the following Tuesday, not its start day.
eq('start Tue 2027-01-12', fmt(resolveMeetingDate(rule, at(2027, 1, 12), at(2027, 5, 21), 2027, { isBlocked })), '2027-01-19');
eq('workshop flag false = default', fmt(resolveMeetingDate(rule, at(2026, 9, 2), null, 2026, { isBlocked, workshopWeekAfterStart: false })), '2026-09-08');

console.log('Workshop week after start: the Monday after start');
eq('start Wed 2026-09-02', fmt(resolveMeetingDate(rule, at(2026, 9, 2), null, 2026, { isBlocked, workshopWeekAfterStart: true })), '2026-09-07');
// A program starting ON a Monday gets the following Monday.
eq('start Mon 2027-01-11', fmt(resolveMeetingDate(rule, at(2027, 1, 11), null, 2027, { isBlocked, workshopWeekAfterStart: true })), '2027-01-18');
// Easter Monday 2027 is 29 March (red day) → steps a week forward, still a Monday.
eq('Easter Monday skipped', fmt(resolveMeetingDate(rule, at(2027, 3, 24), null, 2027, { isBlocked, workshopWeekAfterStart: true })), '2027-04-05');
// A rule without workshopWeekPlacement ignores the flag.
eq('Program Start ignores flag', fmt(resolveMeetingDate(programStart, at(2026, 9, 2), null, 2026, { isBlocked, workshopWeekAfterStart: true })), '2026-09-08');

console.log('Only coming programs (appliesFromStartDate 2026-10-09)');
eq('Fall 2026 (started 2 Sep) excluded', ruleAppliesToProgram(rule, at(2026, 9, 2)), false);
eq('start 2026-10-08 excluded', ruleAppliesToProgram(rule, at(2026, 10, 8)), false);
eq('start 2026-10-09 included', ruleAppliesToProgram(rule, at(2026, 10, 9)), true);
eq('Spring 2027 included', ruleAppliesToProgram(rule, at(2027, 1, 12)), true);
eq('rule without cutoff applies', ruleAppliesToProgram(programStart, at(2020, 1, 1)), true);

console.log('Workshop flags follow the server (another tab may have set one)');
const { mergeProgramFlags } = require('./src/utils/meetingIdentity');
const local = [
  { name: 'S27', type: 'Spring Program', year: 2027, workshopWeekAfterStart: false },
  { name: 'F27', type: 'Fall Program', year: 2027, workshopWeekAfterStart: true },
  { name: 'New', type: 'Fall Program', year: 2028 },
];
const server = [
  { name: 'S27', type: 'Spring Program', year: 2027, workshopWeekAfterStart: true },
  { name: 'F27', type: 'Fall Program', year: 2027, workshopWeekAfterStart: false },
];
const merged = mergeProgramFlags(local, server);
eq('server true wins over stale local false', merged[0].workshopWeekAfterStart, true);
eq('server false wins over stale local true', merged[1].workshopWeekAfterStart, false);
eq('program unknown to server keeps local', merged[2].workshopWeekAfterStart, undefined);
eq('local array not mutated', local[0].workshopWeekAfterStart, false);
eq('unchanged → same array (no re-render/auto-save)', mergeProgramFlags(merged, server) === merged, true);
eq('same name, other year not matched', mergeProgramFlags(local, [{ name: 'S27', type: 'Spring Program', year: 2028, workshopWeekAfterStart: true }]) === local, true);
// The regenerated date follows the merged flag.
const s27 = Object.assign({}, merged[0], { start: at(2027, 1, 13) });
eq('regenerate from merged flag → Monday', fmt(resolveMeetingDate(rule, s27.start, null, 2027, { isBlocked, workshopWeekAfterStart: s27.workshopWeekAfterStart })), '2027-01-18');

console.log(failures === 0 ? '\nRECEPTION LUNCH OK' : `\nRECEPTION LUNCH FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
