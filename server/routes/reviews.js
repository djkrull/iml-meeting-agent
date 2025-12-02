const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { dbHelpers } = require('../db');

const router = express.Router();

// Create new review
router.post('/', async (req, res) => {
  try {
    const { createdBy, meetings } = req.body;

    console.log('Received review creation request');
    console.log('Meetings count:', meetings?.length);
    if (meetings && meetings.length > 0) {
      console.log('First meeting sample:', JSON.stringify(meetings[0], null, 2));
    }

    if (!meetings || meetings.length === 0) {
      return res.status(400).json({ error: 'No meetings provided' });
    }

    // Generate unique review ID
    const reviewId = uuidv4();

    // Create review
    await dbHelpers.createReview(reviewId, createdBy || 'admin');

    // Add all meetings
    for (const meeting of meetings) {
      await dbHelpers.addMeeting(reviewId, meeting);
    }

    console.log('Review created successfully:', reviewId);

    res.status(201).json({
      success: true,
      reviewId,
      reviewUrl: `/review/${reviewId}`,
      message: `Review created with ${meetings.length} meetings`
    });
  } catch (error) {
    console.error('Error creating review:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to create review', details: error.message });
  }
});

// Update existing review
router.put('/:id', async (req, res) => {
  try {
    const { id: reviewId } = req.params;
    const { meetings } = req.body;

    console.log(`[UPDATE REVIEW] Received update request for review ${reviewId}`);
    console.log('[UPDATE REVIEW] Meetings count:', meetings?.length);

    if (!meetings || meetings.length === 0) {
      return res.status(400).json({ error: 'No meetings provided' });
    }

    // Update review with new meetings (this will delete old meetings and approvals)
    await dbHelpers.updateReview(reviewId, meetings);

    console.log(`[UPDATE REVIEW] Review ${reviewId} updated successfully`);

    res.json({
      success: true,
      reviewId,
      reviewUrl: `/review/${reviewId}`,
      message: `Review updated with ${meetings.length} meetings`
    });
  } catch (error) {
    console.error('[UPDATE REVIEW] Error:', error);
    console.error('[UPDATE REVIEW] Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to update review', details: error.message });
  }
});

// Get review by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const review = await dbHelpers.getReview(id);

    // Calculate approval status for each meeting
    const meetingsWithStatus = review.meetings.map(meeting => {
      const approvedCount = meeting.approvals.filter(a =>
        a.status === 'approved' || a.status === 'accepted'
      ).length;
      const rejectedCount = meeting.approvals.filter(a =>
        a.status === 'rejected' || a.status === 'declined'
      ).length;

      let overallStatus = 'pending';
      if (rejectedCount > 0) {
        overallStatus = 'rejected';
      } else if (approvedCount > 0) {
        overallStatus = 'approved';
      }

      return {
        ...meeting,
        overallStatus,
        approvedCount
      };
    });

    res.json({
      ...review,
      meetings: meetingsWithStatus
    });
  } catch (error) {
    console.error('Error getting review:', error);
    if (error.message === 'Review not found') {
      res.status(404).json({ error: 'Review not found' });
    } else {
      res.status(500).json({ error: 'Failed to get review' });
    }
  }
});

// Update meeting details
router.patch('/:id/meetings/:meetingId', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { description } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }

    await dbHelpers.updateMeetingDescription(meetingId, description);

    res.json({
      success: true,
      message: 'Meeting updated'
    });
  } catch (error) {
    console.error('Error updating meeting:', error);
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

// Sync meeting updates from admin to review (by meeting_id)
router.post('/:id/sync-meeting', async (req, res) => {
  try {
    const { id: reviewId } = req.params;
    const { meetingId, time, date, description, programName, meetingType, checkOnly } = req.body;

    console.log(`[SYNC] Syncing meeting in review ${reviewId}`);
    console.log(`[SYNC] Program: ${programName}, Type: ${meetingType}`);
    console.log(`[SYNC] Updates:`, { time, date: date?.substring(0, 10), description: description?.substring(0, 50) });

    const updates = {};
    if (time !== undefined) updates.time = time;
    if (date !== undefined) updates.date = date;
    if (description !== undefined) updates.description = description;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // If checkOnly, just check for approvals without updating
    if (checkOnly) {
      const meetingInfo = await dbHelpers.getMeetingByCharacteristics(reviewId, programName, meetingType);
      console.log(`[SYNC CHECK] Meeting found:`, meetingInfo ? 'YES' : 'NO');
      if (meetingInfo) {
        console.log(`[SYNC CHECK] Approvals count: ${meetingInfo.approvals?.length || 0}`);
      }
      return res.json({
        success: true,
        found: meetingInfo !== null,
        hasApprovals: meetingInfo && meetingInfo.approvals && meetingInfo.approvals.length > 0,
        approvalCount: meetingInfo?.approvals?.length || 0
      });
    }

    let result;

    // Try matching by program name and type (more robust)
    if (programName && meetingType) {
      result = await dbHelpers.updateMeetingByCharacteristics(reviewId, programName, meetingType, updates);
      console.log(`[SYNC] Matched by characteristics: ${result.changes} rows updated`);
    }
    // Fallback to meeting ID if characteristics not provided
    else if (meetingId) {
      result = await dbHelpers.updateMeetingByMeetingId(reviewId, meetingId, updates);
      console.log(`[SYNC] Matched by ID: ${result.changes} rows updated`);
    }
    else {
      return res.status(400).json({ error: 'Either (programName + meetingType) or meetingId is required' });
    }

    res.json({
      success: true,
      message: 'Meeting synced to review',
      changes: result.changes
    });
  } catch (error) {
    console.error('[SYNC] Error syncing meeting:', error);
    res.status(500).json({ error: 'Failed to sync meeting', details: error.message });
  }
});

// Submit approval for a meeting
router.post('/:id/meetings/:meetingId/approve', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { directorName, status, comment, suggestedDate, suggestedTime } = req.body;

    if (!directorName) {
      return res.status(400).json({ error: 'Director name is required' });
    }

    if (!['approved', 'rejected', 'accepted', 'declined', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await dbHelpers.addApproval(
      meetingId,
      directorName,
      status,
      comment || null,
      suggestedDate || null,
      suggestedTime || null
    );

    // Get updated review
    const { id } = req.params;
    const review = await dbHelpers.getReview(id);

    res.json({
      success: true,
      message: 'Approval submitted',
      review
    });
  } catch (error) {
    console.error('Error submitting approval:', error);
    res.status(500).json({ error: 'Failed to submit approval' });
  }
});

// Clear a director's approval for a specific meeting
router.post('/:id/meetings/:meetingId/clear-approval', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { directorName } = req.body;

    if (!directorName) {
      return res.status(400).json({ error: 'Director name is required' });
    }

    await dbHelpers.clearApproval(meetingId, directorName);

    // Get updated review
    const { id } = req.params;
    const review = await dbHelpers.getReview(id);

    res.json({
      success: true,
      message: 'Approval cleared',
      review
    });
  } catch (error) {
    console.error('Error clearing approval:', error);
    res.status(500).json({ error: 'Failed to clear approval' });
  }
});

