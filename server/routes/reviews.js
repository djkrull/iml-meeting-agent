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

module.exports = router;
