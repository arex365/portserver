const router = require('express').Router();
const ccxt = require('ccxt');
const axios = require('axios');

// Initialize Binance for price fetching (futures)
const exchange = new ccxt.binance({ enableRateLimit: true, options: { defaultType: 'future' } });

async function fetchPrice(sym) {
  const symbol = sym.toUpperCase();
  try {
    const ticker = await exchange.fetchTicker(`${symbol}/USDT`);
    if (ticker && typeof ticker.last !== 'undefined') return Number(ticker.last);
  } catch (err) {
    console.warn('ccxt fetchTicker failed for Binance in getPrice, falling back to Binance REST API:', err.message || err);
  }

  try {
    const symbol_formatted = `${symbol}USDT`;
    const url = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol_formatted}`;
    const resp = await axios.get(url, { timeout: 5000 });
    if (resp && resp.data && typeof resp.data.price !== 'undefined') {
      return Number(resp.data.price);
    }
    throw new Error('Invalid response from Binance REST API');
  } catch (err) {
    console.error('Failed to fetch price from Binance REST API:', err.message || err);
    throw err;
  }
}

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

// Add Binance price endpoint for consistency with position management
router.get('/getprice-binance', async (req, res) => {
  const coin = req.query.coinname || req.query.coinName;
  if (!coin) return res.status(400).json({ error: 'coinname required' });
  
  try {
    const sym = coin.toUpperCase();
    const symbol_formatted = `${sym}USDT`;
    const url = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol_formatted}`;
    const resp = await axios.get(url, { timeout: 5000 });
    
    if (resp && resp.data && typeof resp.data.price !== 'undefined') {
      const price = Number(resp.data.price);
      return res.json({ price });
    }
    throw new Error('Invalid response from Binance REST API');
  } catch (err) {
    console.error('Failed to fetch price from Binance REST API:', err.message || err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

module.exports = router;
