const express = require('express');
const { dbHelpers } = require('../db');

const router = express.Router();

// Save programs and meetings
router.post('/', async (req, res) => {
  try {
    const { programs, meetings } = req.body;

    console.log('Received save request');
    console.log('Programs count:', programs?.length);
    console.log('Meetings count:', meetings?.length);

    if (!programs || !meetings) {
      return res.status(400).json({ error: 'Programs and meetings are required' });
    }

    const result = await dbHelpers.savePrograms(programs, meetings);

    console.log('Programs and meetings saved successfully');

    res.status(200).json({
      success: true,
      message: `Saved ${result.programs} programs and ${result.meetings} meetings`,
      ...result
    });
  } catch (error) {
    console.error('Error saving programs:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to save programs', details: error.message });
  }
});

// Get all programs and meetings
router.get('/', async (req, res) => {
  try {
    console.log('Received get programs request');

    const data = await dbHelpers.getPrograms();

    console.log('Retrieved programs:', data.programs.length);
    console.log('Retrieved meetings:', data.meetings.length);

    res.status(200).json({
      success: true,
      programs: data.programs,
      meetings: data.meetings
    });
  } catch (error) {
    console.error('Error getting programs:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to get programs', details: error.message });
  }
});

module.exports = router;
