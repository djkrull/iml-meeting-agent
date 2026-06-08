const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const ADMIN_DIR = path.join(__dirname, '..', 'docs', 'screenshots', 'admin');
const DIRECTOR_DIR = path.join(__dirname, '..', 'docs', 'screenshots', 'director');

async function recapture() {
  fs.mkdirSync(ADMIN_DIR, { recursive: true });
  fs.mkdirSync(DIRECTOR_DIR, { recursive: true });

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // ========== ADMIN SCREENSHOTS ==========
  await page.goto('http://localhost:3005', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  // Auto-resolve conflicts first
  const hasConflicts = await page.evaluate(() => {
    return document.body.innerText.includes('Meeting Conflicts Detected');
  });

  if (hasConflicts) {
    console.log('Resolving conflicts...');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Auto-Resolve'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 3000));
  }

  // Check if conflicts are gone
  const stillHasConflicts = await page.evaluate(() => {
    return document.body.innerText.includes('Meeting Conflicts Detected');
  });
  console.log('Conflicts after resolve:', stillHasConflicts);

  // Also approve a few meetings to make it look realistic
  const approveButtons = await page.$$('button');
  let approvedCount = 0;
  for (const btn of approveButtons) {
    const text = await btn.evaluate(el => el.innerText.trim());
    if (text === 'Approve' && approvedCount < 5) {
      await btn.click();
      approvedCount++;
      await new Promise(r => setTimeout(r, 300));
    }
  }
  console.log('Approved', approvedCount, 'meetings for realistic look');
  await new Promise(r => setTimeout(r, 2000));

  // 1. Dashboard overview (top of page, no conflicts)
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({
    path: path.join(ADMIN_DIR, '01-dashboard-overview.png'),
    clip: { x: 0, y: 0, width: 1280, height: 800 }
  });
  console.log('Admin: 01-dashboard-overview.png');

  // 2. File upload area
  const uploadArea = await page.$('[class*="border-dashed"]');
  if (uploadArea) {
    await uploadArea.screenshot({ path: path.join(ADMIN_DIR, '02-file-upload-area.png') });
    console.log('Admin: 02-file-upload-area.png');
  }

  // 3. Statistics dashboard
  // Find the stats row
  await page.screenshot({
    path: path.join(ADMIN_DIR, '03-statistics-dashboard.png'),
    clip: { x: 0, y: 300, width: 1280, height: 200 }
  });
  console.log('Admin: 03-statistics-dashboard.png');

  // 4. Full meeting list
  await page.screenshot({ path: path.join(ADMIN_DIR, '04-full-meeting-list.png'), fullPage: true });
  console.log('Admin: 04-full-meeting-list.png');

  // 5. Programs section - scroll to Active Programs
  const programsHeading = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll('h2, h3'));
    for (const h of headings) {
      if (h.innerText.includes('Active Programs') || h.innerText.includes('Program')) {
        return h.getBoundingClientRect().top + window.scrollY;
      }
    }
    return null;
  });
  if (programsHeading) {
    await page.evaluate((y) => window.scrollTo(0, y - 20), programsHeading);
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({
      path: path.join(ADMIN_DIR, '07-program-overview.png'),
      clip: { x: 0, y: 0, width: 1280, height: 800 }
    });
    console.log('Admin: 07-program-overview.png');
  }

  // 6. Find a meeting card with director attendance (approved meeting)
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 500));

  // Scroll down to find meeting cards
  const meetingCardY = await page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="rounded-lg shadow"]');
    for (const card of cards) {
      const text = card.innerText;
      if ((text.includes('Approved') || text.includes('Approve')) &&
          (text.includes('Introduction') || text.includes('Onboarding') || text.includes('Check-in') || text.includes('Mid-term'))) {
        return card.getBoundingClientRect().top + window.scrollY;
      }
    }
    return null;
  });

  if (meetingCardY) {
    await page.evaluate((y) => window.scrollTo(0, y - 20), meetingCardY);
    await new Promise(r => setTimeout(r, 500));

    const card = await page.$('[class*="rounded-lg shadow"][class*="border-green"], [class*="rounded-lg shadow"][class*="bg-green"]');
    if (card) {
      await card.screenshot({ path: path.join(ADMIN_DIR, '06-meeting-card-detail.png') });
      console.log('Admin: 06-meeting-card-detail.png (approved card)');
    } else {
      // Just take a card from the viewport
      await page.screenshot({
        path: path.join(ADMIN_DIR, '06-meeting-card-detail.png'),
        clip: { x: 0, y: 0, width: 1280, height: 250 }
      });
      console.log('Admin: 06-meeting-card-detail.png (viewport)');
    }
  }

  // 7. Action buttons area
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 500));

  // Find where the action buttons are
  const actionAreaY = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const btn of buttons) {
      if (btn.innerText.includes('Reload from Database') || btn.innerText.includes('Share for Director')) {
        return btn.getBoundingClientRect().top + window.scrollY;
      }
    }
    return 500;
  });

  await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 30)), actionAreaY);
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({
    path: path.join(ADMIN_DIR, '09-action-buttons.png'),
    clip: { x: 0, y: 0, width: 1280, height: 300 }
  });
  console.log('Admin: 09-action-buttons.png');

  // 8. Filter checkboxes
  const filterY = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('label'));
    for (const l of labels) {
      if (l.innerText.includes('Spring Program') || l.innerText.includes('Fall Program')) {
        return l.getBoundingClientRect().top + window.scrollY;
      }
    }
    return null;
  });
  if (filterY) {
    await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 20)), filterY);
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({
      path: path.join(ADMIN_DIR, '08-filter-checkboxes.png'),
      clip: { x: 0, y: 0, width: 1280, height: 150 }
    });
    console.log('Admin: 08-filter-checkboxes.png');
  }

  // Remove old conflict screenshot
  try { fs.unlinkSync(path.join(ADMIN_DIR, '05-conflict-warning.png')); } catch(e) {}

  console.log('\n=== Admin screenshots done ===\n');

  // ========== DIRECTOR SCREENSHOTS ==========
  // Get review ID from localStorage
  const reviewId = await page.evaluate(() => localStorage.getItem('iml-current-review-id'));
  console.log('Review ID from localStorage:', reviewId);

  if (reviewId) {
    await page.goto(`http://localhost:3005/review/${reviewId}`, { waitUntil: 'networkidle2', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    // 1. Name selection
    await page.screenshot({ path: path.join(DIRECTOR_DIR, '01-name-selection.png') });
    console.log('Director: 01-name-selection.png');

    // Select Hans (Director)
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Hans'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 4000));

    // 2. Meeting list
    await page.screenshot({ path: path.join(DIRECTOR_DIR, '02-meeting-list.png') });
    console.log('Director: 02-meeting-list.png');

    // 3. Full list
    await page.screenshot({ path: path.join(DIRECTOR_DIR, '03-full-meeting-list.png'), fullPage: true });
    console.log('Director: 03-full-meeting-list.png');

    // 4. Single meeting card
    const dirCards = await page.$$('[class*="rounded-lg shadow-lg border-l-4"]');
    if (dirCards.length > 0) {
      await dirCards[0].screenshot({ path: path.join(DIRECTOR_DIR, '04-meeting-card-detail.png') });
      console.log('Director: 04-meeting-card-detail.png');
    }

    // 5. Header with export
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({
      path: path.join(DIRECTOR_DIR, '05-header-export.png'),
      clip: { x: 0, y: 0, width: 1280, height: 350 }
    });
    console.log('Director: 05-header-export.png');
  } else {
    console.log('No review ID found, skipping director screenshots (already captured)');
  }

  console.log('\nAll done!');
  await browser.close();
}

recapture();
