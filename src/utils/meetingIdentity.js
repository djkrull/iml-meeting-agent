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

module.exports = { localDateKey, dateFromKey, meetingKey, isSameMeeting };
