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
- `approvals` — director responses. **Foreign key points to `meetings`, NOT `program_meetings`.** Wiping `program_meetings` does NOT affect approvals.

### PostgreSQL gotcha (root cause of a full day of silent failures)
`CREATE UNIQUE INDEX` creates an index, NOT a constraint. `INSERT ... ON CONFLICT ON CONSTRAINT <name>` requires a real named `CONSTRAINT` (`ALTER TABLE ... ADD CONSTRAINT`). When mismatched, every INSERT throws, the backend returns 500, and the frontend swallows the error → UI shows "Total Meetings: N" but DB has far fewer rows.

`ensureUniqueConstraint()` in [server/db.js](server/db.js) handles this correctly on startup. Don't regress to plain `CREATE UNIQUE INDEX`.

### Direct production access
`DATABASE_PUBLIC_URL` (from Railway) allows direct `pg` connection. Helper scripts:
- `validate-production.js` — read-only validation (counts, duplicates, conflicts, expected programs)
- `import-to-production.js` — bulk-import programs + regenerate meetings when auto-save is broken
- `clean-reset-production.js` — wipe `program_meetings` and dedupe programs (safe w.r.t. approvals)

**Don't trust the UI's meeting count** — state and DB can drift. Validate the DB directly when debugging.

## Business rules (enforce in parsing/generation)

- **Max 1 Spring Program + 1 Fall Program per year.** If multiple candidates, keep the longest (multi-month) and reclassify extras as Summer Conference.
- **Short programs (< 30 days) in May–August are Summer Conferences**, even if they start in August. Never categorize by start-month alone — check duration.
- **Summer Conference Introduction Meeting / Check-in Meeting (Group 1/2) are shared per year** (one meeting for all summer conferences combined), not per individual conference. Create once per `(year, meeting_type)`, using the earliest summer conference of that year as the reference date for the lead-time calc.
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
