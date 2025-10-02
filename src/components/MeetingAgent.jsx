import React, { useState } from 'react';
import { Calendar, Clock, Users, Download, CheckCircle, XCircle, FileSpreadsheet, Upload, CalendarDays, Edit2, Share2, Copy, Save, X } from 'lucide-react';
import * as XLSX from 'xlsx';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const MeetingAgent = () => {
  const [programs, setPrograms] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [editingMeetingId, setEditingMeetingId] = useState(null);
  const [editedDescription, setEditedDescription] = useState('');
  const [filters, setFilters] = useState({
    'Spring Program': true,
    'Fall Program': true,
    'Kleindagarna': true,
    'Summer Conference': true
  });
  const [editingMeeting, setEditingMeeting] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [reviewUrl, setReviewUrl] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);

  // Debug: Component loaded
  console.log('MeetingAgent component loaded');

  // Meeting type definitions
  const springFallMeetings = [
      {
        name: 'Introduction Meeting',
        leadTime: -540, // 18 months before (540 days)
        weekday: 5, // Friday
        time: '10:00',
        participants: ['Program Organizers', 'Directors', 'Admin Coordinator'],
        duration: 30,
        description: 'Initial program planning and expectations'
      },
      {
        name: 'Check-in meeting with organizers',
        leadTime: -180, // 6 months before
        weekday: 5, // Friday
        time: '10:00',
        participants: ['Program Organizers', 'Admin Team', 'Directors'],
        duration: 30,
        description: 'Review preparations and logistics'
      },
      {
        name: 'Check-in meeting junior fellows',
        leadTime: -180, // 6 months before (same day, right after organizers)
        weekday: 5, // Friday
        time: '10:30',
        participants: ['Junior Fellows', 'Admin Team'],
        duration: 30,
        description: 'Junior fellow orientation and support'
      },
      {
        name: 'Onboarding meeting',
        leadTime: 3, // Friday after program start
        weekday: 5, // Friday
        participants: ['Admin Team', 'Organizers', 'Directors'],
        duration: 30,
        description: 'Practical information and house rules'
      },
      {
        name: 'Program Start Meeting',
        leadTime: 4, // Tuesday after program start
        weekday: 2, // Tuesday
        time: '09:00',
        participants: ['Program Organizers', 'All Participants', 'Directors'],
        duration: 30,
        description: 'Official program kickoff'
      },
      {
        name: 'Mid-term meeting',
        leadTime: 42, // ~6 weeks in
        weekday: 5, // Friday
        participants: ['Program Organizers', 'Admin Team', 'Directors'],
        duration: 30,
        description: 'Progress check and adjustments'
      },
      {
        name: 'Evaluation meeting',
        leadTime: 'end', // Special: April 20+ for Spring, week before end for Fall
        weekday: 5, // Friday
        participants: ['Program Organizers', 'Admin Team', 'Directors'],
        duration: 30,
        description: 'Program evaluation and feedback'
      }
    ];

  const meetingTypes = {
    'Spring Program': springFallMeetings,
    'Fall Program': springFallMeetings,
    'Kleindagarna': [
      {
        name: 'Meeting with organizer and B&P',
        leadTime: -120, // 4 months before
        weekday: 5, // Friday
        participants: ['Event Organizer', 'B&P Team', 'Admin Coordinator'],
        duration: 30,
        description: 'Budget and planning coordination'
      },
      {
        name: 'Check-in meeting with Organizer',
        leadTime: -45, // 45 days before
        weekday: 5, // Friday
        participants: ['Event Organizer', 'Admin Team'],
        duration: 30,
        description: 'Final preparations and logistics'
      }
    ],
    'Summer Conference': [
      {
        name: 'Introduction Meeting - Group 1',
        leadTime: -240, // 8 months before
        weekday: 5, // Friday
        time: '10:00',
        participants: ['Conference Organizer Group 1', 'Admin Team'],
        duration: 30,
        description: 'Initial planning for first conference group'
      },
      {
        name: 'Introduction Meeting - Group 2',
        leadTime: -240, // Same day as Group 1, right after
        weekday: 5, // Friday
        time: '15:00',
        participants: ['Conference Organizer Group 2', 'Admin Team'],
        duration: 30,
        description: 'Initial planning for second conference group'
      },
      {
        name: 'Check-in Meeting - Group 1',
        leadTime: -90, // 3 months before
        weekday: 5, // Friday
        time: '10:00',
        participants: ['Conference Organizer Group 1', 'Admin Team'],
        duration: 30,
        description: 'Pre-conference preparations review'
      },
      {
        name: 'Check-in Meeting - Group 2',
        leadTime: -90, // Same day as Group 1, right after
        weekday: 5, // Friday
        time: '10:30',
        participants: ['Conference Organizer Group 2', 'Admin Team'],
        duration: 30,
        description: 'Pre-conference preparations review'
      },
      {
        name: 'Weekly Onboarding meeting light',
        leadTime: 0, // During conference period
        recurring: 'weekly',
        weekday: 1, // Monday
        time: '09:30',
        participants: ['Organizers', 'Admin Team'],
        duration: 30,
        description: 'Weekly orientation for new participants'
      },
      {
        name: 'Weekly Welcome Meeting',
        leadTime: 0,
        recurring: 'weekly',
        weekday: 1, // Monday
        time: '10:00',
        participants: ['All Conference Participants'],
        duration: 15,
        description: 'Weekly welcome and updates'
      }
    ]
  };

  // Process file (shared between upload and drop)
  const processFile = async (file) => {
    if (!file) {
      console.log('No file selected');
      return;
    }

    console.log('File selected:', file.name);
    setLoading(true);
    setSelectedFile(file.name);

    try {
      const data = await file.arrayBuffer();
      console.log('File read, size:', data.byteLength);

      const workbook = XLSX.read(data);
      console.log('Workbook loaded, sheets:', workbook.SheetNames);

      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      console.log('Data parsed, rows:', jsonData.length);
      console.log('First row sample:', jsonData[0]);

      // Parse program data
      const parsedPrograms = jsonData.map((row, index) => {
        console.log(`Processing row ${index}:`, row);

        const year = row['År'];
        const dateStr = row['Datum'];

        // Calculate start and end dates from Swedish date range
        let startDate = null;
        let endDate = null;

        if (dateStr && typeof dateStr === 'string' && year) {
          console.log(`Parsing date string: "${dateStr}" for year ${year}`);

          // Check if it's a date range (contains dash but not at start)
          if (dateStr.includes('-') && !dateStr.startsWith('-')) {
            const parts = dateStr.split('-').map(p => p.trim());

            // Check if first part is just a number (day range like "8-12 juni")
            if (parts.length === 2 && /^\d{1,2}$/.test(parts[0]) && /^\d{1,2}\s+\w+/.test(parts[1])) {
              // Format: "8-12 juni" - day range in same month
              const endDayMatch = parts[1].match(/^(\d{1,2})\s+(\w+)$/);
              if (endDayMatch) {
                const monthName = endDayMatch[2];
                // Both days use the same month
                startDate = parseDate(parts[0].trim() + ' ' + monthName, year);
                endDate = parseDate(parts[1].trim(), year);
                console.log(`Day range in same month: start="${parts[0]} ${monthName}", end="${parts[1]}" => Start: ${startDate}, End: ${endDate}`);
              }
            } else if (parts.length === 2) {
              // Format: "15 januari - 25 april" - different months
              startDate = parseDate(parts[0], year);
              endDate = parseDate(parts[1], year);
              console.log(`Date range: "${parts[0]}" to "${parts[1]}"`);
            }
          } else {
            // Single date
            startDate = parseDate(dateStr, year);
            endDate = startDate;
          }

          console.log(`Parsed dates - Start: ${startDate}, End: ${endDate}`);
        }

        // Determine program type based on name and dates
        let type = 'Spring Program'; // Default

        if (row['Program']?.toLowerCase().includes('klein')) {
          type = 'Kleindagarna';
        } else if (row['Program']?.toLowerCase().includes('summer school') ||
                   dateStr?.includes('juni') || dateStr?.includes('juli')) {
          type = 'Summer Conference';
        } else if (startDate) {
          // Determine Spring or Fall based on start month
          const startMonth = startDate.getMonth();
          // Spring: Jan-May (0-4), Fall: Aug-Dec (7-11)
          if (startMonth >= 0 && startMonth <= 4) {
            type = 'Spring Program';
          } else if (startMonth >= 7 && startMonth <= 11) {
            type = 'Fall Program';
          }
        }

        return {
          id: index + 1,
          name: row['Program'] || 'Unnamed Program',
          type: type,
          startDate: startDate,
          endDate: endDate,
          organizer: row['Organisatörer'] || 'Unknown',
          status: row['Bekräftad'] === 'JA' ? 'Confirmed' : 'Planned',
          year: year
        };
      });

      console.log('All parsed programs before filtering:', parsedPrograms.length);

      // Filter out board meetings and other non-program events
      const excludedPrograms = ['styrelsemöte', 'prefektmöte', 'board meeting', 'acta editorial'];
      const filteredPrograms = parsedPrograms.filter(p => {
        // Exclude board meetings and similar
        if (p.name && excludedPrograms.some(excluded => p.name.toLowerCase().includes(excluded))) {
          console.log(`Excluding non-program event: ${p.name}`);
          return false;
        }
        // Filter out programs that have completely ended (keep ongoing and future)
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset to start of day

        // Keep program if:
        // 1. It has a valid start date
        // 2. Either no end date (single day event) OR end date is today or in the future
        const keep = p.startDate && (!p.endDate || p.endDate >= today || p.startDate >= today);

        if (!keep && p.startDate) {
          console.log(`Filtering out past program: ${p.name} (ended: ${p.endDate})`);
        }

        return keep;
      });

      console.log('Filtered programs:', filteredPrograms);
      console.log(`Kept ${filteredPrograms.length} current/future programs (filtered out ${parsedPrograms.length - filteredPrograms.length})`);
      setPrograms(filteredPrograms);
      generateMeetings(filteredPrograms);
    } catch (error) {
      console.error('Error loading file:', error);
      alert(`Error loading Excel file: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Load Excel file from input
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    await processFile(file);
  };

  // Handle drag over
  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  // Handle drag leave
  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  // Handle file drop
  const handleDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      // Check if it's an Excel file
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        await processFile(file);
      } else {
        alert('Please upload an Excel file (.xlsx or .xls)');
      }
    }
  };

  // Parse date from various formats including Swedish text dates
  const parseDate = (dateValue, year) => {
    if (!dateValue) return null;

    // If it's already a Date object
    if (dateValue instanceof Date) return dateValue;

    // If it's an Excel serial number
    if (typeof dateValue === 'number') {
      return new Date((dateValue - 25569) * 86400 * 1000);
    }

    // If it's a string and we have a year
    if (typeof dateValue === 'string' && year) {
      // Swedish month names mapping
      const months = {
        'januari': 0, 'februari': 1, 'mars': 2, 'april': 3,
        'maj': 4, 'juni': 5, 'juli': 6, 'augusti': 7,
        'september': 8, 'oktober': 9, 'november': 10, 'december': 11
      };

      // Clean up the string
      const cleanStr = dateValue.trim();

      // Try to parse Swedish date format like "15 januari" or just a number like "8"
      const datePattern = /^(\d{1,2})(?:\s+(\w+))?$/;
      const match = cleanStr.match(datePattern);

      if (match) {
        const day = parseInt(match[1]);
        const monthName = match[2] ? match[2].toLowerCase() : null;

        if (monthName && months[monthName] !== undefined) {
          // We have both day and month
          return new Date(year, months[monthName], day);
        } else if (!monthName && day >= 1 && day <= 31) {
          // Just a day number without month - can't parse without month
          return null;
        }
      }

      // Try standard date parsing as fallback
      const parsed = new Date(dateValue);
      if (!isNaN(parsed.getTime())) return parsed;
    }

    return null;
  };

  // Generate meetings based on program data
  const generateMeetings = (programList) => {
    const generatedMeetings = [];
    let meetingId = 1;
    const summerConferenceMeetings = new Map(); // Track shared summer conference meetings

    programList.forEach(program => {
      const programMeetings = meetingTypes[program.type] || [];

      programMeetings.forEach(meetingType => {
        // For Summer Conference and Kleindagarna Introduction and Check-in meetings, only create once
        if ((program.type === 'Summer Conference' || program.type === 'Kleindagarna') &&
            (meetingType.name.includes('Introduction Meeting') || meetingType.name.includes('Check-in Meeting') ||
             meetingType.name.includes('Check-in meeting'))) {

          const meetingKey = `${program.type}_${meetingType.name}_${meetingType.leadTime}`;

          if (!summerConferenceMeetings.has(meetingKey)) {
            // Calculate date based on earliest summer conference
            let meetingDate = calculateMeetingDate(
              program.startDate,
              program.endDate,
              meetingType.leadTime,
              meetingType.weekday,
              program.type
            );

            if (meetingDate) {
              summerConferenceMeetings.set(meetingKey, true);
              const groupName = program.type === 'Kleindagarna' ? 'Kleindagarna 2026' : 'All Summer Conferences';
              generatedMeetings.push({
                id: meetingId++,
                programId: program.type === 'Kleindagarna' ? 'kleindagarna-2026' : 'all-summer',
                programName: groupName,
                programType: program.type,
                programYear: program.startDate.getFullYear(),
                type: meetingType.name,
                date: meetingDate,
                time: meetingType.time || '14:00',
                duration: meetingType.duration,
                participants: meetingType.participants,
                description: meetingType.description,
                status: 'pending',
                approved: false
              });
            }
          }
          return; // Skip individual meeting creation
        }
        if (meetingType.recurring === 'weekly' && program.endDate && program.type === 'Summer Conference') {
          // Generate weekly recurring meetings ONLY for Summer Conferences
          // And limit to actual conference duration (typically 1 week)
          let currentDate = new Date(program.startDate);
          const maxWeeks = 2; // Maximum 2 weeks of weekly meetings
          let weekCount = 0;

          while (currentDate <= program.endDate && weekCount < maxWeeks) {
            if (currentDate.getDay() === meetingType.weekday) {
              generatedMeetings.push({
                id: meetingId++,
                programId: program.id,
                programName: program.name,
                programType: program.type,
                programYear: program.startDate.getFullYear(),
                type: meetingType.name,
                date: new Date(currentDate),
                time: meetingType.time || '09:00',
                duration: meetingType.duration,
                participants: meetingType.participants,
                description: meetingType.description,
                status: 'pending',
                approved: false
              });
              weekCount++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
          }
        } else if (!meetingType.recurring) {
          // Calculate meeting date
          let meetingDate = calculateMeetingDate(
            program.startDate,
            program.endDate,
            meetingType.leadTime,
            meetingType.weekday,
            program.type
          );

          if (meetingDate) {
            generatedMeetings.push({
              id: meetingId++,
              programId: program.id,
              programName: program.name,
              programType: program.type,
              programYear: program.startDate.getFullYear(),
              type: meetingType.name,
              date: meetingDate,
              time: meetingType.time || '14:00',
              duration: meetingType.duration,
              participants: meetingType.participants,
              description: meetingType.description,
              status: 'pending',
              approved: false
            });
          }
        }
      });
    });

    // Filter out past meetings and sort by date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const futureMeetings = generatedMeetings.filter(m => m.date >= today);
    futureMeetings.sort((a, b) => a.date - b.date);

    console.log(`Generated ${generatedMeetings.length} total meetings, kept ${futureMeetings.length} future meetings`);
    setMeetings(futureMeetings);
  };

  // Calculate meeting date based on lead time and constraints
  const calculateMeetingDate = (startDate, endDate, leadTime, weekday, programType) => {
    if (!startDate) return null;

    if (leadTime === 'end') {
      // Special handling for evaluation meetings
      if (programType === 'Spring Program' || programType === 'Fall Program') {
        const month = startDate.getMonth();
        if (month >= 0 && month <= 5) {
          // Spring program: April 20 or later
          const evalDate = new Date(startDate.getFullYear(), 3, 20); // April 20
          return evalDate > startDate ? evalDate : new Date(startDate.getTime() + (90 * 24 * 60 * 60 * 1000));
        } else {
          // Fall program: week before end
          return endDate ? new Date(endDate.getTime() - (7 * 24 * 60 * 60 * 1000)) : null;
        }
      }
    }

    // Calculate date relative to program start
    let targetDate = new Date(startDate.getTime());
    targetDate.setDate(targetDate.getDate() + leadTime);

    // Adjust to specific weekday if needed
    if (weekday !== undefined) {
      const currentDay = targetDate.getDay();
      if (currentDay !== weekday) {
        // Calculate days difference
        let daysToAdd = weekday - currentDay;

        // If we need to go backwards (e.g., from Sunday to Friday), go to previous week's target day
        if (daysToAdd > 3) {
          daysToAdd -= 7;
        }
        // If we need to go far forward, go to next week's target day
        else if (daysToAdd < -3) {
          daysToAdd += 7;
        }

        targetDate.setDate(targetDate.getDate() + daysToAdd);
      }
    }

    return targetDate;
  };

  // Format date for display
  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });
  };

  // Get badge color for program type
  const getTypeBadgeColor = (type) => {
    switch (type) {
      case 'Spring Program':
        return 'bg-green-100 text-green-800';
      case 'Fall Program':
        return 'bg-orange-100 text-orange-800';
      case 'Kleindagarna':
        return 'bg-blue-100 text-blue-800';
      case 'Summer Conference':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Toggle meeting approval
  const toggleApproval = (meetingId) => {
    setMeetings(meetings.map(m =>
      m.id === meetingId
        ? { ...m, approved: !m.approved, status: !m.approved ? 'approved' : 'pending' }
        : m
    ));
  };

  // Approve all meetings
  const approveAll = () => {
    setMeetings(meetings.map(m => ({
      ...m,
      approved: true,
      status: 'approved'
    })));
  };

  // Mark as scheduled
  const markScheduled = (meetingId) => {
    setMeetings(meetings.map(m =>
      m.id === meetingId
        ? { ...m, status: 'scheduled' }
        : m
    ));
  };

  // Toggle already scheduled status
  const toggleAlreadyScheduled = (meetingId) => {
    setMeetings(meetings.map(m =>
      m.id === meetingId
        ? {
            ...m,
            status: m.status === 'already-scheduled' ? 'pending' : 'already-scheduled',
            approved: m.status === 'already-scheduled' ? false : m.approved
          }
        : m
    ));
  };

  // Update meeting date
  const updateMeetingDate = (meetingId, newDate) => {
    setMeetings(meetings.map(m =>
      m.id === meetingId
        ? { ...m, date: new Date(newDate) }
        : m
    ));
  };

  // Update meeting time
  const updateMeetingTime = (meetingId, newTime) => {
    setMeetings(meetings.map(m =>
      m.id === meetingId
        ? { ...m, time: newTime }
        : m
    ));
  };

  // Format date for input field (YYYY-MM-DD)
  const formatDateForInput = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Export to Excel for Outlook import
  const exportToExcel = () => {
    const approvedMeetings = meetings.filter(m => m.approved || m.status === 'scheduled');

    if (approvedMeetings.length === 0) {
      alert('No approved meetings to export');
      return;
    }

    const exportData = approvedMeetings.map(m => ({
      'Subject': `${m.type} - ${m.programName}`,
      'Start Date': formatDate(m.date),
      'Start Time': m.time,
      'Duration (minutes)': m.duration,
      'Location': 'Institut Mittag-Leffler',
      'Description': m.description,
      'Required Attendees': m.participants.join('; '),
      'Categories': m.programName
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Meetings');

    XLSX.writeFile(wb, `IML_Meetings_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Edit meeting description
  const startEditing = (meeting) => {
    setEditingMeetingId(meeting.id);
    setEditedDescription(meeting.description || '');
  };

  const cancelEditing = () => {
    setEditingMeetingId(null);
    setEditedDescription('');
  };

  const saveDescription = (meetingId) => {
    setMeetings(meetings.map(m =>
      m.id === meetingId ? { ...m, description: editedDescription } : m
    ));
    setEditingMeetingId(null);
    setEditedDescription('');
  };

  // Share for review
  const shareForReview = async () => {
    if (meetings.length === 0) {
      alert('No meetings to share');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          createdBy: 'admin',
          meetings: meetings
        })
      });

      const data = await response.json();

      if (data.success) {
        const fullUrl = `${window.location.origin}/review/${data.reviewId}`;
        setReviewUrl(fullUrl);
        setShowShareModal(true);
      } else {
        alert('Failed to create review');
      }
    } catch (error) {
      console.error('Error sharing for review:', error);
      alert('Failed to share for review. Make sure the server is running.');
    }
  };

  const copyReviewUrl = () => {
    navigator.clipboard.writeText(reviewUrl);
    alert('Review URL copied to clipboard!');
  };

  // Export to ICS (iCalendar) format for Outlook
  const exportToICS = () => {
    const approvedMeetings = meetings.filter(m => m.approved || m.status === 'scheduled');

    if (approvedMeetings.length === 0) {
      alert('No approved meetings to export');
      return;
    }

    // Helper function to format date/time for ICS
    const formatICSDateTime = (date, time) => {
      const [hours, minutes] = time.split(':');
      const dt = new Date(date);
      dt.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      // Format as YYYYMMDDTHHMMSS
      const year = dt.getFullYear();
      const month = String(dt.getMonth() + 1).padStart(2, '0');
      const day = String(dt.getDate()).padStart(2, '0');
      const hour = String(dt.getHours()).padStart(2, '0');
      const minute = String(dt.getMinutes()).padStart(2, '0');

      return `${year}${month}${day}T${hour}${minute}00`;
    };

    // Helper function to calculate end time
    const calculateEndTime = (startDateTime, durationMinutes) => {
      const dt = new Date(startDateTime.slice(0, 4),
                         parseInt(startDateTime.slice(4, 6)) - 1,
                         startDateTime.slice(6, 8),
                         startDateTime.slice(9, 11),
                         startDateTime.slice(11, 13));
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
      'X-WR-CALNAME:IML Meetings',
      'X-WR-TIMEZONE:Europe/Stockholm'
    ];

    approvedMeetings.forEach((meeting, index) => {
      const startDateTime = formatICSDateTime(meeting.date, meeting.time);
      const endDateTime = calculateEndTime(startDateTime, meeting.duration);
      const timestamp = formatICSDateTime(new Date(), '12:00');

      icsContent.push('BEGIN:VEVENT');
      icsContent.push(`UID:iml-meeting-${meeting.id}-${Date.now()}@institutmittagleffler.se`);
      icsContent.push(`DTSTAMP:${timestamp}`);
      icsContent.push(`DTSTART:${startDateTime}`);
      icsContent.push(`DTEND:${endDateTime}`);
      icsContent.push(`SUMMARY:${meeting.type} - ${meeting.programName}`);
      icsContent.push(`DESCRIPTION:${meeting.description}\\n\\nParticipants: ${meeting.participants.join(', ')}`);
      icsContent.push(`LOCATION:Institut Mittag-Leffler`);
      icsContent.push(`CATEGORIES:${meeting.programType}`);
      icsContent.push(`STATUS:CONFIRMED`);
      icsContent.push('END:VEVENT');
    });

    icsContent.push('END:VCALENDAR');

    // Create and download the file
    const icsBlob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(icsBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `IML_Meetings_${new Date().toISOString().split('T')[0]}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Toggle filter
  const toggleFilter = (type) => {
    setFilters(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  // Filter meetings based on selected filters
  const filteredMeetings = meetings.filter(m => filters[m.programType]);

  // Statistics
  const stats = {
    total: filteredMeetings.length,
    approved: filteredMeetings.filter(m => m.approved).length,
    scheduled: filteredMeetings.filter(m => m.status === 'scheduled').length,
    pending: filteredMeetings.filter(m => m.status === 'pending' && !m.approved).length,
    alreadyScheduled: filteredMeetings.filter(m => m.status === 'already-scheduled').length
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-gray-800 mb-2">
                IML Meeting Booking Agent
              </h1>
              <p className="text-gray-600">
                Institut Mittag-Leffler Meeting Coordination System
              </p>
            </div>
            <Calendar className="w-16 h-16 text-indigo-600" />
          </div>

          {/* File Upload */}
          <div
            className={`border-2 border-dashed rounded-lg p-6 transition-colors ${
              isDragging
                ? 'border-indigo-500 bg-indigo-100'
                : 'border-indigo-300 bg-indigo-50'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center justify-center gap-4">
              <div className="flex items-center">
                <Upload className="w-6 h-6 text-indigo-600 mr-3" />
                <span className="text-indigo-700 font-semibold">
                  {selectedFile || 'Upload Program Schedule (Excel)'}
                </span>
              </div>
              <p className="text-sm text-indigo-600 mb-2">
                {isDragging ? 'Drop file here...' : 'Drag and drop your Excel file here'}
              </p>
              <div className="w-full">
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-semibold text-center transition">
                    Click to Browse Files
                  </div>
                </label>
                <input
                  id="file-upload"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    console.log('File input onChange triggered', e.target.files);
                    handleFileUpload(e);
                  }}
                  className="hidden"
                />
              </div>
            </div>
          </div>
        </div>

        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading programs and generating meetings...</p>
          </div>
        )}

        {!loading && programs.length > 0 && (
          <>
            {/* Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-sm">Total Meetings</p>
                    <p className="text-3xl font-bold text-gray-800">{stats.total}</p>
                  </div>
                  <Calendar className="w-12 h-12 text-blue-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-sm">Approved</p>
                    <p className="text-3xl font-bold text-green-600">{stats.approved}</p>
                  </div>
                  <CheckCircle className="w-12 h-12 text-green-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-sm">Scheduled</p>
                    <p className="text-3xl font-bold text-indigo-600">{stats.scheduled}</p>
                  </div>
                  <Clock className="w-12 h-12 text-indigo-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-sm">Already Scheduled</p>
                    <p className="text-3xl font-bold text-gray-600">{stats.alreadyScheduled}</p>
                  </div>
                  <CheckCircle className="w-12 h-12 text-gray-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-sm">Pending</p>
                    <p className="text-3xl font-bold text-orange-600">{stats.pending}</p>
                  </div>
                  <XCircle className="w-12 h-12 text-orange-500" />
                </div>
              </div>
            </div>

            {/* Programs Overview */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Active Programs</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {programs.map(program => (
                  <div key={program.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-800 flex-1">{program.name}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ml-2 ${getTypeBadgeColor(program.type)}`}>
                        {program.type}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-1">
                      <span className="font-medium">Start:</span> {formatDate(program.startDate)}
                    </p>
                    <p className="text-sm text-gray-600 mb-1">
                      <span className="font-medium">Slut:</span> {formatDate(program.endDate)}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Organizer:</span> {program.organizer}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Filter by Program Type</h2>
              <div className="flex flex-wrap gap-4">
                {Object.keys(filters).map(type => (
                  <label key={type} className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters[type]}
                      onChange={() => toggleFilter(type)}
                      className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className={`ml-2 px-3 py-1 rounded-full text-sm font-semibold ${getTypeBadgeColor(type)}`}>
                      {type}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mb-8 flex justify-end gap-4 flex-wrap">
              <button
                onClick={shareForReview}
                className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition"
              >
                <Share2 className="w-5 h-5" />
                Share for Director Review
              </button>
              <button
                onClick={approveAll}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition"
              >
                <CheckCircle className="w-5 h-5" />
                Approve All
              </button>
              <button
                onClick={exportToICS}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition"
              >
                <CalendarDays className="w-5 h-5" />
                Export to Outlook (.ics)
              </button>
              <button
                onClick={exportToExcel}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition"
              >
                <Download className="w-5 h-5" />
                Export to Excel
              </button>
            </div>

            {/* Share Modal */}
            {showShareModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full mx-4">
                  <h2 className="text-2xl font-bold text-gray-800 mb-4">Review Link Created!</h2>
                  <p className="text-gray-600 mb-4">
                    Share this link with Directors to review and approve the meetings:
                  </p>
                  <div className="bg-gray-100 p-4 rounded-lg mb-4 flex items-center justify-between">
                    <code className="text-sm text-gray-800 break-all flex-1">{reviewUrl}</code>
                    <button
                      onClick={copyReviewUrl}
                      className="ml-4 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition flex-shrink-0"
                    >
                      <Copy className="w-4 h-4" />
                      Copy
                    </button>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg mb-4">
                    <p className="text-sm text-blue-800">
                      <strong>How it works:</strong>
                    </p>
                    <ul className="text-sm text-blue-700 mt-2 list-disc list-inside">
                      <li>Directors will see all meetings and can approve/reject them</li>
                      <li>They can see each other's decisions in real-time</li>
                      <li>Some meetings require 1 director, others require 2</li>
                      <li>You'll see their decisions reflected here</li>
                    </ul>
                  </div>
                  <button
                    onClick={() => setShowShareModal(false)}
                    className="w-full bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-semibold transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* Meetings Timeline */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Meeting Timeline</h2>

              {filteredMeetings.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>No meetings match the selected filters</p>
                </div>
              )}

              <div className="space-y-4">
                {filteredMeetings.map(meeting => (
                  <div
                    key={meeting.id}
                    className={`border-l-4 p-4 rounded-r-lg transition ${
                      meeting.status === 'already-scheduled'
                        ? 'border-gray-400 bg-gray-100 opacity-75'
                        : meeting.status === 'scheduled'
                        ? 'border-indigo-600 bg-indigo-50'
                        : meeting.approved
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-300 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <h3 className="text-lg font-semibold text-gray-800">
                            {meeting.type}
                          </h3>
                          <span className="text-sm text-gray-600 bg-white px-3 py-1 rounded-full">
                            {meeting.programName}
                          </span>
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${getTypeBadgeColor(meeting.programType)}`}>
                            {meeting.programType}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                          <div className="flex items-center text-gray-700">
                            <Calendar className="w-4 h-4 mr-2 flex-shrink-0" />
                            {editingMeeting === meeting.id ? (
                              <input
                                type="date"
                                value={formatDateForInput(meeting.date)}
                                onChange={(e) => updateMeetingDate(meeting.id, e.target.value)}
                                className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{formatDate(meeting.date)}</span>
                                <button
                                  onClick={() => setEditingMeeting(meeting.id)}
                                  className="text-indigo-600 hover:text-indigo-800"
                                  title="Edit date/time"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center text-gray-700">
                            <Clock className="w-4 h-4 mr-2 flex-shrink-0" />
                            {editingMeeting === meeting.id ? (
                              <input
                                type="time"
                                value={meeting.time}
                                onChange={(e) => updateMeetingTime(meeting.id, e.target.value)}
                                className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            ) : (
                              <span className="text-sm">{meeting.time} ({meeting.duration} min)</span>
                            )}
                          </div>
                          <div className="flex items-center text-gray-700">
                            <Users className="w-4 h-4 mr-2" />
                            <span className="text-sm">{meeting.participants.length} participants</span>
                          </div>
                        </div>

                        {editingMeeting === meeting.id && (
                          <div className="mb-3">
                            <button
                              onClick={() => setEditingMeeting(null)}
                              className="text-sm bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 transition"
                            >
                              Done Editing
                            </button>
                          </div>
                        )}

                        {/* Description with Edit capability */}
                        <div className="mb-2">
                          {editingMeetingId === meeting.id ? (
                            <div className="flex gap-2 items-start">
                              <textarea
                                value={editedDescription}
                                onChange={(e) => setEditedDescription(e.target.value)}
                                className="flex-1 px-3 py-2 border border-indigo-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                rows="3"
                              />
                              <button
                                onClick={() => saveDescription(meeting.id)}
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

                        <div className="text-xs text-gray-500">
                          <strong>Participants:</strong> {meeting.participants.join(', ')}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 ml-4">
                        {meeting.status === 'already-scheduled' ? (
                          <>
                            <div className="px-4 py-2 rounded-lg font-medium bg-gray-400 text-white text-center">
                              Already Scheduled
                            </div>
                            <button
                              onClick={() => toggleAlreadyScheduled(meeting.id)}
                              className="px-4 py-2 rounded-lg font-medium bg-orange-500 text-white hover:bg-orange-600 transition text-sm"
                            >
                              Undo
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => toggleApproval(meeting.id)}
                              className={`px-4 py-2 rounded-lg font-medium transition ${
                                meeting.approved
                                  ? 'bg-green-600 text-white hover:bg-green-700'
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              }`}
                            >
                              {meeting.approved ? 'Approved' : 'Approve'}
                            </button>

                            {meeting.approved && meeting.status !== 'scheduled' && (
                              <button
                                onClick={() => markScheduled(meeting.id)}
                                className="px-4 py-2 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition"
                              >
                                Mark Scheduled
                              </button>
                            )}

                            <button
                              onClick={() => toggleAlreadyScheduled(meeting.id)}
                              className="px-4 py-2 rounded-lg font-medium bg-gray-500 text-white hover:bg-gray-600 transition text-sm"
                            >
                              Already Scheduled
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {!loading && programs.length === 0 && (
          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <FileSpreadsheet className="w-20 h-20 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              No Programs Loaded
            </h3>
            <p className="text-gray-600">
              Upload an Excel file with program data to get started
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MeetingAgent;
