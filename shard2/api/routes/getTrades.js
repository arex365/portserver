const router = require('express').Router();
const { getCollection } = require('../utils/database');

// GET /tables - returns all collections in the MongoDB database
router.get('/tables', async (req, res) => {
  try {
    const db = require('../utils/database').getDB();
    const collections = await db.listCollections().toArray();
    const tables = collections.map(c => c.name).filter(name => !name.startsWith('system.'));
    res.json({ tables });
  } catch (err) {
    console.error('Error fetching collections:', err);
    return res.status(500).json({ error: 'Error fetching collections' });
  }
});

// GET /gettrades?tableName&coinName&status
// Also accepts /gettrade as an alias. If no query params are provided, returns the whole table.
async function handleGetTrades(req, res) {
  try {
    // Accept either `coinName` or `coinname` from query
    let collectionName = req.query.tableName || 'positions';
    let coinName = req.query.coinName || req.query.coinname;
    let status = req.query.status || 'all';

    // Normalize status values: allow 'closed' -> 'close'
    if (typeof status === 'string') {
      status = status.toLowerCase();
      if (status === 'closed') status = 'close';
    }

    // Build query filter
    let filter = {};

    if (coinName) {
      filter.coinName = { $regex: `^${coinName}$`, $options: 'i' };
    }

    if (status && status !== 'all') {
      filter.status = status;
    }

    const collection = getCollection(collectionName);
    const trades = await collection.find(filter).sort({ entryTime: -1 }).toArray();

    res.json({
      message: 'Trades retrieved successfully',
      count: trades.length,
      trades
    });
  } catch (err) {
    console.error('Error fetching trades:', err);
    return res.status(500).json({ error: 'Error fetching trades' });
  }
}

router.get('/gettrades', handleGetTrades);
router.get('/gettrade', handleGetTrades);
router.get('/gettrade', handleGetTrades);

module.exports = router;
