const { Pool } = require('pg');
const { dbHelpers } = require('./db');

const DATABASE_URL = process.env.DATABASE_PUBLIC_URL;

async function testUpdateReview() {
  const reviewId = 'e58c119e-b6dd-41f9-93bd-30251752220e';

  console.log(`Testing updateReview for ${reviewId}...\n`);

  try {
    // First check if review exists
    const review = await dbHelpers.getReview(reviewId);
    console.log(`✅ Review exists with ${review.meetings.length} meetings`);
    console.log(`   Created: ${review.created_at}`);

    // Try to update with a simple test
    console.log('\nTesting update with empty array...');
    const result = await dbHelpers.updateReview(reviewId, []);
    console.log('✅ Update succeeded:', result);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }

  process.exit(0);
}

testUpdateReview();
