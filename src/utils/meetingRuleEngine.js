// Meeting-rule date resolution. Pure functions, all arithmetic in LOCAL time
// (Swedish convention — never UTC) to avoid off-by-one-day bugs.
//
// Written as CommonJS so it can be required by the Node golden/parity test AND
// imported by the CRA frontend (webpack interop handles the named imports).
//
// A rule looks like:
//   { anchor:'start'|'end',
//     offset:{ amount, unit:'days'|'weeks'|'months', direction:'before'|'after'|'on' },
//     placement:{ mode:'weekday'|'exact', weekday:0-6|null, snap:'forward'|'backward'|'nearest'|'onOrBefore'|null },
//     offsetOverrideFromYear?: { fromYear, offset } }

// Pick the effective offset, applying a year-gated override when present
// (e.g. Introduction Meeting moves from 540d to 600d before start for FP28+/SP29+).
function effectiveOffset(rule, programYear) {
  const ovr = rule.offsetOverrideFromYear;
  if (ovr && programYear != null && programYear >= ovr.fromYear) return ovr.offset;
  return rule.offset;
}

// Shift a base date by an offset (local-time arithmetic). direction 'on' = no shift.
function applyOffset(base, offset) {
  const d = new Date(base.getTime());
  if (!offset || offset.direction === 'on') return d;
  const sign = offset.direction === 'before' ? -1 : 1;
  const amt = sign * (offset.amount || 0);
  if (offset.unit === 'months') d.setMonth(d.getMonth() + amt);
  else if (offset.unit === 'weeks') d.setDate(d.getDate() + amt * 7);
  else d.setDate(d.getDate() + amt); // 'days' (default)
  return d;
}

// Snap a date to the given weekday (0=Sun … 5=Fri … 6=Sat).
//  - forward:    nearest occurrence on/after the date
//  - backward / onOrBefore: nearest occurrence on/before the date
//  - nearest:    whichever side is closer (ties go backward)
function snapToWeekday(date, weekday, snap) {
  const d = new Date(date.getTime());
  const cur = d.getDay();
  if (cur === weekday) return d;
  const forward = (weekday - cur + 7) % 7;  // days ahead to reach weekday
  const backward = (cur - weekday + 7) % 7; // days behind to reach weekday
  if (snap === 'backward' || snap === 'onOrBefore') {
    d.setDate(d.getDate() - backward);
  } else if (snap === 'nearest') {
    if (backward <= forward) d.setDate(d.getDate() - backward);
    else d.setDate(d.getDate() + forward);
  } else { // 'forward' (default)
    d.setDate(d.getDate() + forward);
  }
  return d;
}

// Resolve a single meeting's date from its rule + a program's start/end.
// opts.isClosed(date) -> boolean is optional (Phase 5: skip holidays / IML-closed
// days by stepping in the snap direction to the next valid same-weekday slot).
function resolveMeetingDate(rule, startDate, endDate, programYear, opts = {}) {
  if (!startDate) return null;
  const base = rule.anchor === 'end' ? endDate : startDate;
  if (!base) return null;

  let date = applyOffset(new Date(base.getTime()), effectiveOffset(rule, programYear));

  const place = rule.placement || {};
  if (place.mode === 'weekday' && place.weekday != null) {
    date = snapToWeekday(date, place.weekday, place.snap || 'forward');

    // Optional holiday / closed-day avoidance (Phase 5): keep the same weekday,
    // jump a week in the snap direction until the day is open.
    if (typeof opts.isClosed === 'function') {
      const step = (place.snap === 'backward' || place.snap === 'onOrBefore') ? -7 : 7;
      let guard = 0;
      while (opts.isClosed(date) && guard < 52) {
        date.setDate(date.getDate() + step);
        guard++;
      }
    }
  } else if (typeof opts.isClosed === 'function' && opts.isClosed(date)) {
    // Exact-placement meeting (e.g. Program Start) that lands on a closed day:
    // move forward to the next open weekday (skip red/closed days and weekends).
    let guard = 0;
    do {
      date.setDate(date.getDate() + 1);
      guard++;
    } while ((opts.isClosed(date) || date.getDay() === 0 || date.getDay() === 6) && guard < 31);
  }

  return date;
}

module.exports = { resolveMeetingDate, applyOffset, snapToWeekday, effectiveOffset };
