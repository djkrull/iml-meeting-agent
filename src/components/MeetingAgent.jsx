import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Clock, Users, Download, CheckCircle, XCircle, FileSpreadsheet, Upload, CalendarDays, CalendarCheck, Edit2, Share2, Copy, Save, X, RefreshCw, Trash2, ChevronDown, Settings } from 'lucide-react';
import * as XLSX from 'xlsx';
import { IdentityPicker, IdentityChip, readStoredIdentityId, storeIdentityId, clearStoredIdentity } from './IdentityGate';
import SettingsPanel from './Settings';
import { resolveMeetingDate } from '../utils/meetingRuleEngine';
import { createIsClosed } from '../utils/swedishHolidays';

const ADMIN_IDENTITY_KEY = 'iml-admin-identity';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

const MeetingAgent = () => {
  // State management
  const [programs, setPrograms] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [editingMeetingId, setEditingMeetingId] = useState(null);
  const [editedDescription, setEditedDescription] = useState('');
  const [filters, setFilters] = useState({
    'Spring Program': true,
    'Fall Program': true,
    'Kleindagarna': true,
    'Summer Conference': true
  });
  const [programFilter, setProgramFilter] = useState('all'); // 'all' or specific programName
  const [yearFilter, setYearFilter] = useState('all'); // 'all' or specific year (e.g. '2027')
  const [programDropdownOpen, setProgramDropdownOpen] = useState(false);
  const programDropdownRef = useRef(null);

  // Admin identity (who is using the dashboard) — names come from app_settings.
  const [adminList, setAdminList] = useState([]);
  const [adminIdentity, setAdminIdentity] = useState(null);
  const [identityConfigState, setIdentityConfigState] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [showSettings, setShowSettings] = useState(false);
  const [appConfig, setAppConfig] = useState(null); // full app_settings config (meeting rules, rosters, ...)
  const [regenPreview, setRegenPreview] = useState(null); // { regenerated, changes, weeklyOld, weeklyNew, oldCount, newCount }

  // Load the admin roster from settings, then resolve any remembered identity.
  const loadAdminRoster = React.useCallback(async () => {
    setIdentityConfigState('loading');
    try {
      const res = await fetch(`${API_URL}/api/settings`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAppConfig(data.config || null);
      const admins = (data.config?.admins || []).filter(a => a.active !== false);
      setAdminList(admins);
      const storedId = readStoredIdentityId(ADMIN_IDENTITY_KEY);
      const remembered = storedId ? admins.find(a => a.id === storedId) : null;
      if (remembered) setAdminIdentity(remembered);
      setIdentityConfigState('ready');
    } catch (err) {
      console.error('Failed to load admin roster:', err);
      setIdentityConfigState('error');
    }
  }, []);

  useEffect(() => { loadAdminRoster(); }, [loadAdminRoster]);

  const pickAdminIdentity = (person, remember) => {
    if (remember) storeIdentityId(ADMIN_IDENTITY_KEY, person.id);
    else clearStoredIdentity(ADMIN_IDENTITY_KEY);
    setAdminIdentity(person);
  };

  const switchAdminIdentity = () => {
    clearStoredIdentity(ADMIN_IDENTITY_KEY);
    setAdminIdentity(null);
  };

  // Close program-dropdown on outside click
  useEffect(() => {
    if (!programDropdownOpen) return;
    const handler = (e) => {
      if (programDropdownRef.current && !programDropdownRef.current.contains(e.target)) {
        setProgramDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [programDropdownOpen]);
  const [editingMeeting, setEditingMeeting] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [reviewUrl, setReviewUrl] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [reviewDirectors, setReviewDirectors] = useState([]);
  const [currentReviewId, setCurrentReviewId] = useState(() => {
    return localStorage.getItem('iml-current-review-id') || null;
  });
  // True while a save to the backend is in-flight, so the focus re-sync never
  // overwrites local state mid-save (which could drop a just-made edit).
  const savingRef = useRef(false);

  // Load programs and meetings from backend on component mount
  useEffect(() => {
    const loadFromBackend = async () => {
      if (initialLoadComplete) return;

      setLoading(true);
      try {
        console.log('Loading programs and meetings from backend...');
        const response = await fetch(`${API_URL}/api/programs`);

        if (response.ok) {
          const data = await response.json();
          console.log('Loaded from backend:', data);

          if (data.programs && data.programs.length > 0) {
            // Parse dates back to Date objects
            const programsWithDates = data.programs.map(p => ({
              ...p,
              startDate: new Date(p.startDate),
              endDate: p.endDate ? new Date(p.endDate) : null
            }));

            const meetingsWithDates = data.meetings.map(m => ({
              ...m,
              date: new Date(m.date)
            }));

            setPrograms(programsWithDates);
            setMeetings(meetingsWithDates);
            console.log(`Loaded ${programsWithDates.length} programs and ${meetingsWithDates.length} meetings`);
          } else {
            console.log('No programs found in backend');
          }
        } else {
          console.log('Backend returned error:', response.status);
        }
      } catch (error) {
        console.error('Error loading from backend:', error);
        console.log('Backend may not be running yet');
      } finally {
        setLoading(false);
        setInitialLoadComplete(true);
      }
    };

    loadFromBackend();
  }, [initialLoadComplete]); // Only run on mount

  // If this browser has no locally-remembered review id, fall back to the
  // server's "active review" pointer. Without this, the admin view only shows
  // director approvals on the ONE device where "Share for Director Review" was
  // clicked (the id lived solely in that browser's localStorage). Now any admin
  // device converges on the same review. Persisting it locally also means a later
  // "Share" from this device updates the same review instead of forking a new one.
  // Runs once on mount; if localStorage already has an id, we keep that override.
  useEffect(() => {
    if (currentReviewId) return; // already known locally — nothing to do
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/reviews/active`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.activeReviewId) {
          setCurrentReviewId(data.activeReviewId);
          localStorage.setItem('iml-current-review-id', data.activeReviewId);
          console.log('[ACTIVE-REVIEW] Adopted server active review:', data.activeReviewId);
        }
      } catch (error) {
        console.error('[ACTIVE-REVIEW] Failed to load active review id from server:', error);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh director approvals on page load and every 30 seconds
  useEffect(() => {
    const autoLoadApprovals = async () => {
      if (!initialLoadComplete || !currentReviewId || meetings.length === 0) return;

      console.log('[AUTO-REFRESH] Loading director approvals from review:', currentReviewId);

      try {
        const response = await fetch(`${API_URL}/api/reviews/${currentReviewId}`);
        if (!response.ok) {
          console.log('[AUTO-REFRESH] Failed to fetch review:', response.status);
          return;
        }

        const review = await response.json();
        if (!review.meetings) return;

        // Merge approval data with existing meetings.
        // IMPORTANT: only produce new array/object references when approval data
        // actually changed. Returning the same references when nothing changed keeps
        // React from re-rendering, which in turn keeps the auto-save effect from
        // firing. Otherwise this read-only 30s refresh would re-write this tab's
        // (possibly stale) meeting times back over the DB every 30s and clobber
        // out-of-band edits (e.g. ones made directly by an agent). [root cause of
        // the "my time change keeps reverting to the old value" bug]
        setMeetings(currentMeetings => {
          let changed = false;
          const next = currentMeetings.map(meeting => {
            const dbMeeting = review.meetings.find(m => {
              // Must match program name and type
              if (m.program_name !== meeting.programName || m.type !== meeting.type) return false;

              // For "All Summer Conferences", also match by year
              if (meeting.programName === 'All Summer Conferences') {
                const dbYear = new Date(m.date).getFullYear();
                const meetingYear = meeting.date.getFullYear();
                return dbYear === meetingYear;
              }

              // For other programs, match works fine (unique per year typically)
              return true;
            });

            if (!dbMeeting) return meeting;

            // Only director responses gate approval; admin responses are attendance.
            const approvedCount = dbMeeting.approvals?.filter(a =>
              (a.status === 'approved' || a.status === 'accepted') && a.role !== 'admin'
            ).length || 0;

            const rejectedCount = dbMeeting.approvals?.filter(a =>
              (a.status === 'rejected' || a.status === 'declined') && a.role !== 'admin'
            ).length || 0;

            const approved = approvedCount > 0 && rejectedCount === 0;
            // Director responses gate the approval badge/counts; admin responses are
            // attendance only. Keep them in separate fields so admin rows never
            // inflate the director badge, but are still shown in their own section.
            const allApprovals = dbMeeting.approvals || [];
            const approvals = allApprovals.filter(a => a.role !== 'admin');
            const adminApprovals = allApprovals.filter(a => a.role === 'admin');

            // No approval-relevant change → keep the same object reference.
            // (reviewMeetingId is included so the per-review row id always
            // propagates — the inline admin-attendance control needs it.)
            if (
              meeting.approvedCount === approvedCount &&
              meeting.rejectedCount === rejectedCount &&
              meeting.approved === approved &&
              (meeting.approvals?.length || 0) === approvals.length &&
              (meeting.adminApprovals?.length || 0) === adminApprovals.length &&
              meeting.reviewMeetingId === dbMeeting.id
            ) {
              return meeting;
            }

            changed = true;
            return { ...meeting, approvedCount, rejectedCount, approvals, adminApprovals, approved, reviewMeetingId: dbMeeting.id };
          });

          // Nothing changed → return the SAME array so no re-render / no auto-save.
          return changed ? next : currentMeetings;
        });

        console.log('[AUTO-REFRESH] Director approvals loaded successfully');
      } catch (error) {
        console.error('[AUTO-REFRESH] Error loading approvals:', error);
      }
    };

    // Load immediately on mount
    autoLoadApprovals();

    // Set up interval to refresh every 30 seconds
    const intervalId = setInterval(autoLoadApprovals, 30000);

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, [initialLoadComplete, currentReviewId, meetings.length]);

  // Re-sync meeting scheduling fields (date/time/duration) from the server when the
  // tab regains focus or becomes visible. This makes out-of-band edits (e.g. ones
  // made directly in the DB by an agent) appear here without a manual reload, and
  // ensures this tab never holds — and therefore can never auto-save — a stale time
  // over a newer server value. Approval fields are left untouched (the 30s refresh
  // above owns those). Skipped while a save is in-flight so it can't drop a fresh
  // local edit.
  useEffect(() => {
    if (!initialLoadComplete) return;

    const resyncScheduleFromServer = async () => {
      if (savingRef.current) return; // don't fight an in-flight save
      try {
        const response = await fetch(`${API_URL}/api/programs`);
        if (!response.ok) return;
        const data = await response.json();
        if (!data.meetings) return;

        setMeetings(currentMeetings => {
          let changed = false;
          const next = currentMeetings.map(meeting => {
            const fresh = data.meetings.find(m => {
              if (m.programName !== meeting.programName || m.type !== meeting.type) return false;
              if (meeting.programName === 'All Summer Conferences') {
                const mYear = (meeting.date instanceof Date ? meeting.date : new Date(meeting.date)).getFullYear();
                return new Date(m.date).getFullYear() === mYear;
              }
              return true;
            });
            if (!fresh) return meeting;

            const freshMs = new Date(fresh.date).getTime();
            const curMs = (meeting.date instanceof Date ? meeting.date : new Date(meeting.date)).getTime();
            if (meeting.time === fresh.time && meeting.duration === fresh.duration && curMs === freshMs) {
              return meeting; // already up to date
            }

            changed = true;
            return { ...meeting, time: fresh.time, duration: fresh.duration, date: new Date(fresh.date) };
          });

          return changed ? next : currentMeetings;
        });
      } catch (e) {
        // network hiccup — ignore, will retry on next focus
      }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') resyncScheduleFromServer(); };
    window.addEventListener('focus', resyncScheduleFromServer);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', resyncScheduleFromServer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [initialLoadComplete]);

  // Save programs and meetings to backend whenever they change
  useEffect(() => {
    const saveToBackend = async () => {
      if (!initialLoadComplete) return; // Don't save during initial load
      if (programs.length === 0 && meetings.length === 0) return;

      savingRef.current = true;
      try {
        console.log('Saving to backend...');
        const response = await fetch(`${API_URL}/api/programs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            programs,
            meetings
          })
        });

        if (response.ok) {
          const data = await response.json();
          console.log('Saved to backend:', data);
        } else {
          const errorBody = await response.text();
          console.error('Failed to save to backend:', response.status, errorBody);
          alert(`⚠️ FAILED TO SAVE TO DATABASE (HTTP ${response.status})\n\nYour changes are only in the browser. Details:\n${errorBody.slice(0, 300)}`);
        }
      } catch (error) {
        console.error('Error saving to backend:', error);
        alert(`⚠️ NETWORK ERROR saving to database\n\nYour changes are only in the browser. Error: ${error.message}`);
        localStorage.setItem('iml-programs', JSON.stringify(programs));
        localStorage.setItem('iml-meetings', JSON.stringify(meetings));
      } finally {
        savingRef.current = false;
      }
    };

    saveToBackend();
  }, [programs, meetings, initialLoadComplete]);

  // Debug: Component loaded
  console.log('MeetingAgent component loaded');

  // Meeting rules are configured in Settings (app_settings). Seed: server/defaultSettings.js;
  // date resolution: src/utils/meetingRuleEngine (resolveMeetingDate).

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

        // Check if this is a short program (< 30 days) — then it's a Summer Conference
        const durationDays = startDate && endDate
          ? Math.round((endDate - startDate) / (1000 * 60 * 60 * 24))
          : 999;
        const isShortProgram = durationDays < 30;

        if (row['Program']?.toLowerCase().includes('klein')) {
          type = 'Kleindagarna';
        } else if (row['Program']?.toLowerCase().includes('summer school') ||
                   dateStr?.includes('juni') || dateStr?.includes('juli') ||
                   (isShortProgram && startDate && startDate.getMonth() >= 4 && startDate.getMonth() <= 7)) {
          // Short programs in May-August are Summer Conferences regardless of month
          type = 'Summer Conference';
        } else if (startDate) {
          // Long (multi-month) programs: Spring or Fall based on start month
          const startMonth = startDate.getMonth();
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
      const excludedPrograms = ['styrelsemöte', 'prefektmöte', 'board meeting', 'acta editorial', 'minneshögtid'];
      const filteredPrograms = parsedPrograms.filter(p => {
        // Exclude board meetings and similar
        if (p.name && excludedPrograms.some(excluded => p.name.toLowerCase().includes(excluded))) {
          console.log(`Excluding non-program event: ${p.name}`);
          return false;
        }
        // Exclude placeholder entries (only based on name, not organizer — real conferences
        // may have TBD organizer before they're fully confirmed)
        if (p.name === 'Title' || p.name === 'TBD' || p.name === 'Unnamed Program') {
          console.log(`Excluding placeholder program: ${p.name}`);
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

      // Business rule: max 1 Spring Program + 1 Fall Program per year
      // If multiple found, keep the longest (real multi-month program) and reclassify extras as Summer Conference
      const reclassified = [...filteredPrograms];
      ['Spring Program', 'Fall Program'].forEach(mainType => {
        const byYear = {};
        reclassified.forEach((p, idx) => {
          if (p.type !== mainType || !p.year) return;
          if (!byYear[p.year]) byYear[p.year] = [];
          byYear[p.year].push({ p, idx });
        });
        Object.keys(byYear).forEach(year => {
          const entries = byYear[year];
          if (entries.length > 1) {
            // Keep the longest one, reclassify others
            entries.sort((a, b) => {
              const durA = a.p.endDate ? (a.p.endDate - a.p.startDate) : 0;
              const durB = b.p.endDate ? (b.p.endDate - b.p.startDate) : 0;
              return durB - durA;
            });
            entries.slice(1).forEach(({ p, idx }) => {
              console.log(`Reclassifying "${p.name}" from ${mainType} ${year} to Summer Conference (only 1 ${mainType} per year allowed)`);
              reclassified[idx] = { ...p, type: 'Summer Conference' };
            });
          }
        });
      });

      console.log('Filtered programs:', reclassified);
      console.log(`Kept ${reclassified.length} current/future programs (filtered out ${parsedPrograms.length - reclassified.length})`);
      setPrograms(reclassified);
      const generated = generateMeetings(reclassified);
      if (generated) setMeetings(generated);
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
    if (!appConfig?.meetingRules) {
      alert('Inställningarna (mötesreglerna) är inte laddade ännu. Ladda om sidan och försök igen.');
      return;
    }
    const generatedMeetings = [];
    let meetingId = 1;
    const summerConferenceMeetings = new Map(); // Track shared summer conference meetings
    // Skip Swedish red days + admin-maintained IML-closed days when placing meetings.
    const isClosed = createIsClosed(appConfig.imlClosedDays || []);

    // Build lookup of previous year's times (cyclical by program TYPE + meeting TYPE)
    // Key: "{programType}|{meetingTypeName}|{year}" -> time
    const previousYearTimes = new Map();
    meetings.forEach(m => {
      const year = m.date instanceof Date ? m.date.getFullYear() : new Date(m.date).getFullYear();
      const key = `${m.programType}|${m.type}|${year}`;
      previousYearTimes.set(key, m.time);
    });

    // Look up time from any previous year (falls back to default)
    const getInheritedTime = (programType, meetingTypeName, currentYear, defaultTime) => {
      for (let y = currentYear - 1; y >= currentYear - 5; y--) {
        const key = `${programType}|${meetingTypeName}|${y}`;
        if (previousYearTimes.has(key)) {
          return previousYearTimes.get(key);
        }
      }
      return defaultTime;
    };

    // Meeting rules come from app_settings (config). resolveMeetingDate applies the
    // year-gated offset override (e.g. Introduction Meeting FP28+/SP29+) internally,
    // so no year branching is needed here.
    const getMeetingTypes = (program) => {
      const rules = appConfig?.meetingRules?.[program.type];
      return Array.isArray(rules) ? rules : [];
    };

    programList.forEach(program => {
      const programMeetings = getMeetingTypes(program);

      programMeetings.forEach(meetingType => {
        // For Summer Conference and Kleindagarna Introduction and Check-in meetings, only create once
        if ((program.type === 'Summer Conference' || program.type === 'Kleindagarna') &&
            (meetingType.name.includes('Introduction Meeting') || meetingType.name.includes('Check-in Meeting') ||
             meetingType.name.includes('Check-in meeting'))) {

          // Use year-based key for Summer Conferences (same meeting across all conferences)
          // Use program-specific key for Kleindagarna (year-specific)
          const meetingKey = program.type === 'Summer Conference'
            ? `${program.type}_year${program.startDate.getFullYear()}_${meetingType.name}`
            : `${program.type}_${program.id || program.startDate.toISOString()}_${meetingType.id || meetingType.name}`;

          if (!summerConferenceMeetings.has(meetingKey)) {
            // Resolve date from the configured rule (anchor + offset + placement),
            // skipping Swedish red days / IML-closed days.
            let meetingDate = resolveMeetingDate(
              meetingType,
              program.startDate,
              program.endDate,
              program.startDate.getFullYear(),
              { isClosed }
            );

            if (meetingDate) {
              summerConferenceMeetings.set(meetingKey, true);

              let organizers = program.organizer;

              // For Summer Conferences, collect all organizers from the same year
              if (program.type === 'Summer Conference') {
                const currentYear = program.startDate.getFullYear();
                const allOrganizersList = programList
                  .filter(p => p.type === 'Summer Conference' && p.startDate.getFullYear() === currentYear)
                  .map(p => p.organizer)
                  .filter((org, idx, self) => self.indexOf(org) === idx); // Unique
                organizers = allOrganizersList.join(' / ');
              }

              const groupName = program.type === 'Kleindagarna' ? 'Kleindagarna 2026' : 'All Summer Conferences';
              const inheritedTime = getInheritedTime(
                program.type,
                meetingType.name,
                program.startDate.getFullYear(),
                meetingType.time || '14:00'
              );
              generatedMeetings.push({
                id: meetingId++,
                programId: program.type === 'Kleindagarna' ? 'kleindagarna-2026' : 'all-summer',
                programName: groupName,
                programType: program.type,
                programYear: program.startDate.getFullYear(),
                programOrganizer: organizers,
                type: meetingType.name,
                date: meetingDate,
                time: inheritedTime,
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
        if (meetingType.recurring === 'weekly' && program.endDate) {
          // Generate weekly recurring meetings for all program types
          let currentDate = new Date(program.startDate);
          const maxWeeks = program.type === 'Summer Conference' ? 2 : 52; // Limit summer to 2 weeks, others up to 1 year

          let weekCount = 0;
          while (currentDate <= program.endDate && weekCount < maxWeeks) {
            if (currentDate.getDay() === meetingType.placement.weekday && !isClosed(currentDate)) {
              const inheritedTime = getInheritedTime(
                program.type,
                meetingType.name,
                program.startDate.getFullYear(),
                meetingType.time || '09:00'
              );
              generatedMeetings.push({
                id: meetingId++,
                programId: program.id,
                programName: program.name,
                programType: program.type,
                programYear: program.startDate.getFullYear(),
                programOrganizer: program.organizer,
                type: meetingType.name,
                date: new Date(currentDate),
                time: inheritedTime,
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
          // Resolve meeting date from the configured rule (skip red/closed days).
          let meetingDate = resolveMeetingDate(
            meetingType,
            program.startDate,
            program.endDate,
            program.startDate.getFullYear(),
            { isClosed }
          );

          if (meetingDate) {
            const inheritedTime = getInheritedTime(
              program.type,
              meetingType.name,
              program.startDate.getFullYear(),
              meetingType.time || '14:00'
            );
            generatedMeetings.push({
              id: meetingId++,
              programId: program.id,
              programName: program.name,
              programType: program.type,
              programYear: program.startDate.getFullYear(),
              programOrganizer: program.organizer,
              type: meetingType.name,
              date: meetingDate,
              time: inheritedTime,
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

    // Filter out past meetings and sort by date and time
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const futureMeetings = generatedMeetings.filter(m => m.date >= today);
    futureMeetings.sort((a, b) => {
      // First compare dates
      const dateDiff = a.date - b.date;
      if (dateDiff !== 0) return dateDiff;

      // If same date, compare times
      return a.time.localeCompare(b.time);
    });

    console.log(`Generated ${generatedMeetings.length} total meetings, kept ${futureMeetings.length} future meetings`);
    return futureMeetings;
  };

  // (old calculateMeetingDate removed — replaced by src/utils/meetingRuleEngine.resolveMeetingDate)

  // Regenerate meetings from the current programs + current config rules, and show
  // a diff for confirmation before applying ("only forward" — nothing is written
  // until the admin confirms). Times are inherited from existing meetings, so a
  // rule change mostly surfaces as date shifts.
  const regenerateMeetings = () => {
    if (!programs || programs.length === 0) { alert('Inga program att regenerera från.'); return; }
    const regenerated = generateMeetings(programs);
    if (!regenerated) return; // guard already alerted (config not loaded)

    const ymd = (d) => {
      const x = d instanceof Date ? d : new Date(d);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isFuture = (m) => (m.date instanceof Date ? m.date : new Date(m.date)) >= today;
    const isWeekly = (m) => (m.type || '').includes('Weekly');
    const keyOf = (m) => `${m.programName}|${m.type}|${m.programYear ?? new Date(m.date).getFullYear()}`;

    // Only future meetings are regenerated; past meetings are preserved untouched.
    const pastMeetings = meetings.filter(m => !isFuture(m));
    const curFut = meetings.filter(isFuture);
    const curNW = curFut.filter(m => !isWeekly(m));
    const newNW = regenerated.filter(m => !isWeekly(m));
    const curMap = new Map(curNW.map(m => [keyOf(m), m]));
    const seen = new Set();
    const changes = [];
    newNW.forEach(nm => {
      const k = keyOf(nm); seen.add(k);
      const cm = curMap.get(k);
      if (!cm) changes.push({ kind: 'added', label: `${nm.type} — ${nm.programName}`, newD: ymd(nm.date), newT: nm.time });
      else {
        const dCh = ymd(cm.date) !== ymd(nm.date);
        const tCh = cm.time !== nm.time;
        if (dCh || tCh) changes.push({ kind: 'changed', label: `${nm.type} — ${nm.programName}`, oldD: ymd(cm.date), oldT: cm.time, newD: ymd(nm.date), newT: nm.time });
      }
    });
    curNW.forEach(cm => { if (!seen.has(keyOf(cm))) changes.push({ kind: 'removed', label: `${cm.type} — ${cm.programName}`, oldD: ymd(cm.date), oldT: cm.time }); });

    // Weekly meetings: surface a summary if their dates/times differ, so the
    // confirmation never hides a weekday/time change (codex P2).
    const weeklyKey = (m) => `${m.programName}|${m.type}|${ymd(m.date)}|${m.time}`;
    const curW = new Set(curFut.filter(isWeekly).map(weeklyKey));
    const newWkeys = regenerated.filter(isWeekly).map(weeklyKey);
    let weeklyChanged = curW.size !== newWkeys.length;
    if (!weeklyChanged) { for (const k of newWkeys) { if (!curW.has(k)) { weeklyChanged = true; break; } } }
    const weeklyOld = curFut.length - curNW.length;
    const weeklyNew = regenerated.length - newNW.length;
    if (weeklyChanged) {
      changes.push({ kind: 'weekly', label: 'Veckomöten (Welcome / Onboarding light)', oldT: `${weeklyOld} st`, newT: `${weeklyNew} st — datum/tid uppdateras` });
    }

    setRegenPreview({
      finalMeetings: [...pastMeetings, ...regenerated],
      futureMeetings: regenerated,
      changes, weeklyOld, weeklyNew,
      oldCount: curFut.length, newCount: regenerated.length,
      pastCount: pastMeetings.length,
    });
  };

  // Persist via the dedicated replace endpoint (deletes stale future rows so
  // date-shifted meetings don't duplicate), then update local state.
  const applyRegen = async () => {
    if (!regenPreview) return;
    try {
      const res = await fetch(`${API_URL}/api/programs/replace-meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetings: regenPreview.futureMeetings })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMeetings(regenPreview.finalMeetings);
      setRegenPreview(null);
    } catch (e) {
      console.error('Failed to apply regeneration:', e);
      alert('Kunde inte spara regenererade möten: ' + e.message);
    }
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

  // Sync meeting to review if active review exists
  const syncMeetingToReview = async (meetingId, updates) => {
    if (!currentReviewId) return;

    try {
      // Find the meeting to get its programName and type
      const meeting = meetings.find(m => m.id === meetingId);
      if (!meeting) {
        console.warn(`Meeting ${meetingId} not found for sync`);
        return;
      }

      await fetch(`${API_URL}/api/reviews/${currentReviewId}/sync-meeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programName: meeting.programName,
          meetingType: meeting.type,
          ...updates
        })
      });
      console.log(`Synced meeting: ${meeting.type} - ${meeting.programName}`);
    } catch (error) {
      console.error('Error syncing meeting to review:', error);
      // Don't block the UI update if sync fails
    }
  };

  // Update meeting date
  const updateMeetingDate = async (meetingId, newDate) => {
    const dateObj = new Date(newDate);
    setMeetings(meetings.map(m =>
      m.id === meetingId
        ? { ...m, date: dateObj }
        : m
    ));

    // Sync to review if exists
    await syncMeetingToReview(meetingId, { date: dateObj.toISOString() });
  };

  // Update meeting time
  const updateMeetingTime = async (meetingId, newTime) => {
    setMeetings(meetings.map(m =>
      m.id === meetingId
        ? { ...m, time: newTime }
        : m
    ));

    // Sync to review if exists
    await syncMeetingToReview(meetingId, { time: newTime });
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
      // Check if we already have a review ID (update existing instead of creating new)
      const existingReviewId = currentReviewId || localStorage.getItem('iml-current-review-id');

      let response;
      let isUpdate = false;

      if (existingReviewId) {
        // Update existing review
        console.log(`[SHARE] Updating existing review: ${existingReviewId}`);
        response = await fetch(`${API_URL}/api/reviews/${existingReviewId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetings: meetings
          })
        });
        isUpdate = true;
      } else {
        // Create new review
        console.log('[SHARE] Creating new review');
        response = await fetch(`${API_URL}/api/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            createdBy: 'admin',
            meetings: meetings
          })
        });
      }

      const data = await response.json();

      if (data.success) {
        const fullUrl = `${window.location.origin}/review/${data.reviewId}`;
        setReviewUrl(fullUrl);
        setCurrentReviewId(data.reviewId);
        localStorage.setItem('iml-current-review-id', data.reviewId);
        setShowShareModal(true);

        if (isUpdate) {
          alert('Review updated! Directors will see the latest changes at their existing link.');
        }
      } else {
        alert(`Failed to ${isUpdate ? 'update' : 'create'} review`);
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

  // Refresh director attendance from database
  const refreshApprovals = async () => {
    if (!currentReviewId) {
      alert('No active review. Please share for director review first.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/reviews/${currentReviewId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch review');
      }

      const reviewData = await response.json();

      console.log('[REFRESH] Review data:', reviewData);
      console.log('[REFRESH] Meetings with approvals:', reviewData.meetings.filter(m => m.approvals?.length > 0).length);

      // Update meetings with approval counts from the database
      setMeetings(prevMeetings => {
        return prevMeetings.map(meeting => {
          // Match by characteristics (program_name + type) with year check for Summer Conferences
          const dbMeeting = reviewData.meetings.find(m => {
            // Must match program name and type
            if (m.program_name !== meeting.programName || m.type !== meeting.type) return false;

            // For "All Summer Conferences", also match by year
            if (meeting.programName === 'All Summer Conferences') {
              const dbYear = new Date(m.date).getFullYear();
              const meetingYear = meeting.date.getFullYear();
              return dbYear === meetingYear;
            }

            // For other programs, match works fine
            return true;
          });

          if (dbMeeting) {
            const approvedCount = dbMeeting.approvals?.filter(a =>
              (a.status === 'approved' || a.status === 'accepted') && a.role !== 'admin'
            ).length || 0;
            const rejectedCount = dbMeeting.approvals?.filter(a =>
              (a.status === 'rejected' || a.status === 'declined') && a.role !== 'admin'
            ).length || 0;

            console.log(`[REFRESH] Matched "${meeting.type}" - ${approvedCount} approved, ${rejectedCount} rejected`);

            // Director responses gate the badge/counts; admin responses are
            // attendance, kept in a separate field for their own section.
            const allApprovals = dbMeeting.approvals || [];
            return {
              ...meeting,
              approvedCount,
              rejectedCount,
              approvals: allApprovals.filter(a => a.role !== 'admin'),
              adminApprovals: allApprovals.filter(a => a.role === 'admin'),
              approved: approvedCount > 0 && rejectedCount === 0,
              reviewMeetingId: dbMeeting.id
            };
          }
          return meeting;
        });
      });

      alert('Director attendance updated successfully!');
    } catch (error) {
      console.error('Error refreshing attendance:', error);
      alert('Failed to refresh attendance. Make sure the server is running.');
    }
  };

  // Record the CURRENT admin's own attendance for a meeting directly from the
  // dashboard (role='admin', so it never counts toward the director badge).
  // Attendance lives on the per-review meeting row, so this needs an active
  // review and the meeting's reviewMeetingId (set during the approval merge).
  // status: 'accepted' | 'declined' | 'clear'.
  const recordAdminAttendance = async (meeting, status) => {
    if (!currentReviewId || !meeting.reviewMeetingId || !adminIdentity) return;
    try {
      const base = `${API_URL}/api/reviews/${currentReviewId}/meetings/${meeting.reviewMeetingId}`;
      if (status === 'clear') {
        await fetch(`${base}/clear-approval`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ directorName: adminIdentity.name, attendeeId: adminIdentity.id })
        });
      } else {
        await fetch(`${base}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            directorName: adminIdentity.name,
            status,
            role: 'admin',
            attendeeId: adminIdentity.id
          })
        });
      }

      // Re-sync this meeting's admin attendance from the server (exact match by
      // the per-review row id). Director fields are untouched by admin responses.
      const res = await fetch(`${API_URL}/api/reviews/${currentReviewId}`);
      if (res.ok) {
        const review = await res.json();
        const db = review.meetings?.find(m => m.id === meeting.reviewMeetingId);
        const adminApprovals = (db?.approvals || []).filter(a => a.role === 'admin');
        setMeetings(prev => prev.map(m => m.id === meeting.id ? { ...m, adminApprovals } : m));
      }
    } catch (error) {
      console.error('Failed to record admin attendance:', error);
      alert('Kunde inte spara närvaro. Försök igen.');
    }
  };

  // Open clear review modal
  const openClearModal = async () => {
    console.log('openClearModal called, currentReviewId:', currentReviewId);

    if (!currentReviewId) {
      alert('No active review. Please share for director review first.');
      return;
    }

    try {
      // First, try to get directors from local meetings state
      const localDirectorsSet = new Set();
      console.log('Checking local meetings:', meetings.length);
      meetings.forEach(meeting => {
        console.log('Meeting has approvals?', meeting.approvals, 'Length:', meeting.approvals?.length);
        meeting.approvals?.forEach(approval => {
          console.log('Approval object:', approval);
          localDirectorsSet.add(approval.director_name);
        });
      });
      console.log('Local directors found:', Array.from(localDirectorsSet));

      // Also fetch from server to ensure we have all directors
      const response = await fetch(`${API_URL}/api/reviews/${currentReviewId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch review');
      }

      const reviewData = await response.json();
      console.log('Server review data:', reviewData);

      // Extract unique directors from all approvals
      const directorsSet = new Set(localDirectorsSet); // Start with local directors
      reviewData.meetings?.forEach(meeting => {
        meeting.approvals?.forEach(approval => {
          directorsSet.add(approval.director_name);
        });
      });

      const directors = Array.from(directorsSet).filter(d => d); // Filter out null/undefined
      console.log('Final directors list:', directors);

      setReviewDirectors(directors);
      setShowClearModal(true);
    } catch (error) {
      console.error('Error fetching review data:', error);
      alert('Failed to fetch review data. Make sure the server is running.');
    }
  };

  // Clear reviews for a specific director
  const clearDirectorReviews = async (directorName) => {
    if (!window.confirm(`Are you sure you want to clear all reviews from ${directorName}? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/reviews/${currentReviewId}/clear-director`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directorName })
      });

      if (!response.ok) {
        throw new Error('Failed to clear director reviews');
      }

      // Refresh the director list and meetings
      await openClearModal();
      await refreshApprovals();

      alert(`All reviews from ${directorName} have been cleared.`);
    } catch (error) {
      console.error('Error clearing director reviews:', error);
      alert('Failed to clear director reviews. Make sure the server is running.');
    }
  };

  // Remove duplicates from local admin view AND backend
  const removeMyDuplicates = async () => {
    const seen = new Map();
    const unique = [];

    meetings.forEach(meeting => {
      const key = `${meeting.programName}|||${meeting.type}`;
      if (!seen.has(key)) {
        seen.set(key, true);
        unique.push(meeting);
      }
    });

    const removed = meetings.length - unique.length;

    if (removed === 0) {
      alert('No duplicates found!');
      return;
    }

    // Save deduplicated meetings to backend
    try {
      const response = await fetch(`${API_URL}/api/programs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programs: programs,
          meetings: unique
        })
      });

      const result = await response.json();

      if (result.success) {
        // Update local state after successful backend save
        setMeetings(unique);
        alert(`Removed ${removed} duplicate meetings!\n${unique.length} unique meetings remain.\n\nThe duplicates have been permanently removed from the database.`);
      } else {
        alert('Failed to remove duplicates: ' + result.error);
      }
    } catch (error) {
      console.error('Error removing duplicates:', error);
      alert('Failed to remove duplicates. Make sure the server is running.');
    }
  };

  // Remove duplicate meetings from director review
  const removeDuplicatesFromDirectorView = async () => {
    if (!currentReviewId) {
      alert('No active review.');
      return;
    }

    if (!window.confirm('This will remove duplicate meetings from the director view. Continue?')) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/reviews/${currentReviewId}/deduplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();

      if (result.success) {
        alert(`Removed ${result.removed} duplicate meetings from director view.\n${result.remaining} unique meetings remain.\n\nDirectors need to refresh their browser.`);
      } else {
        alert('Failed to remove duplicates: ' + result.error);
      }
    } catch (error) {
      console.error('Error removing duplicates:', error);
      alert('Failed to remove duplicates. Make sure the server is running.');
    }
  };

  // Sync all meetings to director review
  const syncAllMeetingsToReview = async () => {
    if (!currentReviewId) {
      alert('No active review. Please share for director review first.');
      return;
    }

    try {
      // Step 1: Check which meetings have existing approvals
      console.log('Checking for existing approvals...');
      const meetingsWithApprovals = [];
      const meetingsNotFound = [];

      for (const meeting of meetings) {
        try {
          const response = await fetch(`${API_URL}/api/reviews/${currentReviewId}/sync-meeting`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              programName: meeting.programName,
              meetingType: meeting.type,
              checkOnly: true,
              time: meeting.time,
              date: meeting.date.toISOString(),
              description: meeting.description
            })
          });

          const result = await response.json();

          // Check if meeting was found in director review
          if (result.found === false) {
            meetingsNotFound.push({
              name: meeting.type,
              program: meeting.programName
            });
          } else if (result.hasApprovals) {
            meetingsWithApprovals.push({
              name: meeting.type,
              program: meeting.programName,
              count: result.approvalCount
            });
          }
        } catch (err) {
          console.error(`Failed to check meeting: ${meeting.type}`, err);
        }
      }

      // Warn about meetings not found in director review
      if (meetingsNotFound.length > 0) {
        const notFoundList = meetingsNotFound
          .map(m => `  • ${m.name} (${m.program})`)
          .join('\n');

        alert(`⚠️ WARNING: ${meetingsNotFound.length} meeting(s) not found in director review:\n\n${notFoundList}\n\nThese meetings may have been added after sharing with directors.\n\nTo sync these meetings, you need to use "Share for Director Review" again.`);
        return;
      }

      // Step 2: If meetings have approvals, show warning
      if (meetingsWithApprovals.length > 0) {
        const meetingsList = meetingsWithApprovals
          .map(m => `  • ${m.name} (${m.program}) - ${m.count} director response(s)`)
          .join('\n');

        const warningMessage = `⚠️ WARNING: The following meetings have existing director responses:\n\n${meetingsList}\n\nChanging times will keep their old approvals, which may no longer be valid for the new times.\n\nRecommendation: Consider using "Clear Reviews" to reset director responses before syncing.\n\nContinue anyway?`;

        if (!window.confirm(warningMessage)) {
          return;
        }
      } else {
        // No approvals, just ask for basic confirmation
        if (!window.confirm('This will update all meeting times and dates in the director view to match your current admin view. Continue?')) {
          return;
        }
      }

      // Step 3: Proceed with sync
      let successCount = 0;
      let errorCount = 0;
      let updatedCount = 0;
      let notUpdatedMeetings = [];

      for (const meeting of meetings) {
        try {
          console.log(`Syncing meeting: ${meeting.type} - ${meeting.programName}`);
          const response = await fetch(`${API_URL}/api/reviews/${currentReviewId}/sync-meeting`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              programName: meeting.programName,
              meetingType: meeting.type,
              date: meeting.date.toISOString(),
              time: meeting.time,
              description: meeting.description
            })
          });

          const result = await response.json();
          console.log(`Sync result: ${meeting.type}`, result);

          if (result.changes > 0) {
            updatedCount++;
          } else {
            notUpdatedMeetings.push({
              name: meeting.type,
              program: meeting.programName
            });
          }
          successCount++;
        } catch (err) {
          console.error(`Failed to sync meeting: ${meeting.type} - ${meeting.programName}`, err);
          errorCount++;
        }
      }

      // Show appropriate message based on results
      if (notUpdatedMeetings.length > 0) {
        const notUpdatedList = notUpdatedMeetings
          .map(m => `  • ${m.name} (${m.program})`)
          .join('\n');

        alert(`⚠️ SYNC INCOMPLETE\n\n${updatedCount} meetings were successfully updated.\n\nHowever, ${notUpdatedMeetings.length} meeting(s) were NOT found in director review:\n\n${notUpdatedList}\n\nThese meetings may have been added after sharing with directors, or the program/meeting names don't match exactly.\n\nTo fix: Use "Share for Director Review" again to create a fresh director review.`);
      } else if (errorCount === 0) {
        alert(`✅ Successfully synced all ${successCount} meetings!\n\n${updatedCount} meetings were updated in the director view.\n\nDirectors will see the new times when they refresh.`);
      } else {
        alert(`Synced ${successCount} meetings (${updatedCount} updated). ${errorCount} failed.\n\nCheck console for details.`);
      }
    } catch (error) {
      console.error('Error syncing meetings:', error);
      alert('Failed to sync meetings. Make sure the server is running.');
    }
  };

  // Sync single meeting with option to clear its approvals
  const syncSingleMeeting = async (meeting, clearApprovals = false) => {
    if (!currentReviewId) {
      alert('No active review. Please share for director review first.');
      return;
    }

    try {
      // If clearApprovals, clear them first
      if (clearApprovals && meeting.approvals && meeting.approvals.length > 0) {
        const approvalsList = meeting.approvals
          .map(a => `  • ${a.director_name}: ${a.status}`)
          .join('\n');

        if (!window.confirm(`This will clear the following approvals for "${meeting.type}":\n\n${approvalsList}\n\nAnd then sync the new time/date to director view.\n\nContinue?`)) {
          return;
        }

        console.log('Clearing approvals for meeting:', meeting.type);
        const clearResponse = await fetch(`${API_URL}/api/reviews/${currentReviewId}/clear-meeting-approvals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            programName: meeting.programName,
            meetingType: meeting.type
          })
        });

        const clearResult = await clearResponse.json();
        if (!clearResult.success) {
          alert('Failed to clear approvals: ' + clearResult.error);
          return;
        }

        console.log(`Cleared ${clearResult.deleted} approval(s)`);
      }

      // Now sync the meeting
      console.log('Syncing meeting to director view:', meeting.type);
      const syncResponse = await fetch(`${API_URL}/api/reviews/${currentReviewId}/sync-meeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programName: meeting.programName,
          meetingType: meeting.type,
          date: meeting.date.toISOString(),
          time: meeting.time,
          description: meeting.description
        })
      });

      const syncResult = await syncResponse.json();

      if (syncResult.changes > 0) {
        // Update local meeting to remove approval badges
        setMeetings(currentMeetings =>
          currentMeetings.map(m =>
            m.id === meeting.id
              ? { ...m, approvals: [], adminApprovals: [], approvedCount: 0, rejectedCount: 0 }
              : m
          )
        );

        alert(`✅ Successfully synced "${meeting.type}"!\n\n${clearApprovals ? `Cleared ${meeting.approvals.length} approval(s) and synced` : 'Synced'} new time to director view.\n\nDirectors will see: ${new Date(meeting.date).toLocaleDateString('sv-SE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${meeting.time}`);
      } else {
        alert(`⚠️ Meeting not found in director view.\n\nYou may need to use "Share for Director Review" to create a fresh review.`);
      }
    } catch (error) {
      console.error('Error syncing meeting:', error);
      alert('Failed to sync meeting. Make sure the server is running.');
    }
  };

  // Clean up corrupted meetings with placeholder names AND remove corrupted programs from DB
  const cleanupCorruptedMeetings = async () => {
    const corruptedKeywords = ['Title', 'Untitled', 'TODO', 'TBD', 'TBA'];

    // Find corrupted programs (placeholder names only, NOT based on organizer alone
    // since a real conference may have TBD organizer)
    const corruptedPrograms = programs.filter(p =>
      corruptedKeywords.some(k => p.name === k) ||
      p.name.toLowerCase().includes('minneshögtid')
    );

    // Also find Spring/Fall duplicates (per year should have max 1 of each)
    const duplicates = [];
    ['Spring Program', 'Fall Program'].forEach(type => {
      const byYear = {};
      programs.filter(p => p.type === type).forEach(p => {
        if (!byYear[p.year]) byYear[p.year] = [];
        byYear[p.year].push(p);
      });
      Object.values(byYear).forEach(list => {
        if (list.length > 1) {
          // Keep the longest, mark others as duplicates
          list.sort((a, b) => {
            const durA = a.endDate ? (new Date(a.endDate) - new Date(a.startDate)) : 0;
            const durB = b.endDate ? (new Date(b.endDate) - new Date(b.startDate)) : 0;
            return durB - durA;
          });
          duplicates.push(...list.slice(1));
        }
      });
    });

    const allToDelete = [...new Set([...corruptedPrograms, ...duplicates].map(p => p.name))];

    if (allToDelete.length === 0) {
      alert('No corrupted programs found! ✅');
      return;
    }

    const deleteList = allToDelete.map(n => `  • ${n}`).join('\n');

    if (!window.confirm(`Found ${allToDelete.length} corrupted/duplicate program(s):\n\n${deleteList}\n\nDelete from database?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/programs/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programNames: allToDelete })
      });
      const result = await response.json();

      if (result.success) {
        // Also remove from local state
        const cleanPrograms = programs.filter(p => !allToDelete.includes(p.name));
        const cleanMeetings = meetings.filter(m => !allToDelete.includes(m.programName));
        setPrograms(cleanPrograms);
        setMeetings(cleanMeetings);
        alert(`✅ Deleted ${result.deletedPrograms} program(s) and ${result.deletedMeetings} meeting(s) from database.`);
      } else {
        alert('Failed to clean: ' + (result.error || 'unknown error'));
      }
    } catch (error) {
      console.error('Cleanup error:', error);
      alert('Failed to cleanup. Check server connection.');
    }
  };

  // Force reload from database
  const reloadFromDatabase = async () => {
    if (!window.confirm('This will reload all programs and meetings from the database. Any unsaved changes will be lost. Continue?')) {
      return;
    }

    setLoading(true);
    try {
      console.log('Force reloading from backend database...');
      const response = await fetch(`${API_URL}/api/programs`);

      if (response.ok) {
        const data = await response.json();
        console.log('Reloaded from backend:', data);

        if (data.programs && data.programs.length > 0) {
          // Parse dates back to Date objects
          const programsWithDates = data.programs.map(p => ({
            ...p,
            startDate: new Date(p.startDate),
            endDate: p.endDate ? new Date(p.endDate) : null
          }));

          const meetingsWithDates = data.meetings.map(m => ({
            ...m,
            date: new Date(m.date)
          }));

          setPrograms(programsWithDates);
          setMeetings(meetingsWithDates);
          alert(`✅ Successfully reloaded ${programsWithDates.length} programs and ${meetingsWithDates.length} meetings from database!`);
          console.log(`Reloaded ${programsWithDates.length} programs and ${meetingsWithDates.length} meetings`);
        } else {
          alert('No programs found in database');
        }
      } else {
        alert('Failed to reload from database. Status: ' + response.status);
      }
    } catch (error) {
      console.error('Error reloading from database:', error);
      alert('Failed to reload from database. Make sure the server is running.');
    } finally {
      setLoading(false);
    }
  };

  // ---- Shared ICS (iCalendar) helpers ----

  // A meeting counts as "confirmed" for Outlook when its own flag/status says so.
  const isApproved = m => m.approved || m.status === 'scheduled';

  // Escape a TEXT value per RFC 5545 (backslash, semicolon, comma, newline).
  const escapeICSText = (s) => String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

  // Fold a content line at 75 octets (RFC 5545); continuation lines start with a
  // space. UTF-8 aware, so Swedish characters (å/ä/ö) are never split mid-byte.
  const foldICSLine = (line) => {
    const enc = new TextEncoder();
    if (enc.encode(line).length <= 75) return line;
    const chunks = [];
    let cur = '';
    let limit = 75; // first line 75 octets; continuation lines 74 (+1 leading space)
    for (const ch of line) {
      if (enc.encode(cur + ch).length > limit) {
        chunks.push(cur);
        cur = ch;
        limit = 74;
      } else {
        cur += ch;
      }
    }
    if (cur) chunks.push(cur);
    return chunks.join('\r\n ');
  };

  // Date parts (YYYY, MM, DD) for a date in Europe/Stockholm — robust regardless
  // of the runner's system timezone (meeting.time is already Stockholm wall-clock).
  const stockholmDateParts = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    const [y, m, day] = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' }).split('-');
    return { y, m, day };
  };

  // Format date + "HH:MM" as a local ICS datetime (YYYYMMDDTHHMMSS) in Stockholm
  // wall-clock. Pair with TZID=Europe/Stockholm (see buildICSCalendar).
  const formatICSDateTime = (date, time) => {
    const { y, m, day } = stockholmDateParts(date);
    const [hh = '00', mm = '00'] = String(time || '00:00').split(':');
    return `${y}${m}${day}T${hh.padStart(2, '0')}${mm.padStart(2, '0')}00`;
  };

  // Current UTC timestamp in ICS form (YYYYMMDDTHHMMSSZ) for DTSTAMP.
  const icsStampUTC = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

  // VTIMEZONE block for Europe/Stockholm (EU DST rules) so events render at the
  // correct wall-clock time in every viewer's calendar — including overseas
  // organizers, who would otherwise see floating local time shifted to their TZ.
  const STOCKHOLM_VTIMEZONE = [
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Stockholm',
    'BEGIN:STANDARD',
    'DTSTART:19701025T030000',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'DTSTART:19700329T020000',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'END:VTIMEZONE'
  ];

  // Build a full VCALENDAR string from a list of meetings.
  // forceConfirmed=true marks every event STATUS:CONFIRMED with no [PRELIMINÄR]
  // prefix (used by the approved-only export, where every meeting is already approved).
  const buildICSCalendar = (meetingList, { calName, calDesc = '', forceConfirmed = false } = {}) => {
    const dtstamp = icsStampUTC();
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//IML Meeting Agent//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${escapeICSText(calName)}`,
      'X-WR-TIMEZONE:Europe/Stockholm',
      ...(calDesc ? [`X-WR-CALDESC:${escapeICSText(calDesc)}`] : []),
      ...STOCKHOLM_VTIMEZONE
    ];

    meetingList.forEach((meeting) => {
      const startDateTime = formatICSDateTime(meeting.date, meeting.time);
      const approved = forceConfirmed || isApproved(meeting);
      const summaryPrefix = approved ? '' : '[PRELIMINÄR] ';
      const status = approved ? 'CONFIRMED' : 'TENTATIVE';
      const descNote = approved ? '' : 'OBS: Detta möte är ännu ej godkänt av direktörerna.\n\n';
      // Stable UID (no Date.now()) so re-importing UPDATES events instead of duplicating.
      const uid = `iml-meeting-${meeting.id || `${startDateTime}-${meeting.type}`}@institutmittagleffler.se`;
      const description = `${descNote}${meeting.description || ''}\n\nParticipants: ${(meeting.participants || []).join(', ')}`;

      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;TZID=Europe/Stockholm:${startDateTime}`,
        `DURATION:PT${meeting.duration || 30}M`,
        `SUMMARY:${escapeICSText(`${summaryPrefix}${meeting.type} - ${meeting.programName}`)}`,
        `DESCRIPTION:${escapeICSText(description)}`,
        'LOCATION:Institut Mittag-Leffler',
        `CATEGORIES:${escapeICSText(meeting.programType)}`,
        `STATUS:${status}`,
        'END:VEVENT'
      );
    });

    lines.push('END:VCALENDAR');
    return lines.map(foldICSLine).join('\r\n');
  };

  // Trigger a browser download of an .ics file.
  const downloadICS = (icsString, filename) => {
    const icsBlob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(icsBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export to ICS (iCalendar) format for Outlook.
  // Exports all UPCOMING meetings; non-approved ones are tagged STATUS:TENTATIVE
  // and get a [PRELIMINÄR] prefix so they appear as preliminary in Outlook.
  const exportToICS = () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const upcoming = meetings.filter(m => {
      const d = m.date instanceof Date ? m.date : new Date(m.date);
      return d >= todayStart;
    });

    if (upcoming.length === 0) {
      alert('Inga framtida möten att exportera.');
      return;
    }

    const approvedCount = upcoming.filter(isApproved).length;
    const tentativeCount = upcoming.length - approvedCount;

    if (tentativeCount > 0) {
      const ok = window.confirm(
        `Exportera ${upcoming.length} framtida möten?\n\n` +
        `  ✅ ${approvedCount} godkända (STATUS: CONFIRMED)\n` +
        `  ⚠ ${tentativeCount} ej godkända (STATUS: TENTATIVE + [PRELIMINÄR]-prefix)\n\n` +
        `Den exporterade filen är en preliminär kalender — ej godkända möten visas som tentativa i Outlook.`
      );
      if (!ok) return;
    }

    const calDesc = tentativeCount > 0
      ? `Preliminär kalender — ${tentativeCount} av ${upcoming.length} möten är ännu ej godkända av direktörerna.`
      : '';
    const icsString = buildICSCalendar(upcoming, {
      calName: `IML Meetings${tentativeCount > 0 ? ' (preliminär)' : ''}`,
      calDesc
    });
    downloadICS(icsString, `IML_Meetings_${new Date().toISOString().split('T')[0]}.ics`);
  };

  // Export ONLY meetings that at least one director has accepted (approvedCount >= 1,
  // i.e. one or two directors have said yes). Every exported event is STATUS:CONFIRMED.
  // Like exportToICS, this is limited to upcoming (future) meetings.
  const exportApprovedToICS = () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const approvedUpcoming = meetings.filter(m => {
      const d = m.date instanceof Date ? m.date : new Date(m.date);
      if (d < todayStart) return false;
      return (m.approvedCount || 0) >= 1;
    });

    if (approvedUpcoming.length === 0) {
      alert('Inga godkända framtida möten att exportera.\n\n(Ett möte räknas som godkänt när minst en director har tackat ja.)');
      return;
    }

    const icsString = buildICSCalendar(approvedUpcoming, {
      calName: 'IML Meetings (godkända)',
      calDesc: `Endast möten godkända av minst en director — ${approvedUpcoming.length} möten.`,
      forceConfirmed: true
    });
    downloadICS(icsString, `IML_Approved_Meetings_${new Date().toISOString().split('T')[0]}.ics`);
  };

  // Toggle filter
  const toggleFilter = (type) => {
    setFilters(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  // Filter meetings based on selected filters (type + specific program), sorted by date then time
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const filteredMeetings = meetings
    .filter(m => {
      if (!filters[m.programType]) return false;
      if (programFilter !== 'all' && m.programName !== programFilter) return false;
      if (yearFilter !== 'all' && String(m.programYear) !== yearFilter) return false;
      const meetingDate = m.date instanceof Date ? m.date : new Date(m.date);
      if (meetingDate < todayStart) return false;
      return true;
    })
    .sort((a, b) => {
      const dateA = a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime();
      const dateB = b.date instanceof Date ? b.date.getTime() : new Date(b.date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return (a.time || '').localeCompare(b.time || '');
    });


  // Build sorted list of unique program names for the dropdown
  const programNamesForFilter = Array.from(
    new Set(meetings.map(m => m.programName).filter(Boolean))
  ).sort();

  // Map programName → {type, year} for badge rendering in the dropdown
  const programInfoMap = new Map();
  for (const m of meetings) {
    if (m.programName && !programInfoMap.has(m.programName)) {
      programInfoMap.set(m.programName, { type: m.programType, year: m.programYear });
    }
  }

  // Build sorted list of unique years (only those with future meetings) for the year dropdown
  const yearsForFilter = Array.from(
    new Set(
      meetings
        .filter(m => {
          const d = m.date instanceof Date ? m.date : new Date(m.date);
          return d >= todayStart;
        })
        .map(m => m.programYear)
        .filter(Boolean)
    )
  ).sort((a, b) => a - b);

  // Statistics
  const stats = {
    total: filteredMeetings.length,
    approved: filteredMeetings.filter(m => m.approved).length,
    scheduled: filteredMeetings.filter(m => m.status === 'scheduled').length,
    pending: filteredMeetings.filter(m => m.status === 'pending' && !m.approved).length,
    alreadyScheduled: filteredMeetings.filter(m => m.status === 'already-scheduled').length
  };

  // Detect meeting conflicts (same date and time)
  // Get ISO week number for a date
  const getWeekNumber = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  };

  // Find suggested time from previous year (week-based matching)
  const getSuggestedTimeFromPreviousYear = (meeting) => {
    const meetingYear = meeting.date.getFullYear();
    const previousYear = meetingYear - 1;
    const currentWeek = getWeekNumber(meeting.date);

    // Find similar meeting from previous year using week-based matching
    const previousYearMeeting = meetings.find(m => {
      if (m.date.getFullYear() !== previousYear) return false;
      if (m.type !== meeting.type) return false;

      // For "All Summer Conferences" meetings, match by week number
      if (meeting.programName === 'All Summer Conferences') {
        if (m.programName === 'All Summer Conferences') {
          const prevMeetingWeek = getWeekNumber(m.date);
          return prevMeetingWeek === currentWeek;
        }
        return false;
      }

      // For regular program meetings, match by organizer and week
      if (m.programOrganizer === meeting.programOrganizer) {
        const prevMeetingWeek = getWeekNumber(m.date);
        return Math.abs(prevMeetingWeek - currentWeek) <= 2; // Allow 2-week variation
      }
      return false;
    });

    if (!previousYearMeeting) return null;

    return {
      date: previousYearMeeting.date,
      time: previousYearMeeting.time,
      year: previousYear,
      formattedDate: previousYearMeeting.date.toLocaleDateString('sv-SE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    };
  };

  const detectConflicts = () => {
    const conflicts = [];
    const timeSlots = new Map();

    filteredMeetings.forEach(meeting => {
      const dateStr = meeting.date.toISOString().split('T')[0];
      const key = `${dateStr}|${meeting.time}`;

      if (timeSlots.has(key)) {
        const existing = timeSlots.get(key);
        conflicts.push({
          date: dateStr,
          time: meeting.time,
          meetings: [existing, meeting]
        });
      } else {
        timeSlots.set(key, meeting);
      }
    });

    // Group all meetings with same date/time together
    const conflictMap = new Map();
    conflicts.forEach(conflict => {
      const key = `${conflict.date}|${conflict.time}`;
      if (!conflictMap.has(key)) {
        conflictMap.set(key, {
          date: conflict.date,
          time: conflict.time,
          meetings: []
        });
      }
      conflict.meetings.forEach(m => {
        if (!conflictMap.get(key).meetings.find(existing => existing.id === m.id)) {
          conflictMap.get(key).meetings.push(m);
        }
      });
    });

    return Array.from(conflictMap.values());
  };

  const conflicts = detectConflicts();

  // Helper to check if a meeting is in conflict
  const isConflictingMeeting = (meeting) => {
    return conflicts.some(conflict =>
      conflict.meetings.some(m => m.id === meeting.id)
    );
  };

  // Check if meeting involves directors
  const involvesDirectors = (meeting) => {
    const directorKeywords = ['director', 'directors'];
    const participantsStr = meeting.participants?.join(' ').toLowerCase() || '';
    const typeStr = meeting.type.toLowerCase();
    return directorKeywords.some(keyword =>
      participantsStr.includes(keyword) || typeStr.includes(keyword)
    );
  };

  // Auto-resolve conflicts by moving meetings to next available time
  const autoResolveConflicts = () => {
    if (conflicts.length === 0) {
      alert('No conflicts to resolve!');
      return;
    }

    const conflictCount = conflicts.reduce((sum, c) => sum + c.meetings.length - 1, 0);

    if (!window.confirm(`This will automatically move ${conflictCount} conflicting meetings to the next available time slots.\n\nRules:\n  • Directors meetings → Fridays only\n  • Other meetings → Keep same day if possible\n\nConflicts found:\n${conflicts.map(c => `  • ${c.date} at ${c.time} (${c.meetings.length} meetings)`).join('\n')}\n\nContinue?`)) {
      return;
    }

    const updatedMeetings = [...meetings];
    let movedCount = 0;

    // For each conflict, keep the first meeting and move others
    conflicts.forEach(conflict => {
      // Skip the first meeting (keep it in place)
      const meetingsToMove = conflict.meetings.slice(1);

      meetingsToMove.forEach(meetingToMove => {
        // Find this meeting in the array
        const index = updatedMeetings.findIndex(m => m.id === meetingToMove.id);
        if (index === -1) return;

        const hasDirectors = involvesDirectors(meetingToMove);
        const currentDate = new Date(meetingToMove.date);
        const originalDay = currentDate.getDay(); // 0=Sunday, 5=Friday

        // Parse current time
        const [hours, minutes] = meetingToMove.time.split(':').map(Number);
        let newHours = hours;
        let newMinutes = minutes;
        let testDate = new Date(currentDate);

        // Try times in 30-minute increments
        let found = false;
        for (let attempt = 0; attempt < 200; attempt++) { // Try many slots
          newMinutes += 30;
          if (newMinutes >= 60) {
            newMinutes = 0;
            newHours++;
          }
          if (newHours >= 24) {
            newHours = 9; // Reset to 9:00 AM
            newMinutes = 0;
            testDate.setDate(testDate.getDate() + 1);
          }

          const testDay = testDate.getDay();

          // Apply scheduling rules
          if (hasDirectors && testDay !== 5) {
            // Directors meetings MUST be on Friday (5)
            // Skip this time and continue looking
            continue;
          }

          // Prefer to keep meetings on same day of week (unless it's a director meeting)
          if (!hasDirectors && attempt < 30 && testDay !== originalDay) {
            // First 30 attempts, try to stay on same day of week
            continue;
          }

          const testTime = `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
          const testDateStr = testDate.toISOString().split('T')[0];

          // Check if this time is available
          const isOccupied = updatedMeetings.some(m => {
            const mDateStr = new Date(m.date).toISOString().split('T')[0];
            return mDateStr === testDateStr && m.time === testTime && m.id !== meetingToMove.id;
          });

          if (!isOccupied) {
            // Found available slot
            updatedMeetings[index] = {
              ...updatedMeetings[index],
              date: new Date(testDate),
              time: testTime
            };
            movedCount++;
            found = true;
            break;
          }
        }

        if (!found) {
          console.error('Could not find available slot for meeting:', meetingToMove.type);
        }
      });
    });

    setMeetings(updatedMeetings);
    alert(`✅ Resolved conflicts!\n\n${movedCount} meetings moved to available time slots.\n\nRules applied:\n  • Directors meetings placed on Fridays\n  • Other meetings kept on same day when possible`);
  };

  // Block the dashboard until an admin has identified themselves.
  if (!adminIdentity) {
    return (
      <IdentityPicker
        title="IML Meeting Booking Agent"
        subtitle="Välj ditt namn för att fortsätta:"
        people={adminList}
        onPick={pickAdminIdentity}
        loading={identityConfigState === 'loading'}
        error={identityConfigState === 'error'
          ? 'Kunde inte ladda administratörsnamnen. Kontrollera att servern är igång och försök igen.'
          : null}
        onRetry={loadAdminRoster}
      />
    );
  }

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
            <div className="flex items-center gap-4">
              <IdentityChip person={adminIdentity} onSwitch={switchAdminIdentity} />
              <button
                onClick={regenerateMeetings}
                title="Beräkna om alla mötesdatum från aktuella regler (visar diff innan ändring)"
                className="flex items-center gap-2 bg-amber-100 hover:bg-amber-200 text-amber-800 px-4 py-2 rounded-lg font-medium transition"
              >
                <RefreshCw className="w-5 h-5" />
                Regenerera
              </button>
              <button
                onClick={() => setShowSettings(true)}
                title="Inställningar"
                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition"
              >
                <Settings className="w-5 h-5" />
                Inställningar
              </button>
              <Calendar className="w-16 h-16 text-indigo-600" />
            </div>
          </div>

          {showSettings && (
            <SettingsPanel onClose={() => { setShowSettings(false); loadAdminRoster(); }} />
          )}

          {regenPreview && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
                <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-800">Regenerera möten</h2>
                  <button onClick={() => setRegenPreview(null)} className="text-gray-500 hover:text-gray-800" title="Stäng">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <div className="p-6 overflow-y-auto">
                  <p className="text-sm text-gray-600 mb-3">
                    Från {programs.length} program: {regenPreview.oldCount} → <strong>{regenPreview.newCount}</strong> möten.
                    {regenPreview.weeklyOld !== regenPreview.weeklyNew && (
                      <> Veckomöten: {regenPreview.weeklyOld} → {regenPreview.weeklyNew}.</>
                    )}
                  </p>
                  {regenPreview.changes.length === 0 ? (
                    <p className="text-green-700">Inga ändringar på enskilda möten — datum/tider ligger redan i linje med reglerna.</p>
                  ) : (
                    <div className="space-y-2">
                      {regenPreview.changes.map((c, i) => (
                        <div key={i} className="text-sm border border-gray-200 rounded-lg p-2">
                          <div className="font-medium text-gray-800">{c.label}</div>
                          {c.kind === 'changed' && <div className="text-gray-600">{c.oldD} {c.oldT} → <strong>{c.newD} {c.newT}</strong></div>}
                          {c.kind === 'added' && <div className="text-green-700">Nytt: {c.newD} {c.newT}</div>}
                          {c.kind === 'removed' && <div className="text-red-700">Tas bort: {c.oldD} {c.oldT}</div>}
                          {c.kind === 'weekly' && <div className="text-blue-700">{c.oldT} → {c.newT}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                  <button onClick={() => setRegenPreview(null)} className="px-4 py-2 rounded-lg font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 transition">
                    Avbryt
                  </button>
                  <button onClick={applyRegen} className="px-4 py-2 rounded-lg font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition">
                    Applicera ({regenPreview.newCount} möten)
                  </button>
                </div>
              </div>
            </div>
          )}

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
                  {selectedFile || 'Upload Verksamhetsplanering 20XX-20XX'}
                </span>
              </div>
              <p className="text-sm text-indigo-600 mb-2">
                {isDragging ? 'Drop file here...' : 'Drag and drop your Excel file here'}
              </p>
              <div className="w-full">
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className="bg-indigo-100 text-indigo-800 hover:bg-indigo-200 px-6 py-3 rounded-lg font-semibold text-center transition">
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

            {/* Meeting Conflicts Warning */}
            {conflicts.length > 0 && (
              <div className="bg-red-50 border-2 border-red-400 rounded-lg shadow-lg p-6 mb-8">
                <div className="flex items-start">
                  <XCircle className="w-8 h-8 text-red-600 mr-4 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-2xl font-bold text-red-800">
                        ⚠️ Meeting Conflicts Detected
                      </h2>
                      <button
                        onClick={autoResolveConflicts}
                        className="bg-red-100 text-red-800 hover:bg-red-200 px-6 py-2 rounded-lg font-semibold flex items-center gap-2 transition"
                      >
                        <RefreshCw className="w-5 h-5" />
                        Auto-Resolve All Conflicts
                      </button>
                    </div>
                    <p className="text-red-700 mb-4">
                      The following time slots have multiple meetings scheduled. Click "Auto-Resolve" to automatically move conflicting meetings to available times:
                    </p>
                    <div className="space-y-4">
                      {conflicts.map((conflict, idx) => (
                        <div key={idx} className="bg-white border border-red-300 rounded-lg p-4">
                          <div className="flex items-center mb-3">
                            <Clock className="w-5 h-5 text-red-600 mr-2" />
                            <span className="font-bold text-red-800">
                              {new Date(conflict.date).toLocaleDateString('sv-SE', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })} at {conflict.time}
                            </span>
                          </div>
                          <div className="ml-7 space-y-2">
                            {conflict.meetings.map((meeting, mIdx) => {
                              const suggestion = getSuggestedTimeFromPreviousYear(meeting);
                              return (
                                <div key={mIdx} className="text-sm text-gray-700 bg-red-50 p-3 rounded border border-red-200">
                                  <div className="font-semibold">{meeting.type}</div>
                                  <div className="text-gray-600">{meeting.programName}</div>
                                  {meeting.participants && meeting.participants.length > 0 && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      Participants: {meeting.participants.join(', ')}
                                    </div>
                                  )}
                                  {suggestion && (
                                    <div className="text-xs bg-blue-50 border border-blue-200 rounded p-2 mt-2 text-blue-700">
                                      💡 <strong>Suggestion from {suggestion.year}:</strong> {suggestion.formattedDate} at {suggestion.time}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Programs Overview */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Active Programs</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {programs
                  .filter(program => {
                    // Hide programs that have already ended (end date before today).
                    // Display-only filter — the records stay in the database.
                    // Programs with no end date, or ending today/later, remain visible.
                    if (!program.endDate) return true;
                    const end = program.endDate instanceof Date ? program.endDate : new Date(program.endDate);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    return end >= today;
                  })
                  .map(program => (
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
              <div className="flex flex-wrap gap-4 mb-4">
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

              <h2 className="text-xl font-bold text-gray-800 mb-2">Filter by Year</h2>
              <div className="flex items-center gap-3 mb-4">
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[150px]"
                >
                  <option value="all">All Years</option>
                  {yearsForFilter.map(y => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>
                {yearFilter !== 'all' && (
                  <button
                    onClick={() => setYearFilter('all')}
                    className="text-sm text-indigo-600 hover:text-indigo-800 underline"
                  >
                    Clear
                  </button>
                )}
              </div>

              <h2 className="text-xl font-bold text-gray-800 mb-2">Filter by Program</h2>
              <div className="flex items-center gap-3">
                <div className="relative" ref={programDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setProgramDropdownOpen(o => !o)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[380px] flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-2 truncate">
                      {programFilter === 'all' ? (
                        <span className="text-gray-700">All Programs</span>
                      ) : (
                        <>
                          <span className="truncate">{programFilter}</span>
                          {programInfoMap.get(programFilter) && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${getTypeBadgeColor(programInfoMap.get(programFilter).type)}`}>
                              {programInfoMap.get(programFilter).type} {programInfoMap.get(programFilter).year}
                            </span>
                          )}
                        </>
                      )}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${programDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {programDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-96 overflow-auto">
                      <button
                        type="button"
                        onClick={() => { setProgramFilter('all'); setProgramDropdownOpen(false); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 ${programFilter === 'all' ? 'bg-indigo-50 font-semibold' : ''}`}
                      >
                        All Programs
                      </button>
                      {programNamesForFilter.map(name => {
                        const info = programInfoMap.get(name);
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => { setProgramFilter(name); setProgramDropdownOpen(false); }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center justify-between gap-2 ${programFilter === name ? 'bg-indigo-50 font-semibold' : ''}`}
                          >
                            <span className="truncate">{name}</span>
                            {info && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${getTypeBadgeColor(info.type)}`}>
                                {info.type} {info.year}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {programFilter !== 'all' && (
                  <button
                    onClick={() => setProgramFilter('all')}
                    className="text-sm text-indigo-600 hover:text-indigo-800 underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mb-8 flex justify-end gap-4 flex-wrap">
              <button
                onClick={reloadFromDatabase}
                className="bg-indigo-100 text-indigo-800 hover:bg-indigo-200 px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition"
                title="Reload all meetings from the database"
              >
                <RefreshCw className="w-5 h-5" />
                Reload from Database
              </button>
              <button
                onClick={cleanupCorruptedMeetings}
                className="bg-red-100 text-red-800 hover:bg-red-200 px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition"
                title="Remove meetings with placeholder names like 'Title', 'TBD', etc."
              >
                <X className="w-5 h-5" />
                Clean Corrupted Meetings
              </button>
              <button
                onClick={removeMyDuplicates}
                className="bg-purple-100 text-purple-800 hover:bg-purple-200 px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition"
                title="Remove duplicate meetings from your admin view"
              >
                <Trash2 className="w-5 h-5" />
                Remove My Duplicates
              </button>
              <button
                onClick={shareForReview}
                className="bg-orange-100 text-orange-800 hover:bg-orange-200 px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition"
              >
                <Share2 className="w-5 h-5" />
                Share for Director Review
              </button>
              {currentReviewId && (
                <>
                  <button
                    onClick={syncAllMeetingsToReview}
                    className="bg-blue-100 text-blue-800 hover:bg-blue-200 px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition"
                    title="Push all current meeting times/dates to director view"
                  >
                    <RefreshCw className="w-5 h-5" />
                    Sync All to Directors
                  </button>
                  <button
                    onClick={refreshApprovals}
                    className="bg-teal-100 text-teal-800 hover:bg-teal-200 px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition"
                    title="Check latest director availability responses"
                  >
                    <RefreshCw className="w-5 h-5" />
                    Refresh Director Attendance
                  </button>
                  <button
                    onClick={removeDuplicatesFromDirectorView}
                    className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200 px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition"
                    title="Remove duplicate meetings from director view"
                  >
                    <Trash2 className="w-5 h-5" />
                    Remove Director Duplicates
                  </button>
                  <button
                    onClick={openClearModal}
                    className="bg-red-100 text-red-800 hover:bg-red-200 px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition"
                    title="Clear reviews from specific directors"
                  >
                    <Trash2 className="w-5 h-5" />
                    Clear Reviews
                  </button>
                </>
              )}
              <button
                onClick={approveAll}
                className="bg-gray-100 text-gray-800 hover:bg-gray-200 px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition"
              >
                <CheckCircle className="w-5 h-5" />
                Approve All
              </button>
              <button
                onClick={exportToICS}
                className="bg-purple-100 text-purple-800 hover:bg-purple-200 px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition"
              >
                <CalendarDays className="w-5 h-5" />
                Export to Outlook (.ics)
              </button>
              <button
                onClick={exportApprovedToICS}
                title="Exporterar endast möten där minst en director har tackat ja"
                className="bg-teal-100 text-teal-800 hover:bg-teal-200 px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition"
              >
                <CalendarCheck className="w-5 h-5" />
                Export Approved Meetings (.ics)
              </button>
              <button
                onClick={exportToExcel}
                className="bg-green-100 text-green-800 hover:bg-green-200 px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition"
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
                      className="ml-4 bg-indigo-100 text-indigo-800 hover:bg-indigo-200 px-4 py-2 rounded-lg flex items-center gap-2 transition flex-shrink-0"
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
                    className="w-full bg-gray-100 text-gray-800 hover:bg-gray-200 px-6 py-3 rounded-lg font-semibold transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* Clear Reviews Modal */}
            {showClearModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full mx-4">
                  <h2 className="text-2xl font-bold text-gray-800 mb-4">Clear Director Reviews</h2>
                  <p className="text-gray-600 mb-4">
                    Select a director to clear all their reviews:
                  </p>

                  {reviewDirectors.length === 0 ? (
                    <div className="bg-gray-50 p-8 rounded-lg text-center">
                      <p className="text-gray-600">No director reviews found.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 mb-6">
                      {reviewDirectors.map((director) => (
                        <div key={director} className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
                          <span className="text-gray-800 font-medium">{director}</span>
                          <button
                            onClick={() => clearDirectorReviews(director)}
                            className="bg-red-100 text-red-800 hover:bg-red-200 px-4 py-2 rounded-lg flex items-center gap-2 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                            Clear Reviews
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => setShowClearModal(false)}
                    className="w-full bg-gray-100 text-gray-800 hover:bg-gray-200 px-6 py-3 rounded-lg font-semibold transition"
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
                {(() => {
                  if (programFilter !== 'all') {
                    console.log('[RENDER DEBUG] Rendering', filteredMeetings.length, 'meetings; first =', filteredMeetings[0] && {id: filteredMeetings[0].id, type: filteredMeetings[0].type, programName: filteredMeetings[0].programName});
                  }
                  return null;
                })()}
                {filteredMeetings.map(meeting => {
                  const isConflict = isConflictingMeeting(meeting);
                  return (
                  <div
                    key={meeting.id}
                    className={`border-l-4 p-4 rounded-r-lg transition ${
                      isConflict
                        ? 'border-red-600 bg-red-100 shadow-lg'
                        : meeting.status === 'already-scheduled'
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
                            {meeting.programType} {meeting.programYear}
                          </span>
                          {isConflict && (
                            <span className="text-xs font-bold px-3 py-1 rounded-full bg-red-600 text-white animate-pulse">
                              ⚠️ TIME CONFLICT
                            </span>
                          )}
                          {meeting.approvals && meeting.approvals.length > 0 && (
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                              meeting.approvedCount === 2 ? 'bg-green-100 text-green-800' :
                              meeting.approvedCount === 1 ? 'bg-yellow-100 text-yellow-800' :
                              meeting.rejectedCount === 2 ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {meeting.approvedCount === 2 ? '✓ 2/2 directors' :
                               meeting.approvedCount === 1 ? '✓ 1/2 directors' :
                               meeting.rejectedCount === 2 ? '✗ 0/2 directors' :
                               `? ${meeting.approvals.length}/2 responded`}
                            </span>
                          )}
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
                              className="text-sm bg-indigo-100 text-indigo-800 px-3 py-1 rounded hover:bg-indigo-200 transition"
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
                                className="px-3 py-2 bg-green-100 text-green-800 rounded-lg hover:bg-green-200 transition"
                                title="Save"
                              >
                                <Save className="w-4 h-4" />
                              </button>
                              <button
                                onClick={cancelEditing}
                                className="px-3 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition"
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

                        <div className="text-xs text-gray-500 mb-2">
                          <strong>Participants:</strong> {meeting.participants.join(', ')}
                        </div>

                        {/* Director Attendance Details */}
                        {meeting.approvals && meeting.approvals.length > 0 && (
                          <div className="bg-blue-50 p-3 rounded-lg">
                            <p className="text-xs font-semibold text-blue-800 mb-2">Director Attendance:</p>
                            {meeting.approvals.map((approval, idx) => (
                              <div key={idx} className="text-xs text-blue-900 mb-1">
                                <strong>{approval.director_name}:</strong>{' '}
                                <span className={
                                  (approval.status === 'accepted' || approval.status === 'approved')
                                    ? 'text-green-700 font-semibold'
                                    : (approval.status === 'declined' || approval.status === 'rejected')
                                    ? 'text-red-700 font-semibold'
                                    : 'text-gray-600'
                                }>
                                  {(approval.status === 'accepted' || approval.status === 'approved') ? 'Attending' :
                                   (approval.status === 'declined' || approval.status === 'rejected') ? 'Cannot attend' :
                                   'Pending'}
                                </span>
                                {approval.comment && (
                                  <span className="text-gray-700"> - "{approval.comment}"</span>
                                )}
                                {approval.suggested_date && (
                                  <span className="text-gray-700"> (Suggested: {approval.suggested_date} {approval.suggested_time})</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Admin Attendance Details — separate from the director badge/counts */}
                        {meeting.adminApprovals && meeting.adminApprovals.length > 0 && (
                          <div className="bg-purple-50 p-3 rounded-lg mt-2">
                            <p className="text-xs font-semibold text-purple-800 mb-2">Admin Attendance:</p>
                            {meeting.adminApprovals.map((approval, idx) => (
                              <div key={idx} className="text-xs text-purple-900 mb-1">
                                <strong>{approval.director_name}:</strong>{' '}
                                <span className={
                                  (approval.status === 'accepted' || approval.status === 'approved')
                                    ? 'text-green-700 font-semibold'
                                    : (approval.status === 'declined' || approval.status === 'rejected')
                                    ? 'text-red-700 font-semibold'
                                    : 'text-gray-600'
                                }>
                                  {(approval.status === 'accepted' || approval.status === 'approved') ? 'Attending' :
                                   (approval.status === 'declined' || approval.status === 'rejected') ? 'Cannot attend' :
                                   'Pending'}
                                </span>
                                {approval.comment && (
                                  <span className="text-gray-700"> - "{approval.comment}"</span>
                                )}
                                {approval.suggested_date && (
                                  <span className="text-gray-700"> (Suggested: {approval.suggested_date} {approval.suggested_time})</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Inline control: the CURRENT admin records their own attendance.
                            Only shown when there's an active per-review row to attach it to. */}
                        {currentReviewId && meeting.reviewMeetingId && adminIdentity && (() => {
                          const mine = meeting.adminApprovals?.find(a => a.attendee_id === adminIdentity.id);
                          const isAttending = mine && (mine.status === 'accepted' || mine.status === 'approved');
                          const isDeclined = mine && (mine.status === 'declined' || mine.status === 'rejected');
                          return (
                            <div className="bg-purple-50 border border-purple-200 p-3 rounded-lg mt-2">
                              <p className="text-xs font-semibold text-purple-800 mb-2">
                                Din närvaro ({adminIdentity.name}):
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => recordAdminAttendance(meeting, 'accepted')}
                                  className={`text-xs px-3 py-1 rounded-full transition ${
                                    isAttending
                                      ? 'bg-green-600 text-white'
                                      : 'bg-white text-purple-800 border border-purple-300 hover:bg-purple-100'
                                  }`}
                                >
                                  Attending
                                </button>
                                <button
                                  onClick={() => recordAdminAttendance(meeting, 'declined')}
                                  className={`text-xs px-3 py-1 rounded-full transition ${
                                    isDeclined
                                      ? 'bg-red-600 text-white'
                                      : 'bg-white text-purple-800 border border-purple-300 hover:bg-purple-100'
                                  }`}
                                >
                                  Cannot attend
                                </button>
                                {mine && (
                                  <button
                                    onClick={() => recordAdminAttendance(meeting, 'clear')}
                                    className="text-xs px-3 py-1 rounded-full bg-white text-gray-600 border border-gray-300 hover:bg-gray-100 transition"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="flex flex-col gap-2 ml-4">
                        {meeting.status === 'already-scheduled' ? (
                          <>
                            <div className="px-4 py-2 rounded-lg font-medium bg-gray-400 text-white text-center">
                              Already Scheduled
                            </div>
                            <button
                              onClick={() => toggleAlreadyScheduled(meeting.id)}
                              className="px-4 py-2 rounded-lg font-medium bg-orange-100 text-orange-800 hover:bg-orange-200 transition text-sm"
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
                                  ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              {meeting.approved ? 'Approved' : 'Approve'}
                            </button>

                            {meeting.approved && meeting.status !== 'scheduled' && (
                              <button
                                onClick={() => markScheduled(meeting.id)}
                                className="px-4 py-2 rounded-lg font-medium bg-indigo-100 text-indigo-800 hover:bg-indigo-200 transition"
                              >
                                Mark Scheduled
                              </button>
                            )}

                            <button
                              onClick={() => toggleAlreadyScheduled(meeting.id)}
                              className="px-4 py-2 rounded-lg font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 transition text-sm"
                            >
                              Already Scheduled
                            </button>

                            {meeting.approvals && meeting.approvals.length > 0 && currentReviewId && (
                              <button
                                onClick={() => syncSingleMeeting(meeting, true)}
                                className="px-4 py-2 rounded-lg font-medium bg-yellow-100 text-yellow-800 hover:bg-yellow-200 transition text-sm flex items-center gap-2"
                                title="Clear approvals for this meeting and sync new time to directors"
                              >
                                <RefreshCw className="w-4 h-4" />
                                Sync & Clear Approvals
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
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
