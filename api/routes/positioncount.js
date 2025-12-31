const router = require('express').Router();
const { getCollection } = require('../utils/database');
router.get("/version",(req,res)=>res.send("Version 1.0"))
// GET /getPositionCount/:coinName/:tableName?side=Long|Short
// Returns the total count of positions for a specific coin with status 'open'
// Optional: ?side=Long or ?side=Short to filter by position side
router.get('/getPositionCount/:coinName/:tableName', async (req, res) => {
  try {
    const { coinName, tableName } = req.params;
    const { side } = req.query;

    // Validate side parameter if provided
    if (side && !['Long', 'Short'].includes(side)) {
      return res.status(400).json({ error: 'Invalid side. Must be "Long" or "Short"' });
    }

    // Build query filter
    let filter = {
      coinName: { $regex: `^${coinName}$`, $options: 'i' },
      status: 'open'
    };

    if (side) {
      filter.positionSide = side;
    }

    const collection = getCollection(tableName);
    const count = await collection.countDocuments(filter);

    res.json({
      message: 'Position count retrieved successfully',
      coinName,
      tableName,
      status: 'open',
      side: side || 'all',
      count
    });
  } catch (err) {
    console.error('Error fetching position count:', err);
    return res.status(500).json({ error: 'Error fetching position count' });
  }
});

module.exports = router;
