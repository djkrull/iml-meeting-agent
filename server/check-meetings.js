const { dbHelpers } = require('./db');

async function check() {
  try {
    console.log('Checking database...');
    const data = await dbHelpers.getPrograms();
    console.log('Programs found:', data.programs.length);
    console.log('Meetings found:', data.meetings.length);

    if (data.meetings.length > 0) {
      console.log('\nFirst few meetings:');
      data.meetings.slice(0, 5).forEach(m => {
        console.log(`  - ${m.type} (${m.programName})`);
      });
    }

    // Check for duplicates
    const seen = new Map();
    const duplicates = [];
    data.meetings.forEach(m => {
      const key = `${m.programName}|||${m.type}`;
      if (seen.has(key)) {
        duplicates.push(m);
      } else {
        seen.set(key, m);
      }
    });

    console.log('\nDuplicates found:', duplicates.length);
    console.log('Unique meetings:', data.meetings.length - duplicates.length);

    // Show all programs
    console.log('\nPrograms:');
    data.programs.forEach(p => {
      const meetingCount = data.meetings.filter(m => m.programName === p.name).length;
      console.log(`  - ${p.name} (${meetingCount} meetings)`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

check();
