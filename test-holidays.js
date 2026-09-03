// Verifies Swedish holiday computation (incl. movable Easter feasts + midsommar)
// and the isBlocked predicate. Run: node test-holidays.js
const { swedishHolidays, createIsBlocked, blockingPeriod, easterSunday, ymd } = require('./src/utils/swedishHolidays');

let fails = 0;
const check = (cond, msg) => { if (!cond) { fails++; console.log('  FAIL:', msg); } else { console.log('  ok:', msg); } };

console.log('Easter Sundays:', '2026=' + ymd(easterSunday(2026)), '2027=' + ymd(easterSunday(2027)));
check(ymd(easterSunday(2027)) === '2027-03-28', 'Easter 2027 = 2027-03-28');
check(ymd(easterSunday(2026)) === '2026-04-05', 'Easter 2026 = 2026-04-05');

const h27 = swedishHolidays(2027);
const expect27 = {
  'Nyårsdagen': '2027-01-01',
  'Trettondedag': '2027-01-06',
  'Långfredag': '2027-03-26',
  'Annandag påsk': '2027-03-29',
  'Första maj': '2027-05-01',
  'Kristi himmelsfärd': '2027-05-06',
  'Pingstdagen': '2027-05-16',
  'Nationaldagen': '2027-06-06',
  'Midsommarafton': '2027-06-25',
  'Midsommardagen': '2027-06-26',
  'Juldagen': '2027-12-25',
  'Annandag jul': '2027-12-26',
};
console.log('\n2027 holidays:');
for (const [name, date] of Object.entries(expect27)) check(h27.has(date), `${name} ${date} is a holiday`);

// Alla helgons dag 2027 = Saturday Oct 30 – Nov 5 → 2027-11-06? compute: Oct 31 2027 is a Sunday → first Sat in [Oct31..Nov6] is Nov 6.
console.log('\nAlla helgons dag 2027 present (Nov 6):', h27.has('2027-11-06'));

console.log('\nisBlocked predicate — legacy single dates:');
// The old config was a flat list of date strings. Those must keep working: the
// rename happened while the production list was empty, but an un-migrated config
// elsewhere would otherwise silently stop blocking anything.
const legacy = createIsBlocked(['2027-08-13']);
check(legacy(new Date(2027, 2, 26)), 'Långfredag 2027-03-26 is blocked');      // red day
check(legacy(new Date(2027, 7, 13)), 'legacy single date 2027-08-13 blocked'); // custom
check(!legacy(new Date(2027, 7, 20)), 'normal Friday 2027-08-20 is free');

console.log('\nisBlocked predicate — periods:');
// A summer runs to ~40 weekdays; listing them individually is why ranges exist.
const sommar = [{ from: '2027-06-25', to: '2027-08-14', label: 'Sommar 2027' }];
const blocked = createIsBlocked(sommar);
check(!blocked(new Date(2027, 5, 24)), 'day before the period is free');
check(blocked(new Date(2027, 5, 25)),  'first day of the period is blocked');
check(blocked(new Date(2027, 6, 9)),   'mid-period is blocked');
check(blocked(new Date(2027, 7, 14)),  'last day of the period is blocked');
check(!blocked(new Date(2027, 7, 15)), 'day after the period is free');
check(blocked(new Date(2027, 11, 25)), 'red days still blocked alongside periods');
check(blockingPeriod(sommar, new Date(2027, 6, 9)).label === 'Sommar 2027', 'the blocking period is named');
check(blockingPeriod(sommar, new Date(2027, 8, 1)) === null, 'a free date has no blocking period');

// Reversed input should not silently match nothing.
const bakvant = createIsBlocked([{ from: '2027-08-14', to: '2027-06-25' }]);
check(bakvant(new Date(2027, 6, 9)), 'a period entered backwards is still honoured');

console.log(`\n=== ${fails === 0 ? 'HOLIDAYS OK' : fails + ' FAILURES'} ===`);
process.exit(fails === 0 ? 0 : 1);
