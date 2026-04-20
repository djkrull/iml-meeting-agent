<objective>
Create a comprehensive Admin User Manual for the IML Meeting Booking System.
The manual should cover every feature available to the admin/meeting coordinator, with step-by-step instructions and screenshots captured using Puppeteer.
Save the final manual as `./docs/admin-manual.md`.
</objective>

<context>
This is a React + Express meeting coordination system for Institut Mittag-Leffler (IML).
The admin interface is the root route (`/`) powered by `src/components/MeetingAgent.jsx`.
The backend runs on Express with SQLite/PostgreSQL.

Read the CLAUDE.md for project conventions. Then read these key files to understand all admin features:
- `src/components/MeetingAgent.jsx` (the full admin UI, ~2389 lines)
- `server/routes/reviews.js` and `server/routes/programs.js` (API endpoints)
- `src/App.js` (routing)

The audience is IML staff who coordinate meeting schedules for research programs.
</context>

<requirements>
The manual must cover ALL of these admin workflows in order:

1. **Getting Started** - Opening the app, overview of the dashboard layout
2. **Uploading Program Data** - Drag-and-drop Excel upload, supported formats, what data is expected
3. **Understanding Auto-Generated Meetings** - Meeting types per program type (Spring/Fall, Summer Conference, Kleindagarna), what gets created automatically
4. **Managing Meetings**
   - Editing dates and times (inline pickers)
   - Editing descriptions
   - Approving/unapproving meetings
   - Understanding status indicators (pending, scheduled, already-scheduled, conflict)
5. **Conflict Detection & Resolution** - How conflicts appear, using auto-resolve, manual resolution
6. **Statistics Dashboard** - What each counter means
7. **Filtering Meetings** - Using program type filters
8. **Director Review Workflow**
   - Creating a shareable review link
   - Syncing meeting changes to director view
   - Monitoring director approvals (auto-refresh)
   - Clearing director reviews
   - Removing duplicates
9. **Exporting Data**
   - Export to Excel
   - Export to ICS/Outlook
10. **Data Management** - Reload from database, clean corrupted meetings, remove duplicates
11. **Troubleshooting** - Common issues and solutions

Each section should have:
- A brief explanation of what the feature does and when to use it
- Numbered step-by-step instructions
- A screenshot showing the relevant UI area
</requirements>

<screenshots>
Use Puppeteer to capture screenshots of the running application.

**Setup:**
1. First, install puppeteer: `npm install --save-dev puppeteer`
2. Start the backend server: `node server/index.js` (runs on port 3001)
3. Start the frontend: run `npx react-scripts start` in background (runs on port 3000)
4. Wait for both to be ready before taking screenshots

**Screenshot script approach:**
Create a script at `./scripts/capture-admin-screenshots.js` that:
- Launches Puppeteer with headless mode
- Navigates to `http://localhost:3000`
- Captures screenshots of each major UI section/state
- Saves images to `./docs/screenshots/admin/`
- Uses descriptive filenames like `01-dashboard-overview.png`, `02-file-upload.png`, etc.

**Screenshot guidelines:**
- Set viewport to 1280x800 for consistent sizing
- Capture full page for overview, element-specific for features
- If the app has no data loaded, create sample data first or capture the empty state and explain it
- Use `page.waitForSelector()` to ensure elements are loaded before capture

**In the manual**, reference screenshots using relative markdown image syntax:
```
![Dashboard Overview](./screenshots/admin/01-dashboard-overview.png)
```
</screenshots>

<output>
Create these files:
- `./docs/admin-manual.md` - The complete admin user manual
- `./scripts/capture-admin-screenshots.js` - Puppeteer screenshot script
- `./docs/screenshots/admin/` - Directory containing all screenshots

The manual should be written in clear, professional English. Use markdown formatting with headers, numbered lists, and image references. Write for someone who has never used the system before.
</output>

<verification>
Before declaring complete:
1. Verify the manual covers all 11 sections listed in requirements
2. Verify screenshot script runs without errors
3. Verify all image references in the manual point to existing files
4. Read through the manual to ensure instructions are accurate based on the actual code
</verification>

<success_criteria>
- Complete admin manual saved to `./docs/admin-manual.md`
- Screenshot script created and functional
- All major admin features documented with step-by-step instructions
- Screenshots captured and referenced correctly in the manual
</success_criteria>
