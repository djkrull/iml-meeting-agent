const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./server/reviews.db');

db.all("SELECT name FROM sqlite_master WHERE type='table';", (err, tables) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('\n📋 ALL TABLES IN DATABASE:\n');
    tables.forEach(t => {
      console.log(`  • ${t.name}`);
    });

    // Get schema for each table
    console.log('\n\n📊 DETAILED SCHEMA:\n');

    let completed = 0;
    tables.forEach(table => {
      db.all(`PRAGMA table_info(${table.name})`, (err, cols) => {
        if (!err) {
          console.log(`\n${table.name}:`);
          cols.forEach(col => {
            console.log(`  - ${col.name}: ${col.type}`);
          });
        }
        completed++;
        if (completed === tables.length) {
          db.close();
        }
      });
    });
  }
});
