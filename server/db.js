const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');

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
        FOREIGN KEY (meeting_id) REFERENCES meetings(id)
      )
    `);

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
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    console.log('SQLite tables initialized');
  });
}

// Helper functions
const dbHelpers = {
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
  addApproval: (meetingId, directorName, status, comment, suggestedDate, suggestedTime) => {
    return new Promise(async (resolve, reject) => {
      const timestamp = new Date().toISOString();

      if (USE_POSTGRES) {
        try {
          const existing = await pool.query(
            'SELECT id FROM approvals WHERE meeting_id = $1 AND director_name = $2',
            [meetingId, directorName]
          );

          if (existing.rows.length > 0) {
            await pool.query(
              `UPDATE approvals SET status = $1, comment = $2, suggested_date = $3, suggested_time = $4, timestamp = $5 WHERE id = $6`,
              [status, comment, suggestedDate, suggestedTime, timestamp, existing.rows[0].id]
            );
            resolve({ id: existing.rows[0].id, updated: true });
          } else {
            const result = await pool.query(
              `INSERT INTO approvals (meeting_id, director_name, status, comment, suggested_date, suggested_time, timestamp)
               VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
              [meetingId, directorName, status, comment, suggestedDate, suggestedTime, timestamp]
            );
            resolve({ id: result.rows[0].id, updated: false });
          }
        } catch (err) {
          reject(err);
        }
      } else {
        db.get(
          'SELECT id FROM approvals WHERE meeting_id = ? AND director_name = ?',
          [meetingId, directorName],
          (err, existing) => {
            if (err) {
              reject(err);
            } else if (existing) {
              db.run(
                `UPDATE approvals SET status = ?, comment = ?, suggested_date = ?, suggested_time = ?, timestamp = ? WHERE id = ?`,
                [status, comment, suggestedDate, suggestedTime, timestamp, existing.id],
                function(err) {
                  if (err) reject(err);
                  else resolve({ id: existing.id, updated: true });
                }
              );
            } else {
              db.run(
                `INSERT INTO approvals (meeting_id, director_name, status, comment, suggested_date, suggested_time, timestamp)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [meetingId, directorName, status, comment, suggestedDate, suggestedTime, timestamp],
                function(err) {
                  if (err) reject(err);
                  else resolve({ id: this.lastID, updated: false });
                }
              );
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
          const result = await pool.query(query, values);
          resolve({ changes: result.rowCount, matched: programName, type: meetingType });
        } catch (err) {
          reject(err);
        }
      } else {
        db.run(query, values, function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes, matched: programName, type: meetingType });
        });
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

  // Save programs and meetings
  savePrograms: (programs, meetings) => {
    return new Promise(async (resolve, reject) => {
      const now = new Date().toISOString();

      try {
        if (USE_POSTGRES) {
          // Delete existing data first
          await pool.query('DELETE FROM program_meetings');
          await pool.query('DELETE FROM programs');

          // Insert programs
          for (const program of programs) {
            const startDate = typeof program.startDate === 'string'
              ? program.startDate
              : program.startDate.toISOString();
            const endDate = program.endDate
              ? (typeof program.endDate === 'string' ? program.endDate : program.endDate.toISOString())
              : null;

            await pool.query(
              `INSERT INTO programs (program_id, name, type, start_date, end_date, organizer, status, year, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [program.id, program.name, program.type, startDate, endDate,
               program.organizer, program.status, program.year, now, now]
            );
          }

          // Insert meetings
          for (const meeting of meetings) {
            const meetingDate = typeof meeting.date === 'string'
              ? meeting.date
              : meeting.date.toISOString();

            await pool.query(
              `INSERT INTO program_meetings (meeting_id, program_id, program_name, program_type, program_year, program_organizer, type, date, time, duration, participants, description, status, approved, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
              [meeting.id, meeting.programId, meeting.programName, meeting.programType,
               meeting.programYear, meeting.programOrganizer, meeting.type, meetingDate,
               meeting.time, meeting.duration, JSON.stringify(meeting.participants),
               meeting.description, meeting.status, meeting.approved || false, now, now]
            );
          }

          resolve({ programs: programs.length, meetings: meetings.length });
        } else {
          // SQLite
          db.serialize(() => {
            db.run('DELETE FROM program_meetings');
            db.run('DELETE FROM programs', (err) => {
              if (err) return reject(err);

              // Insert programs
              const programStmt = db.prepare(
                `INSERT INTO programs (program_id, name, type, start_date, end_date, organizer, status, year, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

              // Insert meetings
              const meetingStmt = db.prepare(
                `INSERT INTO program_meetings (meeting_id, program_id, program_name, program_type, program_year, program_organizer, type, date, time, duration, participants, description, status, approved, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              );

              meetings.forEach(meeting => {
                const meetingDate = typeof meeting.date === 'string'
                  ? meeting.date
                  : meeting.date.toISOString();

                meetingStmt.run(
                  meeting.id, meeting.programId, meeting.programName, meeting.programType,
                  meeting.programYear, meeting.programOrganizer, meeting.type, meetingDate,
                  meeting.time, meeting.duration, JSON.stringify(meeting.participants),
                  meeting.description, meeting.status, meeting.approved ? 1 : 0, now, now
                );
              });

              meetingStmt.finalize((err) => {
                if (err) reject(err);
                else resolve({ programs: programs.length, meetings: meetings.length });
              });
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
            approved: m.approved
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
                    approved: m.approved === 1
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
  }
};

module.exports = { db, pool, dbHelpers };
