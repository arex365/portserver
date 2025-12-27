const { MongoClient } = require('mongodb');
const path = require('path');
const fs = require('fs');

// Resolve config.json relative to this file (works inside pkg exe)
const configPath = path.join(__dirname, '..', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

let db = null;
let client = null;

const connectDB = async () => {
  if (client) return db;

  try {
    client = new MongoClient(config.uri);
    await client.connect();
    db = client.db('TradeServer');
    console.log('Connected to MongoDB');
    return db;
  } catch (err) {
    console.error('Error connecting to MongoDB:', err.message);
    throw err;
  }
};

const getDB = () => {
  if (!db) {
    throw new Error('Database not connected. Call connectDB first.');
  }
  return db;
};

const getCollection = (collectionName) => {
  return getDB().collection(collectionName);
};

module.exports = {
  connectDB,
  getDB,
  getCollection
};
