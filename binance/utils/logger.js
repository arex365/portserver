const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, '../logs/manageOrder.log');

// Ensure logs folder exists
if (!fs.existsSync(path.dirname(logPath))) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
}

function logToFile(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
}

module.exports = { logToFile };
