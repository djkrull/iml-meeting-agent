const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'docs', 'screenshots', 'admin');
const APP_URL = 'http://localhost:3005';

async function captureAdminScreenshots() {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    // 1. Dashboard overview - top portion with header and upload
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '01-dashboard-overview.png'),
      clip: { x: 0, y: 0, width: 1280, height: 800 }
    });
    console.log('Captured: 01-dashboard-overview.png');

    // 2. File upload area
    const uploadArea = await page.$('[class*="border-dashed"]');
    if (uploadArea) {
      await uploadArea.screenshot({
        path: path.join(SCREENSHOTS_DIR, '02-file-upload-area.png')
      });
      console.log('Captured: 02-file-upload-area.png');
    }

    // 3. Statistics section
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '03-statistics-dashboard.png'),
      clip: { x: 0, y: 300, width: 1280, height: 250 }
    });
    console.log('Captured: 03-statistics-dashboard.png');

    // 4. Full page with all meetings
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '04-full-meeting-list.png'),
      fullPage: true
    });
    console.log('Captured: 04-full-meeting-list.png');

    // 5. Scroll to conflict section if visible
    const conflictSection = await page.$('[class*="border-red"]');
    if (conflictSection) {
      await conflictSection.scrollIntoView();
      await new Promise(r => setTimeout(r, 500));
      await conflictSection.screenshot({
        path: path.join(SCREENSHOTS_DIR, '05-conflict-warning.png')
      });
      console.log('Captured: 05-conflict-warning.png');
    }

    // 6. Scroll to first meeting card
    const meetingCards = await page.$$('[class*="rounded-lg shadow"]');
    if (meetingCards.length > 0) {
      // Find a proper meeting card (not the header)
      for (const card of meetingCards) {
        const text = await card.evaluate(el => el.innerText);
        if (text.includes('Meeting') || text.includes('Check-in') || text.includes('Introduction')) {
          await card.scrollIntoView();
          await new Promise(r => setTimeout(r, 500));
          await card.screenshot({
            path: path.join(SCREENSHOTS_DIR, '06-meeting-card-detail.png')
          });
          console.log('Captured: 06-meeting-card-detail.png');
          break;
        }
      }
    }

    // 7. Program overview section (if programs are loaded)
    const programCards = await page.$$('[class*="bg-white rounded-lg p-4"]');
    if (programCards.length > 0) {
      await programCards[0].scrollIntoView();
      await new Promise(r => setTimeout(r, 500));
      // Capture the program overview area
      const box = await programCards[0].boundingBox();
      if (box) {
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, '07-program-overview.png'),
          clip: { x: 0, y: Math.max(0, box.y - 50), width: 1280, height: 400 }
        });
        console.log('Captured: 07-program-overview.png');
      }
    }

    // 8. Filter section
    const filterSection = await page.$('[class*="flex items-center gap-4"]');
    if (filterSection) {
      const text = await filterSection.evaluate(el => el.innerText);
      if (text.includes('Spring') || text.includes('Fall')) {
        await filterSection.screenshot({
          path: path.join(SCREENSHOTS_DIR, '08-filter-checkboxes.png')
        });
        console.log('Captured: 08-filter-checkboxes.png');
      }
    }

    // 9. Action buttons area (scroll back to top)
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 500));

    // Find the row of action buttons
    const actionButtons = await page.$$('button');
    const buttonTexts = [];
    for (const btn of actionButtons) {
      const text = await btn.evaluate(el => el.innerText.trim());
      buttonTexts.push(text);
    }
    console.log('Found buttons:', buttonTexts.slice(0, 15).join(', '));

    // Capture the action buttons area (just below stats)
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '09-action-buttons.png'),
      clip: { x: 0, y: 480, width: 1280, height: 250 }
    });
    console.log('Captured: 09-action-buttons.png');

    console.log('\nAll admin screenshots captured successfully!');
    console.log('Location:', SCREENSHOTS_DIR);
  } catch (error) {
    console.error('Error capturing screenshots:', error.message);
    try {
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '00-error-state.png'),
        fullPage: true
      });
    } catch (e) {}
  } finally {
    await browser.close();
  }
}

captureAdminScreenshots();
