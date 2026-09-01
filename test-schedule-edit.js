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
  scheduleSignature, snapshotSchedule, changedMeetings, invitationStatus, isLocked,
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
// The auto-save used to POST the whole meetings array, and the backend upserts
// everything it is handed. So any state change rewrote the schedule from this
// tab's copy — and a tab open from before an edit re-inserted its stale rows.
// On 2026-08-13 the read-only 30s approval poll did exactly that: it updated
// `meetings` so the cards could show new director responses, and four rows that
// had just been deleted server-side came straight back.
console.log('\n=== An approval-only refresh must not look like a change ===');

const live = [
  { id: 16, programName: 'Quantum Fields, Probability, and Geometry', type: 'Check-in meeting with organizers',
    date: new Date(2026, 8, 15), time: '14:00', duration: 30, participants: ['Directors'],
    description: 'Review preparations', status: 'pending' },
  { id: 29, programName: 'Subelliptic and Magnetic Operators', type: 'Introduction Meeting',
    date: new Date(2026, 8, 18), time: '10:00', duration: 30, participants: ['Directors'],
    description: 'Initial planning', status: 'pending' },
];
const known = snapshotSchedule(live);

eq('a freshly loaded schedule has nothing to save', changedMeetings(live, known).length, 0);

// What the 30s poll produces: approval fields merged in, schedule untouched.
const polled = live.map(m => ({
  ...m, approvals: [{ director_name: 'Hans', status: 'accepted' }], adminApprovals: [],
  approvedCount: 2, rejectedCount: 0, approved: true, reviewMeetingId: 1438,
}));
eq('approval fields do not make a row dirty', changedMeetings(polled, known).length, 0);

console.log('\n=== Real edits still save, and only the edited row ===');
const movedRow = { ...live[0], date: new Date(2026, 8, 22) };
const afterMove = [movedRow, live[1]];
const dirtyMove = changedMeetings(afterMove, known);
eq('a moved meeting is dirty', dirtyMove.length, 1);
eq('...and it is the one that moved', dirtyMove[0].type, 'Check-in meeting with organizers');

const retimed = [{ ...live[0], time: '15:00' }, live[1]];
eq('a time change is dirty', changedMeetings(retimed, known).length, 1);

const rescheduled = [{ ...live[0], status: 'scheduled' }, live[1]];
eq('a status change is dirty', changedMeetings(rescheduled, known).length, 1);

const redescribed = [{ ...live[0], description: 'New text' }, live[1]];
eq('a description change is dirty', changedMeetings(redescribed, known).length, 1);

const added = live.concat([{ id: 99, programName: 'Triangulated Categories', type: 'Mid-term meeting',
  date: new Date(2027, 2, 5), time: '14:00', duration: 30, participants: [], description: '', status: 'pending' }]);
const dirtyAdd = changedMeetings(added, known);
eq('a brand-new meeting is dirty', dirtyAdd.length, 1);
eq('...and only it', dirtyAdd[0].type, 'Mid-term meeting');

console.log('\n=== The exact resurrection: a stale tab writes nothing ===');
// The stale tab still holds the pre-cleanup rows. Its snapshot matches its own
// state (it has saved nothing since), so however often the approval poll fires,
// the diff is empty and those rows can never be pushed back.
const staleTab = [
  { ...live[0], date: new Date(2026, 7, 14) },  // 14 Aug — deleted server-side
  { ...live[1], date: new Date(2026, 7, 21) },  // 21 Aug — deleted server-side
];
const staleKnown = snapshotSchedule(staleTab);
const stalePolled = staleTab.map(m => ({ ...m, approvals: [{ x: 1 }], approvedCount: 2, approved: true }));
eq('the stale tab has nothing to write', changedMeetings(stalePolled, staleKnown).length, 0);

console.log('\n=== Signature ignores Date-vs-string for the same instant ===');
const asString = { ...live[0], date: live[0].date.toISOString() };
ok('a Date and its ISO string sign identically',
  scheduleSignature(asString) === scheduleSignature(live[0]));

// ---------------------------------------------------------------------------
// Outlook invitation tracking. The point of recording what was invited is that
// moving the meeting afterwards leaves a WRONG invitation in people's calendars
// — that must surface, not sit behind a green tick.
console.log('\n=== Invitation status ===');

const notSent = { date: new Date(2026, 8, 15), time: '14:00' };
ok('an unmarked meeting is not sent', invitationStatus(notSent).sent === false);
ok('...and not stale', invitationStatus(notSent).stale === false);
ok('a missing meeting is handled', invitationStatus(null).sent === false);

const sent = {
  date: new Date(2026, 8, 15), time: '14:00',
  invitationSentAt: '2026-08-14T10:00:00.000Z', invitationSentBy: 'adm_christian',
  invitationSentForDate: new Date(2026, 8, 15).toISOString(), invitationSentForTime: '14:00',
};
ok('a marked meeting is sent', invitationStatus(sent).sent === true);
ok('...and not stale while nothing moved', invitationStatus(sent).stale === false);
eq('...and keeps who sent it', invitationStatus(sent).sentBy, 'adm_christian');

