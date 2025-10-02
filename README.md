# IML Meeting Booking Agent

Institut Mittag-Leffler's intelligent meeting coordination system for research programs, summer conferences, and Klein events.

## Features

- 📅 Automatic meeting scheduling based on program timelines
- 📊 Excel export for Outlook integration
- 🔄 Reads program data from Excel files
- 🎯 Handles Spring/Fall programs, Summer conferences, and Klein events
- 📧 Tracks meeting status and approvals

## Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Setup

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. Place your data files in the public folder:
   - `Mote BG Versamhet.xlsx` (Program schedule)

4. Start the development server:
```bash
npm start
```

5. Open http://localhost:3000 in your browser

## Building for Production

```bash
npm run build
```

This creates a build folder with optimized production files.

## File Upload

The app expects the following Excel file to be accessible:
- `Mote BG Versamhet.xlsx` - Contains program start dates and details

Place this file in the public folder or modify the code to allow file upload.

## Meeting Types

### Spring & Fall Programs:
- Introduction Meeting (18 months before)
- Check-in meeting with organizers (6 months before)
- Check-in meeting junior fellows (6 months before, same day)
- Onboarding meeting (Friday after program start)
- Program Start Meeting (Tuesday after program start @ 09:00)
- Mid-term meeting (~6 weeks in)
- Evaluation meeting (April 20+ for Spring, week before end for Fall)

### Summer Conferences:
- Introduction Meetings - Group 1 & 2 (8 months before)
- Check-in Meetings - Group 1 & 2 (3 months before)
- Weekly Onboarding meeting light (Mondays @ 09:30)
- Weekly Welcome Meeting (Mondays @ 10:00)

### Klein Events:
- Meeting with organizer and B&P (4 months before)
- Check-in meeting with Organizer (45 days before)

## Technology Stack

- React 18
- Tailwind CSS
- SheetJS (xlsx) for Excel handling
- Lucide React for icons

## Usage

1. The app automatically loads program data from Excel
2. View suggested meetings in the timeline
3. Approve meetings or mark as scheduled
4. Export to Excel for Outlook import
5. Sync with Projectplace (future feature)

## Configuration

Edit meeting types and timing in `src/components/MeetingAgent.jsx`:
- Modify the `meetingTypes` array
- Adjust `leadTime` values for different timings
- Change participant lists as needed

## Support

For issues or questions, contact IML Administration.

## License

© 2025 Institut Mittag-Leffler. All rights reserved.
