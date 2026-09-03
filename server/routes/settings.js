const express = require('express');
const { dbHelpers } = require('../db');

const router = express.Router();

// Never expose the PIN to the client. Send a boolean instead so the editor can
// show whether a PIN is set.
function publicConfig(config) {
  const { settingsPin, ...rest } = config || {};
  return { ...rest, hasPin: !!settingsPin };
}

// --- simple in-memory rate limiting for PIN attempts ----------------------
const pinAttempts = new Map(); // key -> { fails, lockedUntil }
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000; // 5 minutes

function rateKey(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.ip || 'global';
}
function lockedUntil(req) {
  const e = pinAttempts.get(rateKey(req));
  return e && e.lockedUntil && Date.now() < e.lockedUntil ? e.lockedUntil : 0;
}
function recordFail(req) {
  const k = rateKey(req);
  const e = pinAttempts.get(k) || { fails: 0, lockedUntil: 0 };
  e.fails += 1;
  if (e.fails >= MAX_FAILS) { e.lockedUntil = Date.now() + LOCK_MS; e.fails = 0; }
  pinAttempts.set(k, e);
}
function clearFails(req) { pinAttempts.delete(rateKey(req)); }

// Get the app configuration WITHOUT the PIN (public-safe; needed for rosters +
// meeting rules on the dashboard and director link).
router.get('/', async (req, res) => {
  try {
    const config = await dbHelpers.getSettings();
    res.status(200).json({ success: true, config: publicConfig(config) });
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({ error: 'Failed to get settings', details: error.message });
  }
});

// Replace the configuration. Requires the correct PIN in the body (the frontend
// gate is not trusted on its own). Merges over the existing config so a stale or
// partial client can never drop meetingRules / noMeetingPeriods / the PIN.
router.put('/', async (req, res) => {
  try {
    if (lockedUntil(req)) {
      return res.status(429).json({ error: 'För många försök. Försök igen om en stund.' });
    }
    const { config, pin } = req.body;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return res.status(400).json({ error: 'A config object is required' });
    }

    const current = await dbHelpers.getSettings();
    if (pin == null || String(pin) !== String(current.settingsPin || '')) {
      recordFail(req);
      return res.status(401).json({ error: 'Fel PIN.' });
    }
    clearFails(req);

    // Merge: client-editable keys override; the PIN only changes when a non-empty
    // new value is supplied (blank = keep current).
    const newPin = config.settingsPin != null && String(config.settingsPin).trim() !== ''
      ? String(config.settingsPin).trim()
      : current.settingsPin;
    const merged = { ...current, ...config, settingsPin: newPin };
    delete merged.hasPin; // not a real config field
    // activeReviewId is owned by the reviews flow, not the Settings editor. The
    // editor round-trips the whole config, so force the server's current value to
    // stop a stale editor from clobbering / resurrecting an old active review.
    merged.activeReviewId = current.activeReviewId;

    if (!Array.isArray(merged.directors) || !Array.isArray(merged.admins) ||
        !merged.meetingRules || typeof merged.meetingRules !== 'object') {
      return res.status(400).json({ error: 'Ogiltig konfiguration (directors/admins/meetingRules saknas).' });
    }
    // Migrate the old name once: it described the wrong thing (IML is open in
    // summer; it just cannot staff meetings), and single dates could not express
    // a season. Legacy entries are plain date strings and stay valid — the
    // predicate accepts both shapes.
    if (!Array.isArray(merged.noMeetingPeriods)) {
      merged.noMeetingPeriods = current.noMeetingPeriods || current.imlClosedDays || [];
    }
    delete merged.imlClosedDays;

    await dbHelpers.saveSettings(merged);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: 'Failed to save settings', details: error.message });
  }
});

// Verify the shared Settings PIN (rate-limited).
router.post('/verify-pin', async (req, res) => {
  try {
    if (lockedUntil(req)) {
      return res.status(429).json({ ok: false, error: 'För många försök. Försök igen om en stund.' });
    }
    const config = await dbHelpers.getSettings();
    const ok = req.body.pin != null && String(req.body.pin) === String(config.settingsPin || '');
    if (ok) { clearFails(req); return res.status(200).json({ ok: true }); }
    recordFail(req);
    res.status(200).json({ ok: false });
  } catch (error) {
    console.error('Error verifying PIN:', error);
    res.status(500).json({ error: 'Failed to verify PIN', details: error.message });
  }
});

module.exports = router;