// Clear ALL approvals for a specific meeting (by program name and type)
router.post('/:id/clear-meeting-approvals', async (req, res) => {
  try {
    const { id: reviewId } = req.params;
    const { programName, meetingType } = req.body;

    if (!programName || !meetingType) {
      return res.status(400).json({ error: 'Program name and meeting type are required' });
    }

    console.log(`[CLEAR MEETING] Clearing all approvals for: ${meetingType} - ${programName}`);

    // First find the meeting
    const meetingInfo = await dbHelpers.getMeetingByCharacteristics(reviewId, programName, meetingType);

    if (!meetingInfo) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Clear all approvals for this meeting
    const result = await dbHelpers.clearAllApprovalsForMeeting(meetingInfo.id);

    console.log(`[CLEAR MEETING] Cleared ${result.deleted} approval(s)`);

    res.json({
      success: true,
      message: 'All approvals cleared for this meeting',
      deleted: result.deleted
    });
  } catch (error) {
    console.error('[CLEAR MEETING] Error:', error);
    res.status(500).json({ error: 'Failed to clear meeting approvals', details: error.message });
  }
});

// Get status summary
router.get('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const review = await dbHelpers.getReview(id);

    const summary = {
      totalMeetings: review.meetings.length,
      approved: 0,
      partiallyApproved: 0,
      pending: 0,
      rejected: 0,
      readyForExport: 0
    };

    review.meetings.forEach(meeting => {
      const approvedCount = meeting.approvals.filter(a =>
        a.status === 'approved' || a.status === 'accepted'
      ).length;
      const rejectedCount = meeting.approvals.filter(a =>
        a.status === 'rejected' || a.status === 'declined'
      ).length;

      if (rejectedCount > 0) {
        summary.rejected++;
      } else if (approvedCount > 0) {
        summary.approved++;
        summary.readyForExport++;
      } else {
        summary.pending++;
      }
    });

    res.json(summary);
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// Clear all reviews from a specific director
router.post('/:id/clear-director', async (req, res) => {
  try {
    const { id } = req.params;
    const { directorName } = req.body;

    if (!directorName) {
      return res.status(400).json({ error: 'Director name is required' });
    }

    console.log(`Clearing all reviews from director: ${directorName} for review ${id}`);

    await dbHelpers.clearDirectorApprovals(id, directorName);

    res.json({
      success: true,
      message: `All reviews from ${directorName} have been cleared`
    });
  } catch (error) {
    console.error('Error clearing director reviews:', error);
    res.status(500).json({ error: 'Failed to clear director reviews' });
  }
});

// Remove duplicate meetings from review
router.post('/:id/deduplicate', async (req, res) => {
  try {
    const { id: reviewId } = req.params;

    console.log(`[DEDUPE] Deduplicating meetings for review ${reviewId}`);

    const result = await dbHelpers.deduplicateMeetings(reviewId);

    console.log(`[DEDUPE] Removed ${result.removed} duplicates, ${result.remaining} meetings remain`);

    res.json({
      success: true,
      message: 'Duplicates removed',
      removed: result.removed,
      remaining: result.remaining
    });
  } catch (error) {
    console.error('[DEDUPE] Error deduplicating meetings:', error);
    res.status(500).json({ error: 'Failed to deduplicate meetings', details: error.message });
  }
});

module.exports = router;
