import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, Users, CheckCircle, XCircle, AlertCircle, MessageSquare, Edit2, Save, X, Download, Info } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const DirectorReviewView = ({ reviewId }) => {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [directorName, setDirectorName] = useState('');
  const [showNamePrompt, setShowNamePrompt] = useState(true);
  const [editingMeetingId, setEditingMeetingId] = useState(null);
  const [editedDescription, setEditedDescription] = useState('');
  const [changingDecisionId, setChangingDecisionId] = useState(null);

  const fetchReview = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/reviews/${reviewId}`);
      if (!response.ok) {
        console.error('Failed to fetch review, status:', response.status);
        setReview(null);
        setLoading(false);
        return;
      }
      const data = await response.json();
      console.log('Review loaded successfully:', data.id, 'Meetings:', data.meetings?.length);
      setReview(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching review:', error);
      setReview(null);
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    if (reviewId && directorName) {
      fetchReview();
      // Poll for updates every 5 seconds
      const interval = setInterval(fetchReview, 5000);
      return () => clearInterval(interval);
    }
  }, [reviewId, directorName, fetchReview]);

  const submitApproval = async (meetingId, status, comment = '', suggestedDate = '', suggestedTime = '') => {
    try {
      await fetch(`${API_URL}/api/reviews/${reviewId}/meetings/${meetingId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directorName,
          status,
          comment,
          suggestedDate,
          suggestedTime
        })
      });
      // Clear changing decision state
      setChangingDecisionId(null);
      // Refresh review
      fetchReview();
    } catch (error) {
      console.error('Error submitting approval:', error);
      alert('Failed to submit approval');
    }
  };

  const updateMeetingDescription = async (meetingId, newDescription) => {
    try {
      const response = await fetch(`${API_URL}/api/reviews/${reviewId}/meetings/${meetingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: newDescription })
      });

      if (!response.ok) {
        throw new Error('Failed to update meeting');
      }

      // Refresh the review
      fetchReview();
      setEditingMeetingId(null);
      setEditedDescription('');
    } catch (error) {
      console.error('Error updating meeting:', error);
      alert('Failed to update meeting description');
    }
  };

  const startEditing = (meeting) => {
    setEditingMeetingId(meeting.id);
    setEditedDescription(meeting.description || '');
  };

  const cancelEditing = () => {
    setEditingMeetingId(null);
    setEditedDescription('');
  };

  const exportToOutlook = () => {
    if (!review || !review.meetings || review.meetings.length === 0) {
      alert('No meetings to export');
      return;
    }

    // Helper function to format date/time for ICS
    const formatICSDateTime = (date, time) => {
      const [hours, minutes] = time.split(':');
      const dt = new Date(date);
      dt.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      const year = dt.getFullYear();
      const month = String(dt.getMonth() + 1).padStart(2, '0');
      const day = String(dt.getDate()).padStart(2, '0');
      const hour = String(dt.getHours()).padStart(2, '0');
      const minute = String(dt.getMinutes()).padStart(2, '0');

      return `${year}${month}${day}T${hour}${minute}00`;
    };

    // Helper function to calculate end time
    const calculateEndTime = (startDateTime, durationMinutes) => {
      const dt = new Date(
        startDateTime.slice(0, 4),
        parseInt(startDateTime.slice(4, 6)) - 1,
        startDateTime.slice(6, 8),
        startDateTime.slice(9, 11),
        startDateTime.slice(11, 13)
      );
      dt.setMinutes(dt.getMinutes() + durationMinutes);

      const year = dt.getFullYear();
      const month = String(dt.getMonth() + 1).padStart(2, '0');
      const day = String(dt.getDate()).padStart(2, '0');
      const hour = String(dt.getHours()).padStart(2, '0');
      const minute = String(dt.getMinutes()).padStart(2, '0');

      return `${year}${month}${day}T${hour}${minute}00`;
    };

    // Build ICS file content
    let icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//IML Meeting Agent//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:IML Preliminary Meetings',
      'X-WR-TIMEZONE:Europe/Stockholm'
    ];

    // Filter meetings (exclude Kleindagarna, Summer Onboarding/Weekly Welcome, already-scheduled)
    const meetingsToExport = review.meetings.filter(meeting => {
      if (meeting.program_type === 'Kleindagarna') return false;
      if (meeting.program_type === 'Summer Conference' &&
          (meeting.type.includes('Onboarding') || meeting.type.includes('Weekly Welcome'))) {
        return false;
      }
      if (meeting.status === 'already-scheduled') return false;
      return true;
    });

    meetingsToExport.forEach((meeting) => {
      const startDateTime = formatICSDateTime(meeting.date, meeting.time);
      const endDateTime = calculateEndTime(startDateTime, meeting.duration);
      const timestamp = formatICSDateTime(new Date(), '12:00');

      // Get program year
      const programYear = meeting.program_year || new Date(meeting.date).getFullYear();
      const programTypeWithYear = `${meeting.program_type} ${programYear}`;

      // Build participants string
      const participantsStr = Array.isArray(meeting.participants)
        ? meeting.participants.join(', ')
        : (typeof meeting.participants === 'string' ? JSON.parse(meeting.participants).join(', ') : '');

      icsContent.push('BEGIN:VEVENT');
      icsContent.push(`UID:iml-meeting-${meeting.id}-${Date.now()}@institutmittagleffler.se`);
      icsContent.push(`DTSTAMP:${timestamp}`);
      icsContent.push(`DTSTART:${startDateTime}`);
      icsContent.push(`DTEND:${endDateTime}`);
      icsContent.push(`SUMMARY:Prl: ${meeting.type} - ${programTypeWithYear}`);
      icsContent.push(`DESCRIPTION:${meeting.description || ''}\\n\\nParticipants: ${participantsStr}\\n\\nProgram: ${meeting.program_name}`);
      icsContent.push(`LOCATION:Institut Mittag-Leffler`);
      icsContent.push(`CATEGORIES:${meeting.program_type}`);
      icsContent.push(`STATUS:TENTATIVE`);
      icsContent.push('END:VEVENT');
    });

    icsContent.push('END:VCALENDAR');

    // Create and download the file
    const icsBlob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(icsBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `IML_Preliminary_Meetings_${new Date().toISOString().split('T')[0]}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });
  };

  const getMyApproval = (meeting) => {
    // First try exact match
    let approval = meeting.approvals?.find(a => a.director_name === directorName);

    // If no exact match, try flexible matching (check if core name is included)
    if (!approval && directorName) {
      const coreName = directorName.replace(/, (Director|Deputy Director)$/i, '').trim();
      approval = meeting.approvals?.find(a => {
        const approvalCoreName = a.director_name.replace(/, (Director|Deputy Director)$/i, '').trim();
        return approvalCoreName === coreName ||
               a.director_name.includes(coreName) ||
               coreName.includes(approvalCoreName);
      });
    }

    return approval;
  };

  const getOtherApprovals = (meeting) => {
    const myApproval = getMyApproval(meeting);
    if (!myApproval) {
      return meeting.approvals || [];
    }
    // Filter out the approval that matches the current director
    return meeting.approvals?.filter(a => a.id !== myApproval.id) || [];
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return 'bg-green-100 border-green-500 text-green-800';
      case 'partially-approved': return 'bg-yellow-100 border-yellow-500 text-yellow-800';
      case 'rejected': return 'bg-red-100 border-red-500 text-red-800';
      default: return 'bg-gray-100 border-gray-300 text-gray-800';
    }
  };

  const getProgramTypeColor = (programType) => {
    const type = programType?.toLowerCase() || '';
    if (type.includes('fall') || type.includes('höst')) {
      return 'bg-orange-500 text-white';
    } else if (type.includes('spring') || type.includes('vår')) {
      return 'bg-green-500 text-white';
    } else if (type.includes('summer') || type.includes('sommar')) {
      return 'bg-yellow-500 text-white';
    } else if (type.includes('winter') || type.includes('vinter')) {
      return 'bg-blue-500 text-white';
    } else if (type.includes('workshop')) {
      return 'bg-purple-500 text-white';
    } else if (type.includes('conference') || type.includes('konferens')) {
      return 'bg-indigo-500 text-white';
    } else {
      return 'bg-gray-500 text-white';
    }
  };

  if (showNamePrompt) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Director Review Access</h2>
          <p className="text-gray-600 mb-6">
            Please select your name to access the meeting review:
          </p>
          <div className="space-y-3">
            <button
              onClick={() => {
                setDirectorName('Tobias Ekholm, Director');
                setShowNamePrompt(false);
              }}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-4 rounded-lg font-semibold transition text-left flex items-center justify-between"
            >
              <span>Tobias Ekholm</span>
              <span className="text-sm text-indigo-200">Director</span>
            </button>
            <button
              onClick={() => {
                setDirectorName('Hans Ringström, Deputy Director');
                setShowNamePrompt(false);
              }}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-4 rounded-lg font-semibold transition text-left flex items-center justify-between"
            >
              <span>Hans Ringström</span>
              <span className="text-sm text-indigo-200">Deputy Director</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading review...</p>
        </div>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Review Not Found</h2>
          <p className="text-gray-600">This review link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Meeting Review</h1>
              <p className="text-gray-600 mt-2">Welcome, {directorName}</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={exportToOutlook}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition"
                title="Export all meetings to Outlook calendar"
              >
                <Download className="w-5 h-5" />
                Export to Outlook
              </button>
              <Calendar className="w-12 h-12 text-indigo-600" />
            </div>
          </div>
          <div className="bg-indigo-50 p-4 rounded-lg space-y-2">
            <p className="text-sm text-indigo-800">
              <strong>Note:</strong> You can see other directors' responses in real-time.
              Please indicate your availability for each meeting so IML admin can plan before inviting organizers.
            </p>
            <div className="flex items-start gap-2 text-sm text-indigo-700 bg-indigo-100 p-3 rounded">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <strong>Export Instructions:</strong> Click "Export to Outlook" to download an .ics file.
                In Outlook: File → Open & Export → Import/Export → Import an iCalendar (.ics) file.
                All meetings are marked as tentative/preliminary pending organizer confirmation.
              </div>
            </div>
          </div>
        </div>

        {/* Meetings List */}
        <div className="space-y-4">
          {review.meetings?.filter(meeting => {
            // Filter out meetings that don't need director approval
            if (meeting.program_type === 'Kleindagarna') return false;
            if (meeting.program_type === 'Summer Conference' &&
                (meeting.type.includes('Onboarding') || meeting.type.includes('Weekly Welcome'))) {
              return false;
            }
            // Filter out already scheduled meetings
            if (meeting.status === 'already-scheduled') return false;
            return true;
          }).map((meeting) => {
            const myApproval = getMyApproval(meeting);
            const otherApprovals = getOtherApprovals(meeting);

            // Use program year from program start date, or fall back to meeting date
            const programYear = meeting.program_year || new Date(meeting.date).getFullYear();
            const programTypeWithYear = `${meeting.program_type} ${programYear}`;

            return (
              <div
                key={meeting.id}
                className={`rounded-lg shadow-lg border-l-4 p-6 ${
                  changingDecisionId === meeting.id
                    ? 'bg-white border-gray-300'
                    : getStatusColor(meeting.overallStatus)
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-gray-800">{meeting.type}</h3>
                      <span className={`text-sm px-3 py-1 rounded-full font-medium ${getProgramTypeColor(meeting.program_type)}`}>
                        {programTypeWithYear}
                      </span>
                      <span className="text-sm bg-gray-200 px-3 py-1 rounded-full">
                        {meeting.program_name}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                      <div className="flex items-center text-gray-700">
                        <Calendar className="w-4 h-4 mr-2" />
                        <span className="text-sm">{formatDate(meeting.date)}</span>
                      </div>
                      <div className="flex items-center text-gray-700">
                        <Clock className="w-4 h-4 mr-2" />
                        <span className="text-sm">{meeting.time} ({meeting.duration} min)</span>
                      </div>
                    </div>

                    {/* Participants */}
                    {Array.isArray(meeting.participants) && meeting.participants.length > 0 && (
                      <div className="flex items-start text-gray-700 mb-3">
                        <Users className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                        <span className="text-sm">
                          <strong>Participants:</strong> {meeting.participants.join(', ')}
                        </span>
                      </div>
                    )}

                    {/* Description with Edit capability */}
                    <div className="mb-3">
                      {editingMeetingId === meeting.id ? (
                        <div className="flex gap-2 items-start">
                          <textarea
                            value={editedDescription}
                            onChange={(e) => setEditedDescription(e.target.value)}
                            className="flex-1 px-3 py-2 border border-indigo-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            rows="3"
                          />
                          <button
                            onClick={() => updateMeetingDescription(meeting.id, editedDescription)}
                            className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                            title="Save"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <p className="text-sm text-gray-600">{meeting.description}</p>
                          <button
                            onClick={() => startEditing(meeting)}
                            className="text-indigo-600 hover:text-indigo-800 transition flex-shrink-0"
                            title="Edit description"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Other Directors' Responses */}
                    {otherApprovals.length > 0 && (
                      <div className="bg-blue-50 p-3 rounded-lg mb-3">
                        <p className="text-sm font-semibold text-blue-800 mb-2">Other Director's Response:</p>
                        {otherApprovals.map((approval, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            {(approval.status === 'accepted' || approval.status === 'approved') ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : (approval.status === 'declined' || approval.status === 'rejected') ? (
                              <XCircle className="w-4 h-4 text-red-600" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-gray-600" />
                            )}
                            <span className="text-blue-900">
                              {approval.director_name}: <strong>{
                                (approval.status === 'accepted' || approval.status === 'approved') ? 'Attending' :
                                (approval.status === 'declined' || approval.status === 'rejected') ? 'Not available' :
                                'Pending'
                              }</strong>
                              {approval.comment && ` - "${approval.comment}"`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Approval Buttons */}
                  <div className="flex flex-col gap-2 ml-4">
                    {myApproval && changingDecisionId !== meeting.id ? (
                      <div className="text-center">
                        <div className={`px-4 py-2 rounded-lg font-medium ${
                          myApproval.status === 'accepted' || myApproval.status === 'approved'
                            ? 'bg-green-600 text-white'
                            : myApproval.status === 'declined' || myApproval.status === 'rejected'
                            ? 'bg-red-600 text-white'
                            : 'bg-gray-400 text-white'
                        }`}>
                          {(myApproval.status === 'accepted' || myApproval.status === 'approved') ? 'Attending' :
                           (myApproval.status === 'declined' || myApproval.status === 'rejected') ? 'Not available' : 'Pending'}
                        </div>
                        <button
                          onClick={() => setChangingDecisionId(meeting.id)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 mt-2"
                        >
                          Change decision
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => submitApproval(meeting.id, 'accepted')}
                          className="px-4 py-2 rounded-lg font-medium bg-green-600 text-white hover:bg-green-700 transition flex items-center gap-2"
                        >
                          <CheckCircle className="w-4 h-4" />
                          I will attend
                        </button>
                        <button
                          onClick={() => submitApproval(meeting.id, 'declined')}
                          className="px-4 py-2 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 transition flex items-center gap-2"
                        >
                          <XCircle className="w-4 h-4" />
                          Cannot attend
                        </button>
                        <button
                          onClick={() => {
                            const comment = prompt('Add a comment:');
                            if (comment) {
                              const myApproval = getMyApproval(meeting);
                              const currentStatus = myApproval ? myApproval.status : 'pending';
                              submitApproval(meeting.id, currentStatus, comment);
                            }
                          }}
                          className="px-4 py-2 rounded-lg font-medium bg-gray-500 text-white hover:bg-gray-600 transition flex items-center gap-2 text-sm"
                        >
                          <MessageSquare className="w-4 h-4" />
                          Add Comment
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DirectorReviewView;
