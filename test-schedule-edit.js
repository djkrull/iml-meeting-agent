// Regression test for the Meeting Timeline's inline date/time editor.
//
// The editor used to commit on every keystroke. Two consequences, both real:
//
//   * The card carrying the focused <input> moved (the timeline re-sorts by
//     date) or unmounted entirely (a half-typed year passes through 0002, which
//     the "future meetings only" filter drops), so the field lost focus and the
//     native date picker slammed shut mid-click. Unusable by hand OR by picker.
//   * Every keystroke POSTed the schedule. The upsert key is
//     (program_name, type, date), so each intermediate date became a permanent
//     program_meetings row. Production accumulated six of them — e.g. the
//     Quantum Fields "Check-in meeting junior fellows" existed four times, on
//     14 Aug / 1 Sep / 14 Sep / 15 Sep, the middle two being nothing but the
//     keystrokes between "14" and "15".
//
// The focus/unmount half needs a DOM; this locks the half that is pure logic —
// what counts as a committable value, and that a commit writes exactly one row.
//
// Run: node test-schedule-edit.js

const {
  isCompleteDateKey, resolveScheduleChange, applyScheduleChange,
  meetingKey, localDateKey,
} = require('./src/utils/meetingIdentity');

let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; console.log(`  FAIL ${label}`); }
}

function eq(label, actual, expected) {
  ok(`${label} (${JSON.stringify(actual)})`, actual === expected);
}

// ---------------------------------------------------------------------------
console.log('\n=== A half-typed date is never committable ===');

// Chrome reports '' until every segment of the date is filled in.
ok("'' (segments still empty) rejected", !isCompleteDateKey(''));
ok("'2026-09' rejected", !isCompleteDateKey('2026-09'));
ok("'2026-9-15' (unpadded) rejected", !isCompleteDateKey('2026-9-15'));

// The exact sequence that created the junk rows: a year typed digit by digit.
for (const partial of ['0002-09-15', '0020-09-15', '0202-09-15']) {
  ok(`'${partial}' (year mid-typing) rejected`, !isCompleteDateKey(partial));
}
ok("'2026-09-15' (complete) accepted", isCompleteDateKey('2026-09-15'));

console.log('\n=== Rolled-over and out-of-range dates are rejected ===');
// new Date(2026, 1, 30) silently becomes 2 March — never let that through.
ok("'2026-02-30' rejected", !isCompleteDateKey('2026-02-30'));
ok("'2026-13-01' rejected", !isCompleteDateKey('2026-13-01'));
ok("'2026-02-29' (not a leap year) rejected", !isCompleteDateKey('2026-02-29'));
ok("'2028-02-29' (leap year) accepted", isCompleteDateKey('2028-02-29'));
ok("'1999-12-31' out of range", !isCompleteDateKey('1999-12-31'));
ok("'2101-01-01' out of range", !isCompleteDateKey('2101-01-01'));

// ---------------------------------------------------------------------------
console.log('\n=== A no-op edit must not reach setMeetings ===');
// Opening the editor and closing it unchanged used to save anyway, which in
// turn triggered the auto-save and a review sync for a change nobody made.
const meeting = {
  id: 17,
  programName: 'Quantum Fields, Probability, and Geometry',
  type: 'Check-in meeting junior fellows',
  date: new Date(2026, 7, 14), // 14 Aug 2026, Stockholm-local midnight
  time: '14:30',
};

ok('same date + same time → null', resolveScheduleChange(meeting, { date: new Date(2026, 7, 14), time: '14:30' }) === null);
ok('undefined date + same time → null', resolveScheduleChange(meeting, { date: undefined, time: '14:30' }) === null);
ok('an invalid Date falls back to the current date → null',
  resolveScheduleChange(meeting, { date: new Date('nonsense'), time: '14:30' }) === null);
ok('a real date change is not a no-op', resolveScheduleChange(meeting, { date: new Date(2026, 8, 15), time: '14:30' }) !== null);
ok('a time-only change is not a no-op', resolveScheduleChange(meeting, { date: new Date(2026, 7, 14), time: '15:00' }) !== null);

// ---------------------------------------------------------------------------
console.log('\n=== Date + time commit together, in one pass ===');
const schedule = [
  { ...meeting },
  { id: 16, programName: meeting.programName, type: 'Check-in meeting with organizers', date: new Date(2026, 7, 14), time: '14:00' },
  { id: 29, programName: 'Subelliptic and Magnetic Operators', type: 'Introduction Meeting', date: new Date(2026, 7, 21), time: '10:00' },
];

const keyBefore = meetingKey(schedule[0]);
const change = resolveScheduleChange(schedule[0], { date: new Date(2026, 8, 15), time: '15:30' });
const after = applyScheduleChange(schedule, keyBefore, change);

eq('the edited meeting moved to the new date', localDateKey(after[0].date), '2026-09-15');
eq('...and kept the new time', after[0].time, '15:30');
eq('the schedule still has one row per meeting', after.length, 3);
ok('the other meetings are untouched',
  localDateKey(after[1].date) === '2026-08-14' && after[1].time === '14:00' &&
  localDateKey(after[2].date) === '2026-08-21' && after[2].time === '10:00');

console.log('\n=== Why one pass: a second pass would match nothing ===');
// meetingKey includes BOTH date and time, so the key captured before the edit is
// already stale once the date is written. Committing the fields separately loses
// the second one.
const dateOnly = applyScheduleChange(schedule, keyBefore, { date: new Date(2026, 8, 15), time: schedule[0].time });
const twoPass = applyScheduleChange(dateOnly, keyBefore, { date: dateOnly[0].date, time: '15:30' });
eq('two passes lose the time', twoPass[0].time, '14:30');
eq('one pass keeps it', after[0].time, '15:30');

console.log('\n=== Rows sharing a meeting_id are not co-edited ===');
// `id` is not unique: a date change inserts a new program_meetings row reusing
// the same meeting_id. Matching on id would rewrite both.
const withDuplicate = [
  { ...meeting, date: new Date(2026, 7, 14) },  // stale row
  { ...meeting, date: new Date(2026, 8, 14) },  // same id, different date
];
ok('both rows share one id', withDuplicate[0].id === withDuplicate[1].id);
const targeted = applyScheduleChange(withDuplicate, meetingKey(withDuplicate[1]), { date: new Date(2026, 8, 15), time: '14:30' });
eq('the stale row is left alone', localDateKey(targeted[0].date), '2026-08-14');
eq('only the targeted row moved', localDateKey(targeted[1].date), '2026-09-15');

// ---------------------------------------------------------------------------
console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) { console.log('SCHEDULE EDIT BROKEN'); process.exit(1); }
console.log('SCHEDULE EDIT OK');
