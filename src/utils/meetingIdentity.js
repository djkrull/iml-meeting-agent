// Meeting identity + local-date helpers.
//
// Written as CommonJS so the Node regression test and the CRA frontend share one
// implementation (same arrangement as meetingRuleEngine.js).
//
// Two bug classes live here, both fixed 2026-08:
//
// 1. UTC vs Stockholm-local day. `meeting.date` is a UTC instant representing a
//    Stockholm-local midnight, so it stores as 22:00Z (CEST) or 23:00Z (CET) on
//    the PREVIOUS day. `date.toISOString().split('T')[0]` therefore yields the
//    wrong calendar day — a meeting on Friday 28 Aug read as Thursday 27 Aug.
//
// 2. `meeting.id` is not unique. Changing a meeting's date inserts a NEW
//    program_meetings row (the unique constraint is on program_name+type+date)
//    that reuses the same meeting_id. Two different meetings then share an id,
//    so any "same meeting?" check based on the id alone matches the wrong row.

// Stockholm-local calendar date as YYYY-MM-DD. Accepts a Date or an ISO string.
function localDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
}

// Parse a YYYY-MM-DD key back to a LOCAL Date. Never use `new Date(key)` — that
// parses as UTC midnight and lands on the previous day west of Greenwich.
function dateFromKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Stable identity for a meeting: program + type + local date + time.
function meetingKey(m) {
  return `${m.programName}|${m.type}|${localDateKey(m.date)}|${m.time}`;
}

// True when two meetings are the same meeting. Use instead of `a.id === b.id`.
function isSameMeeting(a, b) {
  return meetingKey(a) === meetingKey(b);
}

// ---------------------------------------------------------------------------
// Inline date/time editing (Meeting Timeline).
//
// These live with meetingKey rather than in their own module because committing
// an edit is an identity-matched write — getting the identity wrong is exactly
// what broke before.
//
// The bug they exist to prevent (fixed 2026-08): the editor committed on every
// keystroke. Each partial value went into `meetings`, which re-sorts the
// timeline by date and drops anything before today — so the card carrying the
// focused <input> was moved or unmounted mid-typing, blurring the field and
// closing the native date picker. Worse, every keystroke POSTed the schedule,
// and the upsert key is (program_name, type, date), so each half-typed date
// left a permanent duplicate row in program_meetings. Six of them had to be
// cleaned out of production. Commit ONCE, and only when the value is complete.

// True only for a complete, real calendar date in a plausible year.
//
// An <input type="date"> reports '' while a date is half-typed, so "non-empty"
// is not enough of a test. This also rejects dates JS would silently roll over
// (new Date(2026, 1, 30) is 2 March), which no browser produces but a pasted or
// programmatic value could.
function isCompleteDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (y < 2000 || y > 2100) return false;
  // Local-time getters, not localDateKey: the round-trip must be timezone
  // independent so it holds when a test runs outside Europe/Stockholm.
  const parsed = new Date(y, m - 1, d);
  return parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d;
}

// What a commit should write, or null when the edit is a no-op. A no-op must not
// reach setMeetings — that would trigger the auto-save (and a review sync) for a
// change nobody made.
function resolveScheduleChange(meeting, { date, time }) {
  const current = meeting.date instanceof Date ? meeting.date : new Date(meeting.date);
  const nextDate = date instanceof Date && !isNaN(date.getTime()) ? date : current;
  const nextTime = time || meeting.time;
  if (nextDate.getTime() === current.getTime() && nextTime === meeting.time) return null;
  return { date: nextDate, time: nextTime };
}

// Apply a resolved change to the meetings array in ONE pass.
//
// `key` is the meeting's identity BEFORE the edit. Date and time are both part
// of meetingKey, so writing them in two passes would leave the second pass
// matching a key that no longer exists — the second field silently lost. Rows
// are matched on meetingKey and never on `id`, for the reason at the top of
// this file: `m.id === meeting.id` would rewrite every row sharing that id.
//
// Object.assign, not `{ ...m }`: Babel lowers object spread to an @babel/runtime
// helper and injects an ESM `import` for it. That flips this CommonJS file to
// ESM, `module.exports` stops counting as named exports, and every import from
// it fails the CRA build ("'localDateKey' is not exported"). Keep every util
// under src/utils free of syntax that needs a Babel helper.
function applyScheduleChange(meetings, key, changes) {
  return meetings.map(m => (meetingKey(m) === key
    ? Object.assign({}, m, { date: changes.date, time: changes.time })
    : m));
}

