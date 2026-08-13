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

// Cleanup corrupted programs (placeholder names, misclassified, etc.)
router.post('/cleanup', async (req, res) => {
  try {
    const { programIds, programNames } = req.body;

    if (!programIds && !programNames) {
      return res.status(400).json({ error: 'Must provide programIds or programNames' });
    }

    const result = await dbHelpers.deletePrograms({ programIds, programNames });

    res.status(200).json({
      success: true,
      deletedPrograms: result.deletedPrograms,
      deletedMeetings: result.deletedMeetings
    });
  } catch (error) {
    console.error('Error cleaning up programs:', error);
    res.status(500).json({ error: 'Failed to cleanup programs', details: error.message });
  }
});

// Replace all FUTURE program_meetings (used by "Regenerate"). Deletes future rows
// then inserts the provided regenerated set, so date-shifted meetings don't leave
// stale duplicates. Past rows + approvals are untouched.
router.post('/replace-meetings', async (req, res) => {
  try {
    const { meetings } = req.body;
    if (!Array.isArray(meetings)) {
      return res.status(400).json({ error: 'meetings array is required' });
    }
    const result = await dbHelpers.replaceFutureMeetings(meetings);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Error replacing future meetings:', error);
    res.status(500).json({ error: 'Failed to replace meetings', details: error.message });
  }
});

// Move one meeting to a new date/time. The plain save only upserts, so a date
// change would otherwise insert a second row and orphan the old one under the
// (program_name, type, date) unique constraint.
router.post('/move-meeting', async (req, res) => {
  try {
    const { programName, type, fromDate, toDate, time } = req.body;
    if (!programName || !type || !fromDate || !toDate) {
      return res.status(400).json({ error: 'programName, type, fromDate and toDate are required' });
    }
    const result = await dbHelpers.moveMeeting({ programName, type, fromDate, toDate, time });
    console.log(`[MOVE] ${type} / ${programName}: ${fromDate} -> ${toDate} (${result.moved} row(s))`);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Error moving meeting:', error);
    res.status(500).json({ error: 'Failed to move meeting', details: error.message });
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
