const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'docs', 'screenshots', 'director');
const APP_URL = 'http://localhost:3005';
const API_URL = 'http://localhost:8080';

async function captureDirectorScreenshots() {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  try {
    // Try to get an existing review
    let reviewId;
    try {
      const response = await fetch(`${API_URL}/api/programs`);
      if (response.ok) {
        const data = await response.json();
        console.log('Programs found:', data.programs?.length || 0);
      }
    } catch (e) {
      console.log('Could not check programs');
    }

    // Check for existing reviews in the database
    // We'll navigate to a review URL - use a stored review ID or create one
    // First try to create a review from the admin page
    await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    // Check if there's a "Share for Review" button and click it
    const shareButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b => b.innerText.includes('Share for Review') || b.innerText.includes('Share'));
    });

    if (shareButton && shareButton.asElement()) {
      await shareButton.asElement().click();
      await new Promise(r => setTimeout(r, 2000));

      // Try to find the review URL in a modal or input
      const reviewUrlText = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input[readonly], input[type="text"]');
        for (const input of inputs) {
          if (input.value && input.value.includes('/review/')) {
            return input.value;
          }
        }
        // Check for any text containing /review/
        const allText = document.body.innerText;
        const match = allText.match(/\/review\/([a-f0-9-]+)/);
        return match ? match[0] : null;
      });

      if (reviewUrlText) {
        const match = reviewUrlText.match(/\/review\/([a-f0-9-]+)/);
        if (match) {
          reviewId = match[1];
          console.log('Found review ID:', reviewId);
        }
      }

      // Close modal if open
      const closeBtn = await page.$('[class*="modal"] button, [class*="close"]');
      if (closeBtn) await closeBtn.click();
      await new Promise(r => setTimeout(r, 500));
    }

    // If we still don't have a review, check localStorage
    if (!reviewId) {
      reviewId = await page.evaluate(() => localStorage.getItem('iml-current-review-id'));
      if (reviewId) console.log('Found review ID in localStorage:', reviewId);
    }

    if (!reviewId) {
      console.log('No review found. Using a sample review URL.');
      reviewId = 'sample-review';
    }

    // Navigate to director review page
    await page.goto(`${APP_URL}/review/${reviewId}`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // 1. Name selection screen
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '01-name-selection.png'),
      fullPage: false
    });
    console.log('Captured: 01-name-selection.png');

    // 2. Select director name
    const directorButtons = await page.$$('button');
    let clicked = false;
    for (const btn of directorButtons) {
      const text = await btn.evaluate(el => el.innerText);
      if (text.includes('Tobias') || text.includes('Ekholm')) {
        await btn.click();
        clicked = true;
        break;
      }
    }

    if (clicked) {
      await new Promise(r => setTimeout(r, 3000));

      // 2. Meeting list overview
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '02-meeting-list.png'),
        fullPage: false
      });
      console.log('Captured: 02-meeting-list.png');

      // 3. Full meeting list
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '03-full-meeting-list.png'),
        fullPage: true
      });
      console.log('Captured: 03-full-meeting-list.png');

      // 4. Single meeting card detail
      const meetingCards = await page.$$('[class*="rounded-lg shadow-lg border-l-4"]');
      if (meetingCards.length > 0) {
        await meetingCards[0].screenshot({
          path: path.join(SCREENSHOTS_DIR, '04-meeting-card-detail.png')
        });
        console.log('Captured: 04-meeting-card-detail.png');
      }

      // 5. Header with export button
      await page.evaluate(() => window.scrollTo(0, 0));
      await new Promise(r => setTimeout(r, 500));
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '05-header-export.png'),
        clip: { x: 0, y: 0, width: 1280, height: 350 }
      });
      console.log('Captured: 05-header-export.png');
    }

    console.log('\nAll director screenshots captured successfully!');
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

captureDirectorScreenshots();
