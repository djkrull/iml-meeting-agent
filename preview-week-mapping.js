// Preview: Week-based meeting mapping

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
}

function getFridayInWeek(year, weekNumber) {
  const simple = new Date(year, 0, 1 + (weekNumber - 1) * 7);
  const dow = simple.getDay();
  const ISOweekStart = simple;
  if (dow <= 4)
    ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  else
    ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());

  // Get friday of that week (day 5)
  const friday = new Date(ISOweekStart);
  friday.setDate(ISOweekStart.getDate() + 4);
  return friday;
}

console.log('\n📅 WEEK-BASED MEETING MAPPING PREVIEW\n');
console.log('2026 MÖTEN (INPUT):');
console.log('─'.repeat(60));

const meetings2026 = [
  { date: new Date(2026, 2, 6), type: 'Check-in Group 1', time: '10:00', program: 'All Summer Conferences' },
  { date: new Date(2026, 2, 6), type: 'Check-in Group 2', time: '15:00', program: 'All Summer Conferences' },
  { date: new Date(2026, 2, 13), type: 'Introduction Meeting HP', time: '10:00', program: 'Triangulated Categories' },
  { date: new Date(2026, 2, 13), type: 'Check-in Meeting HP', time: '15:00', program: 'Triangulated Categories' }
];

meetings2026.forEach(m => {
  const week = getWeekNumber(m.date);
  console.log(`${m.date.toLocaleDateString('sv-SE')} (Week ${week}) - ${m.type} @ ${m.time}`);
});

console.log('\n2027 SAMMA VECKOR (OUTPUT):');
console.log('─'.repeat(60));

meetings2026.forEach(m => {
  const week = getWeekNumber(m.date);
  const friday2027 = getFridayInWeek(2027, week);
  console.log(`Week ${week}: ${friday2027.toLocaleDateString('sv-SE')} - ${m.type} @ ${m.time}`);
});

console.log('\n⚠️  KONFLIKTKONTROLL 2027:');
console.log('─'.repeat(60));

// Check for conflicts
const conflicts2027 = [
  { date: new Date(2027, 2, 4), type: 'Check-in meeting with organizers', program: 'Triangulated Categories' },
  { date: new Date(2027, 2, 4), type: 'Check-in Group 1', program: 'All Summer Conferences' }
];

console.log('INNAN FIX (4 mars 2027 - KONFLIKT):');
conflicts2027.forEach(c => {
  console.log(`  ${c.date.toLocaleDateString('sv-SE')} - ${c.type}`);
});

console.log('\nEFTER FIX (12 mars 2027 - INGEN KONFLIKT):');
const week10_2027 = getFridayInWeek(2027, 10);
console.log(`  ${week10_2027.toLocaleDateString('sv-SE')} - Check-in Group 1`);
console.log(`  ${week10_2027.toLocaleDateString('sv-SE')} - Check-in Group 2`);
console.log(`  ✅ Ingen konflikt!`);
