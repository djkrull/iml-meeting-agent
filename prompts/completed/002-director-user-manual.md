<objective>
Create a brief, concise Director User Manual for the IML Meeting Booking System.
Directors (Tobias Ekholm and Hans Ringstrom) need a quick-reference guide for reviewing and approving meetings.
Save the final manual as `./docs/director-manual.md`.
</objective>

<context>
This is a React + Express meeting coordination system for Institut Mittag-Leffler.
Directors access the system via a shared review link at `/review/:reviewId`.
The director interface is in `src/components/DirectorReviewView.jsx` (~612 lines).

Read the CLAUDE.md for project conventions. Then read:
- `src/components/DirectorReviewView.jsx` (the director UI)
- `server/routes/reviews.js` (approval API endpoints)

The audience is two institute directors who are busy and need minimal instructions.
Keep the manual SHORT - ideally 1-2 pages when printed. Use bullet points over paragraphs.
</context>

<requirements>
The manual should cover ONLY these essentials:

1. **Accessing the Review** (1 paragraph) - How to open the review link, selecting your name
2. **Reviewing Meetings** (brief) - What information is shown for each meeting, what the color codes mean
3. **Approving/Declining Meetings** (the core action) - How to mark attendance, how to add comments, how to change your decision
4. **Seeing Other Director's Decisions** - The blue info box showing the other director's response
5. **Exporting to Outlook** - How to download the .ics file and import into Outlook
6. **Editing Descriptions** (optional feature) - Brief note that descriptions can be edited

Keep each section to 2-4 bullet points maximum. This is a quick-reference card, not a textbook.
</requirements>

<screenshots>
Use Puppeteer to capture 3-5 key screenshots of the director interface.

**Setup:**
1. First, install puppeteer if not already installed: `npm install --save-dev puppeteer`
2. Start the backend server: `node server/index.js` (runs on port 3001)
3. Start the frontend: run `npx react-scripts start` in background (runs on port 3000)
4. Wait for both to be ready

**Screenshot script approach:**
Create a script at `./scripts/capture-director-screenshots.js` that:
- Launches Puppeteer with headless mode
- Navigates to `http://localhost:3000` and creates a review if none exists (POST to `/api/reviews`)
- Then navigates to the review URL `/review/{id}`
- Captures: name selection modal, meeting list, approval buttons, other director's response area
- Saves images to `./docs/screenshots/director/`
- Uses descriptive filenames like `01-name-selection.png`, `02-meeting-card.png`, etc.

**Screenshot guidelines:**
- Set viewport to 1280x800
- Only capture 3-5 screenshots - keep it minimal like the manual
- Focus on the most important UI elements

**In the manual**, reference screenshots:
```
![Meeting Card](./screenshots/director/02-meeting-card.png)
```
</screenshots>

<output>
Create these files:
- `./docs/director-manual.md` - The brief director user manual
- `./scripts/capture-director-screenshots.js` - Puppeteer screenshot script
- `./docs/screenshots/director/` - Directory containing screenshots

The manual must be concise. If a section takes more than 4 bullet points, it's too long. Write in simple, direct language. Avoid jargon.
</output>

<verification>
Before declaring complete:
1. Verify the manual is genuinely brief (under 200 lines of markdown)
2. Verify all 6 sections are covered
3. Verify screenshot references match actual files
4. Read the manual and confirm a busy director could understand it in under 3 minutes
</verification>

<success_criteria>
- Brief director manual saved to `./docs/director-manual.md`
- Manual is under 200 lines of markdown
- Screenshot script created and functional
- All essential director workflows covered in minimal text
</success_criteria>
