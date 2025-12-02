const fetch = require('node-fetch');

async function checkGetPrograms() {
  const API_URL = 'https://iml-meeting-agent-production.up.railway.app';

  console.log('Checking GET /api/programs endpoint...\n');

  try {
    const response = await fetch(`${API_URL}/api/programs`);
    const data = await response.json();

    console.log(`Programs returned: ${data.programs?.length || 0}`);
    console.log(`Meetings returned: ${data.meetings?.length || 0}`);

    if (data.meetings && data.meetings.length > 0) {
      // Check for duplicates
      const seen = new Map();
      const duplicates = [];

      data.meetings.forEach((m, idx) => {
        const key = `${m.programName}|||${m.type}|||${m.date}|||${m.time}`;
        if (seen.has(key)) {
          duplicates.push({ index: idx, meeting: m, original: seen.get(key) });
        } else {
          seen.set(key, idx);
        }
      });

      console.log(`\nDuplicates in response: ${duplicates.length}`);
      if (duplicates.length > 0) {
        console.log('\nFirst 5 duplicates:');
        duplicates.slice(0, 5).forEach(d => {
          console.log(`  ${d.meeting.type} (${d.meeting.programName})`);
          console.log(`    Index ${d.index} duplicates index ${d.original}`);
        });
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkGetPrograms();
