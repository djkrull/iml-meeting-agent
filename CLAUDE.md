# CLAUDE.md — IML Meeting Booking Agent

Project-specific guidance for Claude Code. Complements the global instructions.

## CRITICAL: User timezone

The user and all IML/KVA operations are in **Sweden (CET/CEST, UTC+1/+2)**. All date/time calculations MUST use Swedish local time:

- Never mix UTC and local-time date arithmetic in the same codepath — produces off-by-one-day bugs.
- Import/backend scripts that touch dates must match the frontend's convention (`getDate`/`setDate` — local time), not `getUTCDate`/`setUTCDate`.
- PostgreSQL `TIMESTAMP` values are stored as UTC; convert with `AT TIME ZONE 'Europe/Stockholm'` when day-of-week matters.

## Stack

- **Frontend**: React (CRA) at [src/components/MeetingAgent.jsx](src/components/MeetingAgent.jsx), deployed on Vercel.
- **Backend**: Express at [server/index.js](server/index.js), routes in [server/routes/](server/routes/).
- **Database**: SQLite locally (`server/reviews.db`), PostgreSQL on Railway in production. Toggled by `DATABASE_URL` env var.

## Database

### Tables
- `programs` — persistent master list of programs.
- `program_meetings` — persistent meeting schedule shown in the main UI.
- `reviews` — director-review sessions (one per "Share for Director Review").
- `meetings` — per-review COPY of meetings for a specific review.
- `approvals` — reviewer responses. **Foreign key points to `meetings`, NOT `program_meetings`.** Wiping `program_meetings` does NOT affect approvals. Has `role` (`'director'`|`'admin'`) and a stable `attendee_id` (the config id of the director/admin) — see Configuration below.
- `app_settings` — **single-row** (`id = 1`) JSON config blob: directors, admins, meeting rules, PIN, IML-closed days, active-review pointer. See Configuration below.

### PostgreSQL gotcha (root cause of a full day of silent failures)
`CREATE UNIQUE INDEX` creates an index, NOT a constraint. `INSERT ... ON CONFLICT ON CONSTRAINT <name>` requires a real named `CONSTRAINT` (`ALTER TABLE ... ADD CONSTRAINT`). When mismatched, every INSERT throws, the backend returns 500, and the frontend swallows the error → UI shows "Total Meetings: N" but DB has far fewer rows.

`ensureUniqueConstraint()` in [server/db.js](server/db.js) handles this correctly on startup. Don't regress to plain `CREATE UNIQUE INDEX`.

### Direct production access
`DATABASE_PUBLIC_URL` (from Railway) allows direct `pg` connection. Helper scripts:
- `validate-production.js` — read-only validation (counts, duplicates, conflicts, expected programs)
- `import-to-production.js` — bulk-import programs + regenerate meetings when auto-save is broken
- `clean-reset-production.js` — wipe `program_meetings` and dedupe programs (safe w.r.t. approvals)

**Don't trust the UI's meeting count** — state and DB can drift. Validate the DB directly when debugging.

## Configuration (app_settings) & Settings UI

Directors, admins, the PIN, IML-closed days, and **all meeting rules** are config, not hardcode. They live in the single-row `app_settings.config` JSON, seeded on first run from [server/defaultSettings.js](server/defaultSettings.js) (which mirrors the values that used to be hardcoded). The old `meetingTypes`/`calculateMeetingDate` constants in `MeetingAgent.jsx` are **gone** — don't reintroduce them.

`config` shape: `{ version, settingsPin, directors[], admins[], imlClosedDays[], meetingRules{ <programType>: Rule[] }, activeReviewId }`.
A `Rule` = `{ id, name, anchor:'start'|'end', offset:{amount,unit:'days'|'weeks'|'months',direction:'before'|'after'|'on'}, placement:{mode:'weekday'|'exact', weekday, snap:'forward'|'backward'|'onOrBefore'|'nearest'}, time, duration, participants[], requiresDirectors, recurring, sharedPerYear, group, offsetOverrideFromYear? }`.

