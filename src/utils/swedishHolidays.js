// Swedish public holidays ("röda dagar") + the eves that are de-facto closed in
// Sweden, computed per year (incl. movable Easter-based feasts). Pure, local-time
// (YYYY-MM-DD in the machine's local zone, which is Europe/Stockholm for IML).
//
// CommonJS so the Node tests and the CRA frontend can both use it.

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Easter Sunday (Gregorian), Anonymous/Meeus algorithm. Returns a local Date.
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Set of YYYY-MM-DD strings that count as closed/non-working for the given year.
function swedishHolidays(year) {
  const s = new Set();
  const add = (dt) => s.add(ymd(dt));
  const addMD = (monthIdx, day) => add(new Date(year, monthIdx, day));

  // Fixed-date red days
  addMD(0, 1);   // Nyårsdagen
  addMD(0, 6);   // Trettondedag jul
  addMD(4, 1);   // Första maj
  addMD(5, 6);   // Sveriges nationaldag
  addMD(11, 25); // Juldagen
  addMD(11, 26); // Annandag jul
  // De-facto closed eves (not official red days, but everything is closed)
  addMD(11, 24); // Julafton
  addMD(11, 31); // Nyårsafton

  // Easter-based movable feasts
  const E = easterSunday(year);
  const rel = (n) => { const d = new Date(E); d.setDate(d.getDate() + n); return d; };
  add(rel(-2)); // Långfredag (Good Friday)
  add(rel(0));  // Påskdagen
  add(rel(1));  // Annandag påsk (Easter Monday)
  add(rel(39)); // Kristi himmelsfärds dag (Ascension, Thursday)
  add(rel(49)); // Pingstdagen (Pentecost, Sunday)

  // Midsommar: midsommardagen = Saturday in Jun 20–26; midsommarafton = the Friday before.
  for (let day = 20; day <= 26; day++) {
    const d = new Date(year, 5, day);
    if (d.getDay() === 6) { // Saturday
      add(d);
      const eve = new Date(d); eve.setDate(eve.getDate() - 1); add(eve); // midsommarafton (Fri)
      break;
    }
  }

  // Alla helgons dag: Saturday in Oct 31 – Nov 6.
  for (let off = 0; off <= 6; off++) {
    const d = new Date(year, 9, 31); d.setDate(d.getDate() + off);
    if (d.getDay() === 6) { add(d); break; }
  }

  return s;
}

// Build an isBlocked(date) predicate: Swedish red days plus the admin-maintained
// periods when IML cannot hold meetings. Caches the holiday set per year.
//
// The config used to be called "IML-closed days", which described the wrong
// thing. IML is rarely closed — the summer conferences run right through July.
// What happens is that for stretches of the year only one administrator is on
// site, so meetings cannot be booked even though the institute is operating.
// The name matters because "closed" invites someone to leave the list empty on
// the reasonable grounds that IML is, in fact, open.
//
// Accepts either form:
//   periods: [{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', label }]   preferred
//   legacy:  ['YYYY-MM-DD', ...]                                 single days
// A summer runs to roughly forty weekdays; listing them one by one made the
// list unmaintainable, which is why ranges exist.
//
// Direction is NOT configured here. A blocked date is stepped over by the rule
// engine in the direction of that rule's own `snap`, so a check-in
// (snap: onOrBefore) moves BACK out of the summer while an onboarding
// (snap: forward) moves FORWARD. That is already the behaviour you want.
function normalisePeriods(input) {
  const out = [];
  (input || []).forEach((p) => {
    if (typeof p === 'string') {
      const d = p.slice(0, 10);
      if (d) out.push({ from: d, to: d, label: '' });
      return;
    }
    if (p && p.from) {
      const from = String(p.from).slice(0, 10);
      const to = String(p.to || p.from).slice(0, 10);
      out.push({ from: from <= to ? from : to, to: from <= to ? to : from, label: p.label || '' });
    }
  });
  return out;
}

function createIsBlocked(periods) {
  const ranges = normalisePeriods(periods);
  const cache = new Map();
  return (date) => {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getFullYear();
    if (!cache.has(y)) cache.set(y, swedishHolidays(y));
    const key = ymd(d);
    if (cache.get(y).has(key)) return true;
    for (let i = 0; i < ranges.length; i++) {
      if (key >= ranges[i].from && key <= ranges[i].to) return true;
    }
    return false;
  };
}

// Which period blocks this date, if any — for showing a reason in the UI.
function blockingPeriod(periods, date) {
  const ranges = normalisePeriods(periods);
  const key = ymd(date instanceof Date ? date : new Date(date));
  for (let i = 0; i < ranges.length; i++) {
    if (key >= ranges[i].from && key <= ranges[i].to) return ranges[i];
  }
  return null;
}

module.exports = { swedishHolidays, createIsBlocked, blockingPeriod, normalisePeriods, easterSunday, ymd };
