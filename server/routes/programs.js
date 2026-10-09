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

// Lock / unlock a meeting against automatic date changes. A locked meeting keeps
// its date through "Regenerera" and is refused by move-meeting.
router.post('/lock', async (req, res) => {
  try {
    const { programName, type, date, locked, byId } = req.body;
    if (!programName || !type || !date || typeof locked !== 'boolean') {
      return res.status(400).json({ error: 'programName, type, date and locked (boolean) are required' });
    }
    const result = await dbHelpers.setMeetingLocked({ programName, type, date, locked, byId });
    console.log(`[LOCK] ${type} / ${programName} @ ${date}: locked=${locked} (${result.updated} row(s))`);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Error updating meeting lock:', error);
    res.status(500).json({ error: 'Failed to update meeting lock', details: error.message });
  }
});

// Mark a program as having a workshop the week after start. The Reception Lunch
// then goes on the Monday instead of the first seminar day. Its own endpoint,
// never the auto-save, like the lock: a shared fact a stale tab must not clobber.
router.post('/workshop-week', async (req, res) => {
  try {
    const { name, type, year, value } = req.body;
    if (!name || !type || year == null || typeof value !== 'boolean') {
      return res.status(400).json({ error: 'name, type, year and value (boolean) are required' });
    }
    const result = await dbHelpers.setWorkshopWeek({ name, type, year, value });
    console.log(`[WORKSHOP WEEK] ${type} / ${name} ${year}: ${value} (${result.updated} row(s))`);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Error updating workshop week:', error);
    res.status(500).json({ error: 'Failed to update workshop week', details: error.message });
  }
});

// Add an EXTRA meeting — a one-off that no rule produces. Its own endpoint, never
// the meetings auto-save: the row is marked custom so "Regenerera" keeps it, and
// that marker is a shared fact a stale tab must not be able to drop.
router.post('/custom-meeting', async (req, res) => {
  try {
    const { meeting, byId } = req.body;
    const m = meeting || {};
    const missing = ['programName', 'programType', 'type', 'date', 'time']
      .filter(f => !m[f] || !String(m[f]).trim());
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing: ${missing.join(', ')}` });
    }
    if (isNaN(new Date(m.date).getTime())) {
      return res.status(400).json({ error: 'date is not a valid date' });
    }
    if (!/^\d{2}:\d{2}$/.test(m.time)) {
      return res.status(400).json({ error: 'time must be HH:MM' });
    }
    const duration = Number(m.duration);
    if (!Number.isInteger(duration) || duration <= 0) {
      return res.status(400).json({ error: 'duration must be a positive number of minutes' });
    }
    const clean = Object.assign({}, m, {
      programName: String(m.programName).trim(),
      type: String(m.type).trim(),
      duration,
      participants: Array.isArray(m.participants) ? m.participants : [],
    });
    const result = await dbHelpers.addCustomMeeting(clean, byId);
    if (result.conflict) {
      return res.status(409).json({ error: 'A meeting of that type already exists for that program on that date' });
    }
    console.log(`[CUSTOM] Added ${clean.type} / ${clean.programName} @ ${clean.date} ${clean.time}`);
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    console.error('Error adding extra meeting:', error);
    res.status(500).json({ error: 'Failed to add meeting', details: error.message });
  }
});

// Remove an extra meeting. Rule meetings are refused (deleted: 0) — Regenerera
// would only bring them back.
router.post('/custom-meeting/delete', async (req, res) => {
  try {
    const { programName, type, date } = req.body;
    if (!programName || !type || !date) {
      return res.status(400).json({ error: 'programName, type and date are required' });
    }
    const result = await dbHelpers.deleteCustomMeeting({ programName, type, date });
    console.log(`[CUSTOM] Deleted ${type} / ${programName} @ ${date} (${result.deleted} row(s))`);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Error deleting extra meeting:', error);
    res.status(500).json({ error: 'Failed to delete meeting', details: error.message });
  }
});

// Mark / unmark that the official Outlook invitation has been sent.
// Its own endpoint, never the meetings auto-save: this is a shared fact and a
// stale tab must not be able to overwrite it.
router.post('/invitation', async (req, res) => {
  try {
    const { programName, type, date, sent, byId, forTime } = req.body;
    if (!programName || !type || !date || typeof sent !== 'boolean') {
      return res.status(400).json({ error: 'programName, type, date and sent (boolean) are required' });
    }
    const result = await dbHelpers.setInvitationSent({ programName, type, date, sent, byId, forTime });
    console.log(`[INVITATION] ${type} / ${programName} @ ${date}: sent=${sent} (${result.updated} row(s))`);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Error updating invitation status:', error);
    res.status(500).json({ error: 'Failed to update invitation status', details: error.message });
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
