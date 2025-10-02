const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path
const DB_PATH = path.join(__dirname, 'reviews.db');

// Initialize database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

// Create tables
function initializeDatabase() {
  db.serialize(() => {
    // Reviews table
    db.run(`
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        status TEXT DEFAULT 'active'
      )
    `);

    // Meetings table
    db.run(`
      CREATE TABLE IF NOT EXISTS meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_id TEXT NOT NULL,
        meeting_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        program_name TEXT NOT NULL,
        program_type TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        duration INTEGER NOT NULL,
        participants TEXT NOT NULL,
        description TEXT,
        requires_directors INTEGER DEFAULT 1,
        FOREIGN KEY (review_id) REFERENCES reviews(id)
      )
    `);

    // Approvals table
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

    console.log('Database tables initialized');
  });
}

// Helper functions
const dbHelpers = {
  // Create new review
  createReview: (reviewId, createdBy) => {
    return new Promise((resolve, reject) => {
      const createdAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

      db.run(
        'INSERT INTO reviews (id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?)',
        [reviewId, createdBy, createdAt, expiresAt],
        function(err) {
          if (err) reject(err);
          else resolve({ id: reviewId, createdAt, expiresAt });
        }
      );
    });
  },

  // Add meeting to review
  addMeeting: (reviewId, meeting) => {
    return new Promise((resolve, reject) => {
      // Handle date - could be Date object or ISO string
      const dateStr = typeof meeting.date === 'string'
        ? meeting.date
        : meeting.date.toISOString();

      db.run(
        `INSERT INTO meetings (review_id, meeting_id, type, program_name, program_type, date, time, duration, participants, description, requires_directors)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reviewId,
          meeting.id,
          meeting.type,
          meeting.programName,
          meeting.programType,
          dateStr,
          meeting.time,
          meeting.duration,
          JSON.stringify(meeting.participants),
          meeting.description,
          meeting.requiresDirectors || 1
        ],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  },

  // Get review with meetings
  getReview: (reviewId) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM reviews WHERE id = ?', [reviewId], (err, review) => {
        if (err) {
          reject(err);
        } else if (!review) {
          reject(new Error('Review not found'));
        } else {
          // Get meetings
          db.all('SELECT * FROM meetings WHERE review_id = ?', [reviewId], (err, meetings) => {
            if (err) {
              reject(err);
            } else {
              // Get approvals for each meeting
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
    });
  },

  // Add or update approval
  addApproval: (meetingId, directorName, status, comment, suggestedDate, suggestedTime) => {
    return new Promise((resolve, reject) => {
      const timestamp = new Date().toISOString();

      // Check if approval already exists
      db.get(
        'SELECT id FROM approvals WHERE meeting_id = ? AND director_name = ?',
        [meetingId, directorName],
        (err, existing) => {
          if (err) {
            reject(err);
          } else if (existing) {
            // Update existing
            db.run(
              `UPDATE approvals SET status = ?, comment = ?, suggested_date = ?, suggested_time = ?, timestamp = ?
               WHERE id = ?`,
              [status, comment, suggestedDate, suggestedTime, timestamp, existing.id],
              function(err) {
                if (err) reject(err);
                else resolve({ id: existing.id, updated: true });
              }
            );
          } else {
            // Insert new
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
    });
  },

  // Update meeting description
  updateMeetingDescription: (meetingId, description) => {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE meetings SET description = ? WHERE id = ?',
        [description, meetingId],
        function(err) {
          if (err) reject(err);
          else resolve({ id: meetingId, changes: this.changes });
        }
      );
    });
  }
};

module.exports = { db, dbHelpers };
