const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');
const { buildDefaultConfig } = require('./defaultSettings');

// Determine which database to use
const USE_POSTGRES = !!process.env.DATABASE_URL;

let db;
let pool;

if (USE_POSTGRES) {
  // PostgreSQL for production (Railway)
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('Using PostgreSQL database');
  console.log('Database host:', process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'configured');
  initializePostgresDatabase();
} else {
  // SQLite for local development
  const DB_PATH = path.join(__dirname, 'reviews.db');
  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Error opening database:', err);
    } else {
      console.log('Connected to SQLite database');
      initializeSQLiteDatabase();
    }
  });
}

// Ensure a proper UNIQUE CONSTRAINT exists on a table. Drops any matching
// plain UNIQUE INDEX first (indexes can't be used with ON CONFLICT ON CONSTRAINT).
async function ensureUniqueConstraint(poolInstance, table, name, columnsSql) {
  try {
    const check = await poolInstance.query(
      `SELECT 1 FROM pg_constraint WHERE conname = $1`, [name]
    );
    if (check.rows.length > 0) {
      console.log(`Constraint ${name} already exists`);
      return;
    }

    // Drop any plain index with the same name (leftover from older deployments)
    await poolInstance.query(`DROP INDEX IF EXISTS ${name}`);

    // Remove duplicate rows before adding the constraint
    if (table === 'programs') {
      await poolInstance.query(`
        DELETE FROM programs a USING programs b
        WHERE a.id > b.id AND a.name = b.name AND a.type = b.type AND COALESCE(a.year, 0) = COALESCE(b.year, 0)
      `);
    } else if (table === 'program_meetings') {
      await poolInstance.query(`
        DELETE FROM program_meetings a USING program_meetings b
        WHERE a.id > b.id AND a.program_name = b.program_name AND a.type = b.type AND a.date = b.date
      `);
    }

    await poolInstance.query(
      `ALTER TABLE ${table} ADD CONSTRAINT ${name} UNIQUE ${columnsSql}`
    );
    console.log(`Added UNIQUE CONSTRAINT ${name} on ${table}`);
  } catch (err) {
    console.error(`Failed to ensure constraint ${name}:`, err.message);
    throw err;
  }
}

// Seed the single app_settings row with defaults if it doesn't exist yet.
// Idempotent: only inserts when row id=1 is missing, so existing config is never
// overwritten on restart/redeploy.
async function ensureAppSettingsPostgres() {
  try {
    const existing = await pool.query('SELECT 1 FROM app_settings WHERE id = 1');
    if (existing.rowCount === 0) {
      await pool.query(
        'INSERT INTO app_settings (id, config, updated_at) VALUES (1, $1::jsonb, now())',
        [JSON.stringify(buildDefaultConfig())]
      );
      console.log('Seeded app_settings with default configuration');
    }
  } catch (err) {
    console.error('Failed to ensure app_settings:', err.message);
  }
}

// Create tables for PostgreSQL
async function initializePostgresDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        expires_at TIMESTAMP,
        status TEXT DEFAULT 'active'
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS meetings (
        id SERIAL PRIMARY KEY,
        review_id TEXT NOT NULL,
        meeting_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        program_name TEXT NOT NULL,
        program_type TEXT NOT NULL,
        program_year INTEGER,
        program_organizer TEXT,
        date TIMESTAMP NOT NULL,
        time TEXT NOT NULL,
        duration INTEGER NOT NULL,
        participants JSONB NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        requires_directors INTEGER DEFAULT 1,
        FOREIGN KEY (review_id) REFERENCES reviews(id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS approvals (
        id SERIAL PRIMARY KEY,
        meeting_id INTEGER NOT NULL,
        director_name TEXT NOT NULL,
        status TEXT NOT NULL,
        comment TEXT,
        suggested_date TEXT,
        suggested_time TEXT,
        timestamp TIMESTAMP NOT NULL,
        role TEXT DEFAULT 'director',
        attendee_id TEXT,
        FOREIGN KEY (meeting_id) REFERENCES meetings(id)
      )
    `);

    // Tables for persistent program and meeting storage
    await pool.query(`
      CREATE TABLE IF NOT EXISTS programs (
        id SERIAL PRIMARY KEY,
        program_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP,
        organizer TEXT,
        status TEXT,
        year INTEGER,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS program_meetings (
        id SERIAL PRIMARY KEY,
        meeting_id INTEGER NOT NULL,
        program_id TEXT,
        program_name TEXT NOT NULL,
        program_type TEXT NOT NULL,
        program_year INTEGER,
        program_organizer TEXT,
        type TEXT NOT NULL,
        date TIMESTAMP NOT NULL,
        time TEXT NOT NULL,
        duration INTEGER NOT NULL,
        participants JSONB NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        approved BOOLEAN DEFAULT false,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      )
    `);

    // Migration: Add new columns if they don't exist
    try {
      await pool.query(`
        ALTER TABLE meetings
        ADD COLUMN IF NOT EXISTS program_year INTEGER,
        ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS program_organizer TEXT
      `);
      console.log('PostgreSQL schema migration completed');
    } catch (migrationError) {
      console.log('Migration note:', migrationError.message);
    }

    // Migration: approvals gains a reviewer role + stable attendee id.
    try {
      await pool.query(`
        ALTER TABLE approvals
        ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'director',
        ADD COLUMN IF NOT EXISTS attendee_id TEXT
      `);
      console.log('approvals role/attendee_id migration completed');
    } catch (migrationError) {
      console.log('Migration note (approvals):', migrationError.message);
    }

    // Migration: Change program_id from INTEGER to TEXT in existing table
    try {
      await pool.query(`
        ALTER TABLE program_meetings
        ALTER COLUMN program_id TYPE TEXT
      `);
      console.log('Changed program_id to TEXT type');
    } catch (migrationError) {
      console.log('Migration note (program_id):', migrationError.message);
    }

    // Migration: "official invitation sent in Outlook" tracking.
    //
    // Deliberately its own set of columns rather than another `status` value:
    // whether the invitation went out is a fact about the outside world, not
    // about the internal planning consensus, and the two are independent (a
    // meeting can be agreed but not yet invited). Folding it into `status`
    // would make the states mutually exclusive again.
    //
    // sent_for_date/time record WHAT was invited, so a later date change can be
    // detected and flagged — an invitation that silently became wrong is the
    // real risk in this workflow.
    try {
      await pool.query(`
        ALTER TABLE program_meetings
        ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS invitation_sent_by TEXT,
        ADD COLUMN IF NOT EXISTS invitation_sent_for_date TIMESTAMP,
        ADD COLUMN IF NOT EXISTS invitation_sent_for_time TEXT
      `);
      console.log('invitation tracking migration completed');
    } catch (migrationError) {
      console.log('Migration note (invitation):', migrationError.message);
    }

    // Migration: Ensure unique CONSTRAINTS exist (not just indexes).
    // ON CONFLICT ON CONSTRAINT requires an actual named CONSTRAINT, not a plain
    // UNIQUE INDEX — this caused silent INSERT failures in production previously.
    // Constraint excludes 'time' on purpose: same meeting on same date at different times
    // is treated as the SAME meeting (prevents duplicate rows when times shift due to
    // user edits or upload regeneration).
    await ensureUniqueConstraint(pool, 'program_meetings', 'program_meetings_unique_idx',
      '(program_name, type, date)');
    await ensureUniqueConstraint(pool, 'programs', 'programs_unique_idx',
      '(name, type, year)');

    // Single-row app configuration (directors, admins, meeting rules, etc.)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY,
        config JSONB NOT NULL,
        updated_at TIMESTAMP NOT NULL
      )
    `);
    await ensureAppSettingsPostgres();

    console.log('PostgreSQL tables initialized');
  } catch (error) {
    console.error('Error initializing PostgreSQL:', error);
  }
}

