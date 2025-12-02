// This script helps set the correct review ID that directors are using
// Run this and then open the admin page and paste the command in the browser console

const DIRECTORS_REVIEW_ID = 'e58c119e-b6dd-41f9-93bd-30251752220e';

console.log('\n=== INSTRUCTIONS ===');
console.log('1. Open the admin page in your browser');
console.log('2. Open the browser console (F12 or Cmd+Option+I)');
console.log('3. Paste this command and press Enter:\n');
console.log(`localStorage.setItem('iml-current-review-id', '${DIRECTORS_REVIEW_ID}');`);
console.log('\n4. Refresh the page');
console.log('5. Now when you click "Share for Director Review", it will UPDATE the existing review');
console.log('   that directors are already viewing, instead of creating a new one!\n');
console.log('=== Directors Review Link ===');
console.log(`https://iml-meeting-agent.vercel.app/review/${DIRECTORS_REVIEW_ID}`);
console.log('\nThis link will continue to work and show updated meetings!\n');
