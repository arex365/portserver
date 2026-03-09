// routes/coinStates.js
const router = require('express').Router();
const redis = require('../utils/redisClient');

router.get('/coinstate/:coinname', async (req, res) => {
  try {
    let { coinname } = req.params;

    if (!coinname) {
      return res.status(400).json({ error: "Missing coin name" });
    }

    // Normalize same way as manageOrder (optional)
    coinname = coinname.trim();

    const key = `coinState:${coinname}`;
    const json = await redis.get(key);

    if (!json) {
      return res.status(404).json({
        error: "Coin state not found",
        coin: coinname
      });
    }

    res.json({
      coin: coinname,
      state: JSON.parse(json)
    });

  } catch (error) {
    console.error("Error reading coin state:", error);
    res.status(500).json({ error: "Failed to load coin state" });
  }
});

module.exports = router;
