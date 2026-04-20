// Check what day of week December 4, 2026 actually is

const date = new Date('2026-12-04');
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

console.log('December 4, 2026 is a:', dayNames[date.getDay()]);
console.log('Day number:', date.getDay(), '(0=Sunday, 5=Friday, 6=Saturday)');
console.log('');

// Check the program end date
const endDate = new Date('2026-12-10');
console.log('Program ends:', endDate.toLocaleDateString('sv-SE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
console.log('End date day:', dayNames[endDate.getDay()]);
console.log('');

// Check what the last Friday before Dec 10 should be
console.log('Checking days backwards from Dec 10:');
for (let i = 0; i < 7; i++) {
  const testDate = new Date('2026-12-10');
  testDate.setDate(testDate.getDate() - i);
  console.log(`  ${testDate.toISOString().split('T')[0]} = ${dayNames[testDate.getDay()]}`);
  if (testDate.getDay() === 5) {
    console.log(`  ^^^ LAST FRIDAY BEFORE END`);
    break;
  }
}