// ---------------------------------------------------------------------------
// Auto-save change detection.
//
// The dashboard auto-saves the whole meetings array on every state change, and
// the backend upserts every row it is handed. That turned ANY state change into
// a full rewrite of the schedule from whatever this tab happened to hold — so a
// tab left open from before an edit faithfully re-inserted its stale rows.
//
// It bit us on 2026-08-13: the 30s approval poll found new director responses,
// updated `meetings` so the cards could render them, and the auto-save pushed
// four rows that had just been deleted server-side straight back into
// program_meetings. The user had two dashboard windows open; neither had touched
// the schedule.
//
// The fix is to send only rows whose PERSISTED fields actually changed against
// what the server is known to hold. Approval-derived fields (approved,
// approvals, adminApprovals, approvedCount, rejectedCount, reviewMeetingId) are
// deliberately excluded: they are re-derived from the review on every refresh,
// so including them would make that read-only poll trigger a write again. The
// admin's own approve/schedule toggles all move `status` as well, so deliberate
// changes still persist.

function scheduleSignature(m) {
  const date = m.date instanceof Date ? m.date : new Date(m.date);
  return JSON.stringify([
    m.id, m.programId, m.programName, m.programType, m.programYear,
    m.programOrganizer, m.type, date.toISOString(), m.time, m.duration,
    m.participants, m.description, m.status,
  ]);
}

// What the server is believed to hold: meetingKey -> signature.
function snapshotSchedule(meetings) {
  const snap = new Map();
  (meetings || []).forEach(m => snap.set(meetingKey(m), scheduleSignature(m)));
  return snap;
}

// Rows to actually send. A row is "changed" when the server has nothing under
// its identity (new, or moved to a new date/time) or holds a different value.
function changedMeetings(meetings, snapshot) {
  return (meetings || []).filter(m => snapshot.get(meetingKey(m)) !== scheduleSignature(m));
}

// ---------------------------------------------------------------------------
// Official Outlook invitation status.
//
// Tracked separately from `status`/`approved` on purpose: whether the invitation
// went out is a fact about the outside world, not about the internal planning
// consensus, and the two are independent — a meeting can be agreed but not yet
// invited, or invited and then questioned. Folding it into `status` would make
// the states mutually exclusive again.
//
// `sentForDate`/`sentForTime` record WHAT was invited. If the meeting is moved
// afterwards, the invitation sitting in people's calendars is now wrong, and
// that is the failure this is really guarding against — so it is reported as
// `stale` rather than quietly showing a green tick.
//
// Deliberately NOT part of scheduleSignature: like Settings, this is written by
// its own endpoint. Including it would let a stale tab's auto-save clobber a
// shared fact (see the auto-save note above).
function invitationStatus(m) {
  if (!m || !m.invitationSentAt) {
    return { sent: false, stale: false, sentAt: null, sentBy: null, sentFor: null };
  }
  const sentForDate = m.invitationSentForDate ? localDateKey(m.invitationSentForDate) : null;
  const sentForTime = m.invitationSentForTime || null;
  // Compare against the SCHEDULE's current date/time. In the director review the
  // row is a per-review copy that can lag behind program_meetings, so the server
  // supplies the authoritative values as invitationCurrentDate/Time; without
  // them a meeting moved after sharing would wrongly report "not changed" —
  // hiding the very problem this exists to surface.
  const basisDate = m.invitationCurrentDate || m.date;
  const basisTime = m.invitationCurrentTime || m.time;
  const currentDate = basisDate ? localDateKey(basisDate) : null;
  const currentTime = basisTime || null;
  // Only claim "changed" when we actually recorded what was sent; rows marked
  // before this was tracked simply count as sent.
  const stale = sentForDate !== null &&
    (sentForDate !== currentDate || (sentForTime !== null && sentForTime !== currentTime));
  return {
    sent: true,
    stale,
    sentAt: m.invitationSentAt,
    sentBy: m.invitationSentBy || null,
    sentFor: sentForDate ? { date: sentForDate, time: sentForTime } : null,
  };
}

// A locked meeting keeps its date through "Regenerera" and is refused by the
// move endpoint. Like the invitation fields, `lockedAt`/`lockedBy` are written
// through their own endpoint and are deliberately absent from
// scheduleSignature — a stale tab must not be able to clobber a shared fact.
function isLocked(m) {
  return !!(m && m.lockedAt);
}

module.exports = {
  localDateKey, dateFromKey, meetingKey, isSameMeeting,
  isCompleteDateKey, resolveScheduleChange, applyScheduleChange,
  scheduleSignature, snapshotSchedule, changedMeetings,
  invitationStatus, isLocked,
};