// Create tables for SQLite
function initializeSQLiteDatabase() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        status TEXT DEFAULT 'active'
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_id TEXT NOT NULL,
        meeting_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        program_name TEXT NOT NULL,
        program_type TEXT NOT NULL,
        program_year INTEGER,
        program_organizer TEXT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        duration INTEGER NOT NULL,
        participants TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        requires_directors INTEGER DEFAULT 1,
        FOREIGN KEY (review_id) REFERENCES reviews(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS approvals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meeting_id INTEGER NOT NULL,
        director_name TEXT NOT NULL,
        status TEXT NOT NULL,
        comment TEXT,
        suggested_date TEXT,
        suggested_time TEXT,
        timestamp TEXT NOT NULL,
        role TEXT DEFAULT 'director',
        attendee_id TEXT,
        FOREIGN KEY (meeting_id) REFERENCES meetings(id)
      )
    `);
    // Best-effort migration for existing local DBs (ignore "duplicate column").
    db.run(`ALTER TABLE approvals ADD COLUMN role TEXT DEFAULT 'director'`, () => {});
    db.run(`ALTER TABLE approvals ADD COLUMN attendee_id TEXT`, () => {});

    // Tables for persistent program and meeting storage
    db.run(`
      CREATE TABLE IF NOT EXISTS programs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        program_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT,
        organizer TEXT,
        status TEXT,
        year INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS program_meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meeting_id INTEGER NOT NULL,
        program_id TEXT,
        program_name TEXT NOT NULL,
        program_type TEXT NOT NULL,
        program_year INTEGER,
        program_organizer TEXT,
        type TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        duration INTEGER NOT NULL,
        participants TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        approved INTEGER DEFAULT 0,
        invitation_sent_at TEXT,
        invitation_sent_by TEXT,
        invitation_sent_for_date TEXT,
        invitation_sent_for_time TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Same invitation columns for databases created before the feature.
    // SQLite has no ADD COLUMN IF NOT EXISTS; the error on an existing column
    // is expected and ignored.
    ['invitation_sent_at', 'invitation_sent_by', 'invitation_sent_for_date', 'invitation_sent_for_time']
      .forEach(col => db.run(`ALTER TABLE program_meetings ADD COLUMN ${col} TEXT`, () => {}));

    // Same uniqueness as production, so local dev can upsert instead of
    // wipe-and-reinsert. Deduplicate first or the index can't be created.
    //
    // A plain UNIQUE INDEX is correct HERE: SQLite's `ON CONFLICT(cols) DO
    // UPDATE` targets columns, not a constraint name. Postgres is the one that
    // needs a real named CONSTRAINT (see ensureUniqueConstraint) — don't
    // "harmonise" these two into the same thing.
    db.run(`DELETE FROM program_meetings WHERE id NOT IN (
              SELECT MIN(id) FROM program_meetings GROUP BY program_name, type, date)`);
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS program_meetings_unique_idx
              ON program_meetings(program_name, type, date)`);
    db.run(`DELETE FROM programs WHERE id NOT IN (
              SELECT MIN(id) FROM programs GROUP BY name, type, year)`);
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS programs_unique_idx
              ON programs(name, type, year)`);

    // Single-row app configuration (directors, admins, meeting rules, etc.)
    db.run(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY,
        config TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `, () => {
      // Seed defaults only if the row is missing (idempotent).
      db.get('SELECT 1 FROM app_settings WHERE id = 1', (err, row) => {
        if (!err && !row) {
          db.run(
            'INSERT INTO app_settings (id, config, updated_at) VALUES (1, ?, ?)',
            [JSON.stringify(buildDefaultConfig()), new Date().toISOString()],
            (insErr) => {
              if (insErr) console.error('Failed to seed app_settings (SQLite):', insErr.message);
              else console.log('Seeded app_settings with default configuration (SQLite)');
            }
          );
        }
      });
    });

    console.log('SQLite tables initialized');
  });
}

// Helper functions
const dbHelpers = {
  // Get the single app_settings config (seeds defaults if missing).
  getSettings: () => {
    return new Promise(async (resolve, reject) => {
      try {
        if (USE_POSTGRES) {
          await ensureAppSettingsPostgres();
          const result = await pool.query('SELECT config FROM app_settings WHERE id = 1');
          if (result.rows.length === 0) return resolve(buildDefaultConfig());
          const cfg = result.rows[0].config;
          resolve(typeof cfg === 'string' ? JSON.parse(cfg) : cfg);
        } else {
          db.get('SELECT config FROM app_settings WHERE id = 1', (err, row) => {
            if (err) return reject(err);
            if (!row) return resolve(buildDefaultConfig());
            try { resolve(JSON.parse(row.config)); }
            catch (e) { reject(e); }
          });
        }
      } catch (err) {
        reject(err);
      }
    });
  },

  // Overwrite the single app_settings config (explicit save — never via auto-save).
  saveSettings: (config) => {
    return new Promise(async (resolve, reject) => {
      try {
        const json = JSON.stringify(config);
        if (USE_POSTGRES) {
          await pool.query(
            `INSERT INTO app_settings (id, config, updated_at) VALUES (1, $1::jsonb, now())
             ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = EXCLUDED.updated_at`,
            [json]
          );
          resolve({ success: true });
        } else {
          db.run(
            `INSERT INTO app_settings (id, config, updated_at) VALUES (1, ?, ?)
             ON CONFLICT(id) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at`,
            [json, new Date().toISOString()],
            (err) => err ? reject(err) : resolve({ success: true })
          );
        }
      } catch (err) {
        reject(err);
      }
    });
  },

  // Read the "active review" pointer — which director review the admin view
  // should show approvals for. Stored inside the single app_settings config blob
  // so it survives across devices (it previously lived ONLY in one browser's
  // localStorage, so only the device that clicked "Share" ever saw approvals).
  // Returns null if none set.
  getActiveReviewId: () => {
    return new Promise(async (resolve, reject) => {
      try {
        const cfg = await dbHelpers.getSettings();
        resolve(cfg && cfg.activeReviewId ? cfg.activeReviewId : null);
      } catch (err) {
        reject(err);
      }
    });
  },

  // Persist the "active review" pointer. Called whenever a review is created or
  // updated (Share for Director Review / Sync All to Directors) so every admin
  // device can fall back to it. Read-modify-write of the full config keeps
  // directors / admins / meetingRules / PIN intact.
  setActiveReviewId: (reviewId) => {
    return new Promise(async (resolve, reject) => {
      try {
        const cfg = await dbHelpers.getSettings();
        cfg.activeReviewId = reviewId;
        await dbHelpers.saveSettings(cfg);
        resolve({ success: true });
      } catch (err) {
        reject(err);
      }
    });
  },

  // Replace all FUTURE program_meetings with the provided list, transactionally.
  // Used by "Regenerate": date-shifted meetings would otherwise leave stale rows
  // (the unique constraint includes `date`, and the normal save only upserts), so
  // we delete future rows first, then insert the regenerated set. Past rows and the
  // approvals table (which references the separate `meetings` table) are untouched.
  replaceFutureMeetings: (meetings) => {
    return new Promise(async (resolve, reject) => {
      const now = new Date().toISOString();
      const list = Array.isArray(meetings) ? meetings : [];
      if (USE_POSTGRES) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          // Delete future rows using the Stockholm-local date (double cast).
          await client.query(
            `DELETE FROM program_meetings
             WHERE (date AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Stockholm')::date
                   >= (now() AT TIME ZONE 'Europe/Stockholm')::date`
          );
          for (const m of list) {
            const meetingDate = typeof m.date === 'string' ? m.date : m.date.toISOString();
            await client.query(
              `INSERT INTO program_meetings (meeting_id, program_id, program_name, program_type, program_year, program_organizer, type, date, time, duration, participants, description, status, approved, created_at, updated_at, invitation_sent_at, invitation_sent_by, invitation_sent_for_date, invitation_sent_for_time)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
               ON CONFLICT ON CONSTRAINT program_meetings_unique_idx
               DO UPDATE SET time = EXCLUDED.time, duration = EXCLUDED.duration,
                 participants = EXCLUDED.participants, description = EXCLUDED.description,
                 status = EXCLUDED.status, approved = EXCLUDED.approved,
                 program_organizer = EXCLUDED.program_organizer, updated_at = EXCLUDED.updated_at`,
              [m.id, m.programId, m.programName, m.programType, m.programYear, m.programOrganizer,
               m.type, meetingDate, m.time, m.duration, JSON.stringify(m.participants),
               m.description, m.status || 'pending', m.approved || false, now, now,
               m.invitationSentAt || null, m.invitationSentBy || null,
               m.invitationSentForDate || null, m.invitationSentForTime || null]
            );
          }
          await client.query('COMMIT');
          resolve({ replaced: list.length });
        } catch (err) {
          await client.query('ROLLBACK');
          reject(err);
        } finally {
          client.release();
        }
      } else {
        // SQLite (local dev): dates stored as ISO (UTC); compare to local midnight.
        const todayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
        db.serialize(() => {
          db.run('DELETE FROM program_meetings WHERE date >= ?', [todayIso], (delErr) => {
            if (delErr) return reject(delErr);
            const stmt = db.prepare(
              `INSERT INTO program_meetings (meeting_id, program_id, program_name, program_type, program_year, program_organizer, type, date, time, duration, participants, description, status, approved, created_at, updated_at, invitation_sent_at, invitation_sent_by, invitation_sent_for_date, invitation_sent_for_time)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );
            list.forEach(m => {
              const meetingDate = typeof m.date === 'string' ? m.date : m.date.toISOString();
              stmt.run(m.id, m.programId, m.programName, m.programType, m.programYear, m.programOrganizer,
                m.type, meetingDate, m.time, m.duration, JSON.stringify(m.participants),
                m.description, m.status || 'pending', m.approved ? 1 : 0, now, now,
                m.invitationSentAt || null, m.invitationSentBy || null,
                m.invitationSentForDate || null, m.invitationSentForTime || null);
            });
            stmt.finalize((finErr) => finErr ? reject(finErr) : resolve({ replaced: list.length }));
          });
        });
      }
    });
  },

  // Move ONE meeting to a new date/time, transactionally.
  //
  // The normal save only ever upserts, and the unique constraint is
  // (program_name, type, date) — so changing a date INSERTS a second row and
  // leaves the old one behind, reusing the same meeting_id. Every date edit
  // produced a duplicate that way (see "Meeting identity" in CLAUDE.md).
  //
  // Deletes whatever already occupies the target slot, then moves the source row
  // onto it, so a date change can neither leave a duplicate nor become one. The
  // row keeps its meeting_id. Returns { moved } — 0 means the caller's `fromDate`
  // matched nothing, in which case the normal upsert will insert the row and
  // there was no stale row to clean up anyway.
  moveMeeting: ({ programName, type, fromDate, toDate, time }) => {
    return new Promise(async (resolve, reject) => {
      const now = new Date().toISOString();
      if (USE_POSTGRES) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          // Clear the target slot first so the UPDATE can't hit the constraint.
          // `date <> $4` protects the source row when only the time changes.
          await client.query(
            `DELETE FROM program_meetings
              WHERE program_name = $1 AND type = $2 AND date = $3 AND date <> $4`,
            [programName, type, toDate, fromDate]
          );
          const res = await client.query(
            `UPDATE program_meetings
                SET date = $3, time = $4, updated_at = $5
              WHERE program_name = $1 AND type = $2 AND date = $6`,
            [programName, type, toDate, time, now, fromDate]
          );
          await client.query('COMMIT');
          resolve({ moved: res.rowCount });
        } catch (err) {
          await client.query('ROLLBACK');
          reject(err);
        } finally {
          client.release();
        }
      } else {
        db.serialize(() => {
          db.run(
            `DELETE FROM program_meetings
              WHERE program_name = ? AND type = ? AND date = ? AND date <> ?`,
            [programName, type, toDate, fromDate],
            (delErr) => {
              if (delErr) return reject(delErr);
              db.run(
                `UPDATE program_meetings
                    SET date = ?, time = ?, updated_at = ?
                  WHERE program_name = ? AND type = ? AND date = ?`,
                [toDate, time, now, programName, type, fromDate],
                function (updErr) {
                  if (updErr) return reject(updErr);
                  resolve({ moved: this.changes });
                }
              );
            }
          );
        });
      }
    });
  },

  // Mark (or unmark) that the official Outlook invitation has gone out.
  //
  // Has its own endpoint rather than riding the meetings auto-save, for the same
  // reason Settings does: the auto-save is driven by one tab's copy of the whole
  // schedule, and this is a shared fact that must not be clobbered by a stale
  // tab. The save's ON CONFLICT deliberately leaves these columns alone.
  //
  // When marking, we also record WHICH date/time was invited, so a later change
  // can be flagged instead of silently leaving an incorrect invitation out there.
  setInvitationSent: ({ programName, type, date, sent, byId, forTime }) => {
    return new Promise(async (resolve, reject) => {
      const now = new Date().toISOString();
      const sql = USE_POSTGRES
        ? `UPDATE program_meetings
              SET invitation_sent_at = $4, invitation_sent_by = $5,
                  invitation_sent_for_date = $6, invitation_sent_for_time = $7,
                  updated_at = $8
            WHERE program_name = $1 AND type = $2 AND date = $3`
        : `UPDATE program_meetings
              SET invitation_sent_at = ?, invitation_sent_by = ?,
                  invitation_sent_for_date = ?, invitation_sent_for_time = ?,
                  updated_at = ?
            WHERE program_name = ? AND type = ? AND date = ?`;

      const sentAt = sent ? now : null;
      const sentBy = sent ? (byId || null) : null;
      const forDate = sent ? date : null;
      const forTimeVal = sent ? (forTime || null) : null;

      try {
        if (USE_POSTGRES) {
          const res = await pool.query(sql,
            [programName, type, date, sentAt, sentBy, forDate, forTimeVal, now]);
          resolve({ updated: res.rowCount, invitationSentAt: sentAt, invitationSentBy: sentBy });
        } else {
          db.run(sql, [sentAt, sentBy, forDate, forTimeVal, now, programName, type, date],
            function (err) {
              if (err) return reject(err);
              resolve({ updated: this.changes, invitationSentAt: sentAt, invitationSentBy: sentBy });
            });
        }
      } catch (err) {
        reject(err);
      }
    });
  },

  // Create new review
  createReview: (reviewId, createdBy) => {
    return new Promise(async (resolve, reject) => {
      const createdAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      if (USE_POSTGRES) {
        try {
          await pool.query(
            'INSERT INTO reviews (id, created_by, created_at, expires_at) VALUES ($1, $2, $3, $4)',
            [reviewId, createdBy, createdAt, expiresAt]
          );
          resolve({ id: reviewId, createdAt, expiresAt });
        } catch (err) {
          reject(err);
        }
      } else {
        db.run(
          'INSERT INTO reviews (id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?)',
          [reviewId, createdBy, createdAt, expiresAt],
          function(err) {
            if (err) reject(err);
            else resolve({ id: reviewId, createdAt, expiresAt });
          }
        );
      }
    });
  },

  // Update existing review with new meetings (preserves approvals)
  updateReview: (reviewId, meetings) => {
    return new Promise(async (resolve, reject) => {
      if (USE_POSTGRES) {
        try {
          console.log(`[UPDATE REVIEW] Updating review ${reviewId} with ${meetings.length} meetings (preserving approvals)`);

          // Get existing meetings in this review
          const existingMeetings = await pool.query(
            'SELECT id, program_name, type FROM meetings WHERE review_id = $1',
            [reviewId]
          );

          const existingMap = new Map();
          existingMeetings.rows.forEach(m => {
            const key = `${m.program_name}|||${m.type}`;
            existingMap.set(key, m.id);
          });

          const updatedCount = { updated: 0, inserted: 0 };

          // Update or insert each meeting
          for (const meeting of meetings) {
            const key = `${meeting.programName}|||${meeting.type}`;
            const existingId = existingMap.get(key);

            const dateStr = typeof meeting.date === 'string'
              ? meeting.date
              : meeting.date.toISOString();

            if (existingId) {
              // Update existing meeting (preserves approvals)
              await pool.query(
                `UPDATE meetings
                 SET date = $1, time = $2, description = $3, duration = $4, participants = $5
                 WHERE id = $6`,
                [dateStr, meeting.time, meeting.description, meeting.duration,
                 JSON.stringify(meeting.participants), existingId]
              );
              updatedCount.updated++;
              existingMap.delete(key); // Mark as processed
            } else {
              // Insert new meeting
              await dbHelpers.addMeeting(reviewId, meeting);
              updatedCount.inserted++;
            }
          }

          // Delete meetings that no longer exist in admin data
          // (only if they have no approvals - don't delete meetings directors responded to)
          for (const [key, meetingId] of existingMap) {
            const approvalCount = await pool.query(
              'SELECT COUNT(*) as count FROM approvals WHERE meeting_id = $1',
              [meetingId]
            );

            if (approvalCount.rows[0].count === 0) {
              await pool.query('DELETE FROM meetings WHERE id = $1', [meetingId]);
              console.log(`[UPDATE REVIEW] Deleted obsolete meeting (no approvals): ${key}`);
            } else {
              console.log(`[UPDATE REVIEW] Kept meeting with approvals: ${key}`);
            }
          }

          // Update the review's timestamp
          await pool.query(
            'UPDATE reviews SET created_at = $1 WHERE id = $2',
            [new Date().toISOString(), reviewId]
          );

          console.log(`[UPDATE REVIEW] Updated ${updatedCount.updated} meetings, inserted ${updatedCount.inserted} new meetings`);
          console.log(`[UPDATE REVIEW] ✅ All approvals preserved!`);
          resolve({ id: reviewId, updated: true, ...updatedCount });
        } catch (err) {
          console.error('[UPDATE REVIEW] Error:', err);
          reject(err);
        }
      } else {
        // SQLite version
        db.serialize(() => {
          db.run('DELETE FROM meetings WHERE review_id = ?', [reviewId], async (err) => {
            if (err) {
              reject(err);
              return;
            }

            try {
              for (const meeting of meetings) {
                await dbHelpers.addMeeting(reviewId, meeting);
              }

              db.run(
                'UPDATE reviews SET created_at = ? WHERE id = ?',
                [new Date().toISOString(), reviewId],
                (err) => {
                  if (err) reject(err);
                  else resolve({ id: reviewId, updated: true });
                }
              );
            } catch (err) {
              reject(err);
            }
          });
        });
      }
    });
  },

  // Add meeting to review
  addMeeting: (reviewId, meeting) => {
    return new Promise(async (resolve, reject) => {
      const dateStr = typeof meeting.date === 'string'
        ? meeting.date
        : meeting.date.toISOString();

      if (USE_POSTGRES) {
        try {
          const result = await pool.query(
            `INSERT INTO meetings (review_id, meeting_id, type, program_name, program_type, program_year, program_organizer, date, time, duration, participants, description, status, requires_directors)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
            [
              reviewId,
              meeting.id,
              meeting.type,
              meeting.programName,
              meeting.programType,
              meeting.programYear || null,
              meeting.programOrganizer || null,
              dateStr,
              meeting.time,
              meeting.duration,
              JSON.stringify(meeting.participants),
              meeting.description,
              meeting.status || 'pending',
              meeting.requiresDirectors || 1
            ]
          );
          resolve({ id: result.rows[0].id });
        } catch (err) {
          reject(err);
        }
      } else {
        db.run(
          `INSERT INTO meetings (review_id, meeting_id, type, program_name, program_type, program_year, program_organizer, date, time, duration, participants, description, status, requires_directors)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            reviewId,
            meeting.id,
            meeting.type,
            meeting.programName,
            meeting.programType,
            meeting.programYear || null,
            meeting.programOrganizer || null,
            dateStr,
            meeting.time,
            meeting.duration,
            JSON.stringify(meeting.participants),
            meeting.description,
            meeting.status || 'pending',
            meeting.requiresDirectors || 1
          ],
          function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID });
          }
        );
      }
    });
  },

  // Get review with meetings
  getReview: (reviewId) => {
    return new Promise(async (resolve, reject) => {
      if (USE_POSTGRES) {
        try {
          const reviewResult = await pool.query('SELECT * FROM reviews WHERE id = $1', [reviewId]);
          if (reviewResult.rows.length === 0) {
            return reject(new Error('Review not found'));
          }
          const review = reviewResult.rows[0];

          const meetingsResult = await pool.query('SELECT * FROM meetings WHERE review_id = $1 ORDER BY date, time', [reviewId]);

          const meetingsWithApprovals = await Promise.all(meetingsResult.rows.map(async (meeting) => {
            const approvalsResult = await pool.query('SELECT * FROM approvals WHERE meeting_id = $1', [meeting.id]);
            return {
              ...meeting,
              participants: typeof meeting.participants === 'string' ? JSON.parse(meeting.participants) : meeting.participants,
              approvals: approvalsResult.rows
            };
          }));

          resolve({
            ...review,
            meetings: meetingsWithApprovals
          });
        } catch (err) {
          reject(err);
        }
      } else {
        db.get('SELECT * FROM reviews WHERE id = ?', [reviewId], (err, review) => {
          if (err) {
            reject(err);
          } else if (!review) {
            reject(new Error('Review not found'));
          } else {
            db.all('SELECT * FROM meetings WHERE review_id = ? ORDER BY date, time', [reviewId], (err, meetings) => {
              if (err) {
                reject(err);
              } else {
                const meetingsWithApprovals = meetings.map(meeting => {
                  return new Promise((res, rej) => {
                    db.all('SELECT * FROM approvals WHERE meeting_id = ?', [meeting.id], (err, approvals) => {
                      if (err) rej(err);
                      else {
                        res({
                          ...meeting,
                          participants: JSON.parse(meeting.participants),
                          approvals: approvals
                        });
                      }
                    });
                  });
                });

                Promise.all(meetingsWithApprovals)
                  .then(completeMeetings => {
                    resolve({
                      ...review,
                      meetings: completeMeetings
                    });
                  })
                  .catch(reject);
              }
            });
          }
        });
      }
    });
  },

  // Add or update approval
  addApproval: (meetingId, directorName, status, comment, suggestedDate, suggestedTime, role, attendeeId) => {
    return new Promise(async (resolve, reject) => {
      const timestamp = new Date().toISOString();
      const role0 = role || 'director';
      // Match an existing response by the stable attendee id when available
      // (rename-safe); fall back to the display name for legacy rows.
      const byId = attendeeId != null && attendeeId !== '';
      const aid = byId ? attendeeId : null;

      try {
        if (USE_POSTGRES) {
          // Look up an existing response by stable id first (rename-safe), then
          // fall back to display name so PRE-MIGRATION rows (attendee_id NULL) are
          // updated + backfilled instead of duplicated.
          let existingId = null;
          if (byId) {
            const r = await pool.query('SELECT id FROM approvals WHERE meeting_id = $1 AND attendee_id = $2', [meetingId, attendeeId]);
            if (r.rows.length > 0) existingId = r.rows[0].id;
          }
          if (existingId == null) {
            const r = await pool.query('SELECT id FROM approvals WHERE meeting_id = $1 AND director_name = $2', [meetingId, directorName]);
            if (r.rows.length > 0) existingId = r.rows[0].id;
          }
          if (existingId != null) {
            await pool.query(
              `UPDATE approvals SET status = $1, comment = $2, suggested_date = $3, suggested_time = $4, timestamp = $5, director_name = $6, role = $7, attendee_id = COALESCE($8, attendee_id) WHERE id = $9`,
              [status, comment, suggestedDate, suggestedTime, timestamp, directorName, role0, aid, existingId]
            );
            resolve({ id: existingId, updated: true });
          } else {
            const result = await pool.query(
              `INSERT INTO approvals (meeting_id, director_name, status, comment, suggested_date, suggested_time, timestamp, role, attendee_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
              [meetingId, directorName, status, comment, suggestedDate, suggestedTime, timestamp, role0, aid]
            );
            resolve({ id: result.rows[0].id, updated: false });
          }
        } else {
          const getOne = (sql, params) => new Promise((res, rej) => db.get(sql, params, (e, row) => e ? rej(e) : res(row)));
          const run = (sql, params) => new Promise((res, rej) => db.run(sql, params, function (e) { e ? rej(e) : res(this); }));
          let existing = null;
          if (byId) existing = await getOne('SELECT id, attendee_id FROM approvals WHERE meeting_id = ? AND attendee_id = ?', [meetingId, attendeeId]);
          if (!existing) existing = await getOne('SELECT id, attendee_id FROM approvals WHERE meeting_id = ? AND director_name = ?', [meetingId, directorName]);
          if (existing) {
            await run(
              `UPDATE approvals SET status = ?, comment = ?, suggested_date = ?, suggested_time = ?, timestamp = ?, director_name = ?, role = ?, attendee_id = ? WHERE id = ?`,
              [status, comment, suggestedDate, suggestedTime, timestamp, directorName, role0, (aid != null ? aid : existing.attendee_id || null), existing.id]
            );
            resolve({ id: existing.id, updated: true });
          } else {
            const r = await run(
              `INSERT INTO approvals (meeting_id, director_name, status, comment, suggested_date, suggested_time, timestamp, role, attendee_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [meetingId, directorName, status, comment, suggestedDate, suggestedTime, timestamp, role0, aid]
            );
            resolve({ id: r.lastID, updated: false });
          }
        }
      } catch (err) {
        reject(err);
      }
    });
  },

  // Clear/delete a reviewer's approval for a specific meeting. Matches by the
  // stable attendee id when provided (rename-safe), else by display name.
  clearApproval: (meetingId, directorName, attendeeId) => {
    return new Promise(async (resolve, reject) => {
      const byId = attendeeId != null && attendeeId !== '';
      if (USE_POSTGRES) {
        try {
          const result = await pool.query(
            byId
              ? 'DELETE FROM approvals WHERE meeting_id = $1 AND attendee_id = $2'
              : 'DELETE FROM approvals WHERE meeting_id = $1 AND director_name = $2',
            [meetingId, byId ? attendeeId : directorName]
          );
          console.log(`[DB] Cleared approval (${byId ? 'id ' + attendeeId : 'name ' + directorName}) on meeting ${meetingId}`);
          resolve({ deleted: result.rowCount });
        } catch (err) {
          reject(err);
        }
      } else {
        db.run(
          byId
            ? 'DELETE FROM approvals WHERE meeting_id = ? AND attendee_id = ?'
            : 'DELETE FROM approvals WHERE meeting_id = ? AND director_name = ?',
          [meetingId, byId ? attendeeId : directorName],
          function(err) {
            if (err) reject(err);
            else {
              console.log(`[DB] Cleared approval (${byId ? 'id ' + attendeeId : 'name ' + directorName}) on meeting ${meetingId}`);
              resolve({ deleted: this.changes });
            }
          }
        );
      }
    });
  },

  // Clear ALL approvals for a specific meeting
  clearAllApprovalsForMeeting: (meetingId) => {
    return new Promise(async (resolve, reject) => {
      if (USE_POSTGRES) {
        try {
          const result = await pool.query(
            'DELETE FROM approvals WHERE meeting_id = $1',
            [meetingId]
          );
          console.log(`[DB] Cleared all approvals for meeting ${meetingId} (${result.rowCount} deleted)`);
          resolve({ deleted: result.rowCount });
        } catch (err) {
          reject(err);
        }
      } else {
        db.run(
          'DELETE FROM approvals WHERE meeting_id = ?',
          [meetingId],
          function(err) {
            if (err) reject(err);
            else {
              console.log(`[DB] Cleared all approvals for meeting ${meetingId} (${this.changes} deleted)`);
              resolve({ deleted: this.changes });
            }
          }
        );
      }
    });
  },

  // Update meeting description
  updateMeetingDescription: (meetingId, description) => {
    return new Promise(async (resolve, reject) => {
      if (USE_POSTGRES) {
        try {
          const result = await pool.query(
            'UPDATE meetings SET description = $1 WHERE id = $2',
            [description, meetingId]
          );
          resolve({ id: meetingId, changes: result.rowCount });
        } catch (err) {
          reject(err);
        }
      } else {
        db.run(
          'UPDATE meetings SET description = ? WHERE id = ?',
          [description, meetingId],
          function(err) {
            if (err) reject(err);
            else resolve({ id: meetingId, changes: this.changes });
          }
        );
      }
    });
  },

  // Update meeting details (time, date, description)
  updateMeetingDetails: (meetingId, updates) => {
    return new Promise(async (resolve, reject) => {
      const fields = [];
      const values = [];
      let paramIndex = 1;

      // Build dynamic UPDATE query based on provided fields
      if (updates.description !== undefined) {
        fields.push(USE_POSTGRES ? `description = $${paramIndex}` : 'description = ?');
        values.push(updates.description);
        paramIndex++;
      }
      if (updates.time !== undefined) {
        fields.push(USE_POSTGRES ? `time = $${paramIndex}` : 'time = ?');
        values.push(updates.time);
        paramIndex++;
      }
      if (updates.date !== undefined) {
        const dateStr = typeof updates.date === 'string' ? updates.date : updates.date.toISOString();
        fields.push(USE_POSTGRES ? `date = $${paramIndex}` : 'date = ?');
        values.push(dateStr);
        paramIndex++;
      }

      if (fields.length === 0) {
        return reject(new Error('No fields to update'));
      }

      values.push(meetingId);
      const query = `UPDATE meetings SET ${fields.join(', ')} WHERE id = ${USE_POSTGRES ? `$${paramIndex}` : '?'}`;

      if (USE_POSTGRES) {
        try {
          const result = await pool.query(query, values);
          resolve({ id: meetingId, changes: result.rowCount });
        } catch (err) {
          reject(err);
        }
      } else {
        db.run(query, values, function(err) {
          if (err) reject(err);
          else resolve({ id: meetingId, changes: this.changes });
        });
      }
    });
  },

  // Update meeting in review by meeting_id (the original meeting ID from MeetingAgent)
  updateMeetingByMeetingId: (reviewId, meetingId, updates) => {
    return new Promise(async (resolve, reject) => {
      const fields = [];
      const values = [];
      let paramIndex = 1;

      // Build dynamic UPDATE query based on provided fields
      if (updates.description !== undefined) {
        fields.push(USE_POSTGRES ? `description = $${paramIndex}` : 'description = ?');
        values.push(updates.description);
        paramIndex++;
      }
      if (updates.time !== undefined) {
        fields.push(USE_POSTGRES ? `time = $${paramIndex}` : 'time = ?');
        values.push(updates.time);
        paramIndex++;
      }
      if (updates.date !== undefined) {
        const dateStr = typeof updates.date === 'string' ? updates.date : updates.date.toISOString();
        fields.push(USE_POSTGRES ? `date = $${paramIndex}` : 'date = ?');
        values.push(dateStr);
        paramIndex++;
      }

      if (fields.length === 0) {
        return reject(new Error('No fields to update'));
      }

      values.push(reviewId, meetingId);
      const query = `UPDATE meetings SET ${fields.join(', ')} WHERE review_id = ${USE_POSTGRES ? `$${paramIndex}` : '?'} AND meeting_id = ${USE_POSTGRES ? `$${paramIndex + 1}` : '?'}`;

      if (USE_POSTGRES) {
        try {
          const result = await pool.query(query, values);
          resolve({ changes: result.rowCount });
        } catch (err) {
          reject(err);
        }
      } else {
        db.run(query, values, function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        });
      }
    });
  },

  // Get meeting by characteristics (program_name + type) with approvals
  getMeetingByCharacteristics: (reviewId, programName, meetingType) => {
    return new Promise(async (resolve, reject) => {
      try {
        if (USE_POSTGRES) {
          // Try exact match first
          let meetingResult = await pool.query(
            'SELECT * FROM meetings WHERE review_id = $1 AND program_name = $2 AND type = $3',
            [reviewId, programName, meetingType]
          );

          // If no exact match, try case-insensitive and trimmed match
          if (meetingResult.rows.length === 0) {
            console.log('[DB] Exact match failed, trying case-insensitive match...');
            meetingResult = await pool.query(
              'SELECT * FROM meetings WHERE review_id = $1 AND LOWER(TRIM(program_name)) = LOWER(TRIM($2)) AND LOWER(TRIM(type)) = LOWER(TRIM($3))',
              [reviewId, programName, meetingType]
            );
          }

          if (meetingResult.rows.length === 0) {
            console.log(`[DB] No meeting found for program="${programName}" type="${meetingType}"`);
            return resolve(null);
          }

          const meeting = meetingResult.rows[0];
          const approvalsResult = await pool.query('SELECT * FROM approvals WHERE meeting_id = $1', [meeting.id]);

          resolve({
            ...meeting,
            approvals: approvalsResult.rows
          });
        } else {
          // SQLite - try exact match first
          db.get(
            'SELECT * FROM meetings WHERE review_id = ? AND program_name = ? AND type = ?',
            [reviewId, programName, meetingType],
            (err, meeting) => {
              if (err) return reject(err);

              if (!meeting) {
                // Try case-insensitive match
                db.get(
                  'SELECT * FROM meetings WHERE review_id = ? AND LOWER(TRIM(program_name)) = LOWER(TRIM(?)) AND LOWER(TRIM(type)) = LOWER(TRIM(?))',
                  [reviewId, programName, meetingType],
                  (err2, meeting2) => {
                    if (err2) return reject(err2);
                    if (!meeting2) {
                      console.log(`[DB] No meeting found for program="${programName}" type="${meetingType}"`);
                      return resolve(null);
                    }

                    db.all('SELECT * FROM approvals WHERE meeting_id = ?', [meeting2.id], (err3, approvals) => {
                      if (err3) return reject(err3);
                      resolve({
                        ...meeting2,
                        approvals: approvals || []
                      });
                    });
                  }
                );
              } else {
                db.all('SELECT * FROM approvals WHERE meeting_id = ?', [meeting.id], (err, approvals) => {
                  if (err) return reject(err);
                  resolve({
                    ...meeting,
                    approvals: approvals || []
                  });
                });
              }
            }
          );
        }
      } catch (err) {
        reject(err);
      }
    });
  },

  // Update meeting in review by characteristics (program_name + type)
  updateMeetingByCharacteristics: (reviewId, programName, meetingType, updates) => {
    return new Promise(async (resolve, reject) => {
      const fields = [];
      const values = [];
      let paramIndex = 1;

      // Build dynamic UPDATE query based on provided fields
      if (updates.description !== undefined) {
        fields.push(USE_POSTGRES ? `description = $${paramIndex}` : 'description = ?');
        values.push(updates.description);
        paramIndex++;
      }
      if (updates.time !== undefined) {
        fields.push(USE_POSTGRES ? `time = $${paramIndex}` : 'time = ?');
        values.push(updates.time);
        paramIndex++;
      }
      if (updates.date !== undefined) {
        const dateStr = typeof updates.date === 'string' ? updates.date : updates.date.toISOString();
        fields.push(USE_POSTGRES ? `date = $${paramIndex}` : 'date = ?');
        values.push(dateStr);
        paramIndex++;
      }

      if (fields.length === 0) {
        return reject(new Error('No fields to update'));
      }

      values.push(reviewId, programName, meetingType);
      const query = `UPDATE meetings SET ${fields.join(', ')} WHERE review_id = ${USE_POSTGRES ? `$${paramIndex}` : '?'} AND program_name = ${USE_POSTGRES ? `$${paramIndex + 1}` : '?'} AND type = ${USE_POSTGRES ? `$${paramIndex + 2}` : '?'}`;

      if (USE_POSTGRES) {
        try {
          // Try exact match first
          let result = await pool.query(query, values);

          // If no rows updated, try case-insensitive match
          if (result.rowCount === 0) {
            console.log('[DB UPDATE] Exact match updated 0 rows, trying case-insensitive match...');
            const caseInsensitiveQuery = `UPDATE meetings SET ${fields.join(', ')} WHERE review_id = $${paramIndex} AND LOWER(TRIM(program_name)) = LOWER(TRIM($${paramIndex + 1})) AND LOWER(TRIM(type)) = LOWER(TRIM($${paramIndex + 2}))`;
            result = await pool.query(caseInsensitiveQuery, values);
          }

          console.log(`[DB UPDATE] Updated ${result.rowCount} row(s) for program="${programName}" type="${meetingType}"`);
          resolve({ changes: result.rowCount, matched: programName, type: meetingType });
        } catch (err) {
          reject(err);
        }
      } else {
        db.run(query, values, function(err) {
          if (err) return reject(err);

          const changes = this.changes;
          if (changes === 0) {
            // Try case-insensitive match
            const caseInsensitiveQuery = `UPDATE meetings SET ${fields.join(', ')} WHERE review_id = ? AND LOWER(TRIM(program_name)) = LOWER(TRIM(?)) AND LOWER(TRIM(type)) = LOWER(TRIM(?))`;
            db.run(caseInsensitiveQuery, values, function(err2) {
              if (err2) return reject(err2);
              console.log(`[DB UPDATE] Updated ${this.changes} row(s) for program="${programName}" type="${meetingType}"`);
              resolve({ changes: this.changes, matched: programName, type: meetingType });
            });
          } else {
            console.log(`[DB UPDATE] Updated ${changes} row(s) for program="${programName}" type="${meetingType}"`);
            resolve({ changes: changes, matched: programName, type: meetingType });
          }
        });
      }
    });
  },

  // Remove duplicate meetings from a review (keeps oldest, removes newer duplicates)
  deduplicateMeetings: (reviewId) => {
    return new Promise(async (resolve, reject) => {
      try {
        if (USE_POSTGRES) {
          // Get all meetings for this review
          const result = await pool.query(
            'SELECT id, program_name, type, date, time FROM meetings WHERE review_id = $1 ORDER BY id',
            [reviewId]
          );

          const meetings = result.rows;
          const seen = new Map();
          const toDelete = [];

          // Track which meetings are duplicates
          meetings.forEach(meeting => {
            const key = `${meeting.program_name}|||${meeting.type}`;
            if (seen.has(key)) {
              // This is a duplicate - mark for deletion
              toDelete.push(meeting.id);
            } else {
              // First occurrence - keep it
              seen.set(key, meeting.id);
            }
          });

          // Delete duplicates
          if (toDelete.length > 0) {
            // First delete approvals for duplicate meetings
            await pool.query('DELETE FROM approvals WHERE meeting_id = ANY($1)', [toDelete]);
            // Then delete the duplicate meetings
            await pool.query('DELETE FROM meetings WHERE id = ANY($1)', [toDelete]);
          }

          resolve({
            removed: toDelete.length,
            remaining: meetings.length - toDelete.length
          });
        } else {
          // SQLite
          db.all('SELECT id, program_name, type, date, time FROM meetings WHERE review_id = ? ORDER BY id', [reviewId], (err, meetings) => {
            if (err) return reject(err);

            const seen = new Map();
            const toDelete = [];

            // Track which meetings are duplicates
            meetings.forEach(meeting => {
              const key = `${meeting.program_name}|||${meeting.type}`;
              if (seen.has(key)) {
                // This is a duplicate - mark for deletion
                toDelete.push(meeting.id);
              } else {
                // First occurrence - keep it
                seen.set(key, meeting.id);
              }
            });

            if (toDelete.length === 0) {
              return resolve({ removed: 0, remaining: meetings.length });
            }

            // Delete approvals first
            const placeholders = toDelete.map(() => '?').join(',');
            db.run(`DELETE FROM approvals WHERE meeting_id IN (${placeholders})`, toDelete, (err) => {
              if (err) return reject(err);

              // Then delete duplicate meetings
              db.run(`DELETE FROM meetings WHERE id IN (${placeholders})`, toDelete, function(err) {
                if (err) return reject(err);
                resolve({
                  removed: toDelete.length,
                  remaining: meetings.length - toDelete.length
                });
              });
            });
          });
        }
      } catch (err) {
        reject(err);
      }
    });
  },

  // Clear all approvals from a specific director for a review
  clearDirectorApprovals: (reviewId, directorName) => {
    return new Promise(async (resolve, reject) => {
      if (USE_POSTGRES) {
        try {
          // Get all meetings for this review
          const meetingsResult = await pool.query(
            'SELECT id FROM meetings WHERE review_id = $1',
            [reviewId]
          );

          if (meetingsResult.rows.length === 0) {
            return resolve({ deletedCount: 0 });
          }

          const meetingIds = meetingsResult.rows.map(m => m.id);

          // Delete all approvals from this director for these meetings
          const result = await pool.query(
            'DELETE FROM approvals WHERE meeting_id = ANY($1) AND director_name = $2',
            [meetingIds, directorName]
          );

          resolve({ deletedCount: result.rowCount });
        } catch (err) {
          reject(err);
        }
      } else {
        // Get all meetings for this review
        db.all('SELECT id FROM meetings WHERE review_id = ?', [reviewId], (err, meetings) => {
          if (err) {
            reject(err);
          } else if (meetings.length === 0) {
            resolve({ deletedCount: 0 });
          } else {
            const meetingIds = meetings.map(m => m.id);
            const placeholders = meetingIds.map(() => '?').join(',');

            db.run(
              `DELETE FROM approvals WHERE meeting_id IN (${placeholders}) AND director_name = ?`,
              [...meetingIds, directorName],
              function(err) {
                if (err) reject(err);
                else resolve({ deletedCount: this.changes });
              }
            );
          }
        });
      }
    });
  },

  // Save programs and meetings (INSERT NEW ONLY - never delete, never update existing)
  savePrograms: (programs, meetings) => {
    return new Promise(async (resolve, reject) => {
      const now = new Date().toISOString();

      try {
        if (USE_POSTGRES) {
          console.log('[SAVE] Starting INSERT operation (adding new items only, preserving existing)...');
          let programsInserted = 0;
          let programsSkipped = 0;
          let meetingsInserted = 0;
          let meetingsSkipped = 0;

          // Insert new programs only (skip existing)
          for (const program of programs) {
            const startDate = typeof program.startDate === 'string'
              ? program.startDate
              : program.startDate.toISOString();
            const endDate = program.endDate
              ? (typeof program.endDate === 'string' ? program.endDate : program.endDate.toISOString())
              : null;

            try {
              await pool.query(
                `INSERT INTO programs (program_id, name, type, start_date, end_date, organizer, status, year, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 ON CONFLICT ON CONSTRAINT programs_unique_idx
                 DO NOTHING`,
                [program.id, program.name, program.type, startDate, endDate,
                 program.organizer, program.status, program.year, now, now]
              );
              programsInserted++;
            } catch (err) {
              if (err.code === '23505') { // Unique violation - already exists
                programsSkipped++;
              } else {
                throw err;
              }
            }
          }

          // Upsert meetings — UPDATE on conflict so user-edited times/durations/etc. persist
          for (const meeting of meetings) {
            const meetingDate = typeof meeting.date === 'string'
              ? meeting.date
              : meeting.date.toISOString();

            try {
              await pool.query(
                `INSERT INTO program_meetings (meeting_id, program_id, program_name, program_type, program_year, program_organizer, type, date, time, duration, participants, description, status, approved, created_at, updated_at, invitation_sent_at, invitation_sent_by, invitation_sent_for_date, invitation_sent_for_time)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
                 ON CONFLICT ON CONSTRAINT program_meetings_unique_idx
                 DO UPDATE SET
                   time = EXCLUDED.time,
                   duration = EXCLUDED.duration,
                   participants = EXCLUDED.participants,
                   description = EXCLUDED.description,
                   status = EXCLUDED.status,
                   approved = EXCLUDED.approved,
                   program_organizer = EXCLUDED.program_organizer,
                   updated_at = EXCLUDED.updated_at`,
                [meeting.id, meeting.programId, meeting.programName, meeting.programType,
                 meeting.programYear, meeting.programOrganizer, meeting.type, meetingDate,
                 meeting.time, meeting.duration, JSON.stringify(meeting.participants),
                 meeting.description, meeting.status, meeting.approved || false, now, now,
                 meeting.invitationSentAt || null, meeting.invitationSentBy || null,
                 meeting.invitationSentForDate || null, meeting.invitationSentForTime || null]
              );
              meetingsInserted++;
            } catch (err) {
              throw err;
            }
          }

          console.log(`[SAVE] Programs: ${programsInserted} inserted, ${programsSkipped} skipped (already exist)`);
          console.log(`[SAVE] Meetings: ${meetingsInserted} inserted, ${meetingsSkipped} skipped (already exist)`);

          resolve({
            programs: programs.length,
            meetings: meetings.length,
            programsInserted,
            programsSkipped,
            meetingsInserted,
            meetingsSkipped
          });
        } else {
          // SQLite — UPSERT, exactly like the Postgres branch above.
          //
          // This used to `DELETE FROM program_meetings` and re-insert the whole
          // payload. That made local dev behave nothing like production (which
          // has only ever upserted), and it turned lethal once the dashboard
          // started sending only the rows it changed: a partial payload would
          // have wiped every other meeting from the dev database.
          db.serialize(() => {
            const programStmt = db.prepare(
              `INSERT INTO programs (program_id, name, type, start_date, end_date, organizer, status, year, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(name, type, year) DO NOTHING`
            );

            programs.forEach(program => {
              const startDate = typeof program.startDate === 'string'
                ? program.startDate
                : program.startDate.toISOString();
              const endDate = program.endDate
                ? (typeof program.endDate === 'string' ? program.endDate : program.endDate.toISOString())
                : null;

              programStmt.run(
                program.id, program.name, program.type, startDate, endDate,
                program.organizer, program.status, program.year, now, now
              );
            });

            programStmt.finalize();

            const meetingStmt = db.prepare(
              `INSERT INTO program_meetings (meeting_id, program_id, program_name, program_type, program_year, program_organizer, type, date, time, duration, participants, description, status, approved, created_at, updated_at, invitation_sent_at, invitation_sent_by, invitation_sent_for_date, invitation_sent_for_time)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(program_name, type, date) DO UPDATE SET
                 time = excluded.time,
                 duration = excluded.duration,
                 participants = excluded.participants,
                 description = excluded.description,
                 status = excluded.status,
                 approved = excluded.approved,
                 program_organizer = excluded.program_organizer,
                 updated_at = excluded.updated_at`
            );

            meetings.forEach(meeting => {
              const meetingDate = typeof meeting.date === 'string'
                ? meeting.date
                : meeting.date.toISOString();

              meetingStmt.run(
                meeting.id, meeting.programId, meeting.programName, meeting.programType,
                meeting.programYear, meeting.programOrganizer, meeting.type, meetingDate,
                meeting.time, meeting.duration, JSON.stringify(meeting.participants),
                meeting.description, meeting.status, meeting.approved ? 1 : 0, now, now,
                meeting.invitationSentAt || null, meeting.invitationSentBy || null,
                meeting.invitationSentForDate || null, meeting.invitationSentForTime || null
              );
            });

            meetingStmt.finalize((err) => {
              if (err) reject(err);
              else resolve({ programs: programs.length, meetings: meetings.length });
            });
          });
        }
      } catch (err) {
        reject(err);
      }
    });
  },

  // Get all programs and meetings
  getPrograms: () => {
    return new Promise(async (resolve, reject) => {
      try {
        if (USE_POSTGRES) {
          const programsResult = await pool.query('SELECT * FROM programs ORDER BY start_date');
          const meetingsResult = await pool.query('SELECT * FROM program_meetings ORDER BY date');

          const programs = programsResult.rows.map(p => ({
            id: p.program_id,
            name: p.name,
            type: p.type,
            startDate: p.start_date,
            endDate: p.end_date,
            organizer: p.organizer,
            status: p.status,
            year: p.year
          }));

          const meetings = meetingsResult.rows.map(m => ({
            id: m.meeting_id,
            programId: m.program_id,
            programName: m.program_name,
            programType: m.program_type,
            programYear: m.program_year,
            programOrganizer: m.program_organizer,
            type: m.type,
            date: m.date,
            time: m.time,
            duration: m.duration,
            participants: typeof m.participants === 'string' ? JSON.parse(m.participants) : m.participants,
            description: m.description,
            status: m.status,
            approved: m.approved,
            invitationSentAt: m.invitation_sent_at,
            invitationSentBy: m.invitation_sent_by,
            invitationSentForDate: m.invitation_sent_for_date,
            invitationSentForTime: m.invitation_sent_for_time
          }));

          resolve({ programs, meetings });
        } else {
          // SQLite
          db.all('SELECT * FROM programs ORDER BY start_date', (err, programRows) => {
            if (err) {
              reject(err);
            } else {
              db.all('SELECT * FROM program_meetings ORDER BY date', (err, meetingRows) => {
                if (err) {
                  reject(err);
                } else {
                  const programs = programRows.map(p => ({
                    id: p.program_id,
                    name: p.name,
                    type: p.type,
                    startDate: p.start_date,
                    endDate: p.end_date,
                    organizer: p.organizer,
                    status: p.status,
                    year: p.year
                  }));

                  const meetings = meetingRows.map(m => ({
                    id: m.meeting_id,
                    programId: m.program_id,
                    programName: m.program_name,
                    programType: m.program_type,
                    programYear: m.program_year,
                    programOrganizer: m.program_organizer,
                    type: m.type,
                    date: m.date,
                    time: m.time,
                    duration: m.duration,
                    participants: JSON.parse(m.participants),
                    description: m.description,
                    status: m.status,
                    approved: m.approved === 1,
                    invitationSentAt: m.invitation_sent_at,
                    invitationSentBy: m.invitation_sent_by,
                    invitationSentForDate: m.invitation_sent_for_date,
                    invitationSentForTime: m.invitation_sent_for_time
                  }));

                  resolve({ programs, meetings });
                }
              });
            }
          });
        }
      } catch (err) {
        reject(err);
      }
    });
  },

  // Delete programs by name (and their meetings) - used for cleaning up placeholder/corrupted entries
  deletePrograms: ({ programNames = [] }) => {
    return new Promise(async (resolve, reject) => {
      try {
        if (programNames.length === 0) {
          return resolve({ deletedPrograms: 0, deletedMeetings: 0 });
        }

        if (USE_POSTGRES) {
          const meetingsResult = await pool.query(
            `DELETE FROM program_meetings WHERE program_name = ANY($1::text[])`,
            [programNames]
          );
          const programsResult = await pool.query(
            `DELETE FROM programs WHERE name = ANY($1::text[])`,
            [programNames]
          );
          resolve({
            deletedPrograms: programsResult.rowCount,
            deletedMeetings: meetingsResult.rowCount
          });
        } else {
          const placeholders = programNames.map(() => '?').join(',');
          db.serialize(() => {
            let meetingsDeleted = 0;
            let programsDeleted = 0;
            db.run(`DELETE FROM program_meetings WHERE program_name IN (${placeholders})`, programNames, function(err) {
              if (err) return reject(err);
              meetingsDeleted = this.changes;
              db.run(`DELETE FROM programs WHERE name IN (${placeholders})`, programNames, function(err) {
                if (err) return reject(err);
                programsDeleted = this.changes;
                resolve({ deletedPrograms: programsDeleted, deletedMeetings: meetingsDeleted });
              });
            });
          });
        }
      } catch (err) {
        reject(err);
      }
    });
  }
};

module.exports = { db, pool, dbHelpers };
