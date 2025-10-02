import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Users, CheckCircle, XCircle, AlertCircle, MessageSquare } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const DirectorReviewView = ({ reviewId }) => {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [directorName, setDirectorName] = useState('');
  const [showNamePrompt, setShowNamePrompt] = useState(true);

  useEffect(() => {
    if (reviewId && directorName) {
      fetchReview();
      // Poll for updates every 5 seconds
      const interval = setInterval(fetchReview, 5000);
      return () => clearInterval(interval);
    }
  }, [reviewId, directorName]);

  const fetchReview = async () => {
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
  };

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
      // Refresh review
      fetchReview();
    } catch (error) {
      console.error('Error submitting approval:', error);
      alert('Failed to submit approval');
    }
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
    return meeting.approvals?.find(a => a.director_name === directorName);
  };

  const getOtherApprovals = (meeting) => {
    return meeting.approvals?.filter(a => a.director_name !== directorName) || [];
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return 'bg-green-100 border-green-500 text-green-800';
      case 'partially-approved': return 'bg-yellow-100 border-yellow-500 text-yellow-800';
      case 'rejected': return 'bg-red-100 border-red-500 text-red-800';
      default: return 'bg-gray-100 border-gray-300 text-gray-800';
    }
  };

  if (showNamePrompt) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Director Review Access</h2>
          <p className="text-gray-600 mb-6">
            Please enter your name to access the meeting review:
          </p>
          <input
            type="text"
            value={directorName}
            onChange={(e) => setDirectorName(e.target.value)}
            placeholder="Your name (e.g., Director A)"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={() => {
              if (directorName.trim()) {
                setShowNamePrompt(false);
              } else {
                alert('Please enter your name');
              }
            }}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-semibold transition"
          >
            Continue to Review
          </button>
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
            <Calendar className="w-12 h-12 text-indigo-600" />
          </div>
          <div className="bg-indigo-50 p-4 rounded-lg">
            <p className="text-sm text-indigo-800">
              <strong>Note:</strong> You can see other directors' approvals in real-time.
              Meetings marked in green require {" "}
              <span className="font-semibold">1 director</span>, while others may require{" "}
              <span className="font-semibold">both directors</span>.
            </p>
          </div>
        </div>

        {/* Meetings List */}
        <div className="space-y-4">
          {review.meetings?.map((meeting) => {
            const myApproval = getMyApproval(meeting);
            const otherApprovals = getOtherApprovals(meeting);

            return (
              <div
                key={meeting.id}
                className={`bg-white rounded-lg shadow-lg border-l-4 ${getStatusColor(meeting.overallStatus)} p-6`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-gray-800">{meeting.type}</h3>
                      <span className="text-sm bg-gray-200 px-3 py-1 rounded-full">
                        {meeting.program_name}
                      </span>
                      <span className="text-xs text-gray-600">
                        Requires {meeting.requires_directors} director{meeting.requires_directors > 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                      <div className="flex items-center text-gray-700">
                        <Calendar className="w-4 h-4 mr-2" />
                        <span className="text-sm">{formatDate(meeting.date)}</span>
                      </div>
                      <div className="flex items-center text-gray-700">
                        <Clock className="w-4 h-4 mr-2" />
                        <span className="text-sm">{meeting.time} ({meeting.duration} min)</span>
                      </div>
                      <div className="flex items-center text-gray-700">
                        <Users className="w-4 h-4 mr-2" />
                        <span className="text-sm">{JSON.parse(meeting.participants).length} participants</span>
                      </div>
                    </div>

                    <p className="text-sm text-gray-600 mb-3">{meeting.description}</p>

                    {/* Other Directors' Approvals */}
                    {otherApprovals.length > 0 && (
                      <div className="bg-blue-50 p-3 rounded-lg mb-3">
                        <p className="text-sm font-semibold text-blue-800 mb-2">Other Directors:</p>
                        {otherApprovals.map((approval, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            {approval.status === 'approved' ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : approval.status === 'rejected' ? (
                              <XCircle className="w-4 h-4 text-red-600" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-gray-600" />
                            )}
                            <span className="text-blue-900">
                              {approval.director_name}: <strong>{approval.status}</strong>
                              {approval.comment && ` - "${approval.comment}"`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Approval Buttons */}
                  <div className="flex flex-col gap-2 ml-4">
                    {myApproval ? (
                      <div className="text-center">
                        <div className={`px-4 py-2 rounded-lg font-medium ${
                          myApproval.status === 'approved'
                            ? 'bg-green-600 text-white'
                            : myApproval.status === 'rejected'
                            ? 'bg-red-600 text-white'
                            : 'bg-gray-400 text-white'
                        }`}>
                          Your status: {myApproval.status}
                        </div>
                        <button
                          onClick={() => submitApproval(meeting.id, 'pending')}
                          className="text-xs text-indigo-600 hover:text-indigo-800 mt-2"
                        >
                          Change decision
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => submitApproval(meeting.id, 'approved')}
                          className="px-4 py-2 rounded-lg font-medium bg-green-600 text-white hover:bg-green-700 transition flex items-center gap-2"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            const comment = prompt('Optional comment:');
                            submitApproval(meeting.id, 'rejected', comment || '');
                          }}
                          className="px-4 py-2 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 transition flex items-center gap-2"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject
                        </button>
                        <button
                          onClick={() => {
                            const comment = prompt('Add a comment or suggest changes:');
                            if (comment) {
                              submitApproval(meeting.id, 'pending', comment);
                            }
                          }}
                          className="px-4 py-2 rounded-lg font-medium bg-gray-500 text-white hover:bg-gray-600 transition flex items-center gap-2 text-sm"
                        >
                          <MessageSquare className="w-4 h-4" />
                          Comment
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
