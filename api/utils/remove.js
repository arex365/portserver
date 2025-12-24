const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Path to mockServer.db (same folder as this script or adjust if needed)
const dbPath = path.join(__dirname, 'mockServer.db');

// Connect to DB
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    return console.error('Error opening database:', err.message);
  }
  console.log('Connected to SQLite database at:', dbPath);

  const deleteQuery = `DELETE FROM bunny WHERE id < 78`;

  db.run(deleteQuery, function (err) {
    if (err) {
      console.error('Error deleting rows:', err.message);
    } else {
      console.log(`Deleted ${this.changes} row(s) from 'bunny' table.`);
    }

    // Close DB connection
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('Database connection closed.');
      }
    });
  });
});
