// Regression test for the three dashboard bugs found 2026-08, reproduced from
// the real HT2026 data that triggered them. Run: node test-meeting-identity.js
//
// Setup: the Fall 2026 programme had its Onboarding moved 28 Aug -> 4 Sep and its
// Program Start 2 Sep -> 8 Sep. Each move inserted a NEW program_meetings row
// that REUSED the old row's meeting_id, so the table briefly held two different
// meetings sharing one id.
const { localDateKey, dateFromKey, meetingKey, isSameMeeting } = require('./src/utils/meetingIdentity');

const PROGRAM = 'Interactions between fractal geometry, harmonic analysis, and dynamical systems';

// Verbatim rows as the API returned them, ids included.
const onboardingOld  = { id: 11, programName: PROGRAM, type: 'Onboarding meeting',    date: new Date('2026-08-27T22:00:00.000Z'), time: '14:00' };
const onboardingNew  = { id: 11, programName: PROGRAM, type: 'Onboarding meeting',    date: new Date('2026-09-04T00:00:00.000Z'), time: '14:00' };
const startOld       = { id: 12, programName: PROGRAM, type: 'Program Start Meeting', date: new Date('2026-09-01T22:00:00.000Z'), time: '09:00' };
const startNew       = { id: 12, programName: PROGRAM, type: 'Program Start Meeting', date: new Date('2026-09-08T00:00:00.000Z'), time: '09:30' };

let pass = 0, fail = 0;
const check = (name, actual, expected) => {
  if (actual === expected) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n         fick      ${actual}\n         förväntat ${expected}`); }
};

console.log('\n=== Bug C: local day, not UTC day ===');
// 22:00Z on 27 Aug IS 28 Aug in Stockholm (CEST, +02:00).
check('Onboarding lands on 28 Aug, not 27', localDateKey(onboardingOld.date), '2026-08-28');
check('Program Start lands on 2 Sep, not 1', localDateKey(startOld.date), '2026-09-02');
check('midnight-UTC row keeps its day', localDateKey(onboardingNew.date), '2026-09-04');
check('the old toISOString() way was wrong',
  onboardingOld.date.toISOString().split('T')[0] === '2026-08-28', false);
// Winter date: CET is +01:00, so local midnight stores as 23:00Z.
check('CET (winter) row also resolves locally',
  localDateKey(new Date('2027-02-11T23:00:00.000Z')), '2027-02-12');
check('dateFromKey round-trips without shifting',
  localDateKey(dateFromKey('2026-08-28')), '2026-08-28');

console.log('\n=== Bug B: shared id must not mean same meeting ===');
check('same id, different date -> different meetings', isSameMeeting(onboardingOld, onboardingNew), false);
check('same id, different date+time -> different', isSameMeeting(startOld, startNew), false);
check('a meeting equals itself', isSameMeeting(startNew, { ...startNew }), true);
check('same day, different time -> different', isSameMeeting(
  { ...startNew, time: '09:30' }, { ...startNew, time: '11:00' }), false);

console.log('\n=== Bug B applied: TIME CONFLICT badge ===');
// The badge asked "is any conflicting meeting my id?" — with a shared id that
// flagged an unrelated meeting. Now it compares identity.
const conflictGroup = [onboardingOld];
const flaggedById       = conflictGroup.some(m => m.id === onboardingNew.id);
const flaggedByIdentity = conflictGroup.some(m => meetingKey(m) === meetingKey(onboardingNew));
check('old id-based check wrongly flagged 4 Sep', flaggedById, true);   // the bug
check('identity-based check does not flag 4 Sep', flaggedByIdentity, false);

console.log('\n=== Bug A: approval merge must not cross dates ===');
// Review rows carry the approvals. Matching on program+type alone made .find()
// return the 28 Aug row for the 4 Sep card, so 4 Sep displayed 2/2 directors.
const reviewRows = [
  { program_name: PROGRAM, type: 'Onboarding meeting', date: '2026-08-27T22:00:00.000Z', approvals: [{ role: 'director' }, { role: 'director' }] },
  { program_name: PROGRAM, type: 'Onboarding meeting', date: '2026-09-04T00:00:00.000Z', approvals: [{ role: 'director' }] },
];
const byNameAndType = reviewRows.find(m =>
  m.program_name === onboardingNew.programName && m.type === onboardingNew.type);
const byNameTypeDate = reviewRows.find(m =>
  m.program_name === onboardingNew.programName &&
  m.type === onboardingNew.type &&
  localDateKey(m.date) === localDateKey(onboardingNew.date));
check('old match borrowed 2 approvals from 28 Aug', byNameAndType.approvals.length, 2); // the bug
check('date-aware match finds the 4 Sep row', byNameTypeDate.approvals.length, 1);
check('date-aware match is the right row', localDateKey(byNameTypeDate.date), '2026-09-04');

console.log('\n=== Conflict detection over the cleaned schedule ===');
const cleaned = [onboardingNew, startNew,
  { id: 13, programName: PROGRAM, type: 'Mid-term meeting',         date: new Date('2026-10-22T22:00:00.000Z'), time: '14:00' },
  { id: 14, programName: PROGRAM, type: 'Evaluation meeting/lunch', date: new Date('2026-12-10T23:00:00.000Z'), time: '12:00' },
];
const slots = new Set();
let groups = 0;
cleaned.forEach(m => {
  const k = `${localDateKey(m.date)}|${m.time}`;
  if (slots.has(k)) groups++; else slots.add(k);
});
check('no conflicts in the cleaned schedule', groups, 0);

// A genuine clash must still be caught.
const clashing = [...cleaned, { id: 99, programName: 'Other programme', type: 'Some meeting', date: new Date('2026-09-04T00:00:00.000Z'), time: '14:00' }];
const slots2 = new Set();
let groups2 = 0;
clashing.forEach(m => {
  const k = `${localDateKey(m.date)}|${m.time}`;
  if (slots2.has(k)) groups2++; else slots2.add(k);
});
check('a real double-booking is still detected', groups2, 1);

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
console.log(fail === 0 ? 'MEETING IDENTITY OK' : 'MEETING IDENTITY FAILED');
process.exit(fail === 0 ? 0 : 1);
