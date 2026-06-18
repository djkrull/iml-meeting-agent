// Verifies Swedish holiday computation (incl. movable Easter feasts + midsommar)
// and the isClosed predicate. Run: node test-holidays.js
const { swedishHolidays, createIsClosed, easterSunday, ymd } = require('./src/utils/swedishHolidays');

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

console.log('\nisClosed predicate:');
const isClosed = createIsClosed(['2027-08-13']); // an IML-specific closed day
check(isClosed(new Date(2027, 2, 26)), 'Långfredag 2027-03-26 is closed');     // red day
check(isClosed(new Date(2027, 7, 13)), 'IML-closed 2027-08-13 is closed');     // custom
check(!isClosed(new Date(2027, 7, 20)), 'normal Friday 2027-08-20 is open');   // not closed

console.log(`\n=== ${fails === 0 ? 'HOLIDAYS OK' : fails + ' FAILURES'} ===`);
process.exit(fails === 0 ? 0 : 1);
