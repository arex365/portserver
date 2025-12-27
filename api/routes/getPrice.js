const router = require('express').Router();
const axios = require('axios');

// Fetch price from Binance
async function fetchPrice(sym) {
  const symbol = sym.toUpperCase() + 'USDT';
  try {
    const url = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`;
    const resp = await axios.get(url, { timeout: 5000 });
    if (resp && resp.data && typeof resp.data.price !== 'undefined') {
      return Number(resp.data.price);
    }
    throw new Error('Invalid response from Binance REST API');
  } catch (err) {
    console.error(`Failed to fetch price for ${symbol}:`, err.message || err);
    throw err;
  }
}

// Endpoint: /getprice
router.get('/getprice', async (req, res) => {
  const coin = req.query.coinname || req.query.coinName;
  if (!coin) return res.status(400).json({ error: 'coinname required' });

  try {
    const price = await fetchPrice(coin);
    return res.json({ price });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// Optional: keep a separate Binance endpoint for consistency
router.get('/getprice-binance', async (req, res) => {
  const coin = req.query.coinname || req.query.coinName;
  if (!coin) return res.status(400).json({ error: 'coinname required' });

  try {
    const price = await fetchPrice(coin);
    return res.json({ price });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
});

module.exports = router;
