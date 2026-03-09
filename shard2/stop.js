const axios = require('axios');

// Configuration
const TABLE_NAMES = [
  {
    "tableName": "TopRev"
  }  
]; // List of tables to watch
const SERVER_URL = 'http://f1.itsarex.com:5007'; // Local server URL
const FEE_RATE = 0.0002; // Fee rate to match app.js

// Flag to prevent multiple simultaneous operations
let isRunning = false;

async function getPrice(coinName) {
  try {
    const resp = await axios.get(`${SERVER_URL}/getprice-binance`, {
      params: { coinname: coinName },
      timeout: 8000,
    });
    if (resp && resp.data && typeof resp.data.price === 'number') {
      return resp.data.price;
    }
  } catch (e) {
    console.warn(`[Watcher] Binance price fetch failed for ${coinName}:`, e.message);
    // Fallback to OKX endpoint
    try {
      const fallbackResp = await axios.get(`${SERVER_URL}/getprice`, {
        params: { coinname: coinName },
        timeout: 8000,
      });
      if (fallbackResp && fallbackResp.data && typeof fallbackResp.data.price === 'number') {
        return fallbackResp.data.price;
      }
    } catch (fallbackErr) {
      console.warn(`[Watcher] Fallback price fetch also failed for ${coinName}:`, fallbackErr.message);
    }
  }
  return null;
}

async function calculateUnrealizedProfit(trade) {
  const price = await getPrice(trade.coinName);
  
  if (typeof price !== 'number' || !trade.entryPrice || !trade.positionSize) {
    return null;
  }

  const quantity = trade.positionSize / trade.entryPrice;
  let gross = 0;
  
  if ((trade.positionSide || '').toLowerCase() === 'long') {
    gross = (price - trade.entryPrice) * quantity;
  } else {
    gross = (trade.entryPrice - price) * quantity;
  }
  
  const feeEntry = trade.positionSize * FEE_RATE;
  const net = gross - feeEntry;
  
  return Number(net.toFixed(2));
}

async function watchTrades() {
  if (isRunning) {
    console.log('[Watcher] Already running, skipping this cycle');
    return;
  }

  isRunning = true;

  try {
    for (const tableConfig of TABLE_NAMES) {
      const { tableName } = tableConfig;
      
      // Fetch all open trades from the local server
      const response = await axios.get(`${SERVER_URL}/gettrades`, {
        params: {
          tableName: tableName,
          status: 'open'
        },
        timeout: 10000,
      });

      const openTrades = response.data.trades || [];

      console.log(`[Watcher] Checking ${openTrades.length} open trades in table "${tableName}"`);

      if (openTrades.length === 0) {
        console.log(`[Watcher] No open trades found in "${tableName}"`);
        continue;
      }

      // Close each trade
      for (const trade of openTrades) {
        try {
          // Make HTTP request to close the position
          const url = `/manage/${encodeURIComponent(trade.coinName)}?tableName=${encodeURIComponent(tableName)}`;
          const payload = { Action: 'CloseById', id: trade._id };

          const closeResponse = await axios.post(`${SERVER_URL}${url}`, payload, {
            timeout: 10000,
          });

          console.log(`[Watcher] Successfully closed ${trade.coinName} in "${tableName}":`, closeResponse.data);
        } catch (error) {
          console.error(
            `[Watcher] Error closing ${trade.coinName} in "${tableName}":`,
            error.response?.data || error.message
          );
        }
      }
    }
  } catch (error) {
    console.error('[Watcher] Error in watch cycle:', error.message);
  } finally {
    isRunning = false;
  }
}

// Start the watcher
function startWatcher() {
  console.log(`[Watcher] Started. Closing all open trades...`);
  console.log(`[Watcher] Tables:`);
  TABLE_NAMES.forEach(t => console.log(`  - ${t.tableName}`));

  // Run immediately on start
  watchTrades();
}

startWatcher()


