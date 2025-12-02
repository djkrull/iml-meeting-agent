const { dbHelpers } = require('./db');

async function check() {
  try {
    const data = await dbHelpers.getPrograms();

    // Find meetings with "Title" as program name
    const titleMeetings = data.meetings.filter(m =>
      m.programName === 'Title' ||
      m.programName.toLowerCase().includes('title')
    );

    console.log(`Found ${titleMeetings.length} meetings with "Title" as program name:\n`);
    titleMeetings.forEach(m => {
      console.log(`  ID: ${m.id}`);
      console.log(`  Type: ${m.type}`);
      console.log(`  Program: ${m.programName}`);
      console.log(`  Date: ${new Date(m.date).toISOString().split('T')[0]}`);
      console.log(`  Time: ${m.time}`);
      console.log('');
    });

    // Find programs with "Title" name
    const titlePrograms = data.programs.filter(p =>
      p.name === 'Title' ||
      p.name.toLowerCase().includes('title')
    );

    console.log(`Found ${titlePrograms.length} programs with "Title" as name:\n`);
    titlePrograms.forEach(p => {
      console.log(`  ID: ${p.id}`);
      console.log(`  Name: ${p.name}`);
      console.log(`  Type: ${p.type}`);
      console.log('');
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

check();
