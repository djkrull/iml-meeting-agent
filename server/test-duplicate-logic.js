const { dbHelpers } = require('./db');

async function test() {
  try {
    const data = await dbHelpers.getPrograms();
    console.log('Total meetings in DB:', data.meetings.length);

    // Simulate the duplicate removal logic from frontend
    const seen = new Map();
    const unique = [];

    data.meetings.forEach(meeting => {
      const key = `${meeting.programName}|||${meeting.type}`;
      if (!seen.has(key)) {
        seen.set(key, true);
        unique.push(meeting);
      }
    });

    console.log('Unique meetings after deduplication:', unique.length);
    console.log('Removed:', data.meetings.length - unique.length);

    if (unique.length < 20) {
      console.log('\n⚠️ WARNING: Only', unique.length, 'unique meetings!');
      console.log('\nMeetings that would be kept:');
      unique.forEach(m => {
        console.log(`  - ${m.type} | ${m.programName}`);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

test();
