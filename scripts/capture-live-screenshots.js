const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const ADMIN_DIR = path.join(__dirname, '..', 'docs', 'screenshots', 'admin');
const DIRECTOR_DIR = path.join(__dirname, '..', 'docs', 'screenshots', 'director');
const LIVE_URL = 'https://iml-meeting-agent.vercel.app';

async function captureLive() {
  fs.mkdirSync(ADMIN_DIR, { recursive: true });
  fs.mkdirSync(DIRECTOR_DIR, { recursive: true });

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // ========== ADMIN SCREENSHOTS ==========
  console.log('Loading live app...');
  await page.goto(LIVE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));

  // 1. Dashboard overview (top of page)
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({
    path: path.join(ADMIN_DIR, '01-dashboard-overview.png'),
    clip: { x: 0, y: 0, width: 1280, height: 900 }
  });
  console.log('Admin: 01-dashboard-overview.png');

  // 2. File upload area (element screenshot)
  const uploadArea = await page.$('[class*="border-dashed"]');
  if (uploadArea) {
    await uploadArea.screenshot({ path: path.join(ADMIN_DIR, '02-file-upload-area.png') });
    console.log('Admin: 02-file-upload-area.png');
  }

  // 3. Statistics dashboard (element screenshot of the stats grid)
  const statsEl = await page.evaluateHandle(() => {
    const grids = document.querySelectorAll('[class*="grid"]');
    for (const g of grids) {
      if (g.innerText.includes('Total Meetings') && g.innerText.includes('Approved')) {
        return g;
      }
    }
    return null;
  });
  if (statsEl.asElement()) {
    await statsEl.asElement().screenshot({
      path: path.join(ADMIN_DIR, '03-statistics-dashboard.png')
    });
    console.log('Admin: 03-statistics-dashboard.png');
  }

  // 4. Full page with all meetings
  await page.screenshot({ path: path.join(ADMIN_DIR, '04-full-meeting-list.png'), fullPage: true });
  console.log('Admin: 04-full-meeting-list.png');

  // 5. Active Programs section (element screenshot)
  const programsEl = await page.evaluateHandle(() => {
    const headings = document.querySelectorAll('h2, h3');
    for (const h of headings) {
      if (h.innerText.includes('Active Programs')) {
        // Return the parent container that includes the program cards
        return h.parentElement;
      }
    }
    return null;
  });
  if (programsEl.asElement()) {
    await programsEl.asElement().scrollIntoView();
    await new Promise(r => setTimeout(r, 500));
    await programsEl.asElement().screenshot({
      path: path.join(ADMIN_DIR, '07-program-overview.png')
    });
    console.log('Admin: 07-program-overview.png');
  }

  // 6. Meeting card with director attendance
  const attendanceCard = await page.evaluateHandle(() => {
    const cards = document.querySelectorAll('[class*="rounded-lg"][class*="shadow"]');
    for (const card of cards) {
      if (card.innerText.includes('Director Attendance')) {
        return card;
      }
    }
    // Fall back to first meeting card with Approve button
    for (const card of cards) {
      if (card.innerText.includes('Approve') &&
          (card.innerText.includes('Meeting') || card.innerText.includes('Check-in'))) {
        return card;
      }
    }
    return null;
  });
  if (attendanceCard.asElement()) {
    await attendanceCard.asElement().scrollIntoView();
    await new Promise(r => setTimeout(r, 500));
    await attendanceCard.asElement().screenshot({
      path: path.join(ADMIN_DIR, '06-meeting-card-detail.png')
    });
    console.log('Admin: 06-meeting-card-detail.png');
  }

  // 7. Filter checkboxes section (element screenshot)
  const filterEl = await page.evaluateHandle(() => {
    const els = document.querySelectorAll('*');
    for (const el of els) {
      if (el.children.length > 0 &&
          el.innerText && el.innerText.indexOf('Filter by Program Type') === 0 &&
          el.querySelector('input[type="checkbox"]')) {
        return el;
      }
    }
    return null;
  });
  if (filterEl.asElement()) {
    await filterEl.asElement().scrollIntoView();
    await new Promise(r => setTimeout(r, 500));
    await filterEl.asElement().screenshot({
      path: path.join(ADMIN_DIR, '08-filter-checkboxes.png')
    });
    console.log('Admin: 08-filter-checkboxes.png');
  }

  // 8. Action buttons area (element screenshot of the buttons row)
  const actionsEl = await page.evaluateHandle(() => {
    const els = document.querySelectorAll('div');
    for (const el of els) {
      const buttons = el.querySelectorAll('button');
      if (buttons.length >= 5) {
        const text = el.innerText;
        if (text.includes('Reload from Database') && text.includes('Share for Director') && text.includes('Export')) {
          return el;
        }
      }
    }
    return null;
  });
  if (actionsEl.asElement()) {
    await actionsEl.asElement().scrollIntoView();
    await new Promise(r => setTimeout(r, 500));
    await actionsEl.asElement().screenshot({
      path: path.join(ADMIN_DIR, '09-action-buttons.png')
    });
    console.log('Admin: 09-action-buttons.png');
  }

  // Remove old conflict screenshot
  try { fs.unlinkSync(path.join(ADMIN_DIR, '05-conflict-warning.png')); } catch(e) {}

  console.log('\n=== Admin screenshots done ===\n');

  // ========== DIRECTOR SCREENSHOTS ==========
  // Use the existing review from earlier capture (already good)
  // Only recapture if we can find a review ID
  const reviewId = await page.evaluate(() => localStorage.getItem('iml-current-review-id'));
  console.log('Review ID:', reviewId || '(none - keeping existing director screenshots)');

  if (reviewId) {
    await page.goto(`${LIVE_URL}/review/${reviewId}`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    await page.screenshot({ path: path.join(DIRECTOR_DIR, '01-name-selection.png') });
    console.log('Director: 01-name-selection.png');

    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Tobias'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 5000));

    await page.screenshot({ path: path.join(DIRECTOR_DIR, '02-meeting-list.png') });
    console.log('Director: 02-meeting-list.png');

    await page.screenshot({ path: path.join(DIRECTOR_DIR, '03-full-meeting-list.png'), fullPage: true });
    console.log('Director: 03-full-meeting-list.png');

    const dirCards = await page.$$('[class*="rounded-lg shadow-lg border-l-4"]');
    if (dirCards.length > 0) {
      await dirCards[0].screenshot({ path: path.join(DIRECTOR_DIR, '04-meeting-card-detail.png') });
      console.log('Director: 04-meeting-card-detail.png');
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 500));

    const headerEl = await page.evaluateHandle(() => {
      const els = document.querySelectorAll('[class*="bg-white rounded-lg shadow-lg"]');
      return els[0] || null;
    });
    if (headerEl.asElement()) {
      await headerEl.asElement().screenshot({
        path: path.join(DIRECTOR_DIR, '05-header-export.png')
      });
      console.log('Director: 05-header-export.png');
    }
  }

  console.log('\nAll done!');
  await browser.close();
}

captureLive();