const movedAfterSending = Object.assign({}, sent, { date: new Date(2026, 8, 22) });
ok('moving the date makes it stale', invitationStatus(movedAfterSending).stale === true);
eq('...and it still reports the invited date', invitationStatus(movedAfterSending).sentFor.date, '2026-09-15');

const retimedAfterSending = Object.assign({}, sent, { time: '15:30' });
ok('changing only the time makes it stale', invitationStatus(retimedAfterSending).stale === true);

// Rows marked before sent_for tracking existed simply count as sent — never
// flag a change we have no evidence for.
const legacy = { date: new Date(2026, 8, 22), time: '14:00', invitationSentAt: '2026-08-14T10:00:00.000Z' };
ok('a legacy row without sent_for is sent', invitationStatus(legacy).sent === true);
ok('...and is never reported stale', invitationStatus(legacy).stale === false);

// In the director review the meeting row is a per-review COPY that can lag
// behind program_meetings. Comparing against that copy would report "not
// changed" for a meeting that has in fact moved — hiding exactly what this is
// meant to surface — so the server supplies the schedule's current values.
console.log('\n=== A lagging review copy must not hide a moved meeting ===');
const reviewCopy = Object.assign({}, sent, {
  date: new Date(2026, 8, 15), time: '14:00',      // the review row, still on the old date
  invitationCurrentDate: new Date(2026, 9, 2).toISOString(), // what the schedule says now
  invitationCurrentTime: '14:00',
});
ok('stale is judged against the schedule, not the review copy',
  invitationStatus(reviewCopy).stale === true);
const reviewCopyInSync = Object.assign({}, sent, {
  invitationCurrentDate: new Date(2026, 8, 15).toISOString(), invitationCurrentTime: '14:00',
});
ok('...and stays clean when they agree', invitationStatus(reviewCopyInSync).stale === false);

// The invitation is written through its own endpoint. If it were part of the
// schedule signature, a stale tab's auto-save could clobber a shared fact.
console.log('\n=== Invitation is not part of the auto-save signature ===');
const base = { id: 1, programName: 'P', type: 'Onboarding meeting', date: new Date(2026, 8, 15),
  time: '14:00', duration: 30, participants: [], description: 'd', status: 'pending' };
const snap = snapshotSchedule([base]);
const marked = Object.assign({}, base, {
  invitationSentAt: '2026-08-14T10:00:00.000Z', invitationSentBy: 'adm_christian',
  invitationSentForDate: new Date(2026, 8, 15).toISOString(), invitationSentForTime: '14:00',
});
eq('marking an invitation does not dirty the row', changedMeetings([marked], snap).length, 0);

// ---------------------------------------------------------------------------
// A locked meeting keeps its date. Excluding it from one bulk move is not enough:
// "Regenerera" recomputes every future date from the rules, so without a state in
// the database the next press would move a meeting whose invitation is already in
// people's calendars.
console.log('\n=== Locked meetings ===');

const unlockedRow = { date: new Date(2026, 8, 15), time: '14:00' };
ok('an unmarked meeting is not locked', isLocked(unlockedRow) === false);
ok('a missing meeting is handled', isLocked(null) === false);
ok('a marked meeting is locked', isLocked({ lockedAt: '2026-09-01T10:00:00.000Z' }) === true);
ok('an explicitly cleared lock is not locked', isLocked({ lockedAt: null }) === false);

// Like the invitation fields, the lock is written through its own endpoint. If it
// were part of the signature, a stale tab's auto-save could clobber a shared fact.
console.log('\n=== Locking is not part of the auto-save signature ===');
const plain = { id: 1, programName: 'P', type: 'Onboarding meeting', date: new Date(2026, 8, 15),
  time: '14:00', duration: 30, participants: [], description: 'd', status: 'pending' };
const lockSnap = snapshotSchedule([plain]);
const lockedCopy = Object.assign({}, plain, {
  lockedAt: '2026-09-01T10:00:00.000Z', lockedBy: 'adm_christian',
});
eq('locking a meeting does not dirty the row', changedMeetings([lockedCopy], lockSnap).length, 0);
eq('unlocking it does not either',
  changedMeetings([Object.assign({}, plain, { lockedAt: null })], lockSnap).length, 0);

// A locked row must still be recognised as the same meeting, so approvals and the
// invitation status keep resolving against it.
eq('the lock does not change the meeting identity',
  meetingKey(lockedCopy), meetingKey(plain));

// ---------------------------------------------------------------------------
console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) { console.log('SCHEDULE EDIT BROKEN'); process.exit(1); }
console.log('SCHEDULE EDIT OK');