- **Seed offsets are stored in DAYS** to reproduce the historical `leadTime` day-offsets exactly (golden-test parity). The Settings UI lets admins switch a rule to months/weeks (which may shift that rule's date a few days — by design, future generation only).
- **`offsetOverrideFromYear`** is the year-gated Intro offset (FP28+/SP29+ = 600d instead of 540d). It's editable + visible in the rule editor — don't make the base offset silently ignored for future years.

### API ([server/routes/settings.js](server/routes/settings.js)) — saved EXPLICITLY, never via the meetings auto-save
- `GET /api/settings` → config **with the PIN stripped** (`hasPin` boolean instead). Public-safe (rosters + rules are needed on the dashboard/director link).
- `PUT /api/settings` → requires the correct PIN in the body (the frontend gate is not trusted on its own), **merges** over the current config (never drops `meetingRules`/`imlClosedDays`/PIN/`activeReviewId`), validates shape.
- `POST /api/settings/verify-pin` — rate-limited (locks after 5 fails). PIN is low-security (internal tool) but must never be returned by GET.

### Rule engine ([src/utils/meetingRuleEngine.js](src/utils/meetingRuleEngine.js)) — CommonJS so Node tests + CRA share it
`resolveMeetingDate(rule, start, end, programYear, { isClosed })`: anchor → offset (local-time month/week/day math) → placement (weekday+snap, or exact) → holiday/closed-day avoidance. `generateMeetings` reads rules from the loaded config and calls this. **Golden test [test-rule-parity.js](test-rule-parity.js) must stay green** (seed config reproduces historical dates exactly — run before changing the engine).

### Swedish holidays / IML-closed days ([src/utils/swedishHolidays.js](src/utils/swedishHolidays.js))
`swedishHolidays(year)` (red days incl. movable Easter feasts, midsommar, alla helgons dag, + de-facto-closed eves) and `createIsClosed(imlClosedDays)`. Weekday-placed meetings jump a week (same weekday) until open; exact-placement meetings (Program Start) move to the next open weekday; weekly meetings skip closed weeks. Unit test: [test-holidays.js](test-holidays.js).

### Identity ([src/components/IdentityGate.jsx](src/components/IdentityGate.jsx))
Admin dashboard and the director link both gate behind a name picker (roster from config). localStorage stores the **stable id**, not the name (rename-safe). "Remember me" optional. Admins also appear in the director-review picker (tagged Administratör) and mark attendance — see Approvals below.

### Approvals: role + rename-safety
- `addApproval`/`clearApproval` match an existing row by **`attendee_id` first** (rename-safe), falling back to display name + backfilling the id — so renaming a director/admin in Settings never duplicates or orphans their response.
- **Only `role='director'` responses gate a meeting's approved/CONFIRMED status.** `role='admin'` is attendance only and is excluded from every approval count (backend `overallStatus`/`/status`, dashboard counts) and from `meeting.approvals` on the dashboard. Admins still show in the reviewer view + the .ics "Attending" line.

### Regenerate
"Regenerera" on the dashboard recomputes future meeting dates from current rules, shows a diff, and applies via `POST /api/programs/replace-meetings` — a **transactional delete-future-then-insert** so a date-shifted meeting can't leave a stale duplicate under the `(program_name, type, date)` unique constraint. Past meetings are preserved.

### Active-review pointer
Creating/updating a review records `activeReviewId` in config; `GET /api/reviews/active` lets any admin device converge on the latest shared review instead of a stale localStorage id.

### Auto-save clobber gotcha (don't regress)
The dashboard auto-saves the whole meetings array to `program_meetings` (upsert) on state change. A stale tab can silently overwrite out-of-band edits, so: the 30s approval refresh must NOT trigger a save unless approval data actually changed; tabs re-sync meeting times on focus; and **Settings/regenerate use their own endpoints**, never the meetings auto-save.

## Business rules (enforce in parsing/generation)

- **Max 1 Spring Program + 1 Fall Program per year.** If multiple candidates, keep the longest (multi-month) and reclassify extras as Summer Conference.
- **Short programs (< 30 days) in May–August are Summer Conferences**, even if they start in August. Never categorize by start-month alone — check duration.
- **Summer Conference Introduction Meeting / Check-in Meeting (Group 1/2) are shared per year** (one meeting for all summer conferences combined), not per individual conference. Create once per `(year, meeting_type)`, using the earliest summer conference of that year as the reference date for the lead-time calc.
- **Summer Conference Group 1 / Group 2 meeting times: morning + afternoon split.** Both the Introduction Meeting and the Check-in Meeting must run **Group 1 at 11:00 (förmiddag)** and **Group 2 at 15:00 (eftermiddag)** — never back-to-back. The afternoon slot for Group 2 lets overseas organizers (e.g. USA) join during their morning. This is the seeded default in [server/defaultSettings.js](server/defaultSettings.js) (`meetingRules['Summer Conference']`) and is now editable in Settings → Mötesregler; it must hold for all future years (2028+). (Fixed 2026-06-17: 2026 Introduction Meeting Group 2 had regressed to 11:30; restored to 15:00.)
- **Weekly meetings (Welcome, Onboarding light) must generate for all program types**, not only Summer Conferences. Spring/Fall programs run weekly cycles throughout their duration (cap at 52 weeks; Summer at 2 weeks).
- **Cyclical time inheritance**: when generating meetings for year N, look up the previous year's meeting with the same `(programType, meetingType)` and inherit its time. The anchor is the **TYPE** (Spring / Fall / Summer Conference / Kleindagarna), NOT the program name — names change year to year; types cycle.

## Placeholder / filtering rules

- Placeholder program detection: check program **NAME only** (`'Title'`, `'TBD'`, `'Unnamed Program'`). **Never the organizer field.** "Specialkonferens" with organizer "Organizer" is a legitimate Swedish conference name with a TBD organizer — don't delete it.
- Memorial events: filter by name containing `'minneshögtid'`.
- Normalize program names: strip trailing `\r\n` / whitespace. CSV parsing preserved them and the resulting name difference leaked duplicates past the unique constraint.

## Excel/CSV upload

- CSV from the user: Latin-1 encoding, semicolon separators, multi-line quoted fields.
- Swedish column headers: `År`, `Datum`, `Program`, `Organisatörer`, `Bekräftad`.
- Swedish natural-language date strings: `"11 februari - 22 maj"`, `"1-5 juni"`.
- `csv-to-excel.js` converts the user's CSV to the Excel format the frontend upload expects.
