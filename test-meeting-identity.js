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

console.log('\n=== Review row on an old date (2026-09-17) ===');
// FP28's Introduction Meeting was moved 15 Jan -> 5 Mar 2027 straight in
// program_meetings; review fac16a2c kept 15 Jan with two admin answers. The
// same-day match found nothing, so the card hid its attendance buttons silently.
const { matchReviewRow, sameReviewStale } = require('./src/utils/meetingIdentity');
const FP28 = 'Frontiers in Optimal Control: Geometry, Complexity, and Learning';
const fp28Intro = { programName: FP28, type: 'Introduction Meeting', date: new Date('2027-03-04T23:00:00.000Z'), time: '10:00' };
const fp28ReviewRows = [
  { id: 1447, program_name: FP28, type: 'Introduction Meeting', date: '2027-01-14T23:00:00.000Z', time: '10:00',
    approvals: [{ director_name: 'Sofie Upmark', status: 'accepted', role: 'admin' }, { director_name: 'Christian Wahlén', status: 'accepted', role: 'admin' }] },
  { id: 1485, program_name: FP28, type: 'Check-in meeting with organizers', date: '2028-06-01T22:00:00.000Z', time: '14:00', approvals: [] },
];
const moved = matchReviewRow(fp28ReviewRows, fp28Intro);
check('moved meeting has no same-day review row', moved.row, null);
check('...but the old-date row is reported', moved.stale && moved.stale.id, 1447);
check('...on its Stockholm-local day', moved.stale && moved.stale.date, '2027-01-15');
check('...with the answers that were given for that day', moved.stale && moved.stale.approvals.length, 2);

const checkIn = { programName: FP28, type: 'Check-in meeting with organizers', date: new Date('2028-06-01T22:00:00.000Z'), time: '14:00' };
const inSync = matchReviewRow(fp28ReviewRows, checkIn);
check('an in-sync meeting matches its row', inSync.row && inSync.row.id, 1485);
check('...and is not stale', inSync.stale, null);

check('a meeting the review never had is not stale',
  matchReviewRow(fp28ReviewRows, { programName: FP28, type: 'Mid-term meeting', date: new Date(), time: '14:00' }).stale, null);
const twoOldRows = fp28ReviewRows.concat([Object.assign({}, fp28ReviewRows[0], { id: 9999, date: '2027-02-11T23:00:00.000Z' })]);
check('two old-date candidates are ambiguous, not guessed', matchReviewRow(twoOldRows, fp28Intro).stale, null);

check('same stale info compares equal (no re-render per poll)',
  sameReviewStale(moved.stale, matchReviewRow(fp28ReviewRows, fp28Intro).stale), true);
check('stale vs none differs', sameReviewStale(moved.stale, null), false);
check('none vs none is equal', sameReviewStale(null, null), true);

console.log('\n=== Extra meetings (not rule-driven) ===');
const { isCustomMeeting, validateCustomMeeting, scheduleSignature } = require('./src/utils/meetingIdentity');
const TODAY = new Date(2026, 9, 7); // 7 Oct 2026, local
const okForm = { programName: FP28, type: 'Extra planning meeting', dateKey: '2026-11-12', time: '13:00', duration: 45 };
const fp28Rules = ['Introduction Meeting', 'Check-in meeting with organizers', 'Mid-term meeting'];
check('a complete form is valid', validateCustomMeeting(okForm, [], fp28Rules, TODAY).length, 0);
check('a past date is refused',
  validateCustomMeeting(Object.assign({}, okForm, { dateKey: '2026-10-06' }), [], fp28Rules, TODAY).length, 1);
check('today is allowed',
  validateCustomMeeting(Object.assign({}, okForm, { dateKey: '2026-10-07' }), [], fp28Rules, TODAY).length, 0);
check('a half-typed date is refused',
  validateCustomMeeting(Object.assign({}, okForm, { dateKey: '0202-11-12' }), [], fp28Rules, TODAY).length, 1);
check('a rule name is refused (case-insensitive) — Regenerera would treat it as the rule meeting',
  validateCustomMeeting(Object.assign({}, okForm, { type: ' mid-term MEETING ' }), [], fp28Rules, TODAY).length, 1);
check('a bad time and zero minutes are both reported',
  validateCustomMeeting(Object.assign({}, okForm, { time: '9', duration: 0 }), [], fp28Rules, TODAY).length, 2);
// Stored at Stockholm-local midnight (23:00Z the day before in CET) — the clash
// check must compare the LOCAL day, or it would miss this one.
const existingExtra = { programName: FP28, type: 'Extra planning meeting', date: new Date('2026-11-11T23:00:00.000Z'), time: '10:00' };
check('the same meeting on the same local day is refused',
  validateCustomMeeting(okForm, [existingExtra], fp28Rules, TODAY).length, 1);
check('...but another day is fine',
  validateCustomMeeting(Object.assign({}, okForm, { dateKey: '2026-11-13' }), [existingExtra], fp28Rules, TODAY).length, 0);
check('customAt marks an extra meeting', isCustomMeeting({ customAt: '2026-10-07T10:00:00Z' }), true);
check('a rule meeting is not extra', isCustomMeeting(fp28Intro), false);
check('customAt stays out of the auto-save signature',
  scheduleSignature(Object.assign({}, fp28Intro, { customAt: 'x' })), scheduleSignature(fp28Intro));

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
console.log(fail === 0 ? 'MEETING IDENTITY OK' : 'MEETING IDENTITY FAILED');
process.exit(fail === 0 ? 0 : 1);
