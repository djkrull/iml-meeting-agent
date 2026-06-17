const express = require('express');
const { dbHelpers } = require('../db');

const router = express.Router();

// Get the full app configuration (directors, admins, meeting rules, etc.)
router.get('/', async (req, res) => {
  try {
    const config = await dbHelpers.getSettings();
    res.status(200).json({ success: true, config });
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({ error: 'Failed to get settings', details: error.message });
  }
});

// Replace the full app configuration. Explicit save (PIN-gated in the UI) — this
// is deliberately separate from the meetings auto-save so a stale tab can never
// clobber settings.
router.put('/', async (req, res) => {
  try {
    const { config } = req.body;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return res.status(400).json({ error: 'A config object is required' });
    }
    await dbHelpers.saveSettings(config);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: 'Failed to save settings', details: error.message });
  }
});

// Verify the shared Settings PIN.
router.post('/verify-pin', async (req, res) => {
  try {
    const { pin } = req.body;
    const config = await dbHelpers.getSettings();
    const ok = pin != null && String(pin) === String(config.settingsPin || '');
    res.status(200).json({ ok });
  } catch (error) {
    console.error('Error verifying PIN:', error);
    res.status(500).json({ error: 'Failed to verify PIN', details: error.message });
  }
});

module.exports = router;
