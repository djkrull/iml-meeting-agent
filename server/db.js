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
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  console.log('Using PostgreSQL database');
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
            `INSERT INTO meetings (review_id, meeting_id, type, program_name, program_type, program_year, date, time, duration, participants, description, status, requires_directors)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
            [
              reviewId,
              meeting.id,
              meeting.type,
              meeting.programName,
              meeting.programType,
              meeting.programYear || null,
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
          `INSERT INTO meetings (review_id, meeting_id, type, program_name, program_type, program_year, date, time, duration, participants, description, status, requires_directors)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            reviewId,
            meeting.id,
            meeting.type,
            meeting.programName,
            meeting.programType,
            meeting.programYear || null,
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

          const meetingsResult = await pool.query('SELECT * FROM meetings WHERE review_id = $1', [reviewId]);

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
            db.all('SELECT * FROM meetings WHERE review_id = ?', [reviewId], (err, meetings) => {
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
  }
};

module.exports = { db, pool, dbHelpers };
