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

// Build an isClosed(date) predicate over Swedish holidays + admin-maintained
// IML-closed dates. Caches the holiday set per year.
function createIsClosed(imlClosedDays) {
  const extra = new Set((imlClosedDays || []).map(s => String(s).slice(0, 10)));
  const cache = new Map();
  return (date) => {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getFullYear();
    if (!cache.has(y)) cache.set(y, swedishHolidays(y));
    const key = ymd(d);
    return cache.get(y).has(key) || extra.has(key);
  };
}

module.exports = { swedishHolidays, createIsClosed, easterSunday, ymd };
