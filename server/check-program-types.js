const { dbHelpers } = require('./db');

async function check() {
  try {
    const data = await dbHelpers.getPrograms();
    console.log('Total meetings:', data.meetings.length);

    // Group by program type
    const byType = {};
    data.meetings.forEach(m => {
      const type = m.programType || 'NO TYPE';
      if (!byType[type]) {
        byType[type] = [];
      }
      byType[type].push(m);
    });

    console.log('\nMeetings by Program Type:');
    Object.keys(byType).forEach(type => {
      console.log(`  ${type}: ${byType[type].length} meetings`);
    });

    console.log('\nSample meetings with their programType:');
    data.meetings.slice(0, 10).forEach(m => {
      console.log(`  - ${m.type}`);
      console.log(`    Program: ${m.programName}`);
      console.log(`    Type: ${m.programType}`);
      console.log('');
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

check();
