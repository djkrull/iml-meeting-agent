// Canonical default app configuration, seeded into the `app_settings` table on
// first run. This mirrors the values that were historically hardcoded in the
// frontend (DirectorReviewView director list + MeetingAgent meetingTypes), so the
// app behaves identically until an admin edits something in Settings.
//
// IMPORTANT (golden-test parity): meeting-rule offsets are stored in DAYS, exactly
// reproducing the old `leadTime` day-offsets. The Settings UI lets admins switch a
// rule to months/weeks later (which may shift that rule's computed date by a few
// days — by design, and only for future generation).

// Effective default time for meetings that historically had no explicit `time`
// (generation used `meetingType.time || '14:00'`).
const DEFAULT_TIME = '14:00';

// --- small builders -------------------------------------------------------
const before = (amount, unit = 'days') => ({ amount, unit, direction: 'before' });
const after  = (amount, unit = 'days') => ({ amount, unit, direction: 'after' });
const onDay  = () => ({ amount: 0, unit: 'days', direction: 'on' });

const weekdayPlacement = (weekday, snap = 'forward') => ({ mode: 'weekday', weekday, snap });
// No seeded rule uses exact placement any more (Program Start moved to a weekday
// rule in 2026-08), but the mode is still supported by the engine + Settings UI.
const exactPlacement   = () => ({ mode: 'exact', weekday: null, snap: null }); // eslint-disable-line no-unused-vars

// --- rosters --------------------------------------------------------------
const directors = [
  { id: 'dir_hans',     name: 'Hans Ringström',                role: 'Director',        active: true },
  { id: 'dir_georgios', name: 'Georgios Dimitroglou Rizell',   role: 'Deputy Director', active: true },
];

const admins = [
  { id: 'adm_christian', name: 'Christian Wahlén', active: true },
  { id: 'adm_anna',      name: 'Anna Bohe',        active: true },
  { id: 'adm_sofie',     name: 'Sofie Upmark',     active: true },
  { id: 'adm_maja',      name: 'Maja Wideberg',    active: true },
];

// --- Spring / Fall shared meetings (Check-ins, Onboarding, Start, Mid-term, Eval)
// Seeded identically for Spring and Fall; they can diverge once edited.
const commonSpringFall = () => ([
  {
    id: 'checkin_organizers', name: 'Check-in meeting with organizers',
    anchor: 'start', offset: before(180), placement: weekdayPlacement(5),
    time: '10:00', duration: 30,
    participants: ['Program Organizers', 'Admin Team', 'Directors'],
    requiresDirectors: true, recurring: null, sharedPerYear: false, group: null,
    description: 'Review preparations and logistics',
  },
  {
    id: 'checkin_junior', name: 'Check-in meeting junior fellows',
    anchor: 'start', offset: before(180), placement: weekdayPlacement(5),
    time: '10:30', duration: 30,
    participants: ['Junior Fellows', 'Admin Team', 'Directors'],
    requiresDirectors: true, recurring: null, sharedPerYear: false, group: null,
    description: 'Junior fellow orientation and support',
  },
  {
    // POLICY 2026-08 (Sofie Upmark): first Friday AFTER program start — the
    // onboarding is only useful once participants are actually on site.
    // Was: 5 days BEFORE start, snapped forward to Friday (i.e. the Friday before).
    id: 'onboarding', name: 'Onboarding meeting',
    anchor: 'start', offset: after(1), placement: weekdayPlacement(5),
    time: DEFAULT_TIME, duration: 30,
    participants: ['Admin Team', 'Organizers', 'Directors'],
    requiresDirectors: true, recurring: null, sharedPerYear: false, group: null,
    description: 'Practical information and house rules',
  },
  {
    // POLICY 2026-08 (Sofie Upmark): first Tuesday AFTER program start, held in
    // connection with the first seminar. Was: exactly on the start date.
    // The +1 day offset makes "after" strict, so a program starting on a Tuesday
    // gets the FOLLOWING Tuesday rather than its own start date.
    // NOTE: the seminar schedule decides the TIME — adjust per program.
    id: 'program_start', name: 'Program Start Meeting',
    anchor: 'start', offset: after(1), placement: weekdayPlacement(2),
    time: DEFAULT_TIME, duration: 30,
    participants: ['Program Organizers', 'All Participants', 'Directors'],
    requiresDirectors: true, recurring: null, sharedPerYear: false, group: null,
    description: 'Official program kickoff',
  },
  {
    id: 'mid_term', name: 'Mid-term meeting',
    anchor: 'start', offset: after(42), placement: weekdayPlacement(5),
    time: DEFAULT_TIME, duration: 30,
    participants: ['Program Organizers', 'Admin Team', 'Directors'],
    requiresDirectors: true, recurring: null, sharedPerYear: false, group: null,
    description: 'Progress check and adjustments',
  },
  {
    id: 'evaluation', name: 'Evaluation meeting/lunch',
    // End-anchored: last Friday on/before program end (historical `leadTime: 'end'`).
    anchor: 'end', offset: before(0), placement: weekdayPlacement(5, 'onOrBefore'),
    time: '12:00', duration: 90,
    participants: ['Program Organizers', 'Directors'],
    requiresDirectors: true, recurring: null, sharedPerYear: false, group: null,
    description: 'Program evaluation and feedback',
  },
]);

