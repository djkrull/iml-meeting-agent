const fetch = require('node-fetch');

async function testRailwayUpdate() {
  const API_URL = 'https://iml-meeting-agent-production.up.railway.app';
  const reviewId = 'e58c119e-b6dd-41f9-93bd-30251752220e';

  console.log('Testing Railway PUT endpoint...\n');

  try {
    // Test with minimal payload
    const testMeeting = {
      id: 1,
      programName: 'Test Program',
      programType: 'Test Type',
      type: 'Test Meeting',
      date: new Date().toISOString(),
      time: '10:00',
      duration: 30,
      participants: ['Test'],
      description: 'Test description',
      requiresDirectors: 1
    };

    console.log(`Sending PUT request to ${API_URL}/api/reviews/${reviewId}`);

    const response = await fetch(`${API_URL}/api/reviews/${reviewId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetings: [testMeeting]
      })
    });

    console.log('Response status:', response.status);
    console.log('Response statusText:', response.statusText);

    const data = await response.json();
    console.log('Response data:', JSON.stringify(data, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testRailwayUpdate();
