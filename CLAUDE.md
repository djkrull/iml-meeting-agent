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
- `app_settings` — **single-row** (`id = 1`) JSON config blob: directors, admins, meeting rules, PIN, periods without meetings, active-review pointer. See Configuration below.

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

Directors, admins, the PIN, the periods without meetings, and **all meeting rules** are config, not hardcode. They live in the single-row `app_settings.config` JSON, seeded on first run from [server/defaultSettings.js](server/defaultSettings.js) (which mirrors the values that used to be hardcoded). The old `meetingTypes`/`calculateMeetingDate` constants in `MeetingAgent.jsx` are **gone** — don't reintroduce them.

`config` shape: `{ version, settingsPin, directors[], admins[], noMeetingPeriods[], meetingRules{ <programType>: Rule[] }, activeReviewId }`.
A `Rule` = `{ id, name, anchor:'start'|'end', offset:{amount,unit:'days'|'weeks'|'months',direction:'before'|'after'|'on'}, placement:{mode:'weekday'|'exact', weekday, snap:'forward'|'backward'|'onOrBefore'|'nearest'}, time, duration, participants[], requiresDirectors, recurring, sharedPerYear, group, offsetOverrideFromYear? }`.

- **Seed offsets are stored in DAYS** to reproduce the historical `leadTime` day-offsets exactly (golden-test parity). The Settings UI lets admins switch a rule to months/weeks (which may shift that rule's date a few days — by design, future generation only).
- **`offsetOverrideFromYear`** is the year-gated Intro offset (FP28+/SP29+ = 600d instead of 540d). It's editable + visible in the rule editor — don't make the base offset silently ignored for future years.

### API ([server/routes/settings.js](server/routes/settings.js)) — saved EXPLICITLY, never via the meetings auto-save
- `GET /api/settings` → config **with the PIN stripped** (`hasPin` boolean instead). Public-safe (rosters + rules are needed on the dashboard/director link).
- `PUT /api/settings` → requires the correct PIN in the body (the frontend gate is not trusted on its own), **merges** over the current config (never drops `meetingRules`/`noMeetingPeriods`/PIN/`activeReviewId`), validates shape.
- `POST /api/settings/verify-pin` — rate-limited (locks after 5 fails). PIN is low-security (internal tool) but must never be returned by GET.

### Rule engine ([src/utils/meetingRuleEngine.js](src/utils/meetingRuleEngine.js)) — CommonJS so Node tests + CRA share it
`resolveMeetingDate(rule, start, end, programYear, { isBlocked })`: anchor → offset (local-time month/week/day math) → placement (weekday+snap, or exact) → avoidance of red days and periods without meetings. `generateMeetings` reads rules from the loaded config and calls this. **Golden test [test-rule-parity.js](test-rule-parity.js) must stay green** (seed config reproduces historical dates exactly — run before changing the engine).

### Swedish holidays / periods without meetings ([src/utils/swedishHolidays.js](src/utils/swedishHolidays.js))
`swedishHolidays(year)` (red days incl. movable Easter feasts, midsommar, alla helgons dag, + de-facto-closed eves) and `createIsBlocked(noMeetingPeriods)`. Weekday-placed meetings jump a week (same weekday) until free; exact-placement meetings (Program Start) move to the next available weekday; weekly meetings skip blocked weeks. Unit test: [test-holidays.js](test-holidays.js).

**The config is `noMeetingPeriods`, not "closed days".** IML is rarely closed — the summer conferences run right through July. What happens is that for stretches of the year only one administrator is on site, so meetings cannot be booked while the institute is very much operating. The old name (`imlClosedDays`) invited exactly the wrong conclusion, and the list sat empty in production because IML is, reasonably, not closed. Renamed 2026-09 while the list was still empty, so no migration was needed; `createIsBlocked` still accepts the legacy flat array of date strings, and `PUT /api/settings` migrates the old key once.

Shape: `[{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', label }]`. Ranges, not single days — a summer runs to roughly forty weekdays and listing them one by one made the list unmaintainable.

**Direction is not configured.** A blocked date is stepped over in the direction of the rule's own `snap`, which is what makes long periods behave: a check-in (`snap: 'onOrBefore'`) lands *before* the summer rather than being shoved to a fortnight before the program starts, while an onboarding (`snap: 'forward'`) moves past it.

### Identity ([src/components/IdentityGate.jsx](src/components/IdentityGate.jsx))
Admin dashboard and the director link both gate behind a name picker (roster from config). localStorage stores the **stable id**, not the name (rename-safe). "Remember me" optional. Admins also appear in the director-review picker (tagged Administratör) and mark attendance — see Approvals below.

### Approvals: role + rename-safety
- `addApproval`/`clearApproval` match an existing row by **`attendee_id` first** (rename-safe), falling back to display name + backfilling the id — so renaming a director/admin in Settings never duplicates or orphans their response.
- **Only `role='director'` responses gate a meeting's approved/CONFIRMED status.** `role='admin'` is attendance only and is excluded from every approval count (backend `overallStatus`/`/status`, dashboard counts) and from `meeting.approvals` on the dashboard. Admins still show in the reviewer view + the .ics "Attending" line.

### Meeting identity — `meeting.id` is NOT unique (don't regress)
Changing a meeting's date INSERTS a new `program_meetings` row (the unique constraint is `(program_name, type, date)`) that **reuses the same `meeting_id`**. Until the stale row is deleted, two different meetings share one id. Never answer "is this the same meeting?" with `a.id === b.id`.

Use [src/utils/meetingIdentity.js](src/utils/meetingIdentity.js) — `meetingKey(m)` = `program|type|localDate|time`, plus `localDateKey`/`dateFromKey` for the local-day conversion. Regression test: [test-meeting-identity.js](test-meeting-identity.js).

### Inline date/time editing — commit ONCE, never per keystroke (don't regress)
`MeetingScheduleEditor` in [MeetingAgent.jsx](src/components/MeetingAgent.jsx) holds the typed date/time in **local draft state** and commits once, when editing ends (Spara / Enter / focus leaving the editor; Esc discards). It must never write to `meetings` on `onChange`. The old per-keystroke version was unusable *and* corrupted production (fixed 2026-08):

- **The field lost focus mid-typing.** Every partial value went into `meetings`; `filteredMeetings` re-sorts by date, so React *moved* the card's DOM node, which blurs the focused `<input>` and slams the native date picker shut before you can finish clicking.
- **The editor unmounted mid-typing.** `filteredMeetings` also drops meetings before today. A year typed digit by digit passes through `0002`/`0020`/`0202` — all in the past — so the whole card disappeared before the year was done.
- **Junk rows in `program_meetings`.** Each keystroke POSTed the schedule, and the upsert key is `(program_name, type, date)`, so every half-typed date became a permanent row reusing the same `meeting_id`. Six had to be cleaned out of production — e.g. Quantum Fields "Check-in meeting junior fellows" existed on 14 Aug / 1 Sep / 14 Sep / 15 Sep, the middle two being nothing but the keystrokes between "14" and "15".
- **`new Date('YYYY-MM-DD')` parses as UTC midnight**, so editor-written rows landed at 02:00 Stockholm while rule-engine rows sit at local midnight — a handy fingerprint when hunting these rows, and the reason the editor uses `dateFromKey`.
- Date and time commit **together in one pass** (`applyScheduleChange`). Both are part of `meetingKey`, so writing them separately leaves the second pass matching a key that no longer exists — the second field silently lost.
- The timeline's React `key` is `meetingKey(meeting)`, **not** `meeting.id`: duplicate keys make the reconciler reuse the wrong card, open editor and all.

Regression test: [test-schedule-edit.js](test-schedule-edit.js).

### `src/utils/*.js` must not use syntax that needs a Babel helper
These utils are CommonJS so Node tests and CRA share them. Babel lowers **object spread** (`{ ...m }`), `async`/`await` and friends to an `@babel/runtime` helper and **injects an ESM `import`** for it. That flips the file to ESM, `module.exports` stops counting as named exports, and the CRA build fails with `Attempted import error: 'localDateKey' is not exported from '../utils/meetingIdentity'` — pointing at the *importer*, not the real cause. Use `Object.assign({}, a, b)` instead. Plain destructuring is fine under the current browserslist.

Three symptoms this caused on the dashboard (all fixed 2026-08, all traced to the HT2026 duplicate):
- **Approvals on the wrong card** — the review merge matched on `program_name + type` only and took `.find()`'s first hit, so a moved meeting inherited the *old* date's approvals and displayed "2/2 directors" for answers nobody gave. The merge now also compares the local date.
- **TIME CONFLICT badge on an unrelated meeting** — `isConflictingMeeting` compared ids; flagging one meeting flagged everything sharing that id. Also `autoResolveConflicts` used `findIndex(m => m.id === ...)` and could move the wrong meeting.
- **Dates off by one day** — conflict grouping used `date.toISOString().split('T')[0]`, i.e. the UTC day. A meeting at Stockholm-local midnight stores as 22:00Z (CEST) / 23:00Z (CET) the *previous* day, so Friday 28 Aug rendered as Thursday 27 Aug.

### Official Outlook invitation status
`program_meetings.invitation_sent_at` / `_by` / `_for_date` / `_for_time`, toggled by `POST /api/programs/invitation` → `dbHelpers.setInvitationSent`. Read via `invitationStatus(m)` in [meetingIdentity.js](src/utils/meetingIdentity.js), shared by the dashboard and the director view.

- **Its own columns, not another `status` value.** Whether the invitation went out is a fact about the outside world, independent of the internal planning consensus — a meeting can be agreed but not invited, or invited and then questioned. Folding it into `status` makes the states mutually exclusive again.
- **`_for_date`/`_for_time` record WHAT was invited.** If the meeting moves afterwards, the invitation sitting in people's calendars is now wrong — `invitationStatus` reports `stale` and the card turns amber. That silent-wrong-invitation case is the whole point; never let a moved meeting keep a plain green tick.
- **Its own endpoint, never the meetings auto-save**, and deliberately **excluded from `scheduleSignature`** — otherwise a stale tab could clobber a shared fact. `savePrograms`' `ON CONFLICT DO UPDATE` leaves these columns alone, but every INSERT path (`savePrograms`, `replaceFutureMeetings`) carries them, or "Regenerera" would wipe the status.
- **Directors see it read-only**, enriched live in `GET /api/reviews/:id` from `program_meetings` rather than copied into the review — a review shared before the invitation went out would otherwise show "not sent" forever. Matched on the Stockholm-local day, falling back to `(program_name, type)` when that is unambiguous, and the route also sends `invitationCurrentDate`/`Time`: the per-review copy can lag behind the schedule, and comparing against the copy would report "not changed" for a meeting that has in fact moved.
- `Mark Scheduled` / `status='scheduled'` are **gone** (they were unused — 0 rows in production — and overlapped this). `Already Scheduled` remains, relabelled "Bokad utanför verktyget": it means booked outside this tool, clears `approved`, and hides the meeting from the director review.

### Regenerate
"Regenerera" on the dashboard recomputes future meeting dates from current rules, shows a diff, and applies via `POST /api/programs/replace-meetings` — a **transactional delete-future-then-insert** so a date-shifted meeting can't leave a stale duplicate under the `(program_name, type, date)` unique constraint. Past meetings are preserved.

### Active-review pointer
Creating/updating a review records `activeReviewId` in config; `GET /api/reviews/active` lets any admin device converge on the latest shared review instead of a stale localStorage id.

### Auto-save clobber gotcha (don't regress)
The dashboard auto-saves to `program_meetings` (upsert) on state change. A stale tab can silently overwrite out-of-band edits, so: the 30s approval refresh must NOT trigger a save unless approval data actually changed; tabs re-sync meeting times on focus; and **Settings/regenerate use their own endpoints**, never the meetings auto-save.

**The auto-save sends only CHANGED rows** (`changedMeetings`/`scheduleSignature` in [meetingIdentity.js](src/utils/meetingIdentity.js), diffed against `serverScheduleRef` — what the server is known to hold, seeded on load/reload/regenerate and updated after each save and focus re-sync). Don't go back to POSTing the whole array: the backend upserts everything it's handed, so a full payload made *any* state change a full rewrite of the schedule from that tab's copy.

That is how four deleted meetings came back on 2026-08-13. The user had two dashboard windows open from before an edit. Re-pointing a review row made the read-only 30s approval poll find "new" responses; it updated `meetings` purely so the cards could render them, and the auto-save pushed the whole stale array — re-inserting rows that had just been deleted. **Approval-derived fields (`approved`, `approvals`, `adminApprovals`, `approvedCount`, `rejectedCount`, `reviewMeetingId`) are excluded from `scheduleSignature` on purpose** — they're re-derived from the review on every refresh, so including them would make that read-only poll write again. Deliberate approve/schedule toggles also move `status`, so they still persist.

The focus re-sync also **drops local rows the server no longer has** — but only when the row's signature matches the snapshot, proving the server once held that exact row. Otherwise an unsaved local edit would be thrown away.

### A date change must MOVE the row, not upsert a second one
`POST /api/programs/move-meeting` → `dbHelpers.moveMeeting` (transactional: delete whatever occupies the target slot, then UPDATE the source row onto it; the row keeps its `meeting_id`). The inline editor calls it whenever the date changes.

Without it the plain save only upserts, and the unique key is `(program_name, type, date)` — so every date edit inserted a second row and orphaned the old one. Fixing the per-keystroke editor cut this from one duplicate *per keystroke* to one *per date change*; the move endpoint is what actually closes it. `moved: 0` means the caller's `fromDate` matched nothing (stale client) — the normal upsert then inserts the row and there was no stale row to clean up.

### SQLite and Postgres must save with the SAME semantics
Both branches of `savePrograms` now UPSERT. The SQLite branch used to `DELETE FROM program_meetings` and re-insert the whole payload, which made local dev behave nothing like production — and would have wiped the dev database once the dashboard started sending partial payloads. SQLite init therefore creates `program_meetings_unique_idx` / `programs_unique_idx` (deduplicating first). A plain `CREATE UNIQUE INDEX` is **correct for SQLite** (`ON CONFLICT(cols)` targets columns); only Postgres needs a real named CONSTRAINT. Don't harmonise those two.

## Business rules (enforce in parsing/generation)

- **Max 1 Spring Program + 1 Fall Program per year.** If multiple candidates, keep the longest (multi-month) and reclassify extras as Summer Conference.
- **Short programs (< 30 days) in May–August are Summer Conferences**, even if they start in August. Never categorize by start-month alone — check duration.
- **Summer Conference Introduction Meeting / Check-in Meeting (Group 1/2) are shared per year** (one meeting for all summer conferences combined), not per individual conference. Create once per `(year, meeting_type)`, using the earliest summer conference of that year as the reference date for the lead-time calc.
- **Summer Conference Group 1 / Group 2 meeting times: morning + afternoon split.** Both the Introduction Meeting and the Check-in Meeting must run **Group 1 at 11:00 (förmiddag)** and **Group 2 at 15:00 (eftermiddag)** — never back-to-back. The afternoon slot for Group 2 lets overseas organizers (e.g. USA) join during their morning. This is the seeded default in [server/defaultSettings.js](server/defaultSettings.js) (`meetingRules['Summer Conference']`) and is now editable in Settings → Mötesregler; it must hold for all future years (2028+). (Fixed 2026-06-17: 2026 Introduction Meeting Group 2 had regressed to 11:30; restored to 15:00.)
- **Onboarding meeting + Program Start Meeting come AFTER program start** (policy from Sofie Upmark, 2026-08 — applies to both Spring and Fall). Onboarding = **first Friday after** program start; Program Start Meeting = **first Tuesday after** program start, held in connection with the first seminar. Both are `offset: after(1 day)` + weekday placement (Fri / Tue, snap forward) — the +1 day makes "after" strict, so a program starting on a Friday/Tuesday gets the *following* one, not its own start date. Historically these were 5 days *before* start (snapped to Friday) and exactly *on* the start date; [test-rule-parity.js](test-rule-parity.js) records the divergence in its `OLD` table. **The TIME is not part of the rule** — Sofie: "anpassas efter seminarieschemat" — set it per program.
- **Weekly meetings (Welcome, Onboarding light) must generate for all program types**, not only Summer Conferences. Spring/Fall programs run weekly cycles throughout their duration (cap at 52 weeks; Summer at 2 weeks).
- **Cyclical time inheritance**: when generating meetings for year N, look up the previous year's meeting with the same `(programType, meetingType)` and inherit its time. The anchor is the **TYPE** (Spring / Fall / Summer Conference / Kleindagarna), NOT the program name — names change year to year; types cycle. **Gotcha**: `program_meetings` only holds *future* rows, so the earliest program of a type has no previous year to inherit from and falls back to the rule's `time`. Check the rule's default time before regenerating, or a manually-set time gets overwritten.

## Placeholder / filtering rules

- Placeholder program detection: check program **NAME only** (`'Title'`, `'TBD'`, `'Unnamed Program'`). **Never the organizer field.** "Specialkonferens" with organizer "Organizer" is a legitimate Swedish conference name with a TBD organizer — don't delete it.
- Memorial events: filter by name containing `'minneshögtid'`.
- Normalize program names: strip trailing `\r\n` / whitespace. CSV parsing preserved them and the resulting name difference leaked duplicates past the unique constraint.

## Excel/CSV upload

- CSV from the user: Latin-1 encoding, semicolon separators, multi-line quoted fields.
- Swedish column headers: `År`, `Datum`, `Program`, `Organisatörer`, `Bekräftad`.
- Swedish natural-language date strings: `"11 februari - 22 maj"`, `"1-5 juni"`.
- `csv-to-excel.js` converts the user's CSV to the Excel format the frontend upload expects.