// Introduction Meeting differs by program-year (FP28+/SP29+ uses 20 months / 600d).
const introMeeting = (overrideFromYear) => ({
  id: 'introduction', name: 'Introduction Meeting',
  anchor: 'start', offset: before(540), placement: weekdayPlacement(5),
  time: '10:00', duration: 30,
  participants: ['Program Organizers', 'Directors', 'Admin Coordinator'],
  requiresDirectors: true, recurring: null, sharedPerYear: false, group: null,
  description: 'Initial program planning and expectations',
  // Year-gated offset (kept as data; the gating logic stays in code).
  offsetOverrideFromYear: { fromYear: overrideFromYear, offset: before(600) },
});

const meetingRules = {
  'Spring Program': [introMeeting(2029), ...commonSpringFall()],
  'Fall Program':   [introMeeting(2028), ...commonSpringFall()],
  'Kleindagarna': [
    {
      id: 'klein_bp', name: 'Meeting with organizer and B&P',
      anchor: 'start', offset: before(120), placement: weekdayPlacement(5),
      time: DEFAULT_TIME, duration: 30,
      participants: ['Event Organizer', 'B&P Team', 'Admin Coordinator'],
      requiresDirectors: false, recurring: null, sharedPerYear: false, group: null,
      description: 'Budget and planning coordination',
    },
    {
      id: 'klein_checkin', name: 'Check-in meeting with Organizer',
      anchor: 'start', offset: before(45), placement: weekdayPlacement(5),
      time: DEFAULT_TIME, duration: 30,
      participants: ['Event Organizer', 'Admin Team'],
      requiresDirectors: false, recurring: null, sharedPerYear: false, group: null,
      description: 'Final preparations and logistics',
    },
  ],
  'Summer Conference': [
    {
      id: 'summer_intro_g1', name: 'Introduction Meeting - Group 1',
      anchor: 'start', offset: before(240), placement: weekdayPlacement(5),
      time: '11:00', duration: 30,
      participants: ['Conference Organizer Group 1', 'Admin Team', 'Directors'],
      requiresDirectors: true, recurring: null, sharedPerYear: true, group: 1,
      description: 'Initial planning for first conference group',
    },
    {
      // RULE: Group 1 morning (11:00) / Group 2 afternoon (15:00) so overseas
      // organizers can join Group 2 during their morning. See CLAUDE.md.
      id: 'summer_intro_g2', name: 'Introduction Meeting - Group 2',
      anchor: 'start', offset: before(240), placement: weekdayPlacement(5),
      time: '15:00', duration: 30,
      participants: ['Conference Organizer Group 2', 'Admin Team', 'Directors'],
      requiresDirectors: true, recurring: null, sharedPerYear: true, group: 2,
      description: 'Initial planning for second conference group',
    },
    {
      id: 'summer_checkin_g1', name: 'Check-in Meeting - Group 1',
      anchor: 'start', offset: before(90), placement: weekdayPlacement(5),
      time: '11:00', duration: 30,
      participants: ['Conference Organizer Group 1', 'Admin Team'],
      requiresDirectors: true, recurring: null, sharedPerYear: true, group: 1,
      description: 'Pre-conference preparations review',
    },
    {
      id: 'summer_checkin_g2', name: 'Check-in Meeting - Group 2',
      anchor: 'start', offset: before(90), placement: weekdayPlacement(5),
      time: '15:00', duration: 30,
      participants: ['Conference Organizer Group 2', 'Admin Team'],
      requiresDirectors: true, recurring: null, sharedPerYear: true, group: 2,
      description: 'Pre-conference preparations review',
    },
    {
      id: 'summer_weekly_onboarding', name: 'Weekly Onboarding meeting light',
      anchor: 'start', offset: onDay(), placement: weekdayPlacement(1),
      time: '09:30', duration: 30,
      participants: ['Organizers', 'Admin Team'],
      requiresDirectors: false, recurring: 'weekly', sharedPerYear: false, group: null,
      description: 'Orientation for new organizers, zoom, lunches, photo etc...',
    },
    {
      id: 'summer_weekly_welcome', name: 'Weekly Welcome Meeting',
      anchor: 'start', offset: onDay(), placement: weekdayPlacement(1),
      time: '10:00', duration: 15,
      participants: ['All Conference Participants'],
      requiresDirectors: false, recurring: 'weekly', sharedPerYear: false, group: null,
      description: 'Weekly welcome and updates',
    },
  ],
};

function buildDefaultConfig() {
  return {
    version: 1,
    // Shared PIN to open Settings (low-security, internal tool). Change in Settings.
    settingsPin: '1234',
    directors,
    admins,
    imlClosedDays: [], // admin-maintained extra closed dates (local YYYY-MM-DD)
    meetingRules,
  };
}

module.exports = { buildDefaultConfig, DEFAULT_TIME };
